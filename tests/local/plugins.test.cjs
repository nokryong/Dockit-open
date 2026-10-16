const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { PluginStore, readPackage, LIMITS } = require('../../electron/plugin-store.cjs');
const { pluginProtocol } = require('../../electron/plugin-protocol.cjs');
const { ICON_LIMIT } = require('../../plugin-sdk/icons.cjs');

const manifest = { manifestVersion: 1, sdkVersion: 1, id: 'test.dice', name: '주사위', publisher: 'Test', version: '0.1.0', icon: 'react-icons/tb/TbDice', permissions: ['storage'], widgets: [{ id: 'dice', title: '주사위', entry: 'index.html' }] };
function archive(overrides = {}, extra = {}) {
  return zipSync({ 'manifest.json': strToU8(JSON.stringify({ ...manifest, ...overrides })), 'index.html': strToU8('<!doctype html><html><head></head><body>Dice</body></html>'), ...extra });
}
async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-plugin-test-'));
  const root = path.join(home, '.dockit');
  await fs.mkdir(root);
  const trash = async file => {
    await fs.mkdir(path.join(home, 'trash'), { recursive: true });
    await fs.rename(file, path.join(home, 'trash', path.basename(file)));
  };
  const store = new PluginStore({ root, trash });
  await store.init();
  const zip = path.join(home, 'plugin.zip');
  await fs.writeFile(zip, archive());
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(home)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(home).startsWith('dockit-plugin-test-'));
    await fs.rm(home, { recursive: true, force: true });
  });
  return { home, root, zip, store, restart: async () => { const next = new PluginStore({ root, trash }); await next.init(); return next; } };
}

test('install and restart discover a toolkit without rebuilding the application', async t => {
  const { store, zip, restart } = await fixture(t);
  await store.installFile(zip);
  assert.equal(store.list().plugins[0].id, 'test.dice');
  assert.equal((await restart()).list().plugins[0].widgets[0].entry, 'index.html');
  await assert.rejects(store.installFile(zip), /이미 설치/);
});

test('registered React Icons are available before opening a toolkit and survive restart', async t => {
  const { store, zip, restart } = await fixture(t);
  const plugin = await store.installFile(zip);
  assert.equal(store.sessions.size, 0);
  assert.equal(plugin.iconAsset.monochrome, true);
  assert.match(Buffer.from(plugin.iconAsset.src.split(',')[1], 'base64').toString(), /<svg[^>]+height="40"/);
  assert.deepEqual(plugin.widgets[0].iconAsset, plugin.iconAsset);
  assert.deepEqual((await restart()).list().plugins[0].iconAsset, plugin.iconAsset);
});

test('SVG icons are packaged images, inherited by toolkits or overridden per toolkit', async t => {
  const { store, zip, restart } = await fixture(t);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="red"/></svg>';
  await fs.writeFile(zip, archive({ icon: 'assets/icon.svg', widgets: [
    ...manifest.widgets,
    { id: 'other', title: 'Other', entry: 'index.html', icon: 'react-icons/lu/LuMusic' },
  ] }, { 'assets/icon.svg': strToU8(svg) }));
  const plugin = await store.installFile(zip);
  assert.equal(plugin.iconAsset.monochrome, false);
  assert.equal(Buffer.from(plugin.iconAsset.src.split(',')[1], 'base64').toString(), svg);
  assert.deepEqual(plugin.widgets[0].iconAsset, plugin.iconAsset);
  assert.equal(plugin.widgets[1].iconAsset.monochrome, true);
  assert.notDeepEqual(plugin.widgets[1].iconAsset, plugin.iconAsset);
  assert.deepEqual((await restart()).list().plugins[0].iconAsset, plugin.iconAsset);
});

test('legacy toolkit icon registrations also identify the plugin', () => {
  const plugin = readPackage(archive({ icon: undefined, widgets: [{ ...manifest.widgets[0], icon: 'dice' }] })).manifest;
  assert.equal(plugin.icon, 'dice');
  assert.equal(plugin.widgets[0].icon, 'dice');
});

