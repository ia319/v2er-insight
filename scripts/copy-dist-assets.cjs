const fs = require('node:fs');
const path = require('node:path');

// NOTE: `tsc` 仅输出 TypeScript 编译产物。运行时依赖的非代码资源需要显式复制，
// 否则安装后的包在读取资源文件时会报 ENOENT。
// NOTE: 若后续改为构建期内联提示词（生成 TS 常量），可删除此脚本。
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
