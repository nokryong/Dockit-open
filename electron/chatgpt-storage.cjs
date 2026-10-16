const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { contained, atomicJson } = require('./local-store.cjs');

class ChatGPTStorage {
  constructor(root, encryption) {
    this.root = root;
    this.directory = path.join(root, 'ai');
    this.encryption = encryption;
  }
  async file(name) { return contained(this.root, path.join(this.directory, name)); }
  async init() {
    await this.file('host.json');
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const host = await this.read('host.json');
    if (host) {
      if (!/^urn:uuid:[0-9a-f-]{36}$/i.test(host.id)) throw new Error('ChatGPT 설치 정보가 손상되었습니다.');
      this.hostId = host.id;
    } else {
      this.hostId = `urn:uuid:${randomUUID()}`;
      await atomicJson(await this.file('host.json'), { id: this.hostId }, { exclusive: true });
    }
    const saved = await this.read('connections.json');
    if (!saved) return { version: 1, activeId: null, profiles: [] };
    this.requireEncryption();
    try {
      if (saved.version !== 1 || typeof saved.encrypted !== 'string') throw new Error();
      const value = JSON.parse(this.encryption.decryptString(Buffer.from(saved.encrypted, 'base64')));
      if (value.version !== 1 || !Array.isArray(value.profiles) || value.profiles.some(p => !/^[\w-]{1,80}$/.test(p.id) || typeof p.clientId !== 'string' || p.clientId === 'dynamic_agent_client')) throw new Error();
      return value;
    } catch { throw new Error('저장된 ChatGPT 연결을 읽을 수 없습니다. 원래 OS 계정의 암호화 저장소를 확인해주세요.'); }
  }
  requireEncryption() {
    if (!this.encryption.isEncryptionAvailable() || this.encryption.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('OS의 안전한 인증 정보 저장소를 사용할 수 없습니다.');
    }
  }
  async read(name) {
    try {
      const file = await this.file(name);
      if ((await fs.stat(file)).size > 8 * 1024 * 1024) throw new Error('ChatGPT 저장 파일이 너무 큽니다.');
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async save(value) {
    this.requireEncryption();
    await atomicJson(await this.file('connections.json'), {
      version: 1,
      encrypted: this.encryption.encryptString(JSON.stringify(value)).toString('base64')
    });
  }
  async history(profileId) {
    if (!/^[\w-]{1,80}$/.test(profileId)) throw new Error('잘못된 ChatGPT 계정입니다.');
    const data = await this.read(`chats/${profileId}.json`);
    if (data && (!Array.isArray(data.messages) || data.messages.some(m => !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string'))) throw new Error('저장된 AI 대화를 읽을 수 없습니다.');
    return data?.messages || [];
  }
  async saveHistory(profileId, messages) {
    if (!/^[\w-]{1,80}$/.test(profileId)) throw new Error('잘못된 ChatGPT 계정입니다.');
    const file = await this.file(`chats/${profileId}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await atomicJson(file, { version: 1, messages });
  }
}
module.exports = { ChatGPTStorage };
