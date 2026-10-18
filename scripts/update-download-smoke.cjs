const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dockit-update-smoke-'));
  const env = { ...process.env, DOCKIT_UPDATE_SMOKE_HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit', timeout: 120000 });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    assert.equal(path.dirname(home), path.resolve(os.tmpdir()));
    assert.ok(path.basename(home).startsWith('dockit-update-smoke-'));
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
} else {
  const { app } = require('electron');
  const { createServer } = require('node:http');
  const { load, dump } = require('js-yaml');
  const { NsisUpdater } = require('electron-updater');
  const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
  const { AppUpdates } = require('../electron/app-updates.cjs');
  const home = process.env.DOCKIT_UPDATE_SMOKE_HOME;
  assert.ok(home, 'Launch this smoke test through Node');
  app.setPath('userData', path.join(home, 'profile'));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const output = path.resolve(process.argv[2] || 'release');
    const metadata = load(await fsp.readFile(path.join(output, 'latest.yml'), 'utf8'));
    const assetName = path.basename(decodeURIComponent(metadata.files[0].url));
    // GitHub publishing replaces spaces in asset names; local NSIS output keeps them.
    let installer = path.join(output, assetName);
    if (!fs.existsSync(installer)) {
      const localName = (await fsp.readdir(output)).find(name => name.replaceAll(' ', '-') === assetName);
      assert.ok(localName, `Missing installer asset: ${assetName}`);
      installer = path.join(output, localName);
    }
    const size = (await fsp.stat(installer)).size;
    let corrupt = false;
    const server = createServer((request, response) => {
      const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1));
      if (name === 'latest.yml') {
        const info = structuredClone(metadata);
        if (corrupt) {
          info.files[0].sha512 = Buffer.alloc(64).toString('base64');
          info.sha512 = info.files[0].sha512;
        }
        response.end(dump(info));
      } else if (name === assetName) {
        response.writeHead(200, { 'Content-Length': size, 'Content-Type': 'application/octet-stream' });
        fs.createReadStream(installer).pipe(response);
      } else { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const feed = { provider: 'generic', url: `http://127.0.0.1:${server.address().port}/` };
      const run = async bad => {
        corrupt = bad;
        const folder = path.join(home, bad ? 'corrupt' : 'valid');
        await fsp.mkdir(folder, { recursive: true });
        const calls = [], states = [];
        const adapter = { version: '0.0.0', name: 'dockit-update-smoke', isPackaged: true,
          appUpdateConfigPath: path.join(output, 'win-unpacked/resources/app-update.yml'),
          userDataPath: folder, baseCachePath: folder, whenReady: () => app.whenReady(),
          quit: () => calls.push('quit'), relaunch: () => {}, onQuit: () => {} };
        const updater = new NsisUpdater(undefined, adapter);
        const failures = [];
        updater.on('error', error => failures.push(error.message));
        updater.httpExecutor = new ElectronHttpExecutor();
        updater.setFeedURL(feed);
        updater.disableDifferentialDownload = true;
        updater.logger = { info() {}, warn() {}, error() {}, debug() {} };
        // Exercise real install argument construction without launching an installer.
        updater.spawnLog = async (file, args) => {
          assert.equal(await fsp.readFile(path.join(folder, 'document.dkt'), 'utf8'), 'saved-before-install');
          assert.ok(calls.includes('flush'));
          assert.ok(!args.includes('/S'), 'the installer must show its progress window');
          assert.ok(args.includes('--force-run'));
          assert.equal((await fsp.stat(file)).size, size);
          calls.push('installer');
        };
        const service = new AppUpdates({ updater, enabled: true, currentVersion: adapter.version,
          emit: state => {
            states.push(state);
            if (state.status === 'saving') {
              fsp.writeFile(path.join(folder, 'document.dkt'), 'saved-before-install')
                .then(() => { calls.push('save'); service.saved(state.saveRequestId, { ok: true }); })
                .catch(error => service.saved(state.saveRequestId, { ok: false, message: error.message }));
            }
          }, waitForWork: async () => { calls.push('idle'); },
          flush: async () => {
            const file = await fsp.open(path.join(folder, 'document.dkt'), 'r+');
            try { await file.sync(); } finally { await file.close(); }
            calls.push('flush');
          }, allowQuit: value => { if (value) calls.push('allowQuit'); }, saveTimeout: 10000 });
        await service.check();
        assert.equal(service.snapshot().status, 'available', JSON.stringify(failures));
        assert.equal(calls.length, 0);
        await service.install();
        // spawnLog validates asynchronously, while the updater schedules quit with setImmediate.
        for (let i = 0; i < 100 && !bad && !calls.includes('installer'); i++) await new Promise(resolve => setTimeout(resolve, 10));
        if (bad) {
          assert.equal(service.snapshot().status, 'error');
          assert.deepEqual(calls, []);
        } else {
          assert.equal(service.snapshot().status, 'installing');
          assert.ok(states.some(state => state.status === 'downloading' && state.percent > 0));
          assert.ok(calls.indexOf('save') < calls.indexOf('flush'));
          assert.ok(calls.includes('installer') && calls.includes('quit'));
        }
      };
      await run(false);
      await run(true);
      console.log('PASS: real installer download/progress/checksum, save+flush before visible install/restart arguments, corrupt download blocked');
    } finally { await new Promise(resolve => server.close(resolve)); }
  }).then(() => app.exit(0), error => { console.error(error); app.exit(1); });
}
