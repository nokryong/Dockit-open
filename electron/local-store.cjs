const { t: uiText } = require('./i18n.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const defaultSettings = require('../desktop/default-settings.json');
const { resolveSystemPath } = require('./system-path.cjs');

const MAX_BYTES = 52_428_800;
const FEATURES = { memo: 'memos', char: 'characters', stylePreset: 'styles', calendar: 'calendar', music: 'music' };
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = (message, code = 'LocalStorageError', detail) => Object.assign(new Error(message), { code, detail });
const safeName = value => {
  const name = String(value || '').trim();
  if (
    !name ||
    name.length > 120 ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) ||
    name === '.' ||
    name === '..'
  ) {
    throw fail(uiText('파일 이름에 사용할 수 없는 문자가 있습니다.'));
  }
  return name;
};

async function contained(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw fail(uiText('허용된 폴더 밖에는 접근할 수 없습니다.'));
  let current = root;
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw fail(uiText('연결된 폴더나 파일에는 접근할 수 없습니다.'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return target;
}

async function readJson(file, fallback) {
  try {
    const stat = await fs.stat(file);
    if (stat.size > MAX_BYTES) throw fail(uiText('파일이 허용 크기를 초과했습니다.'));
    const raw = await fs.readFile(file, 'utf8');
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw fail(uiText('손상된 JSON 파일입니다: {0}', path.basename(file)));
    }
    if (!object(value)) throw fail(uiText('JSON 객체가 필요합니다: {0}', path.basename(file)));
    return { value, revision: hash(raw) };
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return { value: fallback, revision: null };
    throw error;
  }
}

async function atomicJson(file, value, { exclusive = false } = {}) {
  const raw = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(raw) > MAX_BYTES) throw fail(uiText('저장할 데이터가 너무 큽니다.'));
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (exclusive) {
      // 다른 쓰기가 대상을 먼저 만들면 link 실패 (덮어쓰지 않음)
      await fs.link(temporary, file);
      await fs.unlink(temporary);
    } else await fs.rename(temporary, file);
    return hash(raw);
  } finally {
    await fs.unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

class LocalStore {
  constructor({ home, trash }) {
    this.root = path.join(home, '.dockit');
    this.defaultDocuments = path.join(this.root, 'Documents');
    this.trash = trash;
    this.queue = Promise.resolve();
    this.documentPaths = new Map();
    this.documentLocks = new Map();
    // 네이티브 열기로 허락된 파일만 (폴더 접근 권한으로 저장하지 않음)
    this.externalDocuments = new Map();
    this.indexDirty = false;
  }

  async init() {
    await contained(path.dirname(this.root), this.root);
    await fs.mkdir(this.root, { recursive: true });
    const guidance = await contained(this.root, path.join(this.root, 'AGENTS.md'));
    try {
      await fs.writeFile(guidance, await fs.readFile(path.join(__dirname, '..', 'docs', 'codex', 'AGENTS.md')), {
        flag: 'wx',
        mode: 0o600
      });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    for (const dir of [...Object.values(FEATURES), 'backups']) {
      const folder = await contained(this.root, path.join(this.root, dir));
      await fs.mkdir(folder, { recursive: true });
    }
    const file = await contained(this.root, path.join(this.root, 'config.json'));
    const existing = await readJson(file, null);
    if (!existing.value) {
      await atomicJson(
        file,
        {
          version: 1,
          documentsPath: this.defaultDocuments,
          setting: { ...defaultSettings },
          panels: { panels: { left: [], right: [] } }
        },
        { exclusive: true }
      );
    }
    const config = await this.config();
    if (
      config.version !== 1 ||
      !path.isAbsolute(config.documentsPath || '') ||
      !object(config.setting) ||
      !object(config.panels)
    )
      throw fail(uiText('config.json의 버전, 설정 또는 문서 경로가 올바르지 않습니다.'));
    await fs.mkdir(config.documentsPath, { recursive: true });
    await contained(config.documentsPath, config.documentsPath);
    // 다시 만들 수 있는 경로 캐시라 문서 내용이 아님
    const index = await readJson(await contained(this.root, path.join(this.root, 'document-index.json')), null).catch(
      () => ({ value: null })
    );
    if (index.value?.documentsPath === config.documentsPath && object(index.value.paths)) {
      for (const [id, relative] of Object.entries(index.value.paths)) {
        if (
          /^[\w-]{1,100}$/.test(id) &&
          typeof relative === 'string' &&
          !path.isAbsolute(relative) &&
          !path.relative(config.documentsPath, path.resolve(config.documentsPath, relative)).startsWith('..')
        ) {
          this.documentPaths.set(id, path.resolve(config.documentsPath, relative));
        }
      }
    }
    return { dataPath: this.root, documentsPath: config.documentsPath };
  }

  async config() {
    return (await readJson(await contained(this.root, path.join(this.root, 'config.json')))).value;
  }
  run(task) {
    const next = this.queue.then(task);
    this.queue = next.catch(() => {});
    return next;
  }
  flush() {
    return this.queue;
  }
  async changeDocuments(folder) {
    return this.run(async () => {
      if (this.documentLocks.size)
        throw fail(uiText('Codex 작업이 끝난 뒤 문서 폴더를 변경해주세요.'), 'DocumentLocked');
      if (!path.isAbsolute(folder)) throw fail(uiText('문서 폴더를 선택해 주세요.'));
      await contained(folder, folder);
      if (!(await fs.stat(folder)).isDirectory()) throw fail(uiText('폴더가 아닙니다.'));
      const config = await this.config();
      await atomicJson(path.join(this.root, 'config.json'), { ...config, documentsPath: folder });
      this.documentPaths.clear();
      this.indexDirty = true;
      await this.saveDocumentIndex();
      return { dataPath: this.root, documentsPath: folder };
    });
  }

  folderId(relative) {
    return relative ? `folder-${Buffer.from(relative).toString('base64url')}` : null;
  }
  rememberDocument(id, file) {
    if (this.documentPaths.get(id) === file) return;
    this.documentPaths.set(id, file);
    this.indexDirty = true;
  }
  forgetDocument(id) {
    if (this.documentPaths.delete(id)) this.indexDirty = true;
  }
  async saveDocumentIndex() {
    if (!this.indexDirty) return;
    const { documentsPath } = await this.config();
    const paths = Object.fromEntries(
      [...this.documentPaths].map(([id, file]) => [id, path.relative(documentsPath, file)])
    );
    await atomicJson(await contained(this.root, path.join(this.root, 'document-index.json')), { documentsPath, paths });
    this.indexDirty = false;
  }
  async folderPath(id) {
    const root = (await this.config()).documentsPath;
    if (!id) return root;
    if (typeof id !== 'string' || !/^folder-[\w-]+$/.test(id)) throw fail(uiText('잘못된 폴더입니다.'));
    const relative = Buffer.from(id.slice(7), 'base64url').toString();
    const result = await contained(root, path.resolve(root, relative));
    if (!(await fs.stat(result)).isDirectory()) throw fail(uiText('폴더를 찾을 수 없습니다.'));
    return result;
  }

  async documentRecord(file, root) {
    const { value, revision } = await readJson(await contained(root, file));
    if (
      !['dkt-document', 'dockit-document'].includes(value.fileType) ||
      (value.schemaVersion || 0) > 2 ||
      typeof value.content !== 'string'
    )
      throw fail(uiText('지원하지 않는 문서입니다: {0}', path.basename(file)));
    const externalId = [...this.externalDocuments].find(([, target]) => target === file)?.[0];
    const id = externalId || value._local?.id || `doc-${hash(path.relative(root, file)).slice(0, 32)}`;
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw fail(uiText('문서 ID가 올바르지 않습니다.'));
    if (this.externalDocuments.has(id) && this.externalDocuments.get(id) !== file)
      throw fail(uiText('문서 ID가 중복되었습니다.'));
    if (this.documentPaths.has(id) && this.documentPaths.get(id) !== file) {
      try {
        await fs.access(this.documentPaths.get(id));
        throw fail(uiText('문서 ID가 중복되었습니다: {0}', path.basename(file)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!externalId) this.rememberDocument(id, file);
    const stat = await fs.stat(file);
    return {
      ...value,
      _id: id,
      revision,
      title: value.title || path.basename(file, '.dkt'),
      content_type: 'documents',
      user_uid: 'local',
      parent_id: externalId ? null : this.folderId(path.relative(root, path.dirname(file))),
      created_at: value._local?.createdAt || stat.birthtime.toISOString(),
      updated_at: stat.mtime.toISOString(),
      public: false,
      linkShare: false,
      teamMembers: []
    };
  }

  async openOriginal(file) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.dkt$/i.test(file))
      throw fail(uiText('Dockit 문서를 선택해주세요.'));
    file = await resolveSystemPath(path.resolve(file));
    await contained(path.parse(file).root, path.resolve(file));
    file = await fs.realpath(file);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.nlink !== 1) throw fail(uiText('연결된 문서는 열 수 없습니다.'));
    const root = (await this.config()).documentsPath;
    const relative = path.relative(await fs.realpath(root), file);
    if (!relative.startsWith('..') && !path.isAbsolute(relative))
      return this.documentRecord(path.resolve(root, relative), root);
    const id = `external-${hash(process.platform === 'win32' ? file.toLowerCase() : file).slice(0, 32)}`;
    if (this.documentPaths.has(id)) throw fail(uiText('문서 ID가 중복되었습니다.'));
    this.externalDocuments.set(id, file);
    try {
      return await this.documentRecord(file, path.dirname(file));
    } catch (error) {
      this.externalDocuments.delete(id);
      throw error;
    }
  }

  async documentRoot(id) {
    const file = this.externalDocuments.get(id);
    return file ? path.dirname(file) : (await this.config()).documentsPath;
  }

  async scan(parentId = null) {
    const root = (await this.config()).documentsPath;
    const folder = await this.folderPath(parentId);
    const warnings = [];
    const result = [];
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const names = new Set(entries.map(entry => entry.name));
    for (const [id, file] of this.documentPaths) {
      if (path.dirname(file) === folder && !names.has(path.basename(file))) this.forgetDocument(id);
    }
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.isSymbolicLink() ||
        (!entry.isDirectory() && !(entry.isFile() && /\.dkt$/i.test(entry.name)))
      )
        continue;
      try {
        const file = await contained(root, path.join(folder, entry.name));
        if (entry.isDirectory()) {
          const stat = await fs.stat(file);
          result.push({
            _id: this.folderId(path.relative(root, file)),
            title: entry.name,
            content_type: 'folders',
            parent_id: parentId,
            children: [],
            childrenLoaded: false,
            created_at: stat.birthtime.toISOString(),
            updated_at: stat.mtime.toISOString()
          });
        } else result.push(await this.documentRecord(file, root));
      } catch (error) {
        warnings.push(`${entry.name}: ${error.message}`);
      }
    }
    return { tree: result, warnings };
  }

  async tree(parentId = null) {
    const result = await this.scan();
    if (!parentId) return result;
    const root = (await this.config()).documentsPath;
    const folder = await this.folderPath(parentId);
    let nodes = result.tree;
    let relative = '';
    for (const part of path.relative(root, folder).split(path.sep).filter(Boolean)) {
      relative = path.join(relative, part);
      const node = nodes.find(item => item._id === this.folderId(relative));
      if (!node) throw fail(uiText('폴더를 찾을 수 없습니다.'));
      const children = await this.scan(node._id);
      node.children = children.tree;
      node.childrenLoaded = true;
      result.warnings.push(...children.warnings);
      nodes = node.children;
    }
    return result;
  }

  async documentPath(id) {
    if (this.externalDocuments.has(id)) {
      const file = this.externalDocuments.get(id);
      await contained(path.parse(file).root, file);
      if ((await fs.stat(file)).nlink !== 1 || (await fs.realpath(file)) !== file)
        throw fail(uiText('문서 경로가 변경되었습니다.'));
      return file;
    }
    if (!this.documentPaths.has(id)) await this.scan();
    const file = this.documentPaths.get(id);
    if (!file) throw fail(uiText('문서를 찾을 수 없습니다.'));
    const root = (await this.config()).documentsPath;
    await contained(root, file);
    const { value } = await readJson(file);
    const actualId = value._local?.id || `doc-${hash(path.relative(root, file)).slice(0, 32)}`;
    if (actualId !== id) {
      this.forgetDocument(id);
      throw fail(uiText('문서 경로가 변경되었습니다. 해당 폴더에서 다시 열어 주세요.'));
    }
    return file;
  }

  async featureFile(type, id = 'default') {
    if (!FEATURES[type] || !/^[\w-]{1,100}$/.test(id)) throw fail(uiText('잘못된 데이터 경로입니다.'));
    return contained(this.root, path.join(this.root, FEATURES[type], `${id}.json`));
  }

  request(action, args = {}) {
    return this.run(async () => {
      const result = await this.execute(action, args);
      await this.saveDocumentIndex();
      return result;
    });
  }

  async execute(action, { type, id, parentId = null, data = {}, title, sortBy = 'updated_at', sortOrder = -1 } = {}) {
    if (
      this.documentLocks.size &&
      ['documents', 'folders'].includes(type) &&
      ['update', 'delete', 'move'].includes(action)
    ) {
      if (type === 'folders' || this.documentLocks.has(id))
        throw fail(uiText('Codex가 문서를 작업 중입니다.'), 'DocumentLocked');
    }
    if (!['list', 'get', 'create', 'update', 'delete', 'move', 'tree'].includes(action))
      throw fail(uiText('지원하지 않는 작업입니다.'));
    if (!object(data)) throw fail(uiText('저장 데이터가 올바르지 않습니다.'));
    if (action === 'tree') return this.tree(parentId);
    const config = await this.config();
    if (['setting', 'panels'].includes(type)) {
      if (!['list', 'create', 'update'].includes(action)) throw fail(uiText('지원하지 않는 설정 작업입니다.'));
      if (action === 'list') return { content: [{ ...config[type], _id: 'default' }] };
      const { _id, userId, ...clean } = data;
      await atomicJson(path.join(this.root, 'config.json'), { ...config, [type]: { ...config[type], ...clean } });
      return { content: { ...config[type], ...clean, _id: 'default' } };
    }
    if (FEATURES[type]) {
      if (action === 'list') {
        const files = await fs.readdir(path.join(this.root, FEATURES[type]));
        const content = [];
        for (const file of files.filter(name => /^[\w-]+\.json$/.test(name)))
          content.push((await readJson(await this.featureFile(type, file.slice(0, -5)))).value);
        return { content };
      }
      const key = id || (['memo', 'char', 'stylePreset'].includes(type) ? 'default' : randomUUID());
      const file = await this.featureFile(type, key);
      if (action === 'get') return { content: (await readJson(file)).value };
      if (action === 'delete') {
        await this.trash(file);
        return { success: true };
      }
      if (!['create', 'update'].includes(action)) throw fail(uiText('지원하지 않는 데이터 작업입니다.'));
      const previous = action === 'update' ? (await readJson(file)).value : {};
      const record = { ...previous, ...data, _id: key };
      delete record.userId;
      await atomicJson(file, record, { exclusive: action === 'create' });
      return { content: record };
    }
    if (!['documents', 'folders'].includes(type)) throw fail(uiText('이 기능은 로컬판에서 사용할 수 없습니다.'));
    const root = config.documentsPath;
    if (action === 'list') {
      const result = await this.scan(parentId);
      const content = result.tree.filter(
        item => item.content_type === type && (!title || item.title.toLowerCase().includes(title.toLowerCase()))
      );
      content.sort(
        (a, b) =>
          String(a[sortBy] || '').localeCompare(String(b[sortBy] || ''), 'ko') *
          (Number(sortOrder) === 1 || sortOrder === 'asc' ? 1 : -1)
      );
      return { content, warnings: result.warnings };
    }
    if (action === 'create') {
      const parent = await this.folderPath(parentId);
      const name = safeName(data.title || (type === 'folders' ? uiText('새 폴더') : uiText('새 문서')));
      let file;
      for (let suffix = 0; ; suffix++) {
        file = await contained(
          root,
          path.join(parent, `${name}${suffix ? ` (${suffix})` : ''}${type === 'documents' ? '.dkt' : ''}`)
        );
        try {
          await fs.access(file);
        } catch (error) {
          if (error.code === 'ENOENT') break;
          throw error;
        }
      }
      if (type === 'folders') {
        await fs.mkdir(file);
        return {
          content: {
            _id: this.folderId(path.relative(root, file)),
            title: path.basename(file),
            parent_id: parentId,
            content_type: type
          }
        };
      }
      const record = this.documentPayload(data, { id: randomUUID(), createdAt: new Date().toISOString() });
      record.title = path.basename(file, '.dkt');
      await atomicJson(file, record, { exclusive: true });
      return { content: await this.documentRecord(file, root) };
    }
    const file = type === 'folders' ? await this.folderPath(id) : await this.documentPath(id);
    if (file === root) throw fail(uiText('기본 문서 폴더는 변경할 수 없습니다.'));
    if (action === 'delete') {
      await this.trash(file);
      for (const [documentId, cachedPath] of this.documentPaths) {
        const relative = path.relative(file, cachedPath);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) this.forgetDocument(documentId);
      }
      return { success: true };
    }
    if (action === 'move' || (type === 'folders' && action === 'update')) {
      const parent = action === 'move' ? await this.folderPath(parentId) : path.dirname(file);
      const destination = await contained(
        root,
        path.join(parent, action === 'move' ? path.basename(file) : safeName(data.title))
      );
      if (destination === file) return { success: true };
      if (type === 'folders' && !path.relative(file, destination).startsWith('..'))
        throw fail(uiText('폴더를 자기 내부로 옮길 수 없습니다.'));
      try {
        await fs.access(destination);
        throw fail(uiText('같은 이름의 파일 또는 폴더가 있습니다.'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await fs.rename(file, destination);
      for (const [documentId, cachedPath] of this.documentPaths) {
        const relative = path.relative(file, cachedPath);
        if (!relative.startsWith('..') && !path.isAbsolute(relative))
          this.rememberDocument(documentId, path.join(destination, relative));
      }
      return { success: true };
    }
    if (type !== 'documents') throw fail(uiText('지원하지 않는 폴더 작업입니다.'));
    const documentRoot = await this.documentRoot(id);
    const previous = await this.documentRecord(file, documentRoot);
    if (action === 'get') return { content: previous };
    if (action !== 'update') throw fail(uiText('지원하지 않는 문서 작업입니다.'));
    if (data.expectedRevision && data.expectedRevision !== previous.revision)
      throw fail(uiText('문서가 외부에서 변경되었습니다. 다시 열어 변경 내용을 확인해 주세요.'), 'RevisionConflict', {
        currentRevision: previous.revision
      });
    const external = this.externalDocuments.has(id);
    const next = this.documentPayload(
      { ...previous, ...data },
      { ...previous._local, id: external ? previous._local?.id : id, createdAt: previous.created_at }
    );
    safeName(next.title);
    const destination = external ? file : await contained(root, path.join(path.dirname(file), `${next.title}.dkt`));
    if (destination !== file) {
      try {
        await fs.access(destination);
        throw fail(uiText('같은 이름의 문서가 있습니다.'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await atomicJson(
      path.join(this.root, 'backups', `${id}.json`),
      this.documentPayload(previous, previous._local || { id })
    );
    const latest = await readJson(file);
    if (latest.revision !== previous.revision)
      throw fail(uiText('저장 중 문서가 외부에서 변경되었습니다.'), 'RevisionConflict', {
        currentRevision: latest.revision
      });
    await atomicJson(file, next);
    if (destination !== file) await fs.rename(file, destination);
    if (!external) this.rememberDocument(id, destination);
    return { content: await this.documentRecord(destination, documentRoot) };
  }

  documentPayload(data, local) {
    return {
      fileType: 'dkt-document',
      schemaVersion: /data-dockit-semantic-(key|role|tags)\s*=/i.test(data.content || '') ? 2 : 1,
      title: data.title || uiText('새 문서'),
      content: data.content || '<p></p>',
      docSetting: data.docSetting || {
        pageWidth: 210,
        pageHeight: 297,
        paddingTop: 25,
        paddingBottom: 25,
        paddingLeft: 25,
        paddingRight: 25,
        lineHeight: 1.5
      },
      bulletStyle: data.bulletStyle || {},
      viewPage: data.viewPage ?? true,
      pageNumber: data.pageNumber || 'none',
      focus: data.focus ?? null,
      ...(data.sourceFileName ? { sourceFileName: data.sourceFileName } : {}),
      ...(data.thumbnail ? { thumbnail: data.thumbnail } : {}),
      _local: local
    };
  }
}

module.exports = { LocalStore, contained, atomicJson, safeName, readJson };
