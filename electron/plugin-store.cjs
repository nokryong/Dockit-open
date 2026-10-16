const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { contained, atomicJson } = require('./local-store.cjs');
const { ICON_LIMIT, withIcons } = require('../plugin-sdk/icons.cjs');
const { readPackage, validateManifest, safePath, SDK_VERSION, LIMITS, ID, object, fail } = require('../plugin-sdk/manifest.cjs');

class PluginStore {
  constructor({ root, trash }) {
    this.root = path.resolve(root);
    this.packages = path.join(this.root, 'plugins');
    this.data = path.join(this.root, 'plugin-data');
    this.trash = trash;
    this.installed = new Map();
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
    for (const folder of [this.packages, this.data]) await fs.mkdir(await contained(this.root, folder), { recursive: true });
    for (const entry of await fs.readdir(this.packages, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ID.test(entry.name)) continue;
      try {
        const folder = await contained(this.root, path.join(this.packages, entry.name));
        const file = await contained(this.root, path.join(folder, 'manifest.json'));
        if ((await fs.stat(file)).size > 65536) throw fail('manifest.json 크기가 너무 큽니다.');
        const manifest = validateManifest(JSON.parse(await fs.readFile(file, 'utf8')));
        if (manifest.id !== entry.name) throw fail('설치 폴더와 플러그인 ID가 다릅니다.');
        for (const widget of manifest.widgets) {
          if (!(await fs.stat(await contained(this.root, path.join(folder, widget.entry)))).isFile()) throw fail('툴킷 시작 파일이 없습니다.');
        }
        this.installed.set(manifest.id, await withIcons(manifest, async relative => {
          const iconFile = await contained(folder, path.join(folder, relative));
          const stat = await fs.stat(iconFile);
          if (!stat.isFile() || stat.size > ICON_LIMIT) throw fail('아이콘 SVG 파일을 읽을 수 없습니다.');
          return fs.readFile(iconFile);
        }));
      } catch { this.warnings.push(`${entry.name}: 플러그인을 불러오지 못했습니다.`); }
    }
  }

  list() { return { plugins: [...this.installed.values()], warnings: this.warnings }; }

  async installFile(file) {
    if ((await fs.stat(file)).size > LIMITS.archive) throw fail('플러그인 ZIP 파일은 32 MiB 이하여야 합니다.');
    return this.installBytes(await fs.readFile(file));
  }

  installBytes(bytes) {
    return this.run(async () => {
      const { manifest, files } = readPackage(bytes);
      const installed = await withIcons(manifest, relative => files[relative]);
      const destination = await contained(this.root, path.join(this.packages, manifest.id));
      if (this.installed.has(manifest.id) || await fs.lstat(destination).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw fail('이미 설치된 플러그인입니다. 삭제 후 다시 설치해주세요.');
      const temporary = await contained(this.root, path.join(this.packages, `.install-${randomUUID()}`));
      await fs.mkdir(temporary);
      try {
        for (const [name, bytes] of Object.entries(files)) {
          const target = await contained(temporary, path.join(temporary, safePath(name)));
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, bytes, { flag: 'wx' });
        }
        await fs.rename(temporary, destination);
        this.installed.set(manifest.id, installed);
        this.warnings = this.warnings.filter(warning => !warning.startsWith(`${manifest.id}:`));
        return installed;
      } finally {
        // Only this operation's staging directory, never an installed package.
        await contained(this.root, temporary);
        await fs.rm(temporary, { recursive: true, force: true });
      }
    });
  }

  uninstall(id, keepData) {
    return this.run(async () => {
      const manifest = this.installed.get(id);
      if (!manifest || typeof keepData !== 'boolean') throw fail('삭제할 플러그인과 데이터 처리 방식을 확인해주세요.');
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
          try { await fs.rename(data, path.join(temporary, 'data')); dataMoved = true; }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        this.installed.delete(id);
        await this.trash(temporary);
        for (const [key, session] of this.sessions) if (session.pluginId === id) this.sessions.delete(key);
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
    if (!widget) throw fail('설치된 툴킷을 찾을 수 없습니다.');
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { pluginId: id, widgetId });
    return { sessionId, url: `dockit-plugin://${sessionId}/${widget.entry.split('/').map(encodeURIComponent).join('/')}` };
  }

  close(sessionId) { this.sessions.delete(sessionId); }
  closeAll() { this.sessions.clear(); }

  session(sessionId) {
    const session = this.sessions.get(sessionId);
    const manifest = session && this.installed.get(session.pluginId);
    if (!manifest) throw fail('플러그인이 종료되었습니다.');
    return { ...session, manifest };
  }

  storage(sessionId, operation, key, value) {
    return this.run(async () => {
      const { pluginId, manifest } = this.session(sessionId);
      if (!manifest.permissions.includes('storage')) throw fail('데이터 저장 권한이 없는 플러그인입니다.');
      if (!['get', 'set', 'remove'].includes(operation) || typeof key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(key) || ['constructor', 'prototype'].includes(key)) throw fail('잘못된 플러그인 저장 요청입니다.');
      const folder = await contained(this.root, path.join(this.data, pluginId));
      const file = await contained(this.root, path.join(folder, 'storage.json'));
      let state = {};
      try {
        if ((await fs.stat(file)).size > LIMITS.data) throw fail('플러그인 데이터 크기가 너무 큽니다.');
        state = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!object(state)) throw fail('플러그인 데이터가 손상되었습니다.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (operation === 'get') return Object.hasOwn(state, key) ? state[key] : null;
      if (operation === 'remove') delete state[key];
      else {
        if (value === undefined) throw fail('저장할 JSON 값이 필요합니다.');
        state[key] = value;
      }
      let json;
      try { json = JSON.stringify(state); } catch { throw fail('JSON으로 저장할 수 없는 데이터입니다.'); }
      if (Buffer.byteLength(json) > LIMITS.data) throw fail('플러그인 데이터는 8 MiB 이하여야 합니다.');
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
    if (!stat.isFile() || stat.size > LIMITS.file) throw fail('플러그인 파일을 읽을 수 없습니다.');
    return { bytes: await fs.readFile(file), extension: path.extname(file).toLowerCase() };
  }
}

module.exports = { PluginStore, readPackage, validateManifest, safePath, SDK_VERSION, LIMITS };
