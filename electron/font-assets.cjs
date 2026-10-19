const { t: uiText } = require('./i18n.cjs');
const FONT_ORIGINS = ['https://cdn.jsdelivr.net', 'https://gcore.jsdelivr.net', 'https://hangeul.pstatic.net', 'https://fonts.gstatic.com'];
const STYLE_ORIGINS = ['https://cdn.jsdelivr.net', 'https://gcore.jsdelivr.net', 'https://hangeul.pstatic.net', 'https://fonts.googleapis.com'];
const cache = new Map();

function validateFontAsset(value) {
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new Error(uiText("허용되지 않은 글꼴 주소입니다."));
  const style = STYLE_ORIGINS.includes(url.origin) && (/\.css$/i.test(url.pathname) || (url.origin === 'https://fonts.googleapis.com' && /^\/css2?$/.test(url.pathname)));
  const font = FONT_ORIGINS.includes(url.origin) && /\.(woff2?|ttf|otf)$/i.test(url.pathname);
  if (!style && !font) throw new Error(uiText("허용되지 않은 글꼴 주소입니다."));
  return { url: url.href, style };
}

async function readFontAsset(value) {
  const initial = validateFontAsset(value);
  if (cache.has(initial.url)) return cache.get(initial.url);
  const pending = (async () => {
    let current = initial;
    for (let redirects = 0; redirects < 5; redirects++) {
      const response = await fetch(current.url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        current = validateFontAsset(new URL(response.headers.get('location'), current.url).href);
        if (current.style !== initial.style) throw new Error(uiText("잘못된 글꼴 응답입니다."));
        continue;
      }
      if (!response.ok) throw new Error(uiText("글꼴을 불러오지 못했습니다."));
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) throw new Error(uiText("잘못된 글꼴 응답입니다."));
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (initial.style) return { css: bytes.toString('utf8'), url: current.url };
      const extension = new URL(current.url).pathname.match(/\.(woff2?|ttf|otf)$/i)[1].toLowerCase();
      return { dataUrl: `data:font/${extension};base64,${bytes.toString('base64')}` };
    }
    throw new Error(uiText("글꼴을 불러오지 못했습니다."));
  })();
  cache.set(initial.url, pending);
  if (cache.size > 32) cache.delete(cache.keys().next().value);
  try { return await pending; } catch (error) { cache.delete(initial.url); throw error; }
}

module.exports = { FONT_ORIGINS, STYLE_ORIGINS, validateFontAsset, readFontAsset };
