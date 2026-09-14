// e2e-test-avail.cjs — 可用性回归门禁（v4.6.2 根因回归测试）
//
// 背景（真实事故，非假设）：
//   2026-09-15 CI main 运行 34876335864 的 E2E shard 1 失败 9/17：
//   T1 page.goto 超时 30s、T5 计数 = 0 / 5000、T6 主题 ["auto","auto","auto"]、
//   T8 Ctrl+Enter 无效、T11/T15 面板不展开。
//   本地复现（挂起 uncloseai.com 请求）完全一致 → 证实为真实缺陷而非 flaky。
// 根因：
//   `<script src="https://uncloseai.com/uncloseai.js" type="module">` 位于应用内联
//   module 之前。外部 module 会阻塞其后所有内联 module 的执行与 DOMContentLoaded；
//   第三方域名慢/被静默丢包时，整页 JS 全部不执行——连纯离线的「任意文本转语音」
//   核心价值也一并失效（白功能页）。
// 修复：改为运行时动态注入（不阻塞解析与 DOMContentLoaded），失败/超时仅降级聊天能力。
// 本套件即为该修复的永久回归护栏：第三方挂起时必须「应用仍可用」。
//
// 运行：先 `npm run serve` 起静态服务器，再 `node e2e-test-avail.cjs`
const { chromium } = require('playwright');

const BASE = 'http://localhost:8765';
const BUDGET = { dclMs: 3000, degradeMs: 12000 };
const assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('✅ ' + name); }
  catch (e) { results.push({ name, status: 'FAIL', err: e.message }); console.log('❌ ' + name + ' — ' + e.message); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 关键：模拟 CI 弱网/被丢包——第三方请求永不返回（既不放行也不失败）
  // 用 context 级路由，保证后续新开页也覆盖同一弱网条件
  await ctx.route('**://uncloseai.com/**', () => { /* 挂起：永不 fulfill */ });

  let dclMs = null;
  page.on('domcontentloaded', () => { if (dclMs === null) dclMs = Date.now() - t0; });
  const t0 = Date.now();

  // === T_AVAIL_1: 第三方挂起不阻塞 DOMContentLoaded ===
  await test('T_AVAIL_1 第三方挂起时 DOMContentLoaded 仍在预算内（不阻塞首屏）', async () => {
    const resp = await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded', timeout: BUDGET.dclMs + 5000 });
    const ms = dclMs !== null ? dclMs : (Date.now() - t0);
    console.log('   DOMContentLoaded=' + ms + 'ms (预算 <' + BUDGET.dclMs + 'ms)');
    assert(resp && resp.status() === 200, 'HTTP 状态非 200');
    assert(dclMs !== null, 'DOMContentLoaded 未触发（第三方挂起阻塞了文档解析）');
    assert(ms < BUDGET.dclMs, 'DOMContentLoaded 超预算: ' + ms + 'ms >= ' + BUDGET.dclMs + 'ms');
  });

  // === T_AVAIL_2: 内联 module 已执行（监听器全部绑定）===
  await test('T_AVAIL_2 第三方挂起时内联 module 仍执行（计数/主题交互有效）', async () => {
    await page.fill('#tts-input', '测试123');
    await page.waitForTimeout(200);
    const count = await page.textContent('#char-count');
    console.log('   字符计数: ' + count);
    assert(/5\s*\/\s*5000/.test(count), '字符计数未更新（内联 module 未执行）: ' + count);

    // 主题用 data-theme 属性表达，'auto' 即移除属性（null）→ 归一化为可读值
    const readTheme = async () => (await page.getAttribute('html', 'data-theme')) || 'auto';
    const seq = [await readTheme()];
    for (let i = 0; i < 3; i++) {
      await page.click('#theme-btn');
      await page.waitForTimeout(120);
      seq.push(await readTheme());
    }
    console.log('   主题循环: ' + JSON.stringify(seq));
    assert(new Set(seq).size === 3, '主题三态未覆盖 3 种状态（监听器未绑定）: ' + JSON.stringify(seq));
    assert(seq[3] === seq[0], '主题未按三态循环回到起点: ' + JSON.stringify(seq));
  });

  // === T_AVAIL_3: 核心朗读闭环在第三方挂起时仍可走完 ===
  await test('T_AVAIL_3 第三方挂起时朗读闭环仍走到终态（离线出声，核心价值不失效）', async () => {
    await page.fill('#tts-input', '你好，这是可用性回归测试。');
    await page.click('#speak-btn');
    // 端点探测 + 降级链（engine1→1.5→2）需要时间；此处只断言「走到终态」而非具体引擎
    let status = '';
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      status = ((await page.textContent('#tts-status')) || '').trim();
      if (/朗读完毕|播放完毕|离线|切换|不可用/.test(status)) break;
      await page.waitForTimeout(300);
    }
    console.log('   闭环终态: ' + JSON.stringify(status));
    assert(/朗读完毕|播放完毕|离线|切换|不可用/.test(status), '朗读闭环未走到终态（第三方挂起拖垮核心链路）: ' + JSON.stringify(status));
    await page.click('#stop-btn').catch(() => {});
  });

  // === T_AVAIL_4: 降级位在预算内就位，且文案明示离线朗读仍可用 ===
  // 用全新页并「不点朗读」：状态栏是共享通道，朗读终态会覆盖降级文案（避免竞态误判）
  await test('T_AVAIL_4 第三方挂起时降级位就位且文案明示离线朗读可用', async () => {
    const page2 = await ctx.newPage();
    await page2.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    const deadline = Date.now() + BUDGET.degradeMs;
    let failed = false;
    while (Date.now() < deadline) {
      failed = await page2.evaluate(() => window.__uncloseaiFailed === true);
      if (failed) break;
      await page2.waitForTimeout(300);
    }
    // 降级位置位后，poll 在下一 tick 即 reject → 文案落到状态栏
    let status = '';
    for (let i = 0; i < 10 && !/任意文本转语音|直连/.test(status); i++) {
      await page2.waitForTimeout(300);
      status = ((await page2.textContent('#tts-status')) || '').trim();
    }
    console.log('   __uncloseaiFailed=' + failed + '  文案=' + JSON.stringify(status.slice(0, 60)));
    assert(failed, '__uncloseaiFailed 在 ' + BUDGET.degradeMs + 'ms 内未置位（用户将无限等待）');
    assert(/任意文本转语音|直连/.test(status), '降级文案未明示离线朗读仍可用: ' + JSON.stringify(status));
    await page2.close();
  });

  await browser.close();
  const fails = results.filter(r => r.status === 'FAIL');
  console.log('\n总计: ' + (results.length - fails.length) + ' 通过, ' + fails.length + ' 失败 / ' + results.length + ' 项');
  if (fails.length) { fails.forEach(f => console.log('  ' + f.name + ': ' + f.err)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('E2E-AVAIL CRASH: ' + e); process.exit(1); });
