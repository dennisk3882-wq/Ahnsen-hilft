'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const toolsModules = path.join(root, 'e2e-tools', 'node_modules');
const cli = path.join(toolsModules, '@playwright', 'test', 'cli.js');
const nodePath = [toolsModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, NODE_PATH: nodePath },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
