const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');

(async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-i18n-'));
  const artifacts = path.join(root, '.cache', 'i18n-smoke');
  await fs.mkdir(artifacts, { recursive: true });
  let app;
  const errors = [];
  const launch = async (lang = 'ko') => {
    const env = { ...process.env, DOCKIT_TEST_HOME: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [`--lang=${lang}`, root, '--test-mode'], env, timeout: 60000 });
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL('dockit://app/index.html#/docs');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    return page;
  };
  try {
    let page = await launch();
    // 기본값은 시스템 언어 사용
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    assert.equal(JSON.parse(await fs.readFile(path.join(home, '.dockit', 'config.json'), 'utf8')).setting.language, 'system');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.locator('#interface-language')).toHaveValue('system');
    await page.locator('#interface-language').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('dialog').getByText('Use my ChatGPT plan', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
    await expect(page.getByRole('dialog').locator('[style*="will-change"]').first()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: path.join(artifacts, 'settings-en.png'), fullPage: true, animations: 'disabled' });
    await page.locator('.sud-drawer__close').click();
    await expect(page.getByText('Start your first document', { exact: true })).toBeVisible();
    await page.locator('section[aria-labelledby="workspace-starter-title"]').getByRole('button', { name: 'New document', exact: true }).click();
    const editor = page.locator('.tiptap-main-canvas[contenteditable="true"]');
    await editor.waitFor();
    await expect(page.locator('[data-placeholder="Start your document with a sentence."]')).toHaveCount(1);
    const content = '한국어 원문은 유지합니다. English content stays unchanged. 日本語もそのまま。';
    await editor.fill(content);
    await page.keyboard.press('Control+s');
    const files = async () => (await fs.readdir(path.join(home, '.dockit', 'Documents'))).filter(name => name.endsWith('.dkt'));
    await expect.poll(async () => (await files()).length).toBe(1);
    const documentPath = path.join(home, '.dockit', 'Documents', (await files())[0]);
    await expect.poll(async () => JSON.parse(await fs.readFile(documentPath, 'utf8')).content).toContain(content);
    const before = JSON.parse(await fs.readFile(documentPath, 'utf8'));
    await page.getByRole('button', { name: 'Toolkit settings', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Symbols', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Keyboard shortcuts', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').locator('[style*="will-change"]').first()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: path.join(artifacts, 'toolkits-en.png'), fullPage: true, animations: 'disabled' });
    await page.locator('.sud-drawer__close').click();
    await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0);
    await page.screenshot({ path: path.join(artifacts, 'editor-en.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 720, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.screenshot({ path: path.join(artifacts, 'narrow-en.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#interface-language').selectOption('ko');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.locator('.sud-drawer__close').click();
    await expect(editor).toContainText(content);
    await expect(page.getByRole('combobox', { name: '글꼴', exact: true }).getByRole('textbox')).toHaveValue('프리텐다드 Medium');
    const after = JSON.parse(await fs.readFile(documentPath, 'utf8'));
    assert.equal(after.content, before.content);
    assert.equal(after.title, before.title);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.locator('#interface-language').selectOption('en');
    await expect(page.getByRole('combobox', { name: 'Font', exact: true }).getByRole('textbox')).toHaveValue('Pretendard Medium');
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(home, '.dockit', 'config.json'), 'utf8')).setting.language).toBe('en');
    await app.close();
    page = await launch();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const failure = await page.evaluate(async () => {
      try { await window.dockitLocal.data('get', { type: 'documents', id: '../../invalid' }); }
      catch (error) { return error.message; }
      return '';
    });
    assert.ok(failure && !/[가-힣]/.test(failure), failure);
    // 시스템 언어 사용 (한국어 외 시스템 언어는 영어)
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#interface-language').selectOption('system');
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(home, '.dockit', 'config.json'), 'utf8')).setting.language).toBe('system');
    await app.close();
    for (const [lang, expected] of [['en-US', 'en'], ['ja', 'en'], ['ko', 'ko']]) {
      page = await launch(lang);
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
      await expect(page.getByRole('button', { name: expected === 'ko' ? '설정' : 'Settings', exact: true })).toBeVisible();
      await app.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, languagePersists: true, systemLanguage: true, documentPreserved: true, nativeError: failure, artifacts }));
  } finally {
    await app?.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
