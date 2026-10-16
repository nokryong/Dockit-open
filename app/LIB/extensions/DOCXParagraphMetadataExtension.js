import { Extension } from "@tiptap/core";

const TWIPS_PER_POINT = 20;

const dataAttrs = {
  spacingBefore: "data-docx-paragraph-spacing-before",
  spacingAfter: "data-docx-paragraph-spacing-after",
  spacingLine: "data-docx-paragraph-spacing-line",
  spacingLineRule: "data-docx-paragraph-spacing-line-rule",
  styleId: "data-docx-paragraph-style-id",
  styleName: "data-docx-paragraph-style-name",
  tabs: "data-docx-paragraph-tabs"
};

const toFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseNumberAttr = (element, name) =>
  toFiniteNumber(element.getAttribute(name));

const parseStringAttr = (element, name) => {
  const value = element.getAttribute(name);
  return value && value.trim() ? value : null;
};

const parseJSONAttr = (element, name) => {
  const value = element.getAttribute(name);

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const renderDataAttr = (name, value) =>
  value !== null && value !== undefined ? { [name]: String(value) } : {};

const renderJSONDataAttr = (name, value) =>
  Array.isArray(value) && value.length > 0 ? { [name]: JSON.stringify(value) } : {};

export const docxTwipsToPointCss = (value) => {
  const numberValue = toFiniteNumber(value);

  if (numberValue === null || numberValue < 0) {
    return null;
  }

  return `${numberValue / TWIPS_PER_POINT}pt`;
};

export const docxAutoLineSpacingToCss = (line, lineRule) => {
  const lineValue = toFiniteNumber(line);

  if (
    lineValue === null ||
    lineValue <= 0 ||
    (lineRule && String(lineRule).toLowerCase() !== "auto")
  ) {
    return null;
  }

  return String(Math.round((lineValue / 240) * 1000) / 1000);
};

export const docxLineSpacingToCss = (line, lineRule) => {
  const lineValue = toFiniteNumber(line);

  if (lineValue === null || lineValue <= 0) {
    return null;
  }

  const normalizedRule =
    typeof lineRule === "string" && lineRule.trim()
      ? lineRule.trim().toLowerCase()
      : "auto";

  if (normalizedRule === "exact") {
    return `${lineValue / TWIPS_PER_POINT}pt`;
  }

  return docxAutoLineSpacingToCss(lineValue, normalizedRule);
};

export const buildDOCXParagraphMetadataHTMLAttrs = (attributes = {}) => {
  const styles = [];
  const spacingBefore = docxTwipsToPointCss(attributes.docxParagraphSpacingBefore);
  const spacingAfter = docxTwipsToPointCss(attributes.docxParagraphSpacingAfter);
  const lineHeight = docxLineSpacingToCss(
    attributes.docxParagraphSpacingLine,
    attributes.docxParagraphSpacingLineRule
  );

  if (spacingBefore) {
    styles.push(`margin-top: ${spacingBefore}`);
  }

  if (spacingAfter) {
    styles.push(`margin-bottom: ${spacingAfter}`);
  }

  if (lineHeight) {
    styles.push(`line-height: ${lineHeight}`);
  }

  return {
    ...renderDataAttr(
      dataAttrs.spacingBefore,
      attributes.docxParagraphSpacingBefore
    ),
    ...renderDataAttr(dataAttrs.spacingAfter, attributes.docxParagraphSpacingAfter),
    ...renderDataAttr(dataAttrs.spacingLine, attributes.docxParagraphSpacingLine),
    ...renderDataAttr(
      dataAttrs.spacingLineRule,
      attributes.docxParagraphSpacingLineRule
    ),
    ...renderDataAttr(dataAttrs.styleId, attributes.docxParagraphStyleId),
    ...renderDataAttr(dataAttrs.styleName, attributes.docxParagraphStyleName),
    ...renderJSONDataAttr(dataAttrs.tabs, attributes.docxParagraphTabs),
    ...(styles.length > 0 ? { style: styles.join("; ") } : {})
  };
};

export const DOCXParagraphMetadataExtension = Extension.create({
  name: "docxParagraphMetadata",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          docxParagraphSpacingBefore: {
            default: null,
            parseHTML: (element) => parseNumberAttr(element, dataAttrs.spacingBefore),
            renderHTML: (attributes) =>
              buildDOCXParagraphMetadataHTMLAttrs(attributes)
          },
          docxParagraphSpacingAfter: {
            default: null,
            parseHTML: (element) => parseNumberAttr(element, dataAttrs.spacingAfter),
            renderHTML: () => ({})
          },
          docxParagraphSpacingLine: {
            default: null,
            parseHTML: (element) => parseNumberAttr(element, dataAttrs.spacingLine),
            renderHTML: () => ({})
          },
          docxParagraphSpacingLineRule: {
            default: null,
            parseHTML: (element) => parseStringAttr(element, dataAttrs.spacingLineRule),
            renderHTML: () => ({})
          },
          docxParagraphStyleId: {
            default: null,
            parseHTML: (element) => parseStringAttr(element, dataAttrs.styleId),
            renderHTML: () => ({})
          },
          docxParagraphStyleName: {
            default: null,
            parseHTML: (element) => parseStringAttr(element, dataAttrs.styleName),
            renderHTML: () => ({})
          },
          docxParagraphTabs: {
            default: null,
            parseHTML: (element) => parseJSONAttr(element, dataAttrs.tabs),
            renderHTML: () => ({})
          }
        }
      }
    ];
  }
});
