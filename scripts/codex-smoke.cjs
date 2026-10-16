const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { FONT_ORIGINS, STYLE_ORIGINS } = require('../electron/font-assets.cjs');
const root = path.join(__dirname, '..');
const fixture = path.join(root, 'tests/helpers/codex-electron-fixture.cjs');

(async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-codex-smoke-'));
  const artifacts = path.join(root, '.cache/codex-smoke'); await fs.mkdir(artifacts, { recursive: true });
  let app, page; const errors = [], requests = [];
  const call = (method, value) => app.evaluate(({ app }, args) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    return require(args.fixture)[args.method](args.value);
  }, { fixture, method, value });
  const launch = async () => {
    const env = { ...process.env, DOCKIT_TEST_HOME: home }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [root, '--test-mode'], env, timeout: 60000 });
    await app.evaluate(({ app, clipboard, dialog }, fixture) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      require(fixture).install({ clipboard, dialog });
    }, fixture);
    page = await app.firstWindow(); page.setDefaultTimeout(20000);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.getByRole('button', { name: '설정', exact: true }).waitFor();
    await page.reload();
  };
  const closeDrawer = async () => { await page.locator('.sud-drawer__close').click(); await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0); };
  const capture = async name => {
    if (name.startsWith('settings-')) await expect(page.locator('section[aria-labelledby="codex-settings-title"]')).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await new Promise(resolve => setTimeout(resolve, 350));
    await app.evaluate(async ({ BrowserWindow }) => { await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }); });
    try { await page.screenshot({ path: path.join(artifacts, name), timeout: 5000 }); }
    catch { await page.screenshot({ path: path.join(artifacts, name), timeout: 10000 }); }
  };
  try {
    await launch();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const section = page.locator('section[aria-labelledby="codex-settings-title"]');
    await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toBeVisible();
    await expect(section.getByRole('button', { name: 'CLI로 로그인하기', exact: true })).toBeVisible();
    await call('mode', 'hold-login');
    await section.getByRole('button', { name: 'CLI로 로그인하기', exact: true }).click();
    await expect(section.getByText('브라우저에서 CLI 로그인을 마쳐주세요.')).toBeVisible();
    await section.getByRole('button', { name: '로그인 취소', exact: true }).click();
    await expect(section.getByRole('button', { name: 'CLI로 로그인하기', exact: true })).toBeEnabled();
    await call('mode', 'success');
    await section.getByRole('button', { name: 'CLI로 로그인하기', exact: true }).click();
    await expect(section.getByRole('button', { name: 'CLI 로그아웃', exact: true })).toBeVisible();
    await expect(section.getByText('80% 남음')).toBeVisible();
    assert.ok(!JSON.stringify(await page.evaluate(() => window.dockitLocal.codex.status())).includes('fixture-secret'));
    await capture('settings-light.png');
    await closeDrawer();
    await page.getByRole('button', { name: '테마 변경', exact: true }).click();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await capture('settings-dark.png'); await closeDrawer();
    await page.getByRole('button', { name: '테마 변경', exact: true }).click();
    await page.locator('section[aria-labelledby="workspace-starter-title"]').getByRole('button', { name: '새 문서', exact: true }).click();
    await page.locator('.tiptap-main-canvas').waitFor();
    await page.evaluate(() => window.dockitLocal.data('update', { type: 'panels', data: { panels: { left: ['aiChat'], right: [] } } }));
    await page.reload();
    const chat = page.locator('[data-widget-type="aiChat"]');
    const providerSwitch = chat.getByRole('switch', { name: 'GPT/Codex 전환' });
    // The native input is visually hidden; users press the surrounding label.
    const providerToggle = chat.locator('label.sud-switch', { has: page.getByRole('switch', { name: 'GPT/Codex 전환' }) });
    if (!(await providerSwitch.isChecked())) await providerToggle.click();
    await expect(providerSwitch).toBeChecked();
    await expect.poll(async () => (await page.evaluate(() => window.dockitLocal.codex.status())).model).toBe('fixture-codex');
    await chat.locator('textarea').fill('CLI 테스트'); await chat.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    await expect(chat.getByText('CLI 대화 테스트 응답입니다.')).toBeVisible({ timeout: 20000 });
    await capture('widgets.png');
    // Switching to ChatGPT asks for its own connection; the CLI login is independent.
    await providerToggle.click();
    await expect(providerSwitch).not.toBeChecked();
    await expect(chat.getByText('설정에서 ChatGPT를 연결해주세요.')).toBeVisible();
    await providerToggle.click();
    await expect(providerSwitch).toBeChecked();
    await call('mode', 'hold-turn');
    await chat.locator('textarea').fill('멈추기'); await chat.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    await chat.getByRole('button', { name: 'AI 응답 중지', exact: true }).click();
    await expect(chat.getByText('응답 중지됨')).toBeVisible();
    await call('mode', 'success');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await section.getByRole('button', { name: 'CLI 로그아웃', exact: true }).click(); await closeDrawer();
    await expect(chat.getByText('설정에서 CLI로 로그인해주세요.')).toBeVisible();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await section.getByRole('button', { name: 'CLI로 로그인하기', exact: true }).click();
    await expect(section.getByRole('button', { name: 'CLI 로그아웃', exact: true })).toBeVisible(); await closeDrawer();
    await expect(chat.getByText('CLI 대화 테스트 응답입니다.')).toBeVisible({ timeout: 20000 });
    await page.setViewportSize({ width: 720, height: 800 }); await page.reload();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await section.scrollIntoViewIfNeeded(); await capture('settings-narrow.png');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    // Web fonts from the allowlisted origins are the only permitted network traffic.
    const allowedOrigins = new Set([...FONT_ORIGINS, ...STYLE_ORIGINS]);
    assert.deepEqual(errors, []); assert.deepEqual(requests.filter(url => !allowedOrigins.has(new URL(url).origin)), []);
    console.log('PASS: separate CLI login/cancel/logout, usage, independent provider selection, chat/stop/history, light/dark/narrow settings. Synthetic auth and inference; no live account used.');
    console.log('Screenshots: ' + artifacts);
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-2500)); }
    throw error;
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit()).catch(() => {});
    assert.equal(path.dirname(home), os.tmpdir()); assert.ok(path.basename(home).startsWith('dockit-codex-smoke-'));
    await fs.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
