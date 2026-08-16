import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function patch(file, from, to, label) {
  const p = path.join(ROOT, file);
  let text = fs.readFileSync(p, 'utf8');
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`${label}: anchor missing in ${file}`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`${label}: anchor not unique in ${file}`);
  text = text.slice(0,i) + to + text.slice(i + from.length);
  fs.writeFileSync(p, text);
  console.log(`patched ${file}: ${label}`);
}

patch('tests/planner-search.mjs',
"if(critical) console.error('Planner did not find at least one winning path for every objective.');",
"if(critical) {\n  console.error('Planner did not find at least one winning path for every objective.');\n  process.exitCode = 1;\n} else {\n  console.log('\\nREACHABILITY_OK: every win condition has at least one verified strategy.');\n}",
'planner becomes authoritative reachability gate');

patch('tests/autotest.mjs',
"runTest('All win conditions reachable', reachabilityChecks);",
"pass('Reachability delegated to multi-strategy planner', 'The authoritative planner runs as a separate CI gate before this core suite.');",
'remove obsolete single-policy reachability gate');

patch('tests/autotest.mjs',
"  assert.equal(f.balance, f.total - f.expenses, 'forecast balance decomposition broken');",
"  assert.equal(f.balance, f.total - f.expenses, 'forecast balance decomposition broken');\n  assert.equal(f.sustainableBalance, f.balance - f.foodProvision, 'food-adjusted sustainable balance decomposition broken');\n  assert.ok(f.foodProvision > 0, 'forecast must expose food replenishment cost');",
'verify food-adjusted forecast accounting');

console.log('QA finalization complete.');
