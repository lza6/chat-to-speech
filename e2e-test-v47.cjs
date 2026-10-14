// e2e-test-v47.cjs — v4.7 批次（E3 听写 / E4 可视化 / E5 试听 / E6 语速 / E7 i18n / X-1 版本徽章 / V5-11 状态机接线）
// 运行：先 `npm run serve` 起静态服务器，再 `node e2e-test-v47.cjs`
// 稳定性设计与 v4.6.3 铁则一致：每用例独立 page + 显式等 __chattts 就绪 + 轮询断言（禁止固定 sleep）。
// 外部端点（speech.ai.unturf.com）用 Playwright 路由替身 mock：/v1/voices 返回语音列表、
// /v1/audio/speech 返回 2s 静音 WAV。mock 只替代外部 HTTP，不替代任何产品逻辑。
const { chromium } = require('playwright');
const assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

const BASE = 'http://localhost:8765';
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('✅ ' + name); }
  catch (e) { results.push({ name, status: 'FAIL', err: e.message }); console.log('❌ ' + name + ' — ' + e.message); }
}
async function until(fn, ms = 8000) {
  const deadline = Date.now() + ms;
  let last = null;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > deadline) return last;
    await new Promise(r => setTimeout(r, 120));
  }
}

// 2s 静音单声道 16bit 8000Hz WAV（极小，用于让音频管线真实出声并触发 ended）
function makeWav(seconds = 2) {
  const sr = 8000, ch = 1, bits = 16;
  const dataLen = sr * seconds * ch * (bits / 8);
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * (bits / 8), 28); buf.writeUInt16LE(ch * (bits / 8), 32); buf.writeUInt16LE(bits, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  return buf;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN' });

  const newReadyPage = async (c) => {
    const p = await c.newPage();
    await p.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !!(window.__chattts && window.__chattts.version), null, { timeout: 10000 });
    return p;
  };
  const newMockedContext = async () => {
    const c = await browser.newContext({ locale: 'zh-CN' });
    await c.route('**/v1/audio/speech', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: makeWav(2) }));
    await c.route('**/v1/voices', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ voices: ['aria', 'atlas', 'foxhop'] }] }) }));
    return c;
  };

  // === T_VER_1: 版本徽章与真源一致（X-1） ===
  // 修复（2026-10-14）：原断言硬编码 '4.7.0'，每次升版必挂 —— 与 P-1「版本真源治理」自相矛盾。
  // 改为读 VERSION 真源文件，使本用例在任何版本下都有效。
  const EXPECT_VER = require('node:fs').readFileSync(require('node:path').join(__dirname, 'VERSION'), 'utf8').trim();
  await test('T_VER_1 版本徽章 == __chattts.version == VERSION 真源，且默认中文', async () => {
    const page = await newReadyPage(ctx);
    try {
      const info = await page.evaluate(() => ({
        badge: (document.getElementById('nav-badge') || {}).textContent, ver: window.__chattts.version, lang: document.documentElement.lang
      }));
      assert(info.ver === EXPECT_VER, '__chattts.version 应为 VERSION 真源 ' + EXPECT_VER + '，实际=' + info.ver);
      assert(info.badge === 'v' + info.ver, '徽章应显示 v' + info.ver + '，实际=' + info.badge);
      assert(/^zh/i.test(info.lang), '默认应为中文，实际=' + info.lang);
    } finally { await page.close(); }
  });

  // === T_I18N_1: 切换英文后界面全英（E7） ===
  await test('T_I18N_1 切换英文：导航/标题/按钮/语言全英', async () => {
    const page = await newReadyPage(ctx);
    try {
      const zh = await page.evaluate(() => ({
        brand: document.querySelector('.brand span[data-i18n]').textContent, h1: document.querySelector('h1').textContent
      }));
      assert(zh.brand.includes('在线聊天转语音'), '默认应显示中文品牌');
      await page.click('#lang-btn');
      await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 });
      const en = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        brand: document.querySelector('.brand span[data-i18n]').textContent,
        h1: document.querySelector('h1').textContent,
        h2: document.querySelector('#speak h2').textContent,
        btn: document.getElementById('speak-btn').textContent,
        nav: document.querySelector('.nav-links a').textContent
      }));
      assert(en.lang === 'en', 'html lang 应为 en');
      assert(en.brand === 'Online Chat TTS', '品牌应译英，实际=' + en.brand);
      assert(en.h1.includes('Online Chat to Speech'), 'h1 应译英');
      assert(en.h2 === 'Any Text to Speech', '朗读区标题应译英，实际=' + en.h2);
      assert(en.btn.includes('Read aloud'), '朗读按钮应译英，实际=' + en.btn);
      assert(en.nav === 'Read', '导航首项应译英，实际=' + en.nav);
    } finally { await page.close(); }
  });

  // === T_SPEED_1: 语速预设 + 每语音记忆（E6） ===
  await test('T_SPEED_1 预设生效 + 每语音语速记忆恢复', async () => {
    const page = await newReadyPage(ctx);
    try {
      await page.evaluate(() => {
        localStorage.removeItem('tts_cfg_v1');
        Object.keys(localStorage).filter(k => k.startsWith('tts_speed_')).forEach(k => localStorage.removeItem(k));
      });
      // 回归初始态（不 reload，避免网络等待 load 事件；直接用公开 API 复位）
      await page.evaluate(() => { try { const s = document.getElementById('speed-slider'); s.value = '1'; } catch (_) {} });
      // 点预设 2 → 滑块 + 配置 + aria 记忆 + 高亮
      await page.click('.speed-preset[data-speed="2"]');
      let s = await page.evaluate(() => ({
        v: document.getElementById('speed-slider').value,
        cfg: JSON.parse(localStorage.getItem('tts_cfg_v1') || '{}').speed,
        mem: localStorage.getItem('tts_speed_aria'),
        active: !!document.querySelector('.speed-preset.active')
      }));
      assert(s.v === '2', '滑块应为 2，实际=' + s.v);
      assert(s.cfg === 2, '配置应持久化 2');
      assert(s.mem === '2', 'aria 语音记忆应为 2');
      assert(s.active, '应有预设高亮');
      // 切到 atlas → 无记忆 → 回退 cfg.speed=2
      await page.selectOption('#voice-select', 'atlas');
      await page.waitForFunction(() => document.getElementById('speed-slider').value === '2', null, { timeout: 5000 });
      // 点 0.75 → atlas 记忆 0.75
      await page.click('.speed-preset[data-speed="0.75"]');
      s = await page.evaluate(() => ({
        v: document.getElementById('speed-slider').value,
        mem: localStorage.getItem('tts_speed_atlas')
      }));
      assert(s.v === '0.75' && s.mem === '0.75', 'atlas 应记忆 0.75，实际=' + JSON.stringify(s));
      // 切回 aria → 恢复 aria 记忆 2
      await page.selectOption('#voice-select', 'aria');
      await page.waitForFunction(() => document.getElementById('speed-slider').value === '2', null, { timeout: 5000 });
    } finally { await page.close(); }
  });

  // === T_VIZ_1: 朗读时可视化画布非空（E4） ===
  await test('T_VIZ_1 朗读时频谱画布有非空像素', async () => {
    const ctxM = await newMockedContext();
    const page = await newReadyPage(ctxM);
    try {
      await page.fill('#tts-input', '可视化测试内容。');
      await page.click('#speak-btn');
      const got = await until(async () => {
        return page.evaluate(() => {
          const cv = document.getElementById('viz-canvas');
          if (!cv) return false;
          const c = cv.getContext('2d');
          const d = c.getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
          return false;
        });
      }, 15000);
      assert(got, '朗读中可视化画布应有非空像素');
    } finally { await page.close(); await ctxM.close(); }
  });

  // === T_VIZ_2: 停止后可视化清空（E4） ===
  await test('T_VIZ_2 停止后频谱画布清空', async () => {
    const ctxM = await newMockedContext();
    const page = await newReadyPage(ctxM);
    try {
      await page.fill('#tts-input', '可视化停止测试内容。');
      await page.click('#speak-btn');
      await until(async () => page.evaluate(() => {
        const cv = document.getElementById('viz-canvas');
        if (!cv) return false;
        const c = cv.getContext('2d');
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
        return false;
      }), 15000);
      await page.click('#stop-btn');
      const cleared = await until(async () => page.evaluate(() => {
        const cv = document.getElementById('viz-canvas');
        if (!cv) return true;
        const c = cv.getContext('2d');
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
        return true;
      }), 6000);
      assert(cleared, '停止后可视化应清空');
    } finally { await page.close(); await ctxM.close(); }
  });

  // === T_SR_1: 听写结果回填（stub SpeechRecognition，替代浏览器 API 而非产品逻辑） ===
  await test('T_SR_1 语音听写结果回填输入框', async () => {
    const ctxS = await browser.newContext({ locale: 'zh-CN' });
    await ctxS.addInitScript(() => {
      window.SpeechRecognition = class {
        constructor() { this.onresult = null; this.onend = null; }
        start() { setTimeout(() => { if (this.onresult) this.onresult({ results: [[{ transcript: '你好世界' }]] }); if (this.onend) this.onend(); }, 60); }
        stop() { if (this.onend) this.onend(); }
      };
      window.webkitSpeechRecognition = window.SpeechRecognition;
    });
    const page = await newReadyPage(ctxS);
    try {
      await page.click('#dictate-btn');
      const ok = await until(async () => (await page.inputValue('#tts-input')).includes('你好世界'), 8000);
      assert(ok, '听写结果未回填输入框');
      const reset = await until(async () => !(await page.evaluate(() => document.getElementById('dictate-btn').classList.contains('recording'))), 8000);
      assert(reset, '听写结束后按钮应复位 recording 态');
    } finally { await page.close(); await ctxS.close(); }
  });

  // === T_SR_2: 不支持时诚实降级（E3） ===
  await test('T_SR_2 不支持语音听写时给出降级文案', async () => {
    // 独立 context：避免共享 context 里 T_I18N_1 留下的 en 语言串扰（v4.6.3 隔离铁则）
    const ctxI = await browser.newContext({ locale: 'zh-CN' });
    const page = await newReadyPage(ctxI);
    try {
      const n = await page.evaluate(() => {
        try { localStorage.removeItem('tts_lang_v1'); window.__chattts.setLang('zh'); window.__chattts.applyI18n(); } catch (_) {}
        try { Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); } catch (_) {}
        try { Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); } catch (_) {}
        window.__chattts.startDictation();
        return document.getElementById('tts-notice').textContent;
      });
      assert(n && n.includes('不支持语音听写'), '应显示“不支持语音听写”降级，实际=' + n);
    } finally { await page.close(); await ctxI.close(); }
  });

  // === T_AUD_1: 切换语音触发试听（E5） ===
  await test('T_AUD_1 切换语音触发试听记录', async () => {
    const ctxM = await newMockedContext();
    const page = await newReadyPage(ctxM);
    try {
      await page.selectOption('#voice-select', 'atlas');
      const r = await until(async () => page.evaluate(() => (window.__chattts && window.__chattts.lastPreview) || null), 8000);
      assert(r && r.voice === 'atlas', '切换语音应触发试听，实际=' + JSON.stringify(r));
    } finally { await page.close(); await ctxM.close(); }
  });

  const fails = results.filter(r => r.status === 'FAIL');
  console.log(`总计: ${results.length} 通过, ${fails.length} 失败 / ${results.length} 项`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
