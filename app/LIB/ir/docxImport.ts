import { strFromU8, unzipSync } from "fflate";
import { parseHWPXXml, type HWPXXmlNode } from "./hwpxImport";
import type {
  IRBlock,
  IRDocument,
  IRDOCXParagraphTabStop,
  IRHardBreak,
  IRInlineNode,
  IRListBlock,
  IRListItem,
  IRMark,
  IRNoteBody,
  IRNoteInlineNode,
  IRNoteKind,
  IRObjectAnchorMode,
  IRObjectBlock,
  IRObjectFlowMode,
  IRParagraphBlock,
  IRSection,
  IRTableBlock,
  IRTableCell,
  IRTableRow,
  IRTextRun
} from "./types";

export type DOCXImportWarningSeverity = "warning" | "error";

export type DOCXImportWarningCode =
  | "docx-import-package-error"
  | "docx-import-missing-entry"
  | "docx-import-xml-warning"
  | "docx-import-xml-error"
  | "docx-import-style-unsupported"
  | "docx-import-relationship-unsupported"
  | "docx-import-media-metadata-only"
  | "docx-import-table-partial"
  | "docx-import-paragraph-partial"
  | "docx-import-section-properties-partial"
  | "docx-import-numbering-unsupported"
  | "docx-import-hyperlink-relationship-unsupported"
  | "docx-import-run-unsupported"
  | "docx-import-note-part-invalid"
  | "docx-import-note-numbering-unsupported"
  | "docx-import-note-pair-invalid"
  | "docx-import-note-content-unsupported"
  | "docx-import-note-hyperlink-unsupported"
  | "docx-import-unsupported-block";

export interface DOCXImportWarning {
  code: DOCXImportWarningCode;
  severity: DOCXImportWarningSeverity;
  message: string;
  entry?: string;
  path?: string;
}

export interface DOCXPackageEntry {
  path: string;
  bytes: Uint8Array;
  text: string | null;
}

export interface DOCXPackageRequiredEntries {
  contentTypes: boolean;
  packageRels: boolean;
  documentXml: boolean;
}

export interface DOCXPackageSummary {
  entryCount: number;
  entries: readonly string[];
  requiredEntries: Readonly<DOCXPackageRequiredEntries>;
  optionalEntries: Readonly<{
    documentRels: boolean;
    stylesXml: boolean;
    numberingXml: boolean;
  }>;
}

export interface DOCXPackageReadResult {
  entries: readonly Readonly<DOCXPackageEntry>[];
  entryMap: ReadonlyMap<string, Readonly<DOCXPackageEntry>>;
  packageSummary: Readonly<DOCXPackageSummary>;
  warnings: readonly Readonly<DOCXImportWarning>[];
}

export interface DOCXImportOptions {
  sourceName?: string;
  extractedAt?: string;
}

export interface DOCXImportResult {
  irDocument: Readonly<IRDocument>;
  warnings: readonly Readonly<DOCXImportWarning>[];
  packageSummary: Readonly<DOCXPackageSummary>;
}

interface DOCXParagraphStyle {
  styleId: string;
  name: string | null;
  basedOn: string | null;
  headingLevel: number | null;
  attrs: Partial<IRParagraphBlock["attrs"]>;
  marks: readonly IRMark[];
}

interface DOCXResolvedParagraphStyle {
  styleId: string | null;
  name: string | null;
  headingLevel: number | null;
  attrs: Partial<IRParagraphBlock["attrs"]>;
  marks: readonly IRMark[];
}

interface DOCXStyleModel {
  paragraphStyles: ReadonlyMap<string, Readonly<DOCXParagraphStyle>>;
}

type DOCXDocumentRelationshipKind =
  | "hyperlink"
  | "image"
  | "styles"
  | "numbering"
  | "footnotes"
  | "endnotes"
  | "other";

interface DOCXDocumentRelationship {
  id: string;
  type: string;
  kind: DOCXDocumentRelationshipKind;
  target: string;
  targetMode: string | null;
  isExternal: boolean;
  targetEntry: string | null;
}

interface DOCXRelationshipModel {
  byId: ReadonlyMap<string, Readonly<DOCXDocumentRelationship>>;
}

interface DOCXNumberingDefinition {
  numId: string;
  abstractNumId: string | null;
  listType: IRListBlock["listType"];
  start: number | null;
  level: number;
  numFormat: string | null;
  unsupported: readonly string[];
}

interface DOCXNumberingModel {
  byNumId: ReadonlyMap<string, Readonly<DOCXNumberingDefinition>>;
}

interface DOCXParagraphNumbering {
  numId: string;
  level: number;
}

interface DOCXPendingList {
  numId: string;
  level: number;
  listType: IRListBlock["listType"];
  start: number | null;
  items: IRListItem[];
}

const DOCX_IMPORT_EXTRACTOR_VERSION = "dockit-docx-import-s5";
const DOCX_REL_TYPE_PREFIX =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const DOCX_MAX_RESTORED_IMAGE_BYTES = 5 * 1024 * 1024;
const DOCX_RESTORABLE_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const DEFAULT_PAGE_SETTINGS = Object.freeze({
  widthMm: 210,
  heightMm: 297,
  paddingTopMm: 20,
  paddingBottomMm: 20,
  paddingLeftMm: 25,
  paddingRightMm: 25,
  lineHeight: 1.5
});

const EMPTY_PACKAGE_SUMMARY: Readonly<DOCXPackageSummary> = Object.freeze({
  entryCount: 0,
  entries: Object.freeze([]),
  requiredEntries: Object.freeze({
    contentTypes: false,
    packageRels: false,
    documentXml: false
  }),
  optionalEntries: Object.freeze({
    documentRels: false,
    stylesXml: false,
    numberingXml: false
  })
});

const EMPTY_STYLE_MODEL: Readonly<DOCXStyleModel> = Object.freeze({
  paragraphStyles: new Map()
});

const EMPTY_RELATIONSHIP_MODEL: Readonly<DOCXRelationshipModel> = Object.freeze({
  byId: new Map()
});

const EMPTY_NUMBERING_MODEL: Readonly<DOCXNumberingModel> = Object.freeze({
  byNumId: new Map()
});

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

const warning = (
  code: DOCXImportWarningCode,
  severity: DOCXImportWarningSeverity,
  message: string,
  details: Pick<DOCXImportWarning, "entry" | "path"> = {}
): Readonly<DOCXImportWarning> =>
  Object.freeze({
    code,
    severity,
    message,
    ...details
  });

const isTextEntryPath = (path: string) =>
  path.endsWith(".xml") || path.endsWith(".rels") || path === "[Content_Types].xml";

const buildPackageSummary = (
  entries: readonly Readonly<DOCXPackageEntry>[]
): Readonly<DOCXPackageSummary> => {
  const paths = entries.map((entry) => entry.path).sort((left, right) =>
    left.localeCompare(right)
  );
  const entrySet = new Set(paths);

  return Object.freeze({
    entryCount: entries.length,
    entries: freezeArray(paths),
    requiredEntries: Object.freeze({
      contentTypes: entrySet.has("[Content_Types].xml"),
      packageRels: entrySet.has("_rels/.rels"),
      documentXml: entrySet.has("word/document.xml")
    }),
    optionalEntries: Object.freeze({
      documentRels: entrySet.has("word/_rels/document.xml.rels"),
      stylesXml: entrySet.has("word/styles.xml"),
      numberingXml: entrySet.has("word/numbering.xml")
    })
  });
};

