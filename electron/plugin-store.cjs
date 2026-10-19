const { t: uiText } = require('./i18n.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { contained, atomicJson } = require('./local-store.cjs');
const { ICON_LIMIT, withIcons } = require('../plugin-sdk/icons.cjs');
const {
  readPackage,
  validateManifest,
  safePath,
  SDK_VERSION,
  LIMITS,
  ID,
  object,
  fail
} = require('../plugin-sdk/manifest.cjs');
const { compareVersions, normalizeSource, legacySource } = require('./plugin-updates.cjs');

class PluginStore {
  constructor({ root, trash }) {
    this.root = path.resolve(root);
    this.packages = path.join(this.root, 'plugins');
    this.data = path.join(this.root, 'plugin-data');
    this.trash = trash;
    this.installed = new Map();
    this.sources = new Map();
    this.sessions = new Map();
    this.warnings = [];
    this.queue = Promise.resolve();
  }

  run(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async init() {
    for (const folder of [this.packages, this.data])
      await fs.mkdir(await contained(this.root, folder), { recursive: true });
    await this.recoverUpdates();
    for (const entry of await fs.readdir(this.packages, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ID.test(entry.name)) continue;
      try {
        const folder = await contained(this.root, path.join(this.packages, entry.name));
        const file = await contained(this.root, path.join(folder, 'manifest.json'));
        if ((await fs.stat(file)).size > 65536) throw fail(uiText('manifest.json 크기가 너무 큽니다.'));
        const manifest = validateManifest(JSON.parse(await fs.readFile(file, 'utf8')));
        if (manifest.id !== entry.name) throw fail(uiText('설치 폴더와 플러그인 ID가 다릅니다.'));
        for (const widget of manifest.widgets) {
          if (!(await fs.stat(await contained(this.root, path.join(folder, widget.entry)))).isFile())
            throw fail(uiText('툴킷 시작 파일이 없습니다.'));
        }
        this.installed.set(
          manifest.id,
          await withIcons(manifest, async relative => {
            const iconFile = await contained(folder, path.join(folder, relative));
            const stat = await fs.stat(iconFile);
            if (!stat.isFile() || stat.size > ICON_LIMIT) throw fail(uiText('아이콘 SVG 파일을 읽을 수 없습니다.'));
            return fs.readFile(iconFile);
          })
        );
        try {
          const receipt = await contained(folder, path.join(folder, '__dockit', 'source.json'));
          if ((await fs.stat(receipt)).size > 8192) throw fail(uiText('플러그인 설치 출처를 확인해주세요.'));
          this.sources.set(manifest.id, normalizeSource(JSON.parse(await fs.readFile(receipt, 'utf8'))));
        } catch (error) {
          if (error.code === 'ENOENT') this.sources.set(manifest.id, legacySource(manifest));
          else this.warnings.push(uiText('{0}: 업데이트 출처를 읽을 수 없습니다.', manifest.name));
        }
      } catch {
        this.warnings.push(uiText('{0}: 플러그인을 불러오지 못했습니다.', entry.name));
      }
    }
  }

  list() {
    return { plugins: [...this.installed.values()], warnings: this.warnings };
  }
  source(id) {
    return this.sources.get(id) || null;
  }

  async writePackage(folder, files, source) {
    await fs.mkdir(folder);
    for (const [name, bytes] of Object.entries(files)) {
      const target = await contained(folder, path.join(folder, safePath(name)));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes, { flag: 'wx' });
    }
    if (source) {
      await fs.mkdir(path.join(folder, '__dockit'));
      await atomicJson(path.join(folder, '__dockit', 'source.json'), source);
    }
  }

  async recoverUpdates() {
    for (const entry of await fs.readdir(this.packages, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\.update-[a-f0-9-]{36}$/.test(entry.name)) continue;
      const temporary = await contained(this.packages, path.join(this.packages, entry.name));
      const previous = await contained(temporary, path.join(temporary, 'previous'));
      const hasPrevious = await fs.lstat(previous).then(
        () => true,
        error => {
          if (error.code === 'ENOENT') return false;
          throw error;
        }
      );
      if (!hasPrevious) {
        await fs.rm(await contained(this.packages, temporary), { recursive: true, force: true });
        continue;
      }
      try {
        const file = await contained(previous, path.join(previous, 'manifest.json'));
        if ((await fs.stat(file)).size > 65536) throw fail(uiText('플러그인 복구 정보를 확인해주세요.'));
        const manifest = validateManifest(JSON.parse(await fs.readFile(file, 'utf8')));
        const destination = await contained(this.packages, path.join(this.packages, manifest.id));
        const exists = await fs.lstat(destination).then(
          () => true,
          error => {
            if (error.code === 'ENOENT') return false;
            throw error;
          }
        );
        if (!exists) await fs.rename(previous, destination);
      } catch {
        this.warnings.push(uiText('중단된 플러그인 업데이트를 복구하지 못했습니다.'));
        continue;
      }
      await fs.rm(await contained(this.packages, temporary), { recursive: true, force: true });
    }
  }

  async installFile(file) {
    if ((await fs.stat(file)).size > LIMITS.archive) throw fail(uiText('플러그인 ZIP 파일은 32 MiB 이하여야 합니다.'));
    return this.installBytes(await fs.readFile(file));
  }

  installBytes(bytes, source = null) {
    return this.run(async () => {
      if (source) source = normalizeSource(source);
      const { manifest, files } = readPackage(bytes);
      const installed = await withIcons(manifest, relative => files[relative]);
      const destination = await contained(this.root, path.join(this.packages, manifest.id));
      if (
        this.installed.has(manifest.id) ||
        (await fs.lstat(destination).then(
          () => true,
          error => {
            if (error.code === 'ENOENT') return false;
            throw error;
          }
        ))
      )
        throw fail(uiText('이미 설치된 플러그인입니다. 목록에서 업데이트를 확인해주세요.'));
      const temporary = await contained(this.root, path.join(this.packages, `.install-${randomUUID()}`));
      try {
        await this.writePackage(temporary, files, source);
        await fs.rename(temporary, destination);
        this.installed.set(manifest.id, installed);
        this.sources.set(manifest.id, source || legacySource(manifest));
        this.warnings = this.warnings.filter(warning => !warning.startsWith(`${manifest.id}:`));
        return installed;
      } finally {
        // Only this operation's staging directory, never an installed package.
        await contained(this.root, temporary);
        await fs.rm(temporary, { recursive: true, force: true });
      }
    });
  }

  updateBytes(id, bytes, source) {
    return this.run(async () => {
      const current = this.installed.get(id);
      const origin = this.source(id);
      const nextSource = normalizeSource(source);
      const { manifest, files } = readPackage(bytes);
      if (
        !current ||
        manifest.id !== id ||
        manifest.publisher !== current.publisher ||
        !origin ||
        origin.url !== nextSource.url
      )
        throw fail(uiText('설치된 플러그인과 업데이트 출처가 일치하지 않습니다.'));
      if (compareVersions(manifest.version, current.version) <= 0)
        throw fail(uiText('이미 최신 버전의 플러그인입니다.'));
      const installed = await withIcons(manifest, relative => files[relative]);
      const destination = await contained(this.packages, path.join(this.packages, id));
      const temporary = await contained(this.packages, path.join(this.packages, `.update-${randomUUID()}`));
      const next = path.join(temporary, 'next'),
        previous = path.join(temporary, 'previous');
      await fs.mkdir(temporary);
      let moved = false;
      let committed = false;
      try {
        await this.writePackage(next, files, nextSource);
        await fs.rename(destination, previous);
        moved = true;
        try {
          await fs.rename(next, destination);
        } catch (error) {
          await fs.rename(previous, destination);
          moved = false;
          throw error;
        }
        this.installed.set(id, installed);
        this.sources.set(id, nextSource);
        for (const [key, session] of this.sessions) if (session.pluginId === id) this.sessions.delete(key);
        committed = true;
        return installed;
      } finally {
        // Retain the previous package for startup recovery if rollback itself failed.
        if (!moved || committed)
          await fs.rm(await contained(this.packages, temporary), { recursive: true, force: true }).catch(() => {});
      }
    });
  }

  uninstall(id, keepData) {
    return this.run(async () => {
      const manifest = this.installed.get(id);
      if (!manifest || typeof keepData !== 'boolean')
        throw fail(uiText('삭제할 플러그인과 데이터 처리 방식을 확인해주세요.'));
      const source = await contained(this.root, path.join(this.packages, id));
      const data = await contained(this.root, path.join(this.data, id));
      const temporary = await contained(this.root, path.join(this.packages, `.remove-${randomUUID()}`));
      await fs.mkdir(temporary);
      let packageMoved = false;
      let dataMoved = false;
      try {
        await fs.rename(source, path.join(temporary, 'package'));
        packageMoved = true;
        if (!keepData) {
          try {
            await fs.rename(data, path.join(temporary, 'data'));
            dataMoved = true;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        this.installed.delete(id);
        await this.trash(temporary);
        for (const [key, session] of this.sessions) if (session.pluginId === id) this.sessions.delete(key);
        this.sources.delete(id);
      } catch (error) {
        if (dataMoved) await fs.rename(path.join(temporary, 'data'), data);
        if (packageMoved) await fs.rename(path.join(temporary, 'package'), source);
        this.installed.set(id, manifest);
        await fs.rmdir(temporary).catch(() => {});
        throw error;
      }
      return true;
    });
  }

  open(id, widgetId) {
    const widget = this.installed.get(id)?.widgets.find(item => item.id === widgetId);
    if (!widget) throw fail(uiText('설치된 툴킷을 찾을 수 없습니다.'));
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { pluginId: id, widgetId });
    return {
      sessionId,
      url: `dockit-plugin://${sessionId}/${widget.entry.split('/').map(encodeURIComponent).join('/')}`
    };
  }

  close(sessionId) {
    this.sessions.delete(sessionId);
  }
  closeAll() {
    this.sessions.clear();
  }

  session(sessionId) {
    const session = this.sessions.get(sessionId);
    const manifest = session && this.installed.get(session.pluginId);
    if (!manifest) throw fail(uiText('플러그인이 종료되었습니다.'));
    return { ...session, manifest };
  }

  storage(sessionId, operation, key, value) {
    return this.run(async () => {
      const { pluginId, manifest } = this.session(sessionId);
      if (!manifest.permissions.includes('storage')) throw fail(uiText('데이터 저장 권한이 없는 플러그인입니다.'));
      if (
        !['get', 'set', 'remove'].includes(operation) ||
        typeof key !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(key) ||
        ['constructor', 'prototype'].includes(key)
      )
        throw fail(uiText('잘못된 플러그인 저장 요청입니다.'));
      const folder = await contained(this.root, path.join(this.data, pluginId));
      const file = await contained(this.root, path.join(folder, 'storage.json'));
      let state = {};
      try {
        if ((await fs.stat(file)).size > LIMITS.data) throw fail(uiText('플러그인 데이터 크기가 너무 큽니다.'));
        state = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!object(state)) throw fail(uiText('플러그인 데이터가 손상되었습니다.'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (operation === 'get') return Object.hasOwn(state, key) ? state[key] : null;
      if (operation === 'remove') delete state[key];
      else {
        if (value === undefined) throw fail(uiText('저장할 JSON 값이 필요합니다.'));
        state[key] = value;
      }
      let json;
      try {
        json = JSON.stringify(state);
      } catch {
        throw fail(uiText('JSON으로 저장할 수 없는 데이터입니다.'));
      }
      if (Buffer.byteLength(json) > LIMITS.data) throw fail(uiText('플러그인 데이터는 8 MiB 이하여야 합니다.'));
      await fs.mkdir(folder, { recursive: true });
      await atomicJson(file, JSON.parse(json));
      return true;
    });
  }

  async asset(sessionId, pathname) {
    const { pluginId } = this.session(sessionId);
    const relative = safePath(decodeURIComponent(pathname).replace(/^\//, ''));
    const file = await contained(this.root, path.join(this.packages, pluginId, relative));
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > LIMITS.file) throw fail(uiText('플러그인 파일을 읽을 수 없습니다.'));
    return { bytes: await fs.readFile(file), extension: path.extname(file).toLowerCase() };
  }
}

module.exports = { PluginStore, readPackage, validateManifest, safePath, SDK_VERSION, LIMITS };
