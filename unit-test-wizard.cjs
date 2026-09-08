// 单元测试 — B3 任务看板状态机 / B4 PPT 大纲→分页→几何审计 / B5 电商文案模板（纯 JS，无浏览器）
// 运行：node --test unit-test-wizard.cjs
// 参考：D-AGENT-1（agtx TaskStatus + deps_satisfied 门）、D-OFFICE-1（genoffice 几何审计 + parsePageSpec 钳位）、D-ECOM-1（商品上下文卡 schema + 模板渲染）
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ===== 纯函数实现（与 demo.html 内联版保持一致的直拷副本，改一处必须同步） =====

// --- B3：任务看板状态机（agtx TaskStatus 语义：Backlog→Planning→Running→Review→Done，任意非终态可 Cancel） ---
const WIZ_TASK_FLOW = ['backlog', 'planning', 'running', 'review', 'done'];
function wzNewTask(name, kind) {
  const id = 'wz' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { id, name: String(name || '未命名任务'), kind: kind || 'tts', status: 'backlog', steps: [], created_at: Date.now(), updated_at: Date.now() };
}
function wzCanTransit(from, to) {
  if (from === to) return !(to === 'cancelled'); // 同态幂等：cancelled→cancelled 拒绝，其余允许
  if (from === 'cancelled' || to === 'cancelled') return from !== 'cancelled' && from !== 'done'; // 已取消/已完成不可取消或复活；其余非终态可取消
  const fi = WIZ_TASK_FLOW.indexOf(from);
  const ti = WIZ_TASK_FLOW.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti === fi + 1; // 只能严格前进一格（Review → Planning 视为 rework，通过取消+重开表达）
}
// 看板列分组（filters）
function wzGroupByStatus(tasks) {
  const g = { backlog: [], planning: [], running: [], review: [], done: [], cancelled: [] };
  for (const t of tasks) { const k = g[t.status] ? t.status : 'backlog'; g[k].push(t); }
  return g;
}

// --- B4：PPT 大纲→分页（parsePageSpec：标题+每页"小节标题：要点1；要点2"，支持换行分页） ---
function wzParsePptSpec(text) {
  if (!text || typeof text !== 'string') return [];
  const rawPages = String(text)
    .split(/\n\s*\n+/)                 // 空行分页
    .map(s => s.trim())
    .filter(Boolean);
  const out = [];
  for (const block of rawPages) {
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    // 首行 = 页标题；其余行为要点（可带 "• "/"- " 前缀，冒号/分号不特殊处理）
    const title = lines.shift() || '未命名页';
    const bullets = lines
      .map(l => l.replace(/^\s*(?:[•·-]\s*|(?:[0-9]+[.)、]\s*))/, '').trim()) // 只剥列表前缀，保留正文
      .filter(l => l && !/^页[:：]\d+$/i.test(l)); // 忽略 "页：N" 类指示行
    if (title || bullets.length) out.push({ title: title.slice(0, 40), bullets: bullets.slice(0, 9), overflow: [] });
  }
  return out.slice(0, 30); // 钳位页数
}

// --- B4：几何审计（genoffice 思路：估算文本宽度 → autofit 缩字 → 溢出标记） ---
function wzEstimateTextWidth(text, fontSizePx) {
  // 中文/全角按 1.0*fontSize，ASCII/半角按 0.55*fontSize（经验值，够用即可）
  const t = String(text || '');
  let w = 0;
  for (const ch of t) w += /[⺀-鿿＀-￯　-〿]/.test(ch) ? fontSizePx : fontSizePx * 0.55;
  return w;
}
function wzFitFontSize(text, maxWidthPx, startFs = 28, minFs = 10) {
  let fs = startFs;
  const w = () => wzEstimateTextWidth(text, fs);
  while (fs > minFs && w() > maxWidthPx) fs -= 2;
  return { size: Math.max(minFs, fs), fits: w() <= maxWidthPx };
}
function wzDetectOverflow(pages, maxWidthPx, maxHeightPx, baseFont = 24) {
  for (const p of pages) {
    const titleFit = wzFitFontSize(p.title || '', maxWidthPx, baseFont, 12);
    p.titleSize = titleFit.size;
    p.bulletSize = Math.max(12, baseFont - 6);
    p.overflow = [];
    if (!titleFit.fits) p.overflow.push('标题溢出');
    let usedH = 60 + 90; // 标题区 + 页脚
    for (let i = 0; i < p.bullets.length; i++) {
      const b = p.bullets[i];
      usedH += 34; // 每要点行高
      const fit = wzFitFontSize(b, maxWidthPx - 24, p.bulletSize, 10);
      if (!fit.fits) p.overflow.push('要点' + (i + 1) + '溢出');
    }
    if (usedH > maxHeightPx) p.overflow.push('内容超页');
  }
  return pages;
}

