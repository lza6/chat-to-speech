// E2E 测试：P1-1 SW 跨域 CDN 缓存验证（v4 新增）
// 用 Playwright headless 模拟"首次在线访问 → 断网刷新 → 跨域脚本从缓存加载"路径
const { chromium } = require('playwright');

const BASE = 'http://localhost:8765';
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log('✅ ' + name);
  } catch (e) {
    results.push({ name, status: 'FAIL', err: e.message });
    console.log('❌ ' + name + ' — ' + e.message);
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERR: ' + e.message));

  // === T_SW_1: SW 激活后主动 fetch uncloseai.js → SW 拦截并缓存 ===
  // 注：首次 page.goto 时 SW 尚在 installing，uncloseai.js 请求绕过 SW 走网络。
  // 故需等 SW active 后主动触发一次 fetch，让 SW 拦截并写入 CROSS_CACHE。
  await test('T_SW_1 SW 激活后主动 fetch uncloseai.js 被 SW 拦截并缓存', async () => {
    await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000); // 等 SW install + activate

    // 验证 SW 已激活
    const swReg = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { scope: reg.scope, active: !!(reg.active) } : null;
    });
    console.log('   SW 注册:', JSON.stringify(swReg));
    assert(swReg && swReg.active, 'SW 未注册或未激活');

    // 主动 fetch uncloseai.js 触发 SW 拦截（SW 已 active，此次请求必经 SW fetch 事件）
    const fetchResult = await page.evaluate(async () => {
      try {
        const r = await fetch('https://uncloseai.com/uncloseai.js');
        return { ok: r.ok, status: r.status, type: r.type };
      } catch (e) {
        return { ok: false, status: 0, type: 'error', err: e.message };
      }
    });
    console.log('   主动 fetch uncloseai.js:', JSON.stringify(fetchResult));
    assert(fetchResult.ok, '主动 fetch uncloseai.js 失败');

    // 等 SWR 后台写入（bgRefresh 是异步的，给一点时间）
    await page.waitForTimeout(1500);

    // 检查 SW 跨域缓存是否写入 uncloseai.js
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      let found = false;
      for (const k of keys) {
        const cache = await caches.open(k);
        const r = await cache.match('https://uncloseai.com/uncloseai.js');
        if (r) { found = true; break; }
      }
      return { cacheKeys: keys, found };
    });
    console.log('   缓存 keys:', JSON.stringify(cached.cacheKeys), 'uncloseai.js in SW cache:', cached.found);
    assert(cached.found, 'SW 未缓存 uncloseai.js（SW 拦截后未写入 CROSS_CACHE）');
  });

  // === T_SW_2: 断网模拟 → 刷新页面 → uncloseai.js 从缓存回放（UI 不白屏）===
  await test('T_SW_2 断网刷新后 uncloseai.js 从 SW 缓存回放（UI 不白屏）', async () => {
    // 模拟断网
    await ctx.setOffline(true);
    await page.waitForTimeout(500);

    // 断网下重新加载页面
    await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 验证页面不白屏：核心元素可见（说明 demo.html + uncloseai.js 都加载成功）
    const inputVisible = await page.isVisible('#tts-input').catch(() => false);
    const speakVisible = await page.isVisible('#speak-btn').catch(() => false);
    console.log('   断网后 #tts-input 可见:', inputVisible, '#speak-btn 可见:', speakVisible);
    assert(inputVisible, '断网后输入框不可见（可能白屏或 demo.html 未缓存）');
    assert(speakVisible, '断网后朗读按钮不可见');

    // 验证 uncloseai.js 在断网下仍被 SW 回放（检查 SW 响应是否来自缓存）
    // 断网下 fetch uncloseai.js 应成功（SW 缓存回放）
    const swReplay = await page.evaluate(async () => {
      try {
        const r = await fetch('https://uncloseai.com/uncloseai.js');
        return { ok: r.ok, status: r.status, type: r.type };
      } catch (e) {
        return { ok: false, status: 0, type: 'error', err: e.message };
      }
    });
    console.log('   断网 fetch uncloseai.js:', JSON.stringify(swReplay));
    assert(swReplay.ok || swReplay.status === 200, '断网下 uncloseai.js fetch 失败，SW 缓存未回放');

    // 恢复在线
    await ctx.setOffline(false);
    await page.waitForTimeout(500);
  });

  // === T_SW_3: 跨域 API 端点不缓存（speech.ai.unturf.com 不应进缓存）===
  await test('T_SW_3 跨域 API 端点不被 SW 缓存（动态响应不缓存）', async () => {
    await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const apiCached = await page.evaluate(async () => {
      const keys = await caches.keys();
      let found = false;
      for (const k of keys) {
        const cache = await caches.open(k);
        // 检查 speech.ai.unturf.com 的请求是否被缓存
        const r = await cache.match('https://speech.ai.unturf.com/v1/voices');
        if (r) { found = true; break; }
      }
      return found;
    });
    console.log('   speech.ai.unturf.com 缓存:', apiCached);
    assert(!apiCached, '跨域 API 端点不应被缓存（动态响应）');
  });

  await browser.close();

  console.log('\n========== P1-1 SW 跨域缓存 E2E 汇总 ==========');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  results.forEach(r => console.log(`[${r.status}] ${r.name}${r.err ? ' — ' + r.err : ''}`));
  console.log(`\n总计: ${pass} 通过, ${fail} 失败 / ${results.length} 项`);
  process.exit(fail > 0 ? 1 : 0);
})();
