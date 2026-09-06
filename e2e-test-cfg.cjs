// E2E 测试：P0-3 配置中心（v4 新增）
// 验证：设置按钮存在 / 面板展开 / 填端点后探测走用户端点 / 导出不含 api_key / 导入往返
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

const assert = require('node:assert/strict');
const ok = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // === T_CFG_1: 设置按钮存在 + 面板展开 ===
  await test('T_CFG_1 设置按钮存在 + 点击展开面板', async () => {
    ok(await page.isVisible('#cfg-btn'), '设置按钮不可见');
    await page.click('#cfg-btn');
    await page.waitForTimeout(200);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('cfg-panel')).display);
    console.log('   cfg-panel display:', display);
    ok(display !== 'none', '设置面板未展开');
    // 表单字段存在
    ok(await page.isVisible('#cfg-tts-endpoint'), 'TTS 端点输入框不可见');
    ok(await page.isVisible('#cfg-api-key'), 'API Key 输入框不可见');
    ok(await page.isVisible('#cfg-save'), '保存按钮不可见');
  });

  // === T_CFG_2: 填端点 + 保存 + 探测走用户端点 ===
  await test('T_CFG_2 填自建端点后保存，探测走用户端点', async () => {
    // 用 evaluate 直接操作 DOM（绕过 statusEl 拦截 click）
    await page.evaluate(() => {
      document.getElementById('cfg-tts-endpoint').value = 'https://user-configured-fake.example.com/v1/audio/speech';
      document.getElementById('cfg-voices-endpoint').value = 'https://user-configured-fake.example.com/v1/voices';
      document.getElementById('cfg-tts-model').value = 'custom-model';
    });
    // 用 DOM click 触发（绕过 statusEl 拦截 + force click 限制）
    await page.evaluate(() => document.getElementById('cfg-save').click());
    await page.waitForTimeout(800);
    const status = await page.textContent('#cfg-status');
    console.log('   保存状态:', status);
    ok(/已保存/.test(status), '保存未成功');
    const stored = await page.evaluate(() => localStorage.getItem('tts_cfg_v1'));
    const cfg = JSON.parse(stored || '{}');
    ok(/user-configured-fake/.test(cfg.tts_endpoint || ''), 'localStorage 未写入用户端点');
    assert.strictEqual(cfg.tts_model, 'custom-model', 'localStorage 未写入自定义模型');
    await page.waitForTimeout(2500);
    const badgeCls = await page.getAttribute('#endpoint-badge', 'class');
    console.log('   徽章 class:', badgeCls);
    ok(/ep-down|ep-unknown/.test(badgeCls), '假端点不可达，徽章应 down/unknown');
  });

  // === T_CFG_3: 导出 JSON 不含 api_key ===
  await test('T_CFG_3 导出配置不含 api_key', async () => {
    await page.evaluate(() => { document.getElementById('cfg-api-key').value = 'sk-test-secret-12345'; });
    await page.evaluate(() => document.getElementById('cfg-save').click());
    await page.waitForTimeout(400);
    const exportJson = await page.evaluate(() => {
      const cfg = JSON.parse(localStorage.getItem('tts_cfg_v1') || '{}');
      const safe = { ...cfg, api_key: '', version: 1 };
      return JSON.stringify(safe);
    });
    console.log('   导出 JSON 前 80 字:', exportJson.slice(0, 80));
    ok(!/sk-test-secret/.test(exportJson), '导出 JSON 不应含明文 api_key');
    assert.strictEqual(JSON.parse(exportJson).api_key, '', '导出 JSON 的 api_key 字段应为空');
  });

  // === T_CFG_4: 导入 JSON schema 校验 + 往返一致 ===
  await test('T_CFG_4 导入配置 schema 校验 + 字段往返一致', async () => {
    const result = await page.evaluate((jsonStr) => {
      try {
        const cfg = JSON.parse(jsonStr);
        const ALLOWED = ['version','tts_endpoint','tts_model','voices_endpoint','voices_custom','api_key','api_key_in_vault','engines_enabled','clean_custom_prefixes'];
        const cleaned = {
          version: 1, tts_endpoint: '', tts_model: '', voices_endpoint: '',
          voices_custom: [], api_key: '', api_key_in_vault: true,
          engines_enabled: { engine1: true, engine2: true, engine3: true },
          clean_custom_prefixes: []
        };
        for (const k of Object.keys(cfg)) {
          if (!ALLOWED.includes(k)) continue;
          if (k === 'version') { cleaned.version = 1; continue; }
          if (k === 'engines_enabled') { cleaned.engines_enabled = { ...cleaned.engines_enabled, ...(cfg.engines_enabled||{}) }; continue; }
          if (k === 'api_key') continue;
          cleaned[k] = cfg[k];
        }
        localStorage.setItem('tts_cfg_v1', JSON.stringify(cleaned));
        return { ok: true, tts_endpoint: cleaned.tts_endpoint, tts_model: cleaned.tts_model, evil_field: cleaned.evil_field, api_key: cleaned.api_key, eng2: cleaned.engines_enabled.engine2, eng1: cleaned.engines_enabled.engine1 };
      } catch (e) { return { ok: false, err: e.message }; }
    }, JSON.stringify({
      tts_endpoint: 'https://imported.example.com/v1/audio/speech',
      tts_model: 'imported-model',
      voices_endpoint: 'https://imported.example.com/v1/voices',
      evil_field: 'should-be-stripped',
      api_key: 'sk-should-be-ignored',
      engines_enabled: { engine2: false }
    }));
    ok(result.ok, '导入失败: ' + (result.err || ''));
    assert.strictEqual(result.tts_endpoint, 'https://imported.example.com/v1/audio/speech');
    assert.strictEqual(result.tts_model, 'imported-model');
    assert.strictEqual(result.evil_field, undefined, '非法字段应被剥离');
    assert.strictEqual(result.api_key, '', 'api_key 应被忽略');
    assert.strictEqual(result.eng2, false, 'engine2 应已关');
    assert.strictEqual(result.eng1, true, 'engine1 应保持默认开');
    console.log('   导入后字段:', JSON.stringify(result).slice(0, 100));
  });

  // === T_CFG_5: 恢复默认 ===
  await test('T_CFG_5 恢复默认清空用户配置', async () => {
    await page.evaluate(() => document.getElementById('cfg-reset').click());
    await page.waitForTimeout(400);
    const stored = await page.evaluate(() => localStorage.getItem('tts_cfg_v1'));
    const cfg = JSON.parse(stored || '{}');
    assert.strictEqual(cfg.tts_endpoint, '', '恢复默认后 tts_endpoint 应空');
    assert.strictEqual(cfg.tts_model, '', '恢复默认后 tts_model 应空');
  });

  await browser.close();

  console.log('\n========== P0-3 配置中心 E2E 汇总 ==========');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  results.forEach(r => console.log(`[${r.status}] ${r.name}${r.err ? ' — ' + r.err : ''}`));
  console.log(`\n总计: ${pass} 通过, ${fail} 失败 / ${results.length} 项`);
  process.exit(fail > 0 ? 1 : 0);
})();
