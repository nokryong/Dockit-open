const { t: uiText } = require('./i18n.cjs');
const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const fail = (message, code) => Object.assign(new Error(message), { code, dockit: true });
const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 리스너는 명시적인 로그인 시도 때만 열고 LAN 인터페이스에는 연결하지 않음
async function beginAuthorization({
  hostId,
  profile,
  consent,
  openExternal,
  signal,
  onRegistration,
  exchange,
  verify
}) {
  const state = random(),
    nonce = random(),
    verifier = random();
  let settle,
    reject,
    timer,
    settled = false,
    callbackReceived = false;
  const result = new Promise((resolve, failAttempt) => {
    settle = resolve;
    reject = failAttempt;
  });
  // 브라우저 열기는 시간이 걸릴 수 있으므로 콜백이 거부하기 전에 처리기 연결
  result.catch(() => {});
  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    server.close();
    if (error) reject(error);
    else settle(value);
  };
  const abort = () => finish(fail(uiText('ChatGPT 연결을 취소했습니다.'), 'cancelled'));
  let redirect;
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let url;
    try {
      url = new URL(req.url, redirect);
    } catch {
      res.writeHead(400);
      res.end('Invalid request');
      return;
    }
    if (
      req.method !== 'GET' ||
      req.headers.host !== new URL(redirect).host ||
      url.origin !== new URL(redirect).origin ||
      url.pathname !== '/auth/callback'
    ) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    if (callbackReceived || !equal(url.searchParams.get('state'), state)) {
      res.writeHead(400);
      res.end('Invalid sign-in request. Return to Dockit Open.');
      return;
    }
    callbackReceived = true;
    const error = url.searchParams.get('error');
    if (error) {
      res.end(uiText('ChatGPT 연결이 취소되었습니다. Dockit Open으로 돌아가세요.'));
      finish(
        fail(
          error === 'access_denied'
            ? uiText('ChatGPT 연결을 허용하지 않았습니다.')
            : uiText('ChatGPT 로그인에 실패했습니다.'),
          error === 'access_denied' ? 'access_denied' : 'oauth_error'
        )
      );
      return;
    }
    const clientId = url.searchParams.get('client_id') || profile?.clientId;
    const code = url.searchParams.get('code');
    if (
      !code ||
      !clientId ||
      clientId === 'dynamic_agent_client' ||
      clientId.length > 256 ||
      (profile && clientId !== profile.clientId)
    ) {
      res.writeHead(400);
      res.end('Invalid registration. Return to Dockit Open.');
      finish(fail(uiText('ChatGPT 연결 정보가 일치하지 않습니다.'), 'invalid_registration'));
      return;
    }
    res.end(uiText('로그인을 확인하고 있습니다. Dockit Open으로 돌아가세요.'));
    finish(null, { code, clientId });
  });
  server.on('error', error => finish(fail(uiText('ChatGPT 로그인용 로컬 연결을 열 수 없습니다.'), error.code)));
  await new Promise((resolve, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectListen);
      resolve();
    });
  });
  redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
  timer = setTimeout(
    () => finish(fail(uiText('로그인 시간이 지났습니다. 다시 연결해주세요.'), 'login_timeout')),
    5 * 60_000
  );
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const url = new URL(`${ISSUER}/api/accounts/authorize`);
  const params = {
    client_id: profile?.clientId || 'dynamic_agent_client',
    ext_agent_host_id: hostId,
    response_type: 'code',
    redirect_uri: redirect,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url')
  };
  if (!profile) params.agent_name_hint = 'Dockit Open';
  if (profile?.tokens?.id_token) params.id_token_hint = profile.tokens.id_token;
  if (profile?.identity?.email) params.login_hint = profile.identity.email;
  if (consent) params.prompt = 'consent';
  url.search = new URLSearchParams(params).toString();
  try {
    if (signal?.aborted) throw fail(uiText('ChatGPT 연결을 취소했습니다.'), 'cancelled');
    await openExternal(url.href);
    const callback = await result;
    if (signal?.aborted) throw fail(uiText('ChatGPT 연결을 취소했습니다.'), 'cancelled');
    await onRegistration(callback.clientId);
    const tokens = await exchange(
      {
        grant_type: 'authorization_code',
        client_id: callback.clientId,
        code: callback.code,
        code_verifier: verifier,
        redirect_uri: redirect,
        resource: RESOURCE
      },
      signal
    );
    const identity = await verify(tokens.id_token, callback.clientId, nonce);
    if (profile?.identity && (identity.sub !== profile.identity.sub || identity.iss !== profile.identity.iss))
      throw fail(uiText('선택한 ChatGPT 계정과 로그인한 계정이 다릅니다.'), 'identity_mismatch');
    if (signal?.aborted) throw fail(uiText('ChatGPT 연결을 취소했습니다.'), 'cancelled');
    return { tokens, identity, clientId: callback.clientId };
  } finally {
    finish(fail(uiText('ChatGPT 연결을 종료했습니다.'), 'cancelled'));
    server.closeAllConnections();
  }
}

function createIdentityVerifier(keySet) {
  let keys = keySet;
  return async (token, clientId, nonce) => {
    if (typeof token !== 'string' || !token)
      throw fail(uiText('ChatGPT 계정 인증 정보가 없습니다.'), 'invalid_identity');
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    keys ||= createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), { timeoutDuration: 15_000 });
    const { payload } = await jwtVerify(token, keys, {
      issuer: ISSUER,
      audience: clientId,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub'],
      clockTolerance: 30
    });
    if (typeof payload.sub !== 'string' || !payload.sub || (nonce !== undefined && !equal(payload.nonce, nonce)))
      throw fail(uiText('ChatGPT 계정을 확인하지 못했습니다.'), 'invalid_identity');
    return {
      iss: payload.iss,
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : ''
    };
  };
}
module.exports = { beginAuthorization, createIdentityVerifier, ISSUER, RESOURCE, fail };
