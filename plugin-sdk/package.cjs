#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { zipSync } = require('fflate');
const { readPackage, safePath } = require('./manifest.cjs');

async function packagePlugin(source, output) {
  const root = path.resolve(source);
  const files = Object.create(null);
  async function visit(folder, prefix = '') {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const relative = safePath(prefix + entry.name);
      if (entry.isSymbolicLink()) throw new Error('플러그인 패키지에 심볼릭 링크를 포함할 수 없습니다.');
      if (entry.isDirectory()) await visit(path.join(folder, entry.name), relative + '/');
      else if (entry.isFile()) files[relative] = await fs.readFile(path.join(folder, entry.name));
    }
  }
  await visit(root);
  const bytes = zipSync(files);
  readPackage(bytes);
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, bytes);
  return path.resolve(output);
}

if (require.main === module) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) {
    console.error('Usage: node scripts/package-plugin.cjs <built-plugin-directory> <output.zip>');
    process.exitCode = 1;
  } else
    packagePlugin(source, output)
      .then(file => console.log(file))
      .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
      });
}
module.exports = { packagePlugin };
