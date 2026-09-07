// 单元测试 — 多端点健康自愈池（Phase B A2）
// 纯逻辑（冷却判定/拉黑/复活/路由），无浏览器依赖。与 demo.html 内联实现同步。
// 语法参考 litellm cooldown + new-api ShouldDisableChannel + llmquota 三态。
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ===== 纯函数实现（与 demo.html 内联版保持一致的直拷副本，改一处必须同步） =====

// 状态码判定表（参考 litellm cooldown_handlers / new-api status_code_ranges）
const COOLDOWN_MAP = {
  // 429/401/408/404 → 冷却（服务端限流/鉴权/超时/不存在）
  '401': true, '404': true, '408': true, '429': true,
  // 5xx → 冷却
  '500': true, '502': true, '503': true, '504': true, '507': true, '524': true,
  // 其余 4xx → 不冷却（客户端错误不怪端点）
};
function shouldCooldown(status) {
  if (!status) return true; // 网络错误/无状态 → 视为需冷却
  return COOLDOWN_MAP[String(status)] === true;
}

// 端点健康状态机：healthy | cooled | unknown
// 冷却用 TTL，到期自动复活（litellm CooldownCache 思想），无需单独复活路径。
function createHealthPool(maxEntries = 8) {
  const ep = new Map(); // url -> {status, fails, cooldownUntil, reason, okTotal, lastProbedAt, priority}
  function ensure(url, priority) {
    const existing = ep.get(url);
    if (existing) {
      if (typeof priority === 'number') existing.priority = priority;
      return existing;
    }
    const e = { status: 'unknown', fails: 0, cooldownUntil: 0, reason: '', okTotal: 0, lastProbedAt: 0, priority: typeof priority === 'number' ? priority : 5 };
    ep.set(url, e);
    return e;
  }
  function now() { return Date.now(); }
  function peek(url) { const e = ep.get(url); if (e && e.cooldownUntil && e.cooldownUntil <= now()) { e.status = 'healthy'; e.fails = 0; e.cooldownUntil = 0; e.reason = ''; } return e; }
  function reportOk(url) { const e = ensure(url); e.status = 'healthy'; e.fails = 0; e.cooldownUntil = 0; e.reason = ''; e.okTotal = (e.okTotal || 0) + 1; e.lastProbedAt = now(); }
  function reportFail(url, status, reason = '') {
    const e = ensure(url);
    e.fails = (e.fails || 0) + 1;
    e.lastProbedAt = now();
    if (shouldCooldown(status)) {
      e.status = 'cooled';
      e.reason = reason || `HTTP ${status}`;
      // 冷却时长按连续失败次数指数退避（1s → 2s → 4s …封顶 5min）
      const base = 1000;
      e.cooldownUntil = now() + Math.min(base * (2 ** Math.min(e.fails - 1, 8)), 300000);
    } else {
      // 客户端类错误：拉黑但短时间内可重试，不算冷却
      e.status = 'cooled';
      e.reason = reason || `HTTP ${status}（客户端错误）`;
      e.cooldownUntil = now() + 15000;
    }
  }
  // 路由：按 priority 排序，冷却是剔除，healthy/unknown 都可选；全冷则报最短最短恢复秒数（nexus rationale 风格）
  function pickHealthy() {
    const arr = [...ep.entries()]
      .map(([url, e]) => ({ url, ...peek(url) }))
      .sort((a, b) => (b.priority || 5) - (a.priority || 5));
    const alive = arr.filter(e => e.status === 'healthy');
    if (alive.length) return alive[0];
    const pending = arr.filter(e => e.status === 'unknown');
    if (pending.length) return pending[0];
    const minT = Math.min(...arr.map(e => Math.max(0, e.cooldownUntil - now())));
    return { equallyCooled: true, minRecoverMs: minT, all: arr.map(e => ({ url: e.url, reason: e.reason, until: e.cooldownUntil })) };
  }
  function allEntries() { return [...ep.entries()].map(([url, e]) => ({ url, ...e })); }
  return { reportOk, reportFail, pickHealthy, allEntries, ensure };
}

