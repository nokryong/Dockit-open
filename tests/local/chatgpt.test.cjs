const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv, createHash } = require('node:crypto');
const { ChatGPTStorage } = require('../../electron/chatgpt-storage.cjs');
const { ChatGPTClient, safeFailure } = require('../../electron/chatgpt-client.cjs');
const { beginAuthorization, createIdentityVerifier, ISSUER } = require('../../electron/chatgpt-oauth.cjs');

const identity = { iss: ISSUER, sub: 'test-user', email: 'test@example.invalid', name: 'Test' };
const tokens = { access_token: 'synthetic-access-secret', refresh_token: 'synthetic-refresh-secret', id_token: 'synthetic-id-secret', token_type: 'Bearer', scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', expires_in: 3600 };
function encryption() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decryptString: value => { const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8'); }
  };
}
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-chatgpt-test-'));
  const crypt = encryption();
  const events = [];
  const client = new ChatGPTClient({ root, encryption: crypt, openExternal: async () => {}, verify: async () => identity, fetchImpl: async () => { throw new Error('Unexpected network access'); }, emit: value => events.push(structuredClone(value)), ...options });
  await client.ready;
  t.after(async () => { await client.dispose(); assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('dockit-chatgpt-test-')); await fs.rm(root, { recursive: true, force: true }); });
  return { root, crypt, client, events };
}
async function connect(client) {
  const profile = { id: 'test-profile', clientId: 'oaiapp_test', identity, label: 'Test account', welcomeSeen: false };
  client.applyTokens(profile, tokens);
  client.state.profiles.push(profile); client.state.activeId = profile.id;
  await client.save();
  return profile;
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_test' } });

test('file-only messages send original file data and retain attachments in subsequent context', async t => {
  const requests = [];
  const { client, root } = await fixture(t, { fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return stream([{ type: 'response.output_text.delta', delta: '확인했습니다.' }, { type: 'response.completed' }]);
  } });
  const profile = await connect(client);
  profile.model = 'fixture-model';
  client.models.set(profile.id, [{ slug: profile.model }]);
  const source = path.join(root, 'note.txt');
  await fs.writeFile(source, 'Original attachment');
  const attachments = await client.attachFiles([source]);
  assert.equal((await client.send('', attachments)).error, null);
  assert.equal(requests[0].input[0].content[0].type, 'input_file');
  assert.equal(requests[0].input[0].content[0].filename, 'note.txt');
  assert.equal(requests[0].store, false);
  assert.equal(requests[0].stream, true);
  await client.send('이어서 설명해줘');
  assert.equal(requests[1].input[0].content[0].type, 'input_file');
  assert.equal((await client.history())[0].attachments[0].name, 'note.txt');
  assert.ok(!(await fs.readFile(path.join(root, 'ai/chats/test-profile.json'), 'utf8')).includes('Original attachment'));
});
function stream(events, chunkSize = 17) {
  const data = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < data.length; i += chunkSize) controller.enqueue(data.subarray(i, i + chunkSize)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('credentials are encrypted, public state omits tokens, host and welcome survive restart', async t => {
  const { client, root, crypt } = await fixture(t);
  await connect(client); await client.acknowledge();
  const saved = await fs.readFile(path.join(root, 'ai/connections.json'), 'utf8');
  for (const value of [tokens.access_token, tokens.refresh_token, tokens.id_token, identity.email]) assert.ok(!saved.includes(value));
  const visible = JSON.stringify(await client.status());
  for (const value of [tokens.access_token, tokens.refresh_token, tokens.id_token, 'oaiapp_test']) assert.ok(!visible.includes(value));
  const second = new ChatGPTStorage(root, crypt);
  const restored = await second.init();
  assert.equal(second.hostId, client.storage.hostId);
  assert.equal(restored.profiles[0].welcomeSeen, true);
  assert.equal(restored.profiles[0].tokens.refresh_token, tokens.refresh_token);
});
test('unavailable encryption and corrupted ciphertext preserve credentials', async t => {
  const { client, root, crypt } = await fixture(t);
  await connect(client);
  const file = path.join(root, 'ai/connections.json');
  const before = await fs.readFile(file, 'utf8');
  const locked = new ChatGPTStorage(root, { ...crypt, isEncryptionAvailable: () => false });
  await assert.rejects(locked.init(), /저장소/);
  assert.equal(await fs.readFile(file, 'utf8'), before);
  const broken = new ChatGPTStorage(root, encryption());
  await assert.rejects(broken.init(), /읽을 수 없습니다/);
  assert.equal(await fs.readFile(file, 'utf8'), before);
  const insecure = new ChatGPTStorage(root, { ...crypt, getSelectedStorageBackend: () => 'basic_text' });
  await assert.rejects(insecure.init(), /저장소/);
});
test('profile paths reject traversal and same-email registrations stay separate', async t => {
  const { client } = await fixture(t);
  const first = await connect(client);
  await assert.rejects(client.storage.history('../../outside'), /잘못된/);
  client.state.profiles.push({ ...structuredClone(first), id: 'second-profile', clientId: 'oaiapp_other', label: 'Other workspace', model: 'other-model' });
  await client.storage.saveHistory(first.id, [{ role: 'user', text: 'First account only', status: 'completed' }]);
  await client.selectProfile('second-profile');
  assert.deepEqual(await client.history(), []);
  assert.equal((await client.status()).profiles.length, 2);
  await client.selectProfile(first.id);
  assert.equal((await client.history())[0].text, 'First account only');
});

test('OIDC validates signature, audience, issuer, expiration and nonce', async () => {
  const { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } = await import('jose');
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const verify = createIdentityVerifier(createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'key-1', alg: 'RS256' }] }));
  const sign = (claims = {}) => new SignJWT({ sub: 'test-user', email: identity.email, nonce: 'expected', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'key-1' }).setIssuer(claims.iss || ISSUER).setAudience(claims.aud || 'oaiapp_test').setIssuedAt().setExpirationTime(claims.exp || '5m').sign(privateKey);
  assert.equal((await verify(await sign(), 'oaiapp_test', 'expected')).sub, 'test-user');
  await assert.rejects(verify(await sign(), 'oaiapp_wrong', 'expected'));
  await assert.rejects(verify(await sign({ iss: 'https://wrong.invalid' }), 'oaiapp_test', 'expected'));
  await assert.rejects(verify(await sign({ exp: 1 }), 'oaiapp_test', 'expected'));
  await assert.rejects(verify(await sign(), 'oaiapp_test', 'wrong'));
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT({ sub: 'test-user', nonce: 'expected' }).setProtectedHeader({ alg: 'RS256', kid: 'key-1' }).setIssuer(ISSUER).setAudience('oaiapp_test').setIssuedAt().setExpirationTime('5m').sign(other.privateKey);
  await assert.rejects(verify(forged, 'oaiapp_test', 'expected'));
});
test('OAuth uses loopback, PKCE, nonce and issued client ID, ignores forged callbacks', async () => {
  let auth, exchanged, registered;
  const result = await beginAuthorization({
    hostId: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    openExternal: async value => {
      auth = new URL(value);
      assert.equal(auth.origin, ISSUER);
      assert.equal(auth.searchParams.get('client_id'), 'dynamic_agent_client');
      assert.equal(auth.searchParams.get('agent_name_hint'), 'Dockit Open');
      assert.equal(auth.searchParams.get('prompt'), null);
      assert.equal(new URL(auth.searchParams.get('redirect_uri')).hostname, '127.0.0.1');
      const callback = new URL(auth.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({ code: 'one-time-code', state: 'wrong-state', client_id: 'oaiapp_issued' });
      assert.equal((await fetch(callback)).status, 400);
      callback.searchParams.set('state', auth.searchParams.get('state'));
      assert.equal((await fetch(callback)).status, 200);
    },
    onRegistration: async id => { registered = id; },
    exchange: async fields => {
      assert.equal(registered, 'oaiapp_issued'); exchanged = fields;
      assert.equal(createHash('sha256').update(fields.code_verifier).digest('base64url'), auth.searchParams.get('code_challenge'));
      assert.equal(fields.redirect_uri, auth.searchParams.get('redirect_uri'));
      return tokens;
    },
    verify: async (idToken, clientId, nonce) => { assert.equal(idToken, tokens.id_token); assert.equal(clientId, registered); assert.equal(nonce, auth.searchParams.get('nonce')); return identity; }
  });
  assert.equal(result.clientId, 'oaiapp_issued');
  assert.equal(exchanged.client_id, 'oaiapp_issued');
  assert.ok(!('client_secret' in exchanged));
});
test('returning OAuth rejects a different registration and cancellation stops listener', async () => {
  await assert.rejects(beginAuthorization({ hostId: 'urn:uuid:test', profile: { clientId: 'oaiapp_original', identity }, consent: true,
    openExternal: async value => {
      const auth = new URL(value);
      assert.equal(auth.searchParams.get('agent_name_hint'), null);
      assert.equal(auth.searchParams.get('prompt'), 'consent');
      const callback = new URL(auth.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({ code: 'code', state: auth.searchParams.get('state'), client_id: 'oaiapp_other' });
      await fetch(callback);
    }, onRegistration: () => assert.fail(), exchange: () => assert.fail(), verify: () => assert.fail()
  }), { code: 'invalid_registration' });
  const controller = new AbortController();
  let callback;
  await assert.rejects(beginAuthorization({ hostId: 'urn:uuid:test', signal: controller.signal, openExternal: async value => { callback = new URL(value).searchParams.get('redirect_uri'); controller.abort(); }, onRegistration: () => assert.fail() }), { code: 'cancelled' });
  await assert.rejects(fetch(callback));
});
test('identity mismatch does not replace the original account', async t => {
  const { client } = await fixture(t);
  const profile = await connect(client);
  client.openExternal = async value => {
    const auth = new URL(value);
    assert.equal(auth.searchParams.get('id_token_hint'), tokens.id_token);
    const callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'code', state: auth.searchParams.get('state') });
    await fetch(callback);
  };
  client.fetch = async () => json(tokens);
  client.verify = async () => ({ ...identity, sub: 'other-user' });
  await assert.rejects(client.signIn(), { code: 'identity_mismatch' });
  assert.equal(profile.identity.sub, identity.sub);
  assert.equal(client.active().id, profile.id);
});
test('failed first code exchange retains the issued registration for retry', async t => {
  const { client } = await fixture(t);
  const clientIds = [];
  client.openExternal = async value => {
    const auth = new URL(value);
    clientIds.push(auth.searchParams.get('client_id'));
    const callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'new-code', state: auth.searchParams.get('state'), client_id: 'oaiapp_saved' });
    await fetch(callback);
  };
  client.fetch = async () => json({ error: 'invalid_grant' }, 400);
  await assert.rejects(client.signIn(), { code: 'invalid_grant' });
  assert.equal(client.active(), undefined);
  client.fetch = async () => json(tokens);
  await client.signIn();
  assert.deepEqual(clientIds, ['dynamic_agent_client', 'oaiapp_saved']);
  assert.equal(client.state.profiles.length, 1);
  assert.equal(client.active().identity.sub, identity.sub);
});
test('declined plan scope never reaches models or inference', async t => {
  const { client } = await fixture(t);
  const profile = await connect(client);
  profile.scopes = ['openid'];
  assert.equal((await client.status()).active.sharing, false);
  assert.deepEqual(await client.listModels(), []);
  await assert.rejects(client.send('hello'), { code: 'consent_required' });
});
test('refresh is serialized, pending rotated credentials recover after verification outage', async t => {
  const { client, root, crypt } = await fixture(t);
  const profile = await connect(client);
  profile.expiresAt = 0;
  let calls = 0;
  client.fetch = async (_url, options) => { calls++; assert.equal(new URLSearchParams(options.body).get('client_id'), profile.clientId); await new Promise(resolve => setTimeout(resolve, 20)); return json({ ...tokens, access_token: 'rotated-access', refresh_token: 'rotated-refresh' }); };
  assert.deepEqual(await Promise.all([client.access(profile), client.access(profile)]), ['rotated-access', 'rotated-access']);
  assert.equal(calls, 1);
  profile.expiresAt = 0;
  client.verify = async () => { throw new Error('Temporary JWKS failure'); };
  await assert.rejects(client.access(profile));
  const stored = await new ChatGPTStorage(root, crypt).init();
  assert.equal(stored.profiles[0].pendingTokens.tokens.refresh_token, 'rotated-refresh');
  client.state = stored;
  client.verify = async () => identity;
  assert.equal(await client.access(client.active()), 'rotated-access');
  assert.equal(calls, 2);
  assert.equal(client.active().pendingTokens, undefined);
});
test('terminal refresh clears tokens, temporary network errors preserve them', async t => {
  const { client } = await fixture(t);
  const profile = await connect(client); profile.expiresAt = 0;
  client.fetch = async () => { throw new Error('Network down'); };
  await assert.rejects(client.access(profile));
  assert.ok(profile.tokens.refresh_token);
  client.fetch = async () => json({ error: 'invalid_grant' }, 400);
  await assert.rejects(client.access(profile), { code: 'sign_in_required' });
  assert.equal(profile.tokens, undefined);
  assert.equal(profile.clientId, 'oaiapp_test');
});
test('discovery filters models and streaming requires completion; history stays local', async t => {
  const { client, root, events } = await fixture(t);
  await connect(client);
  client.fetch = async (url, options) => {
    if (url.endsWith('/models')) return json({ models: [{ slug: 'hidden', display_name: 'Hidden', visibility: 'hide' }, { slug: 'allowed', display_name: 'Available model', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }], default_reasoning_level: 'low' }] });
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, `Bearer ${tokens.access_token}`);
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.model, 'allowed'); assert.deepEqual(body.reasoning, { effort: 'high' });
    assert.deepEqual(body.input, [{ role: 'user', content: 'hello' }]);
    for (const forbidden of ['previous_response_id', 'conversation', 'temperature', 'max_output_tokens']) assert.equal(body[forbidden], undefined);
    return stream([{ type: 'response.output_text.delta', delta: '안녕하세요' }, { type: 'response.completed' }]);
  };
  const models = await client.listModels();
  assert.equal(models[0].defaultReasoningEffort, 'low');
  assert.equal((await client.status()).active.reasoningEffort, 'low');
  await assert.rejects(client.selectReasoningEffort('medium'), { code: 'invalid_reasoning_effort' });
  await client.selectReasoningEffort('high');
  assert.equal((await client.status()).active.reasoningEffort, 'high');
  assert.equal(client.active().reasoningEffort, 'high');
  const result = await client.send('hello');
  assert.equal(result.error, null);
  assert.equal(result.messages[1].text, '안녕하세요');
  assert.equal(result.messages[1].status, 'completed');
  assert.ok(events.some(e => e.type === 'messages'));
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'ai/chats/test-profile.json'), 'utf8')).messages[1].text, '안녕하세요');
});
test('midstream usage failure and interrupted streams preserve partial text without success', async t => {
  const { client } = await fixture(t); const profile = await connect(client);
  profile.model = 'test'; client.models.set(profile.id, [{ slug: 'test', name: 'Test' }]);
  client.fetch = async () => stream([{ type: 'response.output_text.delta', delta: 'partial' }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]);
  const result = await client.send('hello');
  assert.equal(result.error.detail.action, 'usage');
  assert.equal(result.messages[1].text, 'partial');
  assert.equal(result.messages[0].status, 'failed');
  assert.equal(result.messages[1].status, 'failed');
  client.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).input, [{ role: 'user', content: 'again' }]);
    return stream([{ type: 'response.output_text.delta', delta: 'unfinished' }]);
  };
  const second = await client.send('again');
  assert.equal(second.error.code, 'incomplete_response');
  assert.equal(second.messages.at(-1).status, 'failed');
});
test('logout revokes session and removes the account from memory and persisted connections', async t => {
  const { client, root, crypt } = await fixture(t); const profile = await connect(client); const host = client.storage.hostId;
  client.state.pendingProfileId = profile.id;
  client.models.set(profile.id, [{ slug: 'test', name: 'Test' }]);
  let revoked = false;
  client.fetch = async (url, options) => {
    if (url.endsWith('openid-configuration')) return json({ revocation_endpoint: `${ISSUER}/oauth/revoke` });
    assert.equal(url, `${ISSUER}/oauth/revoke`);
    assert.equal(new URLSearchParams(options.body).get('token'), tokens.refresh_token);
    revoked = true; return new Response(null, { status: 200 });
  };
  assert.equal((await client.signOut()).revocationConfirmed, true);
  assert.ok(revoked); assert.equal(profile.tokens, undefined); assert.equal(client.storage.hostId, host);
  assert.equal((await client.status()).active, null);
  assert.deepEqual((await client.status()).profiles, []);
  assert.equal(client.models.has(profile.id), false);
  assert.deepEqual(await new ChatGPTStorage(root, crypt).init(), { version: 1, activeId: null, profiles: [] });
  assert.equal((await client.signOut()).revocationConfirmed, true);
});
test('logout removes account information even when remote revocation fails', async t => {
  const { client, root, crypt } = await fixture(t); const profile = await connect(client);
  client.fetch = async () => { throw new Error('offline'); };
  assert.equal((await client.signOut()).revocationConfirmed, false);
  assert.equal(profile.tokens, undefined);
  assert.deepEqual(await new ChatGPTStorage(root, crypt).init(), { version: 1, activeId: null, profiles: [] });
});
test('logout removes only the selected account without activating another account', async t => {
  const { client, root, crypt } = await fixture(t); const profile = await connect(client);
  const other = { ...structuredClone(profile), id: 'other-profile', clientId: 'oaiapp_other' };
  client.state.profiles.push(other);
  client.fetch = async () => { throw new Error('offline'); };
  await client.signOut();
  const restored = await new ChatGPTStorage(root, crypt).init();
  assert.equal(restored.activeId, null);
  assert.deepEqual(restored.profiles, [other]);
});
test('raw transport errors never expose authorization URLs or token data', () => {
  const safe = JSON.stringify(safeFailure(new Error(`request failed https://auth.openai.com/?id_token_hint=${tokens.id_token}`)));
  assert.ok(!safe.includes(tokens.id_token));
  assert.ok(!safe.includes('id_token_hint'));
});

