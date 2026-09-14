// e2e-test-a11y.cjs — E8 无障碍门禁（axe-core WCAG 2.0 A/AA 真实浏览器扫描）
// 运行：先 `npm run serve` 起静态服务器，再 `node e2e-test-a11y.cjs`
// 依赖：@axe-core/playwright（devDependency）。零容忍口径：serious + critical 必须为 0。
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

const BASE = 'http://localhost:8765';
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('✅ ' + name); }
  catch (e) { results.push({ name, status: 'FAIL', err: e.message }); console.log('❌ ' + name + ' — ' + e.message); }
}

function fmtViolations(vs) {
  return vs.map(v => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} 处)` +
    v.nodes.map(n => `\n        → ${n.target.join(' ')} :: ${String(n.failureSummary || '').replace(/\n/g, ' ')}`).join('')
  ).join('\n      ');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000); // 等 uncloseai.js / initVoices 稳定

  let allViolations = [];

  // === T_A11Y_1: axe WCAG 2 A/AA 扫描 0 serious/critical 违规 ===
  await test('T_A11Y_1 axe-core WCAG2 A/AA 扫描 0 严重违规', async () => {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    allViolations = violations;
    const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    console.log('   违规总数=' + violations.length + ' 严重(serious/critical)=' + severe.length);
    if (violations.length) console.log('   --- 全部违规 ---\n      ' + fmtViolations(violations));
    assert(severe.length === 0, '存在严重无障碍违规:\n      ' + fmtViolations(severe));
  });

  // === T_A11Y_2: 核心控件键盘可聚焦 + 有可访问名 ===
  await test('T_A11Y_2 核心控件键盘可达且有可访问名', async () => {
    const report = await page.evaluate(() => {
      const ids = ['tts-input', 'speak-btn', 'stop-btn', 'voice-select', 'speed-slider', 'theme-btn', 'history-btn', 'cfg-btn'];
      const bad = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) { bad.push(id + ':缺失'); continue; }
        const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
        if (!name) bad.push(id + ':无可访问名');
        if (el.disabled) bad.push(id + ':被禁用');
      }
      return bad;
    });
    assert(report.length === 0, '控件可访问性问题: ' + JSON.stringify(report));
    // 真实键盘聚焦（页内同步执行，避开 headless 跨进程焦点不可靠）
    const focusOk = await page.evaluate(() => {
      const el = document.getElementById('tts-input');
      el.focus();
      return document.activeElement === el;
    });
    assert(focusOk, '键盘聚焦失败：#tts-input 无法获得焦点');
  });

  // === T_A11Y_3: 文档语言 + 地标 + 标题结构 ===
  await test('T_A11Y_3 文档语言声明 + 标题结构完整', async () => {
    const info = await page.evaluate(() => ({
      lang: document.documentElement.getAttribute('lang'),
      h1: document.querySelectorAll('h1').length,
      landmarks: document.querySelectorAll('main, nav, header, footer, section[aria-label], [role="main"], [role="region"]').length,
      title: document.title
    }));
    console.log('   lang=' + info.lang + ' h1=' + info.h1 + ' landmarks=' + info.landmarks + ' title=' + info.title);
    assert(info.lang && /^zh/i.test(info.lang), 'html lang 应声明中文，实际=' + info.lang);
    assert(info.title && info.title.length > 0, '文档标题缺失');
    assert(info.h1 >= 1, '缺少 h1 主标题');
  });

  // === T_A11Y_4: 展开默认隐藏的设置面板后再扫（cfg-panel 默认 display:none，axe 会跳过）===
  await test('T_A11Y_4 展开设置面板后仍 0 严重违规', async () => {
    await page.click('#cfg-btn');
    await page.waitForTimeout(400);
    const visible = await page.isVisible('#cfg-panel');
    assert(visible, '设置面板未展开');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    console.log('   展开后违规总数=' + violations.length + ' 严重=' + severe.length);
    if (violations.length) console.log('   --- 全部违规 ---\n      ' + fmtViolations(violations));
    assert(severe.length === 0, '设置面板存在严重无障碍违规:\n      ' + fmtViolations(severe));
  });

  await browser.close();
  const fails = results.filter(r => r.status === 'FAIL');
  console.log('\n总计: ' + (results.length - fails.length) + ' 通过, ' + fails.length + ' 失败 / ' + results.length + ' 项');
  if (fails.length) { fails.forEach(f => console.log('  ' + f.name + ': ' + f.err)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('E2E-A11Y CRASH: ' + e); process.exit(1); });
