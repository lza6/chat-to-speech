// 单元测试 — B1 本地记忆三层（纯 JS，无浏览器）：BM25 检索 + 画像克制更新 + 记录 schema + 结晶门控
// 参考 D-MEM-1 报告：mem0 四层 / mnemosyne BEAM 三层权重 / agentmemory 结晶 / Tencent 画像克制
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ===== 纯函数实现（与 demo.html 内联版保持一致的直拷副本） =====

// --- BM25 字段加权检索（okf search.go 简化版） ---
function tokenizeZh(text) {
  // 中文按字符切（去标点），英文按空格切；去重
  const norm = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return [...new Set(norm.split(/\s+/).filter(Boolean))];
}
function buildBm25Index(docs) {
  const FIELD_WEIGHTS = { title: 4, tags: 3.5, description: 2.5, body: 1 };
  const N = docs.length;
  const df = new Map(); // term -> 含该词的文档数
  const termSet = new Map(); // docId -> terms[]
  const docLen = {};
  docs.forEach((d) => {
    const fieldTerms = new Set();
    let len = 0;
    for (const f of ['title', 'tags', 'description', 'body']) {
      const v = String(d[f] || '');
      if (!v) continue;
      len += v.length;
      for (const t of tokenizeZh(v)) fieldTerms.add(t);
    }
    termSet.set(d.id, [...fieldTerms]);
    for (const t of fieldTerms) df.set(t, (df.get(t) || 0) + 1);
    docLen[d.id] = Math.max(1, len);
  });
  const avgdl = docs.length ? Object.values(docLen).reduce((a, b) => a + b, 0) / docs.length : 1;
  const k1 = 1.5, b = 0.75;
  function idf(term) { const n = df.get(term) || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); }
  function score(doc, query) {
    const id = doc.id;
    let s = 0;
    const dl = docLen[id] || 1;
    for (const t of query) {
      const terms = termSet.get(id) || [];
      if (!terms.includes(t)) continue;
      let tf = 0;
      for (const f of ['title', 'tags', 'description', 'body']) {
        const v = String(doc[f] || '');
        const cnt = v.toLowerCase().split(t).length - 1;
        tf += cnt * FIELD_WEIGHTS[f];
      }
      if (!tf) continue;
      s += idf(t) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl));
    }
    return s;
  }
  return { score };
}

// --- 画像克制更新（Tencent 四段：强化/补充/修正/不改） ---
function mergePersona(persona, newFact) {
  const MAX_PERSONA_CHARS = 2000;
  if (!persona) persona = { id: 'persona', content: '', chapters: {}, updated_at: 0, version: 0 };
  const cur = persona.content || '';
  // 相似判定：取正文与新事实的最长公共前缀（≥8 字）即视为"同一事实变体" → 强化而非覆盖（克制）
  const a = cur, b = String(newFact.content || '');
  let common = 0;
  const max = Math.min(a.length, b.length, 12);
  while (common < max && a[common] === b[common]) common++;
  if (common >= 8) {
    return { ...persona, updated_at: newFact.ts, version: persona.version + 1, reinforced: true };
  }
  const next = cur ? cur + '\n' + newFact.content : newFact.content;
  if (next.length > MAX_PERSONA_CHARS) return { ...persona, rejected: 'over-limit' };
  return { ...persona, content: next, updated_at: newFact.ts, version: persona.version + 1, reinforced: false };
}

// --- 结晶门控（memorizz 四维：≥5 次 ∧ ≥80% 成功 ∧ ≥2 种问法 ∧ 30 天内） ---
function isCrystalEligible(stats) {
  if (!stats) return false;
  const { executions = 0, success_rate = 0, distinct_queries = 0, days_since_last = 999 } = stats;
  return executions >= 5 && success_rate >= 0.8 && distinct_queries >= 2 && days_since_last <= 30;
}

