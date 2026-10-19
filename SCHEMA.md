# 叙册角色库格式（schemaVersion 2）

当前以 `src/model.ts`、`src/coc.ts` 和对应校验函数为准。以下字段使用 JSON 类型；`?` 表示可省略。推荐所有 `id` 使用 `crypto.randomUUID()`，时间使用 ISO 8601 字符串。同名不等于同一个角色，角色身份由 `id` 区分。

## 文件与导入

- `.json`：根对象为 `Library`，支持 UTF-8 BOM。适合文字和内置照片，追加导入最大 32 MB。
- `.zip`：根目录必须有 `library.json`；上传图片放在 `assets/文件名`，格式与完整备份相同。压缩包最大 256 MB，解压检查上限 512 MB，单张引用图片最大 12 MB。
- JSON 中引用了外部图片时，追加导入要求使用包含图片的 ZIP，不会把同名本地图片当作导入图片。
- `schemaVersion: 1` 仍可读取并迁移为 2。不要省略已有 `coc` 中的必填字段；未提供整个 `coc` 时，程序会从旧自定义属性迁移或生成默认值。
- 追加导入：相同角色 ID 默认跳过，可选择整角色替换或独立副本；同名不同 ID 独立添加。副本重新生成角色、版本和内部条目 ID。
- 共享模板：同 ID 同内容跳过；同 ID 不同内容生成新编号并保留双方。替换角色不会自动替换共享模板。

## 根对象、角色和版本

```ts
interface Library {
  schemaVersion: 1 | 2;
  characters: Character[]; // 最多 10000 个，角色 ID 不可重复
  catalog?: CatalogEntry[]; // 最多 10000 项，模板 ID 不可重复
}
interface Character {
  id: string;
  name: string; // 管理名，与档案姓名分别维护
  collection: string; // 世界观或分组
  favorite: boolean;
  accent: string; // 建议使用 #RRGGBB
  versions: Version[]; // 至少一个，角色内的版本 ID 不可重复
  defaultVersionId?: string; // 如填写必须指向该角色的现有版本
  createdAt: string;
  updatedAt: string;
}
interface Version {
  id: string;
  name: string;
  date: string; // 可使用叙事时间文字
  note: string;
  profile: Profile;
  secret: Secret;
  createdAt: string;
  updatedAt: string;
}
```

版本是完整快照，编辑某个版本不会自动更新其他版本。`name` 与 `date` 不负责排序或唯一性。

## 基础身份 Basics

以下字段值均为字符串。除两个新字段可省略外，其余均必填，未填写用 `""`，不要用 `null` 或数字。

| 键 | 界面名称 | 说明 |
|---|---|---|
| name | 姓名 | 角色在该档案中的姓名 |
| alias | 别名 | 自由文本 |
| age | 年龄 | 如 `"24"`；数字年龄参与 CoC 移动率计算 |
| gender | 性别 | 自由文本 |
| species | 族裔 | 保留历史键名 species，界面已改称族裔 |
| occupation | 身份 / 职业 | 自由文本 |
| affiliation | 所属 | 组织等 |
| height | 身高 | 如 `"167 cm"` |
| weight | 体重 | 如 `"49 kg"` |
| blood | 血型 | 自由文本 |
| birthday | 生日 | 自由文本 |
| birthplace | 出生地 | 自由文本 |
| residence? | 居住地 | 省略时迁移补空字符串 |
| measurements? | 三围 | 建议“胸围 / 腰围 / 臀围（cm）”，自由文本 |
| code | 身份编号 | 自由文本 |

## 档案 Profile

| 字段 | 类型 | 必填与用途 |
|---|---|---|
| basics | Basics | 必填，见上表 |
| portrait | string | 必填，图片引用或空字符串 |
| quote | string | 必填，引言 |
| summary | string | 必填，建议简短、约 2–3 行 |
| personality | string | 必填，性格 |
| appearance | string | 必填，外貌 |
| background | string | 必填，背景 |
| statusNote | string | 必填，当前版本状态备注 |
| events | Entry[] | 必填，经历；建议标题“年份 · 事件名” |
| relationships | Entry[] | 必填，关系；建议标题“对象 · 关系” |
| customFields | Entry[] | 必填，自由主题 |
| attributes | Attribute[] | 必填，自定义属性 |
| skills | Skill[] | 必填，文字技能、法术、专长 |
| items | Item[] | 必填，角色物品 |
| gallery | Photo[] | 必填，影像 |
| conditions | Condition[] | 必填，身体状态 |
| coc? | CocSheet | 可省略整个字段；若填写则完整字段必填 |
| display? | Display | 可省略 |

所有必填列表无内容时用 `[]`。长文可使用换行，应用不将正文作为 HTML 执行；不需要嵌入 `<p>` 等标签。文字没有业务字数上限，但受文件与浏览器存储容量约束。

```ts
interface Entry { id: string; title: string; text: string }
interface Attribute { id: string; name: string; value: number } // 有限数值 0–9999
interface Skill extends Entry {
  rank: string;
  kind?: "skill" | "spell" | "specialty"; // 省略按技能展示
  common?: boolean; // 通用能力，精选阅读默认收起
  featured?: boolean; // 重点能力，覆盖默认收起规则
}
interface Item extends Entry { image: string }
interface Photo { id: string; image: string; caption: string }
interface Condition extends Entry {
  area: string; // 自由文本，人体图固定热点为头部/躯干/左臂/右臂/左腿/右腿
  severity: "stable" | "notice" | "danger";
}
interface Display { hideEmpty: boolean; hiddenBasics: (keyof Basics)[] }
interface CatalogEntry extends Entry {
  kind: "skill" | "spell" | "specialty" | "item";
  rank: string;
  common: boolean;
}
```

