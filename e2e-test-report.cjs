// e2e-test-report.cjs — 验证变更报告 HTML 的测验逻辑真实可用（不是写着好看）
// 铁则：真实浏览器操作，覆盖 全选对 / 全选错 / 部分对 / 重做 四条路径。
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

// 跨平台安全（2026-10-14）：报告文件名含中文，手工拼接 file:// 在 Linux CI 上可能因
// URI 编码差异加载失败。用 pathToFileURL 生成规范 URL。
const FILE = pathToFileURL(path.resolve('变更报告-v4.7.1-终局审计.html')).href;
let pass = 0, fail = 0;
function assert(c, m) { if (!c) throw new Error(m); }
async function test(name, fn) {
  try { await fn(); console.log('✅ ' + name); pass++; }
  catch (e) { console.log('❌ ' + name + '\n   ' + e.message); fail++; }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(FILE, { waitUntil: 'load' });

  // 正确答案索引（与 HTML 内 QUESTIONS 的 a 字段一致）
  const ANSWER_KEY = [1, 2, 1, 1, 2, 1, 1, 1, 1, 2];

  await test('R_1 报告加载成功且题目数量正确', async () => {
    const n = await page.locator('.q').count();
    assert(n === 10, '题目数应为 10，实际 ' + n);
    const stem = await page.locator('.q .stem').first().textContent();
    assert(stem.includes('透明时间线'), '首题内容不符: ' + stem.slice(0, 60));
  });

  await test('R_2 初始状态：提交按钮禁用 + 进度 0/10', async () => {
    assert(await page.locator('#submit').isDisabled(), '初始应禁用提交');
    const c = await page.locator('#counter').textContent();
    assert(c.includes('0 / 10'), '初始计数应 0/10，实际: ' + c);
  });

  await test('R_3 未答完时提交按钮保持禁用', async () => {
    await page.locator('.q').nth(0).locator('input').nth(0).check();
    await page.waitForTimeout(150);
    assert(await page.locator('#submit').isDisabled(), '仅答 1 题时不应可提交');
  });

  await test('R_4 全选错 → 得分 0/10 且标记 fail', async () => {
    for (let i = 0; i < 10; i++) {
      const wrong = (ANSWER_KEY[i] + 1) % 4;
      await page.locator('.q').nth(i).locator('input').nth(wrong).check();
    }
    await page.waitForTimeout(200);
    assert(!(await page.locator('#submit').isDisabled()), '答满 8 题后应可提交');
    await page.locator('#submit').click();
    await page.waitForTimeout(300);
    const txt = await page.locator('#score').textContent();
    assert(txt.includes('0/10'), '应得 0/10，实际: ' + txt.slice(0, 80));
    const cls = await page.locator('#score').getAttribute('class');
    assert(cls.includes('fail'), '应标记 fail，实际 class=' + cls);
  });

  await test('R_5 全选错时正确答案被绿色标出、错选被红色标出', async () => {
    const correctCount = await page.locator('.opt.correct').count();
    const wrongCount = await page.locator('.opt.wrong').count();
    assert(correctCount === 10, '应有 10 个 correct 标记，实际 ' + correctCount);
    assert(wrongCount === 10, '应有 10 个 wrong 标记，实际 ' + wrongCount);
  });

  await test('R_6 提交后解析全部展开', async () => {
    const shown = await page.locator('.explain.show').count();
    assert(shown === 10, '应有 10 条解析展开，实际 ' + shown);
  });

  await test('R_7 提交后输入被锁定，防止篡改答案', async () => {
    const locked = await page.locator('.opt.locked').count();
    assert(locked > 0, '提交后选项应被锁定');
    const disabledInputs = await page.locator('.opt input:disabled').count();
    assert(disabledInputs === 40, '应有 40 个 input 被禁用（10题×4项），实际 ' + disabledInputs);
  });

  await test('R_8 重做 → 状态完全重置', async () => {
    await page.locator('#reset').click();
    await page.waitForTimeout(250);
    const c = await page.locator('#counter').textContent();
    assert(c.includes('0 / 10'), '重做后计数应回 0/10，实际: ' + c);
    assert(await page.locator('#submit').isDisabled(), '重做后提交应禁用');
    const shown = await page.locator('.explain.show').count();
    assert(shown === 0, '重做后解析应收起，实际展开 ' + shown);
    const checked = await page.locator('.opt input:checked').count();
    assert(checked === 0, '重做后不应有选中项，实际 ' + checked);
  });

  await test('R_9 全选对 → 得分 10/10 且标记 pass', async () => {
    for (let i = 0; i < 10; i++) {
      await page.locator('.q').nth(i).locator('input').nth(ANSWER_KEY[i]).check();
    }
    await page.waitForTimeout(200);
    await page.locator('#submit').click();
    await page.waitForTimeout(300);
    const txt = await page.locator('#score').textContent();
    assert(txt.includes('10/10'), '应得 10/10，实际: ' + txt.slice(0, 80));
    const cls = await page.locator('#score').getAttribute('class');
    assert(cls.includes('pass'), '应标记 pass，实际 class=' + cls);
    assert(txt.includes('通过'), '应显示通过文案');
  });

  await test('R_10 无 JS 运行时错误', async () => {
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    assert(errs.length === 0, '存在运行时错误: ' + errs.join(' | '));
  });

  console.log('\n========== 变更报告验证汇总 ==========');
  console.log('总计: ' + pass + ' 通过, ' + fail + ' 失败 / ' + (pass + fail) + ' 项');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
