// E2E 测试 — B3-B5 场景向导（任务看板 / PPT 大纲 / 电商文案）
// 运行：先 `npm run serve`（或任意静态服务器 8765），再 `node e2e-test-wizard.cjs`
// 覆盖：T_WZ_1..6 — 面板存在 / 看板流转 / 取消 / PPT 分页审计 / 电商三段草稿 / 数据持久化
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const ok = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };
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
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // T_WZ_1 场景向导面板存在 + 三页签
  await test('T_WZ_1 场景向导面板 + 三页签存在', async () => {
    ok(await page.isVisible('#wizard-panel'), '场景向导面板不可见');
    const tabs = await page.locator('.wizard-tab').count();
    assert.equal(tabs, 3, '应有 3 个页签（看板/PPT/电商）');
    ok(await page.isVisible('#wz-task-input'), '看板任务输入不可见');
    ok(await page.locator('#wz-ppt-title').count() === 1, 'PPT 标题输入应存在于 DOM（默认页签隐藏）');
    ok(await page.locator('#wz-ecom-name').count() === 1, '电商商品名输入应存在于 DOM');
  });
  await test('T_WZ_2 任务看板添加 + 推进流转', async () => {    await page.click('.wizard-tab[data-wtab="board"]');
    await page.fill('#wz-task-input', '给文章配音');
    await page.click('#wz-task-add');
    await page.waitForTimeout(200);
    const before = await page.locator('.wz-task-card').count();
    assert.ok(before >= 1, '添加后看板应有任务');
    // 新任务应在 Backlog 列
    const backlogCol = await page.locator('.wz-board-col', { hasText: 'Backlog' }).innerText();
    ok(/给文章配音/.test(backlogCol), '新任务应在 Backlog 列');
    // 点击推进 → planning
    await page.locator('.wz-task-card', { hasText: '给文章配音' }).click();
    await page.waitForTimeout(200);
    const status = await page.textContent('#wz-board-status');
    ok(/planning/.test(status), '推进状态应含 planning，实际: ' + status);
  });

  // T_WZ_3 任务取消（右键）
  await test('T_WZ_3 右键取消任务', async () => {
    const card = page.locator('.wz-task-card', { hasText: '给文章配音' });
    await card.click({ button: 'right' });
    await page.waitForTimeout(200);
    const cancelledCol = await page.locator('.wz-board-col', { hasText: '已取消' }).innerText();
    ok(/给文章配音/.test(cancelledCol), '任务应出现在已取消列');
    const status = await page.textContent('#wz-board-status');
    ok(/已取消/.test(status), '状态应提示已取消');
  });

  // T_WZ_4 PPT 大纲：分页 + 几何审计
  await test('T_WZ_4 PPT 大纲解析 + 审计渲染', async () => {
    await page.click('.wizard-tab[data-wtab="ppt"]');
    await page.fill('#wz-ppt-title', '测试演示');
    await page.fill('#wz-ppt-spec', '封面：周报\n进展 A\n进展 B\n\n第二章\n要点 X');
    await page.click('#wz-ppt-gen');
    await page.waitForTimeout(200);
    const pageCount = await page.locator('.wz-page-card').count();
    assert.equal(pageCount, 2, '应解析出 2 页，实际 ' + pageCount);
    const firstPage = await page.locator('.wz-page-card').first().innerText();
    ok(/封面：周报/.test(firstPage), '第一页标题应为封面');
  });

  // T_WZ_5 电商文案：三段草稿 + 禁用词替换
  await test('T_WZ_5 电商三段草稿 + 禁用词替换', async () => {
    await page.click('.wizard-tab[data-wtab="ecom"]');
    await page.fill('#wz-ecom-name', '静音风扇');
    await page.fill('#wz-ecom-price', '199');
    await page.fill('#wz-ecom-sells', '无感运转\n省电\n全网最低价');
    await page.click('#wz-ecom-gen');
    await page.waitForTimeout(200);
    const drafts = await page.locator('.wz-draft').count();
    assert.equal(drafts, 3, '应产出 3 个草稿，实际 ' + drafts);
    const bodyText = await page.locator('.wz-draft').allInnerTexts();
    assert.ok(bodyText.some(t => /★/.test(t)), '禁用词应被替换为 ★');
    assert.ok(bodyText.some(t => /199/.test(t)), '标题版应含价格');
  });

  // T_WZ_6 数据持久化：localStorage 写入 + 刷新后保留
  await test('T_WZ_6 看板/向导数据持久化到 localStorage', async () => {
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('tts_wizard_v1');
      return raw ? JSON.parse(raw) : [];
    });
    assert.ok(Array.isArray(stored) && stored.length >= 1, '看板任务应已持久化');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const reloaded = await page.evaluate(() => { const raw = localStorage.getItem('tts_wizard_v1'); return raw ? JSON.parse(raw).length : 0; });
    assert.ok(reloaded >= 1, '刷新后任务应保留，实际 ' + reloaded);
  });

  await browser.close();
  const fatal = pageErrors.filter(e => !/uncloseai\.com|hermes\.ai|speech\.ai|net::ERR|Failed to fetch|Playwright/i.test(e));
  console.log('\nFATAL page errors: ' + (fatal.length ? JSON.stringify(fatal) : 'none'));

  console.log('\n========== 场景向导 E2E 汇总 ==========');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  results.forEach(r => console.log(`[${r.status}] ${r.name}${r.err ? ' — ' + r.err : ''}`));
  console.log(`\n总计: ${pass} 通过, ${fail} 失败 / ${results.length} 项`);
  process.exit(fail > 0 || fatal.length ? 1 : 0);
})().catch(e => { console.error('E2E-WIZ CRASH: ' + e); process.exit(1); });