const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const dns = require('node:dns');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { zipSync, strToU8 } = require('fflate');
const { PluginStore } = require('../../electron/plugin-store.cjs');
const { PluginServices } = require('../../electron/plugin-services.cjs');
const { isPublicAddress, requestPublic } = require('../../electron/plugin-network.cjs');
const { validateManifest } = require('../../plugin-sdk/manifest.cjs');

const manifest = {
  manifestVersion: 1, sdkVersion: 2, id: 'test.images', name: 'Images', publisher: 'Test', version: '0.1.0',
  icon: 'react-icons/md/MdImageSearch', permissions: ['storage', 'credentials', 'network', 'images', 'external'],
  services: { pixabay: { label: 'Pixabay', url: 'https://pixabay.com/api/', credential: { in: 'query', name: 'key' } } },
  imageOrigins: ['https://cdn.pixabay.com'], externalOrigins: ['https://pixabay.com'],
  widgets: [{ id: 'images', title: 'Images', entry: 'index.html' }],
};
const packageBytes = value => zipSync({ 'manifest.json': strToU8(JSON.stringify(value)), 'index.html': strToU8('<html></html>') });
const response = (data, status = 200) => ({ status, headers: {}, bytes: Buffer.from(JSON.stringify(data)) });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-services-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('dockit-services-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const store = new PluginStore({ root, trash: async file => { assert.ok(file.startsWith(root + path.sep)); await fs.rm(file, { recursive: true }); } });
  await store.init();
  await store.installBytes(packageBytes(manifest));
  const { sessionId } = store.open(manifest.id, 'images');
  const key = randomBytes(32);
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: value => {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decryptString: bytes => {
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString();
    },
  };
  const services = new PluginServices({ store, encryption, fetcher: async () => response({ hits: [] }), downloads: root, getWindow: () => null, dialog: { showSaveDialog: async () => ({ canceled: true }) }, shell: { openExternal: async () => {} } });
  return { root, store, sessionId, services };
}

test('v2 validates declared capabilities while v1 keeps storage-only compatibility', () => {
  assert.equal(validateManifest(manifest).sdkVersion, 2);
  assert.equal(validateManifest({ ...manifest, sdkVersion: 1, permissions: ['storage'] }).sdkVersion, 1);
  assert.throws(() => validateManifest({ ...manifest, sdkVersion: 1 }), /권한/);
  for (const url of ['http://pixabay.com/api/', 'https://127.0.0.1/', 'https://[::1]/', 'https://server.local/', 'https://user:secret@pixabay.com/', 'https://pixabay.com:444/', 'https://pixabay.com/api/?key=secret']) {
    assert.throws(() => validateManifest({ ...manifest, services: { pixabay: { ...manifest.services.pixabay, url } } }));
  }
  assert.throws(() => validateManifest({ ...manifest, imageOrigins: ['https://cdn.pixabay.com/path'] }));
  assert.throws(() => validateManifest({ ...manifest, permissions: ['storage'] }));
});

test('keys stay encrypted and isolated from plugin storage and other plugins', async t => {
  const { root, store, services, sessionId } = await fixture(t);
  assert.equal((await services.credentialStatus(sessionId, 'pixabay')).configured, false);
  const status = await services.setCredential(sessionId, 'pixabay', 'fixture-secret');
  assert.equal(status.configured, true);
  assert.deepEqual(Object.keys(status).sort(), ['configured', 'id', 'label', 'revision', 'url']);
  const disk = await fs.readFile(path.join(root, 'plugin-data', manifest.id, 'credentials.json'), 'utf8');
  assert.equal(disk.includes('fixture-secret'), false);
  assert.equal(await store.storage(sessionId, 'get', 'credentials'), null);
  await store.installBytes(packageBytes({ ...manifest, id: 'test.other' }));
  assert.equal((await services.credentialStatus(store.open('test.other', 'images').sessionId, 'pixabay')).configured, false);
  await services.setCredential(sessionId, 'pixabay', '');
  assert.equal((await services.credentialStatus(sessionId, 'pixabay')).configured, false);
  assert.equal(Object.keys(JSON.parse(await fs.readFile(path.join(root, 'plugin-data', manifest.id, 'credentials.json'), 'utf8')).entries).length, 0);
});

test('main process injects keys only at the registered endpoint and redacts failures', async t => {
  const { services, sessionId } = await fixture(t);
  await services.setCredential(sessionId, 'pixabay', 'fixture-secret');
  const calls = [];
  services.fetcher = async url => { calls.push(new URL(url)); return response({ totalHits: 0, hits: [] }); };
  await services.get(sessionId, { service: 'pixabay', params: { q: 'cat', page: 1 } });
  assert.equal(calls[0].origin + calls[0].pathname, 'https://pixabay.com/api/');
  assert.equal(calls[0].searchParams.get('key'), 'fixture-secret');
  await assert.rejects(services.get(sessionId, { service: 'pixabay', params: { key: 'override' } }));
  await assert.rejects(services.get(sessionId, { service: 'not-registered', params: {} }));
  for (const status of [302, 400, 401, 429]) {
    services.fetcher = async () => response({ error: 'fixture-secret' }, status);
    await assert.rejects(services.get(sessionId, { service: 'pixabay' }), error => !error.message.includes('fixture-secret'));
  }
  services.fetcher = async () => { throw new Error('https://pixabay.com/api/?key=fixture-secret'); };
  await assert.rejects(services.get(sessionId, { service: 'pixabay' }), error => !error.message.includes('fixture-secret'));
});

