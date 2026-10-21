# 叙册 · Character Atlas

Windows 本地优先的私人原创角色设定集。界面为精致画册，数据结构为「角色 → 完整剧情版本 → 通用表层 / 可选秘密档案」。无需账号、无需云端服务。

## 安装使用

在 [GitHub Releases](https://github.com/SeverLanker/character-atlas/releases/latest) 下载 Windows 64 位安装包，适用于 Windows 10 / 11。运行安装程序后即可打开「叙册」，使用软件不需要安装开发工具。主线的未发布改动请参阅 CHANGELOG，不等同于已发布安装包的功能。

首次使用可阅读 `QUICKSTART.zh-CN.md`。打开演示角色「林弥」，呼出身份卡后点击照片，可以触发整份监狱档案切换。

独立 HTML 预览里的资料，可以先导出完整 ZIP 备份，再在桌面软件中恢复。

## 当前功能

- 角色书架、世界观分组、搜索、收藏与列表 / 网格视图。
- 书架展示身份卡，进入角色后提供四个栏目：详细档案、属性与技能、收藏与影像、身体状态。
- 身份卡与详细档案共享基础资料；可随时呼出身份卡，添加自定义档案字段。
- 完整剧情版本的创建、复制、命名、备注、切换与删除。复制后各版本独立编辑。
- 可选秘密身份；可选择姓名、照片或徽记触发，切换整本档案。当前栏目保持不变。
- 秘密资料逐字段 / 按资料组沿用表层，独立内容可明确留空，也能恢复沿用。
- 默认精致画册；秘密档案提供监狱档案、暗色密卷与研究记录三种主题。
- 上传角色照片、物品图片与设定图；图片保存在本地，可在多个版本中复用。
- 可点击的身体部位示意图与手动状态记录，随完整剧情版本保存。
- 自动保存、完整 ZIP 备份与恢复；备份包含已关闭秘密身份的内容和图片。
- 首次打开提供三个可编辑 / 可删除的演示角色。

## 开发接手

当前开发基线、模块入口和验证边界见 [HANDOFF.md](HANDOFF.md)，更新内容见 [CHANGELOG.md](CHANGELOG.md)。继续修改前先同步仓库最新分支，避免使用早期 0.2.0 工作目录覆盖新版。

协作和发布遵循 [CONTRIBUTING.md](CONTRIBUTING.md)：改动走 PR，合入 main 后才能从主线发布。Agent 接口与 CLI 用法见 [AGENT-API.md](AGENT-API.md)。

## Windows 构建

准备：

1. 安装 Node.js 20.19+ 或 22 LTS：<https://nodejs.org/>。
2. 安装 Rust stable（MSVC，最低 1.90）：<https://rustup.rs/>。
3. 安装 Visual Studio Build Tools，勾选「使用 C++ 的桌面开发」及 Windows SDK：<https://visualstudio.microsoft.com/visual-cpp-build-tools/>。
4. 关闭并重新打开终端，使新安装的工具进入 PATH。

在项目目录双击 `build-windows.cmd`。脚本会安装依赖、执行检查并构建 NSIS 安装包。

安装包输出位置：

```text
src-tauri/target/release/bundle/nsis/*.exe
```

也可以手动运行：

```powershell
npm install
npm run lint
npm test
npm run desktop:build
```

安装后使用软件不需要 Node.js 或 Rust。Windows 需要 Microsoft Edge WebView2；安装程序会在缺失时下载运行时。首次安装运行时可能需要联网，此后软件本身完全离线使用。

可选：仓库内附 `.github/workflows/windows.yml`，可以在自己的 GitHub 仓库手动触发构建并下载安装包。不会自动创建发布或上传角色资料。

## 本地开发与界面预览

交付目录中的 `叙册-本地预览.html` 是同一套前端的独立离线预览，可直接用 Windows 上的 Edge / Chrome 打开，不需要安装 Node.js。其资料由浏览器保存；更换浏览器或移动文件后，资料可能不共用，请通过 ZIP 备份迁移。正式桌面版则使用 SQLite。

```text
npm install
npm run dev
```

浏览器访问 <http://localhost:1420>。浏览器预览使用 IndexedDB，数据与桌面应用的 SQLite 资料库分别保存。可以用完整备份在两种运行方式之间迁移。

启动桌面开发窗口：

```text
npm run desktop:dev
```

## 数据与备份

支持在“本地资料库 → 追加导入角色”中导入角色库 JSON 或完整 ZIP，预览并处理同 ID 冲突。书架提供“跨角色内容检索”，默认只搜索明档，勾选后可搜索已启用秘密档案的覆盖内容。字段格式、枚举和可导入样例见 [SCHEMA.md](SCHEMA.md)。

Windows 默认资料库：

```text
%LOCALAPPDATA%/studio.characteratlas.desktop/library/
  library.sqlite
  assets/
  backups/
```

可在「本地资料库」设置中将资料库复制到自选空文件夹；切换完成后，下次启动继续读取新位置。原位置保留，不自动删除。外接设备上的资料库需要保持设备可访问。

数据库使用 SQLite 事务、完整同步写入；图片先写入临时文件，再替换目标文件。桌面关闭时会等待最后一次保存完成。每约 30 分钟有更改时保留一次此前数据库快照，最多 10 份。快照依赖当前 assets 文件夹，不能替代包含全部图片的 ZIP 备份。

在设置中「导出完整备份」获得 ZIP；「恢复备份」会先检查格式和图片完整性，确认后替换当前资料库。恢复时为导入图片生成新编号，避免提交失败时覆盖原图片。恢复前建议导出当前资料。

秘密身份是叙事展示功能，不是加密。备份包含秘密内容。

## 项目结构

```text
src/model.ts              类型、版本复制、继承与资料验证
src/storage.ts            IndexedDB / Tauri 存储与完整备份
src/App.tsx               应用状态与操作流程
src/views/                Modal、ShelfView 书架、LibrarySettingsModal 资料库设置、RelationshipGraphView 关系图
src/graph.ts              关系图数据、筛选与确定性布局
src/hooks/                useAutosave 防抖保存队列、useAppKeyboard 快捷键
src/components/BookPages.tsx 画册各栏目与身体图
src/components/Editor.tsx   内容、版本与秘密身份编辑
src-tauri/src/lib.rs      SQLite、图片、本地路径和备份命令
src/domain.test.ts        核心模型测试（Vitest）
src/backup.test.ts        ZIP 校验测试
```

角色模型与自由拖拽排版暂未加入；当前主题使用可维护的固定页面组件和主题样式。

## 交付状态

已生成 Windows x64 程序及 NSIS 安装包，另提供独立离线 HTML 预览和完整源码。前端、桌面编译及测试范围见 `VERIFICATION.md`。正式发布安装包由 GitHub Actions 的 Windows 环境构建并执行原生存储测试；尚未完成本机真实 Windows 桌面的安装与视觉验收。

## 0.2.0 交互与资料升级

书架以默认剧情版本的表层身份卡呈现角色，打开后直接进入详细档案。阅读工具栏可呼出身份卡，点击配置的照片、姓名或徽记时，卡片及整本档案一同切换；关闭卡片后继续阅读原章节。角色管理名独立于档案姓名。

属性与数值技能采用 CoC 第七版：八项属性、常规 / 困难 / 极难、完整调查员表技能与现代技能、专长、基础值与重点筛选。困难与极难在点击数值后展开。闪避基础为 DEX 的一半向下取整，母语基础为 EDU；技能值留空时随基础变化，填写后保持独立。旧版自定义属性和叙事技能完整保留。

HP 上限为 (CON + SIZ) / 10 向下取整，MP 上限为 POW / 5 向下取整，SAN 上限为 99 − 克苏鲁神话。移动率结合 STR、DEX、SIZ 与数字年龄；伤害加值和体格根据 STR + SIZ 分段计算。所有衍生值可手动覆盖。HP、MP、SAN 当前值与上限分别保存，修改属性不恢复当前值；能力页和身体状态页共用当前值。幸运由作者手动填写。

规则与技能基础值参考 [Chaosium 官方调查员角色表](https://www.chaosium.com/cthulhu-character-sheets/)，采用独立排版；本软件并非官方产品，不附带骰点、职业点分配或完整规则书。初始属性默认 50，用于填写占位，不代表随机创建完成的人物。

支持选择默认展示版本、快速复制为新阶段、隐藏空字段及手动隐藏基础身份字段。撤销 / 重做最多保存本次打开期间的 40 个编辑步骤，连续输入合并；重启后历史清空，资料本身保留。文本框中的 Ctrl+Z 保留系统文本撤销，阅读界面可用 Ctrl+Z / Ctrl+Y 撤销或重做档案编辑。

读取 0.1.0 资料及 ZIP 时自动升级为 schema 2，保留旧属性、叙事能力、图片和已关闭的秘密档案。升级前导出一份 ZIP 可保留旧版可读副本；升级后备份需使用 0.2.0 或更新版本读取。

## body-validator 人体图（可选）

身体状态页可以显示 [body-validator](https://github.com/SeverLanker/body-validator) 角色的人体图，并在上面叠加可点击的部位热区。

1. 在 body-validator 里保存角色，得到 `characters/<id>.json`（bodyval.character/1–3）。
2. （可选）导出正面图。叙册本身**不运行 Godot**，请在 body-validator 仓库里执行：
   ```bash
   cd body-validator/godot
   xvfb-run -a -s "-screen 0 1280x720x24" godot --path . --rendering-driver opengl3 \
     -s res://scripts/export_lineup.gd -- --chars <id> --view front --clay --guides none --width 800 \
     --out <输出目录>/<id>_front.png
   ```
   在 Windows / macOS 桌面上可以去掉 `xvfb-run` 那一段。导出图带标尺和底色；建议先裁到只剩人物，画面比例约 2:3，人物从上到下占满约 94% 的高度，这样热区最准。背面图可以用 `--view side` 或其他导出方式自己准备。
3. 叙册：编辑档案 →「身体状态」栏 →「体型与人体图（body-validator）」，选 JSON，可附正 / 背面 PNG，点「导入 body-validator 角色」。
4. 阅读页的身体状态：有图就显示图，没有图就用内置剪影。热区会按体型、头身比和腿长调整位置。有记录的部位按状态级别着色，点部位会筛选对应的状态记录，再点一次取消。
5. 在秘密档案里导入，会整体覆盖表层体型；点「沿用表层体型」可以恢复。

图片保存在本地资料库，并包含在完整 ZIP 备份里。

## Markdown 导出

- 档案页「导出 Markdown」：导出当前角色为 .md（可选当前版本 / 所有版本）。
- 设置 →「导出整库 Markdown」：导出 ZIP，含每个角色的 .md、index.md 与 assets/ 图片，可直接放进 Obsidian。
- 默认只导出公开层；勾选「包含秘密身份」后秘密内容以独立章节明文输出，**不是加密**，分享前请确认。

## 外观主题

设置 →「外观主题」可在四套界面主题间切换：林间档案（默认）、夜读（深色）、採风宣纸、档案局。勾选「跟随系统深浅色」后，系统深色时自动使用夜读。主题只保存在本机浏览器 / 桌面端的本地偏好里，不会写入角色资料或备份；角色自己的秘密身份主题（监狱 / 黑档 / 临床）不受影响。

开发说明：颜色、字体、圆角等 token 在 `src/styles/tokens.css`；每个主题是 `src/styles/themes/<id>.css`，只能写 `[data-theme="<id>"]` 下的规则（有测试约束）。默认主题不设 `data-theme`。

## 批量操作

书架右上角点「多选」（或 Ctrl/Cmd+点击任意卡片）进入多选：点击卡片勾选，Shift+点击连选，「全选当前结果」只选当前搜索 / 筛选下可见的角色。选择只保留当前可见的角色，搜索或筛选变化后，看不到的会自动取消选择。可以批量收藏、移到分组、导出所选为 Markdown 或备份 ZIP、删除。删除会二次确认，并且可以用「撤销」一次恢复。按 Esc 或「完成」退出。



条目库独立导入导出及批量填写格式见 [CATALOG-FORMAT.md](CATALOG-FORMAT.md)。

本机 Agent HTTP 接口与 CLI 用法见 [AGENT-API.md](AGENT-API.md)。
