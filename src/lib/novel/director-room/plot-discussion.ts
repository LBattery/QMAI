import { streamChat, type ChatMessage } from "@/lib/llm-client"
import { parseLlmJsonObject } from "@/lib/novel/book-analysis/llm-json"
import type { LlmConfig } from "@/stores/wiki-store"
import type { ExtractionResult, ExtractedCharacter } from "./types"

export type DirectorRoomSpeakerType = "user" | "director" | "character"
export type PlotDiscussionFocus = "open" | "character" | "reverse" | "pressure"

export interface PlotDiscussionMessage {
  id: string
  speakerType: DirectorRoomSpeakerType
  speakerId?: string
  speakerName: string
  replyToSpeakerName?: string
  content: string
  createdAt: string
}

export interface PlotDirection {
  id: string
  title: string
  possibility: string
  spark: string
  tradeoff: string
  pinned: boolean
  createdAt: string
}

export interface PlotDiscussionSession {
  id: string
  title: string
  sourceChapters: number
  selectedCharacterIds: string[]
  context: ExtractionResult | null
  messages: PlotDiscussionMessage[]
  directions: PlotDirection[]
  createdAt: string
  updatedAt: string
}

export interface PlotDiscussionSessionSummary {
  id: string
  title: string
  messageCount: number
  directionCount: number
  createdAt: string
  updatedAt: string
}

export interface PlotDiscussionContribution {
  speakerType: "director" | "character"
  speakerId?: string
  speakerName: string
  replyToSpeakerName?: string
  content: string
}

export interface PlotDiscussionResponse {
  contributions: PlotDiscussionContribution[]
  directions: Array<Omit<PlotDirection, "id" | "pinned" | "createdAt">>
  nextQuestion: string
  rawText: string
}

interface RunPlotDiscussionOptions {
  llmConfig: LlmConfig
  session: PlotDiscussionSession
  prompt: string
  focus: PlotDiscussionFocus
  signal?: AbortSignal
}

