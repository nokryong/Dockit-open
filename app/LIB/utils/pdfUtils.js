import { generateCssVariables } from "./tiptapUtils";
import { projectEndnotesForPrint } from "./endnotePrintProjection";

// 외부 CSS 파일 내용을 가져와 <style> 태그로 바꿔주는 헬퍼 함수
const inlineCssStyles = async (htmlString) => {
  // DOMParser를 사용해 문자열을 실제 HTML 문서처럼 다룰 수 있게 합니다.
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  // 문서 안의 모든 <link rel="stylesheet"> 태그를 찾습니다.
  const links = doc.querySelectorAll('link[rel="stylesheet"]');

  for (const link of links) {
    const href = link.getAttribute("href");
    if (href) {
      try {
        // CSS 파일의 내용을 fetch로 가져옵니다.
        // href가 상대경로일 경우를 대비해 절대경로로 만들어줍니다.
        const response = await fetch(new URL(href, window.location.href));
        const cssText = await response.text();

        // 새로운 <style> 태그를 만듭니다.
        const style = doc.createElement("style");
        style.textContent = cssText;

        // 기존 <link> 태그를 새로운 <style> 태그로 교체합니다.
        link.parentNode.replaceChild(style, link);
      } catch (error) {
        console.error(`CSS 파일을 가져오는 데 실패했습니다: ${href}`, error);
      }
    }
  }
  // 수정된 문서의 전체 HTML을 문자열로 반환합니다.
  return doc.documentElement.outerHTML;
};

