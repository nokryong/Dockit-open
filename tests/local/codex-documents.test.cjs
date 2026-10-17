const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalStore, atomicJson } = require('../../electron/local-store.cjs');
const { CodexDocuments, DOCUMENT_TOOLS } = require('../../electron/codex-documents.cjs');
const { CodexClient, CodexTransport, findCodex } = require('../../electron/codex-client.cjs');
const { createFixture } = require('../helpers/codex-fixture.cjs');

async function setup(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-document-turn-'));
  const store = new LocalStore({ home, trash: async () => { throw new Error('Unexpected trash'); } });
  await store.init();
  const { content: doc } = await store.request('create', { type: 'documents', data: { title: '문서 A', content: '<p>처음</p>' } });
  const { content: other } = await store.request('create', { type: 'documents', data: { title: '문서 B', content: '<p>다른 문서</p>' } });
  const events = [];
  const documents = new CodexDocuments({ store, emit: event => events.push(event), validate: async record => ({ ok: !record.content.includes('INVALID') }) });
  t.after(async () => {
    if (documents.active) await documents.end(documents.active).catch(() => {});
    assert.equal(path.dirname(home), os.tmpdir()); assert.ok(path.basename(home).startsWith('dockit-document-turn-'));
    await fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { store, documents, events, doc, other, home };
}

test('explicit original-file grant edits that file without importing or granting its siblings', async t => {
  const { store, documents, home, doc } = await setup(t);
  const external = path.join(home, 'external'); await fs.mkdir(external);
  const file = path.join(external, 'original.dkt');
  const source = JSON.parse(await fs.readFile(await store.documentPath(doc._id), 'utf8'));
  await atomicJson(file, source);
  await atomicJson(path.join(external, 'sibling.dkt'), source);
  const record = await store.run(() => store.openOriginal(file));
  assert.notEqual(record._id, doc._id); // copied embedded IDs cannot alias another window
  const session = await documents.begin({ id: record._id, revision: record.revision });
  await documents.edit(session, { expectedRevision: record.revision, updates: { title: 'Changed', content: '<p>Original edited</p>' } });
  await documents.end(session);
  const changed = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(changed.content, '<p>Original edited</p>');
  assert.deepEqual(changed._local, source._local);
  assert.equal((await fs.readdir(external)).length, 2);
  assert.equal(JSON.parse(await fs.readFile(path.join(external, 'sibling.dkt'), 'utf8')).content, source.content);
  await assert.rejects(store.documentPath(path.join(external, 'sibling.dkt')));
  await store.request('update', { type: 'documents', id: record._id, data: { title: 'User title', content: '<p>User edited</p>' } });
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).title, 'User title');
  const index = JSON.parse(await fs.readFile(path.join(store.root, 'document-index.json'), 'utf8'));
  assert.equal(index.paths[record._id], undefined);
});

test('native opening reuses an internal document and rejects user-created links', async t => {
  const { store, home, doc } = await setup(t);
  const file = await store.documentPath(doc._id);
  assert.equal((await store.openOriginal(file))._id, doc._id);
  assert.equal(store.externalDocuments.size, 0);
  const linked = path.join(home, 'linked');
  await fs.symlink(path.dirname(file), linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(store.openOriginal(path.join(linked, path.basename(file))), /연결된/);
});

test('Korean guidance is installed once and preserves user edits', async t => {
  const { store } = await setup(t);
  const file = path.join(store.root, 'AGENTS.md');
  assert.match(await fs.readFile(file, 'utf8'), /PretendardMedium/);
  await fs.appendFile(file, '\n사용자 추가 지침');
  await store.init();
  assert.match(await fs.readFile(file, 'utf8'), /사용자 추가 지침$/);
});

test('turn pins one actual file, saves atomically, preserves metadata and blocks UI writes', async t => {
  const { store, documents, doc, other, events } = await setup(t);
  const file = await store.documentPath(doc._id);
  const original = JSON.parse(await fs.readFile(file, 'utf8'));
  const session = await documents.begin({ id: doc._id, revision: doc.revision });
  await assert.rejects(store.request('update', { type: 'documents', id: doc._id, data: { content: '<p>UI conflict</p>' } }), { code: 'DocumentLocked' });
  await assert.rejects(store.request('delete', { type: 'documents', id: doc._id }), { code: 'DocumentLocked' });
  await assert.rejects(store.changeDocuments(store.defaultDocuments), { code: 'DocumentLocked' });
  await assert.rejects(documents.edit(session, { expectedRevision: doc.revision, updates: { _local: { id: other._id } } }));
  await assert.rejects(documents.edit(session, { expectedRevision: 'stale', updates: { content: '<p>bad</p>' } }), { code: 'RevisionConflict' });
  const result = await documents.edit(session, { expectedRevision: doc.revision, updates: { title: '새 제목' }, replacements: [{ find: '처음', replace: '<strong>강조</strong>' }] });
  assert.equal(result.path, file);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.content, '<p><strong>강조</strong></p>');
  assert.deepEqual(saved._local, original._local);
  assert.equal((await store.request('get', { type: 'documents', id: other._id })).content.content, '<p>다른 문서</p>');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(store.root, 'backups', `${doc._id}.codex.json`), 'utf8')), original);
  assert.ok(events.some(event => event.type === 'document-update' && event.document.revision === result.revision));
  await documents.end(session);
  assert.equal(store.documentLocks.size, 0);
  const after = await store.request('update', { type: 'documents', id: doc._id, data: { expectedRevision: result.revision, content: '<p>사용자 편집</p>' } });
  assert.equal(after.content.content, '<p>사용자 편집</p>');
});

