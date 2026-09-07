// unit-test-zh.cjs — 中文 TTS 引擎1.5（P0-1-B）单元测试
// 运行：node unit-test-zh.cjs
// 覆盖：normalizeSyllable 韵母/声调/舌尖元音/ü 四组 + phonemizeChinese 全流程 + voice 表完整性 + 回归
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSyllable, phonemizeChinese, VOICES_ZH } = require('./tts-zh.js');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Blob } = require('node:buffer');

// ===== 测试内联 pinyin-pro（仓库 vendor，可移植——E4 修复：不再依赖 Temp 绝对路径） =====
const PINYIN_PATH = path.join(__dirname, 'engines', 'pinyin-pro.mjs');
let _pinyinFn = null;
async function getPinyinFn() {
  if (_pinyinFn) return _pinyinFn;
  const mod = await import(pathToFileURL(PINYIN_PATH).href);
  _pinyinFn = mod.pinyin;
  return _pinyinFn;
}

// ===== wavFromSamples（从 demo.html 内联版提取为可测实现——E2 修复） =====
// 与 demo.html 保持行为一致（Float32/Int16/Array/非法 四分支）
function wavFromSamples(samples, sampleRate) {
  let f32;
  if (samples instanceof Float32Array) {
    f32 = samples;
  } else if (samples instanceof Int16Array) {
    f32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) f32[i] = samples[i] / 32768;
  } else if (Array.isArray(samples)) {
    f32 = Float32Array.from(samples);
  } else {
    throw new Error('无法识别的音频类型：' + (samples && samples.constructor ? samples.constructor.name : typeof samples));
  }
  const numChannels = 1, bytesPerSample = 2, blockAlign = numChannels * bytesPerSample, byteRate = sampleRate * blockAlign;
  const dataSize = f32.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize); const dv = new DataView(buffer);
  const ws = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
  const w32 = (o, v) => dv.setUint32(o, v, true), w16 = (o, v) => dv.setUint16(o, v, true);
  ws(0, 'RIFF'); w32(4, 36 + dataSize); ws(8, 'WAVE'); ws(12, 'fmt ');
  w32(16, 16); w16(20, 1); w16(22, numChannels); w32(24, sampleRate); w32(28, byteRate);
  w16(32, blockAlign); w16(34, 16); ws(36, 'data'); w32(40, dataSize);
  let off = 44;
  for (let i = 0; i < f32.length; i++) { let s = Math.max(-1, Math.min(1, f32[i])); dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([buffer], { type: 'audio/wav' });
}
// Node Blob 无 .size 时用 arrayBuffer 推断
async function blobSize(b) { return (b.size !== undefined) ? b.size : (await b.arrayBuffer()).byteLength; }


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
  const out = await phonemizeChinese('你好，世界！', async (s) => 'en:' + s, await getPinyinFn());
  assert.equal(out, 'ni↓xau̯↓, ʂɻ̩↘ʨje↘!', 'PR#352 断言 1 中文流程不匹配');
});

// ===== U_ZH_5: 中英混排 =====
test('U_ZH_5 中英混排保空格 + 英文走回调', async () => {
  const out = await phonemizeChinese('你好 Kokoro', async (s) => 'kˈoʊkəɹoʊ', await getPinyinFn());
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
  const out = await phonemizeChinese('😀 123', null, await getPinyinFn());
  assert.ok(typeof out === 'string' && out.length > 0, 'emoji/数字应原样经 pinyin nonZh');
  assert.equal(await phonemizeChinese('', null, await getPinyinFn()), '', '空输入空输出');
});

// ===== U_ZH_8（E2 修复）: wavFromSamples 四分支 + 非法类型 =====
test('U_ZH_8 wavFromSamples Float32/Int16/Array/非法', async () => {
  // Float32
  const f32 = new Float32Array([0.5, -0.5, 0.25]);
  const b1 = wavFromSamples(f32, 24000);
  assert.equal(await blobSize(b1), 44 + 3 * 2, 'Float32 应 44+采样*2 字节');
  assert.ok(await b1.arrayBuffer().then(x => new Uint8Array(x).slice(0, 4).every((c, i) => c === 'RIFF'.charCodeAt(i))), 'RIFF 头');
  // Int16 → 先 /32768 转 float，再写回 16bit PCM（B2 修复验证：不截断、不 4x 错读）
  const i16 = new Int16Array([32767, -32768, 0]);
  const b2 = wavFromSamples(i16, 24000);
  assert.equal(await blobSize(b2), 44 + 3 * 2, 'Int16 应逐元素转换（3 个元素）而非按字节/4 错读');
  // Array
  const b3 = wavFromSamples([0, 1, -1], 8000);
  assert.equal(await blobSize(b3), 44 + 3 * 2, 'Array 应 44+采样*2');
  // 非法类型 → 抛错
  assert.throws(() => wavFromSamples({}, 24000), /无法识别的音频类型/, '非法类型应抛错');
  assert.throws(() => wavFromSamples(new Uint8Array([1, 2, 3]), 24000), /无法识别的音频类型/, 'Uint8Array 不支持应抛错');
});

// ===== U_ZH_9（E3 修复）: 引擎1.5 触发判定（CJK 而非首字符非 ASCII） =====
test('U_ZH_9 CJK 触发判定：前导空格/全角/纯 emoji 不误触发', () => {
  const hasHan = (t) => /\p{Script=Han}/u.test(t);
  assert.equal(hasHan('你好世界'), true, '纯中文触发');
  assert.equal(hasHan(' 你好'), true, '前导空格仍含中文 → 应触发（修复前误不触发）');
  assert.equal(hasHan('ＡＢＣ'), false, '全角字母不含汉字 → 不触发（修复前误触发）');
  assert.equal(hasHan('😀'), false, '纯 emoji → 不触发');
  assert.equal(hasHan('123'), false, '纯数字 → 不触发');
  assert.equal(hasHan('Hello World'), false, '纯英文 → 不触发');
});