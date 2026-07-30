import { describe, expect, it } from "vitest";
import {
  VOLUME_OUTLINE_REQUIRED_FIELDS,
  CHAPTER_BLUEPRINT_FIELDS,
  CHAPTER_OUTLINE_REQUIRED_SECTIONS,
  CHAPTER_POSITION_TYPES,
  CHAPTER_HOOK_TYPES,
  CHAPTER_END_HOOK_TYPES,
  getVolumeOutlineTemplate,
  getChapterOutlineTemplate,
} from "./outline-templates";

describe("VOLUME_OUTLINE_REQUIRED_FIELDS", () => {
  it("has exactly 6 required fields", () => {
    expect(VOLUME_OUTLINE_REQUIRED_FIELDS).toHaveLength(6);
  });

  it("includes all required volume outline sections", () => {
    expect(VOLUME_OUTLINE_REQUIRED_FIELDS).toContain("本卷目标");
    expect(VOLUME_OUTLINE_REQUIRED_FIELDS).toContain("爽点节奏");
    expect(VOLUME_OUTLINE_REQUIRED_FIELDS).toContain("情绪弧线");
    expect(VOLUME_OUTLINE_REQUIRED_FIELDS).toContain("人物弧线");
    expect(VOLUME_OUTLINE_REQUIRED_FIELDS).toContain("伏笔布局");
    expect(VOLUME_OUTLINE_REQUIRED_FIELDS).toContain("关键反转");
  });
});

describe("CHAPTER_BLUEPRINT_FIELDS", () => {
  it("has exactly 9 blueprint fields", () => {
    expect(CHAPTER_BLUEPRINT_FIELDS).toHaveLength(9);
  });

  it("includes all required chapter blueprint sections", () => {
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("内容概括");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("情节安排");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("人物关系和出场顺序");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("情节细化");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("情绪变化");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("章首钩子");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("本章爽点");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("章尾钩子");
    expect(CHAPTER_BLUEPRINT_FIELDS).toContain("结尾设定");
  });
});

describe("CHAPTER_OUTLINE_REQUIRED_SECTIONS", () => {
  it("includes the full AI outline chapter standard", () => {
    expect(CHAPTER_OUTLINE_REQUIRED_SECTIONS).toEqual([
      "基础信息",
      "上层依据",
      "本章目标",
      "核心事件",
      "场景顺序",
      "结构节点",
      "章首钩子",
      "爽点设计",
      "章尾钩子",
      "执行约束",
      "人物状态",
      "伏笔与追踪",
      "待写回设定",
      "写作约束",
      "AI写作提示",
    ]);
  });
});

describe("CHAPTER_POSITION_TYPES", () => {
  it("has exactly 6 position types", () => {
    expect(CHAPTER_POSITION_TYPES).toHaveLength(6);
  });

  it("includes all six chapter position labels", () => {
    expect(CHAPTER_POSITION_TYPES).toContain("开场");
    expect(CHAPTER_POSITION_TYPES).toContain("发展");
    expect(CHAPTER_POSITION_TYPES).toContain("铺垫");
    expect(CHAPTER_POSITION_TYPES).toContain("转折");
    expect(CHAPTER_POSITION_TYPES).toContain("高潮");
    expect(CHAPTER_POSITION_TYPES).toContain("收束");
  });
});

describe("CHAPTER_HOOK_TYPES", () => {
  it("has exactly 7 chapter hook types", () => {
    expect(CHAPTER_HOOK_TYPES).toHaveLength(7);
  });

  it("includes all seven chapter-opening hook types", () => {
    expect(CHAPTER_HOOK_TYPES).toContain("悬念对话开局");
    expect(CHAPTER_HOOK_TYPES).toContain("闪前碎片");
    expect(CHAPTER_HOOK_TYPES).toContain("倒计时开局");
    expect(CHAPTER_HOOK_TYPES).toContain("神秘独白");
    expect(CHAPTER_HOOK_TYPES).toContain("反差场景");
    expect(CHAPTER_HOOK_TYPES).toContain("未完成动作开局");
    expect(CHAPTER_HOOK_TYPES).toContain("意象预示");
  });
});

