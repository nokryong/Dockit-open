import { t as uiText } from "../i18n";
const assets = new Map();
const normalizeFamily = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');

async function readAsset(url, style = false) {
  if (!assets.has(url)) {
    const pending = (async () => {
      if (window.dockitLocal) {
        if (!window.dockitLocal.readFontAsset) throw new Error(uiText("글꼴 기능을 적용하려면 앱을 다시 실행해주세요."));
        return window.dockitLocal.readFontAsset(url);
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(uiText("글꼴을 불러오지 못했습니다."));
      if (style) return { css: await response.text(), url: response.url };
      const blob = await response.blob();
      return { dataUrl: await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }) };
    })();
    assets.set(url, pending);
    pending.catch(() => assets.delete(url));
    if (assets.size > 32) assets.delete(assets.keys().next().value);
  }
  return assets.get(url);
}

async function embedFont(svg, fontFamily) {
  if (!Array.from(document.fonts || []).some(face => normalizeFamily(face.family) === fontFamily)) return svg;
  const faces = [], imports = [], visited = new Set();
  const inspect = (sheet, base) => {
    if (!sheet || visited.has(sheet)) return;
    visited.add(sheet);
    let rules;
    try { rules = sheet.cssRules; } catch {
      if (sheet.href) imports.push(sheet.href);
      return;
    }
    for (const rule of rules || []) {
      if (rule.type === 5 && normalizeFamily(rule.style.getPropertyValue('font-family')) === fontFamily)
        faces.push({ rule, base });
      else if (rule.type === 3) inspect(rule.styleSheet, rule.href);
      else if (rule.cssRules) inspect(rule, base);
    }
  };
  for (const sheet of document.styleSheets) inspect(sheet, sheet.href || document.baseURI);
  // Cross-origin stylesheets cannot expose cssRules. Read only the existing
  // web-font providers through the desktop's restricted font-asset bridge.
  while (!faces.length && imports.length) {
    const url = imports.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    const asset = await readAsset(url, true);
    const sheet = new CSSStyleSheet();
    const css = asset.css.replace(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/gi, (_, href) => {
      imports.push(new URL(href, asset.url).href);
      return '';
    });
    sheet.replaceSync(css);
    inspect(sheet, asset.url);
  }
  if (!faces.length) return svg; // Installed system fonts need no embedded file.
  const embedded = await Promise.all(faces.map(async ({ rule, base }) => {
    const src = rule.style.getPropertyValue('src');
    const urls = [...src.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/g)];
    if (!urls.length) return /\blocal\s*\(/.test(src) ? rule.cssText : '';
    let dataUrl;
    for (const match of urls) {
      const url = new URL(match[1] || match[2] || match[3], base).href;
      try { dataUrl = url.startsWith('data:') ? url : (await readAsset(url)).dataUrl; break; }
      catch (error) { if (match === urls.at(-1)) throw error; }
    }
    const descriptors = Array.from(rule.style).filter(name => !['src', 'font-display'].includes(name))
      .map(name => `${name}:${rule.style.getPropertyValue(name)};`).join('');
    return `@font-face{${descriptors}src:url("${dataUrl}");font-display:block;}`;
  }));
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const style = parsed.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = embedded.join('\n');
  parsed.documentElement.prepend(style);
  return new XMLSerializer().serializeToString(parsed.documentElement);
}

export async function embedSvgFont(svg, fontFamily) {
  try { return await embedFont(svg, fontFamily); }
  catch (error) { error.name = 'FontLoadError'; throw error; }
}
