const { _electron: electron, expect: baseExpect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalStore } = require('../electron/local-store.cjs');
const { PluginStore } = require('../electron/plugin-store.cjs');
const { packagePlugin } = require('../plugin-sdk/package.cjs');
const expect = baseExpect.configure({ timeout: 30000 });
const root = path.resolve(__dirname, '..');
const pluginRoot = path.resolve(process.argv[2] || path.join(root, '../dockit-plugins'));

(async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dockit-plugin-language-'));
  const artifacts = path.join(root, '.cache/plugin-language-smoke');
  await fs.mkdir(artifacts, { recursive: true });
  const local = new LocalStore({ home });
  await local.init();
  const plugins = new PluginStore({ root: local.root, trash: async () => {} });
  await plugins.init();
  const names = ['dice', 'calendar', 'dictionary', 'image-search', 'music-player'];
  for (const name of names) {
    const file = await packagePlugin(path.join(pluginRoot, 'plugins', name), path.join(artifacts, `${name}.zip`));
    await plugins.installFile(file);
  }
  const seed = async (name, key, value) => {
    const session = plugins.open(`dockit.${name}`, name);
    await plugins.storage(session.sessionId, 'set', key, value);
    plugins.close(session.sessionId);
  };
  await seed('dice', 'count', 2);
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await seed('calendar', 'events', [{ id: 'test-event', date, content: '저장한 한국어 일정' }]);
  await seed('music-player', 'settings', { volume: 0.42, muted: false, repeat: 'one' });
  await seed('image-search', 'search-cache', [{ key: 'preserved', time: Date.now(), result: { totalHits: 0, hits: [] } }]);
  const document = (await local.request('create', { type: 'documents', data: { title: '언어 검사', content: '<p>한국어 본문 유지</p>' } })).content;
  const documentFile = await local.documentPath(document._id);
  await local.request('update', { type: 'panels', data: { panels: { left: [], right: ['plugin:dockit.dice/dice'] } } });
  const musicFolder = path.join(home, '테스트 음악');
  await fs.mkdir(musicFolder);
  const wav = Buffer.alloc(1644);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await fs.writeFile(path.join(musicFolder, '한글 곡 01.wav'), wav);
  const env = { ...process.env, DOCKIT_TEST_HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const errors = [];
  try {
    app = await electron.launch({ executablePath: require('electron'), args: ['--lang=ko', root, '--test-mode', documentFile], env, timeout: 60000 });
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.locator('.tiptap-main-canvas').waitFor();
    const changeLanguage = async value => {
      await page.getByRole('button', { name: value === 'en' ? '설정' : 'Settings', exact: true }).click();
      await page.locator('#interface-language').selectOption(value);
      await expect(page.locator('html')).toHaveAttribute('lang', value);
      await page.locator('.sud-drawer__close').click();
      await expect(page.locator('.sud-drawer__overlay')).toHaveCount(0);
    };
    for (const name of names) {
      if (name !== 'dice') {
        await page.evaluate(name => window.dockitLocal.data('update', { type: 'panels', data: { panels: { left: [], right: [`plugin:dockit.${name}/${name}`] } } }), name);
        await page.reload();
      }
      const iframe = page.locator(`iframe[src^="dockit-plugin:"]`).first();
      await iframe.waitFor();
      const frame = await (await iframe.elementHandle()).contentFrame();
      await expect(frame.locator('html')).toHaveAttribute('lang', 'ko');
      await frame.evaluate(() => { window.__languageMarker = 'preserved'; });
      if (name === 'calendar') {
        await expect(frame.getByText('저장한 한국어 일정', { exact: false })).toBeVisible();
        await page.getByRole('button', { name: '일정 추가', exact: true }).click();
        await frame.getByPlaceholder('내용', { exact: true }).fill('작성 중인 한국어 일정');
      }
      if (name === 'dictionary') await frame.getByPlaceholder('검색할 단어를 입력하세요').fill('한글 검색어');
      if (name === 'image-search') await frame.getByPlaceholder('검색할 단어를 입력하세요').fill('이미지 검색어');
      if (name === 'music-player') {
        await frame.locator('input[type=file]').setInputFiles(musicFolder);
        await expect(frame.getByText('한글 곡', { exact: true }).first()).toBeVisible();
      }
      const dataFile = path.join(local.root, 'plugin-data', `dockit.${name}`, 'storage.json');
      const readData = async () => JSON.parse(await fs.readFile(dataFile, 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}'; throw error; }));
      if (name === 'dice') await expect(page.getByRole('button', { name: '주사위 추가', exact: true })).toBeEnabled();
      const before = await readData();
      await changeLanguage('en');
      await expect(frame.locator('html')).toHaveAttribute('lang', 'en');
      assert.equal(await frame.evaluate(() => window.__languageMarker), 'preserved');
      if (name === 'dice') await expect(frame.getByRole('button', { name: 'Roll die 1', exact: true })).toBeVisible();
      if (name === 'calendar') await expect(frame.getByPlaceholder('Event details')).toHaveValue('작성 중인 한국어 일정');
      if (name === 'dictionary') await expect(frame.getByPlaceholder('Enter a word to search')).toHaveValue('한글 검색어');
      if (name === 'image-search') await expect(frame.getByPlaceholder('Enter a word to search')).toHaveValue('이미지 검색어');
      if (name === 'music-player') { await expect(frame.getByRole('button', { name: 'Repeat: Repeat one' })).toBeVisible(); await expect(frame.getByText('한글 곡', { exact: true }).first()).toBeVisible(); }
      assert.deepEqual(await readData(), before);
      await page.screenshot({ path: path.join(artifacts, `${name}-en.png`), fullPage: true, animations: 'disabled' });
      await changeLanguage('ko');
      await expect(frame.locator('html')).toHaveAttribute('lang', 'ko');
      assert.equal(await frame.evaluate(() => window.__languageMarker), 'preserved');
      assert.deepEqual(await readData(), before);
      await changeLanguage('en');
      await expect(frame.locator('html')).toHaveAttribute('lang', 'en');
      assert.equal(await frame.evaluate(() => window.__languageMarker), 'preserved');
      await page.setViewportSize({ width: 900, height: 800 });
      const narrowFrame = await (await iframe.elementHandle()).contentFrame();
      await expect(narrowFrame.locator('html')).toHaveAttribute('lang', 'en');
      assert.equal(await narrowFrame.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}: narrow frame overflow`);
      await page.screenshot({ path: path.join(artifacts, `${name}-en-narrow.png`), fullPage: true, animations: 'disabled' });
      await page.setViewportSize({ width: 1440, height: 960 });
      await changeLanguage('ko');
      const restoredFrame = await (await iframe.elementHandle()).contentFrame();
      await expect(restoredFrame.locator('html')).toHaveAttribute('lang', 'ko');
      assert.deepEqual(await readData(), before);
    }
    await changeLanguage('en');
    await page.getByRole('button', { name: 'Plugins', exact: true }).click();
    const manager = page.getByRole('region', { name: 'Manage plugins' });
    for (const name of names) {
      const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, 'plugins', name, 'manifest.json'), 'utf8'));
      await expect(manager.getByText(manifest.locales.en.name, { exact: true })).toBeVisible();
      await manager.getByRole('button', { name: `About ${manifest.locales.en.name}`, exact: true }).click();
      await expect(manager.getByText(manifest.locales.en.description, { exact: true })).toBeVisible();
    }
    await page.screenshot({ path: path.join(artifacts, 'plugin-manager-en.png'), fullPage: true, animations: 'disabled' });
    assert.match(JSON.parse(await fs.readFile(documentFile, 'utf8')).content, /한국어 본문 유지/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, plugins: names, iframeStatePreserved: true, storagePreserved: true, artifacts }));
  } catch (error) {
    if (app) await app.windows()[0]?.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await app?.close().catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
