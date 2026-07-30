import type { LlmConfig } from "@/stores/wiki-store"
import type {
  AnalysisChunkRecord,
  AnalysisEvidenceSnippet,
  AnalysisSkill,
  BookAnalysisPipelineTask,
} from "./analysis-pipeline-types"

export interface AnalysisSkillContext {
  task: BookAnalysisPipelineTask
  skill: AnalysisSkill
  bookPath: string
  projectPath: string
  llmConfig: LlmConfig
}

export interface AnalysisSkillAdapter<TChunk = unknown, TResult = unknown> {
  skill: AnalysisSkill
  runChunk(input: AnalysisSkillContext & {
    chunk: AnalysisChunkRecord
    signal: AbortSignal
  }): Promise<{
    result: TChunk
    evidence: AnalysisEvidenceSnippet[]
  }>
  aggregate(input: AnalysisSkillContext & {
    chunks: TChunk[]
    signal: AbortSignal
  }): Promise<TResult>
  publish(input: AnalysisSkillContext & {
    result: TResult
    evidence: AnalysisEvidenceSnippet[]
    signal: AbortSignal
  }): Promise<string>
}

export interface AnalysisChunkOutput<T = unknown> {
  result: T
  evidence: AnalysisEvidenceSnippet[]
}
