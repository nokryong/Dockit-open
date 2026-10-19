const fs = require('node:fs/promises');

// macOS exposes these system directories through aliases. Resolve only the
// OS-owned prefix; callers must still validate every user-controlled component.
async function resolveSystemPath(file, { platform = process.platform, realpath = fs.realpath } = {}) {
  if (platform !== 'darwin') return file;
  for (const alias of ['/var', '/tmp']) {
    if (file !== alias && !file.startsWith(`${alias}/`)) continue;
    const expected = `/private${alias}`;
    if ((await realpath(alias)) === expected) return expected + file.slice(alias.length);
  }
  return file;
}

module.exports = { resolveSystemPath };
