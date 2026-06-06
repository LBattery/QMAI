import type { LlmConfig } from "@/stores/wiki-store"
import { streamChat, type ChatMessage, type RequestOverrides, type StreamCallbacks } from "@/lib/llm-client"
import { resolveUserVisibleReasoning } from "@/lib/user-visible-reasoning"
import { useWikiStore } from "@/stores/wiki-store"
import { buildContextPack, contextPackToPrompt, type ContextPack } from "./context-engine"
import { resolveNovelModel } from "./model-resolver"
import { reviewChapter, type NovelReviewResult } from "./review-adapter"
import type { TaskRouteResult } from "./task-router"
import type { GoldenThreeChapterRequest } from "./golden-three-chapters"
import {
  DEEP_CHAPTER_HARD_MAX_CHARS,
  DEEP_CHAPTER_LENGTH_OPTIMIZATION_MAX_ATTEMPTS,
  DEEP_CHAPTER_MAX_OUTPUT_TOKENS,
  DEEP_CHAPTER_MIN_CHARS,
  DEEP_CHAPTER_OPTIMIZED_MAX_CHARS,
  DEEP_CHAPTER_OPTIMIZED_MIN_CHARS,
  DEEP_CHAPTER_REWRITE_MAX_CHARS,
  buildDeepChapterBriefPrompt,
  buildDeepChapterDraftPrompt,
  buildDeepChapterExpansionPrompt,
  buildDeepChapterFinalPolishPrompt,
  buildDeepChapterLengthRewritePrompt,
  buildDeepChapterRevisionPrompt,
} from "./deep-chapter-prompts"

export interface DeepChapterGenerationInput {
  projectPath: string
  userRequest: string
  chapterNumber?: number
  goldenThreeChapter?: GoldenThreeChapterRequest
  dismantlingReferenceDirective?: string
  llmConfig: LlmConfig
}

export interface DeepChapterGenerationCallbacks {
  onThinking?: (content: string) => void
  onFinalContent?: (content: string) => void
}

export interface DeepChapterGenerationResult {
  finalContent: string
  taskBrief: string
  draftContent: string
  reviewResults: NovelReviewResult[]
  revised: boolean
}

export interface DeepChapterGenerationDeps {
  buildContextPack: typeof buildContextPack
  contextPackToPrompt: typeof contextPackToPrompt
  reviewChapter: typeof reviewChapter
  streamChat: (
    config: LlmConfig,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
    requestOverrides?: RequestOverrides,
  ) => Promise<void>
}

const defaultDeps: DeepChapterGenerationDeps = {
  buildContextPack,
  contextPackToPrompt,
  reviewChapter,
  streamChat,
}

const REPEAT_CHECK_MIN_CHARS = 600
const REPEAT_WINDOW_CHARS = 120
const REPEAT_HIT_LIMIT = 3
const USER_ABORT_MESSAGE = "已停止生成"
const CHAPTER_LENGTH_LIMIT_MESSAGE =
  `已达到本章字数上限。本次章节最多生成 ${DEEP_CHAPTER_HARD_MAX_CHARS} 字，达到上限后会自动暂停输出。建议按章节逐章生成，避免一次生成过多内容导致中断。`

export function shouldUseDeepChapterGeneration(_route: TaskRouteResult | null, enabled: boolean): boolean {
  return enabled
}

