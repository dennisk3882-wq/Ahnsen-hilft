'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const app = path.join(root, 'quiz-app');
const patch = path.join(root, 'tools', 'apply-v70.js');
const qrFile = path.join(app, 'public', 'vendor', 'qrcode.min.js');

async function ensureQrLibrary() {
  if (fs.existsSync(qrFile) && fs.statSync(qrFile).size > 1000) return;
  fs.mkdirSync(path.dirname(qrFile), { recursive: true });
  const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js');
  if (!response.ok) throw new Error(`QR-Bibliothek konnte nicht geladen werden: HTTP ${response.status}`);
  const content = await response.text();
  if (content.length < 1000) throw new Error('Die geladene QR-Bibliothek ist unvollständig.');
  fs.writeFileSync(qrFile, content);
}

function repairMigrationSource() {
  let source = fs.readFileSync(patch, 'utf8');
  const start = source.indexOf('replaceOnce(server,\n  "adult: JSON.parse(fs.readFileSync');
  const endMarker = "replaceOnce(server, 'schemaVersion: 6,'";
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start >= 0 && end > start) {
    const fixed = `replaceOnce(server,
  \`adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')),
  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')),
\`,
  \`adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')).map(enrichQuestion),
  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')).map(enrichQuestion),
\`);
`;
    source = `${source.slice(0, start)}${fixed}${source.slice(end)}`;
  }
  source = source.replace(
    "assert(client.includes('result-${type}-'));",
    "assert(client.includes('result-\\${type}-'));",
  );
  fs.writeFileSync(patch, source);
  execFileSync(process.execPath, ['--check', patch], { cwd: root, stdio: 'inherit' });
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  const alreadyApplied = pkg.version === '7.0.0' && fs.existsSync(path.join(app, 'test', 'v70.test.js'));
  if (alreadyApplied) return;
  await ensureQrLibrary();
  if (!fs.existsSync(patch)) throw new Error('Das Version-7-Migrationsskript fehlt.');
  repairMigrationSource();
  execFileSync(process.execPath, [patch], { cwd: root, stdio: 'inherit' });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
