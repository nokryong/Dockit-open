const { t: uiText } = require('./i18n.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { contained, atomicJson, readJson } = require('./local-store.cjs');

const valid = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
const summary = record => ({
  id: record.id,
  title:
    record.messages
      .find(message => message.role === 'user')
      ?.text?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) || uiText('새 대화'),
  documentId: record.documentId,
  updatedAt: record.updatedAt
});

// 계정 연결은 하나를 공유하지만 창마다 선택한 대화는 따로 유지
class Conversations {
  constructor({ root, provider, trash, account, legacy, activate, snapshot, removeLegacy = async () => {} }) {
    this.workspaceRoot = root;
    this.root = path.join(root, 'ai', 'conversations', provider);
    this.trash = trash;
    this.account = account;
    this.legacy = legacy;
    this.activate = activate;
    this.snapshot = snapshot;
    this.removeLegacy = removeLegacy;
    this.indexes = new Map();
    this.initializing = new Map();
    this.selections = new Map();
    this.tail = Promise.resolve();
    this.active = null;
  }
  async directory(account) {
    if (!valid(account)) throw new Error(uiText('연결 계정을 확인해주세요.'));
    const directory = await contained(this.workspaceRoot, path.join(this.root, account));
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }
  async file(account, id) {
    if (!valid(id)) throw new Error(uiText('대화를 찾을 수 없습니다.'));
    return contained(await this.directory(account), path.join(this.root, account, `${id}.json`));
  }
  async initialize(account) {
    if (this.indexes.has(account)) return;
    if (this.initializing.has(account)) return this.initializing.get(account);
    const task = (async () => {
      const indexFile = await this.file(account, 'index');
      let index = (await readJson(indexFile, null)).value;
      if (!index) {
        index = { version: 1, items: [] };
        const previous = await this.legacy();
        if (previous?.messages?.length) {
          const record = { ...previous, id: 'legacy', documentId: null, updatedAt: new Date().toISOString() };
          await atomicJson(await this.file(account, record.id), record);
          index.items.push(summary(record));
        }
        await atomicJson(indexFile, index);
      }
      if (index.version !== 1 || !Array.isArray(index.items)) throw new Error(uiText('대화 목록을 읽지 못했습니다.'));
      // 인덱스 기록 중 충돌로 끊기기 직전에 저장된 대화 복구
      const files = await fs.readdir(await this.directory(account));
      const known = new Set(index.items.map(item => item.id));
      for (const file of files) {
        const id = file.slice(0, -5);
        if (!file.endsWith('.json') || id === 'index' || known.has(id) || !valid(id)) continue;
        const record = (await readJson(await this.file(account, id))).value;
        if (record.messages?.length) index.items.push(summary(record));
      }
      index.items = index.items.filter(item => files.includes(`${item.id}.json`));
      await atomicJson(indexFile, index);
      this.indexes.set(account, index);
    })();
    this.initializing.set(account, task);
    try {
      await task;
    } finally {
      this.initializing.delete(account);
    }
  }
  async context() {
    const account = await this.account();
    if (!account) throw new Error(uiText('먼저 로그인해주세요.'));
    await this.initialize(account);
    return account;
  }
  async read(account, id) {
    const record = (await readJson(await this.file(account, id))).value;
    if (record.id !== id || !Array.isArray(record.messages)) throw new Error(uiText('대화를 읽지 못했습니다.'));
    return record;
  }
  async selected(owner, documentId = null) {
    const account = await this.context();
    let selected = this.selections.get(owner);
    if (selected?.account !== account) {
      const latest = this.indexes
        .get(account)
        .items.filter(item => item.documentId === documentId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      selected = {
        account,
        record: latest ? await this.read(account, latest.id) : { id: randomUUID(), documentId, messages: [] }
      };
      this.selections.set(owner, selected);
    }
    if (this.active?.account === account && this.active.record.id === selected.record.id) return this.active;
    return selected;
  }
  async list() {
    const account = await this.context();
    await this.tail;
    return [...this.indexes.get(account).items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async history(owner, documentId) {
    return (await this.selected(owner, documentId)).record.messages;
  }
  async select(owner, id) {
    if (this.active?.owner === owner) throw new Error(uiText('응답이 끝난 뒤 대화를 선택해주세요.'));
    const account = await this.context();
    await this.tail;
    if (!this.indexes.get(account).items.some(item => item.id === id))
      throw new Error(uiText('대화를 찾을 수 없습니다.'));
    const record = await this.read(account, id);
    this.selections.set(owner, { account, record });
    return this.history(owner);
  }
  async create(owner, documentId = null) {
    if (this.active?.owner === owner) throw new Error(uiText('응답이 끝난 뒤 새 대화를 시작해주세요.'));
    const account = await this.context();
    this.selections.set(owner, { account, record: { id: randomUUID(), documentId, messages: [] } });
    return [];
  }
  write(account, payload) {
    const active = this.active;
    if (!active || active.account !== account) return Promise.resolve();
    const record = { ...active.record, ...structuredClone(payload), updatedAt: new Date().toISOString() };
    active.record = record;
    const job = this.tail.then(async () => {
      if (!record.messages.length) return;
      await atomicJson(await this.file(account, record.id), record);
      const index = this.indexes.get(account);
      index.items = [...index.items.filter(item => item.id !== record.id), summary(record)];
      await atomicJson(await this.file(account, 'index'), index);
    });
    this.tail = job.catch(() => {});
    return job;
  }
  async run(owner, documentId, work) {
    if (this.active) throw new Error(uiText('응답이 끝난 뒤 다시 시도해주세요.'));
    const selected = await this.selected(owner, documentId);
    if (this.active) throw new Error(uiText('응답이 끝난 뒤 다시 시도해주세요.'));
    this.active = { ...selected, owner, record: structuredClone(selected.record) };
    try {
      await this.activate(this.active.record);
      return await work();
    } finally {
      try {
        await this.write(this.active.account, await this.snapshot());
      } finally {
        const completed = this.active;
        for (const selection of this.selections.values())
          if (selection.account === completed.account && selection.record.id === completed.record.id)
            selection.record = completed.record;
        this.active = null;
      }
    }
  }
  async remove(owner, id) {
    const account = await this.context();
    if (this.active?.account === account && this.active.record.id === id)
      throw new Error(uiText('응답 중인 대화는 삭제할 수 없습니다.'));
    let removed;
    const job = this.tail.then(async () => {
      const index = this.indexes.get(account);
      if (!index.items.some(item => item.id === id)) throw new Error(uiText('대화를 찾을 수 없습니다.'));
      removed = await this.read(account, id);
      await this.trash(await this.file(account, id));
      index.items = index.items.filter(item => item.id !== id);
      await atomicJson(await this.file(account, 'index'), index);
    });
    this.tail = job.catch(() => {});
    await job;
    for (const [windowId, selection] of this.selections)
      if (selection.account === account && selection.record.id === id) {
        this.selections.set(windowId, {
          account,
          record: { id: randomUUID(), documentId: selection.record.documentId, messages: [] }
        });
      }
    await this.removeLegacy(removed);
    return this.history(owner);
  }
  recipients() {
    if (!this.active) return [];
    return [...this.selections]
      .filter(
        ([, selected]) => selected.account === this.active.account && selected.record.id === this.active.record.id
      )
      .map(([owner]) => owner);
  }
  async hasImage(id) {
    const account = await this.context();
    for (const item of this.indexes.get(account).items)
      if ((await this.read(account, item.id)).messages.some(message => message.imageId === id)) return true;
    return false;
  }
}

module.exports = { Conversations };
