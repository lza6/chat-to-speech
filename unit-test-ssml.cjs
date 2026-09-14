// 单元测试 — E1 SSML 子集解析 / E2 分块策略增强（纯 JS，无浏览器）
// 运行：node --test unit-test-ssml.cjs
// 约定：本文件函数为 demo.html 内联版的「直拷副本」，改一处必须同步另一处（与 unit-test-zh/wizard 同约定）
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const CHUNK_SIZE = 500; // 与 demo.html 同步

// ===== E2：分块策略增强（与 demo.html splitIntoChunks 同步） =====
function splitIntoChunks(text) {
  if (!text) return [];
  const sep = /([。！？；]|[.!?;]|\n+)/g;
  const units = [];
  let last = 0, m;
  while ((m = sep.exec(text)) !== null) {
    const unit = text.slice(last, m.index + m[0].length);
    last = m.index + m[0].length;
    if (unit) units.push(unit);
  }
  if (last < text.length) units.push(text.slice(last));
  if (units.length === 0) units.push(text);
  const sentences = [];
  for (const unit of units) {
    if (unit.length > CHUNK_SIZE) {
      let rest = unit;
      while (rest.length > CHUNK_SIZE) {
        let cut = CHUNK_SIZE;
        const sp = rest.lastIndexOf(' ', CHUNK_SIZE);
        if (sp > CHUNK_SIZE - 16 && sp > 0) cut = sp + 1;
        sentences.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      if (rest) sentences.push(rest);
    } else if (sentences.length && !/\n\s*$/.test(sentences[sentences.length - 1]) && (sentences[sentences.length - 1] + unit).length <= CHUNK_SIZE) {
      sentences[sentences.length - 1] += unit;
    } else {
      sentences.push(unit);
    }
  }
  if (sentences.length === 0) {
    for (let i = 0; i < text.length; i += CHUNK_SIZE) sentences.push(text.slice(i, i + CHUNK_SIZE));
  }
  return sentences;
}

// ===== E1：SSML 子集解析（与 demo.html parseSSML 同步） =====
const SSML_ALLOWED = ['break', 'prosody', 'emphasis'];
const SSML_RATE_MAP = { 'x-slow': 0.5, slow: 0.75, medium: 1, fast: 1.5, 'x-fast': 2 };
function ssmlAttrs(raw) {
  const o = {}; const re = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g; let m;
  while ((m = re.exec(raw || '')) !== null) o[m[1].toLowerCase()] = m[2];
  return o;
}
function parseSSML(input) {
  const src = String(input == null ? '' : input);
  const errors = []; const breaks = []; let rateOverride = null;
  if (src.indexOf('<') === -1) return { ok: true, plain: src, errors: errors, rateOverride: rateOverride, breaks: breaks };
  const TOKEN = /<\/?([a-zA-Z][a-zA-Z-]*)((?:\s[^<>]*?)?)(\/?)>/g;
  let out = '', last = 0, m;
  while ((m = TOKEN.exec(src)) !== null) {
    out += src.slice(last, m.index);
    last = TOKEN.lastIndex;
    const closing = m[0].charAt(1) === '/';
    const name = m[1].toLowerCase();
    const attrsRaw = m[2] || '';
    if (SSML_ALLOWED.indexOf(name) === -1) { errors.push('不支持的 SSML 标签：<' + name + '>'); continue; }
    if (/\son[a-z]+\s*=/i.test(attrsRaw)) { errors.push('拒绝危险属性（事件处理器）'); continue; }
    const attrs = ssmlAttrs(attrsRaw);
    if (name === 'break' && !closing) {
      const t = attrs.time || '500ms';
      if (!/^\d+(?:\.\d+)?(?:ms|s)$/i.test(t)) { errors.push('break time 非法：' + t); continue; }
      const ms = /ms$/i.test(t) ? parseFloat(t) : parseFloat(t) * 1000;
      breaks.push({ index: out.length, ms: ms });
      out += '\n\n';
    } else if (name === 'prosody' && !closing && attrs.rate) {
      const key = attrs.rate.toLowerCase();
      const n = (SSML_RATE_MAP[key] != null) ? SSML_RATE_MAP[key] : parseFloat(attrs.rate);
      if (!isFinite(n) || n <= 0) errors.push('prosody rate 非法：' + attrs.rate);
      else rateOverride = Math.min(4, Math.max(0.25, n));
    }
  }
  out += src.slice(last);
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { ok: errors.length === 0, plain: out, errors: errors, rateOverride: rateOverride, breaks: breaks };
}

// ===== E2 测试 =====

test('U_SPLIT_1 超长文本：每块不超 CHUNK_SIZE，且无损拼接', () => {
  const src = '这是第一句话。这是第二句话！这是第三句话？'.repeat(60);
  const chunks = splitIntoChunks(src);
  assert.ok(chunks.length > 1, '长文本应切成多块');
  for (const c of chunks) assert.ok(c.length <= CHUNK_SIZE, '块超长: ' + c.length);
  assert.equal(chunks.join(''), src, '分块必须无损（拼接等于原文）');
});

test('U_SPLIT_2 段落边界（\\n\\n）不跨块合并', () => {
  const src = 'AAAA\n\nBBBB';
  const chunks = splitIntoChunks(src);
  assert.equal(chunks.length, 2, '双换行应形成两个独立块，实际=' + JSON.stringify(chunks));
  assert.equal(chunks.join(''), src, '无损');
  assert.ok(chunks[0].endsWith('\n'), '第一块应以换行结尾');
});

test('U_SPLIT_3 超长无标点英文串：硬切回退到词边界，不切断单词', () => {
  const src = ('word '.repeat(200)).trim();
  const chunks = splitIntoChunks(src);
  assert.ok(chunks.length > 1, '超长英文串应硬切');
  assert.equal(chunks.join(''), src, '无损');
  for (let i = 0; i < chunks.length - 1; i++) {
    const c = chunks[i];
    assert.ok(/\s$/.test(c) || c.length === CHUNK_SIZE, '非末块应在词边界收尾: ' + JSON.stringify(c.slice(-12)));
  }
});

test('U_SPLIT_4 混合中英标点：无损 + 空输入返回空数组', () => {
  const src = 'Hello world. 你好世界！Test; 测试\n新段落。End.';
  const chunks = splitIntoChunks(src);
  assert.equal(chunks.join(''), src, '混合标点必须无损');
  assert.deepEqual(splitIntoChunks(''), [], '空输入应返回空数组');
  assert.deepEqual(splitIntoChunks(null), [], 'null 输入应返回空数组');
});

// ===== E1 测试 =====

test('U_SSML_1 <break time="2s"/> 解析为 2000ms 停顿 + 段落边界', () => {
  const r = parseSSML('你好。<break time="2s"/>再见。');
  assert.equal(r.ok, true, '应解析成功: ' + JSON.stringify(r.errors));
  assert.equal(r.breaks.length, 1, '应有 1 处停顿');
  assert.equal(r.breaks[0].ms, 2000, 'break 应为 2000ms');
  assert.ok(r.plain.includes('你好。') && r.plain.includes('再见。'), '正文应保留');
  assert.ok(/\n\n/.test(r.plain), 'break 应转为段落边界');
  assert.ok(!/</.test(r.plain), 'plain 不应残留标签');
});

test('U_SSML_2 <prosody rate="slow"> 解析为语速系数 0.75', () => {
  const r = parseSSML('<prosody rate="slow">你好世界。</prosody>');
  assert.equal(r.ok, true);
  assert.equal(r.rateOverride, 0.75, 'slow 应映射 0.75');
  assert.equal(r.plain, '你好世界。', '应剥标签保留文本');
  const r2 = parseSSML('<prosody rate="1.5">文</prosody>');
  assert.equal(r2.rateOverride, 1.5, '数值语速应直通');
  const r3 = parseSSML('<prosody rate="9">文</prosody>');
  assert.equal(r3.rateOverride, 4, '语速应上限钳位到 4');
});

test('U_SSML_3 白名单/危险属性/非法值：拒绝并给出可读错误；嵌套正常剥标签', () => {
  const bad = parseSSML('<script>alert(1)</script>');
  assert.equal(bad.ok, false, '非白名单标签应拒绝');
  assert.ok(bad.errors.some(e => /不支持的 SSML 标签/.test(e)), '应给出不支持错误');

  const badTime = parseSSML('<break time="abc"/>');
  assert.equal(badTime.ok, false, '非法 break time 应拒绝');
  assert.ok(badTime.errors.some(e => /break time 非法/.test(e)));

  const danger = parseSSML('<prosody rate="1" onclick="x">hi</prosody>');
  assert.equal(danger.ok, false, '危险属性应拒绝');
  assert.ok(danger.errors.some(e => /危险属性/.test(e)));

  const nested = parseSSML('<prosody rate="fast"><emphasis>强调</emphasis></prosody>');
  assert.equal(nested.ok, true, '嵌套白名单标签应通过');
  assert.equal(nested.rateOverride, 1.5, 'fast 应映射 1.5');
  assert.equal(nested.plain, '强调', '嵌套标签应全部剥离');
});