const collectStyleTags = () =>
  Array.from(window.document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((tag) => tag.outerHTML)
    .join("");

export const generateStyleSet = async (
  bulletStyle,
  docSetting,
  content,
  options = {}
) => {
  const printableContent = projectEndnotesForPrint(content);
  const editorStyleVariables = generateCssVariables(bulletStyle);
  const {
    title = "문서"
  } = options;
  const baseHref =
    typeof window !== "undefined"
      ? `${window.location.origin}/`
      : "https://dockit.kr/";
  const normalizedDocSetting = {
    pageWidth: Number(docSetting?.pageWidth) || 210,
    pageHeight: Number(docSetting?.pageHeight) || 297,
    paddingTop: Number(docSetting?.paddingTop) || 25,
    paddingBottom: Number(docSetting?.paddingBottom) || 25,
    paddingLeft: Number(docSetting?.paddingLeft) || 25,
    paddingRight: Number(docSetting?.paddingRight) || 25,
    lineHeight: Number(docSetting?.lineHeight) || 1.5
  };
  const editorRoot =
    typeof window !== "undefined"
      ? window.document.querySelector(".tiptap-main-canvas")
      : null;
  const computedRootStyle =
    editorRoot instanceof Element ? window.getComputedStyle(editorRoot) : null;
  const exportStyleString = `
  :root {
    ${Object.entries(editorStyleVariables)
      .map(([key, value]) => `${key}: ${value};`)
      .join("\n  ")}
  }
  html,
  body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    background: #f4f5f7;
  }
  body {
    padding: 24px;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }
  .dockit-html-export-shell {
    width: 100%;
    min-height: calc(100vh - 48px);
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .dockit-html-export-page {
    width: ${normalizedDocSetting.pageWidth}mm;
    max-width: 100%;
    background: #ffffff;
  }
  .dockit-html-export-page .tiptap-main-canvas {
    width: ${normalizedDocSetting.pageWidth}mm;
    max-width: 100%;
    min-height: ${normalizedDocSetting.pageHeight}mm;
    margin: 0 auto;
    padding: ${normalizedDocSetting.paddingTop}mm ${normalizedDocSetting.paddingRight}mm ${normalizedDocSetting.paddingBottom}mm ${normalizedDocSetting.paddingLeft}mm;
    background: #ffffff;
    line-height: ${normalizedDocSetting.lineHeight} !important;
    font-family: ${computedRootStyle?.fontFamily || "inherit"};
    font-size: ${computedRootStyle?.fontSize || "12pt"};
    color: ${computedRootStyle?.color || "inherit"};
  }
  .dockit-html-export-page .printable-area {
    --print-page-header-height: ${normalizedDocSetting.paddingTop}mm;
    --print-page-footer-height: ${normalizedDocSetting.paddingBottom}mm;
    --print-page-padding-left: ${normalizedDocSetting.paddingLeft}mm;
    --print-page-padding-right: ${normalizedDocSetting.paddingRight}mm;
    --print-page-number-bottom-offset: calc(${normalizedDocSetting.paddingBottom}mm / 2 - 6px);
  }
  .dockit-html-export-page .page-header-spacer {
    height: ${normalizedDocSetting.paddingTop}mm !important;
    min-height: ${normalizedDocSetting.paddingTop}mm !important;
    margin: 0 !important;
    display: block !important;
    background-color: white !important;
  }
  .dockit-html-export-page .page-footer-spacer {
    height: ${normalizedDocSetting.paddingBottom}mm !important;
    min-height: ${normalizedDocSetting.paddingBottom}mm !important;
    background-color: white !important;
    break-after: page !important;
    position: relative !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-end !important;
  }
  .dockit-html-export-page .tiptap-page-container {
    margin-left: 0 !important;
    margin-right: 0 !important;
    width: 100% !important;
  }
  .dockit-html-export-page .prose p:empty {
    min-height: 1rem;
  }
  .dockit-html-export-page .dockit-print-endnote-reference-link,
  .dockit-html-export-page .dockit-print-endnote-backlink {
    color: inherit;
    text-decoration: none;
  }
  .dockit-html-export-page .dockit-print-endnote-reference-link {
    vertical-align: super;
    font-size: 0.75em;
    line-height: 0;
  }
  .dockit-html-export-page .dockit-print-endnotes {
    --dockit-print-endnote-rule-color: #9ca3af;
    --dockit-print-endnote-gap: 0.75rem;
    page: dockit-endnotes;
    break-before: page;
    page-break-before: always;
    margin-top: 0;
    padding-top: var(--dockit-print-endnote-gap);
    border-top: 1px solid var(--dockit-print-endnote-rule-color);
  }
  .dockit-html-export-page .dockit-print-endnotes-heading {
    margin: 0 0 var(--dockit-print-endnote-gap);
    font-size: 1.1em;
  }
  .dockit-html-export-page .dockit-print-endnote-entry {
    display: flow-root;
    margin: 0 0 var(--dockit-print-endnote-gap);
  }
  .dockit-html-export-page .dockit-print-endnote-backlink {
    float: left;
    min-width: 1.5em;
    font-weight: 600;
  }
  .dockit-html-export-page .dockit-print-endnote-entry > :not(.dockit-print-endnote-backlink) {
    margin-left: 1.5em;
  }
  .dockit-html-export-page h1,
  .dockit-html-export-page h2,
  .dockit-html-export-page h3,
  .dockit-html-export-page h4,
  .dockit-html-export-page h5,
  .dockit-html-export-page h6 {
    page-break-after: avoid;
    break-after: avoid-page;
  }
  .dockit-html-export-page img,
  .dockit-html-export-page figure,
  .dockit-html-export-page blockquote,
  .dockit-html-export-page ul,
  .dockit-html-export-page ol {
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .dockit-html-export-page table {
    page-break-inside: auto;
    break-inside: auto;
  }
  .dockit-html-export-page thead {
    display: table-header-group;
  }
  .dockit-html-export-page tfoot {
    display: table-footer-group;
  }
  .dockit-html-export-page tr {
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .dockit-html-export-page p {
    widows: 2;
    orphans: 2;
  }
  @page {
    size: ${normalizedDocSetting.pageWidth}mm ${normalizedDocSetting.pageHeight}mm;
    margin: ${normalizedDocSetting.paddingTop}mm ${normalizedDocSetting.paddingRight}mm ${normalizedDocSetting.paddingBottom}mm ${normalizedDocSetting.paddingLeft}mm;
  }
  @page dockit-endnotes {
    size: ${normalizedDocSetting.pageWidth}mm ${normalizedDocSetting.pageHeight}mm;
    margin: ${normalizedDocSetting.paddingTop}mm ${normalizedDocSetting.paddingRight}mm ${normalizedDocSetting.paddingBottom}mm ${normalizedDocSetting.paddingLeft}mm;
  }
  @media print {
    html,
    body {
      background: #ffffff !important;
    }
    body {
      padding: 0 !important;
    }
    .dockit-html-export-page {
      width: auto;
      max-width: none;
    }
    .dockit-html-export-page .tiptap-main-canvas {
      width: auto;
      max-width: none;
      min-height: 0;
      margin: 0;
      padding: 0;
    }
  }
  `;
  const styleTags = collectStyleTags();

  const combinedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <base href="${baseHref}">
          ${styleTags}
          <style>
          ${exportStyleString}
        </style>
        </head>
        <body>
          <div class="dockit-html-export-shell">
            <div class="dockit-html-export-page">
              <div class="tiptap-container">
                <div class="prose prose-sm sm:prose-base w-full tiptap-main-canvas printable-area ProseMirror">
                  ${printableContent}
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

  const finalHtml = await inlineCssStyles(combinedHtml);

  return finalHtml;
};
