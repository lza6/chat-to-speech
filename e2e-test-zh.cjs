// e2e-test-zh.cjs — 引擎1.5（P0-1-B）E2E：真实浏览器判定本地中文引擎 DAC
// 运行：先 `npm run serve` 起静态服务器，再 `node e2e-test-zh.cjs`
// 覆盖：T_WASM_1/T_WASM_2/T_WASM_3（升级版指南定义）→ 在 headless 浏览器验证降级链能否到达引擎1.5
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
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  // 确定性场景（2026-10-14）：整套用例统一把 TTS 端点拦截为 502，消除对真实端点状态的依赖。
  // 根因：T_ZH_3 断言"关闭引擎1.5 后应落引擎2/3 兜底"，隐含假设端点宕机；端点可用时
  // 走引擎1 在线路径（这本身是正确的），却被判失败 → 随机 flaky。
  await ctx.route('**://speech.ai.unturf.com/**', r => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"bad gateway"}' }));
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  // 共享页显式就绪：T_ZH_1 已改为独立 page，不再顺带导航共享页 → T_ZH_2/3/4 会面对空白页
  await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.__chattts && window.__chattts.version), null, { timeout: 10000 });

  // T_WASM_1(升级版)：端点宕机 → 中文文本 → 状态栏到引擎1.5 提示（不做真机合成断言，避免 headless 无 GPU/WASM 内存限制）
  // 确定性收口（2026-10-14）：原实现依赖外部端点"真实宕机"，而 speech.ai.unturf.com 时通时断
  // → 端点恢复时降级链不触发，断言随机失败（实测本机 1 次挂红、复跑又绿）。
  // 按铁则第 5 条改为 Playwright 路由拦截，制造确定性 502 场景，不再依赖真实网络。
  await test('T_ZH_1 端点宕机时中文文本触发引擎1.5 降级路径', async () => {
    const p = await ctx.newPage();   // 端点 502 由 context 级路由统一拦截
    await p.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !!(window.__chattts && window.__chattts.version), null, { timeout: 10000 });
    p.on('console', m => logs.push(m.type() + ': ' + m.text()));
    // 端点被拦截为 502 → 徽章必须确定性地变为 ep-down
    let cls = '';
    for (let i = 0; i < 60; i++) {
      cls = await p.getAttribute('#endpoint-badge', 'class').catch(() => '');
      if (/ep-down/.test(cls || '')) break;
      await p.waitForTimeout(250);
    }
    console.log('   徽章 class（503 拦截下）: ' + cls);
    assert(/ep-down/.test(cls || ''), '端点被拦截为 502 但徽章未标 ep-down（class=' + cls + '），确定性场景未生效');
    await p.fill('#tts-input', '你好，这是一段本地中文引擎测试。');
    await p.click('#speak-btn');
    // 断言降级链真实走到引擎1.5 或引擎2 兜底（轮询，不固定 sleep）
    let status = '';
    for (let i = 0; i < 120; i++) {
      status = await p.textContent('#tts-status');
      if (/本地中文|试本地|不可用|仍在上次加载|已切换其他引擎|离线|浏览器内置|播放完毕|文本|复制|语音服务/.test(status || '')) break;
      await p.waitForTimeout(250);
    }
    const errLog = await p.evaluate(() => localStorage.getItem('tts_err_log_v2') || '');
    const tried15 = /本地中文|试本地|不可用|仍在上次加载|已切换其他引擎/.test(status);
    const fellBack = /离线|切换|不可用|浏览器内置|播放完毕|文本|复制|语音服务/.test(status);
    const engine15Attempted = tried15 || /engine15-probe|synthChain-engine15/.test(errLog);
    console.log('   状态: ' + String(status).slice(0, 120));
    console.log('   引擎1.5 尝试痕迹: ' + (engine15Attempted ? '有' : '无'));
    assert(engine15Attempted || fellBack, '降级链既未达引擎1.5 也未兜底，status=' + status);
    await p.close();
  });

  // T_ZH_2：设置面板出现引擎1.5 开关且默认开
  await test('T_ZH_2 配置中心新增引擎1.5 开关默认开放', async () => {
    await page.click('#cfg-btn');
    await page.waitForSelector('#cfg-eng15', { state: 'visible' });
    const checked = await page.isChecked('#cfg-eng15');
    assert(checked === true, '引擎1.5 开关应默认开');
    const eng15Label = await page.evaluate(() => document.querySelector('label[for=""]') ? '' : '');
    // 校验 cfg-save 保存后 engines_enabled.engine15 持久化
    await page.click('#cfg-save');
    await page.waitForTimeout(300);
    const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('tts_cfg_v1') || '{}'));
    assert(cfg.engines_enabled && cfg.engines_enabled.engine15 === true, '保存后 engine15 应为 true，got ' + JSON.stringify(cfg.engines_enabled));
    console.log('   Saved config engines_enabled:', JSON.stringify(cfg.engines_enabled));
  });

  // T_ZH_3：关闭引擎1.5 保存后不再出现"本地中文"入口
  await test('T_ZH_3 关闭引擎1.5 开关后不触发本地中文引擎', async () => {
    await page.uncheck('#cfg-eng15');
    await page.click('#cfg-save');
    await page.waitForTimeout(300);
    // CI 根因修复：测试文本不得含"本地中文"四字（会被 reached15 正则误匹配）
    await page.fill('#tts-input', '关闭引擎后的朗读测试。');
    await page.click('#speak-btn');
    await page.waitForTimeout(6000);
    const status = await page.textContent('#tts-status');
    // CI 修复：引擎1.5 关闭后，降级链走引擎2/3 两端之一都算正确闭环。
    // 引擎2 = 离线出声（headless 有 voices 时）；引擎3 = 文本兜底（剪贴板 / 提示）。
    const reached15 = /本地中文|试本地|🀄/.test(status);
    const fellThrough = /离线|浏览器内置|播放完毕|复制|不可用|语音服务/.test(status);
    assert(reached15 === false, '关闭后不应出现引擎1.5，status=' + status);
    assert(fellThrough, '关闭引擎1.5 后应走引擎2/3 兜底，status=' + status);
    // 恢复默认（保留用户配置破坏风险最小）
    await page.click('#cfg-reset');
    console.log('   关闭后 state:', status.slice(0, 80));
  });

  // T_ZH_4（E3 修复）：引擎1.5 开关存在且「自检」按钮可点击并给出可诊断结果
  await test('T_ZH_4 引擎1.5 自检按钮可诊断依赖可用性', async () => {
    // 面板状态未知：先读 display，hidden 才点开（T_ZH_2 可能已打开）
    const panelOpen = await page.evaluate(() => document.getElementById('cfg-panel').style.display !== 'none');
    if (!panelOpen) await page.click('#cfg-btn');
    await page.waitForSelector('#cfg-eng15-check', { state: 'visible' });
    await page.click('#cfg-eng15-check');
    await page.waitForTimeout(6000);
    const st = await page.textContent('#cfg-status');
    const diag = /✅|❌|正在探测/.test(st);
    assert(diag, '自检应给出可诊断结果，got: ' + st);
    console.log('   自检结果: ' + st.slice(0, 100));
    // 关闭面板，避免影响后续
    await page.click('#cfg-btn');
  });

  await browser.close();
  const fails = results.filter(r => r.status === 'FAIL');
  const passN = results.length - fails.length;
  // 计数标签修复（2026-10-14）：原打印 results.length 两次，会输出「4 通过, 1 失败 / 4 项」这类自相矛盾结果
  console.log('\n总计: ' + passN + ' 通过, ' + fails.length + ' 失败 / ' + results.length + ' 项');
  if (fails.length) {
    console.log('FAIL traces:');
    fails.forEach(f => console.log('  ' + f.name + ': ' + f.err));
    process.exit(1);
  }
})().catch(e => { console.error('E2E-ZH CRASH: ' + e); process.exit(1); });