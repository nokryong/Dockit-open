const { t: uiText } = require('./i18n.cjs');
const { ChatActivity } = require('./chat-activity.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { contained, atomicJson } = require('./local-store.cjs');
const { ChatAttachments, metadata, textContent } = require('./chat-attachments.cjs');
const { defaultCodexHome, readGlobalGuidance, sharedSkillRoots, skillReaderConfig } = require('./codex-guidance.cjs');
const { DOCUMENT_TOOLS } = require('./codex-documents.cjs');

const fail = (message, code = 'codex_failed') => Object.assign(new Error(message), { code, dockit: true });
const safeFailure = error =>
  error?.dockit
    ? { message: error.message, code: error.code }
    : {
        message: uiText('Codex 요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.'),
        code: 'codex_failed'
      };
const fresh = () => ({
  model: '',
  reasoningEffort: null,
  serviceTier: null,
  threads: {},
  documentToolsVersion: 1,
  chat: [],
  image: []
});
const MAX_IMAGE = 30 * 1024 * 1024;
function imageExtension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw fail(uiText('지원하지 않는 이미지 형식입니다.'), 'invalid_image');
}
async function findCodex(env = process.env) {
  const dirs = [...new Set((env.PATH || env.Path || '').split(path.delimiter).filter(Boolean))];
  if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'npm'));
  const platform = process.platform,
    arch = process.arch;
  for (const dir of dirs) {
    const candidates = platform === 'win32' ? [path.join(dir, 'codex.exe')] : [path.join(dir, 'codex')];
    if (platform === 'win32') {
      const pkg = path.join(dir, 'node_modules', '@openai', 'codex');
      const triple = `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`;
      for (const base of [
        path.join(pkg, 'node_modules', '@openai', `codex-win32-${arch}`),
        path.join(dir, 'node_modules', '@openai', `codex-win32-${arch}`),
        pkg
      ]) {
        for (const sub of ['bin', 'codex']) candidates.push(path.join(base, 'vendor', triple, sub, 'codex.exe'));
      }
    }
    for (const file of candidates) {
      try {
        if ((await fs.stat(file)).isFile()) return file;
      } catch {
        /* 다음 설치 위치 */
      }
    }
  }
  return null;
}
function childEnvironment(home, workspace, source = process.env) {
  const env = { ...source, CODEX_HOME: home, PWD: workspace };
  // 이 자식 프로세스는 자기 로그인만 사용 (API 키, SIWC 토큰, 부모 세션 정보를 물려받지 않음)
  const privateKeys = new Set([
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'OPENAI_BASE_URL',
    'ACCESS_TOKEN',
    'ELECTRON_RUN_AS_NODE',
    'CODEX_THREAD_ID',
    'CODEX_PARENT_THREAD_ID',
    'CODEX_SESSION_ID',
    'CODEX_INTERNAL_ORIGINATOR_OVERRIDE',
    'CODEX_APP_SERVER_URL',
    'CODEX_APP_SERVER_WS_URL'
  ]);
  for (const key of Object.keys(env)) {
    if (privateKeys.has(key.toUpperCase())) delete env[key];
  }
  return env;
}

class CodexTransport {
  constructor({ command, home, workspace, notify, exited, clientRequest, spawnImpl = spawn }) {
    this.pending = new Map();
    this.sequence = 0;
    this.buffer = '';
    this.closed = false;
    this.notify = notify;
    this.exited = exited;
    this.clientRequest = clientRequest;
    this.child = spawnImpl(
      command,
      [
        'app-server',
        '--listen',
        'stdio://',
        '-c',
        'cli_auth_credentials_store="file"',
        '-c',
        'features.shell_tool=false',
        '-c',
        'features.multi_agent=false'
      ],
      {
        cwd: workspace,
        env: childEnvironment(home, workspace),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      }
    );
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.read(chunk));
    this.child.stderr.on('data', () => {}); // 인증 정보가 담긴 진단은 노출하지 않고 비움
    this.child.stdin.on('error', () => this.stop());
    this.child.on('error', () => this.stop());
    this.child.on('exit', () => this.stop());
  }
  read(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 64 * 1024 * 1024) {
      this.dispose();
      return;
    }
    let end;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.dispose();
        return;
      }
      if (message.id !== undefined && !message.method) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error)
          pending.reject(fail(uiText('Codex 요청이 실패했습니다. CLI 연결과 사용 한도를 확인해주세요.'), 'rpc_failed'));
        else pending.resolve(message.result);
      } else if (message.id !== undefined) {
        if (message.method === 'item/tool/call' && this.clientRequest) {
          Promise.resolve()
            .then(() => this.clientRequest(message.params || {}))
            .then(result => {
              if (!this.closed) this.write({ id: message.id, result });
            })
            .catch(() => {
              if (!this.closed)
                this.write({
                  id: message.id,
                  result: {
                    success: false,
                    contentItems: [{ type: 'inputText', text: uiText('문서 작업을 완료하지 못했습니다.') }]
                  }
                });
            });
          continue;
        }
        // 문서 화면에서는 암묵적인 셸·파일 접근이나 무인 승인 금지
        if (/requestApproval$/.test(message.method)) this.write({ id: message.id, result: { decision: 'decline' } });
        else this.write({ id: message.id, error: { code: -32601, message: 'Unsupported client request' } });
      } else this.notify(message.method, message.params || {});
    }
  }
  write(message) {
    if (this.closed) throw fail(uiText('Codex 연결이 종료됐습니다. 다시 시도해주세요.'), 'disconnected');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}, timeout = 45_000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(fail(uiText('Codex 응답 시간이 지났습니다. 다시 시도해주세요.'), 'timeout'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(fail(uiText('Codex 연결이 종료됐습니다. 다시 시도해주세요.'), 'disconnected'));
    }
    this.pending.clear();
    this.exited();
  }
  dispose() {
    this.stop();
    this.child.kill();
  }
}