export const readDOCXPackageFromBytes = (
  packageBytes: Uint8Array
): Readonly<DOCXPackageReadResult> => {
  const warnings: DOCXImportWarning[] = [];

  if (!packageBytes.length) {
    return Object.freeze({
      entries: freezeArray([]),
      entryMap: new Map(),
      packageSummary: EMPTY_PACKAGE_SUMMARY,
      warnings: freezeArray([
        warning("docx-import-package-error", "error", "DOCX package is empty.")
      ])
    });
  }

  let unzipped: Record<string, Uint8Array>;

  try {
    unzipped = unzipSync(packageBytes);
  } catch (error) {
    return Object.freeze({
      entries: freezeArray([]),
      entryMap: new Map(),
      packageSummary: EMPTY_PACKAGE_SUMMARY,
      warnings: freezeArray([
        warning(
          "docx-import-package-error",
          "error",
          `DOCX ZIP could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      ])
    });
  }

  const entries = Object.entries(unzipped).map(([path, bytes]) =>
    Object.freeze({
      path,
      bytes,
      text: isTextEntryPath(path) ? strFromU8(bytes) : null
    })
  );
  const packageSummary = buildPackageSummary(entries);
  const entryMap = new Map(entries.map((entry) => [entry.path, entry]));

  Object.entries(packageSummary.requiredEntries).forEach(([key, present]) => {
    if (!present) {
      warnings.push(
        warning(
          "docx-import-missing-entry",
          "error",
          `DOCX required entry is missing: ${key}.`
        )
      );
    }
  });

  return Object.freeze({
    entries: freezeArray(entries),
    entryMap,
    packageSummary,
    warnings: freezeArray(warnings)
  });
};

const localName = (name: string) => {
  const index = name.indexOf(":");

  return index >= 0 ? name.slice(index + 1) : name;
};

const isNodeNamed = (node: Readonly<HWPXXmlNode>, name: string) =>
  localName(node.name) === name;

const childrenNamed = (node: Readonly<HWPXXmlNode> | null, name: string) =>
  node ? node.children.filter((child) => isNodeNamed(child, name)) : [];

const firstChildNamed = (node: Readonly<HWPXXmlNode> | null, name: string) =>
  childrenNamed(node, name)[0] ?? null;

const descendantsNamed = (
  node: Readonly<HWPXXmlNode>,
  name: string
): Readonly<HWPXXmlNode>[] => {
  const matches: Readonly<HWPXXmlNode>[] = [];

  node.children.forEach((child) => {
    if (isNodeNamed(child, name)) {
      matches.push(child);
    }

    matches.push(...descendantsNamed(child, name));
  });

  return matches;
};

const firstDescendantNamed = (node: Readonly<HWPXXmlNode>, name: string) =>
  descendantsNamed(node, name)[0] ?? null;

const textContent = (node: Readonly<HWPXXmlNode>): string =>
  `${node.text}${node.children.map(textContent).join("")}`;

const attr = (node: Readonly<HWPXXmlNode> | null, name: string) => {
  if (!node) {
    return null;
  }

  return node.attrs[`w:${name}`] ?? node.attrs[name] ?? null;
};

const attrByLocalName = (node: Readonly<HWPXXmlNode> | null, name: string) => {
  if (!node) {
    return null;
  }

  for (const [key, value] of Object.entries(node.attrs)) {
    if (key === name || localName(key) === name) {
      return value;
    }
  }

  return null;
};

const toFiniteNumber = (value: string | null) => {
  if (value === null) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
};

const normalizeInternalTargetEntry = (baseDir: string, target: string) => {
  const normalizedTarget = target.replace(/\\/g, "/").trim();

  if (!normalizedTarget) {
    return null;
  }

  const rawPath = normalizedTarget.startsWith("/")
    ? normalizedTarget.slice(1)
    : `${baseDir}/${normalizedTarget}`;
  const parts: string[] = [];

  rawPath.split("/").forEach((part) => {
    if (!part || part === ".") {
      return;
    }

    if (part === "..") {
      parts.pop();
      return;
    }

    parts.push(part);
  });

  return parts.join("/") || null;
};

const inferMimeTypeFromPath = (path: string | null) => {
  const normalized = path?.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";

  if (normalized.endsWith(".png")) {
    return "image/png";
  }

  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalized.endsWith(".gif")) {
    return "image/gif";
  }

  if (normalized.endsWith(".bmp")) {
    return "image/bmp";
  }

  return null;
};

const fileNameFromPath = (path: string | null) =>
  path?.split(/[\\/]/).pop()?.split("?")[0]?.split("#")[0] || null;

const bytesToBase64 = (bytes: Uint8Array) => {
  let output = "";
  let index = 0;

  for (; index + 2 < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];

    output +=
      BASE64_CHARS[(chunk >> 18) & 63] +
      BASE64_CHARS[(chunk >> 12) & 63] +
      BASE64_CHARS[(chunk >> 6) & 63] +
      BASE64_CHARS[chunk & 63];
  }

  if (index < bytes.length) {
    const secondByteExists = index + 1 < bytes.length;
    const chunk =
      (bytes[index] << 16) | ((secondByteExists ? bytes[index + 1] : 0) << 8);

    output +=
      BASE64_CHARS[(chunk >> 18) & 63] +
      BASE64_CHARS[(chunk >> 12) & 63] +
      (secondByteExists ? BASE64_CHARS[(chunk >> 6) & 63] : "=") +
      "=";
  }

  return output;
};

const createRestoredImageDataURI = (
  mediaEntry: Readonly<DOCXPackageEntry> | undefined,
  mimeType: string | null
) => {
  if (
    !mediaEntry ||
    !mimeType ||
    !DOCX_RESTORABLE_IMAGE_MIME_TYPES.has(mimeType) ||
    mediaEntry.bytes.length > DOCX_MAX_RESTORED_IMAGE_BYTES
  ) {
    return null;
  }

  return `data:${mimeType};base64,${bytesToBase64(mediaEntry.bytes)}`;
};

const toNonNegativeInt = (value: string | null) => {
  const numericValue = toFiniteNumber(value);

  return numericValue !== null && Number.isInteger(numericValue) && numericValue >= 0
    ? numericValue
    : null;
};

const toPositiveInt = (value: string | null) => {
  const numericValue = toFiniteNumber(value);

  return numericValue !== null && Number.isInteger(numericValue) && numericValue > 0
    ? numericValue
    : null;
};

const twipsToPx = (value: number) => Math.round((value / 15) * 100) / 100;

const hasBooleanProperty = (node: Readonly<HWPXXmlNode> | null, name: string) => {
  const child = node ? firstChildNamed(node, name) : null;

  if (!child) {
    return false;
  }

  const value = attr(child, "val");

  return value !== "false" && value !== "0";
};

const normalizeHexColor = (value: string | null) => {
  if (!value || value === "auto") {
    return null;
  }

  return /^#?[0-9a-fA-F]{6}$/.test(value)
    ? `#${value.replace(/^#/, "").toUpperCase()}`
    : null;
};

const pushUnsupportedRunWarning = (
  warnings: DOCXImportWarning[],
  message: string,
  path: string,
  entry = "word/document.xml"
) => {
  warnings.push(
    warning("docx-import-run-unsupported", "warning", message, {
      entry,
      path
    })
  );
};

const mergeMarks = (...markGroups: readonly IRMark[][]) => {
  const merged: IRMark[] = [];

  markGroups.flat().forEach((mark) => {
    const existingIndex = merged.findIndex((item) => item.type === mark.type);

    if (existingIndex < 0) {
      merged.push({ ...mark, attrs: mark.attrs ? { ...mark.attrs } : undefined });
      return;
    }

    const existing = merged[existingIndex];

    merged[existingIndex] = {
      type: existing.type,
      attrs:
        existing.attrs || mark.attrs
          ? {
              ...(existing.attrs ?? {}),
              ...(mark.attrs ?? {})
            }
          : undefined
    };
  });

  return merged.map((mark) =>
    mark.attrs ? mark : { type: mark.type }
  );
};

const getRunMarks = (
  rPr: Readonly<HWPXXmlNode> | null,
  warnings: DOCXImportWarning[],
  path: string,
  entry = "word/document.xml"
): IRMark[] => {
  const marks: IRMark[] = [];
  const textStyleAttrs: Record<string, string | number> = {};
  const runStyleId = attr(firstChildNamed(rPr, "rStyle"), "val");

  if (runStyleId) {
    pushUnsupportedRunWarning(
      warnings,
      `DOCX character style '${runStyleId}' is not imported in S4; direct run formatting was preserved when present.`,
      path,
      entry
    );
  }

  if (hasBooleanProperty(rPr, "b")) marks.push({ type: "bold" });
  if (hasBooleanProperty(rPr, "i")) marks.push({ type: "italic" });
  if (hasBooleanProperty(rPr, "strike")) marks.push({ type: "strike" });

  const underline = rPr ? firstChildNamed(rPr, "u") : null;
  if (underline && attr(underline, "val") !== "none") {
    marks.push({ type: "underline" });
  }

  const color = normalizeHexColor(attr(firstChildNamed(rPr, "color"), "val"));
  if (color) {
    textStyleAttrs.color = color;
  }

  const size = Number(attr(firstChildNamed(rPr, "sz"), "val"));
  if (Number.isFinite(size) && size > 0) {
    textStyleAttrs.fontSize = size / 2;
  }

  const fonts = firstChildNamed(rPr, "rFonts");
  const fontFamily =
    attr(fonts, "ascii") || attr(fonts, "hAnsi") || attr(fonts, "eastAsia");
  if (fontFamily) {
    textStyleAttrs.fontFamily = fontFamily;
  }

  if (Object.keys(textStyleAttrs).length) {
    marks.push({ type: "textStyle", attrs: textStyleAttrs });
  }

  const highlight = attr(firstChildNamed(rPr, "highlight"), "val");
  if (highlight) {
    marks.push({ type: "highlight", attrs: { color: highlight } });
  }

  const vertAlign = attr(firstChildNamed(rPr, "vertAlign"), "val");
  if (vertAlign === "superscript") {
    marks.push({ type: "superscript" });
  } else if (vertAlign === "subscript") {
    marks.push({ type: "subscript" });
  } else if (vertAlign) {
    pushUnsupportedRunWarning(
      warnings,
      `Unsupported DOCX vertical alignment '${vertAlign}' was omitted.`,
      path,
      entry
    );
  }

  return marks;
};

const textRun = (text: string, marks: readonly IRMark[]): IRTextRun => ({
  type: "textRun",
  text,
  marks: [...marks]
});

const hardBreak = (): IRHardBreak => ({ type: "hardBreak" });

const compactAttrs = (attrs: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(attrs).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );

const isSupportedExternalHyperlinkTarget = (target: string) => {
  try {
    const parsed = new URL(target.trim());

    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const createHyperlinkMark = (
  hyperlink: Readonly<HWPXXmlNode>,
  relationshipModel: Readonly<DOCXRelationshipModel>,
  warnings: DOCXImportWarning[],
  path: string
) => {
  const relId = attrByLocalName(hyperlink, "id");
  const anchor = attr(hyperlink, "anchor");
  const relationship = relId ? relationshipModel.byId.get(relId) : null;

  if (
    relationship?.kind === "hyperlink" &&
    relationship.isExternal &&
    isSupportedExternalHyperlinkTarget(relationship.target)
  ) {
    return {
      type: "link",
      attrs: { href: relationship.target }
    } satisfies IRMark;
  }

  warnings.push(
    warning(
      "docx-import-hyperlink-relationship-unsupported",
      "warning",
      relId
        ? `DOCX hyperlink relationship '${relId}' could not be restored; text was preserved.`
        : anchor
          ? `DOCX internal hyperlink anchor '${anchor}' is not restored in import S4; text was preserved.`
          : "DOCX hyperlink without a relationship id is not restored; text was preserved.",
      { entry: "word/document.xml", path }
    )
  );

  return null;
};

const getImageRelationshipId = (node: Readonly<HWPXXmlNode>) => {
  const blip = firstDescendantNamed(node, "blip");
  const imageData = firstDescendantNamed(node, "imagedata");

  return (
    attrByLocalName(blip, "embed") ||
    attrByLocalName(blip, "link") ||
    attrByLocalName(imageData, "id") ||
    attrByLocalName(imageData, "embed")
  );
};

const DOCX_ANCHOR_RELATIVE_FROM_TO_IR: Record<string, IRObjectAnchorMode> = {
  page: "page",
  margin: "page",
  column: "column",
  paragraph: "paragraph",
  line: "paragraph",
  character: "character",
  char: "character"
};

const normalizeDOCXAnchorMode = (value: string | null) =>
  value ? DOCX_ANCHOR_RELATIVE_FROM_TO_IR[value] ?? "unknown" : null;

const childText = (node: Readonly<HWPXXmlNode> | null, name: string) => {
  const child = firstChildNamed(node, name);
  const value = child ? textContent(child).trim() : "";

  return value || null;
};

const childNumber = (node: Readonly<HWPXXmlNode> | null, name: string) =>
  toFiniteNumber(childText(node, name));

const attrNumber = (node: Readonly<HWPXXmlNode> | null, name: string) =>
  toFiniteNumber(attrByLocalName(node, name));

const attrBoolean = (node: Readonly<HWPXXmlNode> | null, name: string) => {
  const value = attrByLocalName(node, name);

  if (value === "1" || value === "true") {
    return true;
  }

  if (value === "0" || value === "false") {
    return false;
  }

  return null;
};

const getDOCXAnchorWrap = (anchor: Readonly<HWPXXmlNode>) => {
  const wrap = anchor.children.find((child) =>
    localName(child.name).startsWith("wrap")
  );

  return {
    wrapType: wrap ? localName(wrap.name) : null,
    wrapText: attrByLocalName(wrap ?? null, "wrapText")
  };
};

const getDrawingPlacement = (node: Readonly<HWPXXmlNode>) => {
  const anchor = firstDescendantNamed(node, "anchor");
  const inline = firstDescendantNamed(node, "inline");

  if (anchor) {
    const positionH = firstChildNamed(anchor, "positionH");
    const positionV = firstChildNamed(anchor, "positionV");
    const simplePos = firstChildNamed(anchor, "simplePos");
    const wrap = getDOCXAnchorWrap(anchor);
    const relativeFromH = attr(positionH, "relativeFrom");
    const relativeFromV = attr(positionV, "relativeFrom");
    const anchorMode =
      normalizeDOCXAnchorMode(relativeFromH) ??
      normalizeDOCXAnchorMode(relativeFromV) ??
      "paragraph";
    const behindDoc = attrByLocalName(anchor, "behindDoc");
    const flowMode: IRObjectFlowMode =
      behindDoc === "1" || behindDoc === "true" ? "behindText" : "floating";

    return {
      drawingType: "anchor",
      flowMode,
      anchorMode,
      relativeFromH,
      relativeFromV,
      positionHOffsetEmu: childNumber(positionH, "posOffset"),
      positionVOffsetEmu: childNumber(positionV, "posOffset"),
      positionHAlign: childText(positionH, "align"),
      positionVAlign: childText(positionV, "align"),
      simplePosXEmu: attrNumber(simplePos, "x"),
      simplePosYEmu: attrNumber(simplePos, "y"),
      wrapType: wrap.wrapType,
      wrapText: wrap.wrapText,
      distanceTopEmu: attrNumber(anchor, "distT"),
      distanceBottomEmu: attrNumber(anchor, "distB"),
      distanceLeftEmu: attrNumber(anchor, "distL"),
      distanceRightEmu: attrNumber(anchor, "distR"),
      relativeHeight: attrNumber(anchor, "relativeHeight"),
      behindDoc: attrBoolean(anchor, "behindDoc"),
      locked: attrBoolean(anchor, "locked"),
      layoutInCell: attrBoolean(anchor, "layoutInCell"),
      allowOverlap: attrBoolean(anchor, "allowOverlap")
    };
  }

  if (inline) {
    return {
      drawingType: "inline",
      flowMode: "inline" as const,
      anchorMode: "inline" as const,
      relativeFromH: null,
      relativeFromV: null,
      positionHOffsetEmu: null,
      positionVOffsetEmu: null,
      positionHAlign: null,
      positionVAlign: null,
      simplePosXEmu: null,
      simplePosYEmu: null,
      wrapType: null,
      wrapText: null,
      distanceTopEmu: null,
      distanceBottomEmu: null,
      distanceLeftEmu: null,
      distanceRightEmu: null,
      relativeHeight: null,
      behindDoc: null,
      locked: null,
      layoutInCell: null,
      allowOverlap: null
    };
  }

  return {
    drawingType: "unknown",
    flowMode: "unknown" as const,
    anchorMode: "unknown" as const,
    relativeFromH: null,
    relativeFromV: null,
    positionHOffsetEmu: null,
    positionVOffsetEmu: null,
    positionHAlign: null,
    positionVAlign: null,
    simplePosXEmu: null,
    simplePosYEmu: null,
    wrapType: null,
    wrapText: null,
    distanceTopEmu: null,
    distanceBottomEmu: null,
    distanceLeftEmu: null,
    distanceRightEmu: null,
    relativeHeight: null,
    behindDoc: null,
    locked: null,
    layoutInCell: null,
    allowOverlap: null
  };
};

const getDrawingContainerType = (node: Readonly<HWPXXmlNode>) => {
  if (firstDescendantNamed(node, "wgp")) {
    return "group";
  }

  if (firstDescendantNamed(node, "wpc")) {
    return "canvas";
  }

  return null;
};

const mapDrawingImageObject = (
  node: Readonly<HWPXXmlNode>,
  relationshipModel: Readonly<DOCXRelationshipModel>,
  entryMap: ReadonlyMap<string, Readonly<DOCXPackageEntry>>,
  warnings: DOCXImportWarning[],
  path: string
): IRObjectBlock | null => {
  const relationshipId = getImageRelationshipId(node);
  const relationship = relationshipId
    ? relationshipModel.byId.get(relationshipId)
    : null;

  if (!relationshipId || relationship?.kind !== "image") {
    warnings.push(
      warning(
        "docx-import-relationship-unsupported",
        "warning",
        relationshipId
          ? `DOCX drawing relationship '${relationshipId}' is not an importable image relationship.`
          : "DOCX drawing image relationship id was not found.",
        { entry: "word/document.xml", path }
      )
    );
    return null;
  }

  const targetPath = relationship.targetEntry ?? relationship.target;
  const mediaEntry = relationship.targetEntry
    ? entryMap.get(relationship.targetEntry)
    : undefined;
  const docPr = firstDescendantNamed(node, "docPr");
  const cNvPr = firstDescendantNamed(node, "cNvPr");
  const extent = firstDescendantNamed(node, "extent");
  const placement = getDrawingPlacement(node);
  const drawingContainerType = getDrawingContainerType(node);
  const fileName = fileNameFromPath(targetPath);
  const mimeType = inferMimeTypeFromPath(targetPath);
  const restoredSrc =
    relationship.isExternal || !relationship.targetEntry || drawingContainerType
      ? null
      : createRestoredImageDataURI(mediaEntry, mimeType);
  const description =
    attrByLocalName(docPr, "descr") || attrByLocalName(cNvPr, "descr");
  const name = attrByLocalName(docPr, "name") || attrByLocalName(cNvPr, "name");

  if (!restoredSrc) {
    warnings.push(
      warning(
        "docx-import-media-metadata-only",
        "warning",
        drawingContainerType
          ? `DOCX ${drawingContainerType} image relationship '${relationshipId}' was imported as metadata only.`
          : `DOCX image relationship '${relationshipId}' was imported as metadata only.`,
        { entry: "word/document.xml", path }
      )
    );
  }

  return {
    type: "object",
    objectType: "image",
    flowMode: placement.flowMode,
    anchorMode: placement.anchorMode,
    attrs: compactAttrs({
      src:
        restoredSrc ||
        (relationship.isExternal ? relationship.target : relationship.targetEntry),
      objectId: `docx-image-${relationshipId}`,
      mediaRelationshipId: relationshipId,
      relationshipTarget: relationship.target,
      relationshipTargetMode: relationship.targetMode,
      relationshipType: relationship.type,
      docxMediaPath: relationship.targetEntry,
      docxDrawingType: placement.drawingType,
      docxDrawingContainerType: drawingContainerType,
      docxAnchorRelativeFromH: placement.relativeFromH,
      docxAnchorRelativeFromV: placement.relativeFromV,
      docxAnchorPositionHOffsetEmu: placement.positionHOffsetEmu,
      docxAnchorPositionVOffsetEmu: placement.positionVOffsetEmu,
      docxAnchorPositionHAlign: placement.positionHAlign,
      docxAnchorPositionVAlign: placement.positionVAlign,
      docxAnchorSimplePosXEmu: placement.simplePosXEmu,
      docxAnchorSimplePosYEmu: placement.simplePosYEmu,
      docxAnchorWrapType: placement.wrapType,
      docxAnchorWrapText: placement.wrapText,
      docxAnchorDistanceTopEmu: placement.distanceTopEmu,
      docxAnchorDistanceBottomEmu: placement.distanceBottomEmu,
      docxAnchorDistanceLeftEmu: placement.distanceLeftEmu,
      docxAnchorDistanceRightEmu: placement.distanceRightEmu,
      docxAnchorRelativeHeight: placement.relativeHeight,
      docxAnchorBehindDoc: placement.behindDoc,
      docxAnchorLocked: placement.locked,
      docxAnchorLayoutInCell: placement.layoutInCell,
      docxAnchorAllowOverlap: placement.allowOverlap,
      fileName,
      mimeType,
      isEmbedded: !relationship.isExternal,
      hasBinaryEntry: Boolean(mediaEntry),
      binaryRestored: Boolean(restoredSrc),
      binarySize: mediaEntry?.bytes.length,
      widthEmu: toFiniteNumber(attrByLocalName(extent, "cx")),
      heightEmu: toFiniteNumber(attrByLocalName(extent, "cy")),
      altText: description || name,
      title: name,
      description
    }),
    children: []
  };
};

const validateDOCXMainNoteReferenceRun = (
  run: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string
) => {
  const references = run.children.filter((child) =>
    ["footnoteReference", "endnoteReference"].includes(localName(child.name))
  );
  if (!references.length) return;

  let valid = run.children.every((child) =>
    ["rPr", "footnoteReference", "endnoteReference"].includes(
      localName(child.name)
    )
  );
  const kinds = new Set(
    references.map((reference) =>
      localName(reference.name) === "footnoteReference" ? "footnote" : "endnote"
    )
  );
  const rPr = firstChildNamed(run, "rPr");

  references.forEach((reference) => {
    if (
      !hasOnlyAttributes(reference, new Set(["id", "customMarkFollows"])) ||
      reference.children.length > 0
    ) {
      valid = false;
    }
  });

  if (rPr) {
    const expectedStyle =
      kinds.size === 1
        ? kinds.has("footnote")
          ? "FootnoteReference"
          : "EndnoteReference"
        : null;
    const seenNames = new Set<string>();
    if (attributeLocalNames(rPr).length > 0) valid = false;
    rPr.children.forEach((property) => {
      const name = localName(property.name);
      const supported =
        (name === "rStyle" &&
          expectedStyle !== null &&
          attr(property, "val") === expectedStyle) ||
        (name === "vertAlign" && attr(property, "val") === "superscript");
      if (
        !supported ||
        seenNames.has(name) ||
        !hasOnlyAttributes(property, new Set(["val"])) ||
        property.children.length > 0
      ) {
        valid = false;
      }
      seenNames.add(name);
    });
  }

  if (!valid) {
    warnings.push(
      warning(
        "docx-import-note-pair-invalid",
        "error",
        "DOCX note reference run contains unsupported content or formatting.",
        { entry: "word/document.xml", path }
      )
    );
  }
};

const mapRun = (
  run: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string,
  inheritedMarks: readonly IRMark[] = [],
  relationshipModel: Readonly<DOCXRelationshipModel> = EMPTY_RELATIONSHIP_MODEL,
  entryMap: ReadonlyMap<string, Readonly<DOCXPackageEntry>> = new Map(),
  mediaObjects: IRObjectBlock[] = [],
  nativeNotes: ReadonlyMap<string, IRNoteBody> = new Map()
): IRInlineNode[] => {
  if (
    run.children.some((child) =>
      ["footnoteRef", "endnoteRef"].includes(localName(child.name))
    )
  ) {
    return [];
  }

  validateDOCXMainNoteReferenceRun(run, warnings, path);
  const rPr = firstChildNamed(run, "rPr");
  const hasNativeNoteReference = run.children.some((child) =>
    ["footnoteReference", "endnoteReference"].includes(localName(child.name))
  );
  const marks = hasNativeNoteReference
    ? mergeMarks([...inheritedMarks])
    : mergeMarks([...inheritedMarks], getRunMarks(rPr, warnings, path));
  const inlineNodes: IRInlineNode[] = [];

  run.children.forEach((child, childIndex) => {
    const childPath = `${path}.children[${childIndex}]`;

    switch (localName(child.name)) {
      case "rPr":
        break;
      case "t":
        if (child.text) {
          inlineNodes.push(textRun(child.text, marks));
        }
        break;
      case "br":
        inlineNodes.push(hardBreak());
        break;
      case "footnoteReference":
      case "endnoteReference": {
        const kind: IRNoteKind = localName(child.name) === "footnoteReference" ? "footnote" : "endnote";
        const id = attr(child, "id");
        const body = id ? nativeNotes.get(`${kind}:${id}`) : null;
        if (!body || isTruthyOOXMLValue(attr(child, "customMarkFollows"))) {
          warnings.push(warning("docx-import-note-pair-invalid", "error", `DOCX ${kind} reference is invalid, custom-marked, or has no normal body.`, { entry: "word/document.xml", path: childPath }));
        } else {
          inlineNodes.push({ type: "noteReference", noteId: body.noteId, kind });
        }
        break;
      }
      case "tab":
        inlineNodes.push(textRun("\t", marks));
        pushUnsupportedRunWarning(
          warnings,
          "DOCX tab was imported as a literal tab character.",
          childPath
        );
        break;
      case "drawing": {
        const objectBlock = mapDrawingImageObject(
          child,
          relationshipModel,
          entryMap,
          warnings,
          childPath
        );

        if (objectBlock) {
          mediaObjects.push(objectBlock);
        }
        break;
      }
      case "pict":
        pushUnsupportedRunWarning(
          warnings,
          "DOCX pict run content is not imported in S4.",
          childPath
        );
        break;
      default:
        if (textContent(child)) {
          inlineNodes.push(textRun(textContent(child), marks));
          pushUnsupportedRunWarning(
            warnings,
            `DOCX run child '${localName(child.name)}' was flattened to text.`,
            childPath
          );
        }
    }
  });

  return inlineNodes;
};

const mapHyperlink = (
  hyperlink: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string,
  inheritedMarks: readonly IRMark[] = [],
  relationshipModel: Readonly<DOCXRelationshipModel> = EMPTY_RELATIONSHIP_MODEL,
  entryMap: ReadonlyMap<string, Readonly<DOCXPackageEntry>> = new Map(),
  mediaObjects: IRObjectBlock[] = []
): IRInlineNode[] => {
  const linkMark = createHyperlinkMark(
    hyperlink,
    relationshipModel,
    warnings,
    path
  );
  const marks = linkMark
    ? mergeMarks([...inheritedMarks], [linkMark])
    : inheritedMarks;

  return hyperlink.children.flatMap((child, childIndex) =>
    isNodeNamed(child, "r")
      ? mapRun(
          child,
          warnings,
          `${path}.children[${childIndex}]`,
          marks,
          relationshipModel,
          entryMap,
          mediaObjects
        )
      : textContent(child)
        ? [textRun(textContent(child), marks)]
        : []
  );
};

const getParagraphStyle = (pPr: Readonly<HWPXXmlNode> | null) =>
  attr(firstChildNamed(pPr, "pStyle"), "val");

const getParagraphNumbering = (
  pPr: Readonly<HWPXXmlNode> | null
): DOCXParagraphNumbering | null => {
  const numPr = firstChildNamed(pPr, "numPr");
  const numId = attr(firstChildNamed(numPr, "numId"), "val");

  if (!numId) {
    return null;
  }

  return {
    numId,
    level: toNonNegativeInt(attr(firstChildNamed(numPr, "ilvl"), "val")) ?? 0
  };
};

const getHeadingLevel = (styleId: string | null) => {
  const match = /^Heading([1-6])$/i.exec(styleId ?? "");

  return match ? Number(match[1]) : null;
};

const getHeadingLevelFromName = (name: string | null) => {
  const match = /^heading\s*([1-6])$/i.exec(name ?? "");

  return match ? Number(match[1]) : null;
};

const getHeadingLevelFromOutline = (pPr: Readonly<HWPXXmlNode> | null) => {
  const rawValue = attr(firstChildNamed(pPr, "outlineLvl"), "val");

  if (rawValue === null) {
    return null;
  }

  const value = Number(rawValue);

  return Number.isInteger(value) && value >= 0 && value <= 5 ? value + 1 : null;
};

const getParagraphTabStops = (
  pPr: Readonly<HWPXXmlNode> | null
): readonly Readonly<IRDOCXParagraphTabStop>[] => {
  const tabs = firstChildNamed(pPr, "tabs");

  if (!tabs) {
    return [];
  }

  return freezeArray(
    childrenNamed(tabs, "tab").flatMap((tab) => {
      const type = attr(tab, "val");
      const positionTwips = toNonNegativeInt(attr(tab, "pos"));

      if (type === "clear" || positionTwips === null) {
        return [];
      }

      return [
        Object.freeze({
          positionTwips,
          type: type ?? null,
          leader: attr(tab, "leader")
        })
      ];
    })
  );
};

const getParagraphStyleAttrs = (
  pPr: Readonly<HWPXXmlNode> | null
): Partial<IRParagraphBlock["attrs"]> => {
  const textAlign = attr(firstChildNamed(pPr, "jc"), "val");
  const spacing = firstChildNamed(pPr, "spacing");
  const attrs: Partial<IRParagraphBlock["attrs"]> = {};

  if (textAlign) {
    attrs.textAlign = textAlign;
  }

  const spacingBefore = toFiniteNumber(attr(spacing, "before"));
  const spacingAfter = toFiniteNumber(attr(spacing, "after"));
  const spacingLine = toFiniteNumber(attr(spacing, "line"));
  const spacingLineRule = attr(spacing, "lineRule");

  if (spacingBefore !== null) {
    attrs.docxParagraphSpacingBefore = spacingBefore;
  }

  if (spacingAfter !== null) {
    attrs.docxParagraphSpacingAfter = spacingAfter;
  }

  if (spacingLine !== null) {
    attrs.docxParagraphSpacingLine = spacingLine;
  }

  if (spacingLineRule) {
    attrs.docxParagraphSpacingLineRule = spacingLineRule;
  }

  const tabStops = getParagraphTabStops(pPr);

  if (tabStops.length > 0) {
    attrs.docxParagraphTabs = tabStops;
  }

  return attrs;
};

const getMergedParagraphSpacingAttrs = (
  directAttrs: Partial<IRParagraphBlock["attrs"]>,
  styleAttrs: Partial<IRParagraphBlock["attrs"]>
): Partial<IRParagraphBlock["attrs"]> => {
  const attrs: Partial<IRParagraphBlock["attrs"]> = {};
  const spacingBefore =
    directAttrs.docxParagraphSpacingBefore ??
    styleAttrs.docxParagraphSpacingBefore;
  const spacingAfter =
    directAttrs.docxParagraphSpacingAfter ?? styleAttrs.docxParagraphSpacingAfter;
  const spacingLine =
    directAttrs.docxParagraphSpacingLine ?? styleAttrs.docxParagraphSpacingLine;
  const spacingLineRule =
    directAttrs.docxParagraphSpacingLineRule ??
    styleAttrs.docxParagraphSpacingLineRule;

  if (spacingBefore !== null && spacingBefore !== undefined) {
    attrs.docxParagraphSpacingBefore = spacingBefore;
  }

  if (spacingAfter !== null && spacingAfter !== undefined) {
    attrs.docxParagraphSpacingAfter = spacingAfter;
  }

  if (spacingLine !== null && spacingLine !== undefined) {
    attrs.docxParagraphSpacingLine = spacingLine;
  }

  if (spacingLineRule) {
    attrs.docxParagraphSpacingLineRule = spacingLineRule;
  }

  return attrs;
};

const getMergedParagraphTabsAttrs = (
  directAttrs: Partial<IRParagraphBlock["attrs"]>,
  styleAttrs: Partial<IRParagraphBlock["attrs"]>
): Partial<IRParagraphBlock["attrs"]> => {
  const attrs: Partial<IRParagraphBlock["attrs"]> = {};
  const tabStops = directAttrs.docxParagraphTabs ?? styleAttrs.docxParagraphTabs;

  if (tabStops && tabStops.length > 0) {
    attrs.docxParagraphTabs = tabStops;
  }

  return attrs;
};

const getParagraphAttrs = (
  pPr: Readonly<HWPXXmlNode> | null,
  styleAttrs: Partial<IRParagraphBlock["attrs"]> = {}
) => {
  const directAttrs = getParagraphStyleAttrs(pPr);

  return {
    textAlign: directAttrs.textAlign ?? styleAttrs.textAlign ?? null,
    lineHeight: null,
    fontSize: null,
    indent: null,
    indentLevel: null,
    wordBreak: null,
    ...getMergedParagraphSpacingAttrs(directAttrs, styleAttrs),
    ...getMergedParagraphTabsAttrs(directAttrs, styleAttrs)
  };
};

const hasParagraphSpacingMetadata = (
  attrs: Partial<IRParagraphBlock["attrs"]>
) =>
  (attrs.docxParagraphSpacingBefore !== null &&
    attrs.docxParagraphSpacingBefore !== undefined) ||
  (attrs.docxParagraphSpacingAfter !== null &&
    attrs.docxParagraphSpacingAfter !== undefined) ||
  (attrs.docxParagraphSpacingLine !== null &&
    attrs.docxParagraphSpacingLine !== undefined) ||
  Boolean(attrs.docxParagraphSpacingLineRule);

const hasParagraphStyleMetadata = (attrs: Partial<IRParagraphBlock["attrs"]>) =>
  Boolean(attrs.docxParagraphStyleId || attrs.docxParagraphStyleName);

const hasParagraphTabsMetadata = (attrs: Partial<IRParagraphBlock["attrs"]>) =>
  Boolean(attrs.docxParagraphTabs?.length);

const getParagraphPartialWarningMessage = (
  attrs: Partial<IRParagraphBlock["attrs"]>,
  options: { warnOnStyleMetadata?: boolean } = {}
) => {
  const preservesSpacing = hasParagraphSpacingMetadata(attrs);
  const preservesStyle =
    options.warnOnStyleMetadata !== false &&
    hasParagraphStyleMetadata(attrs);
  const preservesTabs = hasParagraphTabsMetadata(attrs);

  if (!preservesTabs) {
    if (preservesSpacing && preservesStyle) {
      return "DOCX paragraph spacing and style id/name metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve both, supported before/after spacing, auto line spacing, and exact line spacing render in the editor; before/after spacing and auto line spacing roundtrip through HWPX paraPr margins/lineSpacing, unsupported exact/atLeast native HWPX line-spacing is warning-backed, but atLeast editor rendering, style class rendering, and full style property/class semantics are not enabled.";
    }

    if (preservesStyle) {
      return "DOCX paragraph style id/name metadata was preserved and is re-exported by DOCX minimal export; editor attrs preserve it, but style class rendering, HWPX/non-DOCX export behavior, and full style property/class semantics are not enabled.";
    }

    return "DOCX paragraph spacing metadata was preserved and is re-exported by DOCX minimal export; editor attrs preserve it, supported before/after spacing, auto line spacing, and exact line spacing render in the editor; before/after spacing and auto line spacing roundtrip through HWPX paraPr margins/lineSpacing, unsupported exact/atLeast native HWPX line-spacing is warning-backed, but atLeast editor rendering and other non-DOCX behavior are not enabled.";
  }

  if (!preservesSpacing && !preservesStyle) {
    return "DOCX paragraph tabs metadata was preserved and is re-exported by DOCX minimal export; editor attrs preserve it, but Word tab-stop rendering/navigation and HWPX/non-DOCX behavior are not enabled.";
  }

  if (preservesSpacing && preservesStyle) {
    return "DOCX paragraph spacing, tabs, and style id/name metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve them, supported before/after spacing, auto line spacing, and exact line spacing render in the editor; before/after spacing and auto line spacing roundtrip through HWPX paraPr margins/lineSpacing, unsupported exact/atLeast native HWPX line-spacing is warning-backed, but atLeast editor rendering, Word tab-stop rendering/navigation, and full style property/class semantics are not enabled.";
  }

  if (preservesSpacing) {
    return "DOCX paragraph spacing and tabs metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve them, supported before/after spacing, auto line spacing, and exact line spacing render in the editor; before/after spacing and auto line spacing roundtrip through HWPX paraPr margins/lineSpacing, unsupported exact/atLeast native HWPX line-spacing is warning-backed, but atLeast editor rendering, Word tab-stop rendering/navigation, and other non-DOCX behavior are not enabled.";
  }

  return "DOCX paragraph tabs and style id/name metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve them, but Word tab-stop rendering/navigation, HWPX/non-DOCX export behavior, and full style property/class semantics are not enabled.";
};

const parseParagraphStyle = (
  style: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string
): Readonly<DOCXParagraphStyle> | null => {
  if (attr(style, "type") !== "paragraph") {
    return null;
  }

  const styleId = attr(style, "styleId");

  if (!styleId) {
    warnings.push(
      warning(
        "docx-import-style-unsupported",
        "warning",
        "DOCX paragraph style without styleId was skipped.",
        { entry: "word/styles.xml", path }
      )
    );
    return null;
  }

  const name = attr(firstChildNamed(style, "name"), "val");
  const pPr = firstChildNamed(style, "pPr");

  return Object.freeze({
    styleId,
    name,
    basedOn: attr(firstChildNamed(style, "basedOn"), "val"),
    headingLevel:
      getHeadingLevel(styleId) ||
      getHeadingLevelFromName(name) ||
      getHeadingLevelFromOutline(pPr),
    attrs: getParagraphStyleAttrs(pPr),
    marks: freezeArray(
      getRunMarks(
        firstChildNamed(style, "rPr"),
        warnings,
        `styles.style[${styleId}].rPr`,
        "word/styles.xml"
      )
    )
  });
};

const parseDOCXStyles = (
  stylesXml: string | null,
  warnings: DOCXImportWarning[]
): Readonly<DOCXStyleModel> => {
  if (!stylesXml) {
    return EMPTY_STYLE_MODEL;
  }

  const parsed = parseHWPXXml(stylesXml);

  parsed.warnings.forEach((message) => {
    warnings.push(
      warning("docx-import-xml-warning", "warning", message, {
        entry: "word/styles.xml"
      })
    );
  });

  const stylesNode = firstDescendantNamed(parsed.root, "styles");
  const paragraphStyles = new Map<string, Readonly<DOCXParagraphStyle>>();

  stylesNode?.children.forEach((style, index) => {
    if (!isNodeNamed(style, "style")) {
      return;
    }

    const parsedStyle = parseParagraphStyle(
      style,
      warnings,
      `word/styles.xml.styles.children[${index}]`
    );

    if (parsedStyle) {
      paragraphStyles.set(parsedStyle.styleId, parsedStyle);
    }
  });

  return Object.freeze({
    paragraphStyles
  });
};

const getRelationshipKind = (type: string): DOCXDocumentRelationshipKind => {
  const normalized = type.trim();

  if (normalized === `${DOCX_REL_TYPE_PREFIX}hyperlink`) {
    return "hyperlink";
  }

  if (normalized === `${DOCX_REL_TYPE_PREFIX}image`) {
    return "image";
  }

  if (normalized === `${DOCX_REL_TYPE_PREFIX}styles`) {
    return "styles";
  }

  if (normalized === `${DOCX_REL_TYPE_PREFIX}numbering`) {
    return "numbering";
  }
  if (normalized === `${DOCX_REL_TYPE_PREFIX}footnotes`) return "footnotes";
  if (normalized === `${DOCX_REL_TYPE_PREFIX}endnotes`) return "endnotes";

  return "other";
};

const parseDOCXDocumentRelationships = (
  relsXml: string | null,
  warnings: DOCXImportWarning[],
  options: {
    relationshipEntry?: string;
    sourcePartEntry?: string;
    strictNoteRelationships?: boolean;
  } = {}
): Readonly<DOCXRelationshipModel> => {
  if (!relsXml) {
    return EMPTY_RELATIONSHIP_MODEL;
  }

  const relationshipEntry =
    options.relationshipEntry ?? "word/_rels/document.xml.rels";
  const sourcePartEntry = options.sourcePartEntry ?? "word/document.xml";
  const sourcePartSlash = sourcePartEntry.lastIndexOf("/");
  const sourcePartDir =
    sourcePartSlash >= 0 ? sourcePartEntry.slice(0, sourcePartSlash) : "";
  const parsed = parseHWPXXml(relsXml);
  const containsNativeNoteRelationship = ["footnotes", "endnotes"].some(
    (kind) => relsXml.includes(`${DOCX_REL_TYPE_PREFIX}${kind}`)
  );

  parsed.warnings.forEach((message) => {
    warnings.push(
      options.strictNoteRelationships
        ? warning(
            "docx-import-note-hyperlink-unsupported",
            "error",
            `DOCX note relationship XML is invalid: ${message}`,
            { entry: relationshipEntry }
          )
        : containsNativeNoteRelationship
          ? warning(
              "docx-import-note-part-invalid",
              "error",
              `DOCX native note relationship XML is invalid: ${message}`,
              { entry: relationshipEntry }
            )
          : warning("docx-import-xml-warning", "warning", message, {
              entry: relationshipEntry
            })
    );
  });

  const relationshipsNode = firstDescendantNamed(parsed.root, "Relationships");
  const byId = new Map<string, Readonly<DOCXDocumentRelationship>>();

  if (!relationshipsNode && options.strictNoteRelationships) {
    warnings.push(
      warning(
        "docx-import-note-hyperlink-unsupported",
        "error",
        "DOCX note relationship part has no Relationships root.",
        { entry: relationshipEntry }
      )
    );
  }

  relationshipsNode?.children.forEach((relationship, index) => {
    if (!isNodeNamed(relationship, "Relationship")) {
      if (options.strictNoteRelationships) {
        warnings.push(
          warning(
            "docx-import-note-hyperlink-unsupported",
            "error",
            `DOCX note relationship child '${localName(relationship.name)}' is unsupported.`,
            {
              entry: relationshipEntry,
              path: `${relationshipEntry}.Relationships.children[${index}]`
            }
          )
        );
      }
      return;
    }

    const path = `${relationshipEntry}.Relationships.children[${index}]`;
    const id = attrByLocalName(relationship, "Id");
    const type = attrByLocalName(relationship, "Type");
    const target = attrByLocalName(relationship, "Target");
    const targetMode = attrByLocalName(relationship, "TargetMode");
    const kind = type ? getRelationshipKind(type) : "other";
    const existingKind = id ? byId.get(id)?.kind : null;

    if (!id || !type || !target) {
      warnings.push(
        options.strictNoteRelationships || kind === "footnotes" || kind === "endnotes"
          ? warning(
              options.strictNoteRelationships
                ? "docx-import-note-hyperlink-unsupported"
                : "docx-import-note-part-invalid",
              "error",
              "DOCX native note relationship without Id, Type, or Target was rejected.",
              { entry: relationshipEntry, path }
            )
          : warning(
              "docx-import-relationship-unsupported",
              "warning",
              "DOCX relationship without Id, Type, or Target was skipped.",
              { entry: relationshipEntry, path }
            )
      );
      return;
    }

    if (
      (options.strictNoteRelationships ||
        kind === "footnotes" ||
        kind === "endnotes") &&
      !hasOnlyAttributes(
        relationship,
        new Set(["Id", "Type", "Target", "TargetMode"])
      )
    ) {
      warnings.push(
        warning(
          options.strictNoteRelationships
            ? "docx-import-note-hyperlink-unsupported"
            : "docx-import-note-part-invalid",
          "error",
          `DOCX native note relationship '${id}' has unsupported attributes.`,
          { entry: relationshipEntry, path }
        )
      );
      return;
    }

    if (options.strictNoteRelationships && relationship.children.length > 0) {
      warnings.push(
        warning(
          "docx-import-note-hyperlink-unsupported",
          "error",
          `DOCX note relationship '${id}' has unsupported child content.`,
          { entry: relationshipEntry, path }
        )
      );
      return;
    }

    if (byId.has(id)) {
      warnings.push(
        options.strictNoteRelationships ||
          kind === "footnotes" ||
          kind === "endnotes" ||
          existingKind === "footnotes" ||
          existingKind === "endnotes"
          ? warning(
              options.strictNoteRelationships
                ? "docx-import-note-hyperlink-unsupported"
                : "docx-import-note-part-invalid",
              "error",
              `DOCX native note relationship id '${id}' is duplicated.`,
              { entry: relationshipEntry, path }
            )
          : warning(
              "docx-import-relationship-unsupported",
              "warning",
              `DOCX relationship id '${id}' is duplicated; the later entry was ignored.`,
              { entry: relationshipEntry, path }
            )
      );
      return;
    }

    const isExternal = targetMode === "External";
    const targetEntry = isExternal
      ? null
      : normalizeInternalTargetEntry(sourcePartDir, target);

    byId.set(
      id,
      Object.freeze({
        id,
        type,
        kind,
        target,
        targetMode,
        isExternal,
        targetEntry
      })
    );
  });

  return Object.freeze({
    byId
  });
};

const getListTypeFromNumFormat = (numFormat: string | null) => {
  if (numFormat === "bullet") {
    return "bullet";
  }

  if (
    numFormat === "decimal" ||
    numFormat === "lowerLetter" ||
    numFormat === "upperLetter" ||
    numFormat === "lowerRoman" ||
    numFormat === "upperRoman"
  ) {
    return "ordered";
  }

  return "unknown";
};

const parseDOCXNumbering = (
  numberingXml: string | null,
  warnings: DOCXImportWarning[]
): Readonly<DOCXNumberingModel> => {
  if (!numberingXml) {
    return EMPTY_NUMBERING_MODEL;
  }

  const parsed = parseHWPXXml(numberingXml);

  parsed.warnings.forEach((message) => {
    warnings.push(
      warning("docx-import-xml-warning", "warning", message, {
        entry: "word/numbering.xml"
      })
    );
  });

  const numberingNode = firstDescendantNamed(parsed.root, "numbering");
  const abstractDefinitions = new Map<
    string,
    {
      listType: IRListBlock["listType"];
      start: number | null;
      level: number;
      numFormat: string | null;
      unsupported: string[];
    }
  >();
  const byNumId = new Map<string, Readonly<DOCXNumberingDefinition>>();

  childrenNamed(numberingNode, "abstractNum").forEach((abstractNum, index) => {
    const abstractNumId = attr(abstractNum, "abstractNumId");
    const levels = childrenNamed(abstractNum, "lvl");
    const lvl =
      levels.find((levelNode) => toNonNegativeInt(attr(levelNode, "ilvl")) === 0) ??
      levels[0] ??
      null;
    const level = toNonNegativeInt(attr(lvl, "ilvl")) ?? 0;
    const numFormat = attr(firstChildNamed(lvl, "numFmt"), "val");
    const start = toPositiveInt(attr(firstChildNamed(lvl, "start"), "val")) ?? null;
    const listType = getListTypeFromNumFormat(numFormat);
    const unsupported: string[] = [];

    if (!abstractNumId || !lvl) {
      warnings.push(
        warning(
          "docx-import-numbering-unsupported",
          "warning",
          "DOCX abstract numbering definition without id or level was skipped.",
          {
            entry: "word/numbering.xml",
            path: `word/numbering.xml.numbering.abstractNum[${index}]`
          }
        )
      );
      return;
    }

    if (level !== 0) {
      unsupported.push("non-zero list level");
    }

    if (listType === "unknown") {
      unsupported.push(`unsupported numFmt '${numFormat ?? ""}'`);
    }

    abstractDefinitions.set(abstractNumId, {
      listType,
      start,
      level,
      numFormat,
      unsupported
    });
  });

  childrenNamed(numberingNode, "num").forEach((num, index) => {
    const numId = attr(num, "numId");
    const abstractNumId = attr(firstChildNamed(num, "abstractNumId"), "val");
    const base = abstractNumId ? abstractDefinitions.get(abstractNumId) : null;

    if (!numId || !base) {
      warnings.push(
        warning(
          "docx-import-numbering-unsupported",
          "warning",
          "DOCX numbering instance without a supported abstract definition was skipped.",
          {
            entry: "word/numbering.xml",
            path: `word/numbering.xml.numbering.num[${index}]`
          }
        )
      );
      return;
    }

    const startOverride = childrenNamed(num, "lvlOverride")
      .filter(
        (override) => (toNonNegativeInt(attr(override, "ilvl")) ?? 0) === 0
      )
      .map((override) => firstChildNamed(override, "startOverride"))
      .map((startNode) => toPositiveInt(attr(startNode, "val")))
      .find((value): value is number => value !== null);

    byNumId.set(
      numId,
      Object.freeze({
        numId,
        abstractNumId,
        listType: base.listType,
        start: startOverride ?? base.start,
        level: base.level,
        numFormat: base.numFormat,
        unsupported: freezeArray(base.unsupported)
      })
    );
  });

  return Object.freeze({
    byNumId
  });
};

const resolveParagraphStyle = (
  styleId: string | null,
  styleModel: Readonly<DOCXStyleModel>,
  warnings: DOCXImportWarning[],
  path: string,
  visited = new Set<string>()
): Readonly<DOCXResolvedParagraphStyle> => {
  const directHeadingLevel = getHeadingLevel(styleId);

  if (!styleId) {
    return Object.freeze({
      styleId: null,
      name: null,
      headingLevel: null,
      attrs: {},
      marks: []
    });
  }

  const style = styleModel.paragraphStyles.get(styleId);

  if (!style) {
    if (!directHeadingLevel) {
      warnings.push(
        warning(
          "docx-import-style-unsupported",
          "warning",
          `DOCX paragraph style '${styleId}' was not found; direct paragraph formatting was used.`,
          { entry: "word/document.xml", path }
        )
      );
    }

    return Object.freeze({
      styleId,
      name: null,
      headingLevel: directHeadingLevel,
      attrs: {},
      marks: []
    });
  }

  if (visited.has(styleId)) {
    warnings.push(
      warning(
        "docx-import-style-unsupported",
        "warning",
        `DOCX paragraph style cycle was ignored at '${styleId}'.`,
        { entry: "word/styles.xml", path }
      )
    );

    return Object.freeze({
      styleId,
      name: style.name,
      headingLevel: style.headingLevel ?? directHeadingLevel,
      attrs: style.attrs,
      marks: [...style.marks]
    });
  }

  visited.add(styleId);

  const base = resolveParagraphStyle(
    style.basedOn,
    styleModel,
    warnings,
    path,
    visited
  );

  visited.delete(styleId);

  return Object.freeze({
    styleId,
    name: style.name,
    headingLevel: style.headingLevel ?? base.headingLevel ?? directHeadingLevel,
    attrs: {
      ...base.attrs,
      ...style.attrs
    },
    marks: mergeMarks([...base.marks], [...style.marks])
  });
};

const mapParagraph = (
  paragraph: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string,
  styleModel: Readonly<DOCXStyleModel>,
  relationshipModel: Readonly<DOCXRelationshipModel>,
  entryMap: ReadonlyMap<string, Readonly<DOCXPackageEntry>>,
  options: {
    warnOnNumbering?: boolean;
    nativeNotes?: ReadonlyMap<string, IRNoteBody>;
    preserveEmpty?: boolean;
    omitParagraphStyleMetadata?: boolean;
    ignoreResolvedStyleAttrs?: boolean;
    ignoreResolvedStyleMarks?: boolean;
  } = {}
): IRBlock[] => {
  const pPr = firstChildNamed(paragraph, "pPr");
  const styleId = getParagraphStyle(pPr);
  const resolvedStyle = resolveParagraphStyle(styleId, styleModel, warnings, path);
  const headingLevel = resolvedStyle.headingLevel;
  const mediaObjects: IRObjectBlock[] = [];
  const paragraphAttrs = getParagraphAttrs(
    pPr,
    options.ignoreResolvedStyleAttrs ? {} : resolvedStyle.attrs
  );
  const paragraphStyleAttrs: Partial<IRParagraphBlock["attrs"]> =
    styleId && !options.omitParagraphStyleMetadata
      ? {
          docxParagraphStyleId: styleId,
          ...(resolvedStyle.name
            ? { docxParagraphStyleName: resolvedStyle.name }
            : {})
        }
      : {};
  const textAttrs: Partial<IRParagraphBlock["attrs"]> = {
    ...paragraphAttrs,
    ...paragraphStyleAttrs
  };

  if (
    options.warnOnNumbering !== false &&
    firstDescendantNamed(pPr ?? paragraph, "numPr")
  ) {
    warnings.push(
      warning(
        "docx-import-numbering-unsupported",
        "warning",
        "DOCX numbering is not restored in import S4; paragraph text was preserved.",
        { entry: "word/document.xml", path }
      )
    );
  }
  if (firstChildNamed(pPr, "sectPr")) {
    warnings.push(
      warning(
        "docx-import-section-properties-partial",
        "warning",
        "DOCX paragraph-level section properties are not restored in import S4; default page settings were used.",
        { entry: "word/document.xml", path }
      )
    );
  }

  const runs = paragraph.children.flatMap((child, childIndex) => {
    const childPath = `${path}.children[${childIndex}]`;

    if (isNodeNamed(child, "r")) {
      return mapRun(
        child,
        warnings,
        childPath,
        options.ignoreResolvedStyleMarks ? [] : resolvedStyle.marks,
        relationshipModel,
        entryMap,
        mediaObjects,
        options.nativeNotes
      );
    }

    if (isNodeNamed(child, "hyperlink")) {
      return mapHyperlink(
        child,
        warnings,
        childPath,
        options.ignoreResolvedStyleMarks ? [] : resolvedStyle.marks,
        relationshipModel,
        entryMap,
        mediaObjects
      );
    }

    return [];
  });

  const textBlock: IRBlock = headingLevel
    ? {
        type: "heading",
        attrs: {
          ...getParagraphAttrs(pPr),
          ...textAttrs,
          level: headingLevel,
          headingId: null
        },
        runs
      }
    : {
        type: "paragraph",
        attrs: textAttrs,
        runs
      } satisfies IRParagraphBlock;

  const warnOnParagraphStyleMetadata =
    !headingLevel && hasParagraphStyleMetadata(textAttrs);

  if (
    hasParagraphSpacingMetadata(textAttrs) ||
    hasParagraphTabsMetadata(textAttrs) ||
    warnOnParagraphStyleMetadata
  ) {
    warnings.push(
      warning(
        "docx-import-paragraph-partial",
        "warning",
        getParagraphPartialWarningMessage(textAttrs, {
          warnOnStyleMetadata: warnOnParagraphStyleMetadata
        }),
        { entry: "word/document.xml", path }
      )
    );
  }

  return runs.length || options.preserveEmpty
    ? [textBlock, ...mediaObjects]
    : [...mediaObjects];
};

const mapUnsupportedBlock = (
  node: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string
): IRBlock => {
  const nodeType = `docx-${localName(node.name)}`;
  const rawText = textContent(node);

  warnings.push(
    warning(
      "docx-import-unsupported-block",
      "warning",
      `DOCX block '${localName(node.name)}' is not imported in S4; raw text was preserved.`,
      { entry: "word/document.xml", path }
    )
  );

  return {
    type: "unsupported",
    nodeType,
    attrs: {},
    raw: {
      type: node.name,
      textContent: rawText
    }
  };
};

const DOCX_BORDER_STYLE_TO_IR: Record<string, string> = {
  single: "solid",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
  nil: "none",
  none: "none"
};

const readDOCXBorderAttrs = (
  borderContainer: Readonly<HWPXXmlNode> | null
) => {
  const border = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => firstChildNamed(borderContainer, side))
    .find((side) => side && attr(side, "val") !== "nil" && attr(side, "val") !== "none");

  if (!border) {
    return {};
  }

  const styleValue = attr(border, "val");
  const color = normalizeHexColor(attr(border, "color"));
  const width = toFiniteNumber(attr(border, "sz"));

  return compactAttrs({
    borderColor: color,
    borderStyle: styleValue ? DOCX_BORDER_STYLE_TO_IR[styleValue] ?? styleValue : null,
    borderWidth: width !== null ? width / 8 : null
  });
};

type DOCXVerticalMergeState = "restart" | "continue" | null;

const readDOCXCellColspan = (tcPr: Readonly<HWPXXmlNode> | null) =>
  toPositiveInt(attr(firstChildNamed(tcPr, "gridSpan"), "val")) ?? 1;

const readDOCXVerticalMergeState = (
  tcPr: Readonly<HWPXXmlNode> | null
): DOCXVerticalMergeState => {
  const vMerge = firstChildNamed(tcPr, "vMerge");

  if (!vMerge) {
    return null;
  }

  return attr(vMerge, "val") === "restart" ? "restart" : "continue";
};

const readDOCXDXAWidthPx = (node: Readonly<HWPXXmlNode> | null) => {
  const width = toFiniteNumber(attr(node, "w"));
  const type = attr(node, "type");

  if (width === null || width <= 0) {
    return null;
  }

  return !type || type === "dxa" ? twipsToPx(width) : null;
};

const readDOCXWidthSpec = (
  node: Readonly<HWPXXmlNode> | null
): { type: string | null; value: number | null } => {
  const type = attr(node, "type");
  const value = toFiniteNumber(attr(node, "w"));

  return { type, value };
};

const readDOCXMarginAttrs = (
  node: Readonly<HWPXXmlNode> | null,
  prefix: string
): Record<string, unknown> =>
  (["top", "bottom", "left", "right"] as const).reduce<Record<string, unknown>>(
    (marginAttrs, side) => {
      const sideNode = firstChildNamed(node, side);
      const key = `${prefix}${side.charAt(0).toUpperCase()}${side.slice(1)}`;
      const value = toFiniteNumber(attr(sideNode, "w"));
      const type = attr(sideNode, "type");

      return {
        ...marginAttrs,
        ...compactAttrs({
          [key]: value,
          [`${key}Type`]: type
        })
      } as Record<string, unknown>;
    },
    {}
  );

const hasDOCXCellLayoutAttrs = (attrs: Readonly<IRTableCell["attrs"]>) =>
  [
    "docxCellMarginTop",
    "docxCellMarginBottom",
    "docxCellMarginLeft",
    "docxCellMarginRight",
    "docxCellNoWrap"
  ].some((key) => Object.prototype.hasOwnProperty.call(attrs, key));

const hasDOCXCellTextDirection = (tcPr: Readonly<HWPXXmlNode> | null) =>
  Boolean(attr(firstChildNamed(tcPr, "textDirection"), "val"));

const hasDOCXTableCellLayoutAttrs = (attrs: Record<string, unknown>) =>
  [
    "docxTableCellMarginTop",
    "docxTableCellMarginBottom",
    "docxTableCellMarginLeft",
    "docxTableCellMarginRight"
  ].some((key) => Object.prototype.hasOwnProperty.call(attrs, key));


const readDOCXTableGridWidths = (table: Readonly<HWPXXmlNode>) =>
  childrenNamed(firstChildNamed(table, "tblGrid"), "gridCol").map((gridCol) =>
    readDOCXDXAWidthPx(gridCol)
  );

const divideWidth = (width: number, divisor: number) =>
  Math.round((width / divisor) * 100) / 100;

const readDOCXCellColwidth = ({
  tcPr,
  gridWidths,
  gridColumnStart,
  colspan
}: {
  tcPr: Readonly<HWPXXmlNode> | null;
  gridWidths: readonly (number | null)[];
  gridColumnStart: number;
  colspan: number;
}) => {
  const gridSlice = gridWidths.slice(gridColumnStart, gridColumnStart + colspan);

  if (
    gridSlice.length === colspan &&
    gridSlice.every((width): width is number => typeof width === "number")
  ) {
    return gridSlice;
  }

  const cellWidth = readDOCXDXAWidthPx(firstChildNamed(tcPr, "tcW"));

  if (cellWidth === null) {
    return null;
  }

  return colspan > 1
    ? Array.from({ length: colspan }, () => divideWidth(cellWidth, colspan))
    : [cellWidth];
};

const mapTableCell = (
  cell: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string,
  styleModel: Readonly<DOCXStyleModel>,
  relationshipModel: Readonly<DOCXRelationshipModel>,
  entryMap: ReadonlyMap<string, Readonly<DOCXPackageEntry>>,
  options: {
    colspan?: number;
    rowspan?: number | null;
    colwidth?: number[] | null;
    suppressVerticalMergeWarning?: boolean;
    nativeNotes?: ReadonlyMap<string, IRNoteBody>;
  } = {}
): IRTableCell => {
  const tcPr = firstChildNamed(cell, "tcPr");
  const colspan =
    options.colspan ?? toPositiveInt(attr(firstChildNamed(tcPr, "gridSpan"), "val"));
  const backgroundColor = normalizeHexColor(attr(firstChildNamed(tcPr, "shd"), "fill"));
  const verticalAlign = attr(firstChildNamed(tcPr, "vAlign"), "val");
  const cellBorders = readDOCXBorderAttrs(firstChildNamed(tcPr, "tcBorders"));
  const cellWidthSpec = readDOCXWidthSpec(firstChildNamed(tcPr, "tcW"));
  const cellMargins = readDOCXMarginAttrs(
    firstChildNamed(tcPr, "tcMar"),
    "docxCellMargin"
  );
  const noWrap = hasBooleanProperty(tcPr, "noWrap");
  const blocks: IRBlock[] = [];

  if (!options.suppressVerticalMergeWarning && firstChildNamed(tcPr, "vMerge")) {
    warnings.push(
      warning(
        "docx-import-table-partial",
        "warning",
        "DOCX vertically merged table cell was imported without rowspan fidelity.",
        { entry: "word/document.xml", path }
      )
    );
  }

  cell.children.forEach((child, childIndex) => {
    const childPath = `${path}.children[${childIndex}]`;

    if (isNodeNamed(child, "tcPr")) {
      return;
    }

    if (isNodeNamed(child, "p")) {
      blocks.push(
        ...mapParagraph(
          child,
          warnings,
          childPath,
          styleModel,
          relationshipModel,
          entryMap,
          { nativeNotes: options.nativeNotes }
        )
      );
      return;
    }

    warnings.push(
      warning(
        "docx-import-table-partial",
        "warning",
        `DOCX table cell child '${localName(child.name)}' was preserved as unsupported content.`,
        { entry: "word/document.xml", path: childPath }
      )
    );
    blocks.push(mapUnsupportedBlock(child, warnings, childPath));
  });

  return {
    type: "tableCell",
    role: "cell",
    attrs: {
      ...compactAttrs({
        colspan: colspan > 1 ? colspan : null,
        rowspan: options.rowspan,
        colwidth: options.colwidth,
        docxCellWidthType: cellWidthSpec.type,
        docxCellWidthValue: cellWidthSpec.value,
        docxCellNoWrap: noWrap ? true : null,
        verticalAlign,
        backgroundColor
      }),
      ...cellMargins,
      ...cellBorders
    },
    blocks
  };
};

const mapTable = (
  table: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  path: string,
  styleModel: Readonly<DOCXStyleModel>,
  relationshipModel: Readonly<DOCXRelationshipModel>,
  entryMap: ReadonlyMap<string, Readonly<DOCXPackageEntry>>,
  nativeNotes: ReadonlyMap<string, IRNoteBody> = new Map()
): IRTableBlock => {
  const tblPr = firstChildNamed(table, "tblPr");
  const tableBorders = readDOCXBorderAttrs(firstChildNamed(tblPr, "tblBorders"));
  const tableWidthSpec = readDOCXWidthSpec(firstChildNamed(tblPr, "tblW"));
  const tableLayoutType = attr(firstChildNamed(tblPr, "tblLayout"), "type");
  const tableJustification = attr(firstChildNamed(tblPr, "jc"), "val");
  const tableCellMargins = readDOCXMarginAttrs(
    firstChildNamed(tblPr, "tblCellMar"),
    "docxTableCellMargin"
  );
  const gridWidths = readDOCXTableGridWidths(table);
  const activeVerticalMerges = new Map<number, IRTableCell>();
  const rows: IRTableRow[] = [];
  let hasCellLayoutMetadata = hasDOCXTableCellLayoutAttrs(tableCellMargins);
  let hasCellTextDirectionMetadata = false;

  table.children.forEach((child, childIndex) => {
    if (!isNodeNamed(child, "tr")) {
      return;
    }

    const rowPath = `${path}.children[${childIndex}]`;
    const trPr = firstChildNamed(child, "trPr");
    const height = toFiniteNumber(attr(firstChildNamed(trPr, "trHeight"), "val"));
    const repeatsAsHeader = hasBooleanProperty(trPr, "tblHeader");
    const cantSplit = hasBooleanProperty(trPr, "cantSplit");
    const cells: IRTableCell[] = [];
    let gridColumnStart = 0;

    if (repeatsAsHeader) {
      warnings.push(
        warning(
          "docx-import-table-partial",
          "warning",
          "DOCX repeated table header row metadata was preserved, but automatic repeated-header behavior is not enabled.",
          { entry: "word/document.xml", path: rowPath }
        )
      );
    }

    if (cantSplit) {
      warnings.push(
        warning(
          "docx-import-table-partial",
          "warning",
          "DOCX non-splitting table row metadata was preserved, but automatic row pagination behavior is not enabled.",
          { entry: "word/document.xml", path: rowPath }
        )
      );
    }

    childrenNamed(child, "tc").forEach((cell, cellIndex) => {
      const tcPr = firstChildNamed(cell, "tcPr");
      const colspan = readDOCXCellColspan(tcPr);
      const vMerge = readDOCXVerticalMergeState(tcPr);
      if (hasDOCXCellTextDirection(tcPr)) {
        hasCellTextDirectionMetadata = true;
      }
      const colwidth = readDOCXCellColwidth({
        tcPr,
        gridWidths,
        gridColumnStart,
        colspan
      });
      const cellPath = `${rowPath}.cells[${cellIndex}]`;

      if (vMerge === "continue") {
        const targets = new Set<IRTableCell>();

        for (
          let columnIndex = gridColumnStart;
          columnIndex < gridColumnStart + colspan;
          columnIndex += 1
        ) {
          const target = activeVerticalMerges.get(columnIndex);

          if (target) {
            targets.add(target);
          }
        }

        if (targets.size === 1) {
          const target = Array.from(targets)[0];
          const currentRowspan =
            typeof target.attrs.rowspan === "number" ? target.attrs.rowspan : 1;

          target.attrs.rowspan = currentRowspan + 1;
          gridColumnStart += colspan;
          return;
        }

        warnings.push(
          warning(
            "docx-import-table-partial",
            "warning",
            "DOCX vertically merged continuation cell had no matching restart and was imported as a normal cell.",
            { entry: "word/document.xml", path: cellPath }
          )
        );
      }

      const mappedCell = mapTableCell(
        cell,
        warnings,
        cellPath,
        styleModel,
        relationshipModel,
        entryMap,
        {
          colspan,
          rowspan: vMerge === "restart" ? 1 : null,
          colwidth,
          suppressVerticalMergeWarning: true,
          nativeNotes
        }
      );

      cells.push(mappedCell);
      if (hasDOCXCellLayoutAttrs(mappedCell.attrs)) {
        hasCellLayoutMetadata = true;
      }

      for (
        let columnIndex = gridColumnStart;
        columnIndex < gridColumnStart + colspan;
        columnIndex += 1
      ) {
        if (vMerge === "restart") {
          activeVerticalMerges.set(columnIndex, mappedCell);
        } else {
          activeVerticalMerges.delete(columnIndex);
        }
      }

      gridColumnStart += colspan;
    });

    rows.push({
      type: "tableRow",
      attrs: compactAttrs({
        height,
        docxTableHeaderRepeat: repeatsAsHeader ? true : null,
        docxRowCantSplit: cantSplit ? true : null
      }),
      cells
    });
  });

  if (hasCellLayoutMetadata) {
    warnings.push(
      warning(
        "docx-import-table-partial",
        "warning",
        "DOCX table cell margin or no-wrap layout metadata was preserved, but cell padding and no-wrap behavior is not enabled.",
        { entry: "word/document.xml", path }
      )
    );
  }

  if (hasCellTextDirectionMetadata) {
    warnings.push(
      warning(
        "docx-import-table-partial",
        "warning",
        "DOCX table cell text direction metadata is not imported in S4; cell vertical alignment and paragraph alignment were preserved when present.",
        { entry: "word/document.xml", path }
      )
    );
  }

  return {
    type: "table",
    attrs: {
      ...compactAttrs({
        docxTableWidthType: tableWidthSpec.type,
        docxTableWidthValue: tableWidthSpec.value,
        docxTableLayoutType: tableLayoutType,
        docxTableJustification: tableJustification
      }),
      ...tableCellMargins,
      ...tableBorders
    },
    rows
  };
};

const resolveDOCXListDefinition = (
  numbering: DOCXParagraphNumbering,
  numberingModel: Readonly<DOCXNumberingModel>,
  warnings: DOCXImportWarning[],
  path: string
) => {
  const definition = numberingModel.byNumId.get(numbering.numId);

  if (!definition) {
    warnings.push(
      warning(
        "docx-import-numbering-unsupported",
        "warning",
        `DOCX numbering id '${numbering.numId}' was not found; paragraph text was preserved.`,
        { entry: "word/document.xml", path }
      )
    );
    return null;
  }

  const unsupported = [
    ...definition.unsupported,
    ...(numbering.level !== 0 ? [`paragraph level ${numbering.level}`] : [])
  ];

  if (
    unsupported.length ||
    (definition.listType !== "ordered" && definition.listType !== "bullet")
  ) {
    warnings.push(
      warning(
        "docx-import-numbering-unsupported",
        "warning",
        `DOCX numbering id '${numbering.numId}' is outside the S4 simple list subset: ${unsupported.join(
          "; "
        ) || "unsupported list type"}.`,
        { entry: "word/document.xml", path }
      )
    );
    return null;
  }

  return definition;
};

const createListBlock = (pendingList: DOCXPendingList): IRListBlock => ({
  type: "list",
  listType:
    pendingList.listType === "ordered" || pendingList.listType === "bullet"
      ? pendingList.listType
      : "unknown",
  attrs: compactAttrs({
    start: pendingList.listType === "ordered" ? pendingList.start : null
  }),
  items: pendingList.items
});

const createIRDocument = (
  blocks: readonly IRBlock[],
  warnings: readonly Readonly<DOCXImportWarning>[],
  extractedAt: string,
  notes: readonly IRNoteBody[] = []
): Readonly<IRDocument> => {
  const section: IRSection = {
    type: "section",
    id: "docx-section-1",
    breakType: "unknown",
    pageSettings: DEFAULT_PAGE_SETTINGS,
    blocks: [...blocks]
  };
  const irDocument: IRDocument = {
    type: "document",
    version: "ir-v1.1-draft",
    metadata: {
      extractedAt,
      extractorVersion: DOCX_IMPORT_EXTRACTOR_VERSION,
      source: {
        editor: "docx",
        mode: "import-snapshot"
      },
      warnings: warnings.map((item) => item.message)
    },
    sections: [section],
    ...(notes.length ? { notes: freezeArray(notes) } : {})
  };

  return Object.freeze(irDocument);
};

const parseDocumentXml = (
  documentXml: string,
  warnings: DOCXImportWarning[]
) => {
  const parsed = parseHWPXXml(documentXml);

  parsed.warnings.forEach((message) => {
    warnings.push(
      warning("docx-import-xml-warning", "warning", message, {
        entry: "word/document.xml"
      })
    );
  });

  const documentNode = firstDescendantNamed(parsed.root, "document");
  const body = documentNode ? firstChildNamed(documentNode, "body") : null;

  if (!body) {
    warnings.push(
      warning(
        "docx-import-xml-error",
        "error",
        "DOCX document body was not found.",
        { entry: "word/document.xml" }
      )
    );
  }

  return body;
};

const notePartRelsPath = (entry: string) => {
  const slash = entry.lastIndexOf("/");
  return `${entry.slice(0, slash)}/_rels/${entry.slice(slash + 1)}.rels`;
};

const DOCX_NOTE_INFRASTRUCTURE_TYPES = new Set([
  "separator",
  "continuationSeparator",
  "continuationNotice"
]);

const attributeLocalNames = (node: Readonly<HWPXXmlNode>) =>
  Object.keys(node.attrs).map(localName);

const hasOnlyAttributes = (
  node: Readonly<HWPXXmlNode>,
  allowed: ReadonlySet<string>
) => attributeLocalNames(node).every((name) => allowed.has(name));

const isTruthyOOXMLValue = (value: string | null) =>
  value !== null && !["0", "false", "off"].includes(value.toLowerCase());

const isSupportedOOXMLBooleanValue = (value: string | null) =>
  value === null ||
  ["0", "1", "false", "true"].includes(value.toLowerCase());

const pushDOCXNoteContentError = (
  warnings: DOCXImportWarning[],
  message: string,
  entry: string,
  path: string
) => {
  warnings.push(
    warning("docx-import-note-content-unsupported", "error", message, {
      entry,
      path
    })
  );
};

const validateDOCXNoteTextRunProperties = (
  rPr: Readonly<HWPXXmlNode>,
  warnings: DOCXImportWarning[],
  entry: string,
  path: string
) => {
  let valid = true;
  const supportedNames = new Set([
    "b",
    "i",
    "strike",
    "u",
    "color",
    "vertAlign"
  ]);
  const seenNames = new Set<string>();

  if (attributeLocalNames(rPr).length > 0) {
    valid = false;
    pushDOCXNoteContentError(
      warnings,
      "DOCX note run properties container has unsupported attributes.",
      entry,
      `${path}.rPr`
    );
  }

  rPr.children.forEach((property, propertyIndex) => {
    const name = localName(property.name);
    const propertyPath = `${path}.rPr.children[${propertyIndex}]`;

    if (!supportedNames.has(name)) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        `DOCX note run property '${name}' is outside the supported mark subset.`,
        entry,
        propertyPath
      );
      return;
    }

    if (seenNames.has(name)) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        `DOCX note run property '${name}' is duplicated.`,
        entry,
        propertyPath
      );
      return;
    }
    seenNames.add(name);

    if (!hasOnlyAttributes(property, new Set(["val"]))) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        `DOCX note run property '${name}' has unsupported attributes.`,
        entry,
        propertyPath
      );
      return;
    }

    if (property.children.length > 0) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        `DOCX note run property '${name}' has unsupported child content.`,
        entry,
        propertyPath
      );
      return;
    }

    const value = attr(property, "val");
    if (
      (["b", "i", "strike"].includes(name) &&
        !isSupportedOOXMLBooleanValue(value)) ||
      (name === "u" && value !== null && !["single", "none"].includes(value)) ||
      (name === "color" && !normalizeHexColor(value)) ||
      (name === "vertAlign" &&
        !["subscript", "superscript"].includes(value ?? ""))
    ) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        `DOCX note run property '${name}' has an unsupported value.`,
        entry,
        propertyPath
      );
    }
  });

  return valid;
};

