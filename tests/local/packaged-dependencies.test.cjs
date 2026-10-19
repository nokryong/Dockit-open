const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');

// 번들된 화면 코드 밖에서 실행되는 코드가 불러오는 패키지 수집
function runtimePackages() {
  const names = new Set();
  for (const folder of ['electron', 'plugin-sdk']) {
    for (const file of fs.readdirSync(path.join(root, folder))) {
      if (!/\.c?js$/.test(file)) continue;
      const source = fs.readFileSync(path.join(root, folder, file), 'utf8');
      for (const [, request] of source.matchAll(/\b(?:require|import)\(\s*['"`]([^'"`]+)['"`]/g)) {
        if (request.startsWith('.') || request.startsWith('node:')) continue;
        const parts = request.split('/');
        names.add(request.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
      }
    }
  }
  names.delete('electron'); // electron은 실행 환경이 제공
  return names;
}

// 위 패키지들이 필요로 하는 패키지 이름 수집 (npm 중첩 규칙 기준)
// (electron-builder가 electron-updater/node_modules/semver 같은 안쪽 패키지를 최상위로 옮겨 담으므로 이름으로 비교)
function closure(names) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages;
  const resolve = (from, name) => {
    for (let dir = from; ; ) {
      const candidate = `${dir ? dir + '/' : ''}node_modules/${name}`;
      if (lock[candidate]) return candidate;
      if (!dir) return null;
      const index = dir.lastIndexOf('/node_modules/');
      dir = index < 0 ? '' : dir.slice(0, index);
    }
  };
  const seen = new Set();
  const walk = location => {
    if (seen.has(location)) return;
    seen.add(location);
    const entry = lock[location];
    for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
      const found = resolve(location, name);
      if (found) walk(found);
      else assert.ok(entry.optionalDependencies?.[name], `${location} needs ${name}`);
    }
  };
  for (const name of names) {
    assert.ok(lock[`node_modules/${name}`], `${name} is not installed`);
    walk(`node_modules/${name}`);
  }
  return new Set([...seen].map(location => location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length)));
}

test('the installer ships exactly the node_modules the main process loads', () => {
  const config = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.match(config, /- "!node_modules\/\*\*\/\*"/);
  const listed = config.match(/- "node_modules\/\{([^}]+)\}\/\*\*\/\*"/);
  assert.ok(listed, 'electron-builder.yml must list the shipped node_modules');
  const shipped = listed[1].split(',').sort();
  assert.deepEqual(shipped, [...closure(runtimePackages())].sort());
});
