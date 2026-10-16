const { ChatActivity } = require('./chat-activity.cjs');
const { randomUUID } = require('node:crypto');
const { ChatGPTStorage } = require('./chatgpt-storage.cjs');
const { ChatAttachments, metadata, CHATGPT_MAX_FILE_BYTES } = require('./chat-attachments.cjs');
const { beginAuthorization, createIdentityVerifier, ISSUER, RESOURCE, fail } = require('./chatgpt-oauth.cjs');

const USAGE_URL = 'https://chatgpt.com/settings/usage';
const TERMINAL_REFRESH = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);
const FRIENDLY = {
  subscription_sharing_usage_limit_exceeded: ['ChatGPT 사용 한도에 도달했습니다. 사용량 관리에서 한도를 확인해주세요.', 'usage'],
  subscription_sharing_usage_unavailable: ['ChatGPT 사용 가능량을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 'retry'],
  subscription_sharing_user_not_eligible: ['이 계정 또는 워크스페이스에서는 ChatGPT 요금제를 사용할 수 없습니다.', 'usage'],
  subscription_sharing_user_unavailable: ['ChatGPT 계정을 일시적으로 확인할 수 없습니다. 잠시 후 다시 시도해주세요.', 'retry'],
  subscription_sharing_unsupported_capability: ['선택한 모델에서 이 요청을 지원하지 않습니다.', 'models'],
  subscription_sharing_route_not_supported: ['이 ChatGPT 연결에서 요청을 지원하지 않습니다.', 'none'],
  subscription_sharing_invalid_user: ['ChatGPT 계정 인증을 확인하지 못했습니다. 연결 상태를 확인해주세요.', 'signin'],
  chatpass_v2_scope_not_authorized: ['ChatGPT 요금제 사용 권한을 확인해주세요.', 'consent'],
  chatpass_v2_invalid_authorization_context: ['ChatGPT 요금제 사용 권한을 확인해주세요.', 'consent']
};
function serviceError(body, status, requestId) {
  const rawCode = typeof body?.error === 'string' ? body.error : body?.error?.code;
  const code = typeof rawCode === 'string' && /^[a-z0-9_]{1,100}$/i.test(rawCode) ? rawCode : 'request_failed';
  const [message, action] = FRIENDLY[code] || (status === 401 ? ['ChatGPT 인증을 확인하지 못했습니다. 다시 연결해주세요.', 'signin'] : status === 403 ? ['ChatGPT 계정 또는 지역 정책에 따라 요청이 허용되지 않았습니다.', 'none'] : status === 429 ? ['요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 'retry'] : ['ChatGPT 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.', 'retry']);
  return Object.assign(fail(message, code), { detail: { action, status, requestId: typeof requestId === 'string' && /^[\w-]{1,200}$/.test(requestId) ? requestId : undefined } });
}
function safeFailure(error) {
  if (error?.name === 'AbortError' || error?.code === 'cancelled') return { message: '요청을 취소했습니다.', code: 'cancelled' };
  if (error?.name === 'TimeoutError') return { message: 'ChatGPT 응답 시간이 지났습니다. 다시 시도해주세요.', code: 'timeout', detail: { action: 'retry' } };
  if (error?.code?.startsWith('ERR_JWT') || error?.code?.startsWith('ERR_JWS') || error?.code?.startsWith('ERR_JWKS') || error?.code?.startsWith('ERR_JOSE')) return { message: 'ChatGPT 계정 인증을 검증하지 못했습니다. 잠시 후 다시 시도해주세요.', code: 'identity_verification_failed' };
  // Only app-authored messages cross IPC. Network/SDK exceptions can contain request data.
  if (error?.message && /[가-힣]/.test(error.message)) return { message: error.message, code: error.code, detail: error.detail };
  return { message: 'ChatGPT에 연결하지 못했습니다. 네트워크 연결을 확인해주세요.', code: 'connection_failed', detail: { action: 'retry' } };
}

class ChatGPTClient {
  constructor({ root, encryption, openExternal, emit = () => {}, fetchImpl = globalThis.fetch, verify = createIdentityVerifier() }) {
    this.storage = new ChatGPTStorage(root, encryption);
    this.attachments = new ChatAttachments(root, 'chatgpt');
    this.openExternal = openExternal;
    this.emit = emit;
    this.fetch = fetchImpl;
    this.verify = verify;
    this.models = new Map();
    this.refreshes = new Map();
    this.persistTail = Promise.resolve();
    this.ready = this.storage.init().then(state => { this.state = state; });
    this.ready.catch(() => {});
  }
  async save() {
    const next = this.persistTail.then(() => this.storage.save(this.state));
    this.persistTail = next.catch(() => {});
    await next;
  }
  active() { return this.state.profiles.find(p => p.id === this.state.activeId); }
  sharing(profile) { return Boolean(profile?.tokens?.access_token && !profile.pendingTokens && profile.scopes?.includes('chatgpt.tokens.use.direct')); }
  async status() {
    await this.ready;
    const profiles = this.state.profiles.map(p => ({ id: p.id, label: p.label, email: p.identity?.email || '', connected: Boolean(p.tokens?.access_token || p.pendingTokens), sharing: this.sharing(p), model: p.model || '', reasoningEffort: p.reasoningEffort ?? this.models.get(p.id)?.find(model => model.slug === p.model)?.defaultReasoningEffort ?? null, serviceTier: p.serviceTier ?? this.models.get(p.id)?.find(model => model.slug === p.model)?.defaultServiceTier ?? 'default', welcomeSeen: Boolean(p.welcomeSeen) }));
    return { profiles, active: profiles.find(p => p.id === this.state.activeId) || null, signingIn: Boolean(this.authorization), streaming: Boolean(this.running) };
  }
  changed() { this.emit({ type: 'state' }); }
  idle() { if (this.authorization || this.running || this.accountOperation) throw fail('진행 중인 ChatGPT 요청을 먼저 마쳐주세요.', 'busy'); }
  async request(url, options = {}, signal, timeout = 30_000) {
    const signals = [AbortSignal.timeout(timeout)];
    if (signal) signals.push(signal);
    return this.fetch(url, { ...options, signal: AbortSignal.any(signals), redirect: 'error' });
  }
  async json(url, options, signal) {
    const response = await this.request(url, options, signal);
    let body;
    try { body = await response.json(); } catch { throw serviceError(null, response.status); }
    if (!response.ok) throw serviceError(body, response.status, response.headers.get('x-request-id'));
    return body;
  }
  tokenRequest(fields, signal) {
    return this.json(`${ISSUER}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }, signal);
  }
  applyTokens(profile, tokens, previousScopes = []) {
    if (typeof tokens.access_token !== 'string' || !tokens.access_token || (tokens.token_type && tokens.token_type.toLowerCase() !== 'bearer') || !Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0) throw fail('ChatGPT 인증 응답이 올바르지 않습니다.', 'invalid_tokens');
    profile.tokens = { access_token: tokens.access_token, refresh_token: tokens.refresh_token || profile.tokens?.refresh_token, id_token: tokens.id_token || profile.tokens?.id_token };
    profile.scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : previousScopes;
    profile.expiresAt = Date.now() + Number(tokens.expires_in) * 1000;
  }
  async signIn({ profileId, newProfile = false, consent = false } = {}) {
    await this.ready; this.idle(); this.storage.requireEncryption();
    let profile = newProfile ? undefined : this.state.profiles.find(p => p.id === (profileId || this.state.activeId || this.state.pendingProfileId));
    if (profileId && !profile) throw fail('ChatGPT 계정을 찾을 수 없습니다.', 'unknown_profile');
    const previous = profile;
    const controller = new AbortController();
    this.authorization = controller;
    this.changed();
    try {
      await this.refreshes.get(profile?.id)?.catch(() => {});
      const result = await beginAuthorization({
        hostId: this.storage.hostId, profile: previous, consent: Boolean(consent), openExternal: this.openExternal, signal: controller.signal,
        exchange: (fields, signal) => this.tokenRequest(fields, signal), verify: this.verify,
        onRegistration: async clientId => {
          if (!profile) {
            profile = { id: randomUUID(), clientId, label: `ChatGPT ${this.state.profiles.length + 1}` };
            this.state.profiles.push(profile);
            if (!this.state.activeId) this.state.pendingProfileId = profile.id;
            // Retain a new registration even if its one-time code exchange fails.
            await this.save();
          }
        }
      });
      this.applyTokens(profile, result.tokens);
      profile.welcomeSeen ||= this.state.profiles.some(p => p.welcomeSeen && p.identity?.iss === result.identity.iss && p.identity?.sub === result.identity.sub);
      profile.identity = result.identity;
      profile.label = `${result.identity.email || result.identity.name || 'ChatGPT'} · ${profile.id.slice(0, 6)}`;
      delete profile.pendingTokens;
      this.state.activeId = profile.id;
      if (this.state.pendingProfileId === profile.id) delete this.state.pendingProfileId;
      this.models.delete(profile.id);
      await this.save();
    } finally { this.authorization = null; this.changed(); }
    return this.status();
  }
  cancelSignIn() { this.authorization?.abort(); }
  async selectProfile(id) {
    await this.ready; this.idle();
    if (!this.state.profiles.some(p => p.id === id)) throw fail('ChatGPT 계정을 찾을 수 없습니다.', 'unknown_profile');
    this.state.activeId = id;
    this.models.delete(id);
    await this.save(); this.changed();
    return this.status();
  }
  async verifyPending(profile) {
    if (!profile.pendingTokens) return;
    const pending = profile.pendingTokens;
    if (pending.tokens.id_token) {
      const identity = await this.verify(pending.tokens.id_token, profile.clientId);
      if (identity.sub !== profile.identity?.sub || identity.iss !== profile.identity?.iss) {
        delete profile.tokens; delete profile.pendingTokens; await this.save(); this.changed();
        throw fail('갱신된 ChatGPT 계정이 일치하지 않습니다. 다시 연결해주세요.', 'identity_mismatch');
      }
      profile.identity = identity;
    }
    this.applyTokens(profile, pending.tokens, profile.scopes);
    profile.expiresAt = pending.expiresAt;
    delete profile.pendingTokens;
    await this.save(); this.changed();
  }
  async access(profile) {
    if (!profile) throw fail('설정에서 ChatGPT를 연결해주세요.', 'sign_in_required');
    if (!this.refreshes.has(profile.id)) {
      this.refreshes.set(profile.id, this.refresh(profile).finally(() => { this.refreshes.delete(profile.id); }));
    }
    return this.refreshes.get(profile.id);
  }
  async refresh(profile) {
    await this.verifyPending(profile);
    if (!profile.tokens?.access_token) throw fail('ChatGPT에 다시 연결해주세요.', 'sign_in_required');
    if (profile.expiresAt > Date.now() + 60_000) return profile.tokens.access_token;
    if (!profile.tokens.refresh_token) throw fail('ChatGPT 연결이 만료되었습니다. 다시 연결해주세요.', 'sign_in_required');
    try {
      const tokens = await this.tokenRequest({ grant_type: 'refresh_token', client_id: profile.clientId, refresh_token: profile.tokens.refresh_token, resource: RESOURCE });
      // Persist rotated credentials before JWKS validation; never consume the old refresh token twice.
      profile.pendingTokens = { tokens, expiresAt: Date.now() + Number(tokens.expires_in) * 1000 };
      await this.save();
      await this.verifyPending(profile);
      return profile.tokens.access_token;
    } catch (error) {
      if (TERMINAL_REFRESH.has(error.code)) { delete profile.tokens; delete profile.pendingTokens; await this.save(); this.changed(); throw fail('ChatGPT 연결이 만료되었습니다. 다시 연결해주세요.', 'sign_in_required'); }
      throw error;
    }
  }
  async listModels() {
    await this.ready;
    if (this.authorization || this.accountOperation) return [];
    const profile = this.active();
    if (!profile?.tokens && !profile?.pendingTokens) return [];
    const token = await this.access(profile);
    if (!this.sharing(profile)) return [];
    const body = await this.json(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` } });
    const models = (Array.isArray(body.models) ? body.models : []).filter(m => m.visibility === 'list' && typeof m.slug === 'string' && typeof m.display_name === 'string').map(m => ({ slug: m.slug, name: m.display_name, supportedReasoningEfforts: (m.supported_reasoning_levels ?? m.supported_reasoning_efforts ?? m.supportedReasoningEfforts ?? []).map(option => typeof option === 'string' ? { effort: option } : { ...option, effort: option.reasoningEffort ?? option.effort }), defaultReasoningEffort: m.default_reasoning_level ?? m.default_reasoning_effort ?? m.defaultReasoningEffort ?? null, serviceTiers: m.service_tiers ?? m.serviceTiers ?? (m.additional_speed_tiers || []).filter(tier => tier === "fast").map(() => ({ id: "priority", name: "Fast" })), defaultServiceTier: m.default_service_tier ?? m.defaultServiceTier ?? null }));
    this.models.set(profile.id, models);
    if (!models.some(m => m.slug === profile.model)) { profile.model = models[0]?.slug || ''; profile.reasoningEffort = null; await this.save(); this.changed(); }
    return models;
  }
  async selectModel(slug) {
    await this.ready; this.idle();
    const profile = this.active();
    if (!this.models.get(profile?.id)?.some(m => m.slug === slug)) throw fail('사용 가능한 모델을 선택해주세요.', 'invalid_model');
    if (profile.model !== slug) profile.reasoningEffort = null;
    profile.model = slug;
    if (profile.serviceTier === "priority" && !this.models.get(profile.id).find(model => model.slug === slug)?.serviceTiers?.some(tier => tier.id === "priority" || tier.id === "fast")) profile.serviceTier = "default";
    await this.save(); this.changed();
  }
  async selectReasoningEffort(effort) {
    await this.ready; this.idle();
    const profile = this.active();
    const model = this.models.get(profile?.id)?.find(model => model.slug === profile.model);
    if (!model) throw fail('사용 가능한 모델을 먼저 선택해주세요.', 'invalid_model');
    if (effort !== null && (typeof effort !== 'string' || !(model?.supportedReasoningEfforts?.length ? model.supportedReasoningEfforts.some(option => (typeof option === 'string' ? option : option.effort) === effort) : /^(none|minimal|low|medium|high|xhigh|max|ultra)$/.test(effort)))) throw fail('지원하지 않는 추론 강도입니다.', 'invalid_reasoning_effort');
    profile.reasoningEffort = effort; await this.save(); this.changed();
  }
  async selectServiceTier(tier) {
    await this.ready; this.idle();
    const profile = this.active();
    const model = this.models.get(profile?.id)?.find(model => model.slug === profile.model);
    if (!model) throw fail("사용 가능한 모델을 먼저 선택해주세요.", "invalid_model");
    if (tier !== "default" && (tier !== "priority" || !model.serviceTiers?.some(option => option.id === "priority" || option.id === "fast"))) throw fail("이 모델은 Fast 모드를 지원하지 않습니다.", "invalid_service_tier");
    profile.serviceTier = tier; await this.save(); this.changed();
  }
  async acknowledge() {
    await this.ready;
    const profile = this.active();
    if (this.sharing(profile)) { profile.welcomeSeen = true; await this.save(); this.changed(); }
  }
  async openUsage() { await this.openExternal(USAGE_URL); }
  async signOut() {
    await this.ready;
    if (this.authorization || this.accountOperation) throw fail('진행 중인 ChatGPT 연결을 먼저 마쳐주세요.', 'busy');
    const profile = this.active();
    if (!profile) return { revocationConfirmed: true };
    this.accountOperation = true;
    let confirmed = false;
    try {
      this.cancelResponse();
      await this.running?.catch(() => {});
      await this.refreshes.get(profile.id)?.catch(() => {});
      const refreshToken = profile.pendingTokens?.tokens.refresh_token || profile.tokens?.refresh_token;
      if (refreshToken) {
        try {
          const discovery = await this.json(`${ISSUER}/.well-known/openid-configuration`);
          const endpoint = new URL(discovery.revocation_endpoint);
          if (endpoint.origin !== ISSUER || endpoint.username || endpoint.password) throw new Error('Invalid endpoint');
          for (let attempt = 0; attempt < 2 && !confirmed; attempt++) {
            try {
              const response = await this.request(endpoint.href, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: profile.clientId }).toString() }, undefined, 10_000);
              confirmed = response.status === 200;
              if (response.status < 500) break;
            } catch { /* Bounded retry, then report unconfirmed remote revocation. */ }
            if (!confirmed && attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch { /* Still clear local credentials, with a visible warning. */ }
      } else confirmed = !profile.tokens?.access_token && !profile.pendingTokens;
      delete profile.tokens; delete profile.pendingTokens; delete profile.expiresAt;
      profile.scopes = [];
      this.state.profiles = this.state.profiles.filter(saved => saved.id !== profile.id);
      this.state.activeId = null;
      if (this.state.pendingProfileId === profile.id) delete this.state.pendingProfileId;
      this.models.delete(profile.id);
      await this.save();
      return { revocationConfirmed: confirmed };
    } finally { this.accountOperation = false; this.changed(); }
  }
  async history() { await this.ready; return this.active() ? this.storage.history(this.active().id) : []; }
  async clearHistory() { await this.ready; this.idle(); if (this.active()) await this.storage.saveHistory(this.active().id, []); }
  cancelResponse() { this.responseController?.abort(); }
  async attachFiles(paths) {
    await this.ready; this.idle();
    const profile = this.active();
    if (!this.sharing(profile)) throw fail('설정에서 ChatGPT를 연결해주세요.', 'sign_in_required');
    return this.attachments.add(profile.id, paths);
  }
  async send(text, attachments = []) {
    await this.ready; this.idle();
    if (typeof text !== 'string' || (!text.trim() && !attachments?.length) || text.length > 32000) throw fail('메시지는 1~32,000자로 입력하거나 파일을 첨부해주세요.', 'invalid_input');
    const profile = this.active();
    if (!profile) throw fail('설정에서 ChatGPT를 연결해주세요.', 'sign_in_required');
    const files = await this.attachments.read(profile.id, attachments);
    this.idle();
    if (this.active()?.id !== profile.id) throw fail('계정이 변경됐습니다. 파일을 다시 첨부해주세요.', 'account_changed');
    const controller = new AbortController();
    this.responseController = controller;
    this.running = this.runResponse(profile, text.trim(), controller.signal, files.map(metadata));
    this.changed();
    try { return await this.running; }
    finally { this.running = null; this.responseController = null; this.changed(); }
  }
  async runResponse(profile, text, signal, attachments = []) {
    const token = await this.access(profile);
    if (!this.sharing(profile)) throw fail('설정에서 ChatGPT 요금제 사용을 허용해주세요.', 'consent_required');
    if (!this.models.get(profile.id)?.some(m => m.slug === profile.model)) throw fail('사용 가능한 모델을 먼저 선택해주세요.', 'invalid_model');
    const messages = await this.storage.history(profile.id);
    const history = messages.filter(m => m.status === 'completed');
    if (messages.length >= 200 || history.reduce((n, m) => n + m.text.length, 0) + text.length > 256000) throw fail('대화가 길어졌습니다. 새 대화를 시작해주세요.', 'history_limit');
    const user = { id: randomUUID(), role: 'user', text, status: 'pending', ...(attachments.length ? { attachments } : {}) };
    const answer = { id: randomUUID(), role: 'assistant', text: '', status: 'pending', activity: '응답 준비 중' };
    const activity = new ChatActivity();
    const updateActivity = label => {
      if (answer.activity === label) return;
      answer.activity = label; this.emit({ type: "messages", profileId: profile.id, messages });
    };
    messages.push(user, answer);
    await this.storage.saveHistory(profile.id, messages);
    this.emit({ type: 'messages', profileId: profile.id, messages });
    let reader;
    try {
      const context = [...history, user];
      if (context.reduce((total, message) => total + (message.attachments || []).reduce((size, file) => size + (file.kind === 'image' ? 0 : file.size), 0), 0) > CHATGPT_MAX_FILE_BYTES) throw fail('이번 요청에 포함되는 문서·텍스트 첨부 파일이 50MB를 넘었습니다. 새 대화를 시작해주세요.', 'history_limit');
      const input = await Promise.all(context.map(message => this.attachments.responseMessage(profile.id, message)));
      const reasoningEffort = profile.reasoningEffort ?? this.models.get(profile.id)?.find(model => model.slug === profile.model)?.defaultReasoningEffort;
      const response = await this.request(`${RESOURCE}/responses`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: profile.model, service_tier: profile.serviceTier ?? this.models.get(profile.id)?.find(model => model.slug === profile.model)?.defaultServiceTier ?? "default", ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}), instructions: 'You are a helpful assistant in Dockit Open. Respond in the user\'s language. You receive this chat and the files explicitly attached by the user. Do not claim access to other local documents or files.', input, store: false, stream: true })
      }, signal, 180_000);
      if (!response.ok) throw serviceError(await response.json().catch(() => null), response.status, response.headers.get('x-request-id'));
      if (!response.body) throw fail('ChatGPT 응답을 읽을 수 없습니다.', 'empty_response');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', completed = false, lastEmission = 0;
      const processEvent = frame => {
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') return;
        let event;
        try { event = JSON.parse(data); } catch { throw fail('ChatGPT 응답 형식이 올바르지 않습니다.', 'invalid_stream'); }
        if (event.type === 'response.created' || event.type === 'response.in_progress') updateActivity(activity.processing());
        if (event.type === 'response.output_item.added') updateActivity(activity.start(event.item?.id, event.item?.type));
        if (event.type === 'response.output_item.done') updateActivity(activity.finish(event.item?.id));
        const stage = /^response\.(web_search_call|file_search_call|image_generation_call|code_interpreter_call|mcp_call)\.(in_progress|searching|generating|interpreting|completed|failed)$/.exec(event.type);
        if (stage) updateActivity(stage[2] === 'completed' || stage[2] === 'failed' ? activity.finish(event.item_id) : activity.start(event.item_id, stage[1]));
        if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') updateActivity(activity.start(event.item_id, 'reasoning'));
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          updateActivity(activity.writing());
          answer.text += event.delta;
          if (answer.text.length > 256000) throw fail('ChatGPT 응답이 너무 깁니다.', 'response_too_large');
          if (Date.now() - lastEmission > 35) { this.emit({ type: 'messages', profileId: profile.id, messages }); lastEmission = Date.now(); }
        }
        if (event.type === 'response.failed' || event.type === 'error') throw serviceError({ error: event.response?.error || event.error || event }, response.status, response.headers.get('x-request-id'));
        if (event.type === 'response.incomplete') throw fail('ChatGPT 응답이 끝까지 완료되지 않았습니다.', 'incomplete_response');
        if (event.type === 'response.completed') completed = true;
      };
      while (!completed) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) { const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); processEvent(frame); }
        if (buffer.length > 2 * 1024 * 1024) throw fail('ChatGPT 응답이 너무 큽니다.', 'response_too_large');
        if (done) { if (buffer.trim()) processEvent(buffer); break; }
      }
      if (!completed || !answer.text.trim()) throw fail('ChatGPT 응답이 완료되지 않았습니다. 다시 시도해주세요.', 'incomplete_response');
      user.status = answer.status = 'completed';
    } catch (error) {
      user.status = answer.status = signal.aborted ? 'cancelled' : 'failed';
      answer.error = safeFailure(error);
    } finally {
      answer.activity = activity.complete(answer.status === 'completed' ? 'completed' : signal.aborted ? 'cancelled' : 'failed');
      await reader?.cancel().catch(() => {});
      await this.storage.saveHistory(profile.id, messages);
      this.emit({ type: 'messages', profileId: profile.id, messages });
    }
    return { messages, error: answer.error || null };
  }
  async dispose() {
    this.cancelSignIn(); this.cancelResponse();
    await this.running?.catch(() => {});
    await Promise.allSettled([...this.refreshes.values()]);
    await this.persistTail;
  }
}
module.exports = { ChatGPTClient, safeFailure, serviceError };