const validateDOCXNoteMarkerRunProperties = (
  rPr: Readonly<HWPXXmlNode>,
  kind: IRNoteKind,
  warnings: DOCXImportWarning[],
  entry: string,
  path: string
) => {
  let valid = true;
  const expectedStyle =
    kind === "footnote" ? "FootnoteReference" : "EndnoteReference";
  const seenNames = new Set<string>();

  if (attributeLocalNames(rPr).length > 0) {
    valid = false;
    pushDOCXNoteContentError(
      warnings,
      "DOCX note marker properties container has unsupported attributes.",
      entry,
      `${path}.rPr`
    );
  }

  rPr.children.forEach((property, propertyIndex) => {
    const name = localName(property.name);
    const propertyPath = `${path}.rPr.children[${propertyIndex}]`;
    const supported =
      (name === "rStyle" && attr(property, "val") === expectedStyle) ||
      (name === "vertAlign" && attr(property, "val") === "superscript");

    if (
      !supported ||
      seenNames.has(name) ||
      !hasOnlyAttributes(property, new Set(["val"])) ||
      property.children.length > 0
    ) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        "DOCX note marker run uses unsupported formatting.",
        entry,
        propertyPath
      );
    }
    seenNames.add(name);
  });

  return valid;
};

const validateDOCXNoteRun = (
  run: Readonly<HWPXXmlNode>,
  kind: IRNoteKind,
  paragraphIndex: number,
  warnings: DOCXImportWarning[],
  entry: string,
  path: string
) => {
  const expectedMarker = kind === "footnote" ? "footnoteRef" : "endnoteRef";
  const markerChildren = run.children.filter((child) =>
    ["footnoteRef", "endnoteRef"].includes(localName(child.name))
  );
  const rPr = firstChildNamed(run, "rPr");
  let valid = true;

  if (attributeLocalNames(run).length > 0) {
    valid = false;
    pushDOCXNoteContentError(
      warnings,
      "DOCX note run has unsupported attributes.",
      entry,
      path
    );
  }

  if (markerChildren.length > 0) {
    const markerIsValid =
      markerChildren.length === 1 &&
      localName(markerChildren[0].name) === expectedMarker &&
      paragraphIndex === 0 &&
      attributeLocalNames(markerChildren[0]).length === 0 &&
      markerChildren[0].children.length === 0 &&
      run.children.every((child) =>
        ["rPr", expectedMarker].includes(localName(child.name))
      );

    if (!markerIsValid) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        "DOCX note body marker is duplicated, misplaced, or has the wrong kind.",
        entry,
        path
      );
    }

    if (
      rPr &&
      !validateDOCXNoteMarkerRunProperties(rPr, kind, warnings, entry, path)
    ) {
      valid = false;
    }

    return { valid, markerCount: markerChildren.length };
  }

  const allowedRunChildren = new Set(["rPr", "t", "br"]);
  run.children.forEach((child, childIndex) => {
    const name = localName(child.name);
    const childPath = `${path}.children[${childIndex}]`;

    if (!allowedRunChildren.has(name)) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        `DOCX note run child '${name}' is unsupported.`,
        entry,
        childPath
      );
      return;
    }

    if (name === "rPr") return;

    if (
      (name === "t" && !hasOnlyAttributes(child, new Set(["space"]))) ||
      (name === "t" &&
        attrByLocalName(child, "space") !== null &&
        !["default", "preserve"].includes(attrByLocalName(child, "space") ?? "")) ||
      child.children.length > 0 ||
      (name === "br" && attributeLocalNames(child).length > 0)
    ) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        `DOCX note run child '${name}' has unsupported attributes.`,
        entry,
        childPath
      );
    }
  });

  if (
    rPr &&
    !validateDOCXNoteTextRunProperties(rPr, warnings, entry, path)
  ) {
    valid = false;
  }

  return { valid, markerCount: 0 };
};