describe("CHAPTER_END_HOOK_TYPES", () => {
  it("has exactly 13 chapter-end hook types", () => {
    expect(CHAPTER_END_HOOK_TYPES).toHaveLength(13);
  });

  it("includes all thirteen chapter-end hook types", () => {
    expect(CHAPTER_END_HOOK_TYPES).toContain("突然揭示");
    expect(CHAPTER_END_HOOK_TYPES).toContain("紧急危机");
    expect(CHAPTER_END_HOOK_TYPES).toContain("未完成动作");
    expect(CHAPTER_END_HOOK_TYPES).toContain("身份反转");
    expect(CHAPTER_END_HOOK_TYPES).toContain("两难抉择");
    expect(CHAPTER_END_HOOK_TYPES).toContain("神秘物品/线索");
    expect(CHAPTER_END_HOOK_TYPES).toContain("倒计时");
    expect(CHAPTER_END_HOOK_TYPES).toContain("承诺/威胁");
    expect(CHAPTER_END_HOOK_TYPES).toContain("离奇消失");
    expect(CHAPTER_END_HOOK_TYPES).toContain("隐藏含义");
    expect(CHAPTER_END_HOOK_TYPES).toContain("意象钩子");
    expect(CHAPTER_END_HOOK_TYPES).toContain("回声钩子");
    expect(CHAPTER_END_HOOK_TYPES).toContain("留白钩子");
  });
});

describe("getVolumeOutlineTemplate", () => {
  it("returns a markdown string containing the volume number and title", () => {
    const result = getVolumeOutlineTemplate(1, "风云初起", "第1-20章");
    expect(result).toContain("卷纲_第1卷-风云初起.md");
    expect(result).toContain("第1-20章");
  });

  it("handles empty title gracefully", () => {
    const result = getVolumeOutlineTemplate(2, "", "第21-40章");
    expect(result).toContain("卷纲_第2卷.md");
    expect(result).toContain("第21-40章");
  });

  it("includes all required volume outline sections", () => {
    const result = getVolumeOutlineTemplate(1, "测试卷", "第1-10章");
    expect(result).toContain("## 核心信息表");
    expect(result).toContain("## 本卷目标");
    expect(result).toContain("## 本卷核心矛盾");
    expect(result).toContain("## 对标结构坐标");
    expect(result).toContain("## 情绪弧线");
    expect(result).toContain("## 爽点节奏表");
    expect(result).toContain("## 章节定位分布表");
    expect(result).toContain("## 人物弧线");
    expect(result).toContain("## 本卷伏笔");
    expect(result).toContain("## 本卷关键反转");
    expect(result).toContain("## 结构节点建议");
  });

  it("includes fillable placeholder content", () => {
    const result = getVolumeOutlineTemplate(1, "测试", "第1-10章");
    expect(result).toContain("[填写本卷在整体故事中的定位]");
    expect(result).toContain("[主角在本卷结束时达到什么状态]");
    expect(result).toContain("[本卷最核心的冲突/矛盾]");
    expect(result).toContain("[W形折线描述：起点→下降→回升→再降→最终回升]");
    expect(result).toContain("[主要角色在本卷的成长/变化]");
    expect(result).toContain("[本卷至少一个关键反转]");
  });

  it("includes structural coordinate table headers", () => {
    const result = getVolumeOutlineTemplate(3, "暗流", "第41-60章");
    expect(result).toContain("| 1/4 节点 |");
    expect(result).toContain("| 中点 |");
    expect(result).toContain("| 3/4 节点 |");
    expect(result).toContain("| 高潮节点 |");
  });

  it("includes the chapter range in the pleasure-point table", () => {
    const result = getVolumeOutlineTemplate(1, "", "第1-30章");
    expect(result).toContain("| 第1-30章 |");
  });

  it("includes volume beat table and timeline as required intermediate products", () => {
    const result = getVolumeOutlineTemplate(1, "风云初起", "第1-20章");
    expect(result).toContain("## 卷节拍表");
    expect(result).toContain("## 卷时间线");
    expect(result).toContain("节拍位置");
    expect(result).toContain("时间锚点");
  });
});

