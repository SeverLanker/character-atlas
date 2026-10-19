# 验证记录

验证日期：2026-10-20。当前版本：0.4.0（含未发布的工程维护改动，见 CHANGELOG）。

## 已通过（本次重跑）

- `npx tsc -b`：TypeScript 全量检查通过。
- `npm run lint`：ESLint 0 错误。
- `npm test`（Vitest）：20 个测试文件、72 项全部通过；Node 20.19 与 Node 22 各跑一遍均通过。
  - 含原 `tests/domain.test.mjs` 的 6 项核心模型测试（已迁移为 `src/domain.test.ts`，断言不变）。
  - 新增 `src/autosave.test.tsx` 3 项：防抖只写最后一份、flush 立即写入、卸载时不丢待写内容。
  - 其余为 CoC、撤销、ZIP 校验、恢复、追加导入、关系跳转、检索、版本对比、身份卡切换、桌面关闭等流程测试。
- `npx vite build`：生产构建通过。
- Windows 原生存储测试（`cargo test --lib`，4 项）由 GitHub Actions `windows.yml` 执行；本次本地沙箱 rustc 1.85 低于依赖要求（1.87），未在本地运行。

## 交付文件

- Windows 64 位安装包：由 `windows.yml` 构建产物下载（`CharacterAtlas-0.4.0-Windows-x64-setup.exe`），不再提交进仓库。
- `deliverables/叙册-本地预览.html`：独立浏览器离线预览，包含脚本、样式与演示图片。
- `deliverables/character-atlas-source.zip`：最终源码、测试、依赖锁文件、Windows 构建脚本和说明。
- `QUICKSTART.zh-CN.md`：0.4.0 操作说明。
- `deliverables/SHA256SUMS.txt`：交付文件 SHA-256 校验值。

## 验证边界

- 尚未在真实 Windows 桌面上执行安装、启动或视觉检查。Wine 原生测试不能替代真实桌面验证。
- 当前会话无可用浏览器控制工具，界面交互通过模拟 DOM / IndexedDB 验证。
- 安装包未代码签名。
- 交叉编译产生 Microsoft CRT 调试符号缺失的 LNK4099 警告，发布程序、安装包与原生测试均成功生成。
- Windows 需要 WebView2，缺失时安装程序会下载运行时；应用日常使用无需联网。
- 撤销历史仅保存在本次应用内存中，最多 40 步。schema 2 备份需要 0.2.0 或更新版本读取。
