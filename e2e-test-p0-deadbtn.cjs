// e2e-test-p0-deadbtn.cjs — P0 死按钮验证（2026-10-14 审计新增）
// 目的：验证审计报告的静态结论「顶部按钮点击零反应」是否在真实浏览器中成立。
// 铁则：独立 page + 显式等应用就绪 + 轮询断言，禁止固定 sleep 后断言。
'use strict';
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:8765';
let pass = 0, fail = 0;
const results = [];

async function test(name, fn) {
  try { await fn(); console.log('✅ ' + name); pass++; results.push([name, true, null]); }
  catch (e) { console.log('❌ ' + name + '\n   ' + (e.message || e)); fail++; results.push([name, false, e.message]); }
}
function assert(c, m) { if (!c) throw new Error(m); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();

  async function freshPage() {
    const p = await ctx.newPage();
    await p.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !!(window.__chattts && window.__chattts.version), null, { timeout: 10000 });
    return p;
  }

  // === T_P0_1: 🧾 透明时间线 按钮点击必须有可见效果 ===
  await test('T_P0_1 点「🧾 透明时间线」按钮：aria 翻转 + 目标 pane 真可见 + 内容真渲染', async () => {
    const p = await freshPage();
    const before = await p.getAttribute('#timeline-btn', 'aria-expanded');
    await p.click('#timeline-btn');
    let after = null;
    for (let i = 0; i < 20; i++) {
      after = await p.getAttribute('#timeline-btn', 'aria-expanded');
      if (after !== before) break;
      await p.waitForTimeout(100);
    }
    console.log('   aria-expanded: ' + before + ' → ' + after);
    assert(after !== before, '点击后 aria-expanded 未变化（' + before + ' → ' + after + '），按钮无响应');
    // 加强断言（原只判 aria 变化，过弱）：目标 pane 必须真实可见
    const vis = await p.evaluate(() => {
      const pane = document.querySelector('#data-panel .wizard-body[data-wtab-pane="timeline"]');
      if (!pane) return { exists: false };
      const tab = document.querySelector('#data-panel .wizard-tab[data-wtab="timeline"]');
      return {
        exists: true,
        display: getComputedStyle(pane).display,
        tabPressed: tab ? tab.getAttribute('aria-pressed') : null,
        listExists: !!document.getElementById('timeline-list'),
        exportClickable: !!document.getElementById('timeline-export')
      };
    });
    console.log('   pane 状态: ' + JSON.stringify(vis));
    assert(vis.exists, '数据管理的时间线 pane 不存在');
    assert(vis.display !== 'none', '点击后时间线 pane 仍不可见 (display=' + vis.display + ')');
    assert(vis.tabPressed === 'true', '时间线 tab 未标记为选中 (aria-pressed=' + vis.tabPressed + ')');
    assert(vis.listExists, '时间线列表容器 #timeline-list 不存在');
    assert(vis.exportClickable, '时间线导出按钮不存在（绑定会丢失）');
    await p.close();
  });

  // === T_P0_2: 🧠 记忆 按钮点击必须有可见效果 ===
  await test('T_P0_2 点「🧠 记忆」按钮：aria 翻转 + 记忆 pane 真可见 + 内容真渲染', async () => {
    const p = await freshPage();
    const before = await p.getAttribute('#memory-btn', 'aria-expanded');
    await p.click('#memory-btn');
    let after = null;
    for (let i = 0; i < 20; i++) {
      after = await p.getAttribute('#memory-btn', 'aria-expanded');
      if (after !== before) break;
      await p.waitForTimeout(100);
    }
    console.log('   aria-expanded: ' + before + ' → ' + after);
    assert(after !== before, '点击后 aria-expanded 未变化（' + before + ' → ' + after + '），按钮无响应');
    const vis = await p.evaluate(() => {
      const pane = document.querySelector('#data-panel .wizard-body[data-wtab-pane="memory"]');
      if (!pane) return { exists: false };
      const tab = document.querySelector('#data-panel .wizard-tab[data-wtab="memory"]');
      const body = document.getElementById('memory-body');
      return {
        exists: true,
        display: getComputedStyle(pane).display,
        tabPressed: tab ? tab.getAttribute('aria-pressed') : null,
        bodyExists: !!body,
        bodyRendered: body ? body.children.length > 0 : false,
        clearClickable: !!document.getElementById('memory-clear')
      };
    });
    console.log('   pane 状态: ' + JSON.stringify(vis));
    assert(vis.exists, '数据管理的记忆 pane 不存在');
    assert(vis.display !== 'none', '点击后记忆 pane 仍不可见 (display=' + vis.display + ')');
    assert(vis.tabPressed === 'true', '记忆 tab 未标记为选中 (aria-pressed=' + vis.tabPressed + ')');
    assert(vis.bodyExists, '记忆容器 #memory-body 不存在');
    assert(vis.bodyRendered, '点击后记忆内容未渲染（memoryRender 没跑）');
    assert(vis.clearClickable, '记忆清空按钮不存在（绑定会丢失）');
    await p.close();
  });

  // === T_P0_3: 导航「时间线」锚点必须能跳转到存在的元素 ===
  await test('T_P0_3 导航「时间线」锚点 href 必须指向页面存在的元素', async () => {
    const p = await freshPage();
    const r = await p.evaluate(() => {
      const a = document.querySelector('a[data-i18n="nav_timeline"]');
      if (!a) return { found: false };
      const id = (a.getAttribute('href') || '').replace(/^#/, '');
      return { found: true, href: a.getAttribute('href'), id, exists: !!document.getElementById(id) };
    });
    console.log('   ' + JSON.stringify(r));
    assert(r.found, '未找到导航「时间线」链接');
    assert(r.exists, '锚点 ' + r.href + ' 指向的 #' + r.id + ' 在页面中不存在（点击无跳转）');
    await p.close();
  });

  // === T_P0_3b: 「回到顶部」锚点 ===
  await test('T_P0_3b 导航品牌「回到顶部」锚点必须指向存在的元素', async () => {
    const p = await freshPage();
    const r = await p.evaluate(() => {
      const a = document.querySelector('a.brand');
      if (!a) return { found: false };
      const id = (a.getAttribute('href') || '').replace(/^#/, '');
      return { found: true, href: a.getAttribute('href'), id, exists: !!document.getElementById(id) };
    });
    console.log('   ' + JSON.stringify(r));
    assert(r.found, '未找到 a.brand');
    assert(r.exists, '锚点 ' + r.href + ' 指向的 #' + r.id + ' 在页面中不存在');
    await p.close();
  });

  // === T_P0_4: 两处页签系统互不干扰 ===
  await test('T_P0_4 场景向导切 tab 后，数据管理面板内容不得被静默隐藏', async () => {
    const p = await freshPage();
    const before = await p.evaluate(() => {
      const panes = [...document.querySelectorAll('#wizard-panel .wizard-body, #data-panel .wizard-body')];
      return panes.map(x => ({ id: x.dataset.wtabPane, display: getComputedStyle(x).display, parent: x.closest('.panel') ? x.closest('.panel').id : '?' }));
    });
    // 在场景向导里点第二个 tab
    const wzTabs = await p.$$('#wizard-panel .wizard-tab');
    assert(wzTabs.length >= 2, '场景向导 tab 少于 2 个，无法测试干扰');
    await wzTabs[1].click();
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => {
      const panes = [...document.querySelectorAll('#wizard-panel .wizard-body, #data-panel .wizard-body')];
      return panes.map(x => ({ id: x.dataset.wtabPane, display: getComputedStyle(x).display, parent: x.closest('.panel') ? x.closest('.panel').id : '?' }));
    });
    console.log('   before: ' + JSON.stringify(before));
    console.log('   after : ' + JSON.stringify(after));
    // 断言：数据管理面板的 pane 显示状态不得因向导切 tab 而改变
    const dataBefore = before.filter(x => x.parent === 'data-panel');
    const dataAfter = after.filter(x => x.parent === 'data-panel');
    // 防假绿：若 data-panel 或其 pane 缺失，下面的 for 会零次迭代而"通过"
    assert(dataBefore.length > 0, '未找到数据管理 pane（data-panel 缺失？），T_P0_4 断言会空转，测试无效');
    assert(dataAfter.length === dataBefore.length, '数据管理 pane 数量变化: ' + dataBefore.length + ' → ' + dataAfter.length);
    for (const b of dataBefore) {
      const a = dataAfter.find(x => x.id === b.id);
      assert(a, '数据管理 pane ' + b.id + ' 消失');
      assert(a.display === b.display,
        '数据管理 pane ' + b.id + ' 被向导切 tab 静默改变: ' + b.display + ' → ' + a.display + '（两处共用 .wizard-tab/.wizard-body 类导致的跨面板污染）');
    }
    // 断言：向导自身 tab 确实切换了（证明操作生效，而非两边都没动）
    const wzBefore = before.filter(x => x.parent === 'wizard-panel');
    const wzAfter = after.filter(x => x.parent === 'wizard-panel');
    assert(JSON.stringify(wzBefore.map(x => x.display)) !== JSON.stringify(wzAfter.map(x => x.display)),
      '向导切 tab 自身未生效，测试无效');
    await p.close();
  });

  // === T_P0_5: 生产代码里的关键函数必须真实存在且语义正确 ===
  // 背景（2026-10-14 独立审查发现）：playResultToChainResult 曾只在 unit-test-v47.cjs 里有副本，
  // demo.html 只有调用没有定义 → 在线播放走到该行抛 ReferenceError 被 catch 吞成"端点降级"。
  // 单元测试因测的是本地副本而全绿——典型的"测试假绿掩盖未落地实现"。
  // 本用例直连 window.__chattts（产品导出的实例），确保函数真的进了生产代码。
  await test('T_P0_5 生产代码导出 playResultToChainResult 且语义正确（防假绿）', async () => {
    const p = await freshPage();
    const r = await p.evaluate(() => {
      const f = window.__chattts && window.__chattts.playResultToChainResult;
      if (typeof f !== 'function') return { exists: false, type: typeof f };
      return {
        exists: true,
        ended: f('ended'),
        stopped: f('stopped'),
        blocked: f('blocked'),
        error: f('error'),
        weird: f('unexpected-value'),
        undef: f(undefined)
      };
    });
    console.log('   ' + JSON.stringify(r));
    assert(r.exists, 'window.__chattts.playResultToChainResult 不存在（typeof=' + r.type + '）—— 生产代码漏定义，在线播放将抛 ReferenceError');
    assert(r.ended && r.ended.chain === 'ok', 'ended 应映射为 ok');
    assert(r.stopped && r.stopped.chain === 'stopped', 'stopped 应映射为 stopped');
    assert(r.blocked && r.blocked.chain === 'blocked', 'blocked 应映射为 blocked（绝不能是 ok）');
    assert(r.error && r.error.chain === 'error', 'error 应映射为 error');
    assert(r.weird && r.weird.chain === 'error', '未预期值必须降级为 error，实际 ' + JSON.stringify(r.weird));
    assert(r.undef && r.undef.chain === 'error', 'undefined 必须降级为 error，实际 ' + JSON.stringify(r.undef));
    await p.close();
  });

  console.log('\n========== P0 死按钮验证汇总 ==========');
  for (const [n, ok] of results) console.log((ok ? '[PASS] ' : '[FAIL] ') + n);
  console.log('\n总计: ' + pass + ' 通过, ' + fail + ' 失败 / ' + (pass + fail) + ' 项');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
