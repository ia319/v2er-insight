const fs = require('node:fs');
const path = require('node:path');

// NOTE: `tsc` only emits compiled TS output.
// Runtime non-code assets must be copied into dist to avoid ENOENT after pack/install.
const projectRoot = process.cwd();

const assets = [
  {
    from: path.join(projectRoot, 'src', 'core', 'ai', 'prompt', 'system-prompt.md'),
    to: path.join(projectRoot, 'dist', 'core', 'ai', 'prompt', 'system-prompt.md'),
  },
];

for (const asset of assets) {
  const targetDir = path.dirname(asset.to);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(asset.from, asset.to);
}
