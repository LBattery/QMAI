export const ANALYSIS_SKILL_ORDER = ["characters", "story", "style"] as const

export type AnalysisSkill = (typeof ANALYSIS_SKILL_ORDER)[number]

export type AnalysisTaskStatus =
  | "awaiting-range"
  | "queued"
  | "running"
  | "paused"
  | "failed"
  | "cancelled"
  | "completed"

export type AnalysisChunkStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled"

export type AnalysisSkillStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"

export interface AnalysisChapterRange {
  startOrder: number
  endOrder: number
}

export interface AnalysisChunkPlan {
  id: string
  chapterIds: string[]
  startOrder: number
  endOrder: number
  wordCount: number
}

export interface AnalysisChunkRecord extends AnalysisChunkPlan {
  version: 1
  taskId: string
  skill: AnalysisSkill
  status: AnalysisChunkStatus
  attempts: number
  resultPath: string | null
  error: string | null
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
}

export interface AnalysisModuleState {
  skill: AnalysisSkill
  status: AnalysisSkillStatus
  range: AnalysisChapterRange
  chunkIds: string[]
  completedChunkIds: string[]
  failedChunkId: string | null
  resultPath: string | null
  summary?: string
  analysisVersion: number
  updatedAt: number
}

export interface BookAnalysisPipelineTask {
  version: 1
  id: string
  batchId: string | null
  projectPath: string
  bookId: string
  bookPath: string
  selectedSkills: AnalysisSkill[]
  range: AnalysisChapterRange | null
  status: AnalysisTaskStatus
  currentSkill: AnalysisSkill | null
  modules: Record<AnalysisSkill, AnalysisModuleState>
  error: string | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
}

export interface AnalysisPipelineBatch {
  version: 1
  id: string
  projectPath: string
  taskIds: string[]
  createdAt: number
  updatedAt: number
  dismissedAt: number | null
}

export interface AnalysisEvidenceSnippet {
  version: 1
  id: string
  bookId: string
  skill: AnalysisSkill
  taskId: string
  chapterId: string
  chapterOrder: number
  text: string
  tags: string[]
  reason: string
  purpose: string
  enabled: boolean
  userPinned: boolean
  createdAt: number
  updatedAt: number
}

export interface AnalysisEvidenceCollection {
  version: 1
  bookId: string
  snippets: AnalysisEvidenceSnippet[]
  updatedAt: number
}

export interface BookAnalysisModuleManifest {
  version: 1
  bookId: string
  modules: Partial<Record<AnalysisSkill, AnalysisModuleState>>
  updatedAt: number
}

export function normalizeSelectedSkills(skills: AnalysisSkill[]): AnalysisSkill[] {
  const selected = new Set(skills)
  return ANALYSIS_SKILL_ORDER.filter((skill) => selected.has(skill))
}
