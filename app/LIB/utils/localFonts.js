const STYLE_ID = 'dockit-local-font-faces';
let pendingFonts;
let installedFonts = [];

export const unquoteFontFamily = value => {
  const name = String(value || '').trim();
  const match = name.match(/^"((?:[^"\\]|\\.)*)"$/) || name.match(/^'((?:[^'\\]|\\.)*)'$/);
  if (!match) return name;
  return match[1].replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex, char) => {
    const point = hex && parseInt(hex, 16);
    return hex ? String.fromCodePoint(point > 0 && point <= 0x10ffff ? point : 0xfffd) : char;
  });
};

// Font names are CSS strings, never markup or URLs. Escape '<' as well because
// the same style element is included in standalone HTML exports.
export const quoteFontFamily = value => `"${String(value).replace(/[\\"\x00-\x1f\x7f<>]/g,
  char => `\\${char.codePointAt(0).toString(16)} `)}"`;

export function createLocalFontOptions(fonts) {
  const seen = new Set();
  return fonts.flatMap(font => {
    const name = font.fullName || font.family;
    if (!name || !font.postscriptName || seen.has(name)) return [];
    seen.add(name);
    return [{ value: name, label: name, fontFamily: quoteFontFamily(name),
      family: font.family, postscriptName: font.postscriptName }];
  });
}

export function registerLocalFontFaces(fonts, target = document) {
  const existingFamilies = new Set(Array.from(target.fonts || [], face => unquoteFontFamily(face.family)));
  // Native family names already work in CSS. Do not shadow their other weights
  // or any existing web-font family; aliases are only needed for individual faces.
  const nativeFamilies = new Set(fonts.map(font => font.family));
  const css = fonts.filter(font => !nativeFamilies.has(font.value) && !existingFamilies.has(font.value))
    .map(font => `@font-face{font-family:${quoteFontFamily(font.value)};src:local(${quoteFontFamily(font.postscriptName)}),local(${quoteFontFamily(font.label)});font-style:normal;font-weight:400;font-display:swap;}`)
    .join('\n');
  let style = target.getElementById(STYLE_ID);
  if (!style) {
    style = target.createElement('style');
    style.id = STYLE_ID;
    target.head.appendChild(style);
  }
  style.textContent = css;
}

export function loadLocalFonts() {
  if (!window.dockitLocal || typeof window.queryLocalFonts !== 'function') return Promise.resolve([]);
  if (!pendingFonts) {
    pendingFonts = window.queryLocalFonts().then(fonts => {
      installedFonts = createLocalFontOptions(fonts);
      registerLocalFontFaces(installedFonts);
      return installedFonts;
    }).catch(error => {
      pendingFonts = undefined;
      throw error;
    });
  }
  return pendingFonts;
}

export const getLocalFontOptions = () => installedFonts;

export function includeSelectedFont(options, selectedFont) {
  if (!selectedFont || options.some(option => option.value === selectedFont)) return options;
  const name = unquoteFontFamily(selectedFont);
  const index = options.findIndex(option => option.value === name);
  if (index >= 0) return options.map((option, i) => i === index ? { ...option, value: selectedFont } : option);
  // Keep the stored font name selectable even when it is no longer installed.
  return [...options, { value: selectedFont, label: name, fontFamily: selectedFont }];
}
