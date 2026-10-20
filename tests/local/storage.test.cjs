const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalStore, atomicJson } = require('../../electron/local-store.cjs');

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-local-test-'));
  const documents = path.join(home, '.dockit', 'Documents');
  const trash = async file => { await fs.mkdir(path.join(home, 'trash'), { recursive: true }); await fs.rename(file, path.join(home, 'trash', path.basename(file))); };
  const store = new LocalStore({ home, trash });
  await store.init();
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(home)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(home).startsWith('dockit-local-test-'));
    await fs.rm(home, { recursive: true, force: true });
  });
  return { home, documents, store, restart: () => new LocalStore({ home, trash }) };
}

test('first launch creates Documents inside .dockit and preserves existing settings', async t => {
  const { home, store, documents, restart } = await fixture(t);
  assert.equal((await store.config()).documentsPath, documents);
  assert.ok((await fs.stat(documents)).isDirectory());
  await assert.rejects(fs.stat(path.join(home, 'Documents')), { code: 'ENOENT' });
  await store.request('update', { type: 'setting', data: { theme: 'blue', autoSave: false } });
  await store.request('update', { type: 'panels', data: { panels: { left: ['memo'], right: ['calendar'] } } });
  const second = restart();
  await second.init();
  assert.equal((await second.config()).setting.theme, 'blue');
  assert.deepEqual((await second.config()).panels.panels.right, ['calendar']);
  assert.ok((await fs.readdir(store.root)).includes('memos'));
});

test('memo, empty character favorites and calendar items survive restart and delete is recoverable', async t => {
  const { store, restart, home } = await fixture(t);
  await store.request('create', { type: 'memo', data: { memo: '<p>로컬 메모</p>' } });
  await store.request('create', { type: 'char', data: { char: [{ key: '★', char: '★' }] } });
  await store.request('update', { type: 'char', id: 'default', data: { char: [] } });
  const event = (await store.request('create', { type: 'calendar', data: { date: '2026-10-15', content: '일정' } })).content;
  const second = restart(); await second.init();
  assert.equal((await second.request('list', { type: 'memo' })).content[0].memo, '<p>로컬 메모</p>');
  assert.deepEqual((await second.request('list', { type: 'char' })).content[0].char, []);
  assert.equal((await second.request('list', { type: 'calendar' })).content[0].date, '2026-10-15');
  await second.request('delete', { type: 'calendar', id: event._id });
  assert.equal((await second.request('list', { type: 'calendar' })).content.length, 0);
  assert.ok(await fs.stat(path.join(home, 'trash', event._id + '.json')));
});

test('documents create, save, rename, move and reopen without changing unrelated files', async t => {
  const { store, documents, restart } = await fixture(t);
  await fs.writeFile(path.join(documents, 'unrelated.txt'), 'keep');
  const doc = (await store.request('create', { type: 'documents', data: { title: '보고서', content: '<p>첫 내용</p>' } })).content;
  const saved = (await store.request('update', { type: 'documents', id: doc._id, data: { title: '이름 변경', content: '<p>다음 내용</p>', expectedRevision: doc.revision } })).content;
  assert.notEqual(doc.revision, saved.revision);
  const folder = (await store.request('create', { type: 'folders', data: { title: '업무' } })).content;
  await store.request('move', { type: 'documents', id: doc._id, parentId: folder._id });
  const second = restart(); await second.init();
  const reopened = (await second.request('get', { type: 'documents', id: doc._id })).content;
  assert.equal(reopened.content, '<p>다음 내용</p>');
  assert.equal(reopened.parent_id, folder._id);
  assert.equal(await fs.readFile(path.join(documents, 'unrelated.txt'), 'utf8'), 'keep');
  assert.equal((await second.request('list', { type: 'documents', parentId: folder._id })).content.length, 1);
});

test('external changes reject stale saves and keep the newer disk file', async t => {
  const { store, documents } = await fixture(t);
  const doc = (await store.request('create', { type: 'documents', data: { title: '충돌' } })).content;
  const file = path.join(documents, '충돌.dkt');
  const external = JSON.parse(await fs.readFile(file, 'utf8'));
  external.content = '<p>외부 수정</p>';
  await fs.writeFile(file, JSON.stringify(external));
  await assert.rejects(store.request('update', { type: 'documents', id: doc._id, data: { content: '<p>오래된 수정</p>', expectedRevision: doc.revision } }), { code: 'RevisionConflict' });
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).content, '<p>외부 수정</p>');
});

test('malformed configuration and feature files are not replaced by defaults', async t => {
  const { store, restart } = await fixture(t);
  await fs.writeFile(path.join(store.root, 'memos', 'default.json'), '{broken');
  await assert.rejects(store.request('list', { type: 'memo' }), /손상된 JSON/);
  assert.equal(await fs.readFile(path.join(store.root, 'memos', 'default.json'), 'utf8'), '{broken');
  await fs.writeFile(path.join(store.root, 'config.json'), '{broken');
  await assert.rejects(restart().init(), /손상된 JSON/);
  assert.equal(await fs.readFile(path.join(store.root, 'config.json'), 'utf8'), '{broken');
});

