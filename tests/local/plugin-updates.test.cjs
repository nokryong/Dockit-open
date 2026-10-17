const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { zipSync, strToU8 } = require('fflate');
const { PluginStore } = require('../../electron/plugin-store.cjs');
const { PluginServices } = require('../../electron/plugin-services.cjs');
const { PluginUpdates, compareVersions, sourceFor } = require('../../electron/plugin-updates.cjs');

const manifest = { manifestVersion: 1, sdkVersion: 2, id: 'test.images', name: 'Images', publisher: 'nokryong', version: '0.1.0', icon: 'react-icons/md/MdImageSearch', permissions: ['storage', 'network', 'credentials'], services: { pixabay: { label: 'Pixabay', url: 'https://pixabay.com/api/', credential: { in: 'query', name: 'key' } } }, widgets: [{ id: 'images', title: 'Images', entry: 'index.html' }] };
const source = { url: 'https://github.com/nokryong/dockit-plugins/tree/main/plugins/images', commit: 'a'.repeat(40) };
const newerSource = { ...source, commit: 'b'.repeat(40) };
const archive = (changes = {}, files = {}) => zipSync({ 'manifest.json': strToU8(JSON.stringify({ ...manifest, ...changes })), 'index.html': strToU8(`<html>${changes.version || manifest.version}</html>`), ...files });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-update-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('dockit-update-test-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const store = new PluginStore({ root, trash: async () => {} });
  await store.init();
  await store.installBytes(archive({}, { 'obsolete.txt': strToU8('old asset') }), source);
  const session = store.open(manifest.id, 'images').sessionId;
  await store.storage(session, 'set', 'count', 7);
  const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('fixture:' + value), decryptString: bytes => bytes.toString().slice(8) };
  const services = new PluginServices({ store, encryption });
  await services.setCredential(session, 'pixabay', 'test-api-key');
  const data = path.join(store.data, manifest.id);
  const saved = await Promise.all(['storage.json', 'credentials.json'].map(file => fs.readFile(path.join(data, file))));
  return { root, store, session, services, saved, assertData: async () => {
    assert.deepEqual(await Promise.all(['storage.json', 'credentials.json'].map(file => fs.readFile(path.join(data, file)))), saved);
  } };
}

test('versions compare numeric segments and prereleases without string ordering errors', () => {
  for (const [newer, older] of [['0.1.10', '0.1.9'], ['1.0.0', '0.99.99'], ['1.0.0', '1.0.0-rc.9'], ['1.0.0-beta.10', '1.0.0-beta.2'], ['1.0.0-beta', '1.0.0-alpha'], ['1.0.0-rc.1', '1.0.0-rc']]) {
    assert.equal(compareVersions(newer, older), 1);
    assert.equal(compareVersions(older, newer), -1);
  }
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.2'), 0);
});

test('update replaces code, preserves data and the usable API key, persists source and revokes old widgets', async t => {
  const { root, store, session, services, assertData } = await fixture(t);
  await store.updateBytes(manifest.id, archive({ version: '0.1.1' }), newerSource);
  assert.equal(store.list().plugins[0].version, '0.1.1');
  await assertData();
  assert.throws(() => store.session(session), /종료/);
  const current = store.open(manifest.id, 'images').sessionId;
  assert.equal(await store.storage(current, 'get', 'count'), 7);
  assert.equal((await services.credentialStatus(current, 'pixabay')).configured, true);
  services.fetcher = async url => {
    assert.equal(url.searchParams.get('key'), 'test-api-key');
    return { status: 200, bytes: Buffer.from('{}') };
  };
  await services.get(current, { service: 'pixabay' });
  assert.equal((await store.asset(current, 'index.html')).bytes.toString(), '<html>0.1.1</html>');
  await assert.rejects(store.asset(current, 'obsolete.txt'), { code: 'ENOENT' });
  await assert.rejects(store.asset(current, '__dockit/source.json'), /예약된/);
  const restarted = new PluginStore({ root, trash: async () => {} });
  await restarted.init();
  assert.equal(restarted.list().plugins[0].version, '0.1.1');
  assert.deepEqual(restarted.source(manifest.id), newerSource);
  assert.deepEqual(await fs.readdir(store.packages), [manifest.id]);
});

