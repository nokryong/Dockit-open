// Loaded by Dockit before the toolkit's scripts. The transport is owned by the host.
(() => {
  const channel = 'dockit-plugin-v1';
  const pending = new Map();
  const themeListeners = new Set();
  const languageListeners = new Set();
  const actionListeners = new Set();
  let serial = 0;
  let theme;
  let language = 'ko';
  const updateLanguage = value => {
    const next = value === 'en' ? 'en' : 'ko';
    document.documentElement.lang = next;
    if (next === language) return;
    language = next;
    for (const listener of languageListeners) listener(language);
  };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const send = message => window.parent.postMessage({ channel, ...message }, '*');
  const request = (method, payload) => ready.then(() => new Promise((resolve, reject) => {
    const requestId = String(++serial);
    const timer = ['credentials.configure', 'images.download'].includes(method) ? null : setTimeout(() => { pending.delete(requestId); reject(new Error(language === 'en' ? 'Dockit did not respond in time.' : 'Dockit 응답 시간이 초과되었습니다.')); }, 45000);
    pending.set(requestId, { resolve, reject, timer });
    send({ type: 'request', requestId, method, payload });
  }));
  const subscribe = (listeners, callback) => { listeners.add(callback); return () => listeners.delete(callback); };

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.channel !== channel) return;
    const message = event.data;
    if (message.type === 'theme' || message.type === 'init') {
      if (message.type === 'init') updateLanguage(message.language);
      theme = message.theme;
      document.documentElement.style.colorScheme = theme.isDarkMode ? 'dark' : 'light';
      document.documentElement.style.setProperty('--dockit-font', theme.fontFamily);
      resolveReady(theme);
      for (const listener of themeListeners) listener(theme);
    } else if (message.type === 'language') {
      updateLanguage(message.language);
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
    version: 2,
    ready,
    get theme() { return theme; },
    get language() { return language; },
    onLanguageChange: callback => subscribe(languageListeners, callback),
    onThemeChange: callback => subscribe(themeListeners, callback),
    onAction: callback => subscribe(actionListeners, callback),
    setActions: actions => request('actions', actions),
    setFooter: text => request('footer', text),
    notify: (message, type = 'danger') => request('notify', { message, type }),
    openExternal: url => request('external.open', { url }),
    credentials: Object.freeze({
      status: service => request('credentials.status', { service }),
      configure: service => request('credentials.configure', { service }),
    }),
    network: Object.freeze({ get: (service, params) => request('network.get', { service, params }) }),
    images: Object.freeze({
      load: url => request('images.load', { url }),
      preview: details => request('images.preview', details),
      download: (url, filename) => request('images.download', { url, filename }),
    }),
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
