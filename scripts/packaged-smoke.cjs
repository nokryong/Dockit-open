const { _electron: electron, expect: baseExpect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { LocalStore } = require('../electron/local-store.cjs');
const expect = baseExpect.configure({ timeout: 30000 });

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.resolve(process.argv[2] || path.join(root, 'release'));
  const candidates = process.platform === 'win32' ? ['win-unpacked/Dockit Open.exe']
    : process.platform === 'darwin' ? ['mac-arm64/Dockit Open.app/Contents/MacOS/Dockit Open', 'mac/Dockit Open.app/Contents/MacOS/Dockit Open']
      : ['linux-unpacked/dockit-open', 'linux-unpacked/Dockit Open'];
  let executablePath;
  for (const candidate of candidates) {
    const file = path.join(output, candidate);
    if (await fs.stat(file).catch(() => null)) { executablePath = file; break; }
  }
  assert.ok(executablePath, 'Build the desktop package before running this smoke test');
  // 빌드된 앱에서 실행 패키지 직접 로드 (테스트 모드는 업데이트 기능을 불러오지 않으므로 따로 확인)
  const appDir = process.platform === 'darwin' ? path.join(path.dirname(executablePath), '..', 'Resources', 'app') : path.join(path.dirname(executablePath), 'resources', 'app');
  const loadCheck = `const p = require('node:path'), app = ${JSON.stringify(appDir)}, from = { paths: [p.join(app, 'electron')] };
    for (const name of ['electron-updater', 'fflate', 'react-dom/server', 'react-icons']) require(require.resolve(name, from));
    require(p.join(app, 'plugin-sdk', 'icons.cjs'));
    import(require('node:url').pathToFileURL(require.resolve('jose', from)).href).then(() => console.log('runtime packages ok'));`;
  const { stdout: loaded } = await promisify(execFile)(executablePath, ['-e', loadCheck], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 60000 });
  assert.match(loaded, /runtime packages ok/);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-package-smoke-'));
  const artifacts = path.join(root, '.cache/packaged-smoke');
  await fs.mkdir(artifacts, { recursive: true });
  const store = new LocalStore({ home, trash: async () => {} });
  await store.init();
  const { content: document } = await store.request('create', { type: 'documents', data: { title: '출시 확인', content: '<p>처음 내용</p>' } });
  const file = await store.documentPath(document._id);
  const errors = [];
  let app;
  const launch = async (files = []) => {
    const env = { ...process.env, DOCKIT_TEST_HOME: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath, args: ['--test-mode', ...files], env, timeout: 60000 });
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(30000);
    await page.waitForURL(url => url.protocol === 'dockit:' && url.hostname === 'app', { waitUntil: 'domcontentloaded' });
    await app.evaluate(({ BrowserWindow, screen }) => BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.setBackgroundThrottling(false);
      // IntersectionObserver 기반 내용은 Xvfb에서 창이 매핑돼야 표시
      if (process.env.CI) window.setBounds(screen.getPrimaryDisplay().workArea);
      else window.setPosition(-10000, -10000);
      window.showInactive();
    }));
    assert.equal((await page.evaluate(() => window.dockitLocal.paths())).dataPath, store.root);
    return page;
  };
  const stop = async () => {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
      app = null;
    }
  };
  const capture = async (page, name) => {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!process.env.CI) window.setPosition(-10000, -10000);
      window.showInactive();
    });
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await app.evaluate(async ({ BrowserWindow, app }, filename) => {
      const require = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
      // 캡처 재시도 (Xvfb에서 창을 띄운 직후에는 화면 프레임이 없어 UnknownVizError가 날 수 있음)
      for (let attempt = 1; ; attempt++) {
        try {
          const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
          return await require('node:fs/promises').writeFile(filename, image.toPNG());
        } catch (error) {
          if (attempt >= 5) throw error;
          await new Promise(resolve => setTimeout(resolve, attempt * 200));
        }
      }
    }, path.join(artifacts, name));
  };
  try {
    let page = await launch();
    await expect(page.getByText('출시 확인', { exact: true }).first()).toBeVisible();
    await capture(page, 'workspace.png');
    await page.getByText('출시 확인', { exact: true }).first().dispatchEvent('dblclick');
    const editor = page.locator('.tiptap-main-canvas[contenteditable="true"]');
    await expect(editor).toContainText('처음 내용');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    await editor.fill('설치본 저장 확인');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
    await expect.poll(async () => JSON.parse(await fs.readFile(file, 'utf8')).content).toContain('설치본 저장 확인');
    await capture(page, 'document.png');
    const packageRoot = await app.evaluate(({ app }) => app.getAppPath());
    assert.match(await fs.readFile(path.join(packageRoot, 'LICENSE'), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE/);
    assert.ok((await fs.stat(path.join(packageRoot, 'dist/THIRD_PARTY_NOTICES.txt'))).size > 1000);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const canvasChecks = [];
    for (const width of [1280, 1024, 640]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 768), width);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (const scale of width === 640 ? [1] : [0.5, 1, 2, 1]) {
        const current = await page.locator('.zoom-container').evaluate(element => Number(element.style.getPropertyValue('--document-canvas-scale')));
        const direction = page.getByText(scale > current ? '▲' : '▼', { exact: true }).last();
        for (let i = 0; i < Math.round(Math.abs(scale - current) / 0.05); i++) await direction.dispatchEvent('click');
        await expect.poll(() => page.locator('.zoom-container').evaluate(element => Number(element.style.getPropertyValue('--document-canvas-scale')))).toBeCloseTo(scale, 3);
        const geometry = await page.locator('.tiptap-main-canvas').evaluate(async paper => {
          const scrollport = paper.closest('.zoom-container').parentElement;
          scrollport.scrollLeft = 0;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const viewport = scrollport.getBoundingClientRect();
          const left = paper.getBoundingClientRect();
          const ruler = document.querySelector('.dockit-ruler--vertical').getBoundingClientRect();
          const rightEdge = viewport.left + scrollport.clientWidth;
          const centerError = Math.abs((left.left + left.right - viewport.left - rightEdge) / 2);
          scrollport.scrollLeft = scrollport.scrollWidth;
          await new Promise(resolve => requestAnimationFrame(resolve));
          const right = paper.getBoundingClientRect();
          scrollport.scrollLeft = 0;
          return { windowWidth: innerWidth, leftGap: left.left - viewport.left, rulerGap: ruler.left - viewport.left,
            rightGap: rightEdge - right.right, centerError, scrollRange: scrollport.scrollWidth - scrollport.clientWidth };
        });
        canvasChecks.push({ width, scale, ...geometry });
        assert.ok(geometry.leftGap >= -1 && geometry.rulerGap >= -1 && geometry.rightGap >= -1, JSON.stringify(canvasChecks.at(-1)));
        assert.ok(Math.abs(geometry.leftGap - geometry.rightGap) <= 1, JSON.stringify(canvasChecks.at(-1)));
        if (geometry.scrollRange <= 1) assert.ok(geometry.centerError <= 1, JSON.stringify(canvasChecks.at(-1)));
      }
      await capture(page, `document-${width}.png`);
    }
    await page.emulateMedia({ media: 'print' });
    const print = await page.locator('.doc-print-page-root').evaluate(element => ({ padding: getComputedStyle(element).paddingLeft,
      transform: getComputedStyle(element.closest('.zoom-container')).transform }));
    assert.equal(print.padding, '0px');
    assert.equal(print.transform, 'matrix(1, 0, 0, 1, 0, 0)');
    await page.emulateMedia({ media: 'screen' });
    const updateState = await page.evaluate(() => window.dockitLocal.updates.status());
    assert.equal(updateState.manualDownload, process.platform === 'darwin');
    await app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('app-update:changed', {
      ...state, status: 'available', version: '9.9.9'
    }), updateState);
    const dialog = page.getByRole('dialog', { name: '앱 업데이트' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: process.platform === 'darwin' ? '다운로드' : '설치', exact: true })).toBeVisible();
    const dialogBounds = await dialog.boundingBox();
    assert.ok(dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= await page.evaluate(() => innerWidth));
    await capture(page, 'update-modal.png');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toBeHidden();
    const savedBeforeLanguageChange = JSON.parse(await fs.readFile(file, 'utf8'));
    const packagedEnglish = JSON.parse(await fs.readFile(path.join(packageRoot, 'desktop/locales/en.json'), 'utf8'));
    assert.equal(packagedEnglish['설정'], 'Settings');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.locator('#interface-language').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
    await capture(page, 'settings-english.png');
    await page.locator('.sud-drawer__close').click();
    await expect(page.getByRole('combobox', { name: 'Font', exact: true })).toBeVisible();
    const nativeFailure = await page.evaluate(async () => {
      try { await window.dockitLocal.data('get', { type: 'documents', id: '../../invalid' }); }
      catch (error) { return error.message; }
      return '';
    });
    assert.ok(nativeFailure && !/[가-힣]/.test(nativeFailure), nativeFailure);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).content, savedBeforeLanguageChange.content);
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(home, '.dockit/config.json'), 'utf8')).setting.language).toBe('en');
    await fs.writeFile(path.join(artifacts, 'canvas-and-update.json'), JSON.stringify({ canvasChecks, print, updateState, dialogBounds }, null, 2));
    await stop();
    page = await launch([file]);
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.tiptap-main-canvas')).toContainText('설치본 저장 확인');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: packaged app, save/reopen, native file argument, licenses, renderer isolation, canvas scroll/zoom/print, update dialog and persistent English interface');
  } catch (error) {
    if (app) {
      const page = app.windows()[0];
      const details = { errors, url: page?.url(), text: await page?.locator('body').innerText().catch(() => null) };
      await fs.writeFile(path.join(artifacts, 'failure.json'), JSON.stringify(details, null, 2));
      await capture(page, 'failure.png').catch(() => {});
    }
    throw error;
  } finally {
    await stop();
    assert.equal(path.dirname(home), path.resolve(os.tmpdir()));
    assert.ok(path.basename(home).startsWith('dockit-package-smoke-'));
    await fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
