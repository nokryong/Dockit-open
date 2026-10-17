const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, session, Menu, safeStorage, clipboard, ClipboardItem, nativeImage } = require('electron');
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
const { AppUpdates } = require('./app-updates.cjs');
const { AsyncLocalStorage } = require('node:async_hooks');
const { DocumentWindows, filesFromArguments } = require('./document-windows.cjs');
const { Conversations } = require('./conversations.cjs');
const { allowDocumentPermission } = require('./document-permissions.cjs');
const { writeClipboardImage } = require('./image-clipboard.cjs');

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
let updates;
const activeAI = new Set();
const windows = new DocumentWindows();
const requestContext = new AsyncLocalStorage();
const requestWindow = () => requestContext.getStore() || mainWindow;
let codexOwner = null;
let chatOwner = null;
let chatgptChats;
let codexChats;
const conversationOwner = () => requestWindow().webContents.id;
const conversationDocument = () => windows.context(requestWindow())?.documentId || null;
function emitConversation(provider, event, conversations) {
  if (event.type === 'messages') {
    if (event.kind === 'image' && codexOwner && !codexOwner.isDestroyed()) codexOwner.webContents.send('codex:event', event);
    for (const id of conversations?.recipients() || []) windows.windows.get(id)?.window.webContents.send(`${provider}:event`, event);
  } else windows.broadcast(`${provider}:event`, event);
}
let openDocument;
const pendingFiles = filesFromArguments(process.argv);
app.on('open-file', (event, file) => {
  event.preventDefault();
  if (openDocument) openDocument({ file }).catch(error => dialog.showErrorBox('문서를 열 수 없습니다', error.message));
  else pendingFiles.push(file);
});
app.on('second-instance', (_event, argv, cwd) => {
  const files = filesFromArguments(argv, cwd);
  if (!openDocument) { pendingFiles.push(...files); return; }
  if (files.length) for (const file of files) openDocument({ file }).catch(error => dialog.showErrorBox('문서를 열 수 없습니다', error.message));
  else {
    const window = windows.find(null) || windows.all()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  }
});

function runAI(work) {
  if (updates?.blocksWork) throw new Error('앱 업데이트가 끝난 뒤 다시 시도해 주세요.');
  const task = Promise.resolve().then(work);
  activeAI.add(task);
  return task.finally(() => activeAI.delete(task));
}