test('path traversal, reserved names and overwriting an existing document are rejected', async t => {
  const { store } = await fixture(t);
  for (const title of ['../escape', 'a/b', 'CON', '..', 'name.']) await assert.rejects(store.request('create', { type: 'documents', data: { title } }));
  await assert.rejects(store.request('create', { type: 'calendar', id: '../escape' }));
  const doc = (await store.request('create', { type: 'documents', data: { title: 'one' } })).content;
  await store.request('create', { type: 'documents', data: { title: 'two' } });
  await assert.rejects(store.request('update', { type: 'documents', id: doc._id, data: { title: 'two', expectedRevision: doc.revision } }), /같은 이름/);
});

test('a linked folder cannot escape the document root', async t => {
  const { store, documents, home } = await fixture(t);
  const outside = path.join(home, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(documents, 'linked'), 'junction');
  await assert.rejects(store.request('create', { type: 'documents', parentId: store.folderId('linked') }), /연결된 폴더/);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('switching document folders preserves old documents and settings', async t => {
  const { store, documents, home } = await fixture(t);
  await store.request('create', { type: 'documents', data: { title: 'old' } });
  const next = path.join(home, 'new-documents'); await fs.mkdir(next);
  await store.changeDocuments(next);
  assert.equal((await store.request('list', { type: 'documents' })).content.length, 0);
  assert.ok(await fs.stat(path.join(documents, 'old.dkt')));
});

test('an atomic replacement failure preserves the existing file and removes its temporary file', async t => {
  const { home } = await fixture(t);
  const target = path.join(home, 'atomic.json'); await atomicJson(target, { value: 'old' });
  const rename = fs.rename;
  fs.rename = async () => { throw Object.assign(new Error('disk unavailable'), { code: 'EIO' }); };
  try { await assert.rejects(atomicJson(target, { value: 'new' }), /disk unavailable/); }
  finally { fs.rename = rename; }
  assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { value: 'old' });
  assert.equal((await fs.readdir(home)).filter(file => file.endsWith('.tmp')).length, 0);
});

test('an atomic replacement retries while Windows briefly holds the target', { skip: process.platform !== 'win32' }, async t => {
  const { home } = await fixture(t);
  const target = path.join(home, 'atomic.json'); await atomicJson(target, { value: 'old' });
  const rename = fs.rename;
  let failures = 2;
  fs.rename = async (...args) => {
    if (failures-- > 0) throw Object.assign(new Error('busy'), { code: 'EPERM' });
    return rename(...args);
  };
  try { await atomicJson(target, { value: 'new' }); }
  finally { fs.rename = rename; }
  assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { value: 'new' });
  assert.equal((await fs.readdir(home)).filter(file => file.endsWith('.tmp')).length, 0);
});

test('startup lists only the current folder and leaves unrelated descendants unread', async t => {
  const { store, documents } = await fixture(t);
  const nested = path.join(documents, 'projects', 'node_modules', 'package');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(nested, 'unrelated.dkt'), '{invalid');
  const readdir = fs.readdir;
  const visited = [];
  fs.readdir = async (folder, ...args) => { visited.push(String(folder)); return readdir(folder, ...args); };
  try {
    const tree = await store.request('tree');
    assert.equal(tree.tree[0].childrenLoaded, false);
    assert.deepEqual(tree.tree[0].children, []);
    assert.equal((await store.request('list', { type: 'documents' })).content.length, 0);
    assert.equal((await store.request('list', { type: 'folders' })).content.length, 1);
    assert.ok(visited.every(folder => folder === documents));
    assert.equal((await store.request('list', { type: 'setting' })).content.length, 1);
  } finally { fs.readdir = readdir; }
});

test('opening a nested folder loads its ancestors and children without scanning siblings', async t => {
  const { store, documents } = await fixture(t);
  await fs.mkdir(path.join(documents, 'work', 'reports', 'later'), { recursive: true });
  await fs.mkdir(path.join(documents, 'unrelated', 'deep'), { recursive: true });
  const parentId = store.folderId(path.join('work', 'reports'));
  const doc = (await store.request('create', { type: 'documents', parentId, data: { title: 'report' } })).content;
  const readdir = fs.readdir;
  const visited = [];
  fs.readdir = async (folder, ...args) => { visited.push(String(folder)); return readdir(folder, ...args); };
  try {
    const { tree } = await store.request('tree', { parentId });
    const work = tree.find(item => item.title === 'work');
    assert.equal(work.childrenLoaded, true);
    const reports = work.children.find(item => item.title === 'reports');
    assert.equal(reports.childrenLoaded, true);
    assert.ok(reports.children.some(item => item._id === doc._id));
    assert.deepEqual(visited, [documents, path.join(documents, 'work'), path.join(documents, 'work', 'reports')]);
  } finally { fs.readdir = readdir; }
});

test('nested document paths survive folder moves and restart without a whole-directory scan', async t => {
  const { store, restart } = await fixture(t);
  const folder = (await store.request('create', { type: 'folders', data: { title: 'old' } })).content;
  const doc = (await store.request('create', { type: 'documents', parentId: folder._id, data: { title: 'nested' } })).content;
  await store.request('update', { type: 'folders', id: folder._id, data: { title: 'renamed' } });
  const second = restart(); await second.init();
  const readdir = fs.readdir;
  fs.readdir = async () => { throw new Error('unexpected directory scan'); };
  try {
    const reopened = (await second.request('get', { type: 'documents', id: doc._id })).content;
    assert.equal(reopened.parent_id, second.folderId('renamed'));
  } finally { fs.readdir = readdir; }
});
