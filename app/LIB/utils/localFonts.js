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

// 글꼴 이름은 CSS 문자열로만 사용 (마크업·URL 아님)
// (같은 style 요소가 단독 HTML 내보내기에도 들어가므로 '<'도 이스케이프)
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
  // 기본 글꼴 이름은 CSS에서 그대로 동작
  // (다른 굵기나 기존 웹 글꼴을 가리지 않도록, 별칭은 개별 서체에만 사용)
  const nativeFamilies = new Set(fonts.map(font => font.family));
  const css = fonts
    .filter(
      (font) =>
        !nativeFamilies.has(font.value) && !existingFamilies.has(font.value)
    )
    .map(
      (font) =>
        `@font-face{font-family:${quoteFontFamily(font.value)};src:local(${quoteFontFamily(font.postscriptName)}),local(${quoteFontFamily(font.label)});font-style:normal;font-weight:400;font-display:swap;}`
    )
    .join("\n");
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
  // 설치가 지워진 글꼴도 저장된 이름은 선택 가능하게 유지
  return [...options, { value: selectedFont, label: name, fontFamily: selectedFont }];
}
