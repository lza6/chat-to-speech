// tts-zh.js — 中文 TTS 拼音→IPA 音素化（WASM 引擎1.5 路线 B 核心，v4.2 P0-1-B）
// 来源：2026-09-07 从 hexgrad/kokoro PR #352 diff（closed-unmerged，分支已删但 diff 可取回）
//   移植 phonemize-zh.js（105 行）+ voices.js（8 中文 voice）+ kokoro.js language:'z' 分流
//   详见 优化计划/下一步改进指南-v4.2升级版.md 第四节 4.2
// 依赖：pinyin-pro（汉字→带调数字拼音），经 esm.sh 动态 import（V11 已测 200 + pinyin() 可用）
// 本文件为 Node 可测的纯函数模块；浏览器端同逻辑内联进 demo.html（无构建，保持单文件部署）

// ---- 声母→IPA（PR #352 INITIALS 表，21 项） ----
const INITIALS = {
  b: "p", c: "ʦʰ", ch: "ꭧʰ", d: "t", f: "f", g: "k", h: "x",
  j: "ʨ", k: "kʰ", l: "l", m: "m", n: "n", p: "pʰ", q: "ʨʰ",
  r: "ɻ", s: "s", sh: "ʂ", t: "tʰ", x: "ɕ", z: "ʦ", zh: "ꭧ",
};

// ---- 韵母→IPA（PR #352 FINALS 表，30+ 项，含 ü 系与声母组合特例） ----
const FINALS = {
  a: "a", ai: "ai̯", an: "an", ang: "aŋ", ao: "au̯",
  e: "ɤ", ei: "ei̯", en: "ən", eng: "əŋ", er: "ɚ",
  i: "i", ia: "ja", ian: "jɛn", iang: "jaŋ", iao: "jau̯",
  ie: "je", in: "in", iou: "jou̯", ing: "iŋ", iong: "jʊŋ",
  o: "wo", ong: "ʊŋ", ou: "ou̯",
  u: "u", ua: "wa", uai: "wai̯", uan: "wan", uang: "waŋ",
  uei: "wei̯", uen: "wən", ueng: "wəŋ", uo: "wo",
  ü: "y", üe: "ɥe", üan: "ɥɛn", ün: "yn",
};

// ---- 声调→Kokoro 音调符号（数字拼音 1-5） ----
const TONES = { 1: "→", 2: "↗", 3: "↓", 4: "↘", 5: "" };

// ---- 声母正则（最长优先：zh/ch/sh 先于单字母） ----
const INITIAL_PATTERN = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/;

/**
 * 单个带调拼音音节 → Kokoro IPA。
 * 例：ni3 → ni↓ ; xau3 → xau̯↓ ; shi4 → ʂɻ̩↘（舌尖元音特例）
 * 例：nv3 → ny↓ ; er2 → ɚ↗（ü 处理）
 * @param {string} syllable 带调拼音（如 "ni3")
 * @returns {string|null} IPA（非拼音 token 返回 null）
 */
function normalizeSyllable(syllable) {
  const match = String(syllable).toLowerCase().match(/^([a-züvê]+)([1-5])$/u);
  if (!match) return null;
  let [, body, tone] = match;
  body = body.replaceAll("v", "ü");

  let initial = body.match(INITIAL_PATTERN)?.[0] ?? "";
  let final = body.slice(initial.length);

  // y/w 零声母改写字表（拼音拼写规则还原）
  if (initial === "y") {
    const yFinals = {
      i: "i", a: "ia", ao: "iao", e: "ie", ou: "iou", an: "ian",
      in: "in", ang: "iang", ing: "ing", ong: "iong", u: "ü",
      ue: "üe", uan: "üan", un: "ün",
    };
    final = yFinals[final] ?? final;
    initial = "";
  } else if (initial === "w") {
    const wFinals = {
      u: "u", a: "ua", o: "uo", ai: "uai", ei: "uei",
      an: "uan", en: "uen", ang: "uang", eng: "ueng",
    };
    final = wFinals[final] ?? final;
    initial = "";
  } else {
    // 韵母拼写省略还原
    if (final === "iu") final = "iou";
    if (final === "ui") final = "uei";
    if (final === "un") final = ["j", "q", "x"].includes(initial) ? "ün" : "uen";
    // j/q/x + u → ü（ü 上两点省略规则还原）
    if (["j", "q", "x"].includes(initial) && final.startsWith("u")) {
      final = `ü${final.slice(1)}`;
    }
  }

  // 舌尖元音特例：zhi/chi/shi/ri → ɻ̩ ; zi/ci/si → ɹ̩
  if (final === "i" && ["zh", "ch", "sh", "r"].includes(initial)) final = "ɻ̩";
  if (final === "i" && ["z", "c", "s"].includes(initial)) final = "ɹ̩";

  const initialIpa = INITIALS[initial] ?? "";
  const finalIpa = FINALS[final] ?? final;
  return `${initialIpa}${finalIpa}${TONES[Number(tone)]}`;
}

