param(
  [string]$Base = "master",
  [string]$Upstream = "origin/master",
  [string]$OutputDir = "D:\Development\project\cache-temp"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $OutputDir "qmai-upstream-sync-$timestamp.md"

$changed = git diff --name-status --diff-filter=ACMRD $Base $Upstream -- src package.json package-lock.json vite.config.ts index.html
$safe = New-Object System.Collections.Generic.List[string]
$manual = New-Object System.Collections.Generic.List[string]
$risk = New-Object System.Collections.Generic.List[string]

$riskPatterns = @(
  "src/commands/fs.ts",
  "src/commands/file-sync.ts",
  "src/lib/web-fs.ts",
  "src/lib/http-adapter.ts",
  "src/lib/server-events.ts",
  "src/lib/clip-watcher.ts",
  "scripts/web-dev.mjs",
  "scripts/web-server.mjs",
  "src-tauri/"
)

foreach ($line in $changed) {
  if (-not $line.Trim()) { continue }
  $parts = $line -split "`t"
  $status = $parts[0]
  $path = $parts[-1]
  $item = "$status`t$path"

  $isRisk = $false
  foreach ($pattern in $riskPatterns) {
    if ($path.StartsWith($pattern) -or $path -eq $pattern) {
      $isRisk = $true
      break
    }
  }

  if ($isRisk) {
    $risk.Add($item)
    continue
  }

  git diff --quiet $Base HEAD -- $path
  if ($LASTEXITCODE -eq 0) {
    $safe.Add($item)
  } else {
    $manual.Add($item)
  }
}

$lines = @(
  "# QMAI upstream sync report",
  "",
  "- Base: ``$Base``",
  "- Upstream: ``$Upstream``",
  "- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "",
  "## safe-to-port",
  "",
  "Changed upstream, unchanged on current web branch.",
  ""
)
$lines += if ($safe.Count) { $safe } else { "(none)" }
$lines += @("", "## manual-review", "", "Changed upstream and changed on current web branch.", "")
$lines += if ($manual.Count) { $manual } else { "(none)" }
$lines += @("", "## web-adapter-risk", "", "Likely touches browser/web runtime adapters. Do not copy blindly.", "")
$lines += if ($risk.Count) { $risk } else { "(none)" }

Set-Content -Encoding UTF8 -Path $reportPath -Value $lines
Write-Output $reportPath
