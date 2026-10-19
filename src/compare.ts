import { basicLabels, effectiveProfile, type Version } from './model';
export interface ProfileChange { path: string; before: string; after: string }
const labels: Record<string, string> = { ...basicLabels, targetCharacterId: '关联角色', basics: '基本资料', portrait: '立绘', quote: '引言', summary: '简介', personality: '性格', appearance: '外貌', background: '背景', events: '经历', relationships: '关系', customFields: '自定义资料', attributes: '属性', skills: '能力', items: '物品', gallery: '相册', conditions: '身体状态', statusNote: '状态备注', coc: 'CoC 数值', characteristics: '属性', state: '当前状态', overrides: '手动修正', display: '展示设置', title: '名称', name: '名称', text: '说明', value: '数值', rank: '等级', kind: '类型', common: '通用', featured: '精选', selected: '已选', image: '图片', caption: '图注', area: '部位', severity: '程度', specialization: '专业', notes: '备注', base: '基础值', hideEmpty: '隐藏空字段', hiddenBasics: '隐藏资料' };
function flatten(value: unknown, path = '', result = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(value)) {
    value.forEach((entry, i) => flatten(entry, `${path}/${entry && typeof entry === 'object' ? String(entry.id ?? entry.key ?? i) : i}`, result));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key !== 'id' && key !== 'key') flatten(item, path ? `${path}/${key}` : key, result);
    }
  } else if (value !== undefined && value !== null && value !== '') {
    result.set(path, typeof value === 'boolean' ? (value ? '是' : '否') : String(value));
  }
  return result;
}
export function compareVersions(a: Version, b: Version, secret = false): ProfileChange[] {
  const left = effectiveProfile(a, secret), right = effectiveProfile(b, secret);
  const oldFields = flatten(left), newFields = flatten(right);
  const titleFor = (path: string) => {
    let node: unknown = right, oldNode: unknown = left;
    return path.split('/').map(part => {
      if (Array.isArray(node) || Array.isArray(oldNode)) {
        const find = (v: unknown) => Array.isArray(v) ? v.find((e, i) => String(e?.id ?? e?.key ?? i) === part) : undefined;
        node = find(node); oldNode = find(oldNode);
        const entry = (node ?? oldNode) as Record<string, unknown> | undefined;
        return entry && typeof entry === 'object' ? String(entry.title || entry.name || entry.caption || entry.area || '条目') : String(entry ?? part);
      }
      node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
      oldNode = oldNode && typeof oldNode === 'object' ? (oldNode as Record<string, unknown>)[part] : undefined;
      return labels[part] ?? part;
    }).join(' / ');
  };
  return [...new Set([...oldFields.keys(), ...newFields.keys()])].filter(key => oldFields.get(key) !== newFields.get(key)).map(key => ({ path: titleFor(key), before: oldFields.get(key) ?? '', after: newFields.get(key) ?? '' }));
}
