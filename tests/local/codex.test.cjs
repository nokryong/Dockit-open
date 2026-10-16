const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once, EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { CodexClient, CodexTransport, childEnvironment, normalizeUsage, safeFailure, findCodex } = require('../../electron/codex-client.cjs');
const { createFixture, png } = require('../helpers/codex-fixture.cjs');

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-codex-test-'));
  const root = path.join(directory, '.dockit'); await fs.mkdir(root);
  const fixture = createFixture(), events = [];
  const client = new CodexClient({ root, globalHome: path.join(directory, '.codex'), ...fixture, emit: event => events.push(event) });
  t.after(async () => { await client.dispose(); assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith('dockit-codex-test-')); await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); });
  await client.ready;
  return { client, fixture, root, events };
}
test('CLI home and environment isolate native credentials from global Codex and SIWC', () => {
  const original = { PATH: 'a', CODEX_HOME: '/global', OPENAI_API_KEY: 'secret', ACCESS_TOKEN: 'secret', CODEX_THREAD_ID: 'parent', ELECTRON_RUN_AS_NODE: '1' };
  const env = childEnvironment('/dockit/codex', '/workspace', original);
  assert.deepEqual(env, { PATH: 'a', CODEX_HOME: '/dockit/codex', PWD: '/workspace' });
  assert.equal(original.CODEX_HOME, '/global');
});

