const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { FONT_ORIGINS, STYLE_ORIGINS } = require('../electron/font-assets.cjs');
const root = path.join(__dirname, '..');
const fixture = path.join(root, 'tests/helpers/chatgpt-electron-fixture.cjs');

(async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-chatgpt-smoke-'));
  const artifacts = path.join(root, '.cache/chatgpt-smoke');
  await fs.mkdir(artifacts, { recursive: true });
  const errors = [];
  const externalRequests = [];
  let app, page;
  const call = (method, value) => app.evaluate(({ app }, args) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    return require(args.file)[args.method](args.value);
  }, { file: fixture, method, value });
  const launch = async () => {
    const env = { ...process.env, DOCKIT_TEST_HOME: home }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [root, '--test-mode'], env, timeout: 60000 });
    await app.evaluate(async ({ app, shell }, file) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      await require(file).install({ shell });
    }, fixture);
    page = await app.firstWindow(); page.setDefaultTimeout(25000);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.getByRole('button', { name: '설정', exact: true }).waitFor();
  };
  const closeDrawer = async () => { await page.locator('.sud-drawer__close').click(); await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0); };
  try {
    await launch();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const section = page.locator('section[aria-labelledby="chatgpt-settings-title"]');
    await expect(section.getByRole('button', { name: 'Continue with ChatGPT' })).toBeVisible();
    const cardTop = await section.boundingBox(); const themeTop = await page.getByText('테마설정', { exact: true }).boundingBox();
    assert.ok(cardTop.y < themeTop.y);
    await expect(page.getByRole('dialog').locator('button[aria-label^="테마 "]')).toHaveCount(26);
    await page.screenshot({ path: path.join(artifacts, 'settings-light.png'), animations: 'disabled' });
    await call('mode', 'hold');
    await section.getByRole('button', { name: 'Continue with ChatGPT' }).click();
    await expect(section.getByText('브라우저에서 연결을 마쳐주세요.')).toBeVisible();
    await section.getByRole('button', { name: '취소', exact: true }).click();
    await expect(section.getByRole('button', { name: 'Continue with ChatGPT' })).toBeEnabled();
    await call('mode', 'success');
    await section.getByRole('button', { name: 'Continue with ChatGPT' }).click();
    await expect(page.getByRole('heading', { name: 'ChatGPT 요금제를 사용합니다' })).toBeVisible();
    await page.getByRole('button', { name: '확인', exact: true }).click();
    // 요금제를 공유하면 로그인 버튼 대신 계정 관리 버튼 표시
    await expect(section.getByRole('button', { name: 'Continue with ChatGPT' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: '연결 해제', exact: true })).toBeVisible();
    await section.getByRole('button', { name: '사용량 관리 ↗' }).click();
    assert.equal((await call('stats')).openedUsage, 1);
    assert.equal((await call('stats')).inferences, 0);
    assert.equal((await call('stats')).authOrigin, 'https://auth.openai.com');
    await page.screenshot({ path: path.join(artifacts, 'settings-connected.png'), animations: 'disabled' });
    await closeDrawer();
    await page.getByRole('button', { name: '테마 변경', exact: true }).click();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'settings-dark.png'), animations: 'disabled' });
    await closeDrawer();
    await page.getByRole('button', { name: '테마 변경', exact: true }).click();
    await page.locator('section[aria-labelledby="workspace-starter-title"]').getByRole('button', { name: '새 문서', exact: true }).click();
    await page.locator('.tiptap-main-canvas').waitFor();
    const documentHash = await page.evaluate(() => location.hash);
    await page.evaluate(() => window.dockitLocal.data('update', { type: 'panels', data: { panels: { left: ['aiChat'], right: [] } } }));
    await page.reload();
    const widget = page.locator('[data-widget-type="aiChat"]');
    await expect.poll(async () => (await page.evaluate(() => window.dockitLocal.chatgpt.status())).active?.model).toBe('fixture-model');
    await expect(page.getByRole('heading', { name: 'ChatGPT 요금제를 사용합니다' })).toHaveCount(0);
    await widget.locator('textarea').fill('안녕하세요');
    await widget.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    // 스트리밍 응답은 조금씩 보여서 몇 초 걸릴 수 있음
    await expect(widget.getByText('안녕하세요. 연결 테스트 응답입니다.')).toBeVisible({ timeout: 20000 });
    await expect(widget.getByRole('button', { name: 'ChatGPT 전송', exact: true })).toBeVisible();
    const ipc = JSON.stringify(await page.evaluate(() => window.dockitLocal.chatgpt.status()));
    assert.ok(!ipc.includes('fixture-access')); assert.ok(!ipc.includes('fixture-refresh'));
    const encrypted = await fs.readFile(path.join(home, '.dockit/ai/connections.json'), 'utf8');
    assert.ok(!encrypted.includes('fixture-access')); assert.ok(!encrypted.includes('dockit-test@example.invalid'));
    const config = await fs.readFile(path.join(home, '.dockit/config.json'), 'utf8');
    assert.ok(!config.includes('fixture-access')); assert.ok(!config.includes('access_token'));
    await call('mode', 'slow');
    await widget.locator('textarea').fill('경과 시간 테스트');
    await widget.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    // 고정 응답이 첫 이벤트를 4초 늦추므로 여기서 화면을 찍으면 이 상태를 놓침
    await expect(widget.getByText(/^0분 [1-3]초 작업 중$/)).toBeVisible({ timeout: 5000 });
    await expect(widget.getByText(/작업 중$/)).toHaveCount(0, { timeout: 20000 });
    await expect(widget.getByRole('button', { name: 'ChatGPT 전송', exact: true })).toBeVisible();
    await call('mode', 'usage-limit');
    await widget.locator('textarea').fill('한도 테스트');
    await widget.getByRole('button', { name: 'ChatGPT 전송', exact: true }).click();
    await expect(widget.getByRole('alert')).toContainText('사용 한도에 도달');
    await expect(widget.getByRole('alert').getByRole('button', { name: '사용량 관리', exact: true })).toBeVisible();
    await expect(widget.getByText('응답 미완료', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, 'chat-usage-limit.png'), animations: 'disabled' });
    const closed = app.waitForEvent('close');
    await page.getByRole('button', { name: '창 닫기', exact: true }).click(); await closed; app = null;
    await launch();
    await page.evaluate(hash => { location.hash = hash; }, documentHash);
    await expect(page.locator('[data-widget-type="aiChat"]').getByText('안녕하세요. 연결 테스트 응답입니다.').first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'ChatGPT 요금제를 사용합니다' })).toHaveCount(0);
    await page.locator('section[aria-labelledby="chatgpt-settings-title"]').getByRole('button', { name: '연결 해제', exact: true }).click();
    await expect(page.locator('section[aria-labelledby="chatgpt-settings-title"]').getByRole('button', { name: 'Continue with ChatGPT' })).toBeEnabled();
    await expect(page.getByRole('combobox', { name: 'ChatGPT 연결 계정' })).toHaveCount(0);
    const signedOut = await page.evaluate(() => window.dockitLocal.chatgpt.status());
    assert.equal(signedOut.active, null);
    assert.deepEqual(signedOut.profiles, []);
    await call('mode', 'identity-only');
    await page.locator('section[aria-labelledby="chatgpt-settings-title"]').getByRole('button', { name: 'Continue with ChatGPT' }).click();
    // 요금제 공유 없이 로그인한 상태 (동의 단계가 계속 나오고 채팅은 잠김)
    await expect(page.locator('section[aria-labelledby="chatgpt-settings-title"]').getByRole('button', { name: 'Continue with ChatGPT' })).toBeEnabled();
    await expect(page.locator('[data-widget-type="aiChat"]').getByRole('button', { name: 'ChatGPT 전송', exact: true })).toBeDisabled();
    await call('mode', 'success');
    await page.locator('section[aria-labelledby="chatgpt-settings-title"]').getByRole('button', { name: 'Continue with ChatGPT' }).click();
    await expect(page.locator('section[aria-labelledby="chatgpt-settings-title"]').getByRole('button', { name: 'Continue with ChatGPT' })).toHaveCount(0);
    assert.equal((await call('stats')).registrations, 1);
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await closeDrawer();
    await page.setViewportSize({ width: 720, height: 800 }); await page.reload();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.locator('section[aria-labelledby="chatgpt-settings-title"]')).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, 'settings-narrow.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    // 허용된 출처의 웹 글꼴만 네트워크 통신 허용
    const allowedOrigins = new Set([...FONT_ORIGINS, ...STYLE_ORIGINS]);
    assert.deepEqual(externalRequests.filter(url => !allowedOrigins.has(new URL(url).origin)), []);
    console.log('PASS: settings top placement, light/dark/narrow layouts, cancelled OAuth, verified callback, one-time welcome, encrypted OS storage across restart, chat streaming/history, usage-limit action, logout removes account information and next sign-in registers again, declined plan scope. All network responses are synthetic; no live account used.');
    console.log('Screenshots: ' + artifacts);
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-3500)); }
    throw error;
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit()).catch(() => {});
    assert.equal(path.dirname(home), os.tmpdir()); assert.ok(path.basename(home).startsWith('dockit-chatgpt-smoke-'));
    await fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
