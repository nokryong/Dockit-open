const fs = require('node:fs/promises');
const path = require('node:path');
const { deflateSync } = require('node:zlib');
function fixturePng() {
  const chunk = (type, bytes) => {
    const body = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(64, 0); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(64 * (64 * 3 + 1));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const offset = y * 193 + 1 + x * 3; pixels[offset] = 40 + x * 3; pixels[offset + 1] = 100 + y * 2; pixels[offset + 2] = 190; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const png = fixturePng();

function createFixture() {
  const state = { mode: 'success', account: 'one', calls: [], turns: 0, logins: 0, opened: 0, transports: [] };
  const createTransport = options => {
    const transport = { closed: false, threads: new Map(),
      write() {},
      async request(method, params = {}) {
        state.calls.push({ method, params });
        const event = (name, data) => options.notify(name, data);
        if (method === 'initialize') return {};
        if (method === 'skills/extraRoots/set') return {};
        if (method === 'account/read') {
          const exists = await fs.stat(path.join(options.home, 'auth.json')).then(() => true, () => false);
          return { account: exists ? { type: 'chatgpt', email: `${state.account}@example.invalid`, planType: 'plus' } : null };
        }
        if (method === 'account/login/start') {
          const loginId = `login-${++state.logins}`;
          if (state.mode !== 'hold-login') setTimeout(async () => {
            await fs.writeFile(path.join(options.home, 'auth.json'), JSON.stringify({ tokens: { account_id: state.account, access_token: 'fixture-secret' } }));
            event('account/login/completed', { loginId, success: true });
            event('account/updated', { authMode: 'chatgpt' });
          }, 50);
          return { type: 'chatgpt', loginId, authUrl: 'https://auth.openai.com/oauth/authorize?fixture=1' };
        }
        if (method === 'account/login/cancel') { event('account/login/completed', { loginId: params.loginId, success: false }); return {}; }
        if (method === 'account/logout') { await fs.unlink(path.join(options.home, 'auth.json')).catch(() => {}); event('account/updated', { authMode: null }); return {}; }
        if (method === 'model/list') return { data: [{ model: 'fixture-codex', displayName: 'Codex 테스트 모델', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Low' }, { reasoningEffort: 'high', description: 'High' }], defaultReasoningEffort: 'low', serviceTiers: [{ id: 'priority', name: 'Fast' }] }], nextCursor: null };
        if (method === 'config/read') return { config: { service_tier: state.serviceTier || 'default' } };
        if (method === 'account/rateLimits/read') {
          if (state.mode === 'usage-failed') throw new Error('fixture-secret must not escape');
          return { rateLimitsByLimitId: { codex: { primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1792200000 }, secondary: { usedPercent: 35, windowDurationMins: 10080, resetsAt: 1792700000 } } } };
        }
        if (method === 'thread/start') {
          const id = `thread-${transport.threads.size + 1}`;
          transport.threads.set(id, params); return { thread: { id } };
        }
        if (method === 'thread/resume') { transport.threads.set(params.threadId, params); return { thread: { id: params.threadId } }; }
        if (method === 'turn/start') {
          const id = `turn-${++state.turns}`, threadId = params.threadId;
          const image = transport.threads.get(threadId).developerInstructions.startsWith('Generate');
          const mode = state.mode;
          setTimeout(() => {
            event('turn/started', { threadId, turn: { id } });
            if (mode === 'hold-turn') return;
            if (mode === 'fail-turn') { event('turn/completed', { threadId, turn: { id, status: 'failed', error: { message: 'fixture-secret' } } }); return; }
            if (image && mode !== 'no-image') {
              event('item/completed', { threadId, turnId: id, item: { id: 'image-1', type: 'imageGeneration', status: 'completed', result: png } });
              if (mode === 'multiple-images') event('item/completed', { threadId, turnId: id, item: { id: 'image-2', type: 'imageGeneration', status: 'completed', result: png } });
            }
            event('item/agentMessage/delta', { threadId, turnId: id, itemId: 'text-1', delta: image ? '이미지를 생성했습니다.' : 'CLI 대화 테스트 응답입니다.' });
            event('item/completed', { threadId, turnId: id, item: { id: 'text-1', type: 'agentMessage', text: image ? '이미지를 생성했습니다.' : 'CLI 대화 테스트 응답입니다.' } });
            event('turn/completed', { threadId, turn: { id, status: 'completed' } });
          }, 50);
          return { turn: { id, status: 'inProgress' } };
        }
        if (method === 'turn/interrupt') { event('turn/completed', { threadId: params.threadId, turn: { id: params.turnId, status: 'interrupted' } }); return {}; }
        throw new Error('Unexpected method ' + method);
      },
      dispose() { if (!this.closed) { this.closed = true; options.exited(); } }
    };
    state.transports.push(transport); return transport;
  };
  return { state, createTransport, resolveCommand: async () => 'fixture-codex', openExternal: async url => { if (new URL(url).origin !== 'https://auth.openai.com') throw new Error('Unexpected URL'); state.opened++; } };
}
module.exports = { createFixture, png };
