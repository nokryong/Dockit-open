// Loaded explicitly by the Electron test runner, never imported by the application.
const { generateKeyPairSync } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { ChatGPTClient } = require('../../electron/chatgpt-client.cjs');
const { ISSUER } = require('../../electron/chatgpt-oauth.cjs');
let state;
async function install({ shell }) {
  const jose = await import(pathToFileURL(require.resolve('jose')).href);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
  const nativeFetch = globalThis.fetch;
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  state = { mode: 'success', registrations: 0, inferences: 0, openedUsage: 0, authorization: null };
  const fakeFetch = async (url, options = {}) => {
    url = String(url);
    if (url === `${ISSUER}/.well-known/jwks.json`) return response({ keys: [jwk] });
    if (url === `${ISSUER}/.well-known/openid-configuration`) return response({ revocation_endpoint: `${ISSUER}/fixture/revoke` });
    if (url === `${ISSUER}/fixture/revoke`) return new Response(null, { status: 200 });
    if (url === `${ISSUER}/api/accounts/oauth/token`) {
      const params = new URLSearchParams(options.body);
      const idToken = await new jose.SignJWT({ sub: 'fixture-user', email: 'dockit-test@example.invalid', name: 'Dockit Test', nonce: state.authorization?.searchParams.get('nonce') }).setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).setIssuer(ISSUER).setAudience(params.get('client_id')).setIssuedAt().setExpirationTime('1h').sign(privateKey);
      return response({ access_token: 'fixture-access-only', refresh_token: 'fixture-refresh-only', id_token: idToken, expires_in: 3600, token_type: 'Bearer', scope: state.mode === 'identity-only' ? 'openid profile email' : 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct' });
    }
    if (url === 'https://api.openai.com/v1/models') return response({ models: [{ slug: 'fixture-model', display_name: '테스트 모델', visibility: 'list' }] });
    if (url === 'https://api.openai.com/v1/responses') {
      state.inferences++;
      const mode = state.mode;
      const events = [{ type: 'response.output_text.delta', delta: '안녕하세요. 연결 테스트 응답입니다.' }, mode === 'usage-limit' ? { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } } : { type: 'response.completed' }];
      let timer;
      return new Response(new ReadableStream({
        start(controller) {
          const send = () => {
            if (options.signal?.aborted) { controller.error(new DOMException('Aborted', 'AbortError')); return; }
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(events.shift())}\n\n`));
            if (events.length) timer = setTimeout(send, 100); else controller.close();
          };
          timer = setTimeout(send, 40);
        }, cancel() { clearTimeout(timer); }
      }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.startsWith('http://127.0.0.1:')) return nativeFetch(url, options);
    throw new Error('Unexpected test request');
  };
  globalThis.fetch = fakeFetch;
  ChatGPTClient.prototype.request = function (url, options, signal) { return fakeFetch(url, { ...options, signal }); };
  shell.openExternal = async value => {
    if (value === 'https://chatgpt.com/settings/usage') { state.openedUsage++; return; }
    const auth = new URL(value);
    if (auth.origin !== ISSUER) throw new Error('Unexpected external URL');
    state.authorization = auth;
    if (state.mode === 'hold') return;
    const callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', auth.searchParams.get('state'));
    if (state.mode === 'denied') callback.searchParams.set('error', 'access_denied');
    else {
      callback.searchParams.set('code', 'fixture-code');
      if (auth.searchParams.get('client_id') === 'dynamic_agent_client') callback.searchParams.set('client_id', `oaiapp_fixture_${++state.registrations}`);
    }
    await nativeFetch(callback);
  };
}
function mode(value) { state.mode = value; }
function stats() { return { mode: state.mode, registrations: state.registrations, inferences: state.inferences, openedUsage: state.openedUsage, authOrigin: state.authorization?.origin, authPath: state.authorization?.pathname }; }
module.exports = { install, mode, stats };
