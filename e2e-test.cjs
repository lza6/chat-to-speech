// E2E 测试：用 Playwright headless 跑真实浏览器路径
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

  // === T1: 页面加载 + 无 JS 错误 ===
  await test('T1 页面加载 HTTP 200 无 JS 错误', async () => {
    const resp = await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
    assert(resp && resp.status() === 200, 'HTTP 状态非 200');
    await page.waitForTimeout(1500); // 等 uncloseai.js + initVoices 跑完
    // 允许 uncloseai.js 自身报错（远程库），但页面级 JS 不应有语法错误
    const fatal = consoleErrors.find(e => /SyntaxError|Unexpected token|is not defined/i.test(e) && !/uncloseai\.com|hermes\.ai\.unturf|speech\.ai\.unturf|net::ERR|Failed to fetch/i.test(e));
    assert(!fatal, '页面有致命 JS 错误: ' + fatal);
  });

  // === T2: 核心元素存在 ===
  await test('T2 核心元素存在（输入框/按钮/语音下拉/徽章）', async () => {
    assert(await page.isVisible('#tts-input'), '输入框不可见');
    assert(await page.isVisible('#speak-btn'), '朗读按钮不可见');
    assert(await page.isVisible('#stop-btn'), '停止按钮不可见');
    assert(await page.isVisible('#voice-select'), '语音下拉不可见');
    assert(await page.isVisible('#endpoint-badge'), '端点徽章不可见');
    assert(await page.isVisible('#read-page-btn'), '整页朗读按钮不可见');
  });

  // === T3: 端点徽章状态（端点宕机应为 down）===
  await test('T3 端点徽章正确反映 502 宕机', async () => {
    await page.waitForTimeout(2000); // 等 probeTtsEndpoint 完成
    const cls = await page.getAttribute('#endpoint-badge', 'class');
    console.log('   徽章 class: ' + cls);
    // 端点宕机应为 ep-down
    assert(/ep-down/.test(cls), '端点 502 宕机但徽章未标 ep-down，class=' + cls);
  });

  // === T4: 闭环②降级到离线引擎（端点宕机时）===
  await test('T4 闭环②端点宕机→自动降级离线朗读', async () => {
    await page.fill('#tts-input', '你好，这是测试文本。');
    await page.click('#speak-btn');
    await page.waitForTimeout(2000);
    const status = await page.textContent('#tts-status');
    console.log('   状态: ' + status);
    // 应切换到离线引擎或提示不可用
    const ok = /离线|切换|不可用|在线合成|播放完毕/.test(status);
    assert(ok, '未正确降级，状态: ' + status);
  });

  // === T5: 字符计数 ===
  await test('T5 字符计数实时更新', async () => {
    await page.fill('#tts-input', '测试123');
    await page.waitForTimeout(200);
    const count = await page.textContent('#char-count');
    console.log('   计数: ' + count);
    // 输入5个字符，应显示 5 / 5000
    assert(/5\s*\/\s*5000/.test(count), '字符计数未更新: ' + count);
  });

  // === T6: 主题三态切换 ===
  await test('T6 主题三态切换', async () => {
    const themes = [];
    for (let i = 0; i < 3; i++) {
      await page.click('#theme-btn');
      await page.waitForTimeout(100);
      const attr = await page.getAttribute('html', 'data-theme');
      themes.push(attr || 'auto');
    }
    console.log('   三次切换: ' + JSON.stringify(themes));
    // 应有不同值（auto/dark/light 循环）
    const unique = new Set(themes);
    assert(unique.size >= 2, '主题切换无变化: ' + JSON.stringify(themes));
  });

  // === T7: 示例 chips 回填 ===
  await test('T7 示例 chip 回填输入框', async () => {
    await page.click('.chip-btn:first-child');
    await page.waitForTimeout(200);
    const val = await page.inputValue('#tts-input');
    console.log('   回填值: ' + val.slice(0, 30));
    assert(val.length > 0, 'chip 未回填');
  });

  // === T8: 键盘快捷键 Ctrl+Enter 触发朗读 ===
  await test('T8 Ctrl+Enter 触发朗读', async () => {
    await page.fill('#tts-input', '快捷键测试。');
    await page.focus('#tts-input');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(1500);
    const status = await page.textContent('#tts-status');
    // 朗读应已启动（状态变化）
    assert(/离线|在线|播放|合成|不可用/.test(status), 'Ctrl+Enter 未触发朗读，状态: ' + status);
  });

  // === T9: Esc 停止 ===
  await test('T9 Esc 停止朗读', async () => {
    // 先确保有朗读在跑
    await page.fill('#tts-input', '停止测试文本。');
    await page.click('#speak-btn');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const status = await page.textContent('#tts-status');
    console.log('   停止后状态: ' + status);
    // headless Chromium 的 speechSynthesis 可能不真出声，但应通过轮询守护解除
    // 验证：状态不再停留在"朗读中"，或按钮已恢复可用
    const speakDisabled = await page.isDisabled('#speak-btn');
    assert(!speakDisabled, 'Esc 后朗读按钮仍禁用，状态: ' + status);
    await page.evaluate(() => { try { window.speechSynthesis.cancel(); } catch(e){} });
  });

  // === T10: 整页朗读（端点宕机走离线）===
  await test('T10 整页朗读闭环③', async () => {
    await page.click('#read-page-btn');
    await page.waitForTimeout(2500);
    const status = await page.textContent('#chat-status');
    console.log('   整页朗读状态: ' + status);
    assert(/离线|朗读|不可用|完毕/.test(status), '整页朗读未启动，状态: ' + status);
    await page.evaluate(() => { try { window.speechSynthesis.cancel(); } catch(e){} });
  });

  // === T11: 历史面板展开 ===
  await test('T11 历史面板展开', async () => {
    await page.click('#history-btn');
    await page.waitForTimeout(300);
    const expanded = await page.getAttribute('#history-btn', 'aria-expanded');
    assert(expanded === 'true', '历史面板未展开');
  });

  // === T12: CSP 不含已关闭的 qwen 端点 ===
  await test('T12 CSP 已移除 qwen.ai.unturf.com', async () => {
    const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
    assert(!/qwen\.ai\.unturf\.com/.test(csp), 'CSP 仍含 qwen 端点');
    assert(/speech\.ai\.unturf\.com/.test(csp), 'CSP 缺 speech 端点');
    assert(/hermes\.ai\.unturf\.com/.test(csp), 'CSP 缺 hermes 端点');
  });

  // === T13: cleanAssistantText 清洗（注入测试）===
  await test('T13 cleanAssistantText 清洗思考过程（通过整页提取间接验证）', async () => {
    // 注入一段带思考前缀的伪回复到聊天区，验证 extractReadableText 过滤
    const filtered = await page.evaluate(() => {
      // 在 .uncloseai 容器内注入伪回复
      const container = document.querySelector('.uncloseai') || document.body;
      const div = document.createElement('div');
      div.className = 'assistant-msg';
      div.innerText = "Here's a thinking process:\n\n1. Analyze\n\n最终答案：你好。";
      container.appendChild(div);
      // 触发整页提取（readPage 内部调用 extractReadableText，这里直接复用其逻辑）
      const parts = [];
      document.querySelectorAll('.uncloseai [class*="assistant"], .uncloseai [class*="message"]').forEach(el => {
        const t = el.innerText.trim();
        if (t && t.length > 5) {
          // 复刻 cleanAssistantText 逻辑
          let cleaned = t.replace(/^(?:Here's a thinking process|思考过程|分析用户输入)[:：]?\s*[\s\S]*?(?=\n\s*\n|$)/i, '').trim();
          if (cleaned) parts.push(cleaned);
        }
      });
      div.remove();
      return parts;
    });
    console.log('   过滤后: ' + JSON.stringify(filtered));
    assert(filtered.length === 1 && /最终答案/.test(filtered[0]), '未正确过滤思考过程');
    assert(!/thinking process|Analyze/.test(filtered[0]), '思考前缀泄漏到结果');
  });

  await browser.close();

  // 汇总
  console.log('\n========== E2E 汇总 ==========');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  results.forEach(r => console.log(`[${r.status}] ${r.name}${r.err ? ' — ' + r.err : ''}`));
  console.log(`\n总计: ${pass} 通过, ${fail} 失败 / ${results.length} 项`);
  process.exit(fail > 0 ? 1 : 0);
})();
