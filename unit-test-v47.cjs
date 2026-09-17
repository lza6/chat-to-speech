// 单元测试 — V5-11 播放状态机 / E6 语速（纯 JS，无浏览器）
// 运行：node --test unit-test-v47.cjs
// 约定：本文件函数为 demo.html 内联版的「直拷副本」，改一处必须同步另一处。
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ===== V5-11 播放状态机（与 demo.html nextPlayState 同步） =====
function nextPlayState(state, action) {
  const T = {
    idle: { speak: 'preparing', stop: 'stopped' },
    preparing: { ready: 'synthesizing', playing: 'playing', error: 'errored', stop: 'stopped' },
    synthesizing: { playing: 'playing', done: 'completed', error: 'errored', stop: 'stopped' },
    playing: { chunk: 'playing', paused: 'paused', error: 'errored', stopped: 'stopped', done: 'completed', blocked: 'stopped' },
    paused: { resume: 'playing', stop: 'stopped', error: 'errored' },
    errored: { speak: 'preparing', reset: 'idle' },
    stopped: { speak: 'preparing', reset: 'idle' },
    completed: { speak: 'preparing', reset: 'idle' }
  };
  return (T[state] && T[state][action]) || null;
}

// ===== E6 语速（与 demo.html clampSpeed 同步） =====
function clampSpeed(n) {
  const v = parseFloat(n);
  if (!isFinite(v)) return 1;
  return Math.min(4, Math.max(0.25, v));
}
const SPEED_PRESETS = ['0.75', '1', '1.5', '2', '3'];

test('U_PLAY_1 error 是终结态：playing/synthesizing 遇 error 只能到 errored', () => {
  assert.equal(nextPlayState('playing', 'error'), 'errored');
  assert.equal(nextPlayState('synthesizing', 'error'), 'errored');
  assert.equal(nextPlayState('preparing', 'error'), 'errored');
  // errored 之后不能再被当作 ok（无 ok/继续 转移）
  assert.equal(nextPlayState('errored', 'chunk'), null);
  assert.equal(nextPlayState('errored', 'done'), null);
});

test('U_PLAY_2 三态互斥：stopped/blocked/error 各落不同态', () => {
  assert.equal(nextPlayState('playing', 'stopped'), 'stopped');
  assert.equal(nextPlayState('playing', 'blocked'), 'stopped');
  assert.equal(nextPlayState('playing', 'error'), 'errored');
  assert.notEqual(nextPlayState('playing', 'stopped'), nextPlayState('playing', 'error'));
});

test('U_PLAY_3 竞态只保留最新：任何终结态都可由 speak 重新开始', () => {
  assert.equal(nextPlayState('stopped', 'speak'), 'preparing');
  assert.equal(nextPlayState('errored', 'speak'), 'preparing');
  assert.equal(nextPlayState('completed', 'speak'), 'preparing');
  assert.equal(nextPlayState('idle', 'speak'), 'preparing');
});

test('U_PLAY_4 恢复续播：paused→resume→playing；speak 全链路', () => {
  assert.equal(nextPlayState('paused', 'resume'), 'playing');
  assert.equal(nextPlayState('idle', 'speak'), 'preparing');
  assert.equal(nextPlayState('preparing', 'ready'), 'synthesizing');
  assert.equal(nextPlayState('synthesizing', 'playing'), 'playing');
  assert.equal(nextPlayState('playing', 'done'), 'completed');
  assert.equal(nextPlayState('playing', 'paused'), 'paused');
});

test('U_PLAY_5 非法转移返回 null（防御性）', () => {
  assert.equal(nextPlayState('idle', 'error'), null);
  assert.equal(nextPlayState('completed', 'chunk'), null);
  assert.equal(nextPlayState('errored', 'done'), null);
  assert.equal(nextPlayState('wat', 'speak'), null);
  assert.equal(nextPlayState('idle', 'wat'), null);
});

test('U_SPEED_1 clampSpeed 钳位到 0.25-4', () => {
  assert.equal(clampSpeed('0.1'), 0.25);
  assert.equal(clampSpeed('5'), 4);
  assert.equal(clampSpeed('1.5'), 1.5);
  assert.equal(clampSpeed('0.25'), 0.25);
  assert.equal(clampSpeed('4'), 4);
  assert.equal(clampSpeed('abc'), 1);
  assert.equal(clampSpeed(''), 1);
});

test('U_SPEED_2 预设值全部落在合法范围且可被 clampSpeed 还原', () => {
  for (const p of SPEED_PRESETS) {
    const v = clampSpeed(p);
    assert.ok(v >= 0.25 && v <= 4, '预设 ' + p + ' 超出范围: ' + v);
    assert.equal(clampSpeed(String(v)), v);
  }
});
