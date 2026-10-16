const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { IconsManifest } = require('react-icons');

const ICON_LIMIT = 64 * 1024;
const families = new Set(IconsManifest.map(icon => icon.id));
const aliases = { dice: 'react-icons/tb/TbDice', calendar: 'react-icons/tb/TbCalendar', music: 'react-icons/tb/TbMusic', puzzle: 'react-icons/tb/TbPuzzle' };
const cache = new Map();
const fail = message => Object.assign(new Error(message), { code: 'PluginError' });

function reactIcon(reference) {
  const match = /^react-icons\/([a-z0-9]+)\/([A-Z][a-zA-Z0-9]*)$/.exec(reference);
  if (!match || !families.has(match[1])) throw fail('React Icons 이름을 확인해주세요.');
  // Resolve only the SDK's installed icon library, never plugin JavaScript.
  const icons = require(`react-icons/${match[1]}`);
  if (!Object.hasOwn(icons, match[2]) || typeof icons[match[2]] !== 'function') throw fail(`아이콘을 찾을 수 없습니다: ${reference}`);
  return icons[match[2]];
}

function validateIcon(value, safePath) {
  if (typeof value !== 'string' || !value) throw fail('플러그인 아이콘을 등록해주세요.');
  if (Object.hasOwn(aliases, value)) return value;
  if (value.startsWith('react-icons/')) {
    reactIcon(value);
    return value;
  }
  const file = safePath(value);
  if (!file.toLowerCase().endsWith('.svg')) throw fail('아이콘은 React Icons 이름 또는 SVG 파일이어야 합니다.');
  return file;
}

const isSvgIcon = value => !Object.hasOwn(aliases, value) && !value.startsWith('react-icons/');

function svgIcon(bytes) {
  if (!bytes?.length || bytes.length > ICON_LIMIT) throw fail('아이콘 SVG 파일은 64 KiB 이하여야 합니다.');
  const source = Buffer.from(bytes).toString('utf8');
  const root = source.replace(/^\uFEFF/, '').replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/, '');
  if (!/^<svg\b[^>]*\bxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(root) || /<!DOCTYPE|<!ENTITY/i.test(source)) throw fail('아이콘 파일은 SVG 이미지여야 합니다.');
  return { src: `data:image/svg+xml;base64,${Buffer.from(bytes).toString('base64')}`, monochrome: false };
}

async function withIcons(manifest, readFile) {
  const resolved = new Map();
  for (const reference of new Set([manifest.icon, ...manifest.widgets.map(widget => widget.icon)])) {
    if (isSvgIcon(reference)) resolved.set(reference, svgIcon(await readFile(reference)));
    else {
      const name = aliases[reference] || reference;
      if (!cache.has(name)) {
        const svg = renderToStaticMarkup(createElement(reactIcon(name), { size: 40 }));
        cache.set(name, { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, monochrome: true });
      }
      resolved.set(reference, cache.get(name));
    }
  }
  return { ...manifest, iconAsset: resolved.get(manifest.icon), widgets: manifest.widgets.map(widget => ({ ...widget, iconAsset: resolved.get(widget.icon) })) };
}

module.exports = { ICON_LIMIT, validateIcon, isSvgIcon, svgIcon, withIcons };