// --- B4：模板锁事实（每页只允许 title+bullets 两个字段，防注入任意键） ---
function wzSanitizePage(p) {
  return { title: String(p.title || '').slice(0, 40), bullets: (Array.isArray(p.bullets) ? p.bullets : []).map(b => String(b).slice(0, 200)).slice(0, 9) };
}

// --- B5：电商商品卡 schema（D-ECOM-1 商品上下文卡 + 来源纪律） ---
const COM_FIELDS = ['name', 'sellpoints', 'price', 'audience'];
function wzValidateCommodity(spec) {
  if (!spec || typeof spec !== 'object') return { ok: false, err: '商品卡非对象' };
  if (!spec.name || !String(spec.name).trim()) return { ok: false, err: '缺商品名' };
  if (!Array.isArray(spec.sellpoints) || !spec.sellpoints.length) return { ok: false, err: '缺卖点列表' };
  if (spec.price == null || isNaN(Number(spec.price))) return { ok: false, err: '价格非法' };
  if (spec.audience && !Array.isArray(spec.audience)) return { ok: false, err: '人群应为数组' };
  return { ok: true };
}

// --- B5：文案模板（marketingskills 公式：标题=痛点+卖点；正文=三段式；快发=短句） + 禁用词替换 ---
const COM_BANNED = new Set(['最低价', '全网最低', '第一', '绝对', '100%']);
function wzCensor(text, banned) {
  let t = String(text || '');
  for (const w of banned || COM_BANNED) t = t.split(w).join('★');
  return t;
}
function wzEcomTemplate(spec) {
  if (!wzValidateCommodity(spec).ok) return [];
  const price = Number(spec.price);
  const aud = (spec.audience && spec.audience.length) ? spec.audience.join('、') : '所有人';
  const sells = spec.sellpoints.slice(0, 3);
  const d1 = {
    tag: '标题版',
    title: wzCensor(`${aud} 注意！${sells[0]} —— 仅 ¥${price}`),
    body: [spec.name, ...sells].join(' · ')
  };
  const d2 = {
    tag: '正文版',
    title: spec.name,
    body: [ `【${spec.name}】${sells[0]}。`, `亮点：${sells.slice(1).join('；') || '无'}。`, `现价 ¥${price}，适合 ${aud}。` ].join('\n')
  };
  const d3 = { tag: '快发版', title: `¥${price} ${sells[0]}`, body: `${spec.name}｜${sells.join(' / ')}` };
  return [d1, d2, d3].map(d => ({ ...d, title: wzCensor(d.title), body: wzCensor(d.body) }));
}

// ===== 测试 =====

test('WZ_1 看板状态机：合法流转 pass / 非法跳级 fail', () => {
  assert.equal(wzCanTransit('backlog', 'planning'), true, 'backlog→planning');
  assert.equal(wzCanTransit('planning', 'running'), true, 'planning→running');
  assert.equal(wzCanTransit('running', 'review'), true, 'running→review');
  assert.equal(wzCanTransit('review', 'done'), true, 'review→done');
  assert.equal(wzCanTransit('backlog', 'done'), false, '跳级应拒绝');
  assert.equal(wzCanTransit('done', 'review'), false, 'done 之后不可回退');
  assert.equal(wzCanTransit('done', 'done'), true, '同态幂等');
});

