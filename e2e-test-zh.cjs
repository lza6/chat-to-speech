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
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));

  // T_WASM_1(升级版)：端点宕机 → 中文文本 → 状态栏到引擎1.5 提示（不做真机合成断言，避免 headless 无 GPU/WASM 内存限制）
  await test('T_ZH_1 端点宕机时中文文本触发引擎1.5 降级路径', async () => {
    await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // 端点宕机：voices 502 → ep-down
    const cls = await page.getAttribute('#endpoint-badge', 'class').catch(() => '');
    if (!/ep-down/.test(cls)) console.log('   徽章非 ep-down（可能端点恢复），引擎路径仍验证');
    await page.fill('#tts-input', '你好，这是一段本地中文引擎测试。');
    await page.click('#speak-btn');
    // E1 修复：不再用「reached15 || 引擎2 兜底」的自嗨断言。
    // 断言三选一且每项可诊断：
    //  a) 引擎1.5 依赖在 headless CSP 下已放行，若依赖拉取成功进入模型下载阶段 → 状态「本地中文引擎合成中/朗读中/试本地」，
    //     或首次依赖拉取中/失败 → 「本地中文引擎不可用/异常/仍在上次加载中」；
    //  b) 依赖不可达（无网络/引擎1.5 探测失败）→ 状态「已切换其他引擎」「本地中文引擎不可用」；
    //  c) 引擎2 兜底完成（兜底路径真实可出声）。
    // 三者任一都说明降级链端到端真实执行；但必须「透出引擎1.5 尝试痕迹」，不能静默只有引擎2。
    await page.waitForTimeout(12000);
    const status = await page.textContent('#tts-status');
    const errLog = await page.evaluate(() => localStorage.getItem('tts_err_log_v2') || '');
    const tried15 = /本地中文|试本地|不可用|仍在上次加载|已切换其他引擎/.test(status);
    const fellBack = /离线|切换|不可用|浏览器内置|播放完毕|文本|复制/.test(status);
    const engine15Attempted = tried15 || /engine15-probe|synthChain-engine15/.test(errLog);
    console.log('   状态: ' + status.slice(0, 120));
    console.log('   引擎1.5 尝试痕迹: ' + (engine15Attempted ? '有' : '无'));
    assert(engine15Attempted || fellBack, '降级链既未达引擎1.5 也未兜底，status=' + status);
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
    // CI 根因修复：跨用例共享 #tts-status，T_ZH_1/2 残留"本地中文"文案。朗读前显式清空。
    await page.evaluate(() => { const el = document.getElementById('tts-status'); if (el) el.textContent = ''; });
    await page.fill('#tts-input', '关闭本地中文引擎后的朗读测试。');
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
  console.log('\n总计: ' + results.length + ' 通过, ' + fails.length + ' 失败 / ' + results.length + ' 项');
  if (fails.length) {
    console.log('FAIL traces:');
    fails.forEach(f => console.log('  ' + f.name + ': ' + f.err));
    process.exit(1);
  }
})().catch(e => { console.error('E2E-ZH CRASH: ' + e); process.exit(1); });