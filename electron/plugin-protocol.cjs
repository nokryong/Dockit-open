const fs = require('node:fs/promises');
const path = require('node:path');
const { FONT_ORIGINS } = require('./font-assets.cjs');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

function pluginProtocol(store) {
  const sdk = fs.readFile(path.join(__dirname, '..', 'plugin-sdk', 'browser.js'));
  return async request => {
    try {
      const url = new URL(request.url);
      if (request.method !== 'GET' || url.protocol !== 'dockit-plugin:' || url.username || url.password || url.port) return new Response(null, { status: 403 });
      store.session(url.hostname);
      const origin = `dockit-plugin://${url.hostname}`;
      const asset = url.pathname === '/__dockit/sdk.js' ? { bytes: await sdk, extension: '.js' } : await store.asset(url.hostname, url.pathname);
      const type = TYPES[asset.extension];
      if (!type) return new Response(null, { status: 415 });
      let body = asset.bytes;
      if (asset.extension === '.html') {
        const script = `<script src="${origin}/__dockit/sdk.js"></script>`;
        const html = body.toString('utf8');
        body = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, match => match + script) : script + html;
      }
      return new Response(body, { headers: {
        'Content-Type': type,
        'Content-Security-Policy': `default-src 'none'; script-src ${origin}; style-src ${origin} 'unsafe-inline'; img-src ${origin} data: blob:; font-src ${origin} data: ${FONT_ORIGINS.join(' ')}; media-src ${origin} blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts`,
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
      } });
    } catch { return new Response(null, { status: 404 }); }
  };
}

module.exports = { pluginProtocol };