export async function runDeepChapterGeneration(
  input: DeepChapterGenerationInput,
  callbacks: DeepChapterGenerationCallbacks = {},
  deps: DeepChapterGenerationDeps = defaultDeps,
  signal?: AbortSignal,
): Promise<DeepChapterGenerationResult> {
  assertNotAborted(signal)
  const writingConfig = resolveWritingConfig(input.llmConfig)
  const contextPack = await deps.buildContextPack(input.projectPath, input.userRequest, input.chapterNumber)
  assertNotAborted(signal)
  const contextPrompt = [
    deps.contextPackToPrompt(contextPack),
    input.dismantlingReferenceDirective,
  ].filter(Boolean).join("\n\n")

  callbacks.onThinking?.(formatContextThinking(input, contextPack))
  assertNotAborted(signal)

  const taskBrief = await collectModelText(
    writingConfig,
    [{
      role: "user",
      content: buildDeepChapterBriefPrompt(
        contextPrompt,
        input.userRequest,
        input.chapterNumber,
        input.goldenThreeChapter,
      ),
    }],
    deps,
    signal,
    (partial) => callbacks.onThinking?.(formatStageThinking("阶段2：写作任务书", partial)),
  )
  assertNotAborted(signal)
  callbacks.onThinking?.(formatStageThinking("阶段2：写作任务书", taskBrief))

  let draftContent = await collectModelText(
    writingConfig,
    [{
      role: "user",
      content: buildDeepChapterDraftPrompt(
        contextPrompt,
        taskBrief,
        input.userRequest,
        input.chapterNumber,
        input.goldenThreeChapter,
      ),
    }],
    deps,
    signal,
    (partial) => callbacks.onThinking?.(formatStageThinking("阶段3：正文初稿", partial)),
    { max_tokens: DEEP_CHAPTER_MAX_OUTPUT_TOKENS },
  )
  assertNotAborted(signal)
  if (countChapterChars(draftContent) < DEEP_CHAPTER_MIN_CHARS) {
    draftContent = await collectModelText(
      writingConfig,
      [{
        role: "user",
        content: buildDeepChapterExpansionPrompt(
          contextPrompt,
          taskBrief,
          draftContent,
          input.userRequest,
          input.chapterNumber,
          input.goldenThreeChapter,
        ),
      }],
      deps,
      signal,
      (partial) => callbacks.onThinking?.(formatStageThinking("阶段3：正文扩写补足", partial)),
      { max_tokens: DEEP_CHAPTER_MAX_OUTPUT_TOKENS },
    )
    assertNotAborted(signal)
  }
  draftContent = await optimizeChapterLengthIfNeeded(
    "阶段4：字数审核与正文优化",
    draftContent,
    writingConfig,
    contextPrompt,
    taskBrief,
    input,
    callbacks,
    deps,
    signal,
  )
  callbacks.onThinking?.(formatStageThinking("阶段3：正文初稿", [
    draftContent,
    "",
    `初稿生成完成，约 ${countChapterChars(draftContent)} 字。`,
  ].join("\n")))

  callbacks.onThinking?.(formatStageThinking(
    "阶段4：AI审稿",
    "正在检查正文完整性、剧情连续性、是否被截断以及是否存在阻断问题。",
  ))
  const reviewResults = await deps.reviewChapter(input.projectPath, draftContent, input.chapterNumber)
  assertNotAborted(signal)
  callbacks.onThinking?.(formatReviewThinking(reviewResults))

  const blockingIssues = reviewResults.filter((item) => item.severity === "error")
  if (blockingIssues.length === 0) {
    callbacks.onThinking?.(formatStageThinking(
      "阶段5：无需自动返修",
      "AI审稿未发现阻断问题，跳过自动返修，进入阶段6简单审查与字数检查。",
    ))
    const finalContent = await finalPolishChapterWithLengthGate(
      writingConfig,
      contextPrompt,
      taskBrief,
      draftContent,
      input,
      callbacks,
      deps,
      signal,
    )
    callbacks.onThinking?.(formatStageThinking("阶段7：完成", "未发现阻断问题，已完成最后一遍简单审查与去AI味。"))
    callbacks.onFinalContent?.(finalContent)
    return {
      finalContent,
      taskBrief,
      draftContent,
      reviewResults,
      revised: false,
    }
  }

  let revisedContent = await collectModelText(
    writingConfig,
    [{
      role: "user",
      content: buildDeepChapterRevisionPrompt(
        contextPrompt,
        taskBrief,
        draftContent,
        blockingIssues,
        input.userRequest,
        input.chapterNumber,
        input.goldenThreeChapter,
      ),
    }],
    deps,
    signal,
    (partial) => callbacks.onThinking?.(formatStageThinking("阶段5：自动返修", partial)),
    { max_tokens: DEEP_CHAPTER_MAX_OUTPUT_TOKENS },
  )
  assertNotAborted(signal)
  if (countChapterChars(revisedContent) < DEEP_CHAPTER_MIN_CHARS) {
    revisedContent = await collectModelText(
      writingConfig,
      [{
        role: "user",
        content: buildDeepChapterExpansionPrompt(
          contextPrompt,
          taskBrief,
          revisedContent,
          input.userRequest,
          input.chapterNumber,
          input.goldenThreeChapter,
        ),
      }],
      deps,
      signal,
      (partial) => callbacks.onThinking?.(formatStageThinking("阶段5：返修扩写补足", partial)),
      { max_tokens: DEEP_CHAPTER_MAX_OUTPUT_TOKENS },
    )
    assertNotAborted(signal)
  }
  callbacks.onThinking?.(formatStageThinking(
    "阶段5：自动返修",
    [
      `检测到 ${blockingIssues.length} 个阻断问题，已自动返修一次。`,
      "",
      formatReviewIssueList(blockingIssues),
      "",
      `返修后正文约 ${revisedContent.length} 字。`,
    ].join("\n"),
  ))
  const finalContent = await finalPolishChapterWithLengthGate(
    writingConfig,
    contextPrompt,
    taskBrief,
    revisedContent,
    input,
    callbacks,
    deps,
    signal,
  )
  callbacks.onThinking?.(formatStageThinking("阶段7：完成", "采用返修并完成简单审查、去AI味后的正文作为最终正文。"))
  callbacks.onFinalContent?.(finalContent)
  return {
    finalContent,
    taskBrief,
    draftContent,
    reviewResults,
    revised: true,
  }
}

