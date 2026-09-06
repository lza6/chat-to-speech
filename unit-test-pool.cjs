// unit-test-pool.cjs — P1-3 并发合成 并发池单元测试（Node 原生 node:test）
// 运行：node --test unit-test-pool.cjs  或  node unit-test-pool.cjs
// 验证：pLimit(3) 并发池在 10 任务下任一时刻运行数 ≤ 3，且全部完成
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ===== 手写 pLimit 并发池（无依赖库，与 demo.html prefetch 改造同步） =====
// 语义：构造一个 max 并发池，每调用 pLimit(fn) 排队 fn，任一时刻最多 max 个 fn 在跑
// 429 退避：收到 429 立即降 max=2 + 指数退避重试（本单测验证基础并发，429 退避在 e2e 层验证）
// 注意：用 Object.defineProperties 而非 Object.assign，否则 getter 被读取一次为静态值，
// lowerMax 后 currentMax 不反映变更（U_POOL_3 回归保护此 bug）
function pLimit(max) {
  let active = 0;
  const queue = [];
  let currentMax = max;

  const next = () => {
    if (active >= currentMax || queue.length === 0) return;
    const { fn, resolve, reject } = queue.shift();
    active++;
    Promise.resolve()
      .then(() => fn())
      .then(
        (v) => { active--; resolve(v); next(); },
        (e) => { active--; reject(e); next(); }
      );
  };

  const limiter = (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
  Object.defineProperties(limiter, {
    activeCount: { get: () => active },
    pendingCount: { get: () => queue.length },
    lowerMax: { value: (to) => { currentMax = Math.max(1, to); } },
    restoreMax: { value: () => { currentMax = max; } },
    currentMax: { get: () => currentMax }
  });
  return limiter;
}

module.exports = { pLimit };

// ===== 单元测试 =====

test('U_POOL_1: 10 任务并发池 max=3，任一时刻运行数 ≤ 3', async () => {
  const limit = pLimit(3);
  let maxConcurrent = 0;
  let running = 0;
  const tasks = Array.from({ length: 10 }, (_, i) =>
    limit(async () => {
      running++;
      if (running > maxConcurrent) maxConcurrent = running;
      // 模拟异步工作
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return i;
    })
  );
  const results = await Promise.all(tasks);
  assert.equal(results.length, 10, '应完成 10 任务');
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], '结果顺序应保持');
  assert.ok(maxConcurrent <= 3, `最大并发 ${maxConcurrent} 超过 max=3`);
  assert.ok(maxConcurrent >= 2, `最大并发 ${maxConcurrent} 应至少 2（验证真并发）`);
  assert.equal(limit.activeCount, 0, '全部完成后 activeCount 应为 0');
  assert.equal(limit.pendingCount, 0, '全部完成后 pendingCount 应为 0');
});

test('U_POOL_2: max=1 退化为串行', async () => {
  const limit = pLimit(1);
  let running = 0;
  let maxConcurrent = 0;
  const tasks = Array.from({ length: 5 }, () =>
    limit(async () => {
      running++;
      if (running > maxConcurrent) maxConcurrent = running;
      await new Promise((r) => setTimeout(r, 10));
      running--;
    })
  );
  await Promise.all(tasks);
  assert.equal(maxConcurrent, 1, 'max=1 应严格串行，maxConcurrent=1');
});

test('U_POOL_3: 429 退避降并发到 max=2', async () => {
  const limit = pLimit(3);
  assert.equal(limit.currentMax, 3, '初始 currentMax=3');
  limit.lowerMax(2);
  assert.equal(limit.currentMax, 2, '429 退避后 currentMax=2');
  limit.restoreMax();
  assert.equal(limit.currentMax, 3, '恢复后 currentMax=3');
});

test('U_POOL_4: 错误传播不阻塞队列', async () => {
  const limit = pLimit(2);
  const tasks = [
    limit(async () => { throw new Error('boom'); }).catch((e) => e.message),
    limit(async () => 'ok-1'),
    limit(async () => 'ok-2'),
  ];
  const results = await Promise.all(tasks);
  assert.equal(results[0], 'boom', '第一个任务错误应传播');
  assert.equal(results[1], 'ok-1', '后续任务不受错误影响');
  assert.equal(results[2], 'ok-2', '后续任务不受错误影响');
});
