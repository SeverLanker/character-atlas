# Atlas Agent 接口 v1

此接口属于 0.5.3 之后的开发功能；之前交付的 0.5.3 EXE 不含本接口，需要后续重新打包。当前仓库的开发预览已可使用。

接口在叙册运行期间可用；应用是唯一的资料读写者。HTTP 请求进入当前应用，复用 `parseCatalog`、`applyCatalogImport`、`validateLibrary` 和界面的撤销历史，不直接绕过界面校验去改 SQLite。

## 连接

仅监听 IPv4 `127.0.0.1`，默认由系统分配空闲端口。启动前可设置 `ATLAS_AGENT_PORT`，用 `ATLAS_AGENT_DISABLED=1` 禁用。每次启动产生 256 位随机 token，写入连接文件，不写入日志或备份。

- Windows 桌面：`%LOCALAPPDATA%\studio.characteratlas.desktop\agent.json`。
- 本地开发预览：项目目录 `.agent/connection.json`。保持一个预览页连接；预览库和安装版库依然相互独立。
- 连接文件字段：`protocol: 1`、`url`、`token`、`pid`、`mode`。请从文件读取，勿把 token 写进公共脚本或源码。源码打包会排除 `.agent`。
- 所有请求必须带 `Authorization: Bearer <token>`。JSON 写请求使用 `Content-Type: application/json`。
- 不接受带 `Origin` 的网页跨站请求，不开放 CORS。客户端使用文件提供的 `127.0.0.1:端口` 地址。

应用未加载、没有就绪窗口或正在执行资料恢复等操作时返回 503。每次请求最长等待 30 秒；写请求超时后可用相同编号重试。传输请求体上限 64 MB；导入文本仍受 32 MB / 10000 条限制。

## 命令行

项目根目录提供 `atlas.cmd`，需要 Node.js ≥20.19。默认读取安装版连接文件；用 `--connection-file` 或 `ATLAS_AGENT_FILE` 指向开发预览连接文件。

```powershell
.\atlas.cmd stats
.\atlas.cmd catalog import --file catalog.csv --dry-run
.\atlas.cmd catalog import --file catalog.csv --request-id import-20261020-001
.\atlas.cmd catalog import --file catalog.csv --overwrite all --request-id overwrite-001
.\atlas.cmd catalog export --format csv --scope all --out catalog.csv
.\atlas.cmd catalog export --format json --world 新迦南市 --kind skill --tag 文献 --out selected.json
.\atlas.cmd catalog get 条目ID
.\atlas.cmd catalog patch 条目ID --data patch.json --request-id patch-001
.\atlas.cmd catalog delete 条目ID --request-id delete-001
.\atlas.cmd undo --request-id undo-001
.\atlas.cmd redo --request-id redo-001
```

开发预览示例：

```powershell
.\atlas.cmd stats --connection-file .agent/connection.json
.\atlas.cmd catalog import --file catalog.csv --dry-run --connection-file .agent/connection.json
```

不提供 `--request-id` 时 CLI 会生成一个编号，并写到 stderr，网络失败时自动用同一编号重试。跨次命令重试请显式使用原编号。导出文件已存在时默认拒绝覆盖，可显式加 `--force`。

## 幂等与一致性

所有写操作都必须带 `request_id`（请求体字段或 `X-Request-Id` 请求头；同时提供时必须一致）。格式：1–128 位英文字母、数字、`._:-`。

- 相同编号、相同方法 / 路径 / 参数 / 内容：返回首次成功的回执，不再执行。外层 JSON 请求对象键顺序不影响比对；text 是原文字符串，修改其内容或覆盖策略须换编号。
- 相同编号用于其他内容：409。输入修正或覆盖策略变化后应换编号。
- 资料和回执在同一个数据库事务内提交，应用重启后仍能识别已处理请求。导入的预览不占用编号。
- 撤销、重做也需要各自编号；撤销某次导入后再重试原导入编号，仍只返回原回执，**不会重新导入**。当前状态以 `/stats` 和导出结果为准。
- API 与界面共用当前应用会话的撤销栈。重启会清空撤销历史，不清空已保存的数据或请求回执。
- 请求处理期间串行写入，先保存界面尚未提交的编辑；并发界面编辑排队，成功保存后才发布接口结果到界面。资料已变化则拒绝提交，避免覆盖旧数据。

