const { contextBridge, ipcRenderer } = require('electron');
async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result.error) throw Object.assign(new Error(result.error.message), result.error);
  return result.value;
}
contextBridge.exposeInMainWorld('dockitLocal', {
  plugins: {
    list: () => invoke('plugins:list'),
    inspect: url => invoke('plugins:inspect', url),
    install: (token, folder) => invoke('plugins:install', token, folder),
    uninstall: (id, keepData) => invoke('plugins:uninstall', id, keepData),
    open: (id, widgetId) => invoke('plugins:open', id, widgetId),
    close: sessionId => invoke('plugins:close', sessionId),
    storage: (sessionId, operation, key, value) => invoke('plugins:storage', sessionId, operation, key, value),
    request: (sessionId, method, payload) => invoke('plugins:request', sessionId, method, payload),
    onChanged: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('plugins:changed', listener);
      return () => ipcRenderer.removeListener('plugins:changed', listener);
    },
    onStopped: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('plugins:stopped', listener);
      return () => ipcRenderer.removeListener('plugins:stopped', listener);
    }
  },
  codex: {
    status: () => invoke('codex:status'),
    signIn: () => invoke('codex:sign-in'),
    cancelSignIn: () => invoke('codex:cancel-sign-in'),
    signOut: () => invoke('codex:sign-out'),
    models: () => invoke('codex:models'),
    selectModel: slug => invoke('codex:select-model', slug),
    selectReasoningEffort: effort => invoke('codex:select-reasoning-effort', effort),
    selectServiceTier: tier => invoke('codex:select-service-tier', tier),
    usage: () => invoke('codex:usage'),
    history: kind => invoke('codex:history', kind),
    clearHistory: kind => invoke('codex:clear-history', kind),
    send: (text, attachments, document) => invoke('codex:send', text, attachments, document),
    validateDocument: (requestId, result) => invoke('codex:document-validation', requestId, result),
    generateImage: (text, reference) => invoke('codex:generate-image', text, reference),
    cancelResponse: kind => invoke('codex:cancel-response', kind),
    copyImage: id => invoke('codex:copy-image', id),
    saveImage: id => invoke('codex:save-image', id),
    onEvent: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('codex:event', listener);
      return () => ipcRenderer.removeListener('codex:event', listener);
    }
  },
  chatgpt: {
    status: () => invoke('chatgpt:status'),
    signIn: options => invoke('chatgpt:sign-in', options),
    cancelSignIn: () => invoke('chatgpt:cancel-sign-in'),
    signOut: () => invoke('chatgpt:sign-out'),
    selectProfile: id => invoke('chatgpt:select-profile', id),
    models: () => invoke('chatgpt:models'),
    selectModel: slug => invoke('chatgpt:select-model', slug),
    selectReasoningEffort: effort => invoke('chatgpt:select-reasoning-effort', effort),
    selectServiceTier: tier => invoke('chatgpt:select-service-tier', tier),
    acknowledge: () => invoke('chatgpt:acknowledge'),
    openUsage: () => invoke('chatgpt:usage'),
    history: () => invoke('chatgpt:history'),
    clearHistory: () => invoke('chatgpt:clear-history'),
    send: (text, attachments) => invoke('chatgpt:send', text, attachments),
    cancelResponse: () => invoke('chatgpt:cancel-response'),
    onEvent: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('chatgpt:event', listener);
      return () => ipcRenderer.removeListener('chatgpt:event', listener);
    }
  },
  window: {
    minimize: () => invoke('local:window-minimize'),
    maximize: () => invoke('local:window-maximize'),
    close: () => invoke('local:window-close'),
    isMaximized: () => invoke('local:window-is-maximized'),
    onMaximized: callback => {
      const listener = (_event, maximized) => callback(maximized);
      ipcRenderer.on('local:window-maximized', listener);
      return () => ipcRenderer.removeListener('local:window-maximized', listener);
    }
  },
  paths: () => invoke('local:paths'),
  print: options => invoke('local:print', options),
  readFontAsset: url => invoke('local:font-asset', url),
  data: (action, args) => invoke('local:data', action, args),
  chooseDocuments: () => invoke('local:choose-documents'),
  chooseChatAttachments: provider => invoke('local:choose-chat-attachments', provider),
  addMusic: () => invoke('local:music-add'),
  removeMusic: id => invoke('local:music-remove', id),
  flush: () => invoke('local:flush'),
  closeReady: () => invoke('local:close-ready'),
  onPrepareClose: callback => {
    const listener = () => callback();
    ipcRenderer.on('local:prepare-close', listener);
    return () => ipcRenderer.removeListener('local:prepare-close', listener);
  }
});
