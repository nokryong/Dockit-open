// 실제 NSIS 설치는 레지스트리와 파일 연결을 바꿈 (GitHub 실행기 전용)
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { createServer } = require('node:http');
const { load, dump } = require('js-yaml');
const { _electron: electron, expect: baseExpect } = require('@playwright/test');
const { LocalStore } = require('../electron/local-store.cjs');
const exec = promisify(execFile);
const expect = baseExpect.configure({ timeout: 60000 });
// 단계별 기록 (GitHub 실행기에서 시간이 초과돼도 멈춘 위치 확인용)
const step = label => console.log(`[${new Date().toISOString()}] ${label}`);

(async () => {
  assert.equal(process.platform, 'win32');
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only on an ephemeral GitHub-hosted Windows runner');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.ok(process.env.RUNNER_TEMP);
  const output = path.resolve(process.argv[2] || 'release');
  const artifacts = path.resolve('.cache/packaged-smoke');
  await fs.mkdir(artifacts, { recursive: true });
  const scratch = await fs.mkdtemp(path.join(path.resolve(process.env.RUNNER_TEMP), 'dockit-install-smoke-'));
  const installDir = path.join(scratch, 'app');
  const executablePath = path.join(installDir, 'Dockit Open.exe');
  const packageFile = path.join(installDir, 'resources/app/package.json');
  const quitEvidence = path.join(artifacts, 'before-update-quit.json');
  const metadata = load(await fs.readFile(path.join(output, 'latest.yml'), 'utf8'));
  const assetName = path.basename(decodeURIComponent(metadata.files[0].url));
  const localName = (await fs.readdir(output)).find(name => name.replaceAll(' ', '-') === assetName);
  assert.ok(localName, 'Missing NSIS installer');
  const installer = path.join(output, localName);
  const server = createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1));
    if (name === 'latest.yml') response.end(dump(metadata));
    else if (name === assetName) {
      response.writeHead(200, { 'Content-Length': metadata.files[0].size, 'Content-Type': 'application/octet-stream' });
      createReadStream(installer).pipe(response);
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let application;
  const appOutput = [];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // 프로세스 관찰·종료는 이 테스트의 설치 경로로만 한정
  const processes = async () => {
    const command = "@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:DOCKIT_INSTALL_SMOKE_EXE } | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress";
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true, env: { ...env, DOCKIT_INSTALL_SMOKE_EXE: executablePath }
    });
    const data = JSON.parse(stdout.trim() || '[]');
    return Array.isArray(data) ? data : [data];
  };
  try {
    step('initial silent install');
    assert.equal(await fs.stat(path.join(os.homedir(), '.dockit')).catch(() => null), null, 'The hosted runner must have no existing Dockit data');
    await new Promise((resolve, reject) => {
      const child = spawn(installer, ['/S', `/D=${installDir}`], { env, windowsHide: true, stdio: 'ignore', timeout: 180000 });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Initial NSIS install exited ${code}`)));
    });
    step('initial install finished');
    const installed = JSON.parse(await fs.readFile(packageFile, 'utf8'));
    assert.equal(installed.version, metadata.version);
    // 설치된 이전 버전 흉내 (새 설치 프로그램이 이 파일들을 되돌려야 함)
    await fs.writeFile(packageFile, JSON.stringify({ ...installed, version: '0.0.0' }));
    await fs.writeFile(path.join(installDir, 'resources/app-update.yml'), dump({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}/` }));
    const store = new LocalStore({ home: os.homedir(), trash: async () => {} });
    await store.init();
    const { content: document } = await store.request('create', { type: 'documents', data: { title: '업데이트 보존 확인', content: '<p>업데이트 전</p>' } });
    const documentFile = await store.documentPath(document._id);
    step('launch installed app');
    application = await electron.launch({ executablePath, args: [documentFile], env, timeout: 60000 });
    for (const stream of ['stdout', 'stderr']) application.process()[stream]?.on('data', data => appOutput.push(`${stream}: ${data}`));
    const oldPid = application.process().pid;
    const page = await application.firstWindow();
    await application.evaluate(({ app, BrowserWindow }, evidence) => {
      const fs = process.getBuiltinModule('node:fs');
      app.on('before-quit', () => fs.writeFileSync(evidence.path, JSON.stringify({ version: app.getVersion(), document: JSON.parse(fs.readFileSync(evidence.document, 'utf8')) })));
      BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
    }, { path: quitEvidence, document: documentFile });
    await expect(page.locator('.tiptap-main-canvas')).toContainText('업데이트 전');
    step('wait for update dialog');
    const dialog = page.getByRole('dialog', { name: '앱 업데이트' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`0.0.0 → ${metadata.version}`);
    // 업데이트 안내가 떠 있는 동안 열린 문서 수정 (직접 저장하지 않음)
    await page.locator('.tiptap-main-canvas').fill('업데이트 후에도 남아 있는 문서', { force: true });
    const closed = application.waitForEvent('close', { timeout: 180000 });
    step('click install');
    await dialog.getByRole('button', { name: '설치', exact: true }).click();
    await closed;
    step('app closed for update');
    application = null;
    const beforeQuit = JSON.parse(await fs.readFile(quitEvidence, 'utf8'));
    assert.equal(beforeQuit.version, '0.0.0');
    assert.match(beforeQuit.document.content, /업데이트 후에도 남아 있는 문서/);
    step('wait for installer to replace files');
    await expect.poll(async () => {
      try { return JSON.parse(await fs.readFile(packageFile, 'utf8')).version; } catch { return null; }
    }, { timeout: 180000 }).toBe(metadata.version);
    step('wait for automatic restart');
    let restarted;
    await expect.poll(async () => {
      restarted = (await processes()).find(item => item.ProcessId !== oldPid && !item.CommandLine.includes('--type=') && item.CommandLine.includes('--updated'));
      return Boolean(restarted);
    }, { timeout: 180000 }).toBe(true);
    await expect.poll(async () => {
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${Number(restarted.ProcessId)}).MainWindowHandle`], { windowsHide: true });
      return Number(stdout.trim());
    }).toBeGreaterThan(0);
    assert.match(JSON.parse(await fs.readFile(documentFile, 'utf8')).content, /업데이트 후에도 남아 있는 문서/);
    const restoredFeed = load(await fs.readFile(path.join(installDir, 'resources/app-update.yml'), 'utf8'));
    assert.equal(restoredFeed.provider, 'github');
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:DOCKIT_INSTALL_SMOKE_EXE } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }"], {
      windowsHide: true, env: { ...env, DOCKIT_INSTALL_SMOKE_EXE: executablePath }
    });
    await expect.poll(async () => (await processes()).length).toBe(0);
    step('reopen updated app');
    application = await electron.launch({ executablePath, args: [documentFile], env, timeout: 60000 });
    const reopened = await application.firstWindow();
    await expect(reopened.locator('.tiptap-main-canvas')).toContainText('업데이트 후에도 남아 있는 문서');
    assert.equal(await application.evaluate(({ app }) => app.getVersion()), metadata.version);
    await application.evaluate(async ({ BrowserWindow }, file) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
      process.getBuiltinModule('node:fs').writeFileSync(file, image.toPNG());
    }, path.join(artifacts, 'updated-document.png'));
    await fs.writeFile(path.join(artifacts, 'installed-update.json'), JSON.stringify({ version: metadata.version, previousVersion: beforeQuit.version,
      savedBeforeQuit: true, installerReplacedFiles: true, automaticRestartPid: restarted.ProcessId, documentReopened: true }, null, 2));
    console.log('PASS: real NSIS install, save on update, file replacement, automatic app restart and preserved document reopening');
  } catch (error) {
    step('failed');
    console.error(error);
    const settle = promise => Promise.race([promise.catch(failure => `error: ${failure.message}`), new Promise(resolve => setTimeout(() => resolve('timed out'), 10000))]);
    if (application) console.error('main process:', JSON.stringify(await settle(application.evaluate(({ app, BrowserWindow }) => ({
      ready: app.isReady(), singleInstanceLock: app.hasSingleInstanceLock(), version: app.getVersion(),
      windows: BrowserWindow.getAllWindows().map(window => ({ url: window.webContents.getURL(), visible: window.isVisible(), loading: window.webContents.isLoading() }))
    })))));
    console.error('app output:', appOutput.join('').slice(-4000) || '(none)');
    console.error('installed processes:', JSON.stringify(await settle(processes())));
    throw error;
  } finally {
    // 앱이 다 뜨지 못해도 정리 단계가 멈추지 않도록 처리
    const settle = promise => Promise.race([promise.catch(() => {}), new Promise(resolve => setTimeout(resolve, 15000))]);
    try {
      if (application) {
        const child = application.process();
        await settle(application.evaluate(({ app }) => app.exit(0)));
        await settle(application.close());
        if (child.exitCode === null) child.kill();
      }
    } finally {
      // 앱이나 설치 프로그램이 남긴 연결 정리 (실패 뒤에도 검사가 끝나지 않는 문제 방지)
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    // 작업이 끝나면 VM은 버려지므로 그때까지 설치 증거 유지
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
