const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { contained, atomicJson } = require('./local-store.cjs');
const { allowedUrl } = require('../plugin-sdk/capabilities.cjs');
const { requestPublic } = require('./plugin-network.cjs');
const { writeClipboardImage } = require('./image-clipboard.cjs');

const binding = service => createHash('sha256').update(JSON.stringify({ url: service.url, credential: service.credential })).digest('hex');
const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const object = value => value && typeof value === 'object' && !Array.isArray(value);

class PluginServices {
  constructor({ store, encryption, fetcher = requestPublic, dialog, shell, getWindow, downloads, clipboard, ClipboardItem, nativeImage }) {
    Object.assign(this, { store, encryption, fetcher, dialog, shell, getWindow, downloads, clipboard, ClipboardItem, nativeImage });
  }

  context(sessionId, permission) {
    const session = this.store.session(sessionId);
    if (!session.manifest.permissions.includes(permission)) throw new Error('플러그인에 필요한 권한이 없습니다.');
    return session;
  }

  service(sessionId, id, permission) {
    const session = this.context(sessionId, permission);
    if (typeof id !== 'string' || !Object.hasOwn(session.manifest.services || {}, id)) throw new Error('등록되지 않은 API입니다.');
    return { ...session, service: session.manifest.services[id] };
  }

  requireEncryption() {
    if (!this.encryption?.isEncryptionAvailable() || this.encryption.getSelectedStorageBackend?.() === 'basic_text') throw new Error('OS의 안전한 인증 정보 저장소를 사용할 수 없습니다.');
  }

  async vault(pluginId) {
    const file = await contained(this.store.root, path.join(this.store.data, pluginId, 'credentials.json'));
    try {
      if ((await fs.stat(file)).size > 65536) throw new Error();
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      if (data.version !== 1 || !object(data.entries)) throw new Error();
      return { file, entries: data.entries };
    } catch (error) {
      if (error.code === 'ENOENT') return { file, entries: {} };
      throw new Error('저장된 API Key 정보를 읽을 수 없습니다.');
    }
  }

  async credentialStatus(sessionId, id) {
    const { pluginId, service } = this.service(sessionId, id, 'credentials');
    if (!service.credential) throw new Error('API Key를 사용하지 않는 API입니다.');
    const { entries } = await this.vault(pluginId);
    const entry = Object.hasOwn(entries, id) ? entries[id] : null;
    const configured = Boolean(entry?.binding === binding(service) && typeof entry.encrypted === 'string');
    return { id, label: service.label, url: service.url, configured, revision: configured ? entry.revision : null };
  }

  setCredential(sessionId, id, value) {
    return this.store.run(async () => {
      const { pluginId, service } = this.service(sessionId, id, 'credentials');
      if (!service.credential || typeof value !== 'string' || value.length > 4096 || /[\r\n\x00]/.test(value)) throw new Error('API Key 값을 확인해주세요.');
      const { file, entries } = await this.vault(pluginId);
      const key = value.trim();
      if (key) {
        this.requireEncryption();
        entries[id] = { binding: binding(service), revision: randomUUID(), encrypted: this.encryption.encryptString(key).toString('base64') };
      }
      else delete entries[id];
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await atomicJson(file, { version: 1, entries });
      return this.credentialStatus(sessionId, id);
    });
  }

  async credential(sessionId, id, service) {
    const { pluginId } = this.context(sessionId, 'credentials');
    const { entries } = await this.vault(pluginId);
    const entry = Object.hasOwn(entries, id) ? entries[id] : null;
    if (entry?.binding !== binding(service) || typeof entry.encrypted !== 'string') throw new Error('API Key를 먼저 설정해주세요.');
    this.requireEncryption();
    try { return this.encryption.decryptString(Buffer.from(entry.encrypted, 'base64')); }
    catch { throw new Error('API Key를 복호화할 수 없습니다. 다시 설정해주세요.'); }
  }

  async get(sessionId, payload) {
    if (!object(payload)) throw new Error('API 요청을 확인해주세요.');
    const { service } = this.service(sessionId, payload.service, 'network');
    const params = payload.params ?? {};
    if (!object(params) || Object.keys(params).length > 32) throw new Error('API 검색 조건을 확인해주세요.');
    const url = new URL(service.url);
    for (const [name, value] of Object.entries(params)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 2048 || name.toLowerCase() === service.credential?.name.toLowerCase()) throw new Error('API 검색 조건을 확인해주세요.');
      url.searchParams.set(name, String(value));
    }
    const headers = { Accept: 'application/json', 'User-Agent': 'Dockit-Open' };
    if (service.credential) {
      const key = service.credential.prefix + await this.credential(sessionId, payload.service, service);
      if (service.credential.in === 'query') url.searchParams.set(service.credential.name, key);
      else headers[service.credential.name] = key;
    }
    let response;
    try { response = await this.fetcher(url, { headers, limit: 2 * 1024 * 1024 }); }
    catch { throw new Error('API에 연결하지 못했습니다. 네트워크를 확인해주세요.'); }
    // Never follow authenticated redirects or return response bodies that may echo credentials.
    if ([401, 403].includes(response.status)) throw new Error('API Key와 접근 권한을 확인해주세요.');
    if (response.status === 429) throw new Error('API 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
    if (response.status < 200 || response.status >= 300) throw new Error(`API 요청에 실패했습니다. (${response.status})`);
    if (response.bytes.length > 2 * 1024 * 1024) throw new Error('API 응답 크기가 너무 큽니다.');
    this.store.session(sessionId);
    try { return JSON.parse(response.bytes); } catch { throw new Error('API 응답을 읽을 수 없습니다.'); }
  }

