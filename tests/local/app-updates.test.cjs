const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AppUpdates } = require('../../electron/app-updates.cjs');

const tick = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise(ok => { resolve = ok; });
  return { promise, resolve };
};
function fixture(options = {}) {
  const calls = [], states = [];
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => ({ isUpdateAvailable: true, updateInfo: { version: '0.1.4' } });
  updater.downloadUpdate = async () => { calls.push('download'); return ['installer.exe']; };
  updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const service = new AppUpdates({ updater, enabled: true, currentVersion: '0.1.3',
    emit: state => states.push(state), waitForWork: async () => { calls.push('idle'); },
    flush: async () => { calls.push('flush'); }, allowQuit: value => calls.push(['allowQuit', value]),
    ...options });
  return { service, updater, calls, states };
}

test('development stays inactive; no checks, downloads or installs', async () => {
  const { service, calls } = fixture({ enabled: false });
  await service.check(); await service.install();
  assert.equal(service.snapshot().status, 'idle');
  assert.deepEqual(calls, []);
});

test('check never downloads automatically, keeps failures quiet and dismisses only this version', async () => {
  const { service, updater, calls } = fixture();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false);
  updater.checkForUpdates = async () => { updater.emit('error', new Error('offline')); throw new Error('offline'); };
  await service.check();
  assert.equal(service.snapshot().status, 'idle');
  updater.checkForUpdates = async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.1.3' } });
  await service.check();
  assert.equal(service.snapshot().status, 'idle');
  updater.checkForUpdates = async () => ({ isUpdateAvailable: true, updateInfo: { version: '0.1.4' } });
  await service.check();
  assert.equal(service.snapshot().status, 'available');
  service.dismiss(); await service.check();
  assert.equal(service.snapshot().status, 'idle');
  updater.checkForUpdates = async () => ({ isUpdateAvailable: true, updateInfo: { version: '0.1.5' } });
  await service.check();
  assert.equal(service.snapshot().status, 'available');
  assert.deepEqual(calls, []);
});

test('download progress, in-flight AI, renderer save and disk flush precede install/restart', async () => {
  const download = deferred(), ai = deferred(), disk = deferred();
  const { service, updater, calls } = fixture({ waitForWork: () => ai.promise, flush: () => disk.promise });
  updater.downloadUpdate = () => { calls.push('download'); return download.promise; };
  await service.check();
  const job = service.install();
  assert.equal(service.install(), job);
  updater.emit('download-progress', { percent: 56.7 });
  assert.equal(service.snapshot().percent, 56.7);
  service.dismiss();
  assert.equal(service.snapshot().status, 'downloading');
  download.resolve(['installer.exe']); await tick();
  assert.equal(service.snapshot().status, 'waiting');
  assert.equal(service.blocksWork, true);
  ai.resolve(); await tick();
  assert.equal(service.snapshot().status, 'saving');
  service.saved('outdated-id', { ok: true }); await tick();
  assert.deepEqual(calls, ['download']);
  service.saved(service.snapshot().saveRequestId, { ok: true }); await tick();
  assert.deepEqual(calls, ['download']);
  disk.resolve(); await job;
  assert.deepEqual(calls, ['download', ['allowQuit', true], ['install', true, true]]);
});

test('failed saves keep the app open; retry reuses download but saves again', async () => {
  const { service, calls } = fixture();
  await service.check(); const first = service.install(); await tick();
  const oldId = service.snapshot().saveRequestId;
  service.saved(oldId, { ok: false, message: '저장 공간이 부족합니다.' }); await first;
  assert.equal(service.snapshot().status, 'error');
  assert.equal(service.snapshot().error, '저장 공간이 부족합니다.');
  assert.equal(service.busy, false);
  assert.ok(!calls.some(call => call[0] === 'install'));
  const retry = service.install(); await tick();
  assert.notEqual(service.snapshot().saveRequestId, oldId);
  service.saved(service.snapshot().saveRequestId, { ok: true }); await retry;
  assert.equal(calls.filter(call => call === 'download').length, 1);
  assert.equal(calls.filter(call => call[0] === 'install').length, 1);
});

test('missing renderer acknowledgement times out without installing', async () => {
  const { service, calls } = fixture({ saveTimeout: 10 });
  await service.check(); await service.install();
  assert.equal(service.snapshot().status, 'error');
  assert.match(service.snapshot().error, /저장/);
  assert.ok(!calls.some(call => call[0] === 'install'));
});

test('download failure does not save or install and can be retried', async () => {
  const { service, updater, calls } = fixture();
  updater.downloadUpdate = async () => { throw new Error('sha512 mismatch'); };
  await service.check(); await service.install();
  assert.equal(service.snapshot().status, 'error');
  assert.deepEqual(calls, [['allowQuit', false]]);
  assert.equal(service.downloaded, false);
});

test('disk flush failure blocks installation even after renderer acknowledgement', async () => {
  const { service, calls } = fixture({ flush: async () => { throw new Error('disk full'); } });
  await service.check(); const job = service.install(); await tick();
  service.saved(service.snapshot().saveRequestId, { ok: true }); await job;
  assert.equal(service.snapshot().status, 'error');
  assert.ok(!calls.some(call => call[0] === 'install'));
});

test('installer error restores normal close/save handling', async () => {
  const { service, updater, calls } = fixture();
  updater.quitAndInstall = () => { updater.emit('error', new Error('permission denied')); };
  await service.check(); const job = service.install(); await tick();
  service.saved(service.snapshot().saveRequestId, { ok: true }); await job;
  assert.equal(service.snapshot().status, 'error');
  assert.deepEqual(calls.at(-1), ['allowQuit', false]);
  assert.equal(service.busy, false);
});