test('invalid edits never reach disk; directory watcher follows atomic replacement', async t => {
  const { store, documents, doc, events } = await setup(t);
  const session = await documents.begin({ id: doc._id, revision: doc.revision });
  await assert.rejects(documents.edit(session, { expectedRevision: doc.revision, updates: { content: '<p>INVALID</p>' } }), { code: 'document_validation' });
  assert.equal((await documents.read(session)).document.content, doc.content);
  const raw = JSON.parse(await fs.readFile(session.file, 'utf8'));
  await fs.writeFile(session.file, '{');
  await documents.refresh(session).catch(() => {});
  assert.equal(events.filter(event => event.type === 'document-update').length, 0);
  await atomicJson(session.file, raw);
  await documents.refresh(session);
  assert.equal(session.error, null);
  await atomicJson(session.file, { ...raw, content: '<p>외부 수정</p>' });
  for (let n = 0; n < 40 && session.record.content !== '<p>외부 수정</p>'; n++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(session.record.content, '<p>외부 수정</p>');
  await documents.end(session);
  assert.equal(store.documentLocks.size, 0);
});

test('document reads never pair changed content with an older revision', async t => {
  const { documents, doc } = await setup(t);
  const session = await documents.begin({ id: doc._id, revision: doc.revision });
  const original = JSON.parse(await fs.readFile(session.file, 'utf8'));
  documents.validate = async () => {
    await atomicJson(session.file, { ...original, content: '<p>읽는 동안 외부 수정</p>' });
    return { ok: true };
  };
  await assert.rejects(documents.read(session), { code: 'RevisionConflict' });
  documents.validate = async () => ({ ok: true });
  assert.equal((await documents.read(session)).document.content, '<p>읽는 동안 외부 수정</p>');
});

test('history access denies traversal, auth, settings, links and out-of-range reads', async t => {
  const { documents, store } = await setup(t);
  const directory = path.join(store.root, 'codex', 'sessions', '2026');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'turn.jsonl'), 'previous chat');
  await fs.writeFile(path.join(store.root, 'codex', 'auth.json'), 'private');
  assert.equal((await documents.history()).files.length, 1);
  assert.equal((await documents.history({ path: 'sessions/2026/turn.jsonl', limit: 8 })).text, 'previous');
  for (const file of ['auth.json', '../config.json', 'sessions/../../config.jsonl', 'C:\\outside.jsonl']) await assert.rejects(documents.history({ path: file }));
  await assert.rejects(documents.history({ path: 'sessions/2026/turn.jsonl', offset: -1 }));
  await fs.link(path.join(store.root, 'codex', 'auth.json'), path.join(directory, 'linked.jsonl'));
  await assert.rejects(documents.history({ path: 'sessions/2026/linked.jsonl' }));
});

