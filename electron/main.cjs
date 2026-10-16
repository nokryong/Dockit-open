const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, session, Menu, safeStorage, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { LocalStore, contained } = require('./local-store.cjs');
const { ChatGPTClient, safeFailure } = require('./chatgpt-client.cjs');
const { CodexClient, safeFailure: codexFailure } = require('./codex-client.cjs');
const { extensions } = require('./chat-attachments.cjs');
const { WindowsPrintService } = require('./windows-print.cjs');
const { FONT_ORIGINS, STYLE_ORIGINS, readFontAsset } = require('./font-assets.cjs');
const { registerPluginHost } = require('./plugin-host.cjs');

const testMode = process.argv.includes('--test-mode');
let devOrigin = null;
if (!app.isPackaged && process.argv.includes('--dev')) {
  const url = new URL(process.env.DOCKIT_DEV_SERVER_URL);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password) throw new Error('잘못된 개발 서버 주소입니다.');
  devOrigin = url.origin;
}
const testHome = testMode && process.env.DOCKIT_TEST_HOME;
if (testHome) app.setPath('userData', path.join(testHome, 'electron-profile'));
app.setName('Dockit Open');
protocol.registerSchemesAsPrivileged([
  { scheme: 'dockit', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'dockit-plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);
let store;
let mainWindow;
let closing = false;
let chatgpt;
let codex;

function trusted(event) {
  const url = new URL(event.senderFrame.url);
  const allowedOrigin = devOrigin ? url.origin === devOrigin : url.protocol === 'dockit:' && url.hostname === 'app';
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !allowedOrigin) throw new Error('허용되지 않은 요청입니다.');
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    try { trusted(event); return { value: await callback(...args) }; }
    catch (error) { return { error: { message: error.message, code: error.code, detail: error.detail } }; }
  });
}

