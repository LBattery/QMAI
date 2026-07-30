import { describe, it, expect } from "vitest"
import {
  parseIntentClarity,
  shouldAutoFollowUpGeneration,
  stripStructuredMarkers,
} from "./outline-intent-clarity"

describe("parseIntentClarity", () => {
  it("解析 clear 意图", () => {
    const text = `<!-- intent_clarity -->
{"clarity":"clear","module":"章节细纲","analysis":"检测到3章缺细纲","detectedScope":"第1-3章","missingItems":["第1章细纲"],"options":[],"question":""}
<!-- /intent_clarity -->`
    const result = parseIntentClarity(text)
    expect(result).not.toBeNull()
    expect(result!.clarity).toBe("clear")
    expect(result!.module).toBe("章节细纲")
    expect(result!.detectedScope).toBe("第1-3章")
  })

  it("解析 needs_input 意图并提取选项", () => {
    const text = `<!-- intent_clarity -->
{"clarity":"needs_input","module":"章节细纲","analysis":"0章有细纲","detectedScope":"","missingItems":[],"options":[{"id":"A","label":"生成全部缺失细纲","description":"第1-35章"},{"id":"D","label":"自定义","description":"自行描述"}],"question":"请问要生成哪些章节的细纲？"}
<!-- /intent_clarity -->`
    const result = parseIntentClarity(text)
    expect(result).not.toBeNull()
    expect(result!.clarity).toBe("needs_input")
    expect(result!.options).toHaveLength(2)
    expect(result!.options[0].id).toBe("A")
    expect(result!.question).toContain("哪些章节")
  })

  it("无标记块时返回 null", () => {
    expect(parseIntentClarity("普通文本无标记")).toBeNull()
  })

  it("JSON 格式错误时返回 null", () => {
    const text = `<!-- intent_clarity -->
{invalid json}
<!-- /intent_clarity -->`
    expect(parseIntentClarity(text)).toBeNull()
  })
})

describe("shouldAutoFollowUpGeneration", () => {
  it("只允许意图分析阶段自动进入一次生成，阻止生成和修订阶段再次触发", () => {
    expect(shouldAutoFollowUpGeneration("intent_analysis")).toBe(true)
    expect(shouldAutoFollowUpGeneration("generation")).toBe(false)
    expect(shouldAutoFollowUpGeneration("waiting_user_input")).toBe(false)
    expect(shouldAutoFollowUpGeneration(undefined)).toBe(false)
  })
})

