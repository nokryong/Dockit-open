const { t: uiText } = require('./i18n.cjs');
const fs = require('node:fs/promises');
const { watch } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { contained, atomicJson, safeName } = require('./local-store.cjs');

const fail = (message, code = 'document_access') => Object.assign(new Error(message), { code, dockit: true });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = ['content', 'title', 'docSetting', 'bulletStyle', 'viewPage', 'pageNumber'];
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const tool = (name, description, inputSchema) => ({ type: 'function', name, description, inputSchema });
const DOCUMENT_TOOLS = [
  tool('dockit_read_document', '이번 요청에 연결된 실제 .dkt 파일을 읽습니다. 수정 전에 읽어 revision과 기존 서식을 확인하세요. 다른 문서 경로는 받지 않습니다.', schema({})),
  tool('dockit_edit_document', '현재 .dkt 파일에 변경 사항을 저장하고 편집기에 즉시 반영합니다. AGENTS.md 형식을 지키세요. content 전체 또는 replacements 중 하나를 사용하세요. 명시하지 않은 필드는 보존됩니다.', schema({
    expectedRevision: { type: 'string' },
    updates: schema({ content: { type: 'string' }, title: { type: 'string' }, docSetting: { type: 'object' }, bulletStyle: { type: 'object' }, viewPage: { type: 'boolean' }, pageNumber: { type: 'string' } }),
    replacements: { type: 'array', items: schema({ find: { type: 'string' }, replace: { type: 'string' } }, ['find', 'replace']) }
  }, ['expectedRevision'])),
  tool('dockit_read_history', 'codex 폴더의 과거 대화 기록을 읽기 전용으로 조회합니다. path를 생략하면 기록 파일 목록, 지정하면 offset부터 일부 내용을 반환합니다. 인증·설정 파일은 접근할 수 없습니다.', schema({ path: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 32000 } }))
];