`catalog` 保存共享文字模板，不保存角色物品图片。角色中的 `skills`、`items` 是独立副本。模板修改不联动已有角色。

## 秘密档案 Secret

```ts
interface Secret {
  enabled: boolean;
  label: string;
  trigger: "portrait" | "name" | "emblem";
  theme: "prison" | "noir" | "clinical";
  overrides: Partial<Omit<Profile, "basics" | "coc">> & {
    basics?: Partial<Basics>;
    coc?: CocPatch;
  };
}
```

- 省略键表示沿用明档，填写 `""` 或 `[]` 表示明确清空，含义不同。
- `basics` 按单字段合并；`coc` 的 characteristics/state/overrides 按内部键合并。
- `skills`、`items`、`conditions` 等列表整体覆盖，不按条目 ID 合并。
- `enabled: false` 不会删除 overrides；备份仍包含这些内容。
- 秘密档案是叙事展示功能，不是加密。全文检索默认不搜索秘密；主动包含时只搜索已启用秘密档案的标题和显式覆盖字段。

## CoC 数值

```ts
interface CocSheet {
  characteristics: {
    STR: number; CON: number; SIZ: number; DEX: number;
    APP: number; INT: number; POW: number; EDU: number;
  };
  skills: CocSkill[];
  state: { hp: number; mp: number; san: number; luck: number };
  overrides: {
    hp: number | null; mp: number | null; san: number | null;
    mov: number | null; db: string | null; build: number | null;
  };
}
interface CocSkill {
  id: string; key: string; name: string; specialization: string; notes: string;
  base: number | null; value: number | null; featured: boolean;
  selected?: boolean; common?: boolean;
}
interface CocPatch {
  characteristics?: Partial<CocSheet["characteristics"]>;
  skills?: CocSkill[];
  state?: Partial<CocSheet["state"]>;
  overrides?: Partial<CocSheet["overrides"]>;
}
```

- 所有 CoC 数字必须为整数 0–9999；`build` 额外允许负整数，最低 −9999。不要把数值写成字符串。
- `state` 的四项都必填，尤其 `luck`。读取或 ZIP 恢复失败时可以预览补 50 的方案，但不会未经确认自动补值。追加导入仍严格校验，需先修正文件。
- `overrides` 对象必填；允许内部值为 `null` 表示自动计算。`db` 是不超过 80 字符的字符串或 `null`，其他覆盖值为整数或 `null`。
- `base: null` 跟随规则基础，`value: null` 跟随有效基础。闪避基础随 DEX，母语随 EDU。
- `skills` 最多 2000 项，同一张 CoC 表中技能 ID 不可重复。可用 `key: "custom"` 创建自定义数值技能，其他标准 key 可见 `src/coc.ts` 的 `skillCatalog`。
- HP/MP/SAN 当前值独立保存，不因上限变化自动恢复。
- 精选阅读显示重点技能，或值至少 50、超过基础且非通用的已选技能；可查看全部已选。

## 图片引用

- 空字符串：无图。
- `builtin:0`、`builtin:1`、`builtin:2`：应用内置演示图。
- 外部图片：仅文件名，可用字母、数字、下划线、连字符，扩展名为 png/jpg/jpeg/webp/gif；例如 `a12f_photo.png`，对应 ZIP 的 `assets/a12f_photo.png`。
- 不支持绝对路径、URL、`../` 或 data URL 作为角色图片字段。

## 最小可导入例子

此例不填写整个可选 `coc`，导入时会生成默认 CoC 表。以下 ID 仅作示例，实际生成时建议用 UUID。

```json
{
  "schemaVersion": 2,
  "characters": [{
    "id": "sample-character", "name": "示例角色", "collection": "示例世界",
    "favorite": false, "accent": "#53695c", "defaultVersionId": "sample-version",
    "createdAt": "2026-10-19T00:00:00.000Z", "updatedAt": "2026-10-19T00:00:00.000Z",
    "versions": [{
      "id": "sample-version", "name": "初始设定", "date": "", "note": "",
      "createdAt": "2026-10-19T00:00:00.000Z", "updatedAt": "2026-10-19T00:00:00.000Z",
      "profile": {
        "basics": {
          "name": "示例角色", "alias": "", "age": "24", "gender": "", "species": "",
          "occupation": "", "affiliation": "", "height": "", "weight": "", "blood": "",
          "birthday": "", "birthplace": "", "residence": "", "measurements": "", "code": "OC-001"
        },
        "portrait": "", "quote": "", "summary": "", "personality": "", "appearance": "",
        "background": "", "statusNote": "", "events": [], "relationships": [], "customFields": [],
        "attributes": [], "skills": [], "items": [], "gallery": [], "conditions": []
      },
      "secret": { "enabled": false, "label": "秘密档案", "trigger": "portrait", "theme": "prison", "overrides": {} }
    }]
  }],
  "catalog": []
}
```

提交前建议用应用的追加导入预览检查；源码环境也可调用 `validateLibrary()` 检查、`migrateLibrary()` 验证并生成迁移后的独立副本。不要直接修改正在运行的应用的 IndexedDB。