const validateDOCXNoteParagraph = (
  paragraph: Readonly<HWPXXmlNode>,
  kind: IRNoteKind,
  paragraphIndex: number,
  warnings: DOCXImportWarning[],
  entry: string,
  path: string
) => {
  let valid = true;
  let markerCount = 0;
  const pPr = firstChildNamed(paragraph, "pPr");

  if (attributeLocalNames(paragraph).length > 0) {
    valid = false;
    pushDOCXNoteContentError(
      warnings,
      "DOCX note paragraph has unsupported attributes.",
      entry,
      path
    );
  }

  if (pPr) {
    const expectedStyle = kind === "footnote" ? "FootnoteText" : "EndnoteText";
    const pStyle = firstChildNamed(pPr, "pStyle");
    if (
      pPr.children.length !== (pStyle ? 1 : 0) ||
      attributeLocalNames(pPr).length > 0 ||
      !pStyle ||
      attr(pStyle, "val") !== expectedStyle ||
      !hasOnlyAttributes(pStyle, new Set(["val"]))
    ) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        "DOCX note paragraph properties are outside the supported conventional style subset.",
        entry,
        `${path}.pPr`
      );
    }
  }

  paragraph.children.forEach((child, childIndex) => {
    const name = localName(child.name);
    const childPath = `${path}.children[${childIndex}]`;

    if (name === "pPr") return;

    if (name === "r") {
      const runValidation = validateDOCXNoteRun(
        child,
        kind,
        paragraphIndex,
        warnings,
        entry,
        childPath
      );
      valid = valid && runValidation.valid;
      markerCount += runValidation.markerCount;
      return;
    }

    if (name === "hyperlink") {
      if (
        !hasOnlyAttributes(child, new Set(["id"])) ||
        !attrByLocalName(child, "id") ||
        child.children.length === 0 ||
        child.children.some((linkChild) => !isNodeNamed(linkChild, "r"))
      ) {
        valid = false;
        pushDOCXNoteContentError(
          warnings,
          "DOCX note hyperlink structure is unsupported.",
          entry,
          childPath
        );
      }

      child.children.forEach((linkChild, linkChildIndex) => {
        if (!isNodeNamed(linkChild, "r")) return;
        const runValidation = validateDOCXNoteRun(
          linkChild,
          kind,
          paragraphIndex,
          warnings,
          entry,
          `${childPath}.children[${linkChildIndex}]`
        );
        valid = valid && runValidation.valid;
        markerCount += runValidation.markerCount;
        if (runValidation.markerCount > 0) {
          valid = false;
          pushDOCXNoteContentError(
            warnings,
            "DOCX note body marker cannot be nested in a hyperlink.",
            entry,
            `${childPath}.children[${linkChildIndex}]`
          );
        }
      });
      return;
    }

    valid = false;
    pushDOCXNoteContentError(
      warnings,
      `DOCX note paragraph child '${name}' is unsupported.`,
      entry,
      childPath
    );
  });

  if (paragraphIndex === 0) {
    const firstContentChild = paragraph.children.find(
      (child) => !isNodeNamed(child, "pPr")
    );
    const firstMarker = firstContentChild
      ? firstDescendantNamed(firstContentChild, kind === "footnote" ? "footnoteRef" : "endnoteRef")
      : null;
    if (!firstMarker) {
      valid = false;
      pushDOCXNoteContentError(
        warnings,
        "DOCX normal note body marker must be the first content run of the first paragraph.",
        entry,
        path
      );
    }
  }

  return { valid, markerCount };
};