  async preview(sessionId, payload) {
    const { manifest } = this.context(sessionId, 'images');
    if (!object(payload)) throw new Error('이미지 정보를 확인해주세요.');
    const result = { url: allowedUrl(payload.url, manifest.imageOrigins).href };
    for (const name of ['alt', 'author', 'caption', 'filename']) {
      if (payload[name] !== undefined && (typeof payload[name] !== 'string' || payload[name].length > 1000)) throw new Error('이미지 정보를 확인해주세요.');
      result[name] = payload[name] || '';
    }
    if (payload.authorImage) result.authorImage = allowedUrl(payload.authorImage, manifest.imageOrigins).href;
    for (const name of ['authorUrl', 'sourceUrl']) if (payload[name]) {
      this.context(sessionId, 'external');
      result[name] = allowedUrl(payload[name], manifest.externalOrigins).href;
    }
    if (Number.isSafeInteger(payload.likes) && payload.likes >= 0) result.likes = payload.likes;
    // Keep the application's own image CSP closed to remote hosts.
    const [image, avatar] = await Promise.all([
      this.fetchImage(sessionId, result.url),
      result.authorImage ? this.fetchImage(sessionId, result.authorImage).catch(() => null) : null,
    ]);
    result.displaySrc = `data:${image.type};base64,${image.bytes.toString('base64')}`;
    if (avatar) result.avatarSrc = `data:${avatar.type};base64,${avatar.bytes.toString('base64')}`;
    this.store.session(sessionId);
    return result;
  }

  async fetchImage(sessionId, source) {
    const { manifest } = this.context(sessionId, 'images');
    let url = allowedUrl(source, manifest.imageOrigins);
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      try { response = await this.fetcher(url, { limit: 32 * 1024 * 1024 }); }
      catch { throw new Error('이미지를 다운로드하지 못했습니다.'); }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirects === 3 || !response.headers.location) throw new Error('이미지 다운로드 주소를 확인해주세요.');
      url = allowedUrl(new URL(response.headers.location, url).href, manifest.imageOrigins);
    }
    const type = response.headers['content-type']?.split(';')[0].trim().toLowerCase();
    const extension = imageTypes[type];
    if (response.status !== 200 || !extension || response.bytes.length > 32 * 1024 * 1024) throw new Error('다운로드할 이미지 형식을 확인해주세요.');
    this.store.session(sessionId);
    return { bytes: response.bytes, extension, type };
  }

  async download(sessionId, payload) {
    if (!object(payload)) throw new Error('이미지 정보를 확인해주세요.');
    const { bytes, extension } = await this.fetchImage(sessionId, payload.url);
    const requested = typeof payload.filename === 'string' ? payload.filename : 'image';
    const name = requested.replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 100) || 'image';
    const result = await this.dialog.showSaveDialog(this.getWindow(), { title: '이미지 저장', defaultPath: path.join(this.downloads, `${name}.${extension}`), filters: [{ name: '이미지', extensions: [extension] }] });
    if (result.canceled || !result.filePath) return false;
    this.store.session(sessionId);
    await fs.writeFile(result.filePath, bytes);
    return true;
  }

  async loadImage(sessionId, source) {
    const image = await this.fetchImage(sessionId, source);
    return `data:${image.type};base64,${image.bytes.toString('base64')}`;
  }

  async copyImage(sessionId, payload) {
    this.context(sessionId, 'images');
    const dataUrl = payload?.dataUrl;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 32 * 1024 * 1024 * 4 / 3 + 22) throw new Error('복사할 이미지 형식을 확인해주세요.');
    const image = this.nativeImage.createFromDataURL(dataUrl);
    await writeClipboardImage(this, image);
    return true;
  }

  async openExternal(sessionId, url) {
    const { manifest } = this.context(sessionId, 'external');
    await this.shell.openExternal(allowedUrl(url, manifest.externalOrigins).href);
    return true;
  }

  request(sessionId, method, payload) {
    if (method === 'credentials.status') return this.credentialStatus(sessionId, payload?.service);
    if (method === 'credentials.set') return this.setCredential(sessionId, payload?.service, payload?.value);
    if (method === 'network.get') return this.get(sessionId, payload);
    if (method === 'images.preview') return this.preview(sessionId, payload);
    if (method === 'images.load') return this.loadImage(sessionId, payload?.url);
    if (method === 'images.download') return this.download(sessionId, payload);
    if (method === 'images.copy') return this.copyImage(sessionId, payload);
    if (method === 'external.open') return this.openExternal(sessionId, payload?.url);
    throw new Error('지원하지 않는 플러그인 요청입니다.');
  }
}

module.exports = { PluginServices };
