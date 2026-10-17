const { randomUUID } = require('node:crypto');

const BUSY = new Set(['downloading', 'waiting', 'saving', 'installing']);

class AppUpdates {
  constructor({ updater, enabled, currentVersion, emit, waitForWork, flush, allowQuit, saveTimeout = 60_000 }) {
    Object.assign(this, { updater, enabled, emit, waitForWork, flush, allowQuit, saveTimeout });
    this.state = { status: 'idle', currentVersion, version: null, percent: 0 };
    this.dismissed = new Set();
    this.downloaded = false;
    this.pendingSave = null;
    this.job = null;
    if (!enabled) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('download-progress', progress => {
      if (this.state.status === 'downloading' && Number.isFinite(progress.percent)) {
        this.set({ percent: Math.max(0, Math.min(100, progress.percent)) });
      }
    });
    // check/download errors also reject their promises. Installation errors are events only.
    updater.on('error', () => {
      if (this.state.status === 'installing') this.fail('설치를 시작하지 못했습니다. 다시 시도해 주세요.');
    });
  }

  get busy() { return BUSY.has(this.state.status); }
  get blocksWork() { return ['waiting', 'saving', 'installing'].includes(this.state.status); }
  snapshot() { return { ...this.state }; }
  set(patch) { this.state = { ...this.state, ...patch }; this.emit(this.snapshot()); }

  async check() {
    if (!this.enabled || this.checking || this.busy || ['available', 'error'].includes(this.state.status)) return;
    this.checking = true;
    try {
      const result = await this.updater.checkForUpdates();
      const version = result?.isUpdateAvailable ? result.updateInfo?.version : null;
      if (version && !this.dismissed.has(version)) {
        if (version !== this.state.version) this.downloaded = false;
        this.set({ status: 'available', version, percent: 0, error: null });
      }
    } catch {
      // Offline, missing releases and background check failures do not interrupt editing.
    } finally { this.checking = false; }
  }

  dismiss() {
    if (this.busy) return;
    if (this.state.version) this.dismissed.add(this.state.version);
    this.set({ status: 'idle', error: null });
  }

  install() {
    if (!this.enabled || this.job || !['available', 'error'].includes(this.state.status)) return this.job;
    this.job = this.runInstall().finally(() => { this.job = null; });
    return this.job;
  }

  async runInstall() {
    try {
      if (!this.downloaded) {
        this.set({ status: 'downloading', percent: 0, error: null });
        const files = await this.updater.downloadUpdate();
        if (!files?.length) throw new Error('다운로드한 설치 파일을 찾지 못했습니다.');
        this.downloaded = true;
      }
      this.set({ status: 'waiting', percent: 100, error: null });
      await this.waitForWork();
      await this.requestSave();
      await this.flush();
      this.set({ status: 'installing', saveRequestId: null });
      this.allowQuit(true);
      this.updater.quitAndInstall(true, true);
    } catch (error) {
      const message = this.state.status === 'downloading'
        ? '다운로드하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'
        : this.state.status === 'installing'
          ? '설치를 시작하지 못했습니다. 다시 시도해 주세요.'
          : error.message || '문서를 저장하지 못했습니다. 다시 시도해 주세요.';
      this.fail(message);
    }
  }

  requestSave() {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pendingSave = null;
        reject(new Error('문서 저장을 확인하지 못했습니다. 다시 시도해 주세요.'));
      }, this.saveTimeout);
      this.pendingSave = { id, resolve, reject, timer };
      this.set({ status: 'saving', saveRequestId: id });
    });
  }

  saved(id, result) {
    const pending = this.pendingSave;
    if (!pending || pending.id !== id || this.state.status !== 'saving') return;
    this.pendingSave = null;
    clearTimeout(pending.timer);
    if (result?.ok === true) pending.resolve();
    else pending.reject(new Error(typeof result?.message === 'string' ? result.message.slice(0, 300) : '문서를 저장하지 못했습니다.'));
  }

  fail(message) {
    this.allowQuit(false);
    this.set({ status: 'error', saveRequestId: null, error: message });
  }
}

module.exports = { AppUpdates };