test('reject missing icons, unknown library exports and unsafe or invalid SVG assets', () => {
  for (const icon of [undefined, '', 'react-icons/unknown/Bad', 'react-icons/tb/NotAnIcon', 'react-icons/tb/constructor', 'icon.js']) {
    assert.throws(() => readPackage(archive({ icon })), /아이콘|Icons/);
  }
  assert.throws(() => readPackage(archive({ icon: '../outside.svg' })), /경로/);
  assert.throws(() => readPackage(archive({ icon: 'https://example.com/icon.svg' })), /경로/);
  assert.throws(() => readPackage(archive({ icon: 'missing.svg' })), /아이콘 파일/);
  assert.throws(() => readPackage(archive({ icon: 'icon.svg' }, { 'icon.svg': strToU8('<html>not an SVG</html>') })), /SVG/);
  assert.throws(() => readPackage(archive({ icon: 'icon.svg' }, { 'icon.svg': new Uint8Array(ICON_LIMIT + 1) })), /64 KiB/);
});

test('installed SVG icons cannot read through a directory link outside the plugin', async t => {
  const { store, root, home, zip, restart } = await fixture(t);
  await store.installFile(zip);
  const outside = path.join(home, 'outside-icons');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const folder = path.join(root, 'plugins', manifest.id);
  await fs.symlink(outside, path.join(folder, 'icons'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ ...manifest, icon: 'icons/icon.svg' }));
  const restarted = await restart();
  assert.equal(restarted.list().plugins.length, 0);
  assert.equal(restarted.list().warnings.length, 1);
});

test('keep data on uninstall, restore on reinstall, then delete only this plugin data', async t => {
  const { store, root, zip, restart } = await fixture(t);
  await store.installFile(zip);
  const first = store.open('test.dice', 'dice');
  await store.storage(first.sessionId, 'set', 'count', 3);
  await fs.mkdir(path.join(root, 'plugin-data', 'other.plugin'));
  await fs.writeFile(path.join(root, 'plugin-data', 'other.plugin', 'kept.json'), '{}');
  await store.uninstall('test.dice', true);
  assert.equal(store.list().plugins.length, 0);
  await assert.rejects(store.storage(first.sessionId, 'get', 'count'), /종료/);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'plugin-data', 'test.dice', 'storage.json'))).count, 3);
  const second = await restart();
  await second.installFile(zip);
  const reopened = second.open('test.dice', 'dice');
  assert.equal(await second.storage(reopened.sessionId, 'get', 'count'), 3);
  await second.uninstall('test.dice', false);
  await assert.rejects(fs.stat(path.join(root, 'plugin-data', 'test.dice')), { code: 'ENOENT' });
  assert.ok(await fs.stat(path.join(root, 'plugin-data', 'other.plugin', 'kept.json')));
});

test('closing a toolkit revokes its session without uninstalling it', async t => {
  const { store, zip } = await fixture(t);
  await store.installFile(zip);
  const session = store.open('test.dice', 'dice');
  store.close(session.sessionId);
  await assert.rejects(store.storage(session.sessionId, 'get', 'count'), /종료/);
  assert.equal(store.list().plugins.length, 1);
});

test('a plugin cannot read another plugin data or request storage without permission', async t => {
  const { store, home, zip } = await fixture(t);
  await store.installFile(zip);
  const first = store.open('test.dice', 'dice');
  await store.storage(first.sessionId, 'set', 'private', 'first');
  const other = path.join(home, 'other.zip');
  await fs.writeFile(other, archive({ id: 'test.other' }));
  await store.installFile(other);
  const second = store.open('test.other', 'dice');
  assert.equal(await store.storage(second.sessionId, 'get', 'private'), null);
  await assert.rejects(store.storage(second.sessionId, 'get', '../test.dice'), /잘못된/);
  await fs.writeFile(other, archive({ id: 'test.no-storage', permissions: [] }));
  await store.installFile(other);
  await assert.rejects(store.storage(store.open('test.no-storage', 'dice').sessionId, 'set', 'count', 2), /권한/);
});

