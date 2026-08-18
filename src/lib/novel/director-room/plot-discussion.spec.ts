import { describe, expect, it } from "vitest"
import {
  createPlotDiscussionSession,
  findDirectlyAddressedCharacters,
  parsePlotDiscussionResponse,
  responseToDirections,
  responseToMessages,
  summarizePlotDiscussionSession,
} from "./plot-discussion"
import type { ExtractedCharacter } from "./types"

describe("director room plot discussion", () => {
  it("creates a resumable discussion with a director opening", () => {
    const session = createPlotDiscussionSession()
    expect(session.id).toMatch(/^discussion-/)
    expect(session.messages[0]?.speakerName).toBe("导演 AI")
    expect(summarizePlotDiscussionSession(session)).toMatchObject({
      messageCount: 1,
      directionCount: 0,
    })
  })

  it("parses fenced or slightly malformed LLM JSON into role contributions and directions", () => {
    const response = parsePlotDiscussionResponse(`
      \`\`\`json
      {"contributions":[
        {"speakerType":"character","speakerId":"lin","speakerName":"林舟","content":"我不会按计划走。"},
        {"speakerType":"director","speakerName":"导演 AI","replyToSpeakerName":"林舟","content":"那就看看谁会先暴露底牌。"}
      ],"directions":[{"title":"先拆同盟","possibility":"林舟故意把消息递给对手","spark":"雨夜里的一次误会","tradeoff":"主角会失去一个可信的盟友"}],"nextQuestion":"谁最怕这件事发生？"}
      \`\`\`
    `)

    expect(response.contributions).toHaveLength(2)
    expect(response.contributions[1]?.replyToSpeakerName).toBe("林舟")
    expect(response.directions[0]).toMatchObject({ title: "先拆同盟" })
    expect(response.nextQuestion).toBe("谁最怕这件事发生？")
    expect(responseToMessages(response)).toEqual([
      expect.objectContaining({ speakerName: "林舟" }),
      expect.objectContaining({ speakerName: "导演 AI", replyToSpeakerName: "林舟" }),
      expect.objectContaining({ speakerName: "导演 AI" }),
    ])
    expect(responseToDirections(response)[0]?.pinned).toBe(false)
  })

  it("keeps useful plain text when a provider ignores the JSON contract", () => {
    const response = parsePlotDiscussionResponse("这个角色会先去找对手谈条件。")
    expect(response.contributions).toEqual([
      expect.objectContaining({ speakerType: "director", content: "这个角色会先去找对手谈条件。" }),
    ])
  })

  it("detects a directly addressed participant without treating every participant as a target", () => {
    const characters = [
      { id: "shen", name: "沈渊" },
      { id: "lin", name: "林舟" },
      { id: "lu", name: "陆离" },
    ] as ExtractedCharacter[]

    expect(findDirectlyAddressedCharacters(characters, "沈渊，你下一步会怎么处理那封信？"))
      .toEqual([expect.objectContaining({ id: "shen" })])
    expect(findDirectlyAddressedCharacters(characters, "我想问林舟，现在要不要去见陆离？"))
      .toEqual([expect.objectContaining({ id: "lin" })])
    expect(findDirectlyAddressedCharacters(characters, "大家觉得下一场怎么走？"))
      .toEqual([])
  })
})
