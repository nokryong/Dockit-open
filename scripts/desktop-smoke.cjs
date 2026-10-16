const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { LocalStore } = require('../electron/local-store.cjs');
const { FONT_ORIGINS, STYLE_ORIGINS } = require('../electron/font-assets.cjs');
const root = path.join(__dirname, '..');

(async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-desktop-smoke-'));
  const artifacts = path.join(root, '.cache', 'desktop-smoke');
  await fs.mkdir(artifacts, { recursive: true });
  let app;
  const errors = [];
  const requests = [];
  const consoleErrors = [];
  const launch = async () => {
    const env = { ...process.env, DOCKIT_TEST_HOME: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [root, '--test-mode'], env, timeout: 60000 });
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url()) || new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
    page.on('requestfailed', request => consoleErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL('dockit://app/index.html#/docs', { timeout: 30000 });
    await page.getByRole('button', { name: '설정', exact: true }).waitFor({ timeout: 30000 });
    return page;
  };
  try {
    let page = await launch();
    await expect(page.getByText('첫 문서를 시작해 보세요')).toBeVisible({ timeout: 30000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.getByRole('button', { name: '설정', exact: true }).hover();
    await page.screenshot({ path: path.join(artifacts, 'workspace.png'), fullPage: true, animations: 'disabled' });
    assert.equal(await page.getByText('로그인', { exact: true }).count(), 0);
    assert.equal(await page.getByText('템플릿', { exact: true }).count(), 0);
    assert.equal(await page.getByText('AI 도움으로 초안 시작', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.ok(await fs.stat(path.join(home, '.dockit', 'config.json')));
    await expect(page.getByRole('button', { name: '창 닫기', exact: true })).toBeVisible();
    await page.locator('section[aria-labelledby="workspace-starter-title"]').getByRole('button', { name: '새 문서', exact: true }).click();
    await page.locator('.tiptap-main-canvas[contenteditable="true"]').waitFor({ timeout: 30000 });
    const editor = page.locator('.tiptap-main-canvas[contenteditable="true"]');
    await editor.fill('로컬 문서 저장 검증');
    await page.keyboard.press('Control+s');
    await expect.poll(async () => {
      const names = (await fs.readdir(path.join(home, '.dockit', 'Documents'))).filter(name => name.endsWith('.dkt'));
      if (!names.length) return '';
      return JSON.parse(await fs.readFile(path.join(home, '.dockit', 'Documents', names[0]), 'utf8')).content;
    }).toContain('로컬 문서 저장 검증');
    const documentId = await page.evaluate(() => location.hash.split('/')[2]);
    const nested = await page.evaluate(async () => {
      const rootFolder = (await window.dockitLocal.data('create', { type: 'folders', data: { title: '업무 폴더' } })).content;
      const childFolder = (await window.dockitLocal.data('create', { type: 'folders', parentId: rootFolder._id, data: { title: '보고서 폴더' } })).content;
      const doc = (await window.dockitLocal.data('create', { type: 'documents', parentId: childFolder._id, data: { title: '중첩 문서' } })).content;
      return { rootFolder, childFolder, doc };
    });
    await page.getByRole('button', { name: '메뉴', exact: true }).click();
    await page.getByRole('dialog').getByText('업무 폴더', { exact: true }).click();
    await page.getByRole('dialog').getByText('보고서 폴더', { exact: true }).click();
    await expect(page.getByRole('dialog').getByText('중첩 문서', { exact: true })).toBeVisible();
    await page.locator('.sud-drawer__close').click();
    await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0);
    await page.evaluate(id => { location.hash = '/docs?folder=' + encodeURIComponent(id); }, nested.childFolder._id);
    await expect(page.getByText('중첩 문서', { exact: true }).first()).toBeVisible();
    await page.evaluate(id => { location.hash = '/docs/' + id; }, documentId);
    await expect(page.locator('.tiptap-main-canvas')).toContainText('로컬 문서 저장 검증');
    // Enable the existing panels through the same persisted settings IPC used by the UI.
    await page.evaluate(() => window.dockitLocal.data('update', { type: 'panels', data: { panels: { left: ['memo'], right: ['specialChar'] } } }));
    await page.reload();
    await page.getByRole('button', { name: '특수문자 즐겨찾기 편집', exact: true }).click();
    await page.getByPlaceholder('문자를 한 글자 입력하세요').fill('★');
    await page.getByRole('button', { name: '특수문자 추가', exact: true }).click();
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(home, '.dockit', 'characters', 'default.json'), 'utf8')).char.map(item => item.char)).toContain('★');
    await page.getByRole('button', { name: '특수문자 즐겨찾기 편집', exact: true }).click();
    await page.locator('[data-widget-type="memo"] [contenteditable="true"]').fill('재실행 뒤에도 남는 메모');
    await page.getByRole('button', { name: '테마 변경', exact: true }).click();
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(home, '.dockit', 'config.json'), 'utf8')).setting.isDarkMode).toBe(true);
    await page.getByRole('button', { name: '툴킷 설정', exact: true }).click();
    assert.equal(await page.getByText('지도 벡터', { exact: true }).count(), 0);
    assert.equal(await page.getByText('AI 도움', { exact: true }).count(), 0);
    await page.getByRole('dialog').getByRole('button', { name: 'ChatGPT', exact: true }).click();
    await page.locator('.sud-drawer__close').click();
    await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0);
    await page.screenshot({ path: path.join(artifacts, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 720, height: 800 });
    await page.screenshot({ path: path.join(artifacts, 'narrow.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(page.getByRole('button', { name: 'ChatGPT 전송', exact: true })).toBeDisabled();
    const chatInput = page.locator('[data-widget-type="aiChat"] textarea');
    await chatInput.fill('연결 전 요청');
    await chatInput.press('Shift+Enter');
    await expect(chatInput).toContainText('연결 전 요청');
    await page.locator('[data-widget-type="aiChat"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'ai-widgets.png'), fullPage: true, animations: 'disabled' });
    await page.locator('.tiptap-main-canvas[contenteditable="true"]').fill('로컬 문서 저장 검증 — 이동 직전 수정');
    // The titlebar logo is the document list entry point.
    await page.locator('.titlebar-logo[role="button"]').click();
    await page.waitForURL('dockit://app/index.html#/docs');
    await page.evaluate(id => { location.hash = '/docs/' + id; }, documentId);
    await expect(page.locator('.tiptap-main-canvas')).toContainText('이동 직전 수정');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByText('테마설정', { exact: true })).toBeVisible();
    assert.equal(await page.getByRole('dialog').locator('select').count(), 0);
    await expect(page.getByRole('dialog').locator('button[aria-label^="테마 "]')).toHaveCount(26);
    await page.getByRole('dialog').locator('button[aria-label^="테마 "]').last().hover();
    await page.screenshot({ path: path.join(artifacts, 'settings.png'), fullPage: true, animations: 'disabled' });
    await expect(page.getByText(path.join(home, '.dockit', 'Documents'), { exact: true })).toBeVisible();
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await page.getByRole('button', { name: '문서 폴더 변경', exact: true }).click();
    assert.equal(JSON.parse(await fs.readFile(path.join(home, '.dockit', 'config.json'), 'utf8')).documentsPath, path.join(home, '.dockit', 'Documents'));
    await page.locator('.sud-drawer__close').click();
    await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0);
    assert.equal(await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getBounds().height === win.getContentBounds().height;
    }), true);
    await page.getByRole('button', { name: '창 최소화', exact: true }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
    await page.getByRole('button', { name: '창 최대화', exact: true }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await page.getByRole('button', { name: '창 복원', exact: true }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
    await page.locator('.tiptap-main-canvas[contenteditable="true"]').fill('로컬 문서 저장 검증 — 종료 직전 수정');
    await page.locator('[data-widget-type="memo"] [contenteditable="true"]').fill('재실행 뒤에도 남는 메모 — 종료 직전 수정');
    const closed = app.waitForEvent('close', { timeout: 20000 });
    await page.getByRole('button', { name: '창 닫기', exact: true }).click();
    await closed; app = null;
    const documentFiles = (await fs.readdir(path.join(home, '.dockit', 'Documents'))).filter(name => name.endsWith('.dkt'));
    assert.match(JSON.parse(await fs.readFile(path.join(home, '.dockit', 'Documents', documentFiles[0]), 'utf8')).content, /종료 직전 수정/);
    page = await launch();
    await page.evaluate(id => { location.hash = '/docs/' + id; }, documentId);
    await expect(page.locator('.tiptap-main-canvas')).toContainText('로컬 문서 저장 검증 — 종료 직전 수정', { timeout: 30000 });
    await expect(page.getByRole('button', { name: '특수문자 ★ 삽입', exact: true })).toBeVisible();
    await expect(page.locator('[data-widget-type="memo"] [contenteditable="true"]')).toContainText('재실행 뒤에도 남는 메모 — 종료 직전 수정');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('[data-widget-type="aiChat"]')).toBeAttached();
    assert.deepEqual(errors, []);
    // Web fonts from the allowlisted origins are the only permitted network traffic.
    const allowedOrigins = new Set([...FONT_ORIGINS, ...STYLE_ORIGINS]);
    assert.deepEqual(requests.filter(url => !allowedOrigins.has(new URL(url).origin)), []);
    assert.deepEqual(consoleErrors, []);
    console.log('PASS: frameless window minimize/maximize/restore/close, login-free Electron launch, document create/edit/save/reopen, save before navigation and window close after resize, memo/favorites/theme persistence, ChatGPT widget placement, narrow layout, no network requests beyond allowlisted web fonts.');
    console.log('Screenshots: ' + artifacts);
  } catch (error) {
    if (app) {
      const page = await app.firstWindow().catch(() => null);
      if (page) { await page.screenshot({ path: path.join(artifacts, 'failure.png'), timeout: 5000 }).catch(() => {}); console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 4000)); }
    }
    console.error('Renderer errors:', errors);
    console.error('Console errors:', consoleErrors.slice(-12));
    console.error('External requests:', requests);
    throw error;
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit()).catch(() => {});
    assert.equal(path.dirname(path.resolve(home)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(home).startsWith('dockit-desktop-smoke-'));
    await fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
