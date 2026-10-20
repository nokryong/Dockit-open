const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { LocalStore, atomicJson } = require('../electron/local-store.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-windows-smoke-'));
  const artifacts = path.join(root, '.cache', 'document-windows-smoke'); await fs.mkdir(artifacts, { recursive: true });
  const fixture = path.join(root, 'tests/helpers/codex-electron-fixture.cjs');
  const store = new LocalStore({ home, trash: async () => {} }); await store.init();
  await store.request('update', { type: 'setting', data: { aiProvider: 'codex', autoSave: false } });
  await store.request('update', { type: 'panels', data: { panels: { left: ['aiChat'], right: [] } } });
  const { content: a } = await store.request('create', { type: 'documents', data: { title: '창 A', content: '<p>Before A</p>' } });
  const { content: b } = await store.request('create', { type: 'documents', data: { title: '창 B', content: '<p>Before B</p>' } });
  const externalDirectory = path.join(home, 'external'); await fs.mkdir(externalDirectory);
  const original = path.join(externalDirectory, 'original.dkt');
  await atomicJson(original, { ...JSON.parse(await fs.readFile(await store.documentPath(a._id), 'utf8')), content: '<p>External original</p>' });
  const { createServer } = await import('vite');
  const server = await createServer({ root, configFile: path.join(root, 'vite.config.mjs'), cacheDir: path.join(root, '.cache', 'document-windows-vite'), server: { host: '127.0.0.1', port: 53822, strictPort: true, hmr: false, watch: { ignored: ['**/.cache/**', '**/electron/**', '**/tests/**', '**/_temp/**'] } }, clearScreen: false });
  let app; const errors = [];
  const call = (method, value) => app.evaluate(({ app }, args) => {
    const require = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
    return require(args.fixture)[args.method](args.value);
  }, { fixture, method, value });
  const watch = page => { page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); return page; };
  const capture = (page, name) => app.evaluate(async ({ app, BrowserWindow }, { url, file }) => {
    const require = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url);
    const image = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await require('node:fs/promises').writeFile(file, image.toPNG());
  }, { url: page.url(), file: path.join(artifacts, name) });
  const open = async (page, id) => {
    const created = app.waitForEvent('window');
    await app.evaluate(({ app }, file) => app.emit('second-instance', {}, [file], process.cwd()), await store.documentPath(id));
    const next = watch(await created);
    await next.locator('.tiptap-main-canvas').waitFor({ timeout: 60000 });
    return next;
  };
  try {
    await server.listen();
    const env = { ...process.env, DOCKIT_TEST_HOME: home, DOCKIT_DEV_SERVER_URL: 'http://127.0.0.1:53822' }; delete env.ELECTRON_RUN_AS_NODE;
    console.log('Starting isolated Electron fixture');
    app = await electron.launch({ executablePath: require('electron'), args: ['--lang=ko', root, '--dev', '--test-mode', '--disable-gpu'], env, timeout: 30000 });
    console.log('Electron fixture ready');
    const workspace = watch(await app.firstWindow());
    await app.evaluate(({ app, clipboard, dialog, shell }, fixture) => {
      const require = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
      require(fixture).install({ clipboard, dialog });
      const fs = require('node:fs/promises'), path = require('node:path');
      globalThis.trashed = [];
      shell.trashItem = async file => { const to = path.join(process.env.DOCKIT_TEST_HOME, `trash-${globalThis.trashed.length}`); await fs.rename(file, to); globalThis.trashed.push(file); };
    }, fixture);
    await workspace.reload();
    await workspace.getByRole('button', { name: '설정', exact: true }).waitFor({ timeout: 60000 });
    await workspace.evaluate(() => window.dockitLocal.codex.signIn());
    const first = await open(workspace, a._id);
    const second = await open(workspace, b._id);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.webContents.setBackgroundThrottling(false)));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 3);
    await app.evaluate(({ app }, file) => app.emit('second-instance', {}, [file], process.cwd()), await store.documentPath(a._id));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 3);
    await assert.rejects(first.evaluate(({ id, revision }) => window.dockitLocal.codex.send('wrong document', [], { id, revision }), { id: b._id, revision: b.revision }));
    console.log('PASS: document windows, duplicate focus and cross-window Codex denial');

    await call('mode', 'hold-turn');
    const chat = first.locator('[data-widget-type="aiChat"]');
    await chat.locator('textarea').fill('문서 전체 작업');
    await chat.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    await expect.poll(() => call('tool', { name: 'dockit_read_document' }).then(result => result.success).catch(() => false)).toBe(true);
    const read = async () => JSON.parse((await call('tool', { name: 'dockit_read_document' })).contentItems[0].text);
    let record = await read(); assert.equal(record.path, await store.documentPath(a._id));
    const edit = async updates => {
      const result = await call('tool', { name: 'dockit_edit_document', args: { expectedRevision: record.revision, updates } });
      assert.equal(result.success, true, JSON.stringify(result)); record = await read();
    };
    await edit({ content: '<p>Intermediate A</p>' });
    await expect(first.locator('.tiptap-main-canvas')).toContainText('Intermediate A');
    await edit({ content: '<h1>Completed A</h1><p>Final paragraph</p>', title: 'AI title', docSetting: { ...record.document.docSetting, paddingTop: 30 }, pageNumber: 'bottom-center' });
    await expect(first.locator('.tiptap-main-canvas')).toContainText('Completed A');
    assert.equal((await second.evaluate(() => window.__dockitEditor.getHTML())).includes('Before B'), true);
    await call('complete');
    await expect(chat.getByRole('button', { name: 'ChatGPT 전송', exact: true })).toBeVisible();
    await expect.poll(() => first.evaluate(() => window.__dockitEditor?.isEditable)).toBe(true);
    await first.locator('.tiptap-main-canvas').click();
    await first.evaluate(() => { window.beforeUndoEditor = window.__dockitEditor; });
    await first.keyboard.press('Control+z');
    await expect(first.locator('.tiptap-main-canvas')).toContainText('Before A');
    await expect(first.locator('.tiptap-main-canvas')).not.toContainText('Completed A');
    await expect.poll(() => first.evaluate(() => window.beforeUndoEditor !== window.__dockitEditor && document.activeElement === window.__dockitEditor?.view.dom)).toBe(true);
    await first.keyboard.press('Control+Shift+z');
    await expect(first.locator('.tiptap-main-canvas')).toContainText('Completed A');
    await first.evaluate(async () => (await import('/app/LIB/utils/localBridge.js')).flushLocalData());
    const final = (await first.evaluate(id => window.dockitLocal.data('get', { type: 'documents', id }), a._id)).content;
    assert.equal(final.title, 'AI title'); assert.equal(final.docSetting.paddingTop, 30);
    console.log('PASS: live Codex previews and one-step keyboard undo/redo with page-setting recreation');

    await call('mode', 'success');
    await chat.getByRole('button', { name: '새 대화', exact: true }).click();
    await chat.locator('textarea').fill('두 번째 대화');
    await chat.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    await expect(chat.getByText('CLI 대화 테스트 응답입니다.', { exact: true })).toBeVisible({ timeout: 20000 });
    await chat.getByRole('button', { name: '채팅 목록 보기', exact: true }).click();
    const list = chat.getByLabel('채팅 목록', { exact: true });
    await expect(list.getByText('문서 전체 작업', { exact: true })).toBeVisible();
    await expect(list.getByText('두 번째 대화', { exact: true })).toBeVisible();
    await capture(first, 'conversation-list-desktop.png');
    await list.getByText('문서 전체 작업', { exact: true }).dblclick();
    await expect(chat.getByText('문서 전체 작업', { exact: true })).toBeVisible();
    await chat.getByRole('button', { name: '채팅 목록 보기', exact: true }).click();
    await list.getByText('두 번째 대화', { exact: true }).click({ button: 'right' });
    await first.getByText('대화 삭제', { exact: true }).click();
    await expect(list.getByText('두 번째 대화', { exact: true })).toHaveCount(0);
    assert.equal(await list.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
    await first.setViewportSize({ width: 640, height: 640 });
    await expect(chat).toHaveCount(0); // 기존 모바일 배치는 도구 패널을 숨김
    await capture(first, 'conversation-list-narrow.png');
    await first.setViewportSize({ width: 1240, height: 800 });
    await chat.getByRole('button', { name: '채팅 목록 보기', exact: true }).click();
    assert.equal(await list.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
    console.log('PASS: retained conversation list, double-click open and right-click trash deletion');

    const opened = app.waitForEvent('window');
    await app.evaluate(({ app }, file) => app.emit('open-file', { preventDefault() {} }, file), original);
    const external = watch(await opened); await external.locator('.tiptap-main-canvas').waitFor({ timeout: 60000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.webContents.setBackgroundThrottling(false)));
    await external.evaluate(() => window.__dockitEditor.commands.setContent('<p>External saved directly</p>'));
    await external.evaluate(async () => (await import('/app/LIB/utils/localBridge.js')).flushLocalData());
    assert.ok(JSON.parse(await fs.readFile(original, 'utf8')).content.includes('External saved directly'));
    assert.deepEqual(await fs.readdir(externalDirectory), ['original.dkt']);
    console.log('PASS: native file-open uses and saves the original outside Documents');

    await workspace.getByText('창 B', { exact: true }).click();
    await workspace.keyboard.press('Delete');
    await expect(workspace.getByText('창 B', { exact: true })).toHaveCount(0);
    await expect.poll(() => second.isClosed()).toBe(true);
    assert.ok((await app.evaluate(() => globalThis.trashed)).some(file => file.endsWith('창 B.dkt')));
    assert.equal(await workspace.getByRole('dialog').count(), 0);
    console.log('PASS: Delete sends the document to trash immediately and closes its saved window');

    await first.evaluate(() => window.__dockitEditor.commands.insertContent('Save all A'));
    await external.evaluate(async () => {
      window.__dockitEditor.commands.insertContent('Save all external');
      const { registerLocalFlusher } = await import('/app/LIB/utils/localBridge.js');
      window.removeFailingSave = registerLocalFlusher(async () => { throw new Error('fixture save failure'); });
    });
    await app.evaluate(({ app }, { root, home, original }) => {
      const require = process.getBuiltinModule('node:module').createRequire(root + '/electron/main.cjs');
      const { AppUpdates } = require('./app-updates.cjs');
      const install = AppUpdates.prototype.install;
      globalThis.updateCalls = [];
      AppUpdates.prototype.install = function () {
        this.enabled = true;
        if (this.state.status === 'idle') this.set({ status: 'available', version: '0.1.4' });
        this.updater = {
          downloadUpdate: async () => { globalThis.updateCalls.push('download'); return ['fixture-installer']; },
          quitAndInstall: (silent, restart) => {
            const fs = require('node:fs'), path = require('node:path');
            const a = JSON.parse(fs.readFileSync(path.join(home, '.dockit', 'Documents', 'AI title.dkt'), 'utf8'));
            const b = JSON.parse(fs.readFileSync(original, 'utf8'));
            if (!a.content.includes('Save all A') || !b.content.includes('Save all external')) throw new Error('A window was not saved');
            globalThis.updateCalls.push({ silent, restart, allSaved: true });
          }
        };
        return install.call(this);
      };
    }, { root, home, original });
    await workspace.evaluate(() => window.dockitLocal.updates.install());
    await expect.poll(() => workspace.evaluate(() => window.dockitLocal.updates.status().then(state => state.status)), { timeout: 20000 }).toBe('error');
    assert.deepEqual(await app.evaluate(() => globalThis.updateCalls), ['download']);
    await external.evaluate(() => window.removeFailingSave());
    await workspace.evaluate(() => window.dockitLocal.updates.install());
    await expect.poll(() => app.evaluate(() => globalThis.updateCalls), { timeout: 20000 }).toEqual(['download', { silent: true, restart: true, allSaved: true }]);
    console.log('PASS: updater waits for every window; a failed save blocks install; retry saves both originals');
    assert.deepEqual(errors, []);
    console.log('PASS: isolated desktop smoke; no live AI requests or user files used');
  } catch (error) {
    console.error(error.message);
    if (app) for (const [index, page] of app.windows().entries()) {
      console.error('Window', index, await page.evaluate(() => ({ text: window.__dockitEditor?.getText(), active: document.activeElement?.className, history: window.__dockitEditor?.state.plugins.filter(plugin => plugin.key.startsWith('history')).map(plugin => { const state = plugin.getState(window.__dockitEditor.state); return { done: state.done.eventCount, undone: state.undone.eventCount }; }) })).catch(() => null));
      await capture(page, `failure-${index}.png`).catch(() => {});
    }
    throw error;
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit()).catch(() => {});
    await server.close();
    assert.equal(path.dirname(home), os.tmpdir()); assert.ok(path.basename(home).startsWith('dockit-windows-smoke-'));
    await fs.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