async function finalPolishChapterWithLengthGate(
  writingConfig: LlmConfig,
  contextPrompt: string,
  taskBrief: string,
  currentContent: string,
  input: DeepChapterGenerationInput,
  callbacks: DeepChapterGenerationCallbacks,
  deps: DeepChapterGenerationDeps,
  signal?: AbortSignal,
): Promise<string> {
  const polished = await finalPolishChapter(
    writingConfig,
    contextPrompt,
    taskBrief,
    currentContent,
    input,
    callbacks,
    deps,
    signal,
  )
  const polishedChars = countChapterChars(polished)
  if (isWithinOptimizedLength(polishedChars)) {
    return polished
  }

  if (polishedChars > DEEP_CHAPTER_OPTIMIZED_MAX_CHARS) {
    const rewritten = await optimizeChapterLengthStrict(
      "阶段6：字数检查与正文优化",
      polished,
      writingConfig,
      contextPrompt,
      taskBrief,
      input,
      callbacks,
      deps,
      signal,
    )
    const repolished = await finalPolishChapter(
      writingConfig,
      contextPrompt,
      taskBrief,
      rewritten,
      input,
      callbacks,
      deps,
      signal,
    )
    const repolishedChars = countChapterChars(repolished)
    if (isWithinOptimizedLength(repolishedChars)) {
      return repolished
    }
    if (repolishedChars > DEEP_CHAPTER_OPTIMIZED_MAX_CHARS) {
      return optimizeChapterLengthStrict(
        "阶段6：字数检查与正文优化",
        repolished,
        writingConfig,
        contextPrompt,
        taskBrief,
        input,
        callbacks,
        deps,
        signal,
      )
    }
    callbacks.onThinking?.(formatStageThinking(
      "阶段6：字数检查未达标",
      "再次简单审查后字数被压缩，已保留阶段3控字重写后的版本作为最终正文，避免章节再次缩水。",
    ))
    return rewritten
  }

  callbacks.onThinking?.(formatStageThinking(
    "阶段6：字数检查未达标",
    `简单审查后正文约 ${polishedChars} 字，低于 ${DEEP_CHAPTER_MIN_CHARS} 字最低要求，自动回到阶段3扩写补足。`,
  ))

  const expandedContent = await collectModelText(
    writingConfig,
    [{
      role: "user",
      content: buildDeepChapterExpansionPrompt(
        contextPrompt,
        taskBrief,
        polished,
        input.userRequest,
        input.chapterNumber,
        input.goldenThreeChapter,
      ),
    }],
    deps,
    signal,
    (partial) => callbacks.onThinking?.(formatStageThinking("阶段3：正文扩写补足", partial)),
    { max_tokens: DEEP_CHAPTER_MAX_OUTPUT_TOKENS },
  )
  assertNotAborted(signal)
  const lengthCheckedExpandedContent = await optimizeChapterLengthIfNeeded(
    "阶段6：字数检查与正文优化",
    expandedContent,
    writingConfig,
    contextPrompt,
    taskBrief,
    input,
    callbacks,
    deps,
    signal,
  )

  callbacks.onThinking?.(formatStageThinking(
    "阶段3：正文扩写补足",
    [
      `已根据阶段6字数检查补足正文，扩写后约 ${countChapterChars(lengthCheckedExpandedContent)} 字。`,
      "",
      lengthCheckedExpandedContent,
    ].join("\n"),
  ))

  const repolished = await finalPolishChapter(
    writingConfig,
    contextPrompt,
    taskBrief,
    lengthCheckedExpandedContent,
    input,
    callbacks,
    deps,
    signal,
  )
  const repolishedChars = countChapterChars(repolished)
  if (repolishedChars > DEEP_CHAPTER_OPTIMIZED_MAX_CHARS) {
    return optimizeChapterLengthStrict(
      "阶段6：字数检查与正文优化",
      repolished,
      writingConfig,
      contextPrompt,
      taskBrief,
      input,
      callbacks,
      deps,
      signal,
    )
  }
  if (repolishedChars >= DEEP_CHAPTER_MIN_CHARS || repolishedChars >= countChapterChars(lengthCheckedExpandedContent)) {
    return repolished
  }

  callbacks.onThinking?.(formatStageThinking(
    "阶段6：字数检查未达标",
    "再次简单审查后字数仍被压缩，已保留扩写补足后的版本作为最终正文，避免章节再次缩水。",
  ))
  return lengthCheckedExpandedContent
}

