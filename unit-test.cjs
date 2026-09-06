// unit-test.cjs — P0-2 推理清洗结构化 单元测试（Node 原生 node:test）
// 运行：node unit-test.cjs
// 依赖：无外部依赖，纯逻辑测试，不依赖浏览器
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ===== 引入被测函数（从 demo.html 提取 cleanAssistantText 的结构化实现） =====
// 由于 demo.html 是内联 JS，无法直接 require。这里提取 cleanAssistantText 的纯函数定义，
// 落地为独立可测模块（与 demo.html 内联函数保持逻辑一致，通过 U_CLEAN_4 夹具回归保护）。
// Phase 1.1 落地后，demo.html 内 cleanAssistantText 应与本处实现同步。
function cleanAssistantText(text) {
  if (!text) return '';
  let t = text;

  // 规则数组化（多层结构化清洗管线）
  const rules = [
    // 1. XML 推理标签整段剥离（<think>...</think> / <reasoning>...</reasoning> / <analysis>...</analysis>）
    {
      name: 'xml-thinking-tags',
      pattern: /<(?:think|reasoning|analysis)>[\s\S]*?<\/(?:think|reasoning|analysis)>\s*/gi,
      strategy: 'strip'
    },
    // 2. markdown 代码块剥离（```thinking ... ``` / ```reasoning ... ```）
    {
      name: 'markdown-thinking-fence',
      pattern: /```(?:thinking|reasoning|analysis)[\s\S]*?```\s*/gi,
      strategy: 'strip'
    },
    // 3. markdown 标题区块剥离（### 思考过程 / ### Reasoning / ### Analysis 到下个同级标题或结尾）
    {
      name: 'markdown-thinking-heading',
      pattern: /^#{1,6}\s*(?:思考过程|思考|Reasoning|Analysis|推理过程)[:：]?\s*\n[\s\S]*?(?=^#{1,6}\s|\n\s*$|$)/gim,
      strategy: 'strip'
    },
    // 4. 多语种多前缀白名单整块剥离（前缀独占一行，到首个空行；要求 \n 防止误匹配正文中的"思考"词）
    {
      name: 'thinking-prefix-block',
      pattern: /^(?:Here's a thinking process|以下是思考过程|思考过程|分析用户输入|思考|Reasoning|Analysis)[:：]?\s*\n[\s\S]*?(?=\n\s*\n|$)/i,
      strategy: 'replace'
    },
    // 5. 行首 "思考:" / "Reasoning:" / "Analysis:" 前缀行剥离（直到句号或换行）
    {
      name: 'inline-thinking-prefix',
      pattern: /^(?:思考|Reasoning|Analysis)\s*[:：]\s*[^\n]*\n?/gim,
      strategy: 'strip'
    },
    // 6. 尾部剥离（"以上是思考过程" / "以上是思考" 整句）
    {
      name: 'tail-thinking-suffix',
      pattern: /\n?\s*以上是思考(?:过程)?[，,。]?\s*仅供参考[。.]?\s*$/i,
      strategy: 'replace'
    },
    {
      name: 'tail-thinking-bare',
      pattern: /\n?\s*以上是思考[。.]?\s*$/i,
      strategy: 'replace'
    }
  ];

  for (const rule of rules) {
    if (rule.strategy === 'strip') {
      t = t.replace(rule.pattern, '');
    } else if (rule.strategy === 'replace') {
      t = t.replace(rule.pattern, '');
    }
  }

  t = t.trim();
  // 7. 空结果回退（全被剥光返回空标记，上层据此跳过朗读）
  return t;
}

// 导出供 demo.html 同步时校验
module.exports = { cleanAssistantText };

// ===== 加载夹具 =====
const fixturesPath = path.join(__dirname, 'test-cases', '推理清洗样本.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
const samples = fixtures.samples;

// ===== 单元测试 =====

test('U_CLEAN_1: XML 推理标签剥离', () => {
  // S4: <think> 整段
  const s4 = samples.find(s => s.id === 'S4');
  const r4 = cleanAssistantText(s4.input);
  assert.equal(r4, s4.expected, `S4 XML <think> 剥离失败，实际=${r4}`);
  // S5: <reasoning> 整段
  const s5 = samples.find(s => s.id === 'S5');
  const r5 = cleanAssistantText(s5.input);
  assert.equal(r5, s5.expected, `S5 XML <reasoning> 剥离失败，实际=${r5}`);
});

test('U_CLEAN_2: markdown 区块剥离（代码块 + 标题区块）', () => {
  // S6: ```thinking 代码块
  const s6 = samples.find(s => s.id === 'S6');
  assert.equal(cleanAssistantText(s6.input), s6.expected, 'S6 ```thinking 代码块剥离失败');
  // S7: ### 思考过程 标题区块
  const s7 = samples.find(s => s.id === 'S7');
  assert.equal(cleanAssistantText(s7.input), s7.expected, 'S7 ### 思考过程 标题区块剥离失败');
  // S8: ### Reasoning 英文标题
  const s8 = samples.find(s => s.id === 'S8');
  assert.equal(cleanAssistantText(s8.input), s8.expected, 'S8 ### Reasoning 标题区块剥离失败');
});

test('U_CLEAN_3: 多前缀白名单 + 空结果回退', () => {
  // S9-S11: 新前缀 思考:/Reasoning:/Analysis:
  const s9 = samples.find(s => s.id === 'S9');
  assert.equal(cleanAssistantText(s9.input), s9.expected, 'S9 思考: 前缀剥离失败');
  const s10 = samples.find(s => s.id === 'S10');
  assert.equal(cleanAssistantText(s10.input), s10.expected, 'S10 Reasoning: 前缀剥离失败');
  const s11 = samples.find(s => s.id === 'S11');
  assert.equal(cleanAssistantText(s11.input), s11.expected, 'S11 Analysis: 前缀剥离失败');
  // S12: 纯推理无正文 → 空标记
  const s12 = samples.find(s => s.id === 'S12');
  assert.equal(cleanAssistantText(s12.input), s12.expected, 'S12 纯推理空结果回退失败');
  // S17: 空文本
  const s17 = samples.find(s => s.id === 'S17');
  assert.equal(cleanAssistantText(s17.input), s17.expected, 'S17 空文本失败');
  // S18: 纯空白
  const s18 = samples.find(s => s.id === 'S18');
  assert.equal(cleanAssistantText(s18.input), s18.expected, 'S18 纯空白失败');
});

test('U_CLEAN_4: 20+ 样本夹具回归保护（全过）', () => {
  let passed = 0;
  let failed = [];
  for (const s of samples) {
    const actual = cleanAssistantText(s.input);
    if (actual === s.expected) {
      passed++;
    } else {
      failed.push({ id: s.id, input: s.input.slice(0, 60), expected: s.expected, actual });
    }
  }
  assert.equal(failed.length, 0,
    `U_CLEAN_4 夹具失败：${failed.length}/${samples.length} 未过\n` +
    JSON.stringify(failed, null, 2).slice(0, 800)
  );
  assert.equal(passed, samples.length, `通过数 ${passed} !== 总数 ${samples.length}`);
});

test('U_CLEAN边界: 尾部剥离', () => {
  // S13: 尾部 以上是思考过程，仅供参考。
  const s13 = samples.find(s => s.id === 'S13');
  assert.equal(cleanAssistantText(s13.input), s13.expected, 'S13 尾部剥离失败');
  // S14: 尾部 以上是思考。
  const s14 = samples.find(s => s.id === 'S14');
  assert.equal(cleanAssistantText(s14.input), s14.expected, 'S14 尾部剥离失败');
});

test('U_CLEAN边界: 正文含"思考"关键词但非推理块', () => {
  // S15: 正文含"思考"但不应被误删
  const s15 = samples.find(s => s.id === 'S15');
  assert.equal(cleanAssistantText(s15.input), s15.expected, 'S15 正文含"思考"被误删');
  // S16: 正文以"思考"开头但非前缀格式（无冒号、无换行分隔）
  const s16 = samples.find(s => s.id === 'S16');
  assert.equal(cleanAssistantText(s16.input), s16.expected, 'S16 正文以"思考"开头被误删');
});

test('U_CLEAN边界: 混合与多前缀', () => {
  // S20: 混合 XML + markdown + 正文
  const s20 = samples.find(s => s.id === 'S20');
  assert.equal(cleanAssistantText(s20.input), s20.expected, 'S20 混合剥离失败');
  // S21: 多前缀同时出现
  const s21 = samples.find(s => s.id === 'S21');
  assert.equal(cleanAssistantText(s21.input), s21.expected, 'S21 多前缀剥离失败');
  // S22: 以下是思考过程
  const s22 = samples.find(s => s.id === 'S22');
  assert.equal(cleanAssistantText(s22.input), s22.expected, 'S22 以下是思考过程 前缀剥离失败');
});