const validateDOCXNoteBodyStructure = (
  note: Readonly<HWPXXmlNode>,
  kind: IRNoteKind,
  warnings: DOCXImportWarning[],
  entry: string,
  path: string
) => {
  const paragraphs = childrenNamed(note, "p");
  let valid = true;
  let markerCount = 0;

  if (!hasOnlyAttributes(note, new Set(["id", "type"]))) {
    valid = false;
    pushDOCXNoteContentError(
      warnings,
      "DOCX normal note body has unsupported attributes.",
      entry,
      path
    );
  }

  if (
    paragraphs.length === 0 ||
    note.children.some((child) => !isNodeNamed(child, "p"))
  ) {
    valid = false;
    pushDOCXNoteContentError(
      warnings,
      "DOCX note body contains unsupported block content.",
      entry,
      path
    );
  }

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const paragraphValidation = validateDOCXNoteParagraph(
      paragraph,
      kind,
      paragraphIndex,
      warnings,
      entry,
      `${path}.paragraphs[${paragraphIndex}]`
    );
    valid = valid && paragraphValidation.valid;
    markerCount += paragraphValidation.markerCount;
  });

  if (markerCount !== 1) {
    valid = false;
    pushDOCXNoteContentError(
      warnings,
      "DOCX normal note body must contain exactly one conventional marker in its first paragraph.",
      entry,
      path
    );
  }

  return { valid, paragraphs };
};

