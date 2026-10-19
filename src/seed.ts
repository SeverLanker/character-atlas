import {
  createCharacter,
  duplicateVersion,
  uid,
  type Library,
} from "./model.ts";
export function seedLibrary(): Library {
  const lin = createCharacter("林弥", "雾港来信");
  lin.favorite = true;
  const v = lin.versions[0];
  v.name = "平静的日常";
  v.date = "雾历 204 年 · 秋";
  v.note = "故事开始之前，一切看起来都很平常。";
  const p = v.profile;
  p.portrait = "builtin:0";
  p.basics = {
    name: "林弥",
    alias: "弥",
    age: "24",
    gender: "女",
    species: "人类",
    occupation: "古籍修复师",
    affiliation: "雾港市立图书馆",
    height: "167 cm",
    weight: "49 kg",
    blood: "AB",
    birthday: "11 月 06 日",
    birthplace: "雾港 · 北城区",
    code: "OC-017",
  };
  p.quote = "有些故事不必说完，\n也依然真实存在。";
  p.summary = "在旧书与雨声之间，修补那些被时光遗忘的名字。";
  p.personality =
    "安静、细致，对细小的变化格外敏锐。习惯把关心藏在行动里，不擅长告别。";
  p.appearance =
    "银白色短发，灰绿色眼睛。常穿深色衣裙，领口别着一枚银色植物徽记，指尖有淡淡的墨迹。";
  p.background =
    "林弥住在雾港北边的旧街区，在市立图书馆从事古籍修复。她记得每一本经手的书，却很少谈起自己的过去。\n\n每到雨天，她会提早关上工作间的窗，然后给一封没有收件人的信续写几行。";
  p.events = [
    {
      id: uid(),
      title: "雾历 198 年 · 初至雾港",
      text: "带着一只旧皮箱来到北城区，开始在书店帮工。",
    },
    {
      id: uid(),
      title: "雾历 201 年 · 图书馆",
      text: "通过修复师考核，进入市立图书馆。",
    },
    {
      id: uid(),
      title: "雾历 204 年 · 未寄出的信",
      text: "在一册残缺的航海日志里，发现了熟悉的字迹。",
    },
  ];
  p.relationships = [
    {
      id: uid(),
      title: "沈砚 · 旧识",
      text: "偶尔一起喝茶。他们似乎默契地避开同一段往事。",
    },
  ];
  p.attributes = [
    { id: uid(), name: "力量", value: 38 },
    { id: uid(), name: "敏捷", value: 74 },
    { id: uid(), name: "感知", value: 92 },
    { id: uid(), name: "意志", value: 86 },
    { id: uid(), name: "学识", value: 89 },
    { id: uid(), name: "亲和", value: 62 },
  ];
  p.skills = [
    {
      id: uid(),
      title: "古籍修复",
      rank: "熟练",
      text: "修复纸张、辨识墨迹与年代。工作时需要安静和充足的光。",
    },
    {
      id: uid(),
      title: "细节记忆",
      rank: "优秀",
      text: "能准确记住短暂见过的字迹、图案和物品位置。",
    },
  ];
  p.items = [
    {
      id: uid(),
      title: "银叶徽记",
      text: "一直佩戴的旧徽记。背面刻着一串几乎看不清的数字。",
      image: "",
    },
    {
      id: uid(),
      title: "未寄出的信",
      text: "没有收件人，也没有邮戳。纸边已经微微泛黄。",
      image: "",
    },
  ];
  p.gallery = [
    { id: uid(), image: "builtin:0", caption: "日常形象 · 秋日的图书馆" },
  ];
  p.conditions = [
    {
      id: uid(),
      title: "整体状况良好",
      text: "作息规律，近期未发现异常。",
      area: "全身",
      severity: "stable",
    },
    {
      id: uid(),
      title: "左腕旧伤",
      text: "阴雨天气偶有酸痛，不影响日常活动。",
      area: "左臂",
      severity: "notice",
    },
  ];
  p.statusNote = "最近一次记录：雾历 204 年 · 09 月 18 日";
  v.secret = {
    enabled: true,
    label: "第七收容区 · 机密档案",
    trigger: "portrait",
    theme: "prison",
    overrides: {
      basics: {
        name: "林弥 / L-017",
        alias: "无声之页",
        occupation: "第七收容区在押人员",
        affiliation: "第七收容区",
        code: "INM-007-017",
      },
      quote: "档案已解封。\n请勿相信所有被写下的事。",
      summary: "高关注对象。真实经历与对外记录存在重大差异。",
      background:
        "曾以古籍修复师身份长期活动。雾历 204 年秋，因参与禁书转移事件被收押。\n\n其携带的纸质记录存在无法解释的缺页现象。相关审讯摘要已被部分删节。",
      events: [
        {
          id: uid(),
          title: "204.09.21 · 收押",
          text: "移交第七收容区。随身物品已登记封存。",
        },
        {
          id: uid(),
          title: "204.09.23 · 审讯记录",
          text: "对象拒绝说明银叶徽记的来历。记录到此中断。",
        },
      ],
      skills: [
        {
          id: uid(),
          title: "记忆覆写",
          rank: "限制级",
          text: "可修改纸面记录所关联的短时记忆。代价为自身记忆缺失。",
        },
      ],
      items: [
        {
          id: uid(),
          title: "银叶徽记 · 已扣押",
          text: "封存编号 E-017。禁止未经授权接触。",
          image: "",
        },
      ],
      conditions: [
        {
          id: uid(),
          title: "左腕束缚损伤",
          text: "局部红肿，需定期换药。",
          area: "左臂",
          severity: "danger",
        },
        {
          id: uid(),
          title: "睡眠不足",
          text: "连续观察中，精神状态需复核。",
          area: "头部",
          severity: "notice",
        },
      ],
      statusNote: "医疗记录仅限授权人员查看。",
    },
  };
  const later = duplicateVersion(v, "雨夜之后");
  later.date = "雾历 204 年 · 冬";
  later.note = "离开旧街区后，故事进入了新的章节。";
  later.profile.events.push({
    id: uid(),
    title: "雾历 204 年 · 冬",
    text: "暂别图书馆，踏上一段没有目的地的旅程。",
  });
  later.profile.conditions = [
    {
      id: uid(),
      title: "恢复期",
      text: "左腕伤势恢复，留下浅色疤痕。",
      area: "左臂",
      severity: "notice",
    },
  ];
  lin.versions.push(later);
  const shen = createCharacter("沈砚", "雾港来信");
  const sp = shen.versions[0].profile;
  sp.portrait = "builtin:1";
  sp.basics.occupation = "建筑测绘师";
  sp.basics.age = "28";
  sp.basics.code = "OC-018";
  sp.basics.gender = "男";
  sp.quote = "城市会忘记，\n但石头记得。";
  sp.summary = "在城市的缝隙中，寻找那些未被标记的道路。";
  sp.background = "雾港旧城区的测绘师，随身带着一册画满手稿的笔记本。";
  const ye = createCharacter("叶知秋", "温室日记");
  const yp = ye.versions[0].profile;
  yp.portrait = "builtin:2";
  yp.basics.occupation = "植物研究员";
  yp.basics.age = "25";
  yp.basics.code = "OC-019";
  yp.basics.gender = "女";
  yp.quote = "等下一场雨，\n种子就会醒来。";
  yp.summary = "收集植物、旧故事，以及每一种绿色。";
  yp.background = "在城郊经营一间小温室，相信每株植物都有自己的时间。";
  for (const character of [lin, shen, ye]) {
    for (const version of character.versions) {
      const sheet = version.profile.coc!;
      const names = {
        力量: "STR",
        体质: "CON",
        体型: "SIZ",
        敏捷: "DEX",
        外貌: "APP",
        智力: "INT",
        意志: "POW",
        教育: "EDU",
      } as const;
      for (const attr of version.profile.attributes) {
        const key = names[attr.name as keyof typeof names];
        if (key) sheet.characteristics[key] = attr.value;
      }
      sheet.state.hp = Math.floor(
        (sheet.characteristics.CON + sheet.characteristics.SIZ) / 10,
      );
      sheet.state.mp = Math.floor(sheet.characteristics.POW / 5);
      sheet.state.san = sheet.characteristics.POW;
      const spot = sheet.skills.find((s) => s.key === "spot")!;
      spot.value = character === lin ? 65 : 55;
      spot.featured = true;
    }
  }
  return { schemaVersion: 2, characters: [lin, shen, ye] };
}
