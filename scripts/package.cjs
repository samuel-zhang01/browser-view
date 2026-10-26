const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
fs.mkdirSync('dist', { recursive: true });
execFileSync(process.execPath, [require.resolve('@vscode/vsce/vsce'), 'package', '--out', path.resolve('dist', `browser-view-${version}.vsix`)], { stdio: 'inherit' });
