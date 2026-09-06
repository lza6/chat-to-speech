// unit-test-cfg.cjs — P0-3 配置中心 单元测试（Node 原生 node:test）
// 验证：cfg 导出不含 api_key / 导入 schema 校验 / URL 校验 / 引擎开关默认值
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ===== 复刻 demo.html 的 P0-3 配置中心纯逻辑（与 demo.html 同步） =====
const CFG_KEY = 'tts_cfg_v1';
const CFG_VERSION = 1;
const DEFAULT_CFG = {
    version: CFG_VERSION,
    tts_endpoint: '',
    tts_model: '',
    voices_endpoint: '',
    voices_custom: [],
    api_key: '',
    api_key_in_vault: true,
    engines_enabled: { engine1: true, engine2: true, engine3: true },
    clean_custom_prefixes: []
};

// 模拟 localStorage（Node 无 localStorage）
const store = new Map();
const fakeLocalStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};

function loadCfg() {
    try {
        const raw = fakeLocalStorage.getItem(CFG_KEY);
        if (!raw) return { ...DEFAULT_CFG };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CFG };
        return { ...DEFAULT_CFG, ...parsed, engines_enabled: { ...DEFAULT_CFG.engines_enabled, ...(parsed.engines_enabled || {}) } };
    } catch (_) { return { ...DEFAULT_CFG }; }
}
function saveCfg(cfg) {
    try { fakeLocalStorage.setItem(CFG_KEY, JSON.stringify({ ...cfg, version: CFG_VERSION })); } catch (_) {}
}
function exportCfg() {
    const c = loadCfg();
    const safe = { ...c, api_key: '', version: CFG_VERSION };
    return JSON.stringify(safe, null, 2);
}
function importCfg(jsonStr) {
    const ALLOWED = Object.keys(DEFAULT_CFG);
    const cfg = JSON.parse(jsonStr);
    if (!cfg || typeof cfg !== 'object') throw new Error('配置 JSON 非法：非对象');
    const cleaned = { ...DEFAULT_CFG };
    for (const k of Object.keys(cfg)) {
        if (!ALLOWED.includes(k)) continue; // 拒绝非法字段
        if (k === 'version') { cleaned.version = CFG_VERSION; continue; }
        if (k === 'engines_enabled') { cleaned.engines_enabled = { ...DEFAULT_CFG.engines_enabled, ...(cfg.engines_enabled || {}) }; continue; }
        if (k === 'api_key') continue; // 导入不恢复 api_key
        cleaned[k] = cfg[k];
    }
    if (cleaned.tts_endpoint && !/^https?:\/\/.+/.test(cleaned.tts_endpoint)) throw new Error('tts_endpoint 非合法 URL');
    if (cleaned.voices_endpoint && !/^https?:\/\/.+/.test(cleaned.voices_endpoint)) throw new Error('voices_endpoint 非合法 URL');
    saveCfg(cleaned);
    return cleaned;
}

// ===== 单元测试 =====

test('U_CFG_1: 导出 JSON 不含 api_key 字段', () => {
    store.clear();
    const c = loadCfg();
    c.tts_endpoint = 'https://my.example.com/v1/audio/speech';
    c.api_key = 'sk-super-secret-123456';
    saveCfg(c);
    const exported = exportCfg();
    const parsed = JSON.parse(exported);
    assert.equal(parsed.api_key, '', '导出 JSON 不应含 api_key');
    assert.ok(!/sk-super-secret/.test(exported), '导出 JSON 字符串不应含明文 key');
    assert.equal(parsed.tts_endpoint, 'https://my.example.com/v1/audio/speech', '端点应保留');
});

test('U_CFG_2: 导入 JSON schema 校验拒绝非法字段', () => {
    store.clear();
    const malicious = JSON.stringify({
        version: 1,
        tts_endpoint: 'https://ok.example.com/v1/audio/speech',
        tts_model: 'tts-1-f5',
        evil_field: '<script>alert(1)</script>',  // 非法字段
        another_malicious: 'drop table'
    });
    const cleaned = importCfg(malicious);
    assert.equal(cleaned.tts_endpoint, 'https://ok.example.com/v1/audio/speech');
    assert.equal(cleaned.tts_model, 'tts-1-f5');
    assert.equal(cleaned.evil_field, undefined, '非法字段应被拒绝');
    assert.equal(cleaned.another_malicious, undefined, '非法字段应被拒绝');
});

test('U_CFG_3: 端点 URL 必须带协议', () => {
    store.clear();
    // 合法 URL
    assert.doesNotThrow(() => importCfg(JSON.stringify({ tts_endpoint: 'https://ok.example.com/v1/audio/speech' })));
    // 非法 URL（无协议）
    assert.throws(() => importCfg(JSON.stringify({ tts_endpoint: 'not-a-url' })), /非合法 URL/);
    assert.throws(() => importCfg(JSON.stringify({ voices_endpoint: 'ftp://bad' })), /非合法 URL/); // 非 http
});

test('U_CFG_4: 导入不恢复 api_key（安全）', () => {
    store.clear();
    const withKey = JSON.stringify({ tts_endpoint: 'https://ok.example.com', api_key: 'sk-imported-123' });
    const cleaned = importCfg(withKey);
    assert.equal(cleaned.api_key, '', '导入不应恢复 api_key');
    assert.equal(cleaned.tts_endpoint, 'https://ok.example.com');
});

test('U_CFG_5: 引擎开关默认全开 + 可独立关闭', () => {
    store.clear();
    const c = loadCfg();
    assert.equal(c.engines_enabled.engine1, true, '默认 engine1 开');
    assert.equal(c.engines_enabled.engine2, true, '默认 engine2 开');
    assert.equal(c.engines_enabled.engine3, true, '默认 engine3 开');
    // 导入时只关 engine2
    const cleaned = importCfg(JSON.stringify({ engines_enabled: { engine2: false } }));
    assert.equal(cleaned.engines_enabled.engine1, true, 'engine1 保持默认开');
    assert.equal(cleaned.engines_enabled.engine2, false, 'engine2 已关');
    assert.equal(cleaned.engines_enabled.engine3, true, 'engine3 保持默认开');
});

test('U_CFG_6: 往返一致性（导出→导入→字段一致，除 api_key）', () => {
    store.clear();
    const orig = loadCfg();
    orig.tts_endpoint = 'https://rt.example.com/v1/audio/speech';
    orig.tts_model = 'custom-tts';
    orig.voices_endpoint = 'https://rt.example.com/v1/voices';
    orig.api_key = 'sk-orig-999';
    saveCfg(orig);
    const exported = exportCfg();
    store.clear();
    const imported = importCfg(exported);
    assert.equal(imported.tts_endpoint, 'https://rt.example.com/v1/audio/speech');
    assert.equal(imported.tts_model, 'custom-tts');
    assert.equal(imported.voices_endpoint, 'https://rt.example.com/v1/voices');
    assert.equal(imported.api_key, '', 'api_key 经往返后应为空');
});

test('U_CFG_7: loadCfg 损坏 JSON 不崩溃（返回默认）', () => {
    store.clear();
    fakeLocalStorage.setItem(CFG_KEY, '{not valid json');
    const c = loadCfg();
    assert.deepEqual(c, { ...DEFAULT_CFG }, '损坏 JSON 应返回默认配置');
});

test('U_CFG_8: version 被强制覆盖为当前版本', () => {
    store.clear();
    const cleaned = importCfg(JSON.stringify({ version: 999, tts_endpoint: 'https://ok.example.com' }));
    assert.equal(cleaned.version, CFG_VERSION, 'version 应被覆盖为 1');
});