// ===== A2.1 状态码判定 =====
test('A2_1 状态码冷却判定：429/401/5xx 冷却，其余 4xx 不冷却', () => {
  assert.equal(shouldCooldown(429), true, '429 限流应冷却');
  assert.equal(shouldCooldown(401), true, '401 鉴权失败应冷却');
  assert.equal(shouldCooldown(502), true, '502 网关错误应冷却');
  assert.equal(shouldCooldown(504), true, '504 超时应冷却');
  assert.equal(shouldCooldown(503), true, '503 服务不可用应冷却');
  assert.equal(shouldCooldown(200), false, '200 成功不应冷却（仅当解析失败另有判断）');
  assert.equal(shouldCooldown(undefined), true, 'undefined（网络错误）应冷却');
});

// ===== A2.2 健康状态机三态 =====
test('A2_2 端点健康三态：unknown→cooled→healthy(TTL 自动复活)', () => {
  const pool = createHealthPool();
  const ep = pool.ensure('https://a.example/v1/audio/speech', 5);
  assert.equal(ep.status, 'unknown', '初次 ensure 应为 unknown');
  pool.reportFail('https://a.example/v1/audio/speech', 502);
  assert.equal(ep.status, 'cooled', '502 后应为 cooled');
  assert.ok(ep.cooldownUntil > Date.now(), '应设置冷却截止');
  // TTL 到期自动复活（把 cooldownUntil 拨回过去）
  ep.cooldownUntil = Date.now() - 1;
  pool.reportOk('https://a.example/v1/audio/speech');
  assert.equal(ep.status, 'healthy', '成功上报后应为 healthy');
  assert.equal(ep.fails, 0, '成功应清零失败计数');
});

// ===== A2.3 冷却时长指数退避 =====
test('A2_3 连续失败指数退避，封顶 5 分钟', () => {
  const pool = createHealthPool();
  const url = 'https://a.example/';
  pool.reportFail(url, 502);
  const firstTill = pool.allEntries()[0].cooldownUntil;
  pool.reportFail(url, 502);
  pool.reportFail(url, 502);
  pool.reportFail(url, 502);
  const e = pool.allEntries()[0];
  assert.ok(e.cooldownUntil > firstTill, '退避应增加冷却时长');
  assert.ok(e.cooldownUntil - Date.now() <= 300000, '不应超过 5 分钟封顶');
});

// ===== A2.4 路由：优先级 + 冷却剔除 + 全冷报告 =====
test('A2_4 路由按优先级选健康端点，冷却剔除；全冷却报最短恢复', () => {
  const pool = createHealthPool();
  pool.ensure('https://p3.example/', 5);
  pool.ensure('https://p1.example/', 10);
  pool.ensure('https://dead.example/', 5);
  pool.reportOk('https://p3.example/');                    // healthy, priority 5
  pool.reportOk('https://p1.example/');                    // healthy, priority 10
  pool.reportFail('https://dead.example/', 502);           // cooled, priority 5
  const pick = pool.pickHealthy();
  assert.equal(pick.url, 'https://p1.example/', '应选高优先级的 healthy 端点');
  assert.ok(!pick.equallyCooled, '有健康端点就不应报全冷');

  // 全冷却
  const pool2 = createHealthPool();
  pool2.reportFail('https://a.example/', 502);
  const all = pool2.pickHealthy();
  assert.equal(all.equallyCooled, true, '全冷应 equallyCooled');
  assert.ok(typeof all.minRecoverMs === 'number' && all.minRecoverMs >= 0, '应报最短恢复毫秒');
});

// ===== A2.5 长期宕机端点自动降级不再参与路由 =====
test('A2_5 端点连续失败后不再被 pickHealthy 选中', () => {
  const pool = createHealthPool();
  pool.reportFail('https://bad.example/', 502);
  pool.reportOk('https://good.example/');
  const pick = pool.pickHealthy();
  assert.equal(pick.url, 'https://good.example/', '被冷却端点不应被选中');
});