const FOCUS_INSTRUCTIONS: Record<PlotDiscussionFocus, string> = {
  open: "自由发散。允许互相否定、补充和临时改主意，不急着形成结论。",
  character: "让角色从最近一章或最近一幕的具体现场出发，共同提出后续剧情：谁刚刚做了什么、现在在哪里、手里有什么线索或麻烦，下一场具体会发生什么。角色的欲望和抗拒只用于解释行动，不要展开成心理描写或人物主题分析。",
  reverse: "主动反驳当前最顺手的走向，寻找更意外但仍符合人物逻辑的可能。",
  pressure: "给现有关系和矛盾加压，寻找一个能迫使角色暴露选择的局面，但不要直接替他们决定结果。",
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function trim(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n[内容已截取]`
}

function tail(value: string, max: number): string {
  if (value.length <= max) return value
  return `[前文已省略]\n${value.slice(-max)}`
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createPlotDiscussionSession(): PlotDiscussionSession {
  const now = new Date().toISOString()
  return {
    id: nextId("discussion"),
    title: "未命名讨论",
    sourceChapters: 10,
    selectedCharacterIds: [],
    context: null,
    messages: [
      {
        id: nextId("message"),
        speakerType: "director",
        speakerName: "导演 AI",
        content: "我们从现在的故事状态往后聊。先抛一个你最近拿不准的念头。",
        createdAt: now,
      },
    ],
    directions: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function summarizePlotDiscussionSession(
  session: PlotDiscussionSession,
): PlotDiscussionSessionSummary {
  return {
    id: session.id,
    title: session.title,
    messageCount: session.messages.length,
    directionCount: session.directions.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function selectedCharacters(session: PlotDiscussionSession): ExtractedCharacter[] {
  if (!session.context) return []
  const selected = new Set(session.selectedCharacterIds)
  const characters = session.context.characters.filter((character) => selected.has(character.id))
  return (characters.length > 0 ? characters : session.context.characters.slice(0, 4)).slice(0, 8)
}

export function findDirectlyAddressedCharacters(
  characters: ExtractedCharacter[],
  prompt: string,
): ExtractedCharacter[] {
  const normalizedPrompt = prompt.trim().toLocaleLowerCase()
  const namedCharacters = characters.filter((character) => character.name.trim())
  const atTargets = namedCharacters.filter((character) =>
    normalizedPrompt.includes(`@${character.name.trim().toLocaleLowerCase()}`),
  )
  if (atTargets.length > 0) return atTargets

  const directTargets = namedCharacters.filter((character) => {
    const name = character.name.trim().toLocaleLowerCase()
    return normalizedPrompt.startsWith(name)
      || normalizedPrompt.includes(`问${name}`)
      || normalizedPrompt.includes(`请${name}`)
      || normalizedPrompt.includes(`让${name}回答`)
      || normalizedPrompt.includes(`想听${name}`)
  })
  if (directTargets.length > 0) return directTargets

  const mentionedCharacters = namedCharacters.filter((character) => {
    const name = character.name.trim().toLocaleLowerCase()
    return name.length >= 2 && normalizedPrompt.includes(name)
  })
  return mentionedCharacters.length === 1 ? mentionedCharacters : []
}

function characterBrief(character: ExtractedCharacter): string {
  const knows = character.cognition?.knows?.slice(-8).join("；") ?? ""
  const doesNotKnow = character.cognition?.doesNotKnow?.slice(-8).join("；") ?? ""
  return [
    `### ${character.name}（id: ${character.id}）`,
    trim(character.profile || "暂无角色档案", 1800),
    character.soul ? `角色内核：${trim(character.soul, 900)}` : "",
    knows ? `已知信息：${trim(knows, 900)}` : "",
    doesNotKnow ? `认知盲区：${trim(doesNotKnow, 700)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function storyContext(context: ExtractionResult): string {
  const recentChapters = context.chapterContents.slice(-6).map((chapter) => {
    const body = chapter.summary || chapter.content
    return `### 第${chapter.chapterNumber}章 ${chapter.title}\n${trim(body, 2600)}`
  })
  const memory = context.memoryData
  return [
    "## 当前故事",
    recentChapters.join("\n\n"),
    context.outlineContent ? `## 现有大纲\n${trim(context.outlineContent, 4500)}` : "",
    context.worldRules ? `## 世界规则\n${trim(context.worldRules, 2200)}` : "",
    context.powerSystem ? `## 力量体系\n${trim(context.powerSystem, 1400)}` : "",
    memory.characterStates ? `## 人物当前状态\n${trim(memory.characterStates, 2500)}` : "",
    memory.canonFacts ? `## 已确认事实\n${trim(memory.canonFacts, 2200)}` : "",
    memory.conflicts ? `## 未解决冲突\n${trim(memory.conflicts, 1800)}` : "",
    context.timeline.length > 0 ? `## 近期时间线\n${trim(context.timeline.slice(-20).join("\n"), 2200)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function currentSceneContext(context: ExtractionResult): string {
  const latestChapter = context.chapterContents[context.chapterContents.length - 1]
  if (!latestChapter) return ""
  return [
    "## 当前场景锚点",
    `最近章节：第${latestChapter.chapterNumber}章 ${latestChapter.title}`,
    latestChapter.summary ? `本章摘要：${trim(latestChapter.summary, 1800)}` : "",
    latestChapter.content
      ? `本章正文末段（用于锁定当前现场）：\n${tail(latestChapter.content, 6000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function discussionHistory(session: PlotDiscussionSession): string {
  return session.messages
    .slice(-18)
    .map((message) => `${message.speakerName}：${trim(message.content, 1400)}`)
    .join("\n\n")
}

function buildMessages(
  session: PlotDiscussionSession,
  prompt: string,
  focus: PlotDiscussionFocus,
): ChatMessage[] {
  const characters = selectedCharacters(session)
  const directlyAddressedCharacters = findDirectlyAddressedCharacters(characters, prompt)
  const directlyAddressedNames = directlyAddressedCharacters.map((character) => character.name).join("、")
  const systemPrompt = `你在一间小说导演室里主持剧情圆桌。作者、导演 AI 和小说角色一起寻找后续灵感。

这不是大纲生成任务，也不是起承转合模板。不要输出章节规划、固定结构、标准答案或正式策划案。

讨论原则：
1. 导演负责追问矛盾、指出有趣之处和连接不同意见，不替作者拍板。
2. 角色依据本人性格、欲望、关系和认知边界提出剧情行动或反驳，但不是表演内心独白，也不是分别向作者汇报。
3. 作者没有点名时，不强迫所有参会者发言，每轮只选择 1 至 3 个最相关角色；作者明确点名时，只让被点名角色回答。
4. 优先寻找“人物自然会做什么”带来的后果，而不是套类型套路。
5. 保留多个互相冲突的可能性。方向可以不完整，只要能激发下一步想象。
6. 严格尊重已确认事实和角色认知，不把未来设想写成已经发生的正史。
7. 这是对后续剧情的讨论，不是小说正文。心理、情绪和性格分析最多用一句交代，主要篇幅必须用于事件、行动、对话冲突、信息变化及其直接后果。

本轮侧重：${FOCUS_INSTRUCTIONS[focus]}

${directlyAddressedCharacters.length > 0 ? `本轮点名对象：${directlyAddressedNames}
- 作者是在向特定角色提问。本轮 contributions 只允许以上被点名角色发言，其他参会角色必须保持沉默。
- 导演 AI 不要插话、总结或代答，nextQuestion 返回空字符串。
- 被点名角色的完整回答可以写 2 至 5 句；“最多一句”的限制只针对心理动机，不是限制整个回答只能有一句。` : ""}

${focus === "character" && directlyAddressedCharacters.length === 0 ? `本轮采用角色圆桌互动：
- 先由导演 AI 提出一个紧接当前场景的具体走向，说明下一场准备让谁做什么，不要直接给结论。
- 从参会者中选择 2 至 3 个与这个走向关系最直接的角色。角色不是对作者发表感想，而是站在自己的已知信息、利益和处境中回应导演或上一位角色。
- contributions 必须按真实对话顺序排列，并形成回应链：导演提案 → 角色 A 回应导演 → 角色 B 点名支持、反驳或改写角色 A；有必要时角色 A 可以再回应一次。
- 每条角色发言都填写 replyToSpeakerName，并在 content 中明确提到对方观点中的具体行动。不能只是把几份互不相关的角色意见并排输出。
- 角色之间可以误解、质疑、结盟或争夺主动权，但只能使用各自已经知道的信息；不知道的事实不能拿来反驳别人。
- 角色发言不要称呼“作者”或泛泛地对“你”提建议，要直接称呼导演或另一名角色，并讨论这个安排会让眼前剧情怎样变化。
- 导演最后的 nextQuestion 应追问某个角色如何回应另一角色造成的新局面，不要把选择题重新丢回给作者。` : ""}

${focus === "character" ? `角色主导模式的落地要求：
- 先引用当前场景中至少一个已经发生的具体事实（人物、地点、物件、对话、动作或线索），再开始角色发言。
- 每个角色的发言都按“眼前事实 → 下一步行动 → 对方可能回应或出现的意外 → 剧情因此发生的变化”来讨论。
- 心理动机最多一句，但完整发言可以有 2 至 5 句。不要描写角色怎么感受、怎么挣扎、如何理解自己；把这些内容转换成可观察的动作、对话、隐瞒、调查、误会或冲突。
- 发言要让后续剧情至少向前移动一步，例如出现一个新事件、一个关系动作、一条信息暴露或一个必须处理的麻烦。
- 不要跳到数章后的结局。可以提出假设，但必须明确是“如果现在……那么……”，并说明眼前会先发生什么。
- 导演 AI 负责比较这些具体走向并追问下一场，不要分析人物心理，也不要把讨论抬升成宏观大纲。
- 坏例子：“我害怕失去他，所以内心非常矛盾。”好例子：“我会在他离开前扣下那封信，逼他当场解释；如果他撒谎，这场谈话就会把两人的同盟撕开一道口子。”` : ""}

只输出一个 JSON 对象，不要 markdown fence：
{
  "contributions": [
    { "speakerType": "director|character", "speakerId": "角色 id，导演留空", "speakerName": "名字", "replyToSpeakerName": "正在回应的导演或角色名字；发起话题时留空", "content": "面向后续剧情的具体提案或回应；心理动机最多一句，主体写下一步行动、对方回应和直接后果" }
  ],
  "directions": [
    { "title": "不超过 12 字", "possibility": "用触发事件、人物行动、对方回应和局面变化说明接下来一到三场怎么发展", "spark": "最有灵感的具体场面、关系动作或意外", "tradeoff": "这个走向会牺牲什么或带来什么风险" }
  ],
  "nextQuestion": "关于下一场具体剧情、且最值得作者继续回答的一个开放问题"
}`

  const contextBlock = session.context
    ? storyContext(session.context)
    : "当前没有可用的项目故事上下文，只能围绕作者本轮提供的信息讨论。"
  const characterBlock = characters.length > 0
    ? characters.map(characterBrief).join("\n\n")
    : "本轮没有角色参会，由导演 AI 和作者讨论。"
  const sceneBlock = focus === "character" && session.context
    ? currentSceneContext(session.context)
    : ""
  const pinnedDirections = session.directions
    .filter((direction) => direction.pinned)
    .slice(-6)
    .map((direction) => `- ${direction.title}：${direction.possibility}`)
    .join("\n")

  const userContent = [
    contextBlock,
    sceneBlock,
    `## 参会角色\n${characterBlock}`,
    pinnedDirections ? `## 作者保留的灵感\n${pinnedDirections}` : "",
    `## 最近讨论\n${discussionHistory(session)}`,
    `## 作者这次想聊\n${prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]
}

export function parsePlotDiscussionResponse(rawText: string): PlotDiscussionResponse {
  const parsed = parseLlmJsonObject(rawText)
  const rawContributions = Array.isArray(parsed?.contributions) ? parsed.contributions : []
  const contributions: PlotDiscussionContribution[] = rawContributions.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const content = text(record.content)
    if (!content) return []
    const speakerType = record.speakerType === "character" ? "character" : "director"
    return [{
      speakerType,
      speakerId: text(record.speakerId) || undefined,
      speakerName: text(record.speakerName) || (speakerType === "director" ? "导演 AI" : "角色"),
      replyToSpeakerName: text(record.replyToSpeakerName) || undefined,
      content,
    }]
  })

  const rawDirections = Array.isArray(parsed?.directions) ? parsed.directions : []
  const directions = rawDirections.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const possibility = text(record.possibility)
    if (!possibility) return []
    return [{
      title: text(record.title) || "未命名方向",
      possibility,
      spark: text(record.spark),
      tradeoff: text(record.tradeoff),
    }]
  })

  if (contributions.length === 0 && rawText.trim()) {
    contributions.push({
      speakerType: "director",
      speakerName: "导演 AI",
      content: rawText.trim(),
    })
  }

  return {
    contributions,
    directions,
    nextQuestion: text(parsed?.nextQuestion),
    rawText,
  }
}

function restrictResponseToDirectTargets(
  response: PlotDiscussionResponse,
  targets: ExtractedCharacter[],
): PlotDiscussionResponse {
  if (targets.length === 0) return response
  const targetIds = new Set(targets.map((character) => character.id))
  const targetNames = new Set(targets.map((character) => character.name.trim().toLocaleLowerCase()))
  let contributions = response.contributions.filter((contribution) =>
    contribution.speakerType === "character"
      && ((contribution.speakerId && targetIds.has(contribution.speakerId))
        || targetNames.has(contribution.speakerName.trim().toLocaleLowerCase())),
  )

  if (contributions.length === 0 && targets.length === 1) {
    const characterReply = response.contributions.find((contribution) => contribution.speakerType === "character")
    if (characterReply) {
      contributions = [{
        ...characterReply,
        speakerId: targets[0].id,
        speakerName: targets[0].name,
      }]
    }
  }

  if (contributions.length === 0) {
    contributions = response.contributions.slice(0, 1)
  }

  return {
    ...response,
    contributions,
    nextQuestion: "",
  }
}

export async function runPlotDiscussion(
  options: RunPlotDiscussionOptions,
): Promise<PlotDiscussionResponse> {
  let rawText = ""
  let streamError: Error | null = null
  await streamChat(
    options.llmConfig,
    buildMessages(options.session, options.prompt, options.focus),
    {
      onToken: (token) => {
        rawText += token
      },
      onDone: () => {},
      onError: (error) => {
        streamError = error
      },
    },
    options.signal,
    { temperature: 0.85 },
  )
  if (streamError) throw streamError
  const response = parsePlotDiscussionResponse(rawText)
  const targets = findDirectlyAddressedCharacters(selectedCharacters(options.session), options.prompt)
  return restrictResponseToDirectTargets(response, targets)
}

export function responseToMessages(response: PlotDiscussionResponse): PlotDiscussionMessage[] {
  const now = new Date().toISOString()
  const messages: PlotDiscussionMessage[] = response.contributions.map((contribution) => ({
    id: nextId("message"),
    speakerType: contribution.speakerType,
    speakerId: contribution.speakerId,
    speakerName: contribution.speakerName,
    replyToSpeakerName: contribution.replyToSpeakerName,
    content: contribution.content,
    createdAt: now,
  }))
  if (response.nextQuestion) {
    messages.push({
      id: nextId("message"),
      speakerType: "director",
      speakerId: undefined,
      speakerName: "导演 AI",
      content: response.nextQuestion,
      createdAt: now,
    })
  }
  return messages
}

export function responseToDirections(response: PlotDiscussionResponse): PlotDirection[] {
  const now = new Date().toISOString()
  return response.directions.map((direction) => ({
    id: nextId("direction"),
    ...direction,
    pinned: false,
    createdAt: now,
  }))
}