if (!testMode && !app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  store = new LocalStore({
    home: testHome || app.getPath('home'),
    trash: file => shell.trashItem(file)
  });
  await store.init();
  const plugins = await registerPluginHost({ root: store.root, handle, protocol, dialog, shell, getWindow: () => mainWindow, encryption: safeStorage, downloads: app.getPath('downloads') });
  chatgpt = new ChatGPTClient({
    root: store.root, encryption: safeStorage,
    openExternal: url => shell.openExternal(url),
    emit: event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('chatgpt:event', event); }
  });
  const chatHandle = (name, callback) => handle(`chatgpt:${name}`, async (...args) => {
    try { return await callback(...args); }
    catch (error) { const safe = safeFailure(error); throw Object.assign(new Error(safe.message), safe); }
  });
  chatHandle('status', () => chatgpt.status());
  chatHandle('sign-in', options => chatgpt.signIn(options));
  chatHandle('cancel-sign-in', () => chatgpt.cancelSignIn());
  chatHandle('sign-out', () => chatgpt.signOut());
  chatHandle('select-profile', id => chatgpt.selectProfile(id));
  chatHandle('models', () => chatgpt.listModels());
  chatHandle('select-model', slug => chatgpt.selectModel(slug));
  chatHandle('select-reasoning-effort', effort => chatgpt.selectReasoningEffort(effort));
  chatHandle('select-service-tier', tier => chatgpt.selectServiceTier(tier));
  chatHandle('acknowledge', () => chatgpt.acknowledge());
  chatHandle('usage', () => chatgpt.openUsage());
  chatHandle('history', () => chatgpt.history());
  chatHandle('clear-history', () => chatgpt.clearHistory());
  chatHandle('send', (text, attachments) => chatgpt.send(text, attachments));
  chatHandle('cancel-response', () => chatgpt.cancelResponse());
  const { CodexDocuments } = require('./codex-documents.cjs');
  const validations = new Map();
  const emitCodex = event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('codex:event', event); };
  const documents = new CodexDocuments({ store, emit: emitCodex, validate: record => new Promise((resolve, reject) => {
    const requestId = require('node:crypto').randomUUID();
    const timer = setTimeout(() => { validations.delete(requestId); reject(Object.assign(new Error('문서 편집기의 응답을 확인하지 못했습니다.'), { dockit: true, code: 'document_validation' })); }, 10_000);
    validations.set(requestId, result => { clearTimeout(timer); validations.delete(requestId); resolve(result); });
    emitCodex({ type: 'document-validate', requestId, document: record });
  }) });
  handle('codex:document-validation', (requestId, result) => {
    validations.get(requestId)?.({ ok: result?.ok === true, message: typeof result?.message === 'string' ? result.message.slice(0, 500) : undefined });
  });
  codex = new CodexClient({ root: store.root, documents, openExternal: url => shell.openExternal(url),
    emit: event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('codex:event', event); }
  });
  const codexHandle = (name, callback) => handle(`codex:${name}`, async (...args) => {
    try { return await callback(...args); }
    catch (error) { const safe = codexFailure(error); throw Object.assign(new Error(safe.message), safe); }
  });
  codexHandle('status', () => codex.status());
  codexHandle('sign-in', () => codex.signIn());
  codexHandle('cancel-sign-in', () => codex.cancelSignIn());
  codexHandle('sign-out', () => codex.signOut());
  codexHandle('models', () => codex.listModels());
  codexHandle('select-model', slug => codex.selectModel(slug));
  codexHandle('select-reasoning-effort', effort => codex.selectReasoningEffort(effort));
  codexHandle('select-service-tier', tier => codex.selectServiceTier(tier));
  codexHandle('usage', () => codex.readUsage());
  codexHandle('history', kind => codex.history(kind));
  codexHandle('clear-history', kind => codex.clearHistory(kind));
  codexHandle('send', (text, attachments, document) => codex.send(text, 'chat', undefined, attachments, document));
  codexHandle('generate-image', (text, reference) => codex.send(text, 'image', reference));
  codexHandle('cancel-response', kind => codex.cancelResponse(kind));
  codexHandle('copy-image', async id => {
    const image = nativeImage.createFromPath(await codex.imagePath(id));
    if (image.isEmpty()) throw new Error('Invalid image');
    clipboard.writeImage(image);
  });
  codexHandle('save-image', async id => {
    const source = await codex.imagePath(id);
    const result = await dialog.showSaveDialog(mainWindow, { title: '이미지 저장', defaultPath: path.join((await store.config()).documentsPath, `image.${path.extname(source).slice(1)}`) });
    if (result.canceled || !result.filePath) return false;
    await fs.copyFile(source, result.filePath); return true;
  });
  const bundle = path.join(__dirname, '..', 'dist');
  protocol.handle('dockit', async request => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
      let file;
      if (url.pathname.startsWith('/codex-image/')) {
        file = await codex.imagePath(url.pathname.split('/')[2]);
      } else if (url.pathname.startsWith('/local-music/')) {
        const id = url.pathname.split('/')[2];
        const { content } = await store.request('get', { type: 'music', id });
        if (!/^[\w-]+\.(mp3|wav|ogg|m4a|flac|aac)$/.test(content.fileName)) throw new Error('잘못된 음악 파일입니다.');
        const musicRoot = path.join(store.root, 'music');
        file = await contained(musicRoot, path.join(musicRoot, content.fileName));
      } else {
        file = await contained(bundle, path.resolve(bundle, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
      }
      return net.fetch(pathToFileURL(file).href, { headers: request.headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  // Permit web-font resources and, in development, the loopback Vite server.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    const url = new URL(details.url);
    const isWebFont = (details.resourceType === 'font' && FONT_ORIGINS.includes(url.origin)) || (details.resourceType === 'stylesheet' && STYLE_ORIGINS.includes(url.origin));
    const isDevServer = devOrigin && (url.origin === devOrigin || url.origin === devOrigin.replace('http:', 'ws:'));
    callback({ cancel: !isWebFont && !isDevServer });
  });
  handle('local:paths', async () => ({ dataPath: store.root, documentsPath: (await store.config()).documentsPath }));
  handle('local:font-asset', url => readFontAsset(url));
  handle('local:choose-chat-attachments', async provider => {
    if (!['chatgpt', 'codex'].includes(provider)) throw new Error('연결 방식을 확인해주세요.');
    const result = await dialog.showOpenDialog(mainWindow, { title: '파일 첨부', properties: ['openFile', 'multiSelections'], filters: [{ name: '지원하는 파일', extensions: extensions(provider) }] });
    if (result.canceled) return [];
    return (provider === 'codex' ? codex : chatgpt).attachFiles(result.filePaths);
  });
  handle('local:data', (action, args) => store.request(action, args));
  handle('local:choose-documents', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '문서 폴더 선택', defaultPath: (await store.config()).documentsPath, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : store.changeDocuments(result.filePaths[0]);
  });
  handle('local:music-add', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '음악 파일 추가', properties: ['openFile', 'multiSelections'], filters: [{ name: '음악', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }] });
    if (result.canceled) return [];
    const tracks = [];
    for (const source of result.filePaths) {
      const extension = path.extname(source).toLowerCase();
      if (!['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(extension)) throw new Error('지원하지 않는 음악 파일입니다.');
      const id = randomUUID();
      const fileName = `${id}${extension}`;
      const destination = await contained(store.root, path.join(store.root, 'music', fileName));
      await fs.copyFile(source, destination, 1);
      const track = { name: path.basename(source), fileName, url: `dockit://app/local-music/${id}` };
      try { tracks.push((await store.request('create', { type: 'music', id, data: track })).content); }
      catch (error) { await shell.trashItem(destination); throw error; }
    }
    return tracks;
  });
  handle('local:music-remove', async id => {
    const { content } = await store.request('get', { type: 'music', id });
    if (!/^[\w-]+\.(mp3|wav|ogg|m4a|flac|aac)$/.test(content.fileName)) throw new Error('잘못된 음악 파일입니다.');
    const musicRoot = path.join(store.root, 'music');
    await shell.trashItem(await contained(musicRoot, path.join(musicRoot, content.fileName)));
    await store.request('delete', { type: 'music', id });
  });
  handle('local:flush', () => store.flush());
  handle('local:close-ready', async () => { await Promise.all([chatgpt.dispose(), codex.dispose()]); await store.flush(); closing = true; mainWindow.close(); });
  handle('local:window-minimize', () => mainWindow.minimize());
  handle('local:window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  handle('local:window-is-maximized', () => mainWindow.isMaximized());
  handle('local:window-close', () => mainWindow.close());
  const printing = new WindowsPrintService({ getWindow: () => mainWindow, root: store.root });
  handle('local:print', options => process.platform === 'win32' ? printing.print(options) : new Promise((resolve, reject) => {
    mainWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
      if (success || /cancel/i.test(reason || '')) resolve({ cancelled: !success });
      else reject(new Error(reason || '인쇄창을 열지 못했습니다.'));
    });
  }));

  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 640, minHeight: 500, title: 'Dockit Open', frame: false, show: !testMode, backgroundColor: '#ffffff', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.on('maximize', () => mainWindow.webContents.send('local:window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('local:window-maximized', false));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('did-start-navigation', details => {
    if (details.isSameDocument) return;
    if (details.isMainFrame) { plugins.closeAll(); return; }
    // CSP can reject a subframe navigation before will-frame-navigate fires.
    // Revoke that frame's capabilities and let the host display a retry action.
    if (details.frame?.url.startsWith('dockit-plugin:')) {
      const sessionId = new URL(details.frame.url).hostname;
      plugins.close(sessionId);
      mainWindow.webContents.send('plugins:stopped', { sessionId, message: '플러그인의 페이지 이동을 차단했습니다.' });
    }
  });
  mainWindow.webContents.on('will-frame-navigate', details => {
    // Only the trusted main frame may mount a plugin.
    if (!details.isMainFrame && (details.initiator !== mainWindow.webContents.mainFrame || !details.url.startsWith('dockit-plugin:'))) details.preventDefault();
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (devOrigin && url === mainWindow.webContents.getURL()) return;
    event.preventDefault();
  });
  if (devOrigin) mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && !input.alt && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      mainWindow.webContents.reload();
    }
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.on('close', event => {
    if (closing) return;
    event.preventDefault();
    mainWindow.webContents.send('local:prepare-close');
  });
  await mainWindow.loadURL(`${devOrigin || 'dockit://app'}/index.html#/docs`);
  if (!testMode) { mainWindow.show(); mainWindow.focus(); }
  app.on('second-instance', () => { mainWindow.show(); mainWindow.focus(); });
}).catch(error => {
  if (testMode) console.error(error);
  else dialog.showErrorBox('Dockit Open을 시작할 수 없습니다', error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { codex?.dispose().catch(() => {}); });