// --- 记忆记录 schema 校验（mem0/agentmemory 公共字段） ---
const MEMORY_TYPES = ['semantic', 'episodic', 'procedural', 'preference', 'skill'];
function validateMemory(rec) {
  if (!rec || typeof rec !== 'object') return { ok: false, err: '非对象' };
  if (!rec.id || typeof rec.id !== 'string') return { ok: false, err: '缺 id' };
  if (!MEMORY_TYPES.includes(rec.type)) return { ok: false, err: '非法 type: ' + rec.type };
  if (typeof rec.content !== 'string' || !rec.content.length) return { ok: false, err: 'content 必填' };
  if (rec.priority != null && (typeof rec.priority !== 'number' || rec.priority < -1 || rec.priority > 100)) return { ok: false, err: 'priority 范围 -1..100' };
  if (rec.version != null && typeof rec.version !== 'number') return { ok: false, err: 'version 应为数值' };
  return { ok: true };
}

// ===== 测试 =====
test('B1_1 BM25 字段加权检索：标题权重高于正文', () => {
  const docs = [
    { id: '1', title: '唐诗 李白', tags: ['古诗'], description: '床前明月光', body: '床前明月光，疑是地上霜。' },
    { id: '2', title: '现代诗', tags: ['新诗'], description: '面朝大海', body: '从明天起，做一个幸福的人' }
  ];
  const idx = buildBm25Index(docs);
  const s = idx.score(docs[0], tokenizeZh('李白'));
  const s2 = idx.score(docs[1], tokenizeZh('李白'));
  assert.ok(s > s2, '李白 应优先命中 文档1（标题含李白）');
  assert.ok(s > 0, '分数应为正');
});

test('B1_2 画像克制更新：相似事实强化不覆盖，超限拒绝', () => {
  let p = mergePersona(null, { content: '用户喜欢简洁明快的界面', ts: 1 });
  assert.equal(p.reinforced, false, '首次应新增');
  const p2 = mergePersona(p, { content: '用户喜欢简洁明快的界面（也适用移动端）', ts: 2 });
  assert.equal(p2.reinforced, true, '相似事实应强化而非覆盖');
  assert.equal(p2.content.length, p.content.length, '强化不应增长正文');
  // 超限拒绝
  const big = 'x'.repeat(2500);
  const p3 = mergePersona(p, { content: big, ts: 3 });
  assert.equal(p3.rejected, 'over-limit', '超 2000 字应拒绝');
});

test('B1_3 结晶四维门控：50 次重复 60% 成功 = bug 报告不是 skill', () => {
  assert.equal(isCrystalEligible({ executions: 50, success_rate: 0.6, distinct_queries: 1, days_since_last: 1 }), false, '成功率不足不应结晶');
  assert.equal(isCrystalEligible({ executions: 5, success_rate: 0.9, distinct_queries: 2, days_since_last: 5 }), true, '五维达标应结晶');
  assert.equal(isCrystalEligible({ executions: 4, success_rate: 0.9, distinct_queries: 2, days_since_last: 5 }), false, '次数不足不应结晶');
  assert.equal(isCrystalEligible({ executions: 5, success_rate: 0.9, distinct_queries: 1, days_since_last: 5 }), false, '问法单一不应结晶（缓存候选非 skill）');
  assert.equal(isCrystalEligible({ executions: 5, success_rate: 0.9, distinct_queries: 2, days_since_last: 40 }), false, '超 30 天不应结晶');
});

test('B1_4 记忆记录 schema 校验', () => {
  const ok = validateMemory({ id: 'm1', type: 'semantic', content: '用户是后端工程师', priority: 70, version: 1 });
  assert.equal(ok.ok, true, '合法记录应通过');
  assert.equal(validateMemory({ id: 'm2', type: 'bogus', content: 'x' }).ok, false, '非法 type 应拒绝');
  assert.equal(validateMemory({ type: 'semantic', content: 'x' }).ok, false, '缺 id 应拒绝');
  assert.equal(validateMemory({ id: 'm3', type: 'preference', content: '' }).ok, false, '空 content 应拒绝');
  assert.equal(validateMemory({ id: 'm4', type: 'skill', content: 'x', priority: 101 }).ok, false, 'priority>100 应拒绝');
});