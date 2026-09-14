// e2e-test-ssml.cjs — E1 SSML 子集 + E2 分块增强（真实浏览器执行 demo.html 生产代码）
// 运行：先 `npm run serve` 起静态服务器，再 `node e2e-test-ssml.cjs`
const { chromium } = require('playwright');
const assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

const BASE = 'http://localhost:8765';
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('✅ ' + name); }
  catch (e) { results.push({ name, status: 'FAIL', err: e.message }); console.log('❌ ' + name + ' — ' + e.message); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERR: ' + e.message));

  await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // === T_SPLIT_1: 公开工具 API + 分块无损 + SSML 解析（浏览器内真实执行）===
  await test('T_SPLIT_1 window.__chattts 公开 API：分块无损 + 段落边界 + SSML 解析', async () => {
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
        hasSplit: typeof c.splitIntoChunks === 'function',
        hasSsml: typeof c.parseSSML === 'function',
        paraLen: para.length,
        paraJoin: para.join(''),
        longMax: Math.max.apply(null, long.map(x => x.length)),
        longLossless: long.join('') === src,
        ssmlBreak: ssml.breaks[0] && ssml.breaks[0].ms,
        ssmlPlainHasTag: /<break/.test(ssml.plain)
      };
    });
    assert(r.ok, 'window.__chattts 未暴露');
    assert(r.hasSplit && r.hasSsml, 'API 缺少 splitIntoChunks/parseSSML');
    assert(r.paraLen === 2, '段落边界应切成 2 块，实际=' + r.paraLen);
    assert(r.paraJoin === 'AAAA\n\nBBBB', '分块必须无损');
    assert(r.longMax <= 500, '块长应 <= 500，实际最大=' + r.longMax);
    assert(r.longLossless, '超长文本分块必须无损');
    assert(r.ssmlBreak === 2000, 'break 应解析为 2000ms，实际=' + r.ssmlBreak);
    assert(!r.ssmlPlainHasTag, 'plain 不应残留标签');
    console.log('   version=' + r.version + ' paraLen=' + r.paraLen + ' longMax=' + r.longMax);
  });

  // === T_SSML_1: 合法 SSML 朗读 → 解析成功事件入时间线，状态栏不泄漏标签 ===
  await test('T_SSML_1 合法 SSML 朗读：解析成功入时间线 + 状态栏无标签泄漏', async () => {
    await page.evaluate(() => { try { localStorage.removeItem('tts_timeline_v1'); } catch (e) {} });
    await page.fill('#tts-input', '<prosody rate="slow">你好，这是 SSML 测试。</prosody>');
    await page.click('#speak-btn');
    await page.waitForTimeout(4500);
    const tl = await page.evaluate(() => JSON.parse(localStorage.getItem('tts_timeline_v1') || '[]'));
    const hasSsml = tl.some(e => e.kind === 'ssml' && e.ok);
    const status = await page.textContent('#tts-status');
    console.log('   时间线条目数=' + tl.length + ' 含 ssml 事件=' + hasSsml);
    console.log('   状态: ' + String(status).slice(0, 90));
    assert(hasSsml, '时间线未记录 ssml 解析成功事件');
    assert(!/<(?:break|prosody|emphasis)/i.test(status), '状态栏泄漏 SSML 标签: ' + status);
    await page.evaluate(() => { try { window.speechSynthesis.cancel(); } catch (e) {} });
  });

  // === T_SSML_2: 非法 SSML → 可读错误 + 不进入朗读 + 按钮不卡禁用 ===
  await test('T_SSML_2 非法 SSML：给出可读错误且不启动朗读', async () => {
    await page.evaluate(() => { try { localStorage.removeItem('tts_timeline_v1'); } catch (e) {} });
    await page.fill('#tts-input', '<break time="abc"/>你好');
    await page.click('#speak-btn');
    await page.waitForTimeout(700);
    const status = await page.textContent('#tts-status');
    const notice = await page.textContent('#tts-notice');
    const tl = await page.evaluate(() => JSON.parse(localStorage.getItem('tts_timeline_v1') || '[]'));
    console.log('   状态: ' + String(status).slice(0, 90));
    assert(/SSML 解析错误/.test(status), '非法 SSML 未给出可读错误: ' + status);
    assert(/SSML 解析错误/.test(notice || ''), '未通过 alert 通知用户: ' + notice);
    assert(!tl.some(e => e.kind === 'ssml'), '非法 SSML 不应记录 ssml 成功事件');
    const disabled = await page.isDisabled('#speak-btn');
    assert(!disabled, '非法 SSML 后朗读按钮不应卡在禁用态');
  });

  // === T_SSML_3: 无 SSML 的普通文本不受影响（回归）===
  await test('T_SSML_3 普通文本（无 SSML）不触发解析路径', async () => {
    await page.evaluate(() => { try { localStorage.removeItem('tts_timeline_v1'); } catch (e) {} });
    await page.fill('#tts-input', '这是一段没有标签的普通文本。');
    await page.click('#speak-btn');
    await page.waitForTimeout(3500);
    const tl = await page.evaluate(() => JSON.parse(localStorage.getItem('tts_timeline_v1') || '[]'));
    assert(!tl.some(e => e.kind === 'ssml'), '普通文本不应产生 ssml 事件');
    await page.evaluate(() => { try { window.speechSynthesis.cancel(); } catch (e) {} });
  });

  await browser.close();
  const fails = results.filter(r => r.status === 'FAIL');
  console.log('\n总计: ' + (results.length - fails.length) + ' 通过, ' + fails.length + ' 失败 / ' + results.length + ' 项');
  if (fails.length) { fails.forEach(f => console.log('  ' + f.name + ': ' + f.err)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('E2E-SSML CRASH: ' + e); process.exit(1); });
