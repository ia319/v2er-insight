const fs = require('node:fs');
const path = require('node:path');

// NOTE: Published tarballs include files from dist directly.
// Removing source maps reduces package size and avoids leaking local build paths.
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