test('Codex tool calls edit the pinned document and release it on cancel/failure/disconnect', async t => {
  const { store, documents, doc, home } = await setup(t);
  const fixture = createFixture();
  const client = new CodexClient({ root: store.root, documents, globalHome: path.join(home, '.codex'), ...fixture });
  t.after(() => client.dispose());
  await client.signIn(); fixture.state.mode = 'hold-turn';
  const sent = client.send('글을 수정해줘', 'chat', undefined, [], { id: doc._id, revision: doc.revision });
  while (!client.runs.get('chat')?.turnId) await new Promise(resolve => setTimeout(resolve, 5));
  const run = client.runs.get('chat');
  const call = (tool, args, turnId = run.turnId) => client.toolCall({ threadId: run.threadId, turnId, tool, arguments: args });
  const read = JSON.parse((await call('dockit_read_document', {})).contentItems[0].text);
  assert.equal(read.path, await store.documentPath(doc._id));
  assert.equal((await call('dockit_edit_document', { expectedRevision: read.revision, updates: { content: '<p>완료</p>' } }, 'stale-turn')).success, false);
  assert.equal((await call('dockit_edit_document', { expectedRevision: read.revision, updates: { content: '<p>완료</p>' } })).success, true);
  const start = fixture.state.calls.find(call => call.method === 'thread/start').params;
  assert.equal(start.cwd, store.root); assert.equal(start.sandbox, 'read-only');
  assert.deepEqual(start.environments, []); assert.equal(start.dynamicTools.length, 3);
  await client.cancelResponse();
  const result = await sent;
  assert.equal(result.document.content, '<p>완료</p>'); assert.equal(store.documentLocks.size, 0);
  fixture.state.mode = 'fail-turn';
  const failed = await client.send('실패', 'chat', undefined, [], { id: doc._id, revision: result.document.revision });
  assert.equal(failed.error.code, 'turn_failed'); assert.equal(store.documentLocks.size, 0);
  fixture.state.mode = 'hold-turn';
  const disconnected = client.send('연결 종료', 'chat', undefined, [], { id: doc._id, revision: result.document.revision });
  while (!client.runs.get('chat')?.turnId) await new Promise(resolve => setTimeout(resolve, 5));
  client.transport.dispose();
  assert.equal((await disconnected).error.code, 'disconnected'); assert.equal(store.documentLocks.size, 0);
});

test('failed migration retries tool-enabled thread creation without losing previous conversation', async t => {
  const { store, documents, home } = await setup(t);
  const fixture = createFixture();
  const client = new CodexClient({ root: store.root, documents, globalHome: path.join(home, '.codex'), ...fixture });
  t.after(() => client.dispose());
  await client.signIn();
  client.data.documentToolsVersion = 0;
  client.data.threads.chat = 'legacy-thread';
  client.data.chat.push({ id: 'earlier', role: 'user', text: '이전 대화 내용' });
  const request = client.transport.request.bind(client.transport);
  let failStart = true;
  client.transport.request = async (method, params) => {
    if (method === 'thread/start' && failStart) { failStart = false; throw new Error('fixture start failure'); }
    return request(method, params);
  };
  assert.ok((await client.send('첫 요청')).error);
  assert.equal(client.data.documentToolsVersion, 0);
  assert.equal(client.data.threads.chat, 'legacy-thread');
  assert.equal((await client.send('다시 요청')).error, null);
  assert.equal(client.data.documentToolsVersion, 1);
  assert.deepEqual(client.data.previousChatThreads, ['legacy-thread']);
  assert.ok(fixture.state.calls.find(call => call.method === 'thread/start').params.dynamicTools.length);
  assert.ok(fixture.state.calls.find(call => call.method === 'turn/start').params.input.some(item => item.text?.includes('이전 대화 내용')));
});

test('installed app-server accepts scoped tools and environment-free threads without using an account', async t => {
  const command = await findCodex(); if (!command) return t.skip('CLI not installed');
  const { store } = await setup(t);
  const cliHome = path.join(store.root, 'codex'); await fs.mkdir(cliHome, { recursive: true });
  const transport = new CodexTransport({ command, home: cliHome, workspace: store.root, notify() {}, exited() {} });
  transport.child.stdout.on('data', chunk => {
    for (const line of chunk.split('\n')) { try { const message = JSON.parse(line); if (message.error) t.diagnostic(JSON.stringify(message.error)); } catch {} }
  });
  try {
    await transport.request('initialize', { clientInfo: { name: 'dockit_document_test', version: '1' }, capabilities: { experimentalApi: true } });
    transport.write({ method: 'initialized', params: {} });
    const result = await transport.request('thread/start', { cwd: store.root, sandbox: 'read-only', approvalPolicy: 'never', environments: [], dynamicTools: DOCUMENT_TOOLS });
    assert.ok(result.thread.id);
  } finally { const closed = require('node:events').once(transport.child, 'close'); transport.dispose(); await closed; }
});
