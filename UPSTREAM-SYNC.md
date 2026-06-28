# Upstream sync workflow for web0627

`web0627` is not a normal merge branch of `origin/master`. It keeps browser
filesystem, HTTP server, and clip adapters that upstream desktop `master` may
remove. Do not use `git merge --allow-unrelated-histories` for routine syncs.

Recommended flow:

1. Fetch upstream:
   `git fetch origin master`
2. Generate a migration report:
   `powershell -ExecutionPolicy Bypass -File scripts/upstream-sync-report.ps1`
3. Port files from the report in this order:
   - `safe-to-port`: files changed by upstream but not changed by web0627.
   - `manual-review`: files changed by both upstream and web0627.
   - `web-adapter-risk`: files touching browser/web server adapters. Port only
     the feature logic, never remove the web fallback.
4. Run typecheck/tests before committing.

Important guardrails:

- Preserve `src/lib/web-fs.ts`, `src/lib/http-adapter.ts`,
  `src/lib/server-events.ts`, `scripts/web-dev.mjs`, and
  `scripts/web-server.mjs` unless the web runtime is replaced deliberately.
- Do not copy `src-tauri` changes unless the corresponding browser fallback is
  also updated.
- When upstream release notes mention a feature, verify the actual code exists
  before copying the changelog.