for (const name of ['../escape.txt', '/absolute.txt', 'C:/escape.txt', 'assets\\escape.txt', 'CON.txt', 'assets/file. ', 'index.html:secret', '__dockit/sdk.js']) {
  test(`reject unsafe ZIP path: ${name}`, () => assert.throws(() => readPackage(archive({}, { [name]: strToU8('bad') })), /경로/));
}

test('reject case collisions, missing entrypoints, unsupported SDK and privileges', () => {
  assert.throws(() => readPackage(archive({}, { 'INDEX.html': strToU8('duplicate') })), /중복/);
  assert.throws(() => readPackage(archive({ widgets: [{ id: 'dice', title: 'Dice', entry: 'missing.html' }] })), /시작 파일/);
  assert.throws(() => readPackage(archive({ sdkVersion: 99 })), /규격/);
  assert.throws(() => readPackage(archive({ permissions: ['filesystem'] })), /권한/);
  assert.throws(() => readPackage(archive({ widgets: [{ title: 'Missing ID', entry: 'index.html' }] })), /툴킷 정보/);
  assert.throws(() => readPackage(strToU8('not a zip')), /ZIP/);
});

test('reject oversized inflated files before extraction', () => {
  assert.throws(() => readPackage(archive({}, { 'bomb.txt': new Uint8Array(LIMITS.file + 1) })), /크기/);
});

test('failed install leaves no installed or staging directory', async t => {
  const { store, root, zip } = await fixture(t);
  await fs.writeFile(zip, archive({}, { 'assets': strToU8('not a directory'), 'assets/file.js': strToU8('code') }));
  await assert.rejects(store.installFile(zip));
  assert.deepEqual(await fs.readdir(path.join(root, 'plugins')), []);
  assert.equal(store.list().plugins.length, 0);
});

test('failed trash restores package and data', async t => {
  const { store, root, zip } = await fixture(t);
  await store.installFile(zip);
  const session = store.open('test.dice', 'dice');
  await store.storage(session.sessionId, 'set', 'count', 4);
  store.trash = async () => { throw new Error('trash failed'); };
  await assert.rejects(store.uninstall('test.dice', false), /trash failed/);
  assert.equal(store.list().plugins.length, 1);
  assert.ok(await fs.stat(path.join(root, 'plugins', 'test.dice', 'manifest.json')));
  assert.equal(await store.storage(store.open('test.dice', 'dice').sessionId, 'get', 'count'), 4);
  assert.equal(await store.storage(session.sessionId, 'get', 'count'), 4);
});

test('symlink data directory cannot write outside .dockit', async t => {
  const { store, root, home, zip } = await fixture(t);
  await store.installFile(zip);
  const outside = path.join(home, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(root, 'plugin-data', 'test.dice'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(store.storage(store.open('test.dice', 'dice').sessionId, 'set', 'count', 1), /연결된/);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('assets are capability scoped, CSP restricted and unavailable after close', async t => {
  const { store, zip } = await fixture(t);
  await store.installFile(zip);
  const session = store.open('test.dice', 'dice');
  const serve = pluginProtocol(store);
  const result = await serve(new Request(session.url));
  assert.equal(result.status, 200);
  assert.match(await result.text(), /__dockit\/sdk.js/);
  assert.match(result.headers.get('Content-Security-Policy'), /connect-src 'none'/);
  assert.match(result.headers.get('Content-Security-Policy'), /sandbox allow-scripts/);
  assert.equal((await serve(new Request(session.url.replace('index.html', '%2e%2e%2fconfig.json')))).status, 404);
  store.close(session.sessionId);
  assert.equal((await serve(new Request(session.url))).status, 404);
});