## 导入

`POST /catalog/import?dry_run=1`

```json
{"format":"csv","text":"名称,类别,等级,标签,说明\n修复,技能,精通,旧书/文献,修补纸张"}
```

`format` 接受 `csv`、`json`、`tsv`。格式、世界、别名、标签、归一化判重与逐条错误规则见 [CATALOG-FORMAT.md](CATALOG-FORMAT.md)。不支持 multipart，文件可由 CLI 读取后按文本提交。

预览返回：

```json
{"total":1,"will_add":1,"will_overwrite":0,"skipped_dup":0,"errors":[],"warnings":[],"header_notes":[],"preview_ids":["row:1"],"preview":[{"row":1,"title":"修复","status":"new","reason":"校验通过"}]}
```

`preview_ids` 是本批数据行的定位编号，不是落库条目的内部 UUID。`errors` 含 `{row,title,reason}`；`warnings` 显示未知字段等提示；`preview` 附解析后的条目。

真实导入：`POST /catalog/import`，加 `request_id`，返回 `{added,skipped_dup,overwritten,errors,warnings}`。

重名默认跳过。可指定 `overwrite: "all"`，或 `overwrite_rows: [1,3]`，仅覆盖已确认的重名行。覆盖保留原 id、名称、世界写法和创建时间，坏条跳过。一次实际变更是一项撤销记录；全跳过时不增加空撤销记录。

## 导出与读取

`GET /catalog/export?format=json|csv&scope=all|kind:skill|world:新迦南市`

- 返回原始 JSON / CSV 内容。CSV 保留 UTF-8 BOM，多行与引号规则不变。
- 附加 `kind=skill|spell|specialty|item`、`world=...`、`tag=...`、`q=关键词`、`favorite=1` 可以组合出与界面筛选相同的条件。省略 world 表示所有世界，`world=` 表示全库通用。
- 世界比对沿用归一化规则，`q` 支持空格分隔的多个词。参数值请 URL 编码。
- `GET /catalog/{id}` 返回单条完整内部字段。

## 单条修改、删除

`PATCH /catalog/{id}`：

```json
{"request_id":"patch-001","world":"新迦南市","rank":"精通","tags":["文献","修复"],"text":"修订后的说明"}
```

只接受 `world`、`rank`、`tags`、`text`；标签是字符串数组，不把 JSON 数组内的 `/` 当作分隔符。CSV/TSV 标签文本仍按原分隔规则拆分。类型、长度及重名校验照旧，未知修改字段报错。修改世界造成同键冲突时返回 409。

`DELETE /catalog/{id}`：请求体 `{"request_id":"delete-001"}`，返回 `{deleted,remaining}`。只删共享模板，角色中已复制的独立条目保留；可通过本次会话的 `/undo` 恢复。

## 撤销、重做与计数

- `POST /undo` / `POST /redo`：`{"request_id":"独立编号"}`，返回 `{action,catalog}`；没有历史时 409。
- `GET /stats`：`{characters,versions,catalog,catalog_by_kind:{skill,spell,specialty,item},can_undo,can_redo}`。

## 状态码

200 成功（导入可同时包含逐条 errors）；400 JSON 语法错误；401 未鉴权或浏览器跨站请求；404 条目 / 路由不存在；409 编号冲突、资料冲突或无历史；413 请求太大；415 Content-Type 错误；422 参数 / 校验错误；500 保存失败；503 应用未就绪、忙或存储不可用；504 超时。

开发时可运行 `node scripts/smoke-agent.mjs .agent/connection.json` 验证接口。它只创建带随机标记的临时条目并清理该 id，原条目库内容会逐项核对；测试期间请不要同时编辑资料。

实现参考：[Tauri 前端事件](https://tauri.app/develop/calling-frontend/)、[tiny_http](https://docs.rs/tiny_http/0.12.0/tiny_http/)、[getrandom 0.3](https://docs.rs/getrandom/0.3.4/getrandom/)。