function isWithinOptimizedLength(chars: number): boolean {
  return chars >= DEEP_CHAPTER_OPTIMIZED_MIN_CHARS && chars <= DEEP_CHAPTER_OPTIMIZED_MAX_CHARS
}

async function optimizeChapterLengthIfNeeded(
  stageTitle: string,
  currentContent: string,
  writingConfig: LlmConfig,
  contextPrompt: string,
  taskBrief: string,
  input: DeepChapterGenerationInput,
  callbacks: DeepChapterGenerationCallbacks,
  deps: DeepChapterGenerationDeps,
  signal?: AbortSignal,
): Promise<string> {
  const currentChars = countChapterChars(currentContent)
  if (isWithinOptimizedLength(currentChars)) return currentContent
  return optimizeChapterLengthStrict(
    stageTitle,
    currentContent,
    writingConfig,
    contextPrompt,
    taskBrief,
    input,
    callbacks,
    deps,
    signal,
  )
}

async function optimizeChapterLengthStrict(
  stageTitle: string,
  currentContent: string,
  writingConfig: LlmConfig,
  contextPrompt: string,
  taskBrief: string,
  input: DeepChapterGenerationInput,
  callbacks: DeepChapterGenerationCallbacks,
  deps: DeepChapterGenerationDeps,
  signal?: AbortSignal,
): Promise<string> {
  let content = currentContent
  for (let attempt = 1; attempt <= DEEP_CHAPTER_LENGTH_OPTIMIZATION_MAX_ATTEMPTS; attempt += 1) {
    const currentChars = countChapterChars(content)
    if (isWithinOptimizedLength(currentChars)) return content

    callbacks.onThinking?.(formatStageThinking(
      stageTitle,
      `当前正文约 ${currentChars} 字，正在基于阶段3正文草稿做内容优化（第 ${attempt}/${DEEP_CHAPTER_LENGTH_OPTIMIZATION_MAX_ATTEMPTS} 次）。目标严格控制在 ${DEEP_CHAPTER_OPTIMIZED_MIN_CHARS}-${DEEP_CHAPTER_OPTIMIZED_MAX_CHARS} 字；如果优化后仍超过 ${DEEP_CHAPTER_REWRITE_MAX_CHARS} 字，会继续优化。`,
    ))

    content = await collectModelText(
      writingConfig,
      [{
        role: "user",
        content: buildDeepChapterLengthRewritePrompt(
          contextPrompt,
          taskBrief,
          content,
          input.userRequest,
          input.chapterNumber,
          input.goldenThreeChapter,
        ),
      }],
      deps,
      signal,
      (partial) => callbacks.onThinking?.(formatStageThinking(stageTitle, partial)),
      { max_tokens: DEEP_CHAPTER_MAX_OUTPUT_TOKENS },
    )
    assertNotAborted(signal)
    const optimizedChars = countChapterChars(content)
    callbacks.onThinking?.(formatStageThinking(
      stageTitle,
      [
        `第 ${attempt} 次优化完成，当前约 ${optimizedChars} 字。`,
        "",
        content,
      ].join("\n"),
    ))
    if (isWithinOptimizedLength(optimizedChars)) return content
  }

  const finalChars = countChapterChars(content)
  if (finalChars > DEEP_CHAPTER_REWRITE_MAX_CHARS) {
    throw new Error(
      `阶段4字数优化已连续尝试 ${DEEP_CHAPTER_LENGTH_OPTIMIZATION_MAX_ATTEMPTS} 次，正文仍超过 ${DEEP_CHAPTER_REWRITE_MAX_CHARS} 字，已终止。请降低本章目标字数或拆成两章生成。`,
    )
  }
  throw new Error(
    `阶段4字数优化已连续尝试 ${DEEP_CHAPTER_LENGTH_OPTIMIZATION_MAX_ATTEMPTS} 次，正文仍未控制在 ${DEEP_CHAPTER_OPTIMIZED_MIN_CHARS}-${DEEP_CHAPTER_OPTIMIZED_MAX_CHARS} 字，已终止。请降低本章目标字数或拆成两章生成。`,
  )
}