const validateDOCXNoteNumberingProperties = (
  xml: string | null,
  entry: string,
  warnings: DOCXImportWarning[]
) => {
  if (!xml || !/<(?:\w+:)?(?:footnotePr|endnotePr)\b/i.test(xml)) return;

  const parsed = parseHWPXXml(xml);
  parsed.warnings.forEach((message) => {
    warnings.push(
      warning(
        "docx-import-note-numbering-unsupported",
        "error",
        `DOCX note numbering XML is invalid: ${message}`,
        { entry }
      )
    );
  });

  (["footnote", "endnote"] as const).forEach((kind) => {
    descendantsNamed(parsed.root, `${kind}Pr`).forEach((properties, index) => {
      const counts = new Map<string, number>();
      const infrastructureIds = new Set<string>();
      properties.children.forEach((property) => {
        const name = localName(property.name);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
      const expectedPosition = kind === "footnote" ? "pageBottom" : "docEnd";
      const invalidProperty = properties.children.find((property) => {
        const name = localName(property.name);
        if (name === kind) {
          const id = attr(property, "id");
          const validInfrastructureReference =
            hasOnlyAttributes(property, new Set(["id"])) &&
            Boolean(id && /^-?\d+$/.test(id)) &&
            !infrastructureIds.has(id ?? "") &&
            property.children.length === 0;
          if (id) infrastructureIds.add(id);
          return !validInfrastructureReference;
        }
        if ((counts.get(name) ?? 0) > 1) return true;
        if (!hasOnlyAttributes(property, new Set(["val"]))) return true;
        if (property.children.length > 0) return true;
        const value = attr(property, "val");
        if (name === "numFmt") return value !== "decimal";
        if (name === "numStart") return value !== "1";
        if (name === "numRestart") return value !== "continuous";
        if (name === "pos") return value !== expectedPosition;
        return true;
      });

      if (attributeLocalNames(properties).length > 0 || invalidProperty) {
        warnings.push(
          warning(
            "docx-import-note-numbering-unsupported",
            "error",
            `DOCX ${kind} numbering or placement is outside the continuous decimal start-at-one subset.`,
            { entry, path: `${entry}.${kind}Pr[${index}]` }
          )
        );
      }
    });
  });
};

const parseNativeNotes = (
  packageResult: Readonly<DOCXPackageReadResult>,
  documentRelationships: Readonly<DOCXRelationshipModel>,
  warnings: DOCXImportWarning[],
  styleModel: Readonly<DOCXStyleModel>
) => {
  const bodies = new Map<string, IRNoteBody>();
  (["footnote", "endnote"] as const).forEach((kind) => {
    const relationships = [...documentRelationships.byId.values()].filter(
      (item) => item.kind === `${kind}s`
    );
    if (!relationships.length) return;
    if (relationships.length !== 1) {
      warnings.push(
        warning(
          "docx-import-note-part-invalid",
          "error",
          `DOCX ${kind} must have exactly one document relationship.`,
          { entry: "word/_rels/document.xml.rels" }
        )
      );
      return;
    }

    const relationship = relationships[0];
    if (!relationship.targetEntry || relationship.isExternal) {
      warnings.push(
        warning(
          "docx-import-note-part-invalid",
          "error",
          `DOCX ${kind} relationship must target an internal package part.`,
          { entry: "word/_rels/document.xml.rels" }
        )
      );
      return;
    }

    const entry = packageResult.entryMap.get(relationship.targetEntry);
    if (!entry?.text) {
      warnings.push(
        warning(
          "docx-import-note-part-invalid",
          "error",
          `DOCX ${kind} relationship target is missing.`,
          { entry: relationship.targetEntry }
        )
      );
      return;
    }

    const parsed = parseHWPXXml(entry.text);
    parsed.warnings.forEach((message) => {
      warnings.push(
        warning(
          "docx-import-note-part-invalid",
          "error",
          `DOCX ${kind} part XML is invalid: ${message}`,
          { entry: entry.path }
        )
      );
    });
    if (parsed.warnings.length) return;

    const root = firstDescendantNamed(parsed.root, `${kind}s`);
    if (!root) {
      warnings.push(
        warning(
          "docx-import-note-part-invalid",
          "error",
          `DOCX ${kind} part root is invalid.`,
          { entry: entry.path }
        )
      );
      return;
    }

    root.children.forEach((child, index) => {
      if (!isNodeNamed(child, kind)) {
        warnings.push(
          warning(
            "docx-import-note-part-invalid",
            "error",
            `DOCX ${kind} part child '${localName(child.name)}' is unsupported.`,
            { entry: entry.path, path: `${kind}s.children[${index}]` }
          )
        );
      }
    });

    const relationshipEntry = notePartRelsPath(entry.path);
    const relModel = parseDOCXDocumentRelationships(
      packageResult.entryMap.get(relationshipEntry)?.text ?? null,
      warnings,
      {
        relationshipEntry,
        sourcePartEntry: entry.path,
        strictNoteRelationships: true
      }
    );

    childrenNamed(root, kind).forEach((node, index) => {
      const path = `${kind}s[${index}]`;
      const noteType = attr(node, "type");
      if (noteType && noteType !== "normal") {
        if (!DOCX_NOTE_INFRASTRUCTURE_TYPES.has(noteType)) {
          warnings.push(
            warning(
              "docx-import-note-part-invalid",
              "error",
              `DOCX ${kind} special type '${noteType}' is unsupported.`,
              { entry: entry.path, path }
            )
          );
        }
        return;
      }

      const id = attr(node, "id");
      if (!id || !/^[1-9]\d*$/.test(id) || bodies.has(`${kind}:${id}`)) {
        warnings.push(
          warning(
            "docx-import-note-pair-invalid",
            "error",
            `DOCX ${kind} id is invalid or duplicated.`,
            { entry: entry.path, path }
          )
        );
        return;
      }

      const bodyValidation = validateDOCXNoteBodyStructure(
        node,
        kind,
        warnings,
        entry.path,
        path
      );
      let hyperlinksValid = true;
      descendantsNamed(node, "hyperlink").forEach((hyperlink, hyperlinkIndex) => {
        const rel = relModel.byId.get(attrByLocalName(hyperlink, "id") ?? "");
        if (
          !rel ||
          rel.kind !== "hyperlink" ||
          !rel.isExternal ||
          !isSupportedExternalHyperlinkTarget(rel.target)
        ) {
          hyperlinksValid = false;
          warnings.push(
            warning(
              "docx-import-note-hyperlink-unsupported",
              "error",
              `DOCX ${kind} hyperlink is unresolved or unsafe.`,
              {
                entry: entry.path,
                path: `${path}.hyperlinks[${hyperlinkIndex}]`
              }
            )
          );
        }
      });

      if (!bodyValidation.valid || !hyperlinksValid) {
        return;
      }

      const bodyParagraphs = bodyValidation.paragraphs.map(
        (paragraph, paragraphIndex) => {
        const mapped = mapParagraph(
          paragraph,
          warnings,
          `${entry.path}.${kind}[${id}].p[${paragraphIndex}]`,
          styleModel,
          relModel,
          packageResult.entryMap,
          {
            warnOnNumbering: false,
            preserveEmpty: true,
            omitParagraphStyleMetadata: true,
            ignoreResolvedStyleAttrs: true,
            ignoreResolvedStyleMarks: true
          }
        );
        const block = mapped.find((candidate) => candidate.type === "paragraph");
        if (!block || block.type !== "paragraph") {
          warnings.push(
            warning(
              "docx-import-note-content-unsupported",
              "error",
              `DOCX ${kind} body paragraph could not be represented.`,
              { entry: entry.path }
            )
          );
          return { type: "paragraph" as const, runs: [] };
        }
        return {
          type: "paragraph" as const,
          runs: block.runs.filter(
            (run): run is IRNoteInlineNode => run.type !== "noteReference"
          )
        };
      });
      bodies.set(`${kind}:${id}`, {
        noteId: `note-v1-docx-${kind}-${id}`,
        kind,
        referenceOrder: -1,
        paragraphs: bodyParagraphs
      });
    });
  });
  return bodies;
};

const collectDOCXNoteReferencesFromBlocks = (
  blocks: readonly IRBlock[],
  references: { noteId: string; kind: IRNoteKind }[]
) => {
  blocks.forEach((block) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
        block.runs.forEach((run) => {
          if (run.type === "noteReference") {
            references.push({ noteId: run.noteId, kind: run.kind });
          }
        });
        break;
      case "list":
        block.items.forEach((item) =>
          collectDOCXNoteReferencesFromBlocks(item.blocks, references)
        );
        break;
      case "table":
        block.rows.forEach((row) =>
          row.cells.forEach((cell) =>
            collectDOCXNoteReferencesFromBlocks(cell.blocks, references)
          )
        );
        break;
      case "object":
        collectDOCXNoteReferencesFromBlocks(block.children ?? [], references);
        break;
    }
  });
};