test('WZ_2 取消语义：任意非终态可取消，已取消不可复活', () => {
  assert.equal(wzCanTransit('running', 'cancelled'), true, 'running→cancelled');
  assert.equal(wzCanTransit('cancelled', 'backlog'), false, 'cancelled 不可复活');
  assert.equal(wzCanTransit('cancelled', 'cancelled'), false, '已取消后再次取消应拒绝');
  const t = wzNewTask('朗读任务', 'tts');
  assert.equal(t.status, 'backlog', '新任务从 backlog 开始');
  assert.ok(typeof t.id === 'string' && t.id.length > 4, '任务 id 稳定唯一');
});

test('WZ_3 PPT 大纲解析：空行分页 + 要点去前缀 + 钳位', () => {
  const spec = '封面标题\n简介要点；子要点\n\n第二章\n页：1\n第一点\n第二点';
  const pages = wzParsePptSpec(spec);
  assert.equal(pages.length, 2, '应解析出 2 页');
  assert.equal(pages[0].title, '封面标题', '首行=标题');
  const b1 = wzSanitizePage(pages[1]).bullets;
  assert.ok(b1.includes('第一点') && b1.includes('第二点'), '要点应保留');
  assert.ok(!b1.some(b => /^页[:：]/.test(b)), '页指示行应剔除');
  const empty = wzParsePptSpec('   ');
  assert.deepEqual(empty, [], '空输入返回空数组');
  const arch = wzParsePptSpec('标题\n' + 'A\n'.repeat(50));
  assert.ok(arch[0].bullets.length <= 9 && arch.length <= 30, '要点芯位 9 / 页数钳位 30');
});

test('WZ_4 几何审计：中文宽度估算 + autofit 缩字 + 溢出标记', () => {
  const w1 = wzEstimateTextWidth('中文标题', 20);
  const w2 = wzEstimateTextWidth('abc', 20);
  assert.ok(w1 > w2, '中文宽度 > 半角宽度');
  const fit = wzFitFontSize('中'.repeat(30), 400, 28, 4);
  assert.ok(fit.size >= 4 && fit.fits, '应缩到适配');
  const over = wzDetectOverflow([{ title: 'PPT 汇报', bullets: ['要点一'] }], 300, 200, 24);
  assert.ok(over[0].overflow.length === 0, '短内容应不溢出');
  const longOver = wzDetectOverflow([{ title: 'T', bullets: ['超长'.repeat(500)] }], 300, 200, 24);
  assert.ok(longOver[0].overflow.includes('要点1溢出'), '超长要点应标溢出');
  const narrow = wzDetectOverflow([{ title: 'T', bullets: ['超长'.repeat(500)] }], 40, 200, 24);
  assert.ok(typeof narrow[0].titleSize === 'number' && Array.isArray(narrow[0].overflow), '返回结构完整');
});

test('WZ_5 电商文案模板：三段渲染 + 禁用词替换', () => {
  const spec = { name: '静音风扇', sellpoints: ['无感运转', '省电', '静音'], price: '199', audience: ['上班族'] };
  const drafts = wzEcomTemplate(spec);
  assert.equal(drafts.length, 3, '应产出 3 个草稿');
  assert.ok(drafts[0].title.includes('无感运转') && drafts[0].title.includes('199'), '标题含卖点+价格');
  assert.ok(drafts[1].body.includes('亮点'), '正文版含亮点段');
  const banned = wzEcomTemplate({ name: 'x', sellpoints: ['全网最低价'], price: '1' });
  assert.ok(banned[0].title.includes('★'), '禁用词应被替换');
});

test('WZ_6 商品卡 schema 校验：缺字段/非法类型拒绝，合法通过', () => {
  assert.equal(wzValidateCommodity(null).ok, false, '非对象拒绝');
  assert.equal(wzValidateCommodity({ name: 'x', sellpoints: ['a'], price: 'y' }).ok, false, '价格非法拒绝');
  assert.equal(wzValidateCommodity({ name: 'x', sellpoints: [], price: '1' }).ok, false, '空卖点拒绝');
  assert.equal(wzValidateCommodity({ name: 'x', sellpoints: ['a'], price: '1', audience: 'x' }).ok, false, '人群非数组拒绝');
  assert.equal(wzValidateCommodity({ name: 'x', sellpoints: ['a'], price: '1' }).ok, true, '合法商品卡通过');
});