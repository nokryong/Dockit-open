const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { unzipSync } = require('fflate');
const { blobHash } = require('../electron/plugin-github.cjs');

const root = path.join(__dirname, '..');
const packageFile = path.join(root, '.cache', 'example-plugin', 'dockit.dice-0.1.0.zip');
const artifacts = path.join(root, '.cache', 'plugin-smoke');
const repositoryUrl = process.env.DOCKIT_PLUGIN_TEST_URL || 'https://github.com/nokryong/dockit-plugin-smoke';

(async () => {
  await fs.access(packageFile);
  const fixtureFiles = Object.fromEntries(Object.entries(unzipSync(await fs.readFile(packageFile))).map(([name, bytes]) => ['plugins/dice/' + name, Buffer.from(bytes).toString('base64')]));
  const fixtureTree = Object.entries(fixtureFiles).map(([file, content]) => ({ path: file, mode: '100644', type: 'blob', sha: blobHash(Buffer.from(content, 'base64')), size: Buffer.byteLength(content, 'base64') }));
  await fs.mkdir(artifacts, { recursive: true });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-plugin-smoke-'));
  const dataFile = path.join(home, '.dockit', 'plugin-data', 'dockit.dice', 'storage.json');
  const errors = [];
  let app;
  let server;
  const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const number = socket.address().port; socket.close(() => resolve(number)); }); });
  const { createServer } = await import('vite');
  server = await createServer({ root, configFile: path.join(root, 'vite.config.mjs'), cacheDir: path.join(root, '.cache', 'plugin-smoke-vite'), server: { host: '127.0.0.1', port, strictPort: true, watch: { ignored: ['**/.cache/**', '**/electron/**', '**/scripts/**', '**/tests/**', '**/docs/**', '**/_temp/**'] } }, clearScreen: false });
  await server.listen();
  const launch = async () => {
    const env = { ...process.env, DOCKIT_TEST_HOME: home, DOCKIT_DEV_SERVER_URL: `http://127.0.0.1:${port}` };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [root, '--dev', '--test-mode'], env, timeout: 60000 });
    if (!process.env.DOCKIT_PLUGIN_TEST_URL) await app.evaluate((_, fixture) => {
      const originalFetch = globalThis.fetch;
      const commit = 'a'.repeat(40);
      globalThis.fetch = async (url, options) => {
        if (url.startsWith('https://api.github.com/repos/nokryong/dockit-plugin-smoke/commits?')) return Response.json([{ sha: commit, commit: { tree: { sha: 'b'.repeat(40) } } }]);
        if (url.startsWith('https://api.github.com/repos/nokryong/dockit-plugin-smoke/git/trees/')) return Response.json({ tree: fixture.tree, truncated: false });
        const prefix = `https://raw.githubusercontent.com/nokryong/dockit-plugin-smoke/${commit}/`;
        if (url.startsWith(prefix)) {
          const content = fixture.files[decodeURIComponent(url.slice(prefix.length))];
          return content === undefined ? new Response(null, { status: 404 }) : new Response(Buffer.from(content, 'base64'));
        }
        return originalFetch(url, options);
      };
    }, { files: fixtureFiles, tree: fixtureTree });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.log('renderer:', message.text().slice(0, 800)); });
    await page.getByRole('button', { name: '설정', exact: true }).waitFor({ timeout: 60000 });
    return page;
  };
  const closeDrawer = async page => { await page.locator('.sud-drawer__close').click(); await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0); };
  const install = async page => {
    await page.getByRole('button', { name: '플러그인', exact: true }).click();
    await page.getByRole('button', { name: '플러그인 설치', exact: true }).click();
    const modal = page.getByRole('dialog', { name: '플러그인 설치', exact: true });
    await modal.getByRole('textbox').fill(repositoryUrl);
    await modal.getByRole('button', { name: '설치', exact: true }).click();
    await expect(page.getByRole('button', { name: '주사위 삭제', exact: true })).toBeVisible();
    await closeDrawer(page);
  };
  const openDice = async page => {
    await page.getByRole('button', { name: '툴킷 설정', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '주사위', exact: true }).click();
    await closeDrawer(page);
    await expect(page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button', { name: '주사위 1 굴리기', exact: true })).toBeVisible();
  };
  const remove = async (page, option) => {
    await page.getByRole('button', { name: '플러그인', exact: true }).click();
    await page.getByRole('button', { name: '주사위 삭제', exact: true }).click();
    await page.getByRole('dialog', { name: '플러그인 삭제', exact: true }).getByRole('button', { name: option, exact: true }).click();
    await expect(page.getByRole('button', { name: '주사위 삭제', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '플러그인 삭제', exact: true })).toHaveCount(0);
    await closeDrawer(page);
    await expect(page.locator('iframe[title="주사위 플러그인"]')).toHaveCount(0);
  };
  try {
    let page = await launch();
    await page.locator('section[aria-labelledby="workspace-starter-title"]').getByRole('button', { name: '새 문서', exact: true }).click();
    await page.locator('.tiptap-main-canvas').waitFor();
    await page.getByRole('button', { name: '플러그인', exact: true }).click();
    await page.getByRole('button', { name: '플러그인 설치', exact: true }).click();
    await page.getByRole('dialog', { name: '플러그인 설치', exact: true }).getByRole('button', { name: '취소', exact: true }).click();
    assert.equal((await page.evaluate(() => window.dockitLocal.plugins.list())).plugins.length, 0);
    await page.getByRole('button', { name: '플러그인 설치', exact: true }).click();
    const modal = page.getByRole('dialog', { name: '플러그인 설치', exact: true });
    await modal.getByRole('textbox').fill('https://example.com/not-a-plugin');
    await modal.getByRole('button', { name: '설치', exact: true }).click();
    await expect(page.getByText('https://github.com/으로 시작하는 주소를 입력해주세요.', { exact: false })).toBeVisible();
    await modal.getByRole('button', { name: '취소', exact: true }).click();
    await closeDrawer(page);
    await install(page);
    console.log('Installed GitHub plugin through plugin manager.');
    await openDice(page);
    const frame = () => page.frames().find(item => item.url().startsWith('dockit-plugin:'));
    assert.deepEqual(await frame().evaluate(() => {
      let parentDenied = false;
      try { void parent.document.body; } catch { parentDenied = true; }
      return { parentDenied, bridge: typeof window.dockitLocal, node: typeof window.require };
    }), { parentDenied: true, bridge: 'undefined', node: 'undefined' });
    assert.equal(await frame().evaluate(async () => { try { await fetch('https://example.com'); return false; } catch { return true; } }), true);
    await page.getByRole('button', { name: '주사위 추가', exact: true }).click();
    await page.getByRole('button', { name: '주사위 추가', exact: true }).click();
    await expect(page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button', { name: '주사위 3 굴리기', exact: true })).toBeVisible();
    await expect.poll(async () => JSON.parse(await fs.readFile(dataFile, 'utf8')).count).toBe(3);
    await frame().evaluate(() => { location.href = 'https://example.com/'; });
    await expect(page.getByText('플러그인의 페이지 이동을 차단했습니다.', { exact: true })).toBeVisible();
    await expect(page.locator('iframe[title="주사위 플러그인"]')).toHaveCount(0);
    await page.locator('[data-widget-type="plugin:dockit.dice/dice"]').getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button', { name: '주사위 3 굴리기', exact: true })).toBeVisible();
    await page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button', { name: '주사위 1 굴리기', exact: true }).click();
    await expect(page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button', { name: '주사위 1 굴리기', exact: true })).toBeEnabled();
    await page.screenshot({ path: path.join(artifacts, 'toolkit-desktop.png') });
    await page.getByRole('button', { name: '테마 변경', exact: true }).click();
    await expect.poll(() => frame().evaluate(() => window.Dockit.theme.isDarkMode)).toBe(true);
    await page.screenshot({ path: path.join(artifacts, 'toolkit-dark.png') });
    await page.getByRole('button', { name: '플러그인', exact: true }).click();
    await page.getByRole('button', { name: '주사위 삭제', exact: true }).click();
    await page.getByRole('dialog', { name: '플러그인 삭제', exact: true }).getByRole('button', { name: '취소', exact: true }).click();
    await page.setViewportSize({ width: 720, height: 800 });
    await page.getByRole('button', { name: '주사위 삭제', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'plugins-narrow.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.getByRole('button', { name: '주사위 삭제', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'uninstall-narrow.png') });
    await page.getByRole('dialog', { name: '플러그인 삭제', exact: true }).getByRole('button', { name: '취소', exact: true }).click();
    await closeDrawer(page);
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(home, '.dockit', 'config.json'), 'utf8')).panels.panels.right).toContain('plugin:dockit.dice/dice');
    const documentUrl = page.url();
    await app.close(); app = null;
    page = await launch();
    await page.evaluate(url => { location.hash = new URL(url).hash; }, documentUrl);
    await expect(page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button', { name: '주사위 3 굴리기', exact: true })).toBeVisible();
    console.log('Restart restored toolkit, theme and saved data.');
    await remove(page, '데이터 남기기');
    assert.equal(JSON.parse(await fs.readFile(dataFile, 'utf8')).count, 3);
    await install(page);
    await openDice(page);
    await expect(page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button', { name: '주사위 3 굴리기', exact: true })).toBeVisible();
    await remove(page, '함께 삭제');
    await assert.rejects(fs.stat(dataFile), { code: 'ENOENT' });
    await install(page);
    await openDice(page);
    await expect(page.frameLocator('iframe[title="주사위 플러그인"]').getByRole('button')).toHaveCount(1);
    assert.deepEqual(errors, []);
    console.log('Plugin smoke passed: install, sandbox, theme, restart, cancel, retain/reinstall, remove data, narrow layout.');
    console.log(`Screenshots: ${artifacts}`);
  } catch (error) {
    if (app) {
      const page = await app.firstWindow();
      await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
      console.error('frames', page.frames().map(frame => frame.url()));
      console.error((await page.locator('body').innerText()).slice(-5000));
    }
    throw error;
  } finally {
    if (app) await app.close();
    if (server) await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
