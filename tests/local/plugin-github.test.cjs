const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseGitHubUrl, inspectGitHubPlugins, downloadGitHubPlugin, blobHash } = require('../../electron/plugin-github.cjs');
const { readPackage, LIMITS } = require('../../plugin-sdk/manifest.cjs');

const commit = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const manifest = name => ({ manifestVersion: 1, sdkVersion: 1, id: `test.${name}`, name, publisher: 'nokryong', version: '0.1.0', icon: 'dice', widgets: [{ id: name, title: name, entry: 'index.html' }] });
function fixture() {
  const files = new Map();
  for (const name of ['dice', 'music']) {
    files.set(`plugins/${name}/manifest.json`, Buffer.from(JSON.stringify(manifest(name))));
    files.set(`plugins/${name}/index.html`, Buffer.from(`<html>${name}</html>`));
  }
  files.set('private.txt', Buffer.from('not part of either plugin'));
  const entries = [...files].map(([path, bytes]) => ({ path, mode: '100644', type: 'blob', sha: blobHash(bytes), size: bytes.length }));
  const requested = [];
  const fetcher = async (url, options) => {
    requested.push(url);
    assert.equal(options.redirect, 'manual');
    if (url.includes('/commits?')) return Response.json([{ sha: commit, commit: { tree: { sha: tree } } }]);
    if (url.includes('/git/trees/')) return Response.json({ tree: entries, truncated: false });
    assert.ok(url.startsWith(`https://raw.githubusercontent.com/nokryong/dockit-plugins/${commit}/`));
    const relative = decodeURIComponent(url.split(`/${commit}/`)[1]);
    return new Response(files.get(relative), { status: files.has(relative) ? 200 : 404 });
  };
  return { files, entries, requested, fetcher };
}
const url = 'https://github.com/nokryong/dockit-plugins';

test('repository inspection lists folders; installation fetches only the selected plugin at one commit', async () => {
  const mock = fixture();
  const snapshot = await inspectGitHubPlugins(url, mock);
  assert.deepEqual(snapshot.plugins.map(plugin => plugin.path), ['plugins/dice', 'plugins/music']);
  mock.requested.length = 0;
  const { manifest: installed, files } = readPackage(await downloadGitHubPlugin(snapshot, 'plugins/dice', mock));
  assert.equal(installed.publisher, 'nokryong');
  assert.equal(installed.id, 'test.dice');
  assert.deepEqual(Object.keys(files).sort(), ['index.html', 'manifest.json']);
  assert.equal(mock.requested.length, 2);
  assert.ok(mock.requested.every(request => request.includes(`/${commit}/plugins/dice/`)));
});

test('a GitHub folder URL resolves only that plugin', async () => {
  const mock = fixture();
  const snapshot = await inspectGitHubPlugins(`${url}/tree/main/plugins/dice`, mock);
  assert.equal(snapshot.plugins.length, 1);
  assert.equal(snapshot.plugins[0].id, 'test.dice');
  assert.ok(mock.requested[0].endsWith('sha=main'));
  assert.equal(mock.requested.filter(request => request.includes('raw.githubusercontent.com')).length, 1);
});

test('reject non-GitHub, credential-bearing, local, release and unsafe folder URLs', () => {
  for (const value of ['http://github.com/nokryong/dockit-plugins', 'https://github.com.evil.test/a/b', 'file:///C:/file', 'https://user:pass@github.com/a/b', 'https://127.0.0.1/a/b', `${url}?token=test`, `${url}/releases/latest`, `${url}/tree/main/plugins/%5Cbad`, `${url}/tree/main/plugins/CON`]) {
    assert.throws(() => parseGitHubUrl(value), /GitHub|경로/i);
  }
  assert.equal(parseGitHubUrl(`${url}.git`).repo, 'dockit-plugins');
  assert.equal(parseGitHubUrl(`${url}/tree/feature%2Fplugin/plugins/dice`).ref, 'feature/plugin');
});

test('reject file changes, symlinks, submodules and duplicate normalized paths before installing', async () => {
  const mock = fixture();
  const snapshot = await inspectGitHubPlugins(url, mock);
  mock.files.set('plugins/dice/index.html', Buffer.from('tampered'));
  await assert.rejects(downloadGitHubPlugin(snapshot, 'plugins/dice', mock), /무결성/);
  for (const entry of [
    { path: 'plugins/dice/link', type: 'blob', mode: '120000', sha: commit, size: 0 },
    { path: 'plugins/dice/submodule', type: 'commit', mode: '160000', sha: commit },
    { ...snapshot.tree[0], path: 'plugins/dice/MANIFEST.json' },
    { ...snapshot.tree[0], path: 'plugins/dice/../escape' },
  ]) await assert.rejects(downloadGitHubPlugin({ ...snapshot, tree: [...snapshot.tree, entry] }, 'plugins/dice', mock), /심볼릭|중복|경로/);
});

test('reject redirects to local services without requesting their content', async () => {
  let requests = 0;
  await assert.rejects(inspectGitHubPlugins(url, { fetcher: async () => { requests++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); } }), /허용되지/);
  assert.equal(requests, 1);
});

test('reject truncated trees, oversized files and unselected folders', async () => {
  const mock = fixture();
  const snapshot = await inspectGitHubPlugins(url, mock);
  await assert.rejects(downloadGitHubPlugin(snapshot, '../private', mock), /다시 선택/);
  snapshot.tree.find(entry => entry.path === 'plugins/dice/index.html').size = LIMITS.file + 1;
  await assert.rejects(downloadGitHubPlugin(snapshot, 'plugins/dice', mock), /크기/);
  await assert.rejects(inspectGitHubPlugins(url, { fetcher: async (target, options) => target.includes('/git/trees/') ? Response.json({ tree: mock.entries, truncated: true }) : mock.fetcher(target, options) }), /모두 읽지/);
});

test('reject downloads that exceed the declared or streamed metadata size limit', async () => {
  for (const headers of [{ 'content-length': String(3 * 1024 * 1024) }, {}]) {
    await assert.rejects(inspectGitHubPlugins(url, { fetcher: async () => new Response(Buffer.alloc(2 * 1024 * 1024 + 1), { headers }) }), /크기/);
  }
});