class CodexDocuments {
  constructor({ store, emit = () => {}, validate }) {
    this.store = store;
    this.emit = emit;
    this.validate = validate;
    this.active = null;
  }
  async begin(target) {
    if (!target) return null;
    if (this.active) throw fail(uiText("Codex가 문서를 작업 중입니다."), 'document_busy');
    if (!object(target) || typeof target.id !== 'string' || typeof target.revision !== 'string') throw fail(uiText("현재 문서를 먼저 저장해주세요."));
    return this.store.run(async () => {
      const file = await this.store.documentPath(target.id);
      const root = await this.store.documentRoot(target.id);
      const record = await this.store.documentRecord(file, root);
      if (record.revision !== target.revision) throw fail(uiText("문서가 외부에서 변경됐습니다. 다시 열어 확인해주세요."), 'RevisionConflict');
      if ((await fs.stat(file)).nlink !== 1) throw fail(uiText("연결된 문서는 수정할 수 없습니다."));
      const session = { id: target.id, file, root, record, revision: record.revision, tail: Promise.resolve(), closing: false };
      this.active = session;
      this.store.documentLocks.set(session.id, file);
      const refresh = () => {
        if (session.closing) return;
        clearTimeout(session.timer);
        session.timer = setTimeout(() => { this.refresh(session).catch(() => {}); }, 100);
      };
      try {
        session.watcher = watch(path.dirname(file), (_, name) => {
          if (!name || String(name).toLowerCase() === path.basename(file).toLowerCase()) refresh();
        });
        session.watcher.on('error', refresh);
        session.poll = setInterval(refresh, 1500);
        session.poll.unref?.();
        this.emit({ type: 'document-lock', documentId: session.id, path: file, locked: true });
        return session;
      } catch (error) { this.store.documentLocks.delete(session.id); this.active = null; throw error; }
    });
  }
  async current(session) {
    if (this.active !== session) throw fail(uiText("문서 작업이 종료됐습니다."));
    await contained(session.root, session.file);
    if ((await this.store.documentRoot(session.id)) !== session.root || (await this.store.documentPath(session.id)) !== session.file || (await fs.stat(session.file)).nlink !== 1) throw fail(uiText("문서 경로가 변경됐습니다."));
    return this.store.documentRecord(session.file, session.root);
  }
  async check(record) {
    if (!this.validate) throw fail(uiText("문서 편집기가 준비되지 않았습니다."), 'document_validation');
    const result = await this.validate(record);
    if (!result?.ok) throw fail(result?.message || uiText("편집기에서 인식할 수 없는 문서 형식입니다."), 'document_validation');
  }
  publish(session, record) {
    session.record = record;
    session.revision = record.revision;
    session.error = null;
    this.emit({ type: 'document-update', documentId: session.id, document: record });
  }
  refresh(session) {
    const next = session.tail.then(() => this.store.run(async () => {
      const record = await this.current(session);
      if (record.revision === session.revision) { session.error = null; return; }
      await this.check(record);
      this.publish(session, record);
    }));
    session.tail = next.catch(error => { session.error = error; });
    return next;
  }
  async read(session) {
    const record = await this.current(session);
    await this.check(record);
    const raw = await fs.readFile(session.file, 'utf8');
    if (createHash('sha256').update(raw).digest('hex') !== record.revision) throw fail(uiText("읽는 중 문서가 변경됐습니다. 다시 읽어주세요."), 'RevisionConflict');
    const value = JSON.parse(raw);
    // The thumbnail is an app-maintained cache, not editable document content.
    delete value.thumbnail;
    return { path: session.file, revision: record.revision, document: value };
  }
  async edit(session, args) {
    if (!session || session.closing || this.active !== session) throw fail(uiText("수정할 문서가 연결되지 않았습니다."));
    if (!object(args) || typeof args.expectedRevision !== 'string') throw fail(uiText("읽은 문서의 revision이 필요합니다."));
    const updates = args.updates ?? {};
    if (!object(updates) || Object.keys(updates).some(key => !fields.includes(key))) throw fail(uiText("허용하지 않는 문서 속성입니다."));
    if (args.replacements && updates.content !== undefined) throw fail(uiText("content와 replacements 중 하나만 사용해주세요."));
    return this.store.run(async () => {
      if (session.closing) throw fail(uiText("문서 작업이 종료됐습니다."));
      const before = await this.current(session);
      if (before.revision !== args.expectedRevision) throw fail(uiText("문서가 변경됐습니다. 다시 읽은 뒤 수정해주세요."), 'RevisionConflict');
      const original = JSON.parse(await fs.readFile(session.file, 'utf8'));
      const next = { ...original, ...updates, docSetting: { ...original.docSetting, ...updates.docSetting }, bulletStyle: { ...original.bulletStyle, ...updates.bulletStyle } };
      if (args.replacements !== undefined) {
        if (!Array.isArray(args.replacements) || !args.replacements.length) throw fail(uiText("교체할 내용을 지정해주세요."));
        for (const replacement of args.replacements) {
          if (!object(replacement) || typeof replacement.find !== 'string' || !replacement.find || typeof replacement.replace !== 'string') throw fail(uiText("find와 replace 문자열이 필요합니다."));
          const index = next.content.indexOf(replacement.find);
          if (index < 0 || next.content.indexOf(replacement.find, index + replacement.find.length) >= 0) throw fail(uiText("교체 대상이 하나로 특정되지 않습니다. 주변 HTML을 포함해 다시 지정해주세요."));
          next.content = next.content.slice(0, index) + replacement.replace + next.content.slice(index + replacement.find.length);
        }
      }
      if (typeof next.content !== 'string' || !next.content.trim() || typeof next.title !== 'string' || !object(next.docSetting) || !object(next.bulletStyle) || typeof next.viewPage !== 'boolean' || typeof next.pageNumber !== 'string') throw fail(uiText("문서 속성의 형식이 올바르지 않습니다."));
      safeName(next.title);
      const s = next.docSetting;
      for (const key of ['pageWidth', 'pageHeight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'lineHeight']) if (!Number.isFinite(s[key]) || s[key] < 0) throw fail(uiText("문서 크기와 여백은 유효한 숫자여야 합니다."));
      if (s.pageWidth <= s.paddingLeft + s.paddingRight || s.pageHeight <= s.paddingTop + s.paddingBottom || s.lineHeight <= 0) throw fail(uiText("문서 여백이나 줄 간격이 올바르지 않습니다."));
      next.schemaVersion = /data-dockit-semantic-(key|role|tags)\s*=/i.test(next.content) ? 2 : (original.schemaVersion || 1);
      await this.check({ ...next, _id: session.id });
      if (session.closing || (await this.current(session)).revision !== before.revision) throw fail(uiText("저장 전에 문서가 변경되거나 작업이 중단됐습니다."), 'RevisionConflict');
      if (!session.backedUp) {
        await atomicJson(await contained(this.store.root, path.join(this.store.root, 'backups', `${session.id}.codex.json`)), original);
        session.backedUp = true;
      }
      await atomicJson(session.file, next);
      const saved = await this.store.documentRecord(session.file, session.root);
      this.publish(session, saved);
      return { path: session.file, revision: saved.revision, saved: true };
    });
  }
  async end(session) {
    if (!session || this.active !== session) return;
    session.closing = true;
    clearTimeout(session.timer); clearInterval(session.poll); session.watcher?.close();
    try {
      await this.refresh(session);
      if (session.error) throw session.error;
      this.publish(session, session.record);
      return session.record;
    } finally {
      this.store.documentLocks.delete(session.id);
      this.active = null;
      this.emit({ type: 'document-lock', documentId: session.id, locked: false });
    }
  }
  async history(args = {}) {
    const home = path.join(this.store.root, 'codex');
    if (!args.path) {
      const files = [];
      const walk = async directory => {
        for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
          if (entry.isSymbolicLink()) continue;
          const file = await contained(home, path.join(directory, entry.name));
          if (entry.isDirectory()) await walk(file);
          else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path.relative(home, file));
        }
      };
      for (const name of ['sessions', 'archived_sessions']) await walk(path.join(home, name));
      return { files: files.sort().reverse() };
    }
    if (typeof args.path !== 'string' || path.isAbsolute(args.path) || !/^(sessions|archived_sessions)[/\\].+\.jsonl$/.test(args.path)) throw fail(uiText("대화 기록 파일만 읽을 수 있습니다."));
    const historyRoot = path.join(home, args.path.split(/[/\\]/)[0]);
    const file = await contained(historyRoot, path.resolve(home, args.path));
    await contained(home, file);
    if ((await fs.stat(file)).nlink !== 1) throw fail(uiText("연결된 파일에는 접근할 수 없습니다."));
    const offset = args.offset ?? 0, limit = args.limit ?? 16000;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 32000) throw fail(uiText("조회 범위가 올바르지 않습니다."));
    const handle = await fs.open(file, 'r');
    try {
      const buffer = Buffer.alloc(limit);
      const { bytesRead } = await handle.read(buffer, 0, limit, offset);
      return { text: buffer.subarray(0, bytesRead).toString('utf8'), nextOffset: offset + bytesRead, done: offset + bytesRead >= (await handle.stat()).size };
    } finally { await handle.close(); }
  }
}
module.exports = { CodexDocuments, DOCUMENT_TOOLS };