export const importDOCXToIR = (
  packageBytes: Uint8Array,
  options: DOCXImportOptions = {}
): Readonly<DOCXImportResult> => {
  const packageResult = readDOCXPackageFromBytes(packageBytes);
  const warnings = [...packageResult.warnings];
  const extractedAt = options.extractedAt ?? new Date().toISOString();
  const documentEntry = packageResult.entryMap.get("word/document.xml");
  const styleModel = parseDOCXStyles(
    packageResult.entryMap.get("word/styles.xml")?.text ?? null,
    warnings
  );
  const relationshipModel = parseDOCXDocumentRelationships(
    packageResult.entryMap.get("word/_rels/document.xml.rels")?.text ?? null,
    warnings
  );
  const numberingModel = parseDOCXNumbering(
    packageResult.entryMap.get("word/numbering.xml")?.text ?? null,
    warnings
  );
  const nativeNotes = parseNativeNotes(packageResult, relationshipModel, warnings, styleModel);
  const rawDocumentXml = packageResult.entryMap.get("word/document.xml")?.text ?? "";
  (["footnote", "endnote"] as const).forEach((kind) => {
    const hasReference = new RegExp(`${kind}Reference\\b`).test(rawDocumentXml);
    const relationships = [...relationshipModel.byId.values()].filter(
      (relationship) => relationship.kind === `${kind}s`
    );
    if (hasReference && relationships.length === 0) {
      warnings.push(
        warning(
          "docx-import-note-part-invalid",
          "error",
          `DOCX ${kind} references exist but no native note-part relationship was found.`,
          { entry: "word/document.xml" }
        )
      );
    }
  });
  validateDOCXNoteNumberingProperties(
    packageResult.entryMap.get("word/settings.xml")?.text ?? null,
    "word/settings.xml",
    warnings
  );
  validateDOCXNoteNumberingProperties(
    rawDocumentXml || null,
    "word/document.xml",
    warnings
  );

  if (!documentEntry?.text) {
    return Object.freeze({
      irDocument: createIRDocument([], warnings, extractedAt),
      warnings: freezeArray(warnings),
      packageSummary: packageResult.packageSummary
    });
  }

  const body = parseDocumentXml(documentEntry.text, warnings);
  const blocks: IRBlock[] = [];
  let pendingList: DOCXPendingList | null = null;

  const flushPendingList = () => {
    if (!pendingList) {
      return;
    }

    blocks.push(createListBlock(pendingList));
    pendingList = null;
  };

  const appendNumberedParagraph = (
    paragraph: Readonly<HWPXXmlNode>,
    path: string,
    numbering: DOCXParagraphNumbering,
    definition: Readonly<DOCXNumberingDefinition>
  ) => {
    const sameList =
      pendingList &&
      pendingList.numId === definition.numId &&
      pendingList.level === numbering.level &&
      pendingList.listType === definition.listType;

    if (!sameList) {
      flushPendingList();
      pendingList = {
        numId: definition.numId,
        level: numbering.level,
        listType: definition.listType,
        start: definition.start,
        items: []
      };
    }

    const itemIndex = pendingList.items.length;
    const value =
      pendingList.listType === "ordered" && pendingList.start !== null
        ? pendingList.start + itemIndex
        : null;
    const itemBlocks = mapParagraph(
      paragraph,
      warnings,
      path,
      styleModel,
      relationshipModel,
      packageResult.entryMap,
      { warnOnNumbering: false, nativeNotes }
    );

    pendingList.items.push({
      type: "listItem",
      attrs: compactAttrs({ value }),
      blocks: itemBlocks
    });
  };

  body?.children.forEach((child, childIndex) => {
    const path = `word/document.xml.body.children[${childIndex}]`;

    if (isNodeNamed(child, "p")) {
      const numbering = getParagraphNumbering(firstChildNamed(child, "pPr"));

      if (numbering) {
        const definition = resolveDOCXListDefinition(
          numbering,
          numberingModel,
          warnings,
          path
        );

        if (definition) {
          appendNumberedParagraph(child, path, numbering, definition);
          return;
        }
      }

      flushPendingList();
      blocks.push(
        ...mapParagraph(
          child,
          warnings,
          path,
          styleModel,
          relationshipModel,
          packageResult.entryMap,
          { nativeNotes }
        )
      );
      return;
    }

    if (isNodeNamed(child, "tbl")) {
      flushPendingList();
      blocks.push(
        mapTable(
          child,
          warnings,
          path,
          styleModel,
          relationshipModel,
          packageResult.entryMap,
          nativeNotes
        )
      );
      return;
    }

    if (isNodeNamed(child, "sectPr")) {
      flushPendingList();
      warnings.push(
        warning(
          "docx-import-section-properties-partial",
          "warning",
          "DOCX section properties are not restored in import S4; default page settings were used.",
          { entry: "word/document.xml", path }
        )
      );
      return;
    }

    flushPendingList();
    blocks.push(mapUnsupportedBlock(child, warnings, path));
  });

  flushPendingList();

  const references: { noteId: string; kind: IRNoteKind }[] = [];
  collectDOCXNoteReferencesFromBlocks(blocks, references);
  const referencedIds = new Set<string>();
  const nativeNotesById = new Map(
    [...nativeNotes.values()].map((note) => [note.noteId, note])
  );
  references.forEach((reference, index) => {
    if (referencedIds.has(reference.noteId)) {
      warnings.push(
        warning(
          "docx-import-note-pair-invalid",
          "error",
          `DOCX note is referenced more than once: ${reference.noteId}.`,
          { entry: "word/document.xml" }
        )
      );
    }
    referencedIds.add(reference.noteId);
    const native = nativeNotesById.get(reference.noteId);
    if (!native || native.kind !== reference.kind) {
      warnings.push(
        warning(
          "docx-import-note-pair-invalid",
          "error",
          `DOCX note reference has no matching body: ${reference.noteId}.`,
          { entry: "word/document.xml" }
        )
      );
    } else {
      native.referenceOrder = index;
    }
  });
  nativeNotes.forEach((note) => {
    if (!referencedIds.has(note.noteId)) {
      warnings.push(
        warning(
          "docx-import-note-pair-invalid",
          "error",
          `DOCX normal note body is orphaned: ${note.noteId}.`,
          { entry: "word/document.xml" }
        )
      );
    }
  });
  const hasBlockingNoteError = warnings.some(
    (item) =>
      item.severity === "error" && item.code.startsWith("docx-import-note-")
  );
  const orderedNotes = hasBlockingNoteError
    ? []
    : [...nativeNotes.values()]
        .filter((note) => note.referenceOrder >= 0)
        .sort((left, right) => left.referenceOrder - right.referenceOrder);

  return Object.freeze({
    irDocument: createIRDocument(blocks, warnings, extractedAt, orderedNotes),
    warnings: freezeArray(warnings),
    packageSummary: packageResult.packageSummary
  });
};