// ---- 全角标点→半角+空格（保证 Kokoro 音素序列的停顿分隔） ----
function mapPunctuation(text) {
  return String(text)
    .replace(/[、，]/g, ", ")
    .replace(/[。．]/g, ". ")
    .replace(/！/g, "! ")
    .replace(/：/g, ": ")
    .replace(/；/g, "; ")
    .replace(/？/g, "? ")
    .replace(/[«《「【]/g, " “")
    .replace(/[»》」】]/g, "” ")
    .replace(/（/g, " (")
    .replace(/）/g, ") ");
}

/**
 * 中文文本 → Kokoro 兼容 IPA 序列。
 * 汉字走 pinyin-pro 数字拼音→normalizeSyllable；英文片段透传给 englishPhonemize 回调。
 * 混排时英文前补空格，避免中文拼音与英文音素粘连（PR #352 断言 toContain 语义的落地）。
 * @param {string} text
 * @param {(t: string) => Promise<string>} [englishPhonemize] espeak 回调（透传英文→IPA）
 * @param {Function} [pinyinFn] pinyin-pro 的 pinyin 函数（注入，便于测试桩）
 * @returns {Promise<string>}
 */
async function phonemizeChinese(text, englishPhonemize, pinyinFn) {
  const pinyin = pinyinFn || (await loadPinyinPro()).pinyin;
  const tokens = pinyin(mapPunctuation(text), {
    toneType: "num",
    type: "array",
    nonZh: "consecutive",
  });

  const output = [];
  for (const token of tokens) {
    const ipa = normalizeSyllable(token);
    if (ipa) {
      output.push(ipa);
    } else if (englishPhonemize && /[A-Za-z]/.test(token)) {
      output.push(" " + (await englishPhonemize(String(token).trim())));
    } else {
      output.push(token);
    }
  }
  return output.join("").replace(/\s+/g, " ").trim();
}

// ---- 动态加载 pinyin-pro（esm.sh，浏览器/Node 通用） ----
let _pinyinMod = null;
async function loadPinyinPro() {
  if (_pinyinMod) return _pinyinMod;
  try {
    _pinyinMod = await import(/* @vite-ignore */ "https://esm.sh/pinyin-pro@3.28.2");
    return _pinyinMod;
  } catch (_) {
    // V11 门禁失败回退：本地 vendor（engines/pinyin-pro.mjs）或直接抛错交由调用方降级
    try {
      const mod = await import(/* @vite-ignore */ "./engines/pinyin-pro.mjs");
      _pinyinMod = mod;
      return mod;
    } catch (_2) {
      throw new Error("pinyin-pro 不可用：中文引擎无法启动");
    }
  }
}

// ---- 中文 8 voice 表（与 HF onnx-community/Kokoro-82M-v1.0-ONNX/voices/*.bin 一一对应，已验证） ----
const VOICES_ZH = [
  { id: "zf_xiaobei", name: "Xiaobei", lang: "zh", gender: "Female", targetQuality: "C", overallGrade: "D" },
  { id: "zf_xiaoni", name: "Xiaoni", lang: "zh", gender: "Female", targetQuality: "C", overallGrade: "D" },
  { id: "zf_xiaoxiao", name: "Xiaoxiao", lang: "zh", gender: "Female", targetQuality: "C", overallGrade: "D" },
  { id: "zf_xiaoyi", name: "Xiaoyi", lang: "zh", gender: "Female", targetQuality: "C", overallGrade: "D" },
  { id: "zm_yunjian", name: "Yunjian", lang: "zh", gender: "Male", targetQuality: "C", overallGrade: "D" },
  { id: "zm_yunxi", name: "Yunxi", lang: "zh", gender: "Male", targetQuality: "C", overallGrade: "D" },
  { id: "zm_yunxia", name: "Yunxia", lang: "zh", gender: "Male", targetQuality: "C", overallGrade: "D" },
  { id: "zm_yunyang", name: "Yunyang", lang: "zh", gender: "Male", targetQuality: "C", overallGrade: "D" },
];

module.exports = {
  normalizeSyllable,
  mapPunctuation,
  phonemizeChinese,
  VOICES_ZH,
  loadPinyinPro,
};