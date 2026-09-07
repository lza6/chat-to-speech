// verify-acceptance.cjs — 验收卡台账门禁（A3）
// 三向一致性：E2E 断言数 + 单元断言数 vs 文档声称（README / workflow_status.md）
// 用法：node verify-acceptance.cjs [--strict]
// 参考：ultimate_bug_scanner scripts/check_docs_claims.py（文档-代码一致性门禁）
'use strict';
const fs = require('fs');

const E2E_FILES = ['e2e-test.cjs', 'e2e-test-sw.cjs', 'e2e-test-cfg.cjs', 'e2e-test-zh.cjs'];
const UNIT_FILES = ['unit-test.cjs', 'unit-test-pool.cjs', 'unit-test-cfg.cjs', 'unit-test-zh.cjs', 'unit-test-health.cjs'];

function countPattern(src, re) { return (src.match(re) || []).length; }

function main() {
  const strict = process.argv.includes('--strict');
  let e2eTotal = 0;
  const e2eByFile = {};
  for (const f of E2E_FILES) {
    if (!fs.existsSync(f)) { console.error(`[missing] ${f}`); continue; }
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
  for (const f of ['README.md', 'workflow_status.md']) {
    if (!fs.existsSync(f)) continue;
    const txt = fs.readFileSync(f, 'utf8');
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) docClaims = { file: f, n: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  }

  // 台账落盘（追加，供 audit）
  fs.mkdirSync('evidence', { recursive: true });
  fs.appendFileSync('evidence/acceptance-ledger.ndjson', JSON.stringify(summary) + '\n');

  const lines = [];
  lines.push(`E2E: ${JSON.stringify(e2eByFile)} = ${e2eTotal}`);
  lines.push(`UNIT: ${unitTotal}`);
  lines.push(`LEDGER: evidence/acceptance-ledger.ndjson`);
  if (docClaims) lines.push(`DOC: ${docClaims.file} 声称 ${docClaims.n}/${docClaims.total}`);
  const total = e2eTotal + unitTotal;
  const pass = e2eTotal >= 29 && unitTotal >= 33;
  lines.push(`TOTAL: ${total} · 门槛(E2E≥29 且 单元≥33) ${pass ? 'PASS' : 'FAIL'}`);
  if (strict && docClaims && (docClaims.n !== total)) {
    lines.push(`STRICT: 文档声称 ${docClaims.n} ≠ 实测 ${total} → FAIL`);
    console.error(lines.join('\n'));
    process.exit(1);
  }
  console.log(lines.join('\n'));
  process.exit(pass ? 0 : 1);
}
main();
