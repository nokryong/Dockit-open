const path = require('node:path');
const { randomUUID } = require('node:crypto');

class DocumentWindows {
  constructor() { this.windows = new Map(); this.pendingSaves = new Map(); this.opening = Promise.resolve(); }
  add(window, documentId = null) {
    const id = window.webContents.id;
    this.windows.set(id, { window, documentId });
    window.once('closed', () => {
      this.windows.delete(id);
      for (const pending of this.pendingSaves.values()) {
        if (pending.waiting.has(id)) pending.fail(new Error('문서 저장 전에 창이 닫혔습니다.'));
      }
    });
  }
  context(window) { return this.windows.get(window?.webContents.id); }
  navigate(window, url) {
    const context = this.context(window);
    if (!context) return;
    try {
      const id = new URL(url).hash.match(/^#\/docs\/([^/?#]+)/)?.[1];
      context.documentId = id ? decodeURIComponent(id) : null;
    } catch { context.documentId = null; }
  }
  find(documentId) { return [...this.windows.values()].find(context => context.documentId === documentId)?.window; }
  all() { return [...this.windows.values()].map(context => context.window); }
  broadcast(channel, value) { for (const window of this.all()) if (!window.isDestroyed()) window.webContents.send(channel, value); }
  serializeOpen(work) {
    const next = this.opening.then(work);
    this.opening = next.catch(() => {});
    return next;
  }
  async affected(store, file) {
    const affected = [];
    for (const context of this.windows.values()) {
      if (!context.documentId) continue;
      const target = await store.documentPath(context.documentId).catch(() => null);
      if (!target) continue;
      const relative = path.relative(file, target);
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) affected.push(context.window);
    }
    return affected;
  }
  save(windows = this.all()) {
    if (!windows.length) return Promise.resolve();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); this.pendingSaves.delete(id); error ? reject(error) : resolve(); };
      const timer = setTimeout(() => finish(new Error('문서 저장 응답을 확인하지 못했습니다.')), 60_000);
      this.pendingSaves.set(id, { waiting: new Set(windows.map(window => window.webContents.id)), finish, fail: finish });
      for (const window of windows) window.webContents.send('local:prepare-save', id);
    });
  }
  saved(window, id, result) {
    const pending = this.pendingSaves.get(id);
    if (!pending?.waiting.has(window.webContents.id)) return;
    if (result?.ok !== true) { pending.fail(new Error(result?.message || '문서를 저장하지 못했습니다.')); return; }
    pending.waiting.delete(window.webContents.id);
    if (!pending.waiting.size) pending.finish();
  }
}

function filesFromArguments(argv, cwd = process.cwd()) {
  return argv.filter(arg => typeof arg === 'string' && !arg.startsWith('-') && /\.dkt$/i.test(arg)).map(file => path.resolve(cwd, file));
}

module.exports = { DocumentWindows, filesFromArguments };
