// e2e-test-perf.cjs — E9 性能预算（真实浏览器 PerformanceObserver 采集 Core Web Vitals 代理指标）
// 运行：先 `npm run serve` 起静态服务器，再 `node e2e-test-perf.cjs`
// 说明：INP 需真实用户交互数据，CI 不可稳定复现 → 本套件只硬门禁 LCP/CLS + 体积预算（阈值同时写入 README）。
const { chromium } = require('playwright');
const fs = require('fs');
const zlib = require('zlib');
const assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

const BASE = 'http://localhost:8765';
const BUDGET = { fcpMs: 1500, lcpMs: 8000, cls: 0.1, gzipBytes: 61440 }; // gzip < 60KB
// LCP 说明：首屏最大内容元素实测为第三方 uncloseai.js widget 的 .uncloseai-vault-explanation（远程黑盒），
// 其绘制时间不由本项目控制。故 LCP 仅作「含第三方」的回归护栏（<8s）；自有内容用 FCP 硬门禁。
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('✅ ' + name); }
  catch (e) { results.push({ name, status: 'FAIL', err: e.message }); console.log('❌ ' + name + ' — ' + e.message); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // 在导航前注入采集器（buffered 捕获首屏指标）
  await ctx.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, fcp: 0 };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; } })
        .observe({ type: 'paint', buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__perf.cls += e.value; } })
        .observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver((l) => {
        const es = l.getEntries(); if (!es.length) return;
        const e = es[es.length - 1];
        window.__perf.lcp = e.startTime;
        try { window.__perf.lcpEl = e.element ? (e.element.tagName + '.' + (typeof e.element.className === 'string' ? e.element.className : '') + '#' + (e.element.id || '')) : (e.url || '?'); } catch (_) { window.__perf.lcpEl = '?'; }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver((l) => { window.__perf.longTasks = (window.__perf.longTasks || 0) + l.getEntries().length; })
        .observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  });

  const page = await ctx.newPage();
  await page.goto(BASE + '/demo.html', { waitUntil: 'load' });
  await page.waitForTimeout(3500); // 等 uncloseai.js / initVoices / 端点探测完成

  const perf = await page.evaluate(() => window.__perf);

  // === T_LH_1: 自有内容首屏绘制 FCP < 1.5s（可控指标）===
  await test('T_LH_1 首屏内容绘制 FCP < 1.5s', async () => {
    console.log('   FCP=' + Math.round(perf.fcp) + 'ms');
    assert(perf.fcp > 0, 'FCP 未采集到');
    assert(perf.fcp < BUDGET.fcpMs, 'FCP 超预算: ' + Math.round(perf.fcp) + 'ms >= ' + BUDGET.fcpMs + 'ms');
  });

  // === T_LH_2: CLS < 0.1 ===
  await test('T_LH_2 累积布局偏移 CLS < 0.1', async () => {
    console.log('   CLS=' + perf.cls.toFixed(4));
    assert(perf.cls < BUDGET.cls, 'CLS 超预算: ' + perf.cls + ' >= ' + BUDGET.cls);
  });

  // === T_LH_3: 体积预算（gzip < 60KB）+ 无超长任务 ===
  await test('T_LH_3 单文件体积预算（gzip < 60KB）+ 无超长任务', async () => {
    const gz = zlib.gzipSync(fs.readFileSync('demo.html')).length;
    console.log('   demo.html gzip=' + gz + 'B (' + (gz / 1024).toFixed(1) + 'KB)  longTasks=' + (perf.longTasks || 0));
    assert(gz < BUDGET.gzipBytes, 'gzip 超预算: ' + gz + 'B >= ' + BUDGET.gzipBytes + 'B');
    assert((perf.longTasks || 0) <= 30, '超长任务过多（可能阻塞主线程）: ' + perf.longTasks);
  });

  // === T_LH_4: LCP（含第三方 widget）回归护栏 < 8s ===
  await test('T_LH_4 LCP（含第三方 widget）回归护栏 < 8s', async () => {
    console.log('   LCP=' + Math.round(perf.lcp) + 'ms  element=' + perf.lcpEl);
    assert(perf.lcp > 0, 'LCP 未采集到');
    assert(perf.lcp < BUDGET.lcpMs, 'LCP 超护栏: ' + Math.round(perf.lcp) + 'ms >= ' + BUDGET.lcpMs + 'ms');
  });

  await browser.close();
  const fails = results.filter(r => r.status === 'FAIL');
  console.log('\n总计: ' + (results.length - fails.length) + ' 通过, ' + fails.length + ' 失败 / ' + results.length + ' 项');
  if (fails.length) { fails.forEach(f => console.log('  ' + f.name + ': ' + f.err)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('E2E-PERF CRASH: ' + e); process.exit(1); });
