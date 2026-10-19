const fs = require('node:fs/promises');

// macOS는 이 시스템 폴더를 별칭으로 노출
// (OS 소유 앞부분만 변환하고, 사용자가 정하는 나머지 부분은 호출하는 쪽이 계속 검증)
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