test('retaining plugin data retains the key only for its original service binding', async t => {
  const { store, services, sessionId } = await fixture(t);
  await services.setCredential(sessionId, 'pixabay', 'fixture-secret');
  await store.uninstall(manifest.id, true);
  await store.installBytes(packageBytes(manifest));
  const restored = store.open(manifest.id, 'images').sessionId;
  assert.equal((await services.credentialStatus(restored, 'pixabay')).configured, true);
  await store.uninstall(manifest.id, true);
  await store.installBytes(packageBytes({ ...manifest, services: { pixabay: { ...manifest.services.pixabay, url: 'https://example.com/api/' } } }));
  const changed = store.open(manifest.id, 'images').sessionId;
  assert.equal((await services.credentialStatus(changed, 'pixabay')).configured, false);
  await assert.rejects(services.get(changed, { service: 'pixabay' }), /먼저 설정/);
  await store.uninstall(manifest.id, false);
  await store.installBytes(packageBytes(manifest));
  assert.equal((await services.credentialStatus(store.open(manifest.id, 'images').sessionId, 'pixabay')).configured, false);
});

test('unavailable OS encryption refuses storage but still allows deleting a key', async t => {
  const { services, sessionId } = await fixture(t);
  await services.setCredential(sessionId, 'pixabay', 'fixture-secret');
  services.encryption.getSelectedStorageBackend = () => 'basic_text';
  await assert.rejects(services.setCredential(sessionId, 'pixabay', 'new-secret'), /안전한/);
  assert.equal((await services.setCredential(sessionId, 'pixabay', '')).configured, false);
});

test('images load and preview through the host, download only after an explicit save target', async t => {
  const { root, services, sessionId } = await fixture(t);
  services.fetcher = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, bytes: Buffer.from('fixture-image') });
  const url = 'https://cdn.pixabay.com/image.png';
  assert.match(await services.loadImage(sessionId, url), /^data:image\/png;base64,/);
  const preview = await services.preview(sessionId, { url, author: 'Test', sourceUrl: 'https://pixabay.com/photo/' });
  assert.match(preview.displaySrc, /^data:image\/png;base64,/);
  assert.equal(preview.url, url);
  assert.equal(await services.download(sessionId, { url }), false);
  const target = path.join(root, 'chosen.png');
  services.dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  assert.equal(await services.download(sessionId, { url, filename: '../../escaped.exe' }), true);
  assert.equal(await fs.readFile(target, 'utf8'), 'fixture-image');
  await assert.rejects(services.preview(sessionId, { url, authorUrl: 'https://evil.example/' }), /허용되지/);
  await assert.rejects(services.loadImage(sessionId, 'https://evil.example/image.png'), /허용되지/);
  services.fetcher = async () => ({ status: 302, headers: { location: 'https://evil.example/image.png' }, bytes: Buffer.alloc(0) });
  await assert.rejects(services.loadImage(sessionId, url), /허용되지/);
  services.fetcher = async () => ({ status: 200, headers: { 'content-type': 'text/html' }, bytes: Buffer.from('<html>') });
  await assert.rejects(services.loadImage(sessionId, url), /형식/);
});

test('host image copy writes decoded image pixels and rejects invalid or revoked requests', async t => {
  const { store, services, sessionId } = await fixture(t);
  const image = { isEmpty: () => false, toPNG: () => Buffer.from('decoded-png') };
  const copied = [];
  const dataUrl = 'data:image/png;base64,aW1hZ2U=';
  services.nativeImage = { createFromDataURL: value => { assert.equal(value, dataUrl); return image; } };
  services.ClipboardItem = class { constructor(data) { this.data = data; } };
  services.clipboard = { write: async items => copied.push(items) };
  assert.equal(await services.request(sessionId, 'images.copy', { dataUrl }), true);
  assert.equal(copied[0].length, 1);
  const png = copied[0][0].data['image/png'];
  assert.equal(png.type, 'image/png');
  assert.equal(await png.text(), 'decoded-png');
  let complete;
  services.clipboard.write = () => new Promise(resolve => { complete = resolve; });
  let finished = false;
  const pending = services.copyImage(sessionId, { dataUrl }).then(() => { finished = true; });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  complete();
  await pending;
  services.clipboard.write = async () => { throw new Error('Clipboard busy'); };
  await assert.rejects(services.copyImage(sessionId, { dataUrl }), /Clipboard busy/);
  for (const invalid of [null, {}, { dataUrl: 'https://cdn.pixabay.com/image.png' }, { dataUrl: 'data:text/html;base64,aW1hZ2U=' }]) {
    await assert.rejects(services.copyImage(sessionId, invalid), /형식/);
  }
  image.isEmpty = () => true;
  await assert.rejects(services.copyImage(sessionId, { dataUrl }), /복사하지/);
  store.close(sessionId);
  await assert.rejects(services.copyImage(sessionId, { dataUrl }), /종료/);
  assert.equal(copied.length, 1);
});

test('closing the session revokes in-flight image and API responses', async t => {
  const { store, services, sessionId } = await fixture(t);
  await services.setCredential(sessionId, 'pixabay', 'fixture-secret');
  services.fetcher = async () => { store.close(sessionId); return response({ hits: [] }); };
  await assert.rejects(services.get(sessionId, { service: 'pixabay' }), /종료/);
  await assert.rejects(services.loadImage(sessionId, 'https://cdn.pixabay.com/image.png'), /종료/);
});

test('private, loopback and mapped addresses are refused, including DNS results', async t => {
  for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  t.mock.method(dns, 'lookup', (_hostname, _options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]));
  await assert.rejects(requestPublic(new URL('https://blocked.example/'), { limit: 100 }), /비공개/);
});
