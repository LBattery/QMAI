# 分支级路由补丁：推演室意图

## 说明

本文档描述推演室分支（juqingtuiyanshierqi）相对于 main 分支新增的 3 个 AI 会话意图。
这些意图仅在推演室分支中生效，用于从 AI 会话跳转到剧情推演室面板。

## 新增意图列表

| 意图 ID | 名称 | 匹配关键词 | 优先级 | 行为 |
|---------|------|-----------|--------|------|
| `story_framework_generate` | 故事框架生成 | 故事框架、剧情框架、生成框架 | 10 | 跳转到推演室，phase = configuring |
| `multi_agent_simulate` | 多智能体推演 | 推演剧情、多智能体推演、剧情走向、推演一下、推演剧情走向 | 10 | 跳转到推演室，hasFramework 时 phase = simulating，否则 configuring |
| `character_interview` | 角色采访 | 角色采访、采访角色、问角色 | 10 | 跳转到推演室，hasFramework 且有 savedResults 时 phase = report-viewing，否则 configuring |

## 跳转行为

当 AI 会话识别到上述任一意图时：
1. 调用 `storySimulationStore.initWithPreset()` 预填配置
2. 切换侧栏到推演室面板（`setActiveView("storySimulation")`）
3. AI 会话回复固定提示："已为你打开剧情推演室并预填配置，请在推演室中继续操作。"
4. 不执行原意图的工具调用流程

## 注意事项

- 这 3 个意图只做跳转，不在 AI 会话中执行实际逻辑
- 属于分支级补丁，main 分支不含这些意图
- 合并回 main 时需要评估是否保留
