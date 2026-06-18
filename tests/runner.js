/**
 * UltraORM v2.1.0 - Test Runner
 * ------------------------------
 * Runs all three test suites in sequence and reports an overall result.
 *
 * Run: node tests/runner.js
 */
const { execSync } = require('child_process');
const path = require('path');

const suites = [
  { name: 'Unit Tests', file: 'unit.test.js' },
  { name: 'Integration Tests', file: 'integration.test.js' },
  { name: 'Performance Tests', file: 'performance.test.js' },
];

const results = [];

for (const suite of suites) {
  console.log('');
  console.log('='.repeat(70));
  console.log(`Running ${suite.name}:`);
  console.log('='.repeat(70));
  try {
    execSync(`node ${path.join(__dirname, suite.file)}`, {
      stdio: 'inherit',
      env: { ...process.env },
    });
    results.push({ name: suite.name, status: 'pass' });
  } catch (e) {
    results.push({ name: suite.name, status: 'fail', code: e.status });
  }
}

console.log('');
console.log('='.repeat(70));
console.log('Overall Results:');
console.log('='.repeat(70));
let totalPass = 0;
let totalFail = 0;
for (const r of results) {
  const icon = r.status === 'pass' ? '[OK]' : '[FAIL]';
  console.log(`  ${icon} ${r.name}`);
  if (r.status === 'pass') totalPass++;
  else totalFail++;
}
console.log('');
console.log(`  Suites passed: ${totalPass} / ${results.length}`);
console.log(`  See per-suite output above for individual test results.`);

process.exit(totalFail > 0 ? 1 : 0);