async function finalPolishChapter(
  writingConfig: LlmConfig,
  contextPrompt: string,
  taskBrief: string,
  currentContent: string,
  input: DeepChapterGenerationInput,
  callbacks: DeepChapterGenerationCallbacks,
  deps: DeepChapterGenerationDeps,
  signal?: AbortSignal,
): Promise<string> {
  assertNotAborted(signal)
  callbacks.onThinking?.(formatStageThinking("阶段6：简单审查与去AI味", "正在进行最后一遍简单审查，去除复读、机械套话和 AI 味。"))
  const polished = await collectModelText(
    writingConfig,
    [{
      role: "user",
      content: buildDeepChapterFinalPolishPrompt(
        contextPrompt,
        taskBrief,
        currentContent,
        input.userRequest,
        input.chapterNumber,
        input.goldenThreeChapter,
      ),
    }],
    deps,
    signal,
    (partial) => callbacks.onThinking?.(formatStageThinking("阶段6：简单审查与去AI味", partial)),
    { max_tokens: DEEP_CHAPTER_MAX_OUTPUT_TOKENS },
  )
  assertNotAborted(signal)
  return polished.trim() ? polished : currentContent
}

function resolveWritingConfig(llmConfig: LlmConfig): LlmConfig {
  const novelConfig = useWikiStore.getState().novelConfig
  return resolveNovelModel(llmConfig, novelConfig, "writing")
}

async function collectModelText(
  config: LlmConfig,
  messages: ChatMessage[],
  deps: DeepChapterGenerationDeps,
  signal?: AbortSignal,
  onUpdate?: (content: string) => void,
  requestOverrides?: RequestOverrides,
): Promise<string> {
  let content = ""
  let streamError: Error | null = null
  let cutoffReason: string | null = null
  const streamController = new AbortController()
  const combinedSignal = combineAbortSignals(signal, streamController.signal)
  const stopStream = (reason: string) => {
    if (cutoffReason) return
    cutoffReason = reason
    streamController.abort()
  }

  assertNotAborted(signal)

  await deps.streamChat(
    config,
    messages,
    {
      onToken: (token) => {
        if (signal?.aborted) {
          stopStream(USER_ABORT_MESSAGE)
          return
        }
        content += token
        const normalizedCharCount = countChapterChars(content)
        const loopStart = findRepeatedTailStart(content)
        if (loopStart !== null) {
          content = content.slice(0, loopStart).trimEnd()
          onUpdate?.(`${content}\n\n（已检测到模型重复输出，已自动停止重复内容。）`)
          stopStream("检测到模型重复输出，已自动停止重复内容。")
          return
        }
        if (normalizedCharCount > DEEP_CHAPTER_HARD_MAX_CHARS) {
          content = trimToChapterCharLimit(content, DEEP_CHAPTER_HARD_MAX_CHARS)
          onUpdate?.(`${content}\n\n（${CHAPTER_LENGTH_LIMIT_MESSAGE}）`)
          stopStream(CHAPTER_LENGTH_LIMIT_MESSAGE)
          return
        }
        onUpdate?.(content)
      },
      onDone: () => {},
      onError: (error) => {
        streamError = error
      },
    },
    combinedSignal,
    {
      ...requestOverrides,
      reasoning: requestOverrides?.reasoning ?? resolveUserVisibleReasoning(config.reasoning),
    },
  )

  if (signal?.aborted) throw new Error(USER_ABORT_MESSAGE)
  if (streamError && !(cutoffReason && isRequestCancelledError(streamError))) throw streamError
  if (cutoffReason) {
    onUpdate?.(`${content.trim()}\n\n（${cutoffReason}）`)
  }
  return content.trim()
}

function countChapterChars(content: string): number {
  return content.replace(/\s+/g, "").length
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(USER_ABORT_MESSAGE)
}