describe("getChapterOutlineTemplate", () => {
  it("returns a markdown string containing the chapter number and title", () => {
    const result = getChapterOutlineTemplate(5, "初入暗卫");
    expect(result).toContain("第5章-初入暗卫");
  });

  it("handles empty title gracefully", () => {
    const result = getChapterOutlineTemplate(1, "");
    expect(result).toContain("第1章");
  });

  it("includes all chapter blueprint sections", () => {
    const result = getChapterOutlineTemplate(3, "测试");
    expect(result).toContain("## 基础信息");
    expect(result).toContain("## 上层依据");
    expect(result).toContain("## 本章目标");
    expect(result).toContain("## 核心事件");
    expect(result).toContain("## 场景顺序");
    expect(result).toContain("## 爽点设计");
    expect(result).toContain("## 人物状态");
    expect(result).toContain("## 伏笔与追踪");
    expect(result).toContain("## 写作约束");
    expect(result).toContain("## AI写作提示");
    expect(result).toContain("### 旧字段（兼容）");
    expect(result).toContain("### 内容概括（五段式）");
    expect(result).toContain("### 情节安排（多线）");
    expect(result).toContain("### 人物关系和出场顺序");
    expect(result).toContain("### 情节细化");
    expect(result).toContain("### 情绪变化");
    expect(result).toContain("### 章首钩子");
    expect(result).toContain("### 本章爽点");
    expect(result).toContain("### 章尾钩子");
    expect(result).toContain("### 结尾设定");
  });

  it("includes five-segment content summary subsections", () => {
    const result = getChapterOutlineTemplate(1, "测试");
    expect(result).toContain("**起因**：");
    expect(result).toContain("**发展**：");
    expect(result).toContain("**转折**：");
    expect(result).toContain("**高潮**：");
    expect(result).toContain("**结尾**：");
  });

  it("includes multi-line plot arrangement table", () => {
    const result = getChapterOutlineTemplate(1, "测试");
    expect(result).toContain("主线推进");
    expect(result).toContain("辅线推进");
    expect(result).toContain("事件线/任务线");
    expect(result).toContain("感情线/关系线");
    expect(result).toContain("逻辑线");
  });

  it("includes ending setup table", () => {
    const result = getChapterOutlineTemplate(1, "测试");
    expect(result).toContain("收束状态");
    expect(result).toContain("未解决问题");
    expect(result).toContain("下一章推动力");
  });

  it("includes legacy compatibility fields", () => {
    const result = getChapterOutlineTemplate(1, "测试");
    expect(result).toContain("本章核心事件");
    expect(result).toContain("字数目标");
    expect(result).toContain("目标情绪");
  });

  it("includes structured node and execution constraints for chapter generation", () => {
    const result = getChapterOutlineTemplate(1, "测试");
    expect(result).toContain("## 结构节点");
    expect(result).toContain("CBN（章节起点）");
    expect(result).toContain("CPNs（推进节点）");
    expect(result).toContain("CEN（章节终点）");
    expect(result).toContain("必须覆盖节点");
    expect(result).toContain("本章禁区");
    expect(result).toContain("时间锚点");
    expect(result).toContain("章内时间跨度");
    expect(result).toContain("与上章时间差");
    expect(result).toContain("待写回设定");
  });
});

describe("type exports", () => {
  it("exports typed arrays from constants", () => {
    const field: string = VOLUME_OUTLINE_REQUIRED_FIELDS[0];
    expect(typeof field).toBe("string");
  });
});
