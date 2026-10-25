# Atlas Agent 接口 v1（含 v1.1 增补）

v1.1（叙册 0.5.6）全部向后兼容：原有请求写法、字段与返回结构不变，只新增接口、字段和可选写法。连接文件仍是 `protocol: 1`。

此接口从 0.5.4 起提供，Windows 安装版与开发预览均可使用。此前的 0.5.3 EXE 不含本接口。

接口在叙册运行期间可用；应用是唯一的资料读写者。HTTP 请求进入当前应用，复用 `parseCatalog`、`applyCatalogImport`、`validateLibrary` 和界面的撤销历史，不直接绕过界面校验去改 SQLite。

## 连接

仅监听 IPv4 `127.0.0.1`，默认由系统分配空闲端口。启动前可设置 `ATLAS_AGENT_PORT`，用 `ATLAS_AGENT_DISABLED=1` 禁用。每次启动产生 256 位随机 token，写入连接文件，不写入日志或备份。

- Windows 桌面：`%LOCALAPPDATA%\studio.characteratlas.desktop\agent.json`。
- 本地开发预览：项目目录 `.agent/connection.json`。保持一个预览页连接；预览库和安装版库依然相互独立。
- 连接文件字段：`protocol: 1`、`url`、`token`、`pid`、`mode`。请从文件读取，勿把 token 写进公共脚本或源码。源码打包会排除 `.agent`。
- 所有请求必须带 `Authorization: Bearer <token>`。带请求体的写请求使用 `Content-Type: application/json`；没有请求体的写请求（如用请求头传编号的 `DELETE`）不需要 Content-Type。
- Windows 上连接文件的权限收紧为仅当前用户（去掉继承权限，只授予当前账户完全控制）；Linux / macOS 为 0600。
- 不接受带 `Origin` 的网页跨站请求，不开放 CORS。客户端使用文件提供的 `127.0.0.1:端口` 地址。