function isRequestCancelledError(error: Error): boolean {
  return /request cancelled|request canceled|aborted|aborterror/i.test(error.message)
}

function combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter(Boolean) as AbortSignal[]
  if (activeSignals.length === 0) return undefined
  if (activeSignals.length === 1) return activeSignals[0]

  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener("abort", abort, { once: true })
  }
  return controller.signal
}

function findRepeatedTailStart(content: string): number | null {
  const normalized = content.replace(/\r\n/g, "\n")
  const compact = normalized.replace(/\s+/g, "")
  if (compact.length < REPEAT_CHECK_MIN_CHARS) return null

  const tail = compact.slice(-REPEAT_WINDOW_CHARS)
  const first = compact.indexOf(tail)
  if (first === -1 || first >= compact.length - REPEAT_WINDOW_CHARS) return null

  let hits = 0
  let searchIndex = 0
  while (true) {
    const found = compact.indexOf(tail, searchIndex)
    if (found === -1) break
    hits += 1
    if (hits >= REPEAT_HIT_LIMIT) {
      return sourceIndexFromCompactIndex(normalized, first + REPEAT_WINDOW_CHARS)
    }
    searchIndex = found + Math.max(1, tail.length)
  }
  return null
}

function sourceIndexFromCompactIndex(content: string, compactIndex: number): number {
  let seen = 0
  for (let index = 0; index < content.length; index += 1) {
    if (/\s/.test(content[index])) continue
    seen += 1
    if (seen >= compactIndex) return index + 1
  }
  return content.length
}

function trimToChapterCharLimit(content: string, maxChars: number): string {
  let seen = 0
  for (let index = 0; index < content.length; index += 1) {
    if (!/\s/.test(content[index])) seen += 1
    if (seen > maxChars) return content.slice(0, index).trimEnd()
  }
  return content.trimEnd()
}

function formatContextThinking(input: DeepChapterGenerationInput, pack: ContextPack): string {
  return formatStageThinking(
    "阶段1：上下文分析",
    [
      input.chapterNumber ? `目标章节：第${input.chapterNumber}章` : "目标章节：从用户请求中识别",
      `章节目标：${fallback(pack.chapterGoal, "未读取到明确章节目标")}`,
      `上一章结尾：${fallback(pack.previousChapterEnding, "未读取到上一章结尾")}`,
      `近期剧情：${pack.recentSummaries.length} 条`,
      `人物状态：${summaryText(pack.characterStates)}`,
      `伏笔状态：${summaryText(pack.foreshadowingStates)}`,
      `时间线：${summaryText(pack.timeline)}`,
      `禁止违背：${fallback(pack.mustAvoid, "暂无明确禁止项")}`,
      `必须完成：${fallback(pack.mustDo, "暂无明确必做项")}`,
    ].join("\n"),
  )
}

function formatReviewThinking(reviewResults: NovelReviewResult[]): string {
  if (reviewResults.length === 0) {
    return formatStageThinking("阶段4：AI审稿", "未发现阻断问题。")
  }
  return formatStageThinking(
    "阶段4：AI审稿",
    [
      `发现 ${reviewResults.length} 个问题，其中阻断问题 ${reviewResults.filter((item) => item.severity === "error").length} 个。`,
      "",
      formatReviewIssueList(reviewResults),
    ].join("\n"),
  )
}

function formatStageThinking(title: string, content: string): string {
  return `## ${title}\n${content.trim()}`
}

function formatReviewIssueList(reviewResults: NovelReviewResult[]): string {
  return reviewResults
    .map((item, index) => [
      `${index + 1}. [${severityLabel(item.severity)}] ${item.message}`,
      item.evidence ? `   - 证据：${item.evidence}` : "",
      item.relatedMemory ? `   - 相关记忆：${item.relatedMemory}` : "",
      item.suggestion ? `   - 建议：${item.suggestion}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n")
}

function fallback(value: string, fallbackText: string): string {
  const trimmed = value.trim()
  return trimmed ? trimForThinking(trimmed, 180) : fallbackText
}

function summaryText(value: string): string {
  const trimmed = value.trim()
  return trimmed ? trimForThinking(trimmed, 140) : "暂无"
}

function trimForThinking(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

function severityLabel(severity: NovelReviewResult["severity"]): string {
  if (severity === "error") return "严重"
  if (severity === "warning") return "提醒"
  return "信息"
}