function trusted(event) {
  const url = new URL(event.senderFrame.url);
  const allowedOrigin = devOrigin ? url.origin === devOrigin : url.protocol === 'dockit:' && url.hostname === 'app';
  const window = windows.windows.get(event.sender.id)?.window;
  if (!window || event.senderFrame !== window.webContents.mainFrame || !allowedOrigin) throw new Error('허용되지 않은 요청입니다.');
  return window;
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    try { return { value: await requestContext.run(trusted(event), () => callback(...args)) }; }
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
  const plugins = await registerPluginHost({ root: store.root, handle, protocol, dialog, shell, getWindow: requestWindow, broadcast: (channel, value) => windows.broadcast(channel, value), encryption: safeStorage, downloads: app.getPath('downloads'), clipboard, ClipboardItem, nativeImage });
  chatgpt = new ChatGPTClient({
    root: store.root, encryption: safeStorage,
    openExternal: url => shell.openExternal(url),
    emit: event => emitConversation('chatgpt', event, chatgptChats)
  });
  chatgptChats = new Conversations({ root: store.root, provider: 'chatgpt', trash: file => shell.trashItem(file),
    account: async () => { await chatgpt.ready; return chatgpt.active()?.id; },
    legacy: async () => ({ messages: await chatgpt.history() }),
    activate: record => chatgpt.storage.saveHistory(chatgpt.active().id, record.messages),
    snapshot: async () => ({ messages: await chatgpt.history() }),
    removeLegacy: async record => {
      const messages = await chatgpt.history();
      if (messages[0]?.id && messages[0].id === record.messages[0]?.id) await chatgpt.storage.saveHistory(chatgpt.active().id, []);
    }
  });
  chatgpt.storage.onHistorySaved = (account, payload) => chatgptChats.write(account, payload);
  const chatHandle = (name, callback) => handle(`chatgpt:${name}`, async (...args) => {
    try { return await callback(...args); }
    catch (error) { const safe = safeFailure(error); throw Object.assign(new Error(safe.message), safe); }
  });
  chatHandle('status', () => chatgpt.status());
  chatHandle('sign-in', options => { if (chatOwner) throw new Error('응답이 끝난 뒤 다시 시도해주세요.'); return chatgpt.signIn(options); });
  chatHandle('cancel-sign-in', () => chatgpt.cancelSignIn());
  chatHandle('sign-out', () => { if (chatOwner) throw new Error('응답이 끝난 뒤 다시 시도해주세요.'); return chatgpt.signOut(); });
  chatHandle('select-profile', id => { if (chatOwner) throw new Error('응답이 끝난 뒤 다시 시도해주세요.'); return chatgpt.selectProfile(id); });
  chatHandle('models', () => chatgpt.listModels());
  chatHandle('select-model', slug => chatgpt.selectModel(slug));
  chatHandle('select-reasoning-effort', effort => chatgpt.selectReasoningEffort(effort));
  chatHandle('select-service-tier', tier => chatgpt.selectServiceTier(tier));
  chatHandle('acknowledge', () => chatgpt.acknowledge());
  chatHandle('usage', () => chatgpt.openUsage());
  chatHandle('history', () => chatgptChats.history(conversationOwner(), conversationDocument()));
  chatHandle('clear-history', () => chatgptChats.create(conversationOwner(), conversationDocument()));
  chatHandle('send', (text, attachments) => runAI(async () => {
    if (chatOwner) throw new Error('다른 창에서 ChatGPT가 응답 중입니다.');
    chatOwner = requestWindow();
    try { return await chatgptChats.run(conversationOwner(), conversationDocument(), () => chatgpt.send(text, attachments)); }
    finally { chatOwner = null; windows.broadcast('chatgpt:event', { type: 'conversations' }); }
  }));
  chatHandle('cancel-response', () => { if (chatOwner === requestWindow()) return chatgpt.cancelResponse(); });
  const { CodexDocuments } = require('./codex-documents.cjs');
  const validations = new Map();
  const emitCodex = event => { if (codexOwner && !codexOwner.isDestroyed()) codexOwner.webContents.send('codex:event', event); };
  const documents = new CodexDocuments({ store, emit: emitCodex, validate: record => new Promise((resolve, reject) => {
    const requestId = require('node:crypto').randomUUID();
    const timer = setTimeout(() => { validations.delete(requestId); reject(Object.assign(new Error('문서 편집기의 응답을 확인하지 못했습니다.'), { dockit: true, code: 'document_validation' })); }, 10_000);
    validations.set(requestId, { window: codexOwner, complete: result => { clearTimeout(timer); validations.delete(requestId); resolve(result); } });
    emitCodex({ type: 'document-validate', requestId, document: record });
  }) });
  handle('codex:document-validation', (requestId, result) => {
    const pending = validations.get(requestId);
    if (pending?.window === requestWindow()) pending.complete({ ok: result?.ok === true, message: typeof result?.message === 'string' ? result.message.slice(0, 500) : undefined });
  });
  codex = new CodexClient({ root: store.root, documents, openExternal: url => shell.openExternal(url),
    emit: event => emitConversation('codex', event, codexChats)
  });
  const codexConversation = data => ({ messages: data.chat, threadId: data.threads.chat || null, documentToolsVersion: data.documentToolsVersion, previousChatThreads: data.previousChatThreads || [] });
  codexChats = new Conversations({ root: store.root, provider: 'codex', trash: file => shell.trashItem(file),
    account: async () => { await codex.status(); return codex.key; },
    legacy: () => codexConversation(codex.data),
    activate: async record => {
      codex.data.chat = structuredClone(record.messages);
      if (record.threadId) codex.data.threads.chat = record.threadId; else delete codex.data.threads.chat;
      codex.data.documentToolsVersion = record.documentToolsVersion ?? 1;
      codex.data.previousChatThreads = record.previousChatThreads || [];
      await codex.save();
    },
    snapshot: () => codexConversation(codex.data),
    removeLegacy: async record => {
      if (codex.data.chat[0]?.id && codex.data.chat[0].id === record.messages[0]?.id) {
        codex.data.chat = []; delete codex.data.threads.chat; await codex.save();
      }
    }
  });
  codex.onHistorySaved = (account, data) => codexChats.write(account, codexConversation(data));
  codex.historyImageAllowed = id => codexChats.hasImage(id);
  const codexHandle = (name, callback) => handle(`codex:${name}`, async (...args) => {
    try { return await callback(...args); }
    catch (error) { const safe = codexFailure(error); throw Object.assign(new Error(safe.message), safe); }
  });
  codexHandle('status', async () => ({ ...await codex.status(), editingDocumentId: codexOwner === requestWindow() ? documents.active?.id || null : null }));
  codexHandle('sign-in', () => { if (codexOwner) throw new Error('Codex 작업이 끝난 뒤 다시 시도해주세요.'); return codex.signIn(); });
  codexHandle('cancel-sign-in', () => codex.cancelSignIn());
  codexHandle('sign-out', () => { if (codexOwner) throw new Error('Codex 작업이 끝난 뒤 다시 시도해주세요.'); return codex.signOut(); });
  codexHandle('models', () => codex.listModels());
  codexHandle('select-model', slug => codex.selectModel(slug));
  codexHandle('select-reasoning-effort', effort => codex.selectReasoningEffort(effort));
  codexHandle('select-service-tier', tier => codex.selectServiceTier(tier));
  codexHandle('usage', () => codex.readUsage());
  codexHandle('history', (kind = 'chat') => kind === 'chat' ? codexChats.history(conversationOwner(), conversationDocument()) : codex.history(kind));
  codexHandle('clear-history', (kind = 'chat') => kind === 'chat' ? codexChats.create(conversationOwner(), conversationDocument()) : codex.clearHistory(kind));
  codexHandle('send', (text, attachments, document) => runAI(async () => {
    const window = requestWindow();
    if (document && document.id !== windows.context(window)?.documentId) throw new Error('이 창에 연결된 문서만 수정할 수 있습니다.');
    if (codexOwner) throw new Error('다른 창에서 Codex가 작업 중입니다.');
    codexOwner = window;
    try { return await codexChats.run(conversationOwner(), conversationDocument(), () => codex.send(text, 'chat', undefined, attachments, document)); }
    finally { codexOwner = null; windows.broadcast('codex:event', { type: 'conversations' }); }
  }));
  codexHandle('generate-image', (text, reference) => runAI(async () => {
    if (codexOwner) throw new Error('Codex가 작업 중입니다.');
    codexOwner = requestWindow();
    try { return await codex.send(text, 'image', reference); } finally { codexOwner = null; }
  }));
  codexHandle('cancel-response', kind => { if (codexOwner === requestWindow()) return codex.cancelResponse(kind); });
  for (const [provider, conversations] of [['chatgpt', chatgptChats], ['codex', codexChats]]) {
    handle(`${provider}:conversations`, () => conversations.list());
    handle(`${provider}:select-conversation`, id => conversations.select(conversationOwner(), id));
    handle(`${provider}:delete-conversation`, async id => {
      try { return await conversations.remove(conversationOwner(), id); }
      finally { windows.broadcast(`${provider}:event`, { type: 'conversations' }); }
    });
  }
  codexHandle('copy-image', async id => {
    const image = nativeImage.createFromPath(await codex.imagePath(id));
    if (image.isEmpty()) throw new Error('Invalid image');
    await writeClipboardImage({ clipboard, ClipboardItem }, image);
  });
  codexHandle('save-image', async id => {
    const source = await codex.imagePath(id);
    const result = await dialog.showSaveDialog(requestWindow(), { title: '이미지 저장', defaultPath: path.join((await store.config()).documentsPath, `image.${path.extname(source).slice(1)}`) });
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
    const result = await dialog.showOpenDialog(requestWindow(), { title: '파일 첨부', properties: ['openFile', 'multiSelections'], filters: [{ name: '지원하는 파일', extensions: extensions(provider) }] });
    if (result.canceled) return [];
    return (provider === 'codex' ? codex : chatgpt).attachFiles(result.filePaths);
  });
  handle('local:data', async (action, args = {}) => {
    const source = requestWindow()?.webContents.id;
    if (store.externalDocuments.has(args.id) && (windows.context(requestWindow())?.documentId !== args.id || !['get', 'update'].includes(action))) throw new Error('이 창에 연결된 원본 문서만 접근할 수 있습니다.');
    let affected = [];
    if (['documents', 'folders'].includes(args.type) && ['delete', 'move', 'update'].includes(action) && args.id) {
      const file = args.type === 'folders' ? await store.folderPath(args.id) : await store.documentPath(args.id);
      affected = await windows.affected(store, file);
      const otherWindows = affected.filter(window => window !== requestWindow());
      if (otherWindows.length && [...store.documentLocks].some(([id]) => affected.some(window => windows.context(window)?.documentId === id))) throw new Error('Codex 작업이 끝난 뒤 다시 시도해주세요.');
      if (otherWindows.length) {
        if (action === 'update' && args.type === 'documents') {
          const current = (await store.request('get', { type: 'documents', id: args.id })).content;
          if (args.data?.expectedRevision && args.data.expectedRevision !== current.revision) throw Object.assign(new Error('문서가 변경되었습니다. 목록을 새로 확인해주세요.'), { code: 'RevisionConflict' });
        }
        await windows.save(otherWindows);
        if (action === 'update' && args.type === 'documents') {
          const current = (await store.request('get', { type: 'documents', id: args.id })).content;
          args = { ...args, data: { ...args.data, expectedRevision: current.revision } };
        }
      }
    }
    const result = await store.request(action, args);
    if (action === 'delete') for (const window of affected) { window.dockitClosing = true; window.close(); }
    else if (['update', 'move'].includes(action)) for (const window of affected) {
      if (window === requestWindow()) continue;
      const document = (await store.request('get', { type: 'documents', id: windows.context(window).documentId })).content;
      window.webContents.send('local:document-changed', { document, fields: args.type === 'documents' && action === 'update' ? Object.keys(args.data || {}).filter(key => key !== 'expectedRevision') : [] });
    }
    if (['create', 'update', 'delete', 'move'].includes(action)) windows.broadcast('local:data-changed', { type: args.type, id: args.id, action, source });
    return result;
  });
  handle('local:choose-documents', async () => {
    if ([...windows.windows.values()].some(context => context.documentId)) throw new Error('문서 창을 닫은 뒤 기본 폴더를 변경해주세요.');
    const result = await dialog.showOpenDialog(requestWindow(), { title: '문서 폴더 선택', defaultPath: (await store.config()).documentsPath, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : store.changeDocuments(result.filePaths[0]);
  });
  handle('local:music-add', async () => {
    const result = await dialog.showOpenDialog(requestWindow(), { title: '음악 파일 추가', properties: ['openFile', 'multiSelections'], filters: [{ name: '음악', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }] });
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
  handle('local:close-ready', async () => { if (updates?.busy) return; await store.flush(); const window = requestWindow(); window.dockitClosing = true; window.close(); });
  handle('local:save-ready', (id, result) => windows.saved(requestWindow(), id, result));
  handle('local:window-minimize', () => requestWindow().minimize());
  handle('local:window-maximize', () => requestWindow().isMaximized() ? requestWindow().unmaximize() : requestWindow().maximize());
  handle('local:window-is-maximized', () => requestWindow().isMaximized());
  handle('local:window-close', () => requestWindow().close());
  const printing = new WindowsPrintService({ getWindow: requestWindow, root: store.root });
  handle('local:print', options => process.platform === 'win32' ? printing.print(options) : new Promise((resolve, reject) => {
    requestWindow().webContents.print({ silent: false, printBackground: true }, (success, reason) => {
      if (success || /cancel/i.test(reason || '')) resolve({ cancelled: !success });
      else reject(new Error(reason || '인쇄창을 열지 못했습니다.'));
    });
  }));

  updates = new AppUpdates({
    enabled: app.isPackaged && !testMode,
    updater: app.isPackaged && !testMode ? require('electron-updater').autoUpdater : null,
    currentVersion: app.getVersion(),
    // Unsigned macOS builds can check for updates, but cannot use Squirrel.Mac to install them.
    openRelease: process.platform === 'darwin' ? () => shell.openExternal('https://github.com/nokryong/Dockit-open/releases/latest') : undefined,
    emit: state => {
      windows.broadcast('app-update:changed', state);
      if (state.status === 'saving') windows.save().then(() => updates.saved(state.saveRequestId, { ok: true }), error => updates.saved(state.saveRequestId, { ok: false, message: error.message }));
    },
    waitForWork: () => Promise.allSettled([...activeAI]),
    flush: () => store.flush(),
    allowQuit: value => { closing = value; }
  });
  handle('app-update:status', () => updates.snapshot());
  handle('app-update:install', () => { void updates.install(); return updates.snapshot(); });
  handle('app-update:dismiss', () => { updates.dismiss(); return updates.snapshot(); });
  // Saving is acknowledged by every window through local:save-ready.
  handle('app-update:saved', () => {});

  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    allowDocumentPermission({ contents, permission, requestingOrigin, details, windows: windows.windows, devOrigin }));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowDocumentPermission({ contents, permission, details, windows: windows.windows, devOrigin })));
  const appIcon = path.join(__dirname, '..', devOrigin ? 'public' : 'dist', 'logo', 'symbol-square.png');
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon);
  const createWindow = async (documentId = null) => {
  const mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 640, minHeight: 500, title: 'Dockit Open', icon: appIcon, frame: false, show: false, backgroundColor: '#ffffff', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  windows.add(mainWindow, documentId);
  const windowContext = windows.context(mainWindow);
  mainWindow.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) windows.navigate(mainWindow, url);
  });
  const windowId = mainWindow.webContents.id;
  mainWindow.on('maximize', () => mainWindow.webContents.send('local:window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('local:window-maximized', false));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('did-start-navigation', details => {
    if (details.isSameDocument) return;
    if (details.isMainFrame) { plugins.closeWindow(mainWindow.webContents.id); return; }
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
  mainWindow.on('close', event => {
    if (closing || mainWindow.dockitClosing) return;
    event.preventDefault();
    if (updates.busy) return;
    if (codexOwner === mainWindow || chatOwner === mainWindow) {
      if (codexOwner === mainWindow) codex.cancelResponse().catch(() => {});
      if (chatOwner === mainWindow) chatgpt.cancelResponse();
      Promise.allSettled([...activeAI]).then(() => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('local:prepare-close'); });
    } else mainWindow.webContents.send('local:prepare-close');
  });
  mainWindow.once('closed', () => plugins.closeWindow(windowId));
  mainWindow.once('closed', () => { chatgptChats.selections.delete(windowId); codexChats.selections.delete(windowId); });
  mainWindow.once('closed', () => { if (windowContext.documentId) store.externalDocuments.delete(windowContext.documentId); });
  await mainWindow.loadURL(`${devOrigin || 'dockit://app'}/index.html#/docs${documentId ? '/' + encodeURIComponent(documentId) : ''}`);
  if (!testMode) { mainWindow.show(); mainWindow.focus(); }
  return mainWindow;
  };
  const focusWindow = window => { if (window.isMinimized()) window.restore(); if (!testMode) window.show(); window.focus(); };
  openDocument = ({ id, file, targetWindow } = {}) => windows.serializeOpen(async () => {
    if (updates.blocksWork) throw new Error('앱 업데이트가 끝난 뒤 문서를 열어주세요.');
    if (targetWindow && (codexOwner === targetWindow || chatOwner === targetWindow)) throw new Error('AI 응답이 끝난 뒤 문서를 열어주세요.');
    const record = file ? await store.run(() => store.openOriginal(file)) : (await store.request('get', { type: 'documents', id })).content;
    const existing = windows.find(record._id);
    if (existing && existing !== targetWindow) { focusWindow(existing); return targetWindow ? null : record._id; }
    if (targetWindow) { windows.context(targetWindow).documentId = record._id; return record._id; }
    await createWindow(record._id);
    return record._id;
  });
  handle('local:open-document', id => openDocument({ id, targetWindow: requestWindow() }));
  handle('local:open-document-file', file => openDocument({ file }));
  handle('local:open-workspace', () => windows.serializeOpen(async () => {
    if (updates.blocksWork) throw new Error('앱 업데이트가 끝난 뒤 문서를 열어주세요.');
    mainWindow = windows.find(null) || await createWindow();
    focusWindow(mainWindow);
  }));
  if (!pendingFiles.length) mainWindow = await createWindow();
  for (const file of pendingFiles.splice(0)) await openDocument({ file }).catch(error => dialog.showErrorBox('문서를 열 수 없습니다', error.message));
  mainWindow ||= windows.all()[0] || await createWindow();
  if (app.isPackaged && !testMode) {
    const firstCheck = setTimeout(() => { void updates.check(); }, 3000);
    const nextChecks = setInterval(() => { void updates.check(); }, 6 * 60 * 60_000);
    firstCheck.unref(); nextChecks.unref();
    app.once('will-quit', () => { clearTimeout(firstCheck); clearInterval(nextChecks); });
  }
}).catch(error => {
  if (testMode) console.error(error);
  else dialog.showErrorBox('Dockit Open을 시작할 수 없습니다', error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { chatgpt?.dispose().catch(() => {}); codex?.dispose().catch(() => {}); });
