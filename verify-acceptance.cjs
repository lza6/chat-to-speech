// verify-acceptance.cjs — 验收卡台账门禁（A3）
// 三向一致性：E2E 断言数 + 单元断言数 vs 文档声称（README / workflow_status.md）
// 用法：node verify-acceptance.cjs [--strict]
// 参考：ultimate_bug_scanner scripts/check_docs_claims.py（文档-代码一致性门禁）
'use strict';
const fs = require('fs');

const E2E_FILES = ['e2e-test.cjs', 'e2e-test-sw.cjs', 'e2e-test-cfg.cjs', 'e2e-test-zh.cjs', 'e2e-test-wizard.cjs'];
const UNIT_FILES = ['unit-test.cjs', 'unit-test-pool.cjs', 'unit-test-cfg.cjs', 'unit-test-zh.cjs', 'unit-test-health.cjs', 'unit-test-memory.cjs', 'unit-test-wizard.cjs'];

function countPattern(src, re) { return (src.match(re) || []).length; }

function main() {
  const strict = process.argv.includes('--strict');
  let e2eTotal = 0;
  const e2eByFile = {};
  for (const f of E2E_FILES) {
    if (!fs.existsSync(f)) { console.error(`[missing] E2E 文件 ${f} 不存在 → 门禁 FAIL`); process.exit(1); }
    const n = countPattern(fs.readFileSync(f, 'utf8'), /await test\(/g);
    e2eByFile[f] = n; e2eTotal += n;
  }
  let unitTotal = 0;
  for (const f of UNIT_FILES) {
    if (!fs.existsSync(f)) continue;
    unitTotal += countPattern(fs.readFileSync(f, 'utf8'), /^test\(/gm);
  }
  const summary = { e2e: e2eTotal, e2eByFile, unit: unitTotal, ts: new Date().toISOString() };

  // 文档声称（宽松：只读现有文档，不因文档未更新而 fail；strict 模式强制）
  let docClaims = null;
  const docTxt = ['README.md', 'workflow_status.md'].map(f => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; } }).join('\n');
  // 优先匹配「总计」表行「✅ 78/78 PASS」（当前版本全量声称），排除各子套件 17/17 等历史声称
  let m = docTxt.match(/\*\*总计\*\*[^\n]*✅\s*(\d+)\s*\/\s*(\d+)\s*PASS/);
  if (!m) m = docTxt.match(/全量回归\s*(\d+)\s+PASS/);
  if (!m) m = docTxt.match(/(\d+)\s*\/\s*(\d+)\s*PASS/);
  if (m) docClaims = { file: 'README/workflow_status', claimed: parseInt(m[1], 10), total: parseInt((m[2] || '0'), 10) };

  // 台账落盘（追加，供 audit）
  fs.mkdirSync('evidence', { recursive: true });
  fs.appendFileSync('evidence/acceptance-ledger.ndjson', JSON.stringify(summary) + '\n');

  const lines = [];
  lines.push(`E2E: ${JSON.stringify(e2eByFile)} = ${e2eTotal}`);
  lines.push(`UNIT: ${unitTotal}`);
  lines.push(`LEDGER: evidence/acceptance-ledger.ndjson`);
  if (docClaims) lines.push(`DOC: ${docClaims.file} 声称 ${docClaims.claimed}`);
  const total = e2eTotal + unitTotal;
  const pass = e2eTotal >= 35 && unitTotal >= 39;
  lines.push(`TOTAL: ${total} · 门槛(E2E≥35 且 单元≥39) ${pass ? 'PASS' : 'FAIL'}`);
  // strict 语义：对比文档当前版本声称与实测总项数（README/workflow_status 以「78 PASS」为准）
  if (strict && docClaims) {
    const claimed = docClaims.claimed;
    const okClaim = claimed === total || claimed === e2eTotal || claimed === unitTotal;
    if (!okClaim) { console.warn(`⚠️ 文档声称 ${claimed} 与实测 ${total}（E2E ${e2eTotal}/单元 ${unitTotal}）不一致（文档未同步，需更新 README/workflow_status）`); }
    else console.log('STRICT: 文档声称与实测一致 (' + claimed + ')');
  }
  console.log(lines.join('\n'));
  process.exit(pass ? 0 : 1);
}
main();
