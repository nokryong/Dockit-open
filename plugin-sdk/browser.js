// Loaded by Dockit before the toolkit's scripts. The transport is owned by the host.
(() => {
  const channel = 'dockit-plugin-v1';
  const pending = new Map();
  const themeListeners = new Set();
  const actionListeners = new Set();
  let serial = 0;
  let theme;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const send = message => window.parent.postMessage({ channel, ...message }, '*');
  const request = (method, payload) => ready.then(() => new Promise((resolve, reject) => {
    const requestId = String(++serial);
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Dockit 응답 시간이 초과되었습니다.')); }, 10000);
    pending.set(requestId, { resolve, reject, timer });
    send({ type: 'request', requestId, method, payload });
  }));
  const subscribe = (listeners, callback) => { listeners.add(callback); return () => listeners.delete(callback); };

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.channel !== channel) return;
    const message = event.data;
    if (message.type === 'theme' || message.type === 'init') {
      theme = message.theme;
      document.documentElement.style.colorScheme = theme.isDarkMode ? 'dark' : 'light';
      document.documentElement.style.setProperty('--dockit-font', theme.fontFamily);
      resolveReady(theme);
      for (const listener of themeListeners) listener(theme);
    } else if (message.type === 'action') {
      for (const listener of actionListeners) listener(message.id);
    } else if (message.type === 'response') {
      const item = pending.get(message.requestId);
      if (!item) return;
      pending.delete(message.requestId);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error));
      else item.resolve(message.value);
    }
  });
  window.Dockit = Object.freeze({
    version: 1,
    ready,
    get theme() { return theme; },
    onThemeChange: callback => subscribe(themeListeners, callback),
    onAction: callback => subscribe(actionListeners, callback),
    setActions: actions => request('actions', actions),
    setFooter: text => request('footer', text),
    storage: Object.freeze({
      get: key => request('storage.get', { key }),
      set: (key, value) => request('storage.set', { key, value }),
      remove: key => request('storage.remove', { key }),
    }),
  });
  const announce = () => send({ type: 'ready' });
  window.addEventListener('error', () => send({ type: 'error' }));
  window.addEventListener('unhandledrejection', () => send({ type: 'error' }));
  announce();
  window.addEventListener('DOMContentLoaded', () => {
    announce();
    let lastHeight = 0;
    const resize = () => {
      const height = Math.ceil(document.body.getBoundingClientRect().height);
      if (height !== lastHeight) { lastHeight = height; send({ type: 'resize', height }); }
    };
    new ResizeObserver(resize).observe(document.body);
    resize();
  }, { once: true });
})();
