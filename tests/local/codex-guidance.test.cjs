const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { CodexClient, CodexTransport, findCodex } = require('../../electron/codex-client.cjs');
const { defaultCodexHome, readGlobalGuidance, sharedSkillRoots, skillReaderConfig } = require('../../electron/codex-guidance.cjs');
const { readSkill, createSkillHandler } = require('../../electron/codex-skills-server.cjs');
const { createFixture } = require('../helpers/codex-fixture.cjs');

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-guidance-test-'));
  const globalHome = path.join(directory, '.codex'), root = path.join(directory, '.dockit');
  const skills = path.join(globalHome, 'skills'), skill = path.join(skills, 'guidance-fixture', 'SKILL.md');
  await fs.mkdir(path.dirname(skill), { recursive: true });
  await fs.writeFile(skill, '---\nname: guidance-fixture\ndescription: A fixture skill for testing shared guidance.\n---\n\nUse the fixture palette.');
  await fs.writeFile(path.join(globalHome, 'AGENTS.md'), 'Address the user as guidance-fixture-user.');
  await fs.writeFile(path.join(globalHome, 'auth.json'), 'global-credential-must-stay-private');
  await fs.writeFile(path.join(globalHome, 'config.toml'), 'model = "do-not-import"');
  t.after(async () => {
    assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith('dockit-guidance-test-'));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });
  return { directory, globalHome, root, skills, skill };
}

test('shared guidance follows global override precedence without copying settings or credentials', async t => {
  const { globalHome, directory } = await setup(t);
  assert.equal(defaultCodexHome({ CODEX_HOME: globalHome }), globalHome);
  assert.match(await readGlobalGuidance(globalHome), /guidance-fixture-user/);
  const override = path.join(globalHome, 'AGENTS.override.md');
  await fs.writeFile(override, 'Override marker');
  assert.match(await readGlobalGuidance(globalHome), /Override marker/);
  assert.doesNotMatch(await readGlobalGuidance(globalHome), /guidance-fixture-user/);
  await fs.writeFile(override, ' \n');
  assert.match(await readGlobalGuidance(globalHome), /guidance-fixture-user/);
  await fs.writeFile(override, 'a'.repeat(32 * 1024) + 'excluded-marker');
  assert.doesNotMatch(await readGlobalGuidance(globalHome), /excluded-marker/);
  assert.equal(await readGlobalGuidance(path.join(directory, 'missing')), '');
  assert.deepEqual(await sharedSkillRoots(globalHome, directory), [await fs.realpath(path.join(globalHome, 'skills'))]);
});

test('chat and image get shared instructions on start and existing-thread resume with independent auth', async t => {
  const { globalHome, root, skills } = await setup(t), fixture = createFixture();
  const client = new CodexClient({ root, globalHome, ...fixture });
  try {
    await client.signIn(); await client.send('hello'); await client.send('draw', 'image');
    assert.deepEqual(fixture.state.calls.find(c => c.method === 'skills/extraRoots/set').params.extraRoots, [await fs.realpath(skills)]);
    const starts = fixture.state.calls.filter(c => c.method === 'thread/start');
    assert.equal(starts.length, 2);
    for (const { params } of starts) {
      assert.equal(params.sandbox, 'read-only'); assert.equal(params.approvalPolicy, 'never');
      assert.ok(params.config['mcp_servers.dockit_skills'].args.includes(await fs.realpath(skills)));
      assert.ok(!JSON.stringify(params).includes('do-not-import'));
    }
    for (const { params } of fixture.state.calls.filter(c => c.method === 'turn/start')) assert.match(params.input[0].text, /guidance-fixture-user/);
    assert.equal(await fs.readFile(path.join(globalHome, 'auth.json'), 'utf8'), 'global-credential-must-stay-private');
    await assert.rejects(fs.stat(path.join(client.home, 'AGENTS.md')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(client.home, 'config.toml')), { code: 'ENOENT' });
  } finally { await client.dispose(); }
  await fs.writeFile(path.join(globalHome, 'AGENTS.md'), 'Updated global guidance');
  const restored = new CodexClient({ root, globalHome, ...fixture });
  try {
    await restored.status(); await restored.send('continue');
    const resume = fixture.state.calls.find(c => c.method === 'thread/resume');
    assert.match(fixture.state.calls.filter(c => c.method === 'turn/start').at(-1).params.input[0].text, /Updated global guidance/);
    assert.ok(resume.params.config['mcp_servers.dockit_skills']);
    assert.equal(restored.data.threads.chat, client.data.threads.chat);
  } finally { await restored.dispose(); }
});

