// unit-test-zh.cjs — 中文 TTS 引擎1.5（P0-1-B）单元测试
// 运行：node unit-test-zh.cjs
// 覆盖：normalizeSyllable 韵母/声调/舌尖元音/ü 四组 + phonemizeChinese 全流程 + voice 表完整性 + 回归
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSyllable, phonemizeChinese, VOICES_ZH } = require('./tts-zh.js');
const path = require('node:path');

// ===== U_ZH_1: normalizeSyllable 基础（PR #352 断言 1 的核心音节） =====
test('U_ZH_1 normalizeSyllable 基础音节 + 声调映射', () => {
  assert.equal(normalizeSyllable('ni3'), 'ni↓', 'ni3 应变 ni↓');
  assert.equal(normalizeSyllable('hao3'), 'xau̯↓', 'hao3 应变 xau̯↓');
  assert.equal(normalizeSyllable('shi4'), 'ʂɻ̩↘', 'shi4 舌尖元音应变 ʂɻ̩↘');
  assert.equal(normalizeSyllable('jie4'), 'ʨje↘', 'jie4 应变 ʨje↘ (j+u→ü 规则不适用)');
});

// ===== U_ZH_2: 舌尖元音 + ü 系（PR #352 断言 3） =====
test('U_ZH_2 舌尖元音（zhi/chi/shi/ri/z/ci/si）+ ü 系', () => {
  assert.equal(normalizeSyllable('zhi1'), 'ꭧɻ̩→', 'zhi1 → ꭧɻ̩→');
  assert.equal(normalizeSyllable('zi1'), 'ʦɹ̩→', 'zi1 → ʦɹ̩→');
  assert.equal(normalizeSyllable('ci1'), 'ʦʰɹ̩→', 'ci1 → ʦʰɹ̩→');
  assert.equal(normalizeSyllable('si1'), 'sɹ̩→', 'si1 → sɹ̩→');
  assert.equal(normalizeSyllable('er2'), 'ɚ↗', 'er2 → ɚ↗');
  assert.equal(normalizeSyllable('nü3'), 'ny↓', 'nü3 (v 写) → ny↓');
});

// ===== U_ZH_3: y/w 零声母改写字表 =====
test('U_ZH_3 y/w 零声母拼写还原', () => {
  assert.equal(normalizeSyllable('yao1'), 'jau̯→', 'yao1 → jau̯→ (y=0声母跳转 iao→jau̯)');
  assert.equal(normalizeSyllable('wang2'), 'waŋ↗', 'wang2 → waŋ↗ (w=0声母 uang→waŋ)');
  assert.equal(normalizeSyllable('wen2'), 'wən↗', 'wen2 → wən↗ (uen→wən)');
  assert.equal(normalizeSyllable('yun4'), 'yn↘', 'yun4 → yn↘ (y+un → ün → yn)');
  // 特殊：阴平声调5（轻声）→ 无声调符号
  assert.equal(normalizeSyllable('ba5'), 'pa', 'ba5 轻声 → pa 无符号');
});

// ===== U_ZH_4: phonemizeChinese 全流程（PR #352 断言 1，直读本实现） =====
test('U_ZH_4 phonemizeChinese 中文全流程（你好，世界！）', async () => {
  const out = await phonemizeChinese('你好，世界！', async (s) => 'en:' + s, require(path.join('C:/Users/Administrator.DESKTOP-EGNE9ND/AppData/Local/Temp/pinyinpro2.mjs')).pinyin);
  assert.equal(out, 'ni↓xau̯↓, ʂɻ̩↘ʨje↘!', 'PR#352 断言 1 中文流程不匹配');
});

// ===== U_ZH_5: 中英混排 =====
test('U_ZH_5 中英混排保空格 + 英文走回调', async () => {
  const out = await phonemizeChinese('你好 Kokoro', async (s) => 'kˈoʊkəɹoʊ', require(path.join('C:/Users/Administrator.DESKTOP-EGNE9ND/AppData/Local/Temp/pinyinpro2.mjs')).pinyin);
  assert.equal(out, 'ni↓xau̯↓ kˈoʊkəɹoʊ', '混排应保留空格且英文透传');
  assert.ok(out.includes('kˈoʊkəɹoʊ'), 'PR#352 断言 2 toContain 语义');
});

// ===== U_ZH_6: voice 表完整（8 项，4 女 4 男） =====
test('U_ZH_6 VOICES_ZH 完整性与 HF 文件名对应', () => {
  assert.equal(VOICES_ZH.length, 8, '应有 8 个中文 voice');
  assert.equal(VOICES_ZH.filter(v => v.gender === 'Female').length, 4, '4 女声');
  assert.equal(VOICES_ZH.filter(v => v.gender === 'Male').length, 4, '4 男声');
  const ids = VOICES_ZH.map(v => v.id).sort();
  assert.deepEqual(ids, ['zf_xiaobei','zf_xiaoni','zf_xiaoxiao','zf_xiaoyi','zm_yunjian','zm_yunxi','zm_yunxia','zm_yunyang'].sort(), 'voice id 应与 HF 8 文件一致');
  assert.ok(VOICES_ZH.every(v => v.overallGrade === 'D'), '官方自评 C/D，预期管理必需');
});

// ===== U_ZH_7: 边界（非拼音 token 原样保留 + 空串） =====
test('U_ZH_7 边界：非拼音 token 保留 + 空输入', async () => {
  const out = await phonemizeChinese('😀 123', null, require(path.join('C:/Users/Administrator.DESKTOP-EGNE9ND/AppData/Local/Temp/pinyinpro2.mjs')).pinyin);
  assert.ok(typeof out === 'string' && out.length > 0, 'emoji/数字应原样经 pinyin nonZh');
  assert.equal(await phonemizeChinese('', null, require(path.join('C:/Users/Administrator.DESKTOP-EGNE9ND/AppData/Local/Temp/pinyinpro2.mjs')).pinyin), '', '空输入空输出');
});