test('Fast service tier is discovered, saved per profile and sent on Responses requests', async t => {
  const {client}=await fixture(t); await connect(client); const requests=[];
  client.fetch=async(url,options)=>{
    if(url.endsWith('/models')) return json({models:[{slug:'fast-model',display_name:'Fast model',visibility:'list',service_tiers:[{id:'priority',name:'Fast'}]}]});
    requests.push(JSON.parse(options.body)); return stream([{type:'response.output_text.delta',delta:'done'},{type:'response.completed'}]);
  };
  const models=await client.listModels(); assert.equal(models[0].serviceTiers[0].id,'priority');
  await client.selectServiceTier('priority'); assert.equal((await client.status()).active.serviceTier,'priority');
  const saved=await client.storage.init(); assert.equal(saved.profiles[0].serviceTier,'priority');
  assert.equal((await client.send('fast')).error,null);
  await client.selectServiceTier('default'); assert.equal((await client.send('standard')).error,null);
  assert.deepEqual(requests.map(request=>request.service_tier),['priority','default']);
  models[0].serviceTiers=[]; await assert.rejects(client.selectServiceTier('priority'),{code:'invalid_service_tier'});
  assert.equal((await client.status()).active.serviceTier,'default');
});

test('activity labels follow Responses events and completion is persisted', async t => {
  const {client}=await fixture(t); const profile=await connect(client); profile.model='activity-model'; client.models.set(profile.id,[{slug:profile.model}]); const labels=[];
  const emit=client.emit; client.emit=event=>{if(event.type==='messages'){const label=event.messages.findLast(m=>m.activity)?.activity;if(label)labels.push(label);}emit(event);};
  client.fetch=async()=>stream([
    {type:'response.in_progress'},
    {type:'response.output_item.added',item:{id:'r',type:'reasoning'}},
    {type:'response.web_search_call.searching',item_id:'web'},
    {type:'response.web_search_call.completed',item_id:'web'},
    {type:'response.output_item.done',item:{id:'r',type:'reasoning'}},
    {type:'response.output_text.delta',delta:'done'},
    {type:'response.completed'},
  ]);
  const result=await client.send('work'); assert.equal(result.error,null);
  assert.ok(labels.includes('추론 중')&&labels.includes('웹 검색 중')&&labels.includes('답변 작성 중'));
  assert.equal(result.messages.at(-1).activity,'응답 완료'); assert.equal((await client.storage.history(profile.id)).at(-1).activity,'응답 완료');
});