test('skill reader accepts skill references but denies traversal, outside links, binaries and large files', async t => {
  const { globalHome, skills, skill } = await setup(t), roots = [await fs.realpath(skills)];
  assert.match(await readSkill(skill, roots), /fixture palette/);
  const reference = path.join(path.dirname(skill), 'reference.md');
  await fs.writeFile(reference, 'Reference content');
  assert.equal(await readSkill(reference, roots), 'Reference content');
  await assert.rejects(readSkill(path.join(skills, '..', 'auth.json'), roots));
  await assert.rejects(readSkill(path.join(globalHome, 'auth.json'), roots));
  await fs.symlink(globalHome, path.join(skills, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readSkill(path.join(skills, 'outside', 'auth.json'), roots));
  await fs.writeFile(reference, Buffer.from([0, 1, 2])); await assert.rejects(readSkill(reference, roots));
  await fs.writeFile(reference, 'x'.repeat(256 * 1024 + 1)); await assert.rejects(readSkill(reference, roots));
  const handle = createSkillHandler(roots);
  const denied = await handle({ id: 1, method: 'tools/call', params: { name: 'read_skill', arguments: { path: path.join(globalHome, 'auth.json') } } });
  assert.equal(denied.result.isError, true); assert.ok(!JSON.stringify(denied).includes('global-credential'));
  assert.equal((await handle({ id: 2, method: 'tools/call', params: { name: 'write_file' } })).error.code, -32601);
});

test('installed CLI discovers shared skills and reads them after resuming a legacy thread', { timeout: 60_000 }, async t => {
  const command = await findCodex(); if (!command) { t.skip('CLI not installed'); return; }
  const { globalHome, root, skills, skill } = await setup(t);
  const home = path.join(root, 'codex'), workspace = path.join(home, 'workspace');
  await fs.mkdir(workspace, { recursive: true });
  const requests = [], waiters = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push(JSON.parse(raw));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: response.completed\ndata: ' + JSON.stringify({ type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }) + '\n\n');
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  let transport;
  const close = async () => { if (transport && !transport.closed) { const closed = once(transport.child, 'close'); transport.dispose(); await closed; } };
  const start = async () => {
    transport = new CodexTransport({ command, home, workspace, notify(method) { if (method === 'turn/completed') waiters.shift()?.(); }, exited() {} });
    await transport.request('initialize', { clientInfo: { name: 'dockit_guidance_test', version: '0.1.3' } });
    transport.write({ method: 'initialized', params: {} });
    assert.equal((await transport.request('account/read', { refreshToken: false })).account, null);
  };
  const turn = async (threadId, guidance = '') => {
    const completed = new Promise(ok => waiters.push(ok));
    const input = guidance ? [{ type: 'text', text: guidance }] : [];
    input.push({ type: 'text', text: 'Fixture request' });
    await transport.request('turn/start', { threadId, input });
    await completed;
  };
  const config = {
    'model_providers.dockit_mock': { name: 'Mock', base_url: `http://127.0.0.1:${server.address().port}/v1`, wire_api: 'responses', requires_openai_auth: false, supports_websockets: false },
    'features.apps': false, 'features.plugins': false, 'features.remote_plugin': false
  };
  try {
    await start();
    const params = { model: 'gpt-6.1-sol', modelProvider: 'dockit_mock', cwd: workspace, sandbox: 'read-only', approvalPolicy: 'never', config };
    const { thread } = await transport.request('thread/start', params);
    await turn(thread.id); await close();
    await start();
    await transport.request('skills/extraRoots/set', { extraRoots: [skills] });
    const listed = await transport.request('skills/list', { cwds: [workspace], forceReload: true });
    assert.ok(listed.data.some(row => row.skills.some(s => s.name === 'guidance-fixture')));
    await transport.request('thread/resume', { ...params, threadId: thread.id, developerInstructions: await readGlobalGuidance(globalHome), config: { ...config, ...skillReaderConfig([skills]) } });
    const result = await transport.request('mcpServer/tool/call', { threadId: thread.id, server: 'dockit_skills', tool: 'read_skill', arguments: { path: skill } });
    assert.ok(JSON.stringify(result).includes('Use the fixture palette.'));
    await turn(thread.id, await readGlobalGuidance(globalHome));
    const sent = JSON.stringify(requests.at(-1));
    assert.ok(sent.includes('guidance-fixture-user'));
    assert.ok(sent.includes('guidance-fixture'));
    assert.ok(!sent.includes('global-credential-must-stay-private'));
    await assert.rejects(fs.stat(path.join(home, 'auth.json')), { code: 'ENOENT' });
  } finally {
    await close(); server.closeAllConnections(); await new Promise(ok => server.close(ok));
  }
});
