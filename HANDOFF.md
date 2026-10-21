# 叙册开发接手记录

> 当前集成状态（2026-10-21）：PR #10 已将 v0.5.4 纳入 main，#9 随之合并；PR #11 的角色导入与 Agent 加固、#13 的连接超时修复已随 0.5.5 发布。下文为 2026-10-20 的历史交接记录，不代表最新功能或测试计数。继续开发以最新 main、CHANGELOG 和 [协作规范](CONTRIBUTING.md) 为准，不再切换到下文的旧修复分支。

日期：2026-10-20。已接手的发布基线：0.5.0，`main` 提交 `2fb802308b6657ac9bffe3933ad968fd45e08c1b`。

## 当前工作

已从 GitHub 重新克隆并核对更新日志、关键实现、测试与 Windows CI。旧 0.2.0 工作目录不作为后续开发输入；当前修复分支为 `fix/0.5.0-handoff`。

本轮修复四项已复现问题：

1. 保存 A 尚未结束时继续编辑 B，A 完成会在 B 的防抖等待期间提前显示「已保存」，A 失败也会覆盖 B 的保存中状态。现在只有对应当前资料且没有待写编辑的保存结果才能更新状态；未改变保存队列和当前资料内容。
2. Markdown ZIP 中角色名 `CON.notes` / `LPT1.txt` 等会生成 Windows 保留设备文件名。现在按第一个句点前的名称检测，增加下划线前缀，索引和关系链接沿用同一份文件名映射。
3. 只有秘密照片覆盖时，Markdown 显式包含秘密仍会漏掉照片。现在照片与基础字段显示设置的覆盖映射到基本信息章节；默认公开导出仍排除秘密照片。
4. 大量重复长文本的完整备份会被自身压缩比限制拒绝恢复，修复流程重打包也受影响。现在只对超限条目改为不压缩保存，导出沿用恢复端容量和条目上限，保留解压限制；超限时提示分批导出。

新增 8 项回归测试；原测试 140 项和新增测试合计 148 项通过，lint、类型检查与生产构建通过。版本号保持 0.5.0，修改记录放在 CHANGELOG 的「未发布」；没有发布新安装包。

## 产品与数据边界

- Windows 本地私人角色设定集，无云端角色同步服务。
- 结构：角色 → 完整剧情版本 → 表层资料及可选秘密覆盖。身份切换改变整份档案，保持当前栏目。
- 身份卡用于角色书架和独立浮层；角色管理名与身份姓名独立。
- CoC7 数值与困难 / 极难点击展开；当前 HP / MP / SAN 独立于自动上限，身体状态与能力页共用。
- 保持 schemaVersion 2，新增字段按现有规则兼容旧库；保持 `studio.characteratlas.desktop` 与原资料路径。
- 秘密身份为叙事显示。Markdown、检索和关系图须遵循各自显式包含秘密的规则；完整备份包含全部秘密资料。
- 主题、关系图布局与阅读位置是本机偏好，不纳入角色库备份。

## 主要模块

| 入口 | 职责 |
| --- | --- |
| `src/App.tsx` | 应用状态、版本 / 身份选择、恢复导入及操作协调 |
| `src/model.ts` / `src/coc.ts` | 档案结构、验证、迁移、继承及 CoC7 规则 |
| `src/storage.ts` | IndexedDB / Tauri 存储、ZIP、图片、快照及原件保留 |
| `src/hooks/useAutosave.ts` | 400 ms 防抖、串行保存、关键操作前 flush |
| `src/batch.ts` / `src/hooks/useShelfSelection.ts` | 可见角色选择、批量修改及一步撤销 |
| `src/views/ShelfView.tsx` | 书架和多选入口 |
| `src/views/ExportMarkdownModal.tsx` / `src/export/markdown.ts` | Markdown 选项、渲染、文件名及图片导出 |
| `src/graph.ts` / `src/views/RelationshipGraphView.tsx` | 默认公开版本关系、过滤与本机布局 |
| `src/body.ts` / `src/components/BodyImport.tsx` / `src/components/BodyDiagram.tsx` | body-validator 参数、图片和部位联动 |
| `src/theme.ts` / `src/styles/themes/` | 本机主题及跟随系统 |
| `src-tauri/src/lib.rs` / `src-tauri/src/native_write.rs` | SQLite、系统对话框、路径校验、原子文件写入 |
| `.github/workflows/windows.yml` | PR / 手动触发 Windows 检查、安装包构建和原生测试 |

## 在电脑上继续

```sh
git clone https://github.com/SeverLanker/character-atlas.git
cd character-atlas
git switch fix/0.5.0-handoff
npm ci
npm run lint
npm test
npm run build
npm run dev
```

开发预览地址：`http://localhost:1420`。桌面开发另需 Rust MSVC、Visual Studio C++ Build Tools 和 Windows SDK，然后运行 `npm run desktop:dev`；安装包用 `npm run desktop:build` 或 Windows Actions 构建。

修复分支合并后，以 GitHub 最新 main 为基线继续。用旧目录工作前先查看 `git status`，保留本地修改并同步远端；不要把旧 0.2.0 源码整包覆盖到新版本。

## 已验证与后续验收

- 本轮在 Linux / Node 24.19.0 中按锁文件安装依赖并执行测试与构建。
- 0.5.0 发布前 Windows Actions [run 39360289571](https://github.com/SeverLanker/character-atlas/actions/runs/39360289571) 已成功构建安装包、执行原生存储测试并上传产物。PR #9 第一轮修复提交 `2ad4b4d` 的 Windows CI [run 39365010797](https://github.com/SeverLanker/character-atlas/actions/runs/39365010797) 已通过；新增备份修复的结果看 PR 最新检查。
- 本轮未实际启动 Windows 桌面应用，也没有可用浏览器控制工具；交互检查基于模拟 DOM / IndexedDB。不能把这些测试视作视觉验收。
- 下一次桌面验收应使用临时资料库：安装启动、连续编辑时保存状态、关闭重开、完整备份恢复、批量删除撤销、Markdown 导出解压，以及不同主题叠加秘密身份的显示。
- 本轮未打开或迁移真实用户资料库，没有将旧演示库写入用户设备。
