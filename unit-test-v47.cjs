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

// ===== V5-11 补丁：播放结果 → 合成链返回值（与 demo.html playResultToChainResult 同步）=====
// 根因（2026-10-14 实测）：在线合成路径 playBlob 返回 'blocked'（自动播放被拦）时循环 break
// 后仍 return 'ok'，speak() 随即显示"播放完毕。"——用户什么都没听到却被报告成功。
// 这是 P-13「失败被静默当成功」的同类残留：状态机定义了 blocked→stopped 却从未调用。
// 修复方式：把「播放结果 → 链返回值」的映射抽为纯函数，单点决策并纳入测试。
function playResultToChainResult(r) {
  if (r === 'ended') return { chain: 'ok', playAction: 'done' };
  if (r === 'stopped') return { chain: 'stopped', playAction: 'stopped' };
  if (r === 'blocked') return { chain: 'blocked', playAction: 'blocked' };
  return { chain: 'error', playAction: 'error' }; // 'error' 及一切未预期值
}

test('U_PLAY_6 blocked（自动播放被拦）不得被当作成功', () => {
  const r = playResultToChainResult('blocked');
  assert.equal(r.chain, 'blocked');
  assert.notEqual(r.chain, 'ok', 'blocked 绝不能映射为 ok —— 用户没听到声音');
  assert.equal(r.playAction, 'blocked');
  assert.equal(nextPlayState('playing', r.playAction), 'stopped');
});

test('U_PLAY_7 未预期返回值一律降级为 error（防御性，禁止静默成功）', () => {
  for (const bad of ['error', undefined, null, '', 'weird', 0, {}]) {
    const r = playResultToChainResult(bad);
    assert.equal(r.chain, 'error', '未预期值 ' + JSON.stringify(bad) + ' 必须降级为 error');
    assert.equal(r.playAction, 'error');
  }
});

test('U_PLAY_8 正常结束与用户停止的映射不互相污染', () => {
  assert.equal(playResultToChainResult('ended').chain, 'ok');
  assert.equal(playResultToChainResult('stopped').chain, 'stopped');
  // stopped 不能触发 error 态（用户主动停止不是失败）
  assert.equal(playResultToChainResult('stopped').playAction, 'stopped');
  assert.equal(nextPlayState('playing', 'stopped'), 'stopped');
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
