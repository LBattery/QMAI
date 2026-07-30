import routeManifestJson from "../../../skills/SkillHub/ROUTE_MANIFEST.json"

export type OutlineLengthType = "long" | "short"
export type OutlineAudience = "male" | "female"

export interface OutlineRouteManifestRoute {
  id: string
  lengthTypes: OutlineLengthType[]
  audiences: OutlineAudience[]
  labels: string[]
  primarySkill: string
  skills: string[]
  defaultOutputs: string[]
}

export interface OutlineRouteManifest {
  version: number
  scope: "ai-outline"
  protocols: Record<string, string>
  defaultFolders: string[]
  fileTypeFolders: Record<string, string>
  routes: OutlineRouteManifestRoute[]
  plannedCoverage: {
    male: string[]
    female: string[]
    short: string[]
  }
  bodyGeneration: {
    enabledInAiOutline: boolean
    note: string
  }
}

const manifest = routeManifestJson as OutlineRouteManifest

const FOLDER_DEFAULT_SKILLS: Record<string, string[]> = {
  DagangSkill: ["outline-master-builder", "story-plot-seed", "outline-final-assembler"],
  ZhanggangSkill: ["chapter-outline-builder", "chapter-outline-assembler"],
}

function normalizeMatchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "")
}

function skillPathToSkillNames(path: string): string[] {
  const normalized = path.replace(/\\/g, "/").replace(/^SkillHub\//, "")
  if (FOLDER_DEFAULT_SKILLS[normalized]) return FOLDER_DEFAULT_SKILLS[normalized]
  const parts = normalized.split("/").filter(Boolean)
  const last = parts[parts.length - 1]
  return last ? [last] : []
}

function isOutlineRouteMatch(
  route: OutlineRouteManifestRoute,
  input: {
    lengthType: OutlineLengthType
    audience: OutlineAudience
    genre: string
  },
): boolean {
  if (!route.lengthTypes.includes(input.lengthType)) return false
  if (!route.audiences.includes(input.audience)) return false

  const genreText = normalizeMatchText(input.genre)
  const routeText = normalizeMatchText([
    route.id,
    route.primarySkill,
    ...route.labels,
  ].join(" "))
  return Boolean(genreText) && (routeText.includes(genreText) || route.labels.some((label) => {
    const normalizedLabel = normalizeMatchText(label)
    return normalizedLabel.includes(genreText) || genreText.includes(normalizedLabel)
  }))
}

export function getOutlineRouteManifest(): OutlineRouteManifest {
  return manifest
}

export function findOutlineManifestRoute(input: {
  lengthType: OutlineLengthType
  audience: OutlineAudience
  genre: string
}): OutlineRouteManifestRoute | null {
  return manifest.routes.find((route) => isOutlineRouteMatch(route, input)) ?? null
}

export function resolveOutlineManifestSkillNames(input: {
  lengthType: OutlineLengthType
  audience: OutlineAudience
  genre: string
}): string[] {
  const route = findOutlineManifestRoute(input)
  if (!route) return ["outline-master-builder", "chapter-outline-builder", "outline-quality-check"]

  const skillNames = [
    ...skillPathToSkillNames(route.primarySkill),
    ...route.skills.flatMap(skillPathToSkillNames),
    "outline-quality-check",
  ]
  return Array.from(new Set(skillNames.filter((name) => !name.includes("drafting"))))
}