describe("stripStructuredMarkers", () => {
  it("移除 intent_clarity 标记块", () => {
    const text = `分析结果如下：\n<!-- intent_clarity -->\n{"clarity":"clear"}\n<!-- /intent_clarity -->\n\n这是正文内容。`
    expect(stripStructuredMarkers(text)).toBe("分析结果如下：\n\n这是正文内容。")
  })

  it("移除 next_step 标记块", () => {
    const text = `正文内容\n<!-- next_step -->\n{"recommendations":[]}\n<!-- /next_step -->`
    expect(stripStructuredMarkers(text).trim()).toBe("正文内容")
  })

  it("同时移除两种标记块", () => {
    const text = `<!-- intent_clarity -->\n{"clarity":"clear"}\n<!-- /intent_clarity -->\n正文\n<!-- next_step -->\n{"recommendations":[]}\n<!-- /next_step -->`
    expect(stripStructuredMarkers(text).trim()).toBe("正文")
  })

  it("无标记块时原样返回", () => {
    const text = "纯文本内容"
    expect(stripStructuredMarkers(text)).toBe("纯文本内容")
  })

  it("流式中间态：intent_clarity 开标签无闭标签时截断后续内容", () => {
    const text = "分析结果如下：\n<!-- intent_clarity -->\n{\"clarity\":\"clear\",\"module\":\"章节"
    const result = stripStructuredMarkers(text)
    expect(result).toBe("分析结果如下：")
    expect(result).not.toContain("intent_clarity")
    expect(result).not.toContain("clarity")
  })

  it("流式中间态：next_step 开标签无闭标签时截断后续内容", () => {
    const text = "正文内容\n<!-- next_step -->\n{\"recommendations\":["
    const result = stripStructuredMarkers(text)
    expect(result).toBe("正文内容")
    expect(result).not.toContain("next_step")
    expect(result).not.toContain("recommendations")
  })

  it("完整标记对优先于不完整截断逻辑", () => {
    // 完整标记对在步骤1被移除后，不应再被步骤2截断
    const text = "<!-- intent_clarity -->\n{\"clarity\":\"clear\"}\n<!-- /intent_clarity -->\n正文内容"
    const result = stripStructuredMarkers(text)
    expect(result).toBe("正文内容")
  })

  it("残留裸闭标签被清理", () => {
    const text = "正文内容\n<!-- /intent_clarity -->\n更多内容"
    const result = stripStructuredMarkers(text)
    expect(result).not.toContain("intent_clarity")
    expect(result).toContain("正文内容")
    expect(result).toContain("更多内容")
  })

  it("正常文本中包含 HTML 注释但不匹配标记名时不受影响", () => {
    const text = "这是正文\n<!-- regular comment -->\n更多正文"
    const result = stripStructuredMarkers(text)
    expect(result).toContain("regular comment")
    expect(result).toContain("这是正文")
    expect(result).toContain("更多正文")
  })

  it("同时存在完整 intent_clarity 和不完整 next_step 时正确处理", () => {
    const text = "<!-- intent_clarity -->\n{\"clarity\":\"clear\"}\n<!-- /intent_clarity -->\n正文\n<!-- next_step -->\n{\"recommendations\":["
    const result = stripStructuredMarkers(text)
    expect(result).toBe("正文")
    expect(result).not.toContain("intent_clarity")
    expect(result).not.toContain("next_step")
  })

  it("移除 <details> 折叠块及其内部内容", () => {
    const text = "正文内容\n<details>\n<summary>清单</summary>\n内部内容\n</details>\n更多正文"
    const result = stripStructuredMarkers(text)
    expect(result).toContain("正文内容")
    expect(result).toContain("更多正文")
    expect(result).not.toContain("details")
    expect(result).not.toContain("summary")
    expect(result).not.toContain("内部内容")
  })

  it("移除流式中间态的 <details> 开标签及后续内容", () => {
    const text = "正文内容\n<details>\n<summary><b>清单</b></summary>\n"
    const result = stripStructuredMarkers(text)
    expect(result).toBe("正文内容")
    expect(result).not.toContain("details")
  })

  it("移除 <b> <strong> <br> 等行内 HTML 标签但保留文本", () => {
    const text = "这是<b>粗体</b>文本<br>换行<strong>加粗</strong>"
    const result = stripStructuredMarkers(text)
    expect(result).toContain("粗体")
    expect(result).toContain("加粗")
    expect(result).toContain("换行")
    expect(result).not.toContain("<b>")
    expect(result).not.toContain("</b>")
    expect(result).not.toContain("<strong>")
    expect(result).not.toContain("<br>")
  })

  it("移除 <div> <p> 等块级 HTML 标签但保留文本", () => {
    const text = "<div>段落一</div><p>段落二</p>"
    const result = stripStructuredMarkers(text)
    expect(result).toContain("段落一")
    expect(result).toContain("段落二")
    expect(result).not.toContain("<div>")
    expect(result).not.toContain("<p>")
  })

  it("移除包含 emoji 的 <summary> 标签", () => {
    const text = '<details>\n<summary><b>📋 新增设定写回清单</b></summary>\n\n***\n</details>\n正文'
    const result = stripStructuredMarkers(text)
    expect(result).toBe("正文")
    expect(result).not.toContain("📋")
    expect(result).not.toContain("details")
    expect(result).not.toContain("summary")
  })
})
