// e2e-test-ssml.cjs — E1 SSML 子集 + E2 分块增强（真实浏览器执行 demo.html 生产代码）
// 运行：先 `npm run serve` 起静态服务器，再 `node e2e-test-ssml.cjs`
//
// 稳定性设计（v4.6.3 修复 flaky）：
//   原始实现 4 个用例共享同一个 page 并用固定 waitForTimeout 断言，导致
//   ① 上一用例的朗读闭环迟到完成，把「朗读完毕」写进状态栏，污染下一用例断言；
//   ② 未等应用初始化完成就 fill/click，行为取决于启动时序（CI 与本机不一致）。
//   现改为：每用例独立 page + 显式等 `window.__chattts` 就绪 + 轮询等目标状态出现，
//   并在 fill 后回读输入框值（若被意外覆盖，报错信息直接指出，而非隐晦失败）。
const { chromium } = require('playwright');
const assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

const BASE = 'http://localhost:8765';
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('✅ ' + name); }
  catch (e) { results.push({ name, status: 'FAIL', err: e.message }); console.log('❌ ' + name + ' — ' + e.message); }
}

// 轮询直到 fn() 返回真值（默认 8s，每 200ms 一次）；超时返回最后一次结果
async function until(fn, ms = 8000) {
  const deadline = Date.now() + ms;
  let last = null;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > deadline) return last;
    await new Promise(r => setTimeout(r, 200));
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // 每用例独立页面：等 DOMContentLoaded + 内联 module 就绪（__chattts 暴露后说明监听器已绑定）
  const newReadyPage = async () => {
    const p = await ctx.newPage();
    await p.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !!(window.__chattts && window.__chattts.version), null, { timeout: 10000 });
    return p;
  };
  // 每个用例开始前清空时间线，避免跨用例累计干扰
  const resetTimeline = (p) => p.evaluate(() => { try { localStorage.removeItem('tts_timeline_v1'); } catch (e) {} });
  const readTimeline = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('tts_timeline_v1') || '[]'));
  const stopSpeech = (p) => p.evaluate(() => { try { window.speechSynthesis.cancel(); } catch (e) {} });

  // === T_SPLIT_1: 公开工具 API + 分块无损 + SSML 解析（浏览器内真实执行）===
  await test('T_SPLIT_1 window.__chattts 公开 API：分块无损 + 段落边界 + SSML 解析', async () => {
    const page = await newReadyPage();
    try {
      const r = await page.evaluate(() => {
        const c = window.__chattts;
        if (!c) return { ok: false };
        const para = c.splitIntoChunks('AAAA\n\nBBBB');
        const src = '句子。'.repeat(400);
        const long = c.splitIntoChunks(src);
        const ssml = c.parseSSML('你好。<break time="2s"/>再见。');
        return {
          ok: true,
          version: c.version,
          paraLen: para.length,
          longMax: Math.max(...long.map(s => s.length)),
          longLossless: long.join('') === src,
          ssmlBreak: ssml.breaks[0] && ssml.breaks[0].ms,
          ssmlPlainHasTag: /<break/.test(ssml.plain)
        };
      });
      assert(r.ok, 'window.__chattts 公开 API 不存在');
      assert(r.longLossless, '分块非无损（join 后与原文不一致）');
      assert(r.paraLen === 2, '段落边界未按空行分块，实际=' + r.paraLen);
      assert(r.longMax <= 500, '硬切块超长: ' + r.longMax);
      assert(r.ssmlBreak === 2000, 'break 应解析为 2000ms，实际=' + r.ssmlBreak);
      assert(!r.ssmlPlainHasTag, 'plain 不应残留标签');
      console.log('   version=' + r.version + ' paraLen=' + r.paraLen + ' longMax=' + r.longMax);
    } finally { await page.close(); }
  });

  // === T_SSML_1: 合法 SSML 朗读 → 解析成功事件入时间线，状态栏不泄漏标签 ===
  await test('T_SSML_1 合法 SSML 朗读：解析成功入时间线 + 状态栏无标签泄漏', async () => {
    const page = await newReadyPage();
    try {
      await resetTimeline(page);
      const SSML_INPUT = '<prosody rate="slow">你好，这是 SSML 测试。</prosody>';
      await page.fill('#tts-input', SSML_INPUT);
      const echoed = await page.inputValue('#tts-input');
      assert(echoed === SSML_INPUT, '输入框内容被意外覆盖（回读不一致）: ' + JSON.stringify(echoed));
      await page.click('#speak-btn');
      // 解析事件在 speak() 首个同步段写入，无需等合成；轮询容忍存储/事件循环时序
      const hasSsml = await until(async () => (await readTimeline(page)).some(e => e.kind === 'ssml' && e.ok));
      const tl = await readTimeline(page);
      console.log('   时间线条目数=' + tl.length + ' 含 ssml 事件=' + !!hasSsml);
      assert(hasSsml, '时间线未记录 ssml 解析成功事件（条目=' + JSON.stringify(tl.map(e => e.kind)) + '）');
      const status = (await page.textContent('#tts-status')) || '';
      console.log('   状态: ' + String(status).slice(0, 90));
      assert(!/<(?:break|prosody|emphasis)/i.test(status), '状态栏泄漏 SSML 标签: ' + status);
      await stopSpeech(page);
    } finally { await page.close(); }
  });

  // === T_SSML_2: 非法 SSML → 可读错误 + 不进入朗读 + 按钮不卡禁用 ===
  await test('T_SSML_2 非法 SSML：给出可读错误且不启动朗读', async () => {
    const page = await newReadyPage();
    try {
      await resetTimeline(page);
      await page.fill('#tts-input', '<break time="abc"/>你好');
      await page.click('#speak-btn');
      const status = (await until(async () => {
        const s = (await page.textContent('#tts-status')) || '';
        return /SSML 解析错误/.test(s) ? s : null;
      }, 3000)) || '';
      const notice = (await page.textContent('#tts-notice')) || '';
      const tl = await readTimeline(page);
      console.log('   状态: ' + String(status).slice(0, 90));
      assert(/SSML 解析错误/.test(status), '非法 SSML 未给出可读错误: ' + status);
      assert(/SSML 解析错误/.test(notice || ''), '未通过 alert 通知用户: ' + notice);
      assert(!tl.some(e => e.kind === 'ssml'), '非法 SSML 不应记录 ssml 成功事件');
      const disabled = await page.isDisabled('#speak-btn');
      assert(!disabled, '非法 SSML 后朗读按钮不应卡在禁用态');
    } finally { await page.close(); }
  });

  // === T_SSML_3: 无 SSML 的普通文本不受影响（回归）===
  await test('T_SSML_3 普通文本（无 SSML）不触发解析路径', async () => {
    const page = await newReadyPage();
    try {
      await resetTimeline(page);
      await page.fill('#tts-input', '这是一段没有标签的普通文本。');
      await page.click('#speak-btn');
      // 等闭环有动静（状态栏出现非初始文案）后再断言「没有 ssml 事件」
      await until(async () => {
        const s = (await page.textContent('#tts-status')) || '';
        return s.trim().length > 0 && !/^请先输入/.test(s.trim());
      }, 3000);
      const tl = await readTimeline(page);
      assert(!tl.some(e => e.kind === 'ssml'), '普通文本不应产生 ssml 事件');
      await stopSpeech(page);
    } finally { await page.close(); }
  });

  await browser.close();
  const fails = results.filter(r => r.status === 'FAIL');
  console.log('\n总计: ' + (results.length - fails.length) + ' 通过, ' + fails.length + ' 失败 / ' + results.length + ' 项');
  if (fails.length) { fails.forEach(f => console.log('  ' + f.name + ': ' + f.err)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('E2E-SSML CRASH: ' + e); process.exit(1); });
