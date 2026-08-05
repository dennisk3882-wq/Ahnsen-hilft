'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const ignoredDirectories = new Set(['node_modules', '.git', 'playwright-report', 'test-results', 'backups', 'coverage']);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!ignoredDirectories.has(entry.name)) walk(path.join(directory, entry.name)); continue; }
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(path.join(directory, entry.name));
  }
}
walk(root); files.sort((a, b) => a.localeCompare(b));
if (!files.length) throw new Error('Keine JavaScript-Dateien für die Syntaxprüfung gefunden.');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(`Syntaxfehler in ${path.relative(root, file)}\n${result.stderr || result.stdout}`); process.exit(result.status || 1); }
}
console.log(`JavaScript-Syntaxprüfung erfolgreich: ${files.length} Dateien.`);