应用未加载、没有就绪窗口或正在执行资料恢复等操作时返回 503。桌面版同时最多处理/排队 8 个请求、保持 32 个连接，超出立即返回 503；请求头须在连接后 10 秒内、请求体须在请求头之后 10 秒内传完，否则返回 408 并断开，名额随即释放（包括完全不发送数据的空闲连接）；写出响应总共最多 10 秒，读取残余输入最多 0.5 秒。连接数已满时只做一次非阻塞写出 503 后关闭，不会拖住接受新连接。每个连接只处理一个请求（`Connection: close`），请求体须使用 `Content-Length`，不支持分块传输（411）。应用正常退出时删除连接文件；CLI 发现文件中的 `pid` 已退出时会提示先启动叙册。每次请求最长等待 30 秒；写请求超时后可用相同编号重试。传输请求体上限 64 MB；导入文本仍受 32 MB / 10000 条限制。

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
.\atlas.cmd characters list
.\atlas.cmd characters import --file roles.json --dry-run
.\atlas.cmd characters import --file backup.zip --on-conflict copy --request-id chars-001
.\atlas.cmd catalog export --format tsv --out catalog.tsv
.\atlas.cmd undo --request-id undo-001
.\atlas.cmd redo --request-id redo-001
.\atlas.cmd catalog list --kind skill --limit 50
.\atlas.cmd catalog list --world 新迦南市 --all --out list.json
.\atlas.cmd catalog patch 条目ID --json '{"title":"新名称","kind":"spell"}' --request-id rename-001
.\atlas.cmd catalog batch --data batch.json --dry-run
.\atlas.cmd catalog batch --data batch.json --request-id batch-001
.\atlas.cmd catalog duplicates --by normalized
.\atlas.cmd catalog export --ids 条目ID1,条目ID2 --format csv --out picked.csv
.\atlas.cmd backup --out atlas-backup.zip
```

CLI 的写命令会把编号同时放进 `Idempotency-Key` 请求头和请求体；`--all` 会沿 `next_cursor` 取完全部页面后一次输出。

开发预览示例：

```powershell
.\atlas.cmd stats --connection-file .agent/connection.json
.\atlas.cmd catalog import --file catalog.csv --dry-run --connection-file .agent/connection.json
```

不提供 `--request-id` 时 CLI 会生成一个编号，并写到 stderr，网络失败时自动用同一编号重试。跨次命令重试请显式使用原编号。导出文件已存在时默认拒绝覆盖，可显式加 `--force`。

## 幂等与一致性

所有写操作都必须带请求编号，三种写法任选其一，**推荐 `Idempotency-Key` 请求头**，对所有写操作（含 `DELETE`、`/undo`、`/redo`）都适用：

- `Idempotency-Key: <编号>` 请求头（v1.1）；
- `X-Request-Id: <编号>` 请求头；
- 请求体 `request_id` 字段（原写法，继续有效）。

同时提供多个时必须一致，否则 422。**不接受查询参数**：`?request_id=` 会返回 422，并提示改用请求头或请求体。格式：1–128 位英文字母、数字、`._:-`。

预览 `dry_run` 同样有两种写法：查询参数 `?dry_run=1`，或请求体 `"dry_run": true`（v1.1）。两处都写时必须一致。只有 `POST /catalog/import`、`POST /characters/import`、`PATCH /catalog`（批量）支持预览，其余接口带 `dry_run` 返回 422。预览不需要编号。

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

真实导入：`POST /catalog/import`，加 `request_id`，返回 `{added,skipped_dup,overwritten,unchanged,errors,warnings}`。覆盖结果与原条目完全相同的重名行计入 `unchanged`（预览中同样返回 `unchanged`），不算覆盖，也不产生撤销记录。

重名默认跳过。可指定 `overwrite: "all"`，或 `overwrite_rows: [1,3]`，仅覆盖已确认的重名行。覆盖保留原 id、名称、世界写法和创建时间，坏条跳过。一次实际变更是一项撤销记录；全跳过时不增加空撤销记录。

## 角色导入与列表

`POST /characters/import?dry_run=1`，正式导入去掉 `dry_run` 并带 `request_id`（幂等规则同上）。

```json
{"format":"json","text":"<角色 JSON>","on_conflict":"skip"}
{"format":"zip","data_base64":"<叙册备份 ZIP 的 Base64>","on_conflict":"copy"}
```

- `text` 可以是完整资料库（`{schemaVersion, characters}`）、角色数组或单个角色对象，与界面“追加导入”相同；只导入角色，忽略其中的共享条目库。
- JSON 不能携带图片：除 `builtin:0–2` 外的图片引用逐个报错，请改用备份 ZIP。ZIP 中的图片在正式导入时以新文件名复制并重写引用，未知或路径穿越的 ZIP 条目会被跳过，限制同恢复备份（单图 12 MB、压缩比、条目数）。
- `on_conflict`：库中已有同一角色 id 时的处理，`skip`（默认）、`replace`（原位替换）或 `copy`（生成新 id 追加）；新 id 直接添加。角色之间的关联编号随复制一起重映射。
- 校验按 schema 2 逐个角色进行，坏角色不影响其他角色，`errors` 为 `[{index,id,name,reason}]`，`reason` 指出字段或“角色 / 版本 / 表层或秘密档案”路径。JSON 文本上限 32 MB，ZIP 上限 48 MB，单次最多 2000 个角色。
- 预览返回 `{total,errors,will_add,will_replace,will_copy,will_skip,characters:[{id,name,status}]}`；正式导入返回 `{total,errors,added,replaced,copied,skipped,characters}`，`characters[].id` 为实际保存的 id（copy 为新 id）。
- 秘密档案可以导入，但任何响应都不回显秘密字段。

`GET /characters` 只返回公开字段：`{characters:[{id,name,collection,versions}]}`。

## 列表（v1.1）

`GET /catalog?kind=&world=&tag=&tags=a,b&tag_mode=any|all&q=&favorite=1&ids=a,b&limit=100&cursor=`

```json
{"total":170,"items":[{"id":"…","kind":"item","title":"…","rank":"","tags":["…"],"world":"新迦南市","favorite":false,"source":"…","sourceId":"D-32","updatedAt":"2026-10-21T…Z"}],"next_cursor":"…"}
```

- 轻量字段，不含 `text` 与 `extra`；完整内容用 `GET /catalog/{id}`。没有来源时省略 `source` / `sourceId`。
- `limit` 1–1000，默认 100。`next_cursor` 是本页最后一条的 id，把它作为下一次的 `cursor`；为 `null` 表示已到末尾。游标不受其他位置的新增和删除影响；该条目被删除或不再匹配筛选时返回 422，请从头列出。
- 筛选与导出相同：`tag` 是单个标签（原写法），`tags` 是逗号分隔的多个标签，`tag_mode=any`（默认，任一）或 `all`（全部）。`q` 也会匹配 `source`、`sourceId`。
- 顺序为库内顺序（收录顺序）。

## 重名查询（v1.1）

`GET /catalog/duplicates?by=normalized|name&kind=&world=`

- `by=normalized`（默认）：与导入判重相同（世界 + 类别 + NFKC、空格归一的名称）。`by=name`：世界、类别、名称逐字相同。
- 返回 `{by,groups:[{kind,world,title,ids,titles}],group_count,entry_count}`；只含 2 条以上的组。可在导入前先查。

## 导出与读取

`GET /catalog/export?format=json|csv|tsv&scope=all|kind:skill|world:新迦南市`

- 返回原始 JSON / CSV 内容。CSV 保留 UTF-8 BOM，多行与引号规则不变。
- 附加 `kind=skill|spell|specialty|item`、`world=...`、`tag=...`、`tags=a,b`、`tag_mode=any|all`、`q=关键词`、`favorite=1`、`ids=id1,id2`（v1.1，只导出这些条目，按库内顺序）可以组合出与界面筛选相同的条件。省略 world 表示所有世界，`world=` 表示全库通用。
- 世界比对沿用归一化规则，`q` 支持空格分隔的多个词。参数值请 URL 编码。
- CSV / TSV 导出：有条目带来源时追加「来源」「来源编号」列；`extra` 中的键追加为列，导入时这些列会回到 `extra`。
- `GET /catalog/{id}` 返回单条完整内部字段。

## 整库备份（v1.1）

`GET /backup` 返回 `application/zip`，内容与界面「设置 → 导出完整备份」相同（角色、全部版本、**秘密档案**及上传图片），可在设置中恢复。备份含秘密档案，请妥善保存；超过 48 MB 时返回 413，请在界面导出。仅桌面版和开发预览的已连接页面可用。

## 单条修改、删除

`PATCH /catalog/{id}`：

```json
{"request_id":"patch-001","world":"新迦南市","rank":"精通","tags":["文献","修复"],"text":"修订后的说明"}
```

可改字段：`title`（名称）、`kind`（类别）、`world`、`rank`、`tags`、`text`、`source`、`sourceId`、`favorite`。`title` 与 `kind` 从 v1.1 起可改，**id 不变**，外部按 id 的引用不会失效。标签是字符串数组，不把 JSON 数组内的 `/` 当作分隔符。CSV/TSV 标签文本仍按原分隔规则拆分。类型、长度校验照旧；`source` / `sourceId` 传空字符串表示清除。未知字段报 422，错误里字段名中英对照，如 `不支持修改字段：name（可改：title（名称）、kind（类别）…）`。

改名、改类别或改世界后若与其他条目同键（世界 + 类别 + NFKC、空格归一名称）重名，返回 409，不修改：

```json
{"error":"修改后与同世界、同类别条目「夜見」重名（按 NFKC、空格归一比较），未修改","conflict_id":"另一条的 id"}
```

`DELETE /catalog/{id}`：编号放 `Idempotency-Key` 请求头（推荐，可不带请求体）或请求体 `{"request_id":"delete-001"}`，返回 `{deleted,remaining}`。

## 批量修改（v1.1）

`PATCH /catalog`（预览：`?dry_run=1` 或请求体 `"dry_run": true`）

```json
{"filter":{"world":"新迦南市","kind":"item"},"set":{"world":"新迦南市","source":"08-秘学/目录.md"},"add_tags":["已校"],"remove_tags":["待查"]}
```

- `filter` 与列表筛选字段相同（`kind`、`world`、`tag`、`tags`、`tag_mode`、`q`、`favorite`、`ids`）。筛选为空会改动整库，必须显式写 `"all": true`。
- `set` 可设 `world`、`rank`、`source`、`sourceId`、`favorite`；名称和类别请逐条 `PATCH`。`add_tags` / `remove_tags` 为字符串数组。
- 返回 `{matched,updated,ids}`（预览为 `{dry_run:true,matched,will_update,ids}`）。内容没有变化的条目不计入 `updated`，也不改 `updatedAt`。
- 整批是**一个撤销步骤**。任何一条修改后会与其他条目重名时整批拒绝（409，带 `conflicts:[{id,conflict_id}]`），不做部分修改。只删共享模板，角色中已复制的独立条目保留；可通过本次会话的 `/undo` 恢复。

## 撤销、重做与计数

- `POST /undo` / `POST /redo`：编号放 `Idempotency-Key` 请求头或请求体 `{"request_id":"独立编号"}`，返回 `{action,catalog}`；没有历史时 409。
- 接口的撤销 / 重做只跨越 Agent 自己产生的状态：栈顶（或下一步重做）是界面修改时返回 409，界面编辑请在界面中撤销。v1.1 起此 409 带说明：`{"error":"…","blocked_by":"ui","top_action":{"kind":"catalog_update|character_update|library_update","at":"ISO 时间或 null"},"agent_undo_depth":0,"agent_redo_depth":0}`。
- `GET /stats`：`{characters,versions,catalog,catalog_by_kind:{skill,spell,specialty,item},can_undo,can_redo}`，v1.1 增加：
  - `undo_depth` / `redo_depth`：整个会话撤销栈（含界面修改）的步数；
  - `agent_undo_depth` / `agent_redo_depth`：**接口现在能连续撤销 / 重做几步**（到遇到界面修改为止）。批量撤销前先看这个值，避免撤过头；
  - `catalog_by_world`：`{"新迦南市":170,"":3}`，空字符串表示全库通用，同一世界的不同写法按归一化合并；
  - `tags`：`[{"tag":"战斗","count":12}]`，按次数降序。

## 审计日志（v1.1，桌面版，可选）

在「资料库设置」中勾选「记录 Agent 接口审计日志」后，每个写请求（及 `/backup`）在应用数据目录追加一行到 `audit.jsonl`：`{time(毫秒),method,endpoint,query_keys,request_id,status,ids}`。不记录 token、请求体、条目内容和查询参数的值；超过 10 MB 时轮换为 `audit.1.jsonl`。默认关闭。

## 未提供

- 大批量导入的进度事件（`GET /jobs/{request_id}` / SSE）暂未提供；10000 条导入在桌面版通常数秒完成，请求最长等待 30 秒，超时可用相同编号重试读取回执。

## 状态码

200 成功（导入可同时包含逐条 errors）；400 JSON 语法错误；401 未鉴权或浏览器跨站请求；404 条目 / 路由不存在；409 编号冲突、重名冲突（带 `conflict_id`）、资料冲突或无历史（带 `blocked_by`）；413 请求或备份太大；415 Content-Type 错误；422 参数 / 校验错误；500 保存失败；503 应用未就绪、忙或存储不可用；504 超时。

开发时可运行 `node scripts/smoke-agent.mjs .agent/connection.json` 验证接口。它只创建带随机标记的临时条目并清理该 id，原条目库内容会逐项核对；测试期间请不要同时编辑资料。

实现参考：[Tauri 前端事件](https://tauri.app/develop/calling-frontend/)、[tiny_http](https://docs.rs/tiny_http/0.12.0/tiny_http/)、[getrandom 0.3](https://docs.rs/getrandom/0.3.4/getrandom/)。
