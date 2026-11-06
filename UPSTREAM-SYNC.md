# 上游同步工作流

当前同步基准：`Mochocyang/QMAI` 的 `main`，提交 `24229665`，版本 `4.3.6`。
本次同步详情见 `docs/upstream-sync-20261022.md`。

本 fork 的提交经过移植，与 upstream/main 没有共同历史。不要使用
`git merge --allow-unrelated-histories` 进行日常同步，也不要直接覆盖 Web 适配文件。

后续同步步骤：

1. 检查工作区，保存已有工作，建立同步前备份分支。
2. 执行 `git fetch upstream --prune`。
3. 以此处记录的上游提交为基准，对比最新 upstream/main，移植增量。
4. 双方都修改过的文件逐个处理，保留本 fork 的功能及其依赖；上游的“死代码清理”可能删除本 fork 仍在使用的模块。
5. 执行 `npm install`、`npm run web:build`、`npm run test:mocks`、`node scripts/web-server-smoke.mjs`。
6. 将未通过检查与未修改的上游原版对照，记录实际结果，更新此处基准及 docs/ 同步记录。

保留 Web 入口：`src/lib/web-fs.ts`、`src/lib/web-service-fs.ts`、`src/lib/http-adapter.ts`、
`src/lib/server-events.ts`、`scripts/web-dev.mjs`、`scripts/web-server.mjs`。
文件和路径操作必须保留浏览器分支，禁止直接调用 Tauri 导致 Web 运行失败。

同步 Rust 后端代码时也要审查相应的 Web 路径。原生 CLI、MCP、本机字体枚举、
系统回收站等功能依赖桌面运行时，前端构建通过不表示这些原生功能已经由 Node 服务实现。