test('wrong identities, repositories, same versions and downgrades cannot replace an install', async t => {
  const { store, session, assertData } = await fixture(t);
  for (const change of [{ id: 'test.other', version: '0.1.1' }, { publisher: 'Other', version: '0.1.1' }, { version: '0.1.0' }, { version: '0.0.9' }]) {
    await assert.rejects(store.updateBytes(manifest.id, archive(change), newerSource));
  }
  await assert.rejects(store.updateBytes(manifest.id, archive({ version: '0.1.1' }), { ...newerSource, url: newerSource.url.replace('nokryong/', 'someone/') }), /출처/);
  assert.equal(store.session(session).manifest.version, '0.1.0');
  await assertData();
});

test('a failed staged extraction leaves the original version and data intact', async t => {
  const { store, session, assertData } = await fixture(t);
  await assert.rejects(store.updateBytes(manifest.id, archive({ version: '0.1.1' }, { assets: strToU8('file'), 'assets/code.js': strToU8('code') }), newerSource));
  assert.equal((await store.asset(session, 'index.html')).bytes.toString(), '<html>0.1.0</html>');
  assert.deepEqual(await fs.readdir(store.packages), [manifest.id]);
  await assertData();
});

test('a failed directory swap rolls back without invalidating the running widget', async t => {
  const { store, session, assertData } = await fixture(t);
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', async (from, to) => {
    if (path.basename(from) === 'next') throw new Error('simulated locked destination');
    return rename(from, to);
  });
  await assert.rejects(store.updateBytes(manifest.id, archive({ version: '0.1.1' }), newerSource), /locked/);
  assert.equal((await store.asset(session, 'index.html')).bytes.toString(), '<html>0.1.0</html>');
  assert.deepEqual(store.source(manifest.id), source);
  await assertData();
});

test('startup restores the previous package after interruption during the swap', async t => {
  const { root, store, assertData } = await fixture(t);
  const transaction = path.join(store.packages, `.update-${randomUUID()}`);
  await fs.mkdir(transaction);
  await fs.rename(path.join(store.packages, manifest.id), path.join(transaction, 'previous'));
  const restarted = new PluginStore({ root, trash: async () => {} });
  await restarted.init();
  assert.equal(restarted.list().plugins[0].version, '0.1.0');
  assert.deepEqual(restarted.source(manifest.id), source);
  await assertData();
});

test('update checks share a repository snapshot, only offer newer versions and install the checked commit', async t => {
  const { store, assertData } = await fixture(t);
  const other = { ...manifest, id: 'test.other', version: '0.2.0' };
  await store.installBytes(archive(other), { ...source, url: source.url.replace('/images', '/other') });
  let calls = 0;
  const snapshot = { owner: 'nokryong', repo: 'dockit-plugins', ref: 'main', commit: 'b'.repeat(40), plugins: [{ ...manifest, version: '0.1.1', path: 'plugins/images' }, { ...other, version: '0.1.9', path: 'plugins/other' }] };
  const updates = new PluginUpdates({ store, inspect: async (url, options) => {
    calls++;
    assert.equal(url, 'https://github.com/nokryong/dockit-plugins/tree/main');
    assert.deepEqual(options.folders, ['plugins/images', 'plugins/other']);
    return snapshot;
  }, download: async (checked, folder) => {
    assert.equal(checked, snapshot);
    assert.equal(folder, 'plugins/images');
    return archive({ version: '0.1.1' });
  } });
  const [result] = await Promise.all([updates.check(), updates.check()]);
  assert.equal(calls, 1);
  assert.deepEqual(result, { updates: [{ id: manifest.id, version: '0.1.1' }], errors: [] });
  await updates.update(manifest.id);
  await assertData();
  assert.deepEqual((await updates.check()).updates, []);
  assert.deepEqual(store.source(manifest.id), sourceFor(snapshot, 'plugins/images'));
});

test('existing official installs get an update source without touching data; third-party installs are not guessed', async t => {
  const { store } = await fixture(t);
  await store.installBytes(archive({ id: 'dockit.image-search' }));
  assert.equal(store.source('dockit.image-search').url, 'https://github.com/nokryong/dockit-plugins/tree/main/plugins/image-search');
  await store.installBytes(archive({ id: 'test.local' }));
  assert.equal(store.source('test.local'), null);
});

test('network failures produce no update offer and leave the installed plugin available', async t => {
  const { store, session, assertData } = await fixture(t);
  const updates = new PluginUpdates({ store, inspect: async () => { throw new Error('offline'); } });
  assert.deepEqual(await updates.check(), { updates: [], errors: ['offline'] });
  assert.equal(store.session(session).manifest.version, '0.1.0');
  await assertData();
});
