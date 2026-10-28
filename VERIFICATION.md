# 验证记录

## 2026-10-28 简洁身份卡与多类型证件夹（当前未发布实现）

- 在同一 PR #24 / `codex/identity-card-art` 中按最新反馈替换上轮详细身份卡方案。基线仍为 `main c0c19c7`（0.5.6）。七种模板、同类型多张、独立字段和照片、公开 / 秘密整组覆盖、剧情版本快照；`Profile.documents` 为 schema 2 的可选扩展。
- 全量 43 个测试文件 / 235 项通过；lint、TypeScript、Vite 构建及 `git diff --check` 通过。Vite 主 JS 体积提示仍存在。
- 回归范围：旧库未写入时的身份证预览、空证件组、隐藏资料初始化、重复类型与唯一 ID、复制版本隔离、导入字段 / 类型 / 图片引用校验、独立照片备份往返与恢复换名、公开导出和检索排除秘密资料。
- 真实 App 组件流程：添加两张学生证、复制、编辑化名、更换类型保留字段、删除撤销、秘密单独修改、恢复沿用、实际 IndexedDB 保存及读取。
- 隔离 Chromium + 合成资料：七模板逐一截图，简洁书架不展示完整地址；四套应用主题 × 五窗口宽度（1440 / 900 / 600 / 390 / 360）共 20 组证件文字布局检查，长外文姓名不溢出；秘密切换、Esc 关闭、刷新后编辑保留通过，无页面脚本错误。
- 新字段接入资料健康检查所共用的 `assetRefs`；Markdown 仅导出当前证件类型的可见字段，完整 ZIP 保留全部已存字段。使用说明见 [DOCUMENTS.md](DOCUMENTS.md)。
- 本机未做 Windows WebView2 安装与原生测试；Windows 自动检查以 PR #24 最新提交为准。本轮未合并主线、未发布安装包。

## 2026-10-28 第一轮身份卡视觉检查（aa126fb，方案已由证件夹替代）

- 基于最新 `origin/main` 提交 `c0c19c7`（0.5.6），任务分支 `codex/identity-card-art`，PR #24。版本号与 schema 2 不变，无数据迁移。
- Linux / Node 24：41 个测试文件、225 项测试通过；lint、TypeScript 与 Vite 构建通过。Vite 保留主 JS 超过 500 kB 的体积提示。
- 新增回归验证：新增字段遵循隐藏 / 空值规则，兼容缺省居住地；书架不泄露秘密身份，浮动卡整份切换登记资料及返回公开身份。
- 隔离 Chromium + 合成资料：四主题 × 五种宽度（1440 / 1050 / 800 / 390 / 360）× 网格 / 列表，共 40 组实际布局检查。核对长姓名、连续英文别名、长编号、长地址及空资料的文字区域和页面没有横向溢出，24 次公开 / 秘密切换通过，无页面脚本错误。应用既有最小宽度为 360 px。
- 查看桌面及窄屏截图，并检查低高度窗口滚动后的关闭按钮与 Esc。真实 Windows WebView2、安装及原生 Rust 测试本轮未在本机执行；最新 Windows 自动检查以 PR #24 为准。未发布安装包。

> 上轮（2026-10-25）的功能与规模检查记录见 [IMPROVEMENTS.md](IMPROVEMENTS.md)。下文保留原日期与提交，属于历史验证记录；最新 Windows 结果以对应 PR 检查为准。

验证日期：2026-10-20。当前版本：0.5.0。

## 2026-10-20 接手复核（0.5.0 基线及未发布修复）

- 基线：`main` 的 `2fb802308b6657ac9bffe3933ad968fd45e08c1b`；独立克隆并按 package-lock.json 执行 npm ci。
- 本轮环境：Linux、Node 24.19.0、npm 11.9.0。原版 28 个测试文件 / 140 项全部通过，lint 和生产构建通过。
- 核对更新日志中的书架批量操作、四套主题、Markdown、默认公开版本关系图、body-validator、原生保存对话框、ZIP 限制及防抖自动保存，均存在实现与对应测试。
- 新增回归检查复现四类问题：旧保存任务覆盖新编辑的状态；带扩展名的 Windows 设备名未清洗；仅覆盖秘密照片时 Markdown 漏掉照片；重复长文本导出备份无法被自身恢复。修复后 28 个测试文件 / 148 项通过，lint、TypeScript 和生产构建通过。
- Windows 发布前核实：[Actions run 39360289571](https://github.com/SeverLanker/character-atlas/actions/runs/39360289571) 对 0.5.0 发布分支提交 `9447895` 的安装包构建、原生测试和产物上传均成功。这是历史 CI 结果，本轮没有本机重跑 Rust 或进行真实 Windows 安装验收。
- PR #9 第一轮修复提交 `2ad4b4d` 的 Windows [run 39365010797](https://github.com/SeverLanker/character-atlas/actions/runs/39365010797) 已完成，检查、安装包构建、原生测试和上传产物均成功；新增备份修复的 Windows 结果以 PR 最新检查为准。
- 修改放在 `fix/0.5.0-handoff` 分支，保持 schema 2、原资料目录和版本号 0.5.0；尚未发布新版安装包。接手说明见 [HANDOFF.md](HANDOFF.md)。

## 0.5.0 发布前验证（原记录）

- `npx tsc -b`：TypeScript 全量检查通过。
- `npm run lint`：ESLint 0 错误。
- `npm test`（Vitest）：28 个测试文件、140 项全部通过；Node 20.19 与 Node 22 各跑一遍均通过。
  - 覆盖核心模型、CoC、撤销、自动保存、ZIP 校验与解压限制、恢复、追加导入、关系跳转与关系图、人体图、Markdown 导出、应用主题、原生写入调用方式、书架多选与批量操作、检索、版本对比、身份卡切换、桌面关闭等。
- `npx vite build`：生产构建通过。
- 原生存储与写入加固测试（`cargo test --lib`，15 项）：本地 Linux（rustc stable 1.99）通过，并由 GitHub Actions `windows.yml` 在 Windows 上执行。

## 交付文件

- Windows 64 位安装包：由 `windows.yml` 构建产物下载（`CharacterAtlas-0.5.0-Windows-x64-setup.exe`），不再提交进仓库。
- `deliverables/叙册-本地预览.html`：独立浏览器离线预览，包含脚本、样式与演示图片。
- `deliverables/character-atlas-source.zip`：最终源码、测试、依赖锁文件、Windows 构建脚本和说明。
- `QUICKSTART.zh-CN.md`：0.5.0 操作说明。
- `deliverables/SHA256SUMS.txt`：交付文件 SHA-256 校验值。

## 验证边界

- 尚未在真实 Windows 桌面上执行安装、启动或视觉检查。Wine 原生测试不能替代真实桌面验证。
- 当前会话无可用浏览器控制工具，界面交互通过模拟 DOM / IndexedDB 验证。
- 安装包未代码签名。
- 交叉编译产生 Microsoft CRT 调试符号缺失的 LNK4099 警告，发布程序、安装包与原生测试均成功生成。
- Windows 需要 WebView2，缺失时安装程序会下载运行时；应用日常使用无需联网。
- 撤销历史仅保存在本次应用内存中，最多 40 步。schema 2 备份需要 0.2.0 或更新版本读取。