test('chat attachments send exact text and a scoped local image without granting broader file access', async t => {
  const { client, fixture, root } = await setup(t);
  await client.signIn();
  const text = path.join(root, 'notes.txt');
  const image = path.join(root, 'reference.png');
  const content = '원문 파일 내용'.repeat(40000);
  await fs.writeFile(text, content);
  await fs.writeFile(image, Buffer.from(png, 'base64'));
  const attachments = await client.attachFiles([text, image]);
  const result = await client.send('', 'chat', undefined, attachments);
  assert.equal(result.error, null);
  const turn = fixture.state.calls.find(call => call.method === 'turn/start');
  assert.ok(turn.params.input.some(item => item.type === 'text' && item.text === `첨부 파일: notes.txt\n${content}`));
  const picture = turn.params.input.find(item => item.type === 'localImage');
  assert.ok(picture.path.startsWith(path.join(root, 'ai', 'attachments', 'codex')));
  assert.deepEqual(await fs.readFile(picture.path), Buffer.from(png, 'base64'));
  assert.equal(result.messages[0].attachments.length, 2);
  const thread = fixture.state.calls.find(call => call.method === 'thread/start');
  assert.equal(thread.params.sandbox, 'read-only');
  assert.equal(thread.params.approvalPolicy, 'never');
});
test('separate login, sanitized status, model and usage query, logout retains other connection', async t => {
  const { client, root } = await setup(t);
  await fs.mkdir(path.join(root, 'ai'), { recursive: true });
  await fs.writeFile(path.join(root, 'ai', 'connections.json'), 'siwc-unchanged');
  assert.equal((await client.status()).connected, false);
  await client.signIn(); await client.listModels();
  assert.equal((await client.status()).connected, true);
  assert.equal(client.data.model, 'fixture-codex');
  assert.ok(!JSON.stringify(await client.status()).includes('fixture-secret'));
  const usage = await client.readUsage(); assert.equal(usage.buckets[0].primary.usedPercent, 20);
  await client.signOut(); assert.equal((await client.status()).connected, false);
  assert.equal(await fs.readFile(path.join(root, 'ai', 'connections.json'), 'utf8'), 'siwc-unchanged');
});
test('login can be cancelled without writing credentials', async t => {
  const { client, fixture } = await setup(t); fixture.state.mode = 'hold-login';
  const signing = client.signIn();
  while (!client.login?.id) await new Promise(ok => setTimeout(ok, 5));
  await client.cancelSignIn(); await assert.rejects(signing, { code: 'cancelled' });
  assert.equal((await client.status()).signingIn, false);
  await assert.rejects(fs.stat(path.join(client.home, 'auth.json')), { code: 'ENOENT' });
});
test('chat streams once, persists, and resumes its CLI thread after restart', async t => {
  const { client, fixture, root } = await setup(t);
  await client.signIn();
  await client.listModels();
  assert.deepEqual(client.models[0].supportedReasoningEfforts.map(option => option.effort), ['low', 'high']);

  assert.equal((await client.status()).reasoningEffort, 'low');
  await assert.rejects(client.selectReasoningEffort('medium'), { code: 'invalid_reasoning_effort' });
  await client.selectReasoningEffort('high');
  assert.equal((await client.status()).reasoningEffort, 'high');
  const result = await client.send('hello');
  assert.equal(fixture.state.calls.find(call => call.method === 'turn/start').params.effort, 'high');
  assert.equal(result.error, null); assert.equal(result.messages[1].text, 'CLI 대화 테스트 응답입니다.');
  assert.equal(result.messages[1].status, 'completed');
  const threadId = client.data.threads.chat; await client.dispose();
  const restored = new CodexClient({ root, globalHome: client.globalHome, ...fixture }); t.after(() => restored.dispose());
  await restored.status(); assert.equal(restored.history().length, 2); assert.equal((await restored.status()).reasoningEffort, 'high');
  await restored.send('again'); assert.equal(restored.data.threads.chat, threadId);
  assert.ok(fixture.state.calls.some(call => call.method === 'thread/resume'));
  const params = fixture.state.calls.find(call => call.method === 'thread/start').params;
  assert.equal(params.sandbox, 'read-only'); assert.equal(params.cwd, client.workspace);
});
test('image login gate, reference input, multiple results and contained image retrieval', async t => {
  const { client, fixture } = await setup(t);
  await assert.rejects(client.send('draw', 'image'), { code: 'signin' });
  await client.signIn(); fixture.state.mode = 'multiple-images';
  const result = await client.send('draw', 'image', `data:image/png;base64,${png}`);
  assert.equal(result.error, null);
  const generated = result.messages.filter(m => m.role === 'assistant' && m.image);
  assert.equal(generated.length, 2);
  assert.ok(await fs.stat(await client.imagePath(generated[0].imageId)));
  assert.equal(fixture.state.calls.find(c => c.method === 'turn/start').params.input[1].type, 'localImage');
  await assert.rejects(client.imagePath('../auth.json'));
  await assert.rejects(client.storeImage({ savedPath: path.join(client.root, 'config.json') }));
  await assert.rejects(client.storeImage({ result: Buffer.from('not an image').toString('base64') }));
  await client.signOut(); await assert.rejects(client.imagePath(generated[0].imageId));
});
test('image failure and missing image are not reported as success; raw upstream error stays private', async t => {
  const { client, fixture } = await setup(t); await client.signIn();
  fixture.state.mode = 'no-image'; assert.equal((await client.send('draw', 'image')).error.code, 'no_image');
  fixture.state.mode = 'fail-turn';
  const result = await client.send('hello'); assert.equal(result.error.code, 'turn_failed');
  assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  assert.ok(!safeFailure(new Error('fixture-secret')).message.includes('fixture-secret'));
});
test('stop interrupts active turn and prevents account/model changes until completion', async t => {
  const { client, fixture } = await setup(t); await client.signIn(); fixture.state.mode = 'hold-turn';
  const sent = client.send('wait');
  while (!client.runs.get('chat')?.turnId) await new Promise(ok => setTimeout(ok, 5));
  await assert.rejects(client.signOut(), { code: 'busy' });
  await assert.rejects(client.selectModel('fixture-codex'), { code: 'busy' });
  await client.cancelResponse(); const result = await sent;
  assert.equal(result.messages[1].status, 'cancelled'); assert.equal(client.runs.size, 0);
});
test('different CLI account receives separate histories', async t => {
  const { client, fixture } = await setup(t); await client.signIn(); await client.send('one');
  await client.signOut(); fixture.state.account = 'two'; await client.signIn(); assert.equal(client.history().length, 0);
  await client.send('two'); await client.signOut(); fixture.state.account = 'one'; await client.signIn();
  assert.equal(client.history()[0].text, 'one');
});
test('missing CLI gives actionable error and null usage remains unavailable', async t => {
  const { client } = await setup(t); client.resolveCommand = async () => null;
  assert.equal((await client.status()).available, false);
  await assert.rejects(client.signIn(), { code: 'cli_missing' });
  const usage = normalizeUsage({ rateLimits: { primary: { usedPercent: null, resetsAt: null } } });
  assert.equal(usage.buckets[0].primary.usedPercent, null);
});
test('transport handles fragmented JSON and declines unexpected approval requests', async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  let written = ''; child.stdin.on('data', chunk => { written += chunk; });
  const transport = new CodexTransport({ command: 'fixture', home: '/isolated', workspace: '/work', notify() {}, exited() {}, spawnImpl: () => child });
  const response = transport.request('initialize');
  transport.read('{"id":1,"res'); transport.read('ult":{"ok":true}}\n');
  assert.deepEqual(await response, { ok: true });
  transport.read('{"id":4,"method":"item/commandExecution/requestApproval","params":{}}\n');
  assert.ok(written.includes('"decision":"decline"'));
  const pending = transport.request('account/read'); transport.dispose(); await assert.rejects(pending, { code: 'disconnected' });
});
test('installed CLI handshake and account read use an empty temporary CODEX_HOME', async t => {
  const command = await findCodex(); if (!command) { t.skip('CLI not installed'); return; }
  const { client } = await setup(t);
  const transport = new CodexTransport({ command, home: client.home, workspace: client.workspace, notify() {}, exited() {} });
  const exited = once(transport.child, 'close');
  try {
    const init = await transport.request('initialize', { clientInfo: { name: 'dockit_open_test', version: '0.1.3' } });
    assert.ok(init); transport.write({ method: 'initialized', params: {} });
    const result = await transport.request('account/read', { refreshToken: false });
    assert.equal(result.account, null);
  } finally { transport.dispose(); await exited; }
});

