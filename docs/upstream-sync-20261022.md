# 2026-10-22 上游同步记录

- 原作者：Mochocyang/QMAI，远程 upstream/main。
- 本地分支：0818；同步前提交：53c90fa。
- 上次移植基准：cb42dc4f（v3.2.6）。
- 本次移植基准：24229665be97fba9a4d5a4ddf11d799505503c8b（v4.3.6，包含该版本发布后的 main 修复）。
- 备份分支：backup/0818-pre-upstream-v4.3.6-20261022。
- 采用上游增量三方移植；双方没有共同 Git 历史，没有执行无关历史合并。
- 更新保留在工作区和暂存区，未创建提交、未推送。

## 更新内容

1. 4.x 新界面、书架与自定义顶部导航、字体与字号缩放、新手引导和设置重组。
2. 卷纲和结构化章纲、可折叠 HTML、HTML 就地编辑、分批续跑、大纲共创与协议容错。
3. 大纲粘贴后自动保存、切换前 flush，写作上下文、章节记忆、人物 Skill 和文风 Skill 更新。
4. 搜索后端扩展（Gemini、百智云、Antigravity），联网搜索摘要和工作流展示改进。
5. 拆书、文风提取、角色灵魂、缓存和检索的修复与优化，以及上游依赖、Rust 后端、打包配置和资源更新。
6. 对应更新日志已同步，可在应用内查看各版本明细。

## 保留和适配的 fork 功能

- 保留 Web 启动/构建脚本、Node HTTP 文件服务、浏览器文件系统、存储、事件和路径适配。
- 新版创建、打开项目继续走 Web 文件服务；新增重命名和封面保存 Web 接口，并检查已打开项目边界。
- 保留导演室及其状态、引擎、侧栏，在新版“创作工具”补上入口。
- 保留灵感笔记、角色外貌/衣着/状态记忆，以及它们在快照、检索和上下文中的传递。
- 保留本地批量去 AI 味、拆文和剧情框架库；恢复上游当作“无人调用”删除、但本 fork 仍在使用的模块及导出。
- 人物 Skill 排在角色灵魂之后裁剪，避免挤掉人格规则；本地扩展字号用上游脚本转换为等值 rem。
- 临时验证目录 cache-temp 已加入 Git 和测试排除范围；更新同步流程及报告脚本默认基准。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| npm install --ignore-scripts --no-audit --no-fund | 完成 |
| npm run typecheck | 通过 |
| npm run web:build | 通过（存在上游已有的打包分块提示） |
| node scripts/web-server-smoke.mjs | 通过：创建、中文读写、重命名、封面保存、旧路径失效、越界拒绝、项目根目录删除拒绝 |
| 冲突专项回归 | 6 个测试文件、89 个用例全部通过 |
| npm run test:mocks（最终） | 837 个测试文件通过，4 个失败；8910 个用例通过，3 个失败，6 个 todo |
| npm run typecheck:tests | 9 处类型错误，与上游原版相同 |
| 浏览器启动 | 新版界面正常渲染，能加载原有项目和目录；验证服务受沙箱限制，对工作区外项目的自动保存被权限系统拒绝 |

完整模拟测试剩余问题均在独立的上游原版副本复现：

- src/lib/font-settings.spec.ts：上游未跟踪 docs/font-scaling-fix-20261007/font-availability.json，测试文件加载失败。
- src/components/uitest/ui-test-ai-input.spec.tsx：上游缺少 docs/ai-composer-nowrap-20261007/check-composer.mjs。
- src/hooks/use-agent-config.spec.ts：web_search 的调用断言失败。
- scripts/prepare-local-tauri-config.spec.mjs：Windows 下仓库在 D 盘、临时目录在 C 盘，命令行入口拒绝跨盘相对路径。

对照副本及详细日志均位于已忽略的 cache-temp/；未为通过检查伪造缺失资源或屏蔽上述测试。

## 运行范围

- 启动开发版：npm run web:dev。
- 启动已构建版本：npm run web:start。
- Web 仍不提供 Rust 原生 MCP 服务、原生 CLI 后端、本机字体枚举和系统回收站等桌面能力；系统回收站操作会明确提示使用文件管理器。
- 本次没有执行真实 LLM 调用或 Rust 桌面安装包编译，相关功能不在验证结论内。
