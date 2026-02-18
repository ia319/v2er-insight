const fs = require('node:fs');
const path = require('node:path');

// NOTE: 发布包会直接包含 dist 内文件。清理 source map 可减少包体积，
// 并避免把构建时的路径信息暴露到安装产物中。
// NOTE: 保留 .d.ts 文件，继续提供 TypeScript 类型提示能力。
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const DELETE_SUFFIXES = ['.map'];

function shouldDelete(filePath) {
  return DELETE_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

function walkAndPrune(dirPath) {
  if (!fs.existsSync(dirPath)) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkAndPrune(fullPath);
      continue;
    }

    if (entry.isFile() && shouldDelete(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

walkAndPrune(DIST_DIR);