class CodexClient {
  constructor({
    root,
    openExternal,
    emit = () => {},
    resolveCommand = findCodex,
    createTransport = options => new CodexTransport(options),
    globalHome = defaultCodexHome(),
    documents
  }) {
    this.root = root;
    this.home = path.join(root, 'codex');
    this.workspace = root;
    this.documents = documents;
    this.attachments = new ChatAttachments(root, 'codex');
    this.globalHome = globalHome;
    this.skillRoots = [];
    this.dataRoot = path.join(root, 'ai', 'codex');
    this.openExternal = openExternal;
    this.emit = emit;
    this.resolveCommand = resolveCommand;
    this.createTransport = createTransport;
    this.account = null;
    this.key = null;
    this.data = fresh();
    this.models = [];
    this.usage = null;
    this.runs = new Map();
    this.loaded = new Set();
    this.persistTail = Promise.resolve();
    this.ready = this.init();
    this.ready.catch(() => {});
  }
  async init() {
    for (const dir of [this.home, this.workspace, this.dataRoot, path.join(this.dataRoot, 'images')]) {
      await contained(this.root, dir);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    }
  }
  snapshot() {
    return {
      available: Boolean(this.command),
      connected: Boolean(this.account),
      account: this.account,
      signingIn: Boolean(this.login),
      streaming: this.runs.has('chat'),
      generating: this.runs.has('image'),
      editingDocumentId: this.documents?.active?.id || null,
      model: this.data.model,
      reasoningEffort:
        this.data.reasoningEffort ??
        this.models.find(model => model.slug === this.data.model)?.defaultReasoningEffort ??
        null,
      serviceTier: this.data.serviceTier,
      usage: this.usage
    };
  }
  changed() {
    this.emit({ type: 'state' });
  }
  async status() {
    await this.ready;
    this.command = await this.resolveCommand();
    if (!this.transport && this.command && !this.disposed) {
      const exists = await fs.stat(await contained(this.home, path.join(this.home, 'auth.json'))).then(
        () => true,
        error => {
          if (error.code === 'ENOENT') return false;
          throw error;
        }
      );
      if (exists) {
        await this.start();
        await this.refreshAccount();
      }
    }
    return this.snapshot();
  }
  async start() {
    await this.ready;
    if (this.disposed) throw fail(uiText('Codex 연결이 종료됐습니다.'), 'disconnected');
    if (this.starting) return this.starting;
    if (this.transport && !this.transport.closed) return;
    this.starting = (async () => {
      this.command = await this.resolveCommand();
      if (!this.command)
        throw fail(
          uiText('Codex CLI를 설치한 뒤 다시 시도해주세요. 설치 명령: npm install -g @openai/codex'),
          'cli_missing'
        );
      const transport = this.createTransport({
        command: this.command,
        home: this.home,
        workspace: this.workspace,
        clientRequest: params => this.toolCall(params),
        notify: (method, params) => this.notification(method, params),
        exited: () => {
          this.transport = null;
          this.loaded.clear();
          this.account = null;
          this.usage = null;
          this.login?.reject(fail(uiText('CLI 로그인 연결이 종료됐습니다. 다시 시도해주세요.'), 'disconnected'));
          for (const run of this.runs.values())
            run.finish('failed', fail(uiText('Codex 연결이 종료됐습니다. 다시 시도해주세요.'), 'disconnected'));
          this.changed();
        }
      });
      this.transport = transport;
      try {
        await transport.request('initialize', {
          clientInfo: { name: 'dockit_open', title: 'Dockit Open', version: '0.1.3' },
          capabilities: { experimentalApi: true }
        });
        transport.write({ method: 'initialized', params: {} });
        this.skillRoots = await sharedSkillRoots(this.globalHome);
        if (this.skillRoots.length) await transport.request('skills/extraRoots/set', { extraRoots: this.skillRoots });
      } catch (error) {
        transport.dispose();
        throw error;
      }
    })();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }
  async refreshAccount() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const { account } = await this.transport.request('account/read', { refreshToken: false });
      let identity = '';
      if (account?.type === 'chatgpt') {
        // 계정 식별자는 기록 구분에만 사용 (토큰은 Codex 홈 밖으로 나가지 않음)
        const auth = JSON.parse(
          await fs.readFile(await contained(this.home, path.join(this.home, 'auth.json')), 'utf8')
        );
        identity = auth.tokens?.account_id || '';
      }
      const key =
        account?.type === 'chatgpt'
          ? createHash('sha256')
              .update(`${identity}\0${account.email || ''}`)
              .digest('hex')
          : null;
      if (key !== this.key) {
        await this.persistTail;
        this.key = key;
        this.data = fresh();
        this.models = [];
        this.usage = null;
        this.loaded.clear();
        if (key) {
          try {
            const file = await contained(this.dataRoot, path.join(this.dataRoot, `${key}.json`));
            const stored = JSON.parse(await fs.readFile(file, 'utf8'));
            this.data = {
              model: typeof stored.model === 'string' ? stored.model : '',
              reasoningEffort: typeof stored.reasoningEffort === 'string' ? stored.reasoningEffort : null,
              serviceTier: typeof stored.serviceTier === 'string' ? stored.serviceTier : null,
              threads: stored.threads || {},
              documentToolsVersion: stored.documentToolsVersion || 0,
              previousChatThreads: stored.previousChatThreads || [],
              chat: Array.isArray(stored.chat) ? stored.chat : [],
              image: Array.isArray(stored.image) ? stored.image : []
            };
            for (const kind of ['chat', 'image'])
              for (const message of this.data[kind]) if (message.status === 'streaming') message.status = 'cancelled';
          } catch (error) {
            if (error.code !== 'ENOENT') throw fail(uiText('CLI 대화 기록을 읽지 못했습니다.'), 'history_failed');
          }
        }
      }
      this.account = key ? { id: key, email: account.email || '', planType: account.planType || '' } : null;
      this.changed();
      return this.account;
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }
  async signIn() {
    if (this.login || this.runs.size || this.accountOperation)
      throw fail(uiText('진행 중인 CLI 요청을 먼저 마쳐주세요.'), 'busy');
    this.accountOperation = true;
    try {
      await this.start();
      let resolve, reject;
      const completed = new Promise((ok, bad) => {
        resolve = ok;
        reject = bad;
      });
      completed.catch(() => {});
      this.login = { resolve, reject, id: null, cancel: false };
      this.changed();
      const result = await this.transport.request('account/login/start', { type: 'chatgpt' });
      this.login.id = result.loginId;
      const url = new URL(result.authUrl);
      if (
        url.protocol !== 'https:' ||
        !['auth.openai.com', 'chatgpt.com'].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw fail(uiText('CLI 로그인 주소를 확인하지 못했습니다.'), 'invalid_login_url');
      if (this.login.cancel) await this.cancelSignIn();
      else await this.openExternal(url.href);
      const timer = setTimeout(() => {
        this.cancelSignIn().catch(() => {});
        reject(fail(uiText('CLI 로그인 시간이 지났습니다. 다시 시도해주세요.'), 'timeout'));
      }, 10 * 60_000);
      try {
        await completed;
      } finally {
        clearTimeout(timer);
      }
      await this.refreshAccount();
      if (!this.account) throw fail(uiText('CLI 로그인을 확인하지 못했습니다. 다시 시도해주세요.'), 'login_failed');
      return this.snapshot();
    } catch (error) {
      if (this.login?.id)
        await this.transport?.request('account/login/cancel', { loginId: this.login.id }).catch(() => {});
      throw error;
    } finally {
      this.login = null;
      this.accountOperation = false;
      this.changed();
    }
  }
  async cancelSignIn() {
    const login = this.login;
    if (!login) return;
    login.cancel = true;
    if (login.id) {
      await this.transport?.request('account/login/cancel', { loginId: login.id });
      login.reject(fail(uiText('CLI 로그인을 취소했습니다.'), 'cancelled'));
    }
  }
  async signOut() {
    if (this.login || this.runs.size || this.accountOperation)
      throw fail(uiText('진행 중인 CLI 요청을 먼저 마쳐주세요.'), 'busy');
    this.accountOperation = true;
    try {
      await this.start();
      await this.transport.request('account/logout');
      await this.persistTail;
      this.account = null;
      this.key = null;
      this.data = fresh();
      this.models = [];
      this.usage = null;
      this.loaded.clear();
    } finally {
      this.accountOperation = false;
      this.changed();
    }
  }
  requireAccount() {
    if (!this.account || this.login || this.accountOperation)
      throw fail(uiText('설정에서 CLI로 로그인해주세요.'), 'signin');
  }
  async listModels() {
    await this.status();
    this.requireAccount();
    let cursor = null;
    const models = [];
    do {
      const result = await this.transport.request('model/list', { cursor, limit: 100 });
      models.push(
        ...(result.data || [])
          .filter(m => !m.hidden)
          .map(m => ({
            slug: m.model,
            name: m.displayName || m.model,
            isDefault: m.isDefault,
            supportedReasoningEfforts: (m.supportedReasoningEfforts || []).map(option =>
              typeof option === 'string'
                ? { effort: option }
                : { ...option, effort: option.reasoningEffort ?? option.effort }
            ),
            defaultReasoningEffort: m.defaultReasoningEffort ?? null,
            serviceTiers:
              m.serviceTiers ??
              (m.additionalSpeedTiers || [])
                .filter(tier => tier === 'fast')
                .map(() => ({ id: 'priority', name: 'Fast' })),
            defaultServiceTier: m.defaultServiceTier ?? null
          }))
      );
      cursor = result.nextCursor;
    } while (cursor && models.length < 1000);
    this.models = models;
    if (!models.some(m => m.slug === this.data.model)) {
      this.data.model = models.find(m => m.isDefault)?.slug || models[0]?.slug || '';
      this.data.reasoningEffort = null;
      await this.save();
      this.changed();
    }
    if (this.data.serviceTier === null) {
      const { config } = await this.transport.request('config/read', { includeLayers: false, cwd: this.workspace });
      const configured =
        config?.service_tier ?? models.find(model => model.slug === this.data.model)?.defaultServiceTier ?? 'default';
      this.data.serviceTier = configured === 'fast' ? 'priority' : configured;
      await this.save();
      this.changed();
    }
    if (
      this.data.serviceTier === 'priority' &&
      !models
        .find(model => model.slug === this.data.model)
        ?.serviceTiers?.some(tier => tier.id === 'priority' || tier.id === 'fast')
    ) {
      this.data.serviceTier = 'default';
      await this.save();
      this.changed();
    }
    return models;
  }
  async selectModel(slug) {
    this.requireAccount();
    if (this.runs.size) throw fail(uiText('응답이 끝난 뒤 모델을 변경해주세요.'), 'busy');
    if (!this.models.some(m => m.slug === slug))
      throw fail(uiText('사용 가능한 모델을 선택해주세요.'), 'invalid_model');
    if (this.data.model !== slug) this.data.reasoningEffort = null;
    this.data.model = slug;
    if (
      this.data.serviceTier === 'priority' &&
      !this.models
        .find(model => model.slug === slug)
        ?.serviceTiers?.some(tier => tier.id === 'priority' || tier.id === 'fast')
    )
      this.data.serviceTier = 'default';
    await this.save();
    this.changed();
  }
  async selectReasoningEffort(effort) {
    this.requireAccount();
    if (this.runs.size) throw fail(uiText('응답이 끝난 뒤 추론 강도를 변경해주세요.'), 'busy');
    const model = this.models.find(model => model.slug === this.data.model);
    if (!model) throw fail(uiText('사용 가능한 모델을 먼저 선택해주세요.'), 'invalid_model');
    if (
      effort !== null &&
      (typeof effort !== 'string' ||
        !(model?.supportedReasoningEfforts?.length
          ? model.supportedReasoningEfforts.some(
              option => (typeof option === 'string' ? option : option.effort) === effort
            )
          : /^(none|minimal|low|medium|high|xhigh|max|ultra)$/.test(effort)))
    )
      throw fail(uiText('지원하지 않는 추론 강도입니다.'), 'invalid_reasoning_effort');
    this.data.reasoningEffort = effort;
    await this.save();
    this.changed();
  }
  async selectServiceTier(tier) {
    this.requireAccount();
    if (this.runs.size) throw fail(uiText('응답이 끝난 뒤 Fast 모드를 변경해주세요.'), 'busy');
    const model = this.models.find(model => model.slug === this.data.model);
    if (!model) throw fail(uiText('사용 가능한 모델을 먼저 선택해주세요.'), 'invalid_model');
    if (
      tier !== 'default' &&
      (tier !== 'priority' || !model.serviceTiers?.some(option => option.id === 'priority' || option.id === 'fast'))
    )
      throw fail(uiText('이 모델은 Fast 모드를 지원하지 않습니다.'), 'invalid_service_tier');
    this.data.serviceTier = tier;
    await this.save();
    this.changed();
  }
  async readUsage() {
    await this.status();
    this.requireAccount();
    const result = await this.transport.request('account/rateLimits/read');
    this.usage = normalizeUsage(result);
    this.changed();
    return this.usage;
  }
  history(kind = 'chat') {
    this.validateKind(kind);
    return this.account ? this.data[kind] : [];
  }
  validateKind(kind) {
    if (!['chat', 'image'].includes(kind)) throw fail(uiText('잘못된 요청입니다.'), 'invalid_input');
  }
  async clearHistory(kind = 'chat') {
    this.validateKind(kind);
    this.requireAccount();
    if (this.runs.has(kind)) throw fail(uiText('응답이 끝난 뒤 새 대화를 시작해주세요.'), 'busy');
    this.data[kind] = [];
    delete this.data.threads[kind];
    await this.save();
    this.messages(kind);
  }
  save() {
    if (!this.key) return Promise.resolve();
    const key = this.key;
    const file = path.join(this.dataRoot, `${key}.json`);
    const value = structuredClone(this.data);
    const next = this.persistTail.then(async () => {
      await atomicJson(await contained(this.dataRoot, file), value);
      await this.onHistorySaved?.(key, value);
    });
    this.persistTail = next.catch(() => {});
    return next;
  }
  messages(kind) {
    this.emit({ type: 'messages', kind, messages: this.data[kind] });
  }
  async storeImage(value) {
    let bytes;
    if (value.savedPath) {
      const file = await contained(this.home, path.resolve(value.savedPath));
      if ((await fs.stat(file)).size > MAX_IMAGE) throw fail(uiText('이미지 파일이 너무 큽니다.'), 'invalid_image');
      bytes = await fs.readFile(file);
    } else {
      let encoded = value.result || '';
      if (encoded.length > MAX_IMAGE * 1.4) throw fail(uiText('이미지 파일이 너무 큽니다.'), 'invalid_image');
      encoded = encoded.replace(/^data:image\/(png|jpeg|webp);base64,/, '');
      if (!encoded || !/^[A-Za-z0-9+/=\r\n]+$/.test(encoded))
        throw fail(uiText('생성된 이미지를 읽지 못했습니다.'), 'invalid_image');
      bytes = Buffer.from(encoded, 'base64');
    }
    if (bytes.length > MAX_IMAGE) throw fail(uiText('이미지 파일이 너무 큽니다.'), 'invalid_image');
    const id = `${randomUUID()}.${imageExtension(bytes)}`;
    const file = await contained(this.dataRoot, path.join(this.dataRoot, 'images', id));
    await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
    return { imageId: id, image: `dockit://app/codex-image/${id}` };
  }
  async imagePath(id) {
    if (typeof id !== 'string' || !/^[\da-f-]{36}\.(png|jpg|webp)$/.test(id))
      throw fail(uiText('잘못된 이미지입니다.'), 'invalid_image');
    if (
      !this.account ||
      (![...this.data.chat, ...this.data.image].some(m => m.imageId === id) && !(await this.historyImageAllowed?.(id)))
    )
      throw fail(uiText('이미지를 찾을 수 없습니다.'), 'image_missing');
    return contained(this.dataRoot, path.join(this.dataRoot, 'images', id));
  }
  async attachFiles(paths) {
    await this.ready;
    this.requireAccount();
    if (this.runs.size) throw fail(uiText('응답이 끝난 뒤 파일을 첨부해주세요.'), 'busy');
    return this.attachments.add(this.key, paths);
  }
  async send(text, kind = 'chat', reference, attachments = [], target = null) {
    this.validateKind(kind);
    this.requireAccount();
    if (typeof text !== 'string' || (!text.trim() && !attachments?.length) || text.length > 100_000)
      throw fail(uiText('보낼 내용을 입력하거나 파일을 첨부해주세요.'), 'invalid_input');
    if (
      reference &&
      (kind !== 'image' || typeof reference !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(reference))
    )
      throw fail(uiText('지원하지 않는 이미지 형식입니다.'), 'invalid_image');
    if (this.runs.has(kind)) throw fail(uiText('응답이 진행 중입니다.'), 'busy');
    const accountKey = this.key;
    const files = await this.attachments.read(accountKey, attachments);
    const texts = files
      .filter(file => file.kind === 'text')
      .map(
        file => `첨부 파일: ${file.name}
${textContent(file.bytes)}`
      );
    this.requireAccount();
    if (this.key !== accountKey)
      throw fail(uiText('계정이 변경됐습니다. 파일을 다시 첨부해주세요.'), 'account_changed');
    if (this.runs.has(kind)) throw fail(uiText('응답이 진행 중입니다.'), 'busy');
    let resolve;
    const completed = new Promise(ok => {
      resolve = ok;
    });
    const assistant = {
      id: randomUUID(),
      role: 'assistant',
      text: '',
      status: 'streaming',
      activity: uiText('응답 준비 중')
    };
    const run = {
      kind,
      threadId: null,
      turnId: null,
      tail: Promise.resolve(),
      toolsTail: Promise.resolve(),
      parts: new Map(),
      activity: new ChatActivity(),
      assistant,
      cancelled: false
    };
    run.finish = (status, error) => {
      if (run.finishing) return;
      run.finishing = true;
      run.tail = run.tail.then(async () => {
        clearTimeout(run.timer);
        clearTimeout(run.cancelTimer);
        await run.preparing?.catch(() => {});
        await run.toolsTail;
        let document;
        try {
          document = await this.documents?.end(run.document);
        } catch (failure) {
          error = failure;
        }
        assistant.status = status;
        if (kind === 'image' && status === 'completed' && !run.hasImage)
          error = fail(uiText('이미지가 생성되지 않았습니다. 요청을 바꿔 다시 시도해주세요.'), 'no_image');
        if (error) assistant.status = status === 'cancelled' ? 'cancelled' : 'failed';
        assistant.activity = run.activity.complete(error ? 'failed' : assistant.status);
        try {
          await this.save();
        } catch {
          error = fail(uiText('CLI 대화 기록을 저장하지 못했습니다.'), 'save_failed');
          assistant.activity = run.activity.complete('failed');
        }
        this.runs.delete(kind);
        this.messages(kind);
        this.changed();
        resolve({ messages: this.data[kind], document, error: error ? safeFailure(error) : null });
        this.readUsage().catch(() => {});
      });
    };
    this.runs.set(kind, run);
    this.changed();
    try {
      if (kind === 'chat' && target) {
        if (!this.documents) throw fail(uiText('문서 연결을 사용할 수 없습니다.'), 'document_access');
        run.preparing = this.documents.begin(target).then(session => {
          run.document = session;
        });
        await run.preparing;
        this.changed();
      }
      if (run.finishing) return completed;
      if (run.cancelled) {
        run.finish('cancelled');
        return completed;
      }
      if (!this.models.length) await this.listModels();
      if (!this.data.model) throw fail(uiText('사용 가능한 CLI 모델이 없습니다.'), 'no_model');
      const user = {
        id: randomUUID(),
        role: 'user',
        text: text.trim(),
        ...(files.length ? { attachments: files.map(metadata) } : {})
      };
      if (reference) Object.assign(user, await this.storeImage({ result: reference }));
      this.data[kind].push(user, assistant);
      await this.save();
      this.messages(kind);
      const params = {
        model: this.data.model,
        cwd: this.workspace,
        sandbox: 'read-only',
        approvalPolicy: 'never',
        developerInstructions:
          kind === 'image'
            ? 'Generate or edit the image requested by the user using the built-in image generation tool. Do not use shell commands or edit documents. Return the generated image. Respond in the language of the user.'
            : 'You are the assistant in Dockit Open. Answer in the user’s language. For document edits, use only dockit_read_document and dockit_edit_document on the document attached to this turn, following the project AGENTS.md. Do not execute shell commands or use other tools to access or change local files. Historical conversations are read-only via dockit_read_history. Never access credentials or change unrelated documents, settings, or folders. Preserve existing content and formatting unless asked to change them.'
      };
      if (kind === 'chat' && this.documents) {
        params.dynamicTools = DOCUMENT_TOOLS;
        params.environments = [];
      }
      const guidance = await readGlobalGuidance(this.globalHome);
      if (this.skillRoots.length) {
        params.config = skillReaderConfig([...this.skillRoots, path.join(this.home, 'skills')]);
      }
      let threadId = this.data.threads[kind];
      let previousContext = '';
      const migrateChat = kind === 'chat' && this.documents && this.data.documentToolsVersion !== 1;
      const previousThreadId = threadId;
      if (migrateChat) {
        // 예전 스레드는 채팅 전용 지시가 고정되어 있고 문서 도구가 없음
        // (기존 실행 기록과 화면 기록은 두고, 대화를 도구가 있는 새 스레드로 이어감)
        previousContext = this.data.chat
          .filter(message => message.id !== user.id && message.id !== assistant.id && message.text)
          .map(message => `${message.role}: ${message.text}`)
          .join('\n\n');
        threadId = null;
      }
      if (!threadId) {
        const result = await this.transport.request('thread/start', params);
        threadId = result.thread.id;
        this.data.threads[kind] = threadId;
        this.loaded.add(threadId);
        if (migrateChat) {
          if (previousThreadId)
            this.data.previousChatThreads = [...(this.data.previousChatThreads || []), previousThreadId];
          this.data.documentToolsVersion = 1;
        }
        await this.save();
      } else if (!this.loaded.has(threadId)) {
        await this.transport.request('thread/resume', { ...params, threadId });
        this.loaded.add(threadId);
      }
      run.threadId = threadId;
      if (run.cancelled) {
        run.finish('cancelled');
        return completed;
      }
      // 기존 스레드는 재개할 때 원래 개발자 지시를 유지할 수 있음
      // (현재 전역 지침을 사용자 우선순위로 넣어 예전·새 스레드 모두 받도록 처리)
      const projectGuidance =
        this.documents && kind === 'chat'
          ? await fs.readFile(await contained(this.root, path.join(this.root, 'AGENTS.md')), 'utf8')
          : '';
      const documentContext =
        !this.documents || kind !== 'chat'
          ? ''
          : run.document
            ? `현재 문서 경로: ${JSON.stringify(run.document.file)}
문서 ID: ${run.document.id}
이번 요청에서는 이 파일만 편집할 수 있습니다. 수정 전에 dockit_read_document로 최신 내용을 읽으세요.`
            : '현재 연결된 문서가 없습니다. 이전 요청에 연결됐던 문서를 수정하지 마세요.';
      const context = [
        guidance,
        projectGuidance &&
          `# 프로젝트 AGENTS.md
${projectGuidance}`,
        documentContext,
        previousContext &&
          `이전 대화 참고 자료(현재 요청 아님):
${previousContext}`,
        this.skillRoots.length
          ? 'Read local skill instructions and their text references with the dockit_skills read_skill tool before applying a skill. Scripts must not be executed.'
          : ''
      ]
        .filter(Boolean)
        .join('\n\n');
      const input = context ? [{ type: 'text', text: context }] : [];
      if (text.trim()) input.push({ type: 'text', text: text.trim() });
      for (const value of texts) input.push({ type: 'text', text: value });
      for (const file of files.filter(file => file.kind === 'image'))
        input.push({ type: 'localImage', path: file.path });
      if (reference) input.push({ type: 'localImage', path: await this.imagePath(user.imageId) });
      const result = await this.transport.request('turn/start', {
        threadId,
        cwd: this.workspace,
        ...(kind === 'chat' && this.documents ? { environments: [] } : {}),
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        approvalPolicy: 'never',
        model: this.data.model,
        serviceTier: this.data.serviceTier ?? 'default',
        ...(this.snapshot().reasoningEffort ? { effort: this.snapshot().reasoningEffort } : {}),
        input
      });
      run.turnId = result.turn.id;
      if (run.cancelled) await this.cancelResponse(kind);
      if (!run.finishing)
        run.timer = setTimeout(() => {
          this.cancelResponse(kind).catch(() => {});
          run.finish('failed', fail(uiText('Codex 응답 시간이 지났습니다.'), 'timeout'));
        }, 15 * 60_000);
    } catch (error) {
      run.finish('failed', error);
    }
    return completed;
  }
  async cancelResponse(kind = 'chat') {
    this.validateKind(kind);
    const run = this.runs.get(kind);
    if (!run) return;
    run.cancelled = true;
    if (run.document) run.document.closing = true;
    if (run.turnId) {
      try {
        await this.transport.request('turn/interrupt', { threadId: run.threadId, turnId: run.turnId });
      } catch {
        run.finish('cancelled');
      }
      if (!run.finishing) run.cancelTimer = setTimeout(() => run.finish('cancelled'), 3000);
    }
  }
  async toolCall(params) {
    const run = [...this.runs.values()].find(candidate => candidate.threadId === params.threadId);
    const respond = (value, success = true) => ({
      success,
      contentItems: [{ type: 'inputText', text: JSON.stringify(value) }]
    });
    if (!run || run.finishing || run.cancelled || (run.turnId && params.turnId !== run.turnId) || !this.documents)
      return respond({ error: uiText('현재 작업에서 사용할 수 없는 도구입니다.') }, false);
    const task = run.toolsTail.then(async () => {
      if (run.cancelled || run.finishing) throw fail(uiText('작업이 종료됐습니다.'));
      if (params.tool === 'dockit_read_history') return this.documents.history(params.arguments);
      if (!run.document) throw fail(uiText('현재 연결된 문서가 없습니다.'));
      if (params.tool === 'dockit_read_document') return this.documents.read(run.document);
      if (params.tool === 'dockit_edit_document') return this.documents.edit(run.document, params.arguments);
      throw fail(uiText('허용하지 않는 도구입니다.'));
    });
    run.toolsTail = task.catch(() => {});
    try {
      return respond(await task);
    } catch (error) {
      return respond({ error: safeFailure(error).message }, false);
    }
  }
  updateActivity(run, label) {
    if (run.assistant.activity === label) return;
    run.assistant.activity = label;
    this.messages(run.kind);
  }
  notification(method, params) {
    if (method === 'account/login/completed' && this.login && (!this.login.id || this.login.id === params.loginId)) {
      if (params.success) this.login.resolve();
      else
        this.login.reject(
          fail(
            this.login.cancel
              ? uiText('CLI 로그인을 취소했습니다.')
              : uiText('CLI 로그인에 실패했습니다. 다시 시도해주세요.'),
            this.login.cancel ? 'cancelled' : 'login_failed'
          )
        );
    }
    if (method === 'account/updated' && !this.accountOperation) this.refreshAccount().catch(() => {});
    if (method === 'account/rateLimits/updated' && this.account) {
      this.usage = normalizeUsage(params);
      this.changed();
    }
    const run = [...this.runs.values()].find(r => r.threadId === params.threadId);
    if (!run || run.finishing || (run.turnId && params.turnId && params.turnId !== run.turnId)) return;
    if (method === 'turn/started') {
      run.turnId = params.turn?.id;
      this.updateActivity(run, run.activity.processing());
    }
    if (method === 'item/started') this.updateActivity(run, run.activity.start(params.item?.id, params.item?.type));
    if (method === 'item/completed') this.updateActivity(run, run.activity.finish(params.item?.id));
    if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta')
      this.updateActivity(run, run.activity.start(params.itemId, 'reasoning'));
    if (method === 'item/agentMessage/delta') {
      run.assistant.activity = run.activity.writing();
      run.parts.set(params.itemId, (run.parts.get(params.itemId) || '') + (params.delta || ''));
      run.assistant.text = [...run.parts.values()].join('\n\n');
      this.messages(run.kind);
    }
    if (method === 'item/completed' && params.item?.type === 'agentMessage') {
      run.parts.set(params.item.id, params.item.text || '');
      run.assistant.text = [...run.parts.values()].join('\n\n');
      this.messages(run.kind);
    }
    if (method === 'item/completed' && params.item?.type === 'imageGeneration') {
      run.tail = run.tail
        .then(async () => {
          if (params.item.status !== 'completed')
            throw fail(
              params.item.failure?.type === 'usageLimitExceeded'
                ? uiText('이미지 생성 사용 한도에 도달했습니다.')
                : uiText('이미지를 생성하지 못했습니다.'),
              'image_failed'
            );
          const image = await this.storeImage(params.item);
          this.data[run.kind].push({ id: randomUUID(), role: 'assistant', text: '', status: 'completed', ...image });
          run.hasImage = true;
          this.messages(run.kind);
        })
        .catch(error => {
          run.error = error;
        });
    }
    if (method === 'turn/completed') {
      const status = params.turn?.status;
      run.tail = run.tail.then(() => {
        const failure =
          run.error ||
          (status === 'failed'
            ? fail(uiText('Codex 응답에 실패했습니다. 모델과 사용 한도를 확인해주세요.'), 'turn_failed')
            : null);
        run.finish(status === 'completed' ? 'completed' : status === 'interrupted' ? 'cancelled' : 'failed', failure);
      });
    }
  }
  async dispose() {
    this.disposed = true;
    this.login?.reject(fail(uiText('CLI 로그인을 취소했습니다.'), 'cancelled'));
    this.transport?.dispose();
    await Promise.all([...this.runs.values()].map(run => run.tail));
    await this.persistTail;
  }
}
function normalizeUsage(result) {
  const buckets =
    result.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length
      ? Object.entries(result.rateLimitsByLimitId)
      : result.rateLimits
        ? [[result.rateLimits.limitId || 'codex', result.rateLimits]]
        : [];
  const window = value =>
    value
      ? {
          usedPercent: Number.isFinite(value.usedPercent) ? Math.max(0, Math.min(100, value.usedPercent)) : null,
          windowDurationMins: Number.isFinite(value.windowDurationMins) ? value.windowDurationMins : null,
          resetsAt: Number.isFinite(value.resetsAt) ? value.resetsAt : null
        }
      : null;
  return {
    updatedAt: Date.now(),
    buckets: buckets.map(([id, value]) => ({
      id,
      name: value.limitName || id,
      primary: window(value.primary),
      secondary: window(value.secondary)
    }))
  };
}
module.exports = {
  CodexClient,
  CodexTransport,
  findCodex,
  childEnvironment,
  normalizeUsage,
  safeFailure,
  imageExtension
};
