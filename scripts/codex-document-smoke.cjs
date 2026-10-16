const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { LocalStore } = require('../electron/local-store.cjs');
const root = path.join(__dirname, '..');
const fixture = path.join(root, 'tests/helpers/codex-electron-fixture.cjs');

(async () => {
  const artifacts = path.join(root, '.cache/codex-document-smoke');
  await fs.mkdir(artifacts, { recursive: true });
  const home = await fs.mkdtemp(path.join(artifacts, 'home-'));
  const store = new LocalStore({ home }); await store.init();
  const { content: doc } = await store.request('create', { type: 'documents', data: { title: 'Codex 문서 연결 확인', content: '<p>시작 문서</p>' } });
  const file = await store.documentPath(doc._id);
  await store.request('update', { type: 'setting', data: { aiProvider: 'codex', autoSave: true, autoSaveDelay: 100 } });
  await store.request('update', { type: 'panels', data: { panels: { left: [], right: ['aiChat'] } } });
  let app, page, server;
  const errors = [];
  const call = (method, value) => app.evaluate(({ app }, args) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    return require(args.fixture)[args.method](args.value);
  }, { fixture, method, value });
  const documentTool = async (name, args) => {
    const result = await call('tool', { name, args });
    assert.equal(result.success, true, result.contentItems[0].text);
    return JSON.parse(result.contentItems[0].text);
  };
  try {
    const { createServer } = await import('vite');
    server = await createServer({ root, cacheDir: '.cache/vite-tests/codex-documents', server: { host: '127.0.0.1', port: 0, strictPort: false, watch: { ignored: ['**/.cache/**', '**/_temp/**', '**/.dockit/**'] } } });
    await server.listen();
    const env = { ...process.env, DOCKIT_TEST_HOME: home, DOCKIT_DEV_SERVER_URL: server.resolvedUrls.local[0] };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [root, '--test-mode', '--dev'], env });
    await app.evaluate(({ app, clipboard, dialog, BrowserWindow }, fixture) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      require(fixture).install({ clipboard, dialog });
      BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
    }, fixture);
    page = await app.firstWindow(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.reload({ waitUntil: 'commit' });
    await page.getByText('Codex 문서 연결 확인', { exact: true }).waitFor({ timeout: 45000 });
    await page.evaluate(() => window.dockitLocal.codex.status());
    await page.evaluate(() => window.dockitLocal.codex.signIn());
    await page.getByText('Codex 문서 연결 확인', { exact: true }).dblclick();
    const canvas = page.locator('.tiptap-main-canvas');
    await canvas.waitFor({ timeout: 30000 });
    const chat = page.locator('[data-widget-type="aiChat"]');
    await chat.locator('textarea').waitFor();
    await call('mode', 'hold-turn');
    await page.evaluate(() => document.querySelector('.tiptap-main-canvas').editor.commands.insertContent('<p>전송 직전 미저장</p>'));
    await chat.locator('textarea').fill('현재 문서를 수정해주세요.');
    await chat.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    await expect.poll(async () => (await call('stats')).turns).toBe(1);
    await expect(canvas).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.tiptap-title .tiptap')).toHaveAttribute('contenteditable', 'false');
    const initial = await documentTool('dockit_read_document');
    assert.ok(initial.document.content.includes('전송 직전 미저장'));
    assert.equal(initial.path, file);
    const lockedText = await canvas.innerText();
    await page.evaluate(() => document.querySelector('.tiptap-main-canvas').editor.commands.insertContent('금지된 변경'));
    assert.equal(await canvas.innerText(), lockedText);
    const html = '<h1><span style="font-family: PretendardBold; font-size: 24pt">AI 대제목</span></h1>'
      + '<h2><span style="font-family: PretendardMedium; font-size: 16pt">AI 소제목</span></h2>'
      + '<p><span style="font-family: PretendardLight; font-size: 12pt">본문 <strong>부분 강조</strong> x<sup>2</sup> H<sub>2</sub>O</span></p>'
      + '<table data-object-id="smoke-table"><tbody><tr><th colwidth="120"><p>항목</p></th><th colwidth="180"><p>설명</p></th></tr><tr><td colwidth="120"><p>첫째</p></td><td colwidth="180"><p>내용</p></td></tr></tbody></table>'
      + '<p>각주<span data-dockit-note-reference="true" data-dockit-note-id="note-v1-smoke" data-dockit-note-kind="footnote"></span></p>'
      + '<section data-dockit-note-body="true" data-dockit-note-id="note-v1-smoke" data-dockit-note-kind="footnote"><p>각주 설명</p></section>';
    await documentTool('dockit_edit_document', { expectedRevision: initial.revision, updates: { title: 'AI 수정 문서', content: html } });
    await expect(canvas.getByText('AI 대제목', { exact: true })).toBeVisible();
    await expect(canvas.locator('sup')).toContainText('2');
    await expect(canvas.locator('sub')).toContainText('2');
    await expect(canvas).toHaveAttribute('contenteditable', 'false');
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).content, html);
    await page.screenshot({ path: path.join(artifacts, 'working-desktop.png') });
    await page.setViewportSize({ width: 680, height: 820 });
    await page.screenshot({ path: path.join(artifacts, 'working-narrow.png') });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.reload({ waitUntil: 'commit' });
    await expect(canvas.getByText('AI 대제목', { exact: true })).toBeVisible();
    await expect(canvas).toHaveAttribute('contenteditable', 'false');
    await call('complete');
    await expect(canvas).toHaveAttribute('contenteditable', 'true');
    await page.evaluate(() => {
      const editor = document.querySelector('.tiptap-main-canvas').editor;
      editor.commands.setTextSelection(2);
      editor.commands.insertContent('사용자 후속 편집 ');
    });
    await expect.poll(async () => {
      const entries = await fs.readdir(path.dirname(file));
      for (const name of entries.filter(name => name.endsWith('.dkt'))) {
        const record = JSON.parse(await fs.readFile(path.join(path.dirname(file), name), 'utf8'));
        if (record._local.id === doc._id) return record.content.includes('사용자 후속 편집');
      }
      return false;
    }).toBe(true);
    await chat.locator('textarea').fill('중단할 작업');
    await chat.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    await expect.poll(async () => (await call('stats')).turns).toBe(2);
    await page.getByRole('button', { name: '중단', exact: true }).click();
    await expect(canvas).toHaveAttribute('contenteditable', 'true');
    assert.deepEqual(errors, []);
    console.log('PASS: unsaved content flush, document/title/command locks, real file edits, live reload, fonts/marks/table/notes, subsequent autosave, cancellation. Synthetic Codex; no live account inference.');
    console.log(artifacts);
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
      console.error((await page.locator('body').innerText()).slice(-1600));
    }
    throw error;
  } finally {
    if (app) { try { await page.evaluate(() => { void window.dockitLocal.closeReady(); }); } catch {} await app.close(); }
    if (server) await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