test('Fast service tier loads configured state, persists and explicitly turns off on a resumed thread', async t => {
  const {client,fixture,root}=await setup(t); fixture.state.serviceTier='fast';
  await client.signIn(); await client.listModels();
  assert.equal((await client.status()).serviceTier,'priority');
  assert.equal(client.models[0].serviceTiers[0].id,'priority');
  await client.selectServiceTier('priority'); await client.send('fast');
  const id=client.data.threads.chat; await client.dispose();
  const restored=new CodexClient({root,globalHome:client.globalHome,...fixture}); t.after(()=>restored.dispose());
  await restored.status(); assert.equal((await restored.status()).serviceTier,'priority');
  await restored.listModels(); await restored.selectServiceTier('default'); await restored.send('standard');
  assert.equal(restored.data.threads.chat,id);
  assert.deepEqual(fixture.state.calls.filter(call=>call.method==='turn/start').map(call=>call.params.serviceTier),['priority','default']);
  restored.models[0].serviceTiers=[]; await assert.rejects(restored.selectServiceTier('priority'),{code:'invalid_service_tier'});
  assert.equal((await restored.status()).serviceTier,'default');
});

test('activity labels follow actual items and finish on cancellation', async t => {
  const {client,fixture}=await setup(t); await client.signIn(); fixture.state.mode='hold-turn'; const labels=[];
  const emit=client.emit; client.emit=event=>{if(event.type==='messages'){const label=event.messages.findLast(m=>m.activity)?.activity;if(label)labels.push(label);}emit(event);};
  const sent=client.send('work');
  for(let n=0;n<200&&!client.runs.get('chat')?.turnId;n++)await new Promise(ok=>setTimeout(ok,5));
  const run=client.runs.get('chat'); assert.ok(run?.turnId);
  const notify=(method,item)=>client.notification(method,{threadId:run.threadId,turnId:run.turnId,item});
  notify('item/started',{id:'r',type:'reasoning'}); assert.equal(run.assistant.activity,'추론 중');
  notify('item/started',{id:'tool',type:'mcpToolCall',arguments:'private_tool_arguments'}); assert.equal(run.assistant.activity,'도구 사용 중');
  notify('item/completed',{id:'tool',type:'mcpToolCall'}); assert.equal(run.assistant.activity,'추론 중');
  notify('item/completed',{id:'r',type:'reasoning'});
  client.notification('item/agentMessage/delta',{threadId:run.threadId,turnId:run.turnId,itemId:'text',delta:'partial'});
  assert.equal(run.assistant.activity,'답변 작성 중');
  await client.cancelResponse(); const result=await sent; assert.equal(result.messages.findLast(m=>m.activity).activity,'응답 중지됨');
  assert.ok(labels.includes('추론 중')&&labels.includes('도구 사용 중')&&labels.includes('답변 작성 중'));
  assert.equal(JSON.stringify(result.messages).includes('private_tool_arguments'),false);
});
