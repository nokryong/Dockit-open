const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { getDevServerOptions } = require('../../scripts/start-desktop.cjs');

test('desktop dev watches source changes without crawling generated or private files', { timeout: 15000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-dev-watch-'));
  let server;
  try {
    const ignoredDirectories = ['.cache', '.dockit', 'release', '_temp'];
    const files = ['app/main.js', 'public/icon.svg', ...ignoredDirectories.map(dir => `${dir}/nested/artifact.js`)];
    await Promise.all(files.map(async name => {
      const file = path.join(root, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, '');
    }));
    await fs.writeFile(path.join(root, 'vite.config.mjs'), `export default {
      server: { watch: { ignored: ['**/_temp/**'] } },
      optimizeDeps: { noDiscovery: true, include: [] }
    };`);
    const { createServer } = await import('vite');
    server = await createServer(getDevServerOptions(root));
    await once(server.watcher, 'ready');
    const watched = () => Object.keys(server.watcher.getWatched()).map(dir => path.relative(root, dir).replaceAll('\\', '/'));
    for (let attempt = 0; !watched().includes('app') && attempt < 50; attempt++) await delay(20);
    assert.ok(watched().includes('app'), 'app source is watched');
    assert.ok(watched().includes('public'), 'public assets are watched');
    for (const directory of ignoredDirectories) {
      assert.ok(!watched().some(dir => dir === directory || dir.startsWith(`${directory}/`)), `${directory} is not crawled`);
    }
    const changed = once(server.watcher, 'change', { signal: AbortSignal.timeout(5000) });
    const source = path.join(root, 'app/main.js');
    await fs.writeFile(source, 'export const updated = true;');
    assert.equal(path.normalize((await changed)[0]), source, 'source edits still reach Vite');
  } finally {
    await server?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
