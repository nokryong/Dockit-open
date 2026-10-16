import { normalizeIRDocumentStyles } from "./styleModel";
import { normalizeListNumbering } from "./listNumberingModel";
import { normalizeTableModel } from "./tableModel";
import { normalizeObjectModel } from "./objectModel";
import {
  assertValidIRNoteSemantics,
  getIRNoteReferences,
  IRNoteCompatibilityError
} from "./noteIRUtils";
import type {
  IRBlock,
  IRDocument,
  IRInlineNode,
  IRListBlock,
  IRListItem,
  IRObjectBlock,
  IRParagraphBlock,
  IRTableBlock,
  IRTableCell,
  IRTextRun,
  IRNoteBody,
  IRUnsupportedBlock
} from "./types";

export type DOCXMinimalWarningSeverity = "warning" | "blocked";

export type DOCXMinimalWarningCode =
  | "docx-run-style-fallback"
  | "docx-link-target-fallback"
  | "docx-link-attribute-fallback"
  | "docx-list-fallback"
  | "docx-paragraph-style-fallback"
  | "docx-image-relationship-fallback"
  | "docx-table-border-fallback"
  | "docx-table-fill-fallback"
  | "docx-table-style-fallback"
  | "docx-object-placeholder"
  | "docx-unsupported-block";

export const DOCX_MINIMAL_WARNING_CONTRACT = Object.freeze({
  "docx-run-style-fallback": {
    severity: "warning",
    fallback: "Text stays visible while unsupported run style is omitted.",
    visiblePlaceholder: false
  },
  "docx-link-target-fallback": {
    severity: "warning",
    fallback: "Link text stays visible while unsupported href is not emitted as native DOCX hyperlink.",
    visiblePlaceholder: false
  },
  "docx-link-attribute-fallback": {
    severity: "warning",
    fallback: "Native hyperlink keeps href while unsupported link attrs are omitted.",
    visiblePlaceholder: false
  },
  "docx-list-fallback": {
    severity: "warning",
    fallback: "List marker is written as plain paragraph text.",
    visiblePlaceholder: false
  },
  "docx-paragraph-style-fallback": {
    severity: "warning",
    fallback: "Paragraph text and heading level stay visible while conflicting DOCX paragraph style metadata is omitted.",
    visiblePlaceholder: false
  },
  "docx-image-relationship-fallback": {
    severity: "warning",
    fallback: "Unsupported image source stays visible as an object placeholder.",
    visiblePlaceholder: true
  },
  "docx-table-border-fallback": {
    severity: "warning",
    fallback: "Table text/grid stays visible while unsupported border metadata is omitted.",
    visiblePlaceholder: false
  },
  "docx-table-fill-fallback": {
    severity: "warning",
    fallback: "Table cell stays visible while unsupported fill color is omitted.",
    visiblePlaceholder: false
  },
  "docx-table-style-fallback": {
    severity: "warning",
    fallback: "Table text and cell grid stay visible while advanced table style is omitted.",
    visiblePlaceholder: false
  },
  "docx-object-placeholder": {
    severity: "warning",
    fallback: "Object media is written as a visible placeholder paragraph.",
    visiblePlaceholder: true
  },
  "docx-unsupported-block": {
    severity: "blocked",
    fallback: "Unsupported block writes raw text when available, otherwise a visible placeholder.",
    visiblePlaceholder: true
  }
} satisfies Record<
  DOCXMinimalWarningCode,
  Readonly<{
    severity: DOCXMinimalWarningSeverity;
    fallback: string;
    visiblePlaceholder: boolean;
  }>
>);

export interface DOCXMinimalExportWarning {
  code: DOCXMinimalWarningCode;
  severity: DOCXMinimalWarningSeverity;
  message: string;
  sectionIndex: number;
  blockIndex: number | null;
  blockType: string;
  path: string;
}

export interface DOCXMinimalPackageEntry {
  path: string;
  mediaType: string;
  content: string | Uint8Array;
}

export interface DOCXMinimalExportInputV1 {
  version: "docx-minimal-export-input-v1";
  irDocument: IRDocument;
  styleSections: ReturnType<typeof normalizeIRDocumentStyles>;
  tableCount: number;
  objectCount: number;
}

export interface DOCXMinimalPackageSummary {
  entryCount: number;
  requiredEntries: Readonly<Record<string, boolean>>;
  documentPart: string;
  hasStyles: boolean;
  hasCoreProperties: boolean;
  hasAppProperties: boolean;
}

export interface DOCXMinimalExportResult {
  packageBytes: Uint8Array;
  entries: readonly Readonly<DOCXMinimalPackageEntry>[];
  warnings: readonly Readonly<DOCXMinimalExportWarning>[];
  packageSummary: Readonly<DOCXMinimalPackageSummary>;
}

const INPUT_VERSION = "docx-minimal-export-input-v1" as const;
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const REL_NS =
  'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const CONTENT_TYPES_NS =
  'xmlns="http://schemas.openxmlformats.org/package/2006/content-types"';
const DOCX_REL_TYPE_PREFIX =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

const encoder = new TextEncoder();
const DOCX_MAX_EMBEDDED_IMAGE_BYTES = 5 * 1024 * 1024;
const DOCX_DEFAULT_IMAGE_WIDTH_EMU = 3048000;
const DOCX_DEFAULT_IMAGE_HEIGHT_EMU = 1714500;

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const stripHash = (value: string | null) =>
  value?.trim().replace(/^#/, "").toUpperCase() || null;

const isSafeHexColor = (value: string | null) =>
  Boolean(value && /^[0-9A-F]{6}$/.test(value));

const normalizeHexColor = (value: string | null) => {
  const stripped = stripHash(value);

  if (!stripped) {
    return null;
  }

  if (/^[0-9A-F]{3}$/.test(stripped)) {
    return stripped
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
  }

  return isSafeHexColor(stripped) ? stripped : null;
};

const toPositiveInt = (value: unknown, fallback = 1) => {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : null;

  return Number.isFinite(numberValue)
    ? Math.max(1, Math.trunc(numberValue as number))
    : fallback;
};

const warningKey = (warning: DOCXMinimalExportWarning) =>
  [
    warning.code,
    warning.sectionIndex,
    warning.blockIndex ?? "nested",
    warning.path,
    warning.message
  ].join("|");

const pushWarning = (
  context: RenderContext,
  warning: DOCXMinimalExportWarning
) => {
  const key = warningKey(warning);

  if (context.warningKeys.has(key)) {
    return;
  }

  context.warningKeys.add(key);
  context.warnings.push(Object.freeze(warning));
};

const warn = (
  context: RenderContext,
  location: BlockLocation,
  code: DOCXMinimalWarningCode,
  message: string,
  severity: DOCXMinimalWarningSeverity = DOCX_MINIMAL_WARNING_CONTRACT[code].severity
) =>
  pushWarning(context, {
    code,
    severity,
    message,
    sectionIndex: location.sectionIndex,
    blockIndex: location.blockIndex,
    blockType: location.blockType,
    path: location.path
  });

interface RenderContext {
  warnings: DOCXMinimalExportWarning[];
  warningKeys: Set<string>;
  relationships: DOCXDocumentRelationshipRegistry;
  numbering: DOCXNumberingRegistry;
  media: DOCXMediaRegistry;
  paragraphStyles: DOCXParagraphStyleRegistry;
  noteNativeIds: Map<string, { kind: "footnote" | "endnote"; id: number }>;
}

type DOCXDocumentRelationship =
  | {
      id: string;
      type: "hyperlink";
      target: string;
      targetMode: "External";
    }
  | {
      id: string;
      type: "image";
      target: string;
    };

interface DOCXDocumentRelationshipRegistry {
  nextId: number;
  relationships: DOCXDocumentRelationship[];
  hyperlinkTargetToId: Map<string, string>;
}

interface DOCXNativeNoteRelationship {
  id: string;
  kind: "footnote" | "endnote";
}

interface DOCXNumberingDefinition {
  numId: string;
  kind: "ordered" | "bullet";
  start: number | null;
}

interface DOCXNumberingRegistry {
  nextNumId: number;
  definitions: DOCXNumberingDefinition[];
  signatureToNumId: Map<string, string>;
}

interface DOCXParagraphStyleDefinition {
  styleId: string;
  name: string | null;
  basedOn: string;
  headingLevel: number | null;
}

interface DOCXParagraphStyleRegistry {
  nextGeneratedId: number;
  definitions: DOCXParagraphStyleDefinition[];
  idToDefinition: Map<string, DOCXParagraphStyleDefinition>;
  generatedKeyToId: Map<string, string>;
}

interface DOCXMediaEntry {
  id: string;
  fileName: string;
  extension: "png" | "jpg";
  mimeType: "image/png" | "image/jpeg";
  bytes: Uint8Array;
  relationshipId: string;
}

interface DOCXMediaRegistry {
  nextImageId: number;
  entries: DOCXMediaEntry[];
  signatureToEntry: Map<string, DOCXMediaEntry>;
}

interface SupportedDOCXImageData {
  mimeType: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
  bytes: Uint8Array;
  base64: string;
}

interface BlockLocation {
  sectionIndex: number;
  blockIndex: number | null;
  blockType: string;
  path: string;
}

export const createDOCXMinimalExportInput = (
  irDocument: IRDocument
): Readonly<DOCXMinimalExportInputV1> => {
  const blocks = irDocument.sections.flatMap((section) => section.blocks);

  return Object.freeze({
    version: INPUT_VERSION,
    irDocument,
    styleSections: normalizeIRDocumentStyles(irDocument),
    tableCount: blocks.filter((block) => block.type === "table").length,
    objectCount: blocks.filter((block) => block.type === "object").length
  });
};

const renderRunProperties = (
  run: IRTextRun,
  context: RenderContext,
  location: BlockLocation,
  { includeLinkWarnings = true } = {}
) => {
  const fragments: string[] = [];
  const unsupported: string[] = [];

  run.marks.forEach((mark) => {
    const attrs = mark.attrs || {};

    switch (mark.type) {
      case "bold":
        fragments.push("<w:b/>");
        break;
      case "italic":
        fragments.push("<w:i/>");
        break;
      case "underline":
        fragments.push('<w:u w:val="single"/>');
        break;
      case "strike":
        fragments.push("<w:strike/>");
        break;
      case "code":
        fragments.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
        break;
      case "textStyle": {
        const color = stripHash(
          typeof attrs.color === "string" ? attrs.color : null
        );
        const background = stripHash(
          typeof attrs.backgroundColor === "string"
            ? attrs.backgroundColor
            : typeof attrs["background-color"] === "string"
              ? attrs["background-color"]
              : null
        );

        if (isSafeHexColor(color)) {
          fragments.push(`<w:color w:val="${color}"/>`);
        } else if (color) {
          unsupported.push("unsupported text color");
        }

        if (isSafeHexColor(background)) {
          fragments.push(`<w:shd w:val="clear" w:fill="${background}"/>`);
        } else if (background) {
          unsupported.push("unsupported background color");
        }
        break;
      }
      case "highlight": {
        const color = stripHash(
          typeof attrs.color === "string" ? attrs.color : null
        );

        if (isSafeHexColor(color)) {
          fragments.push(`<w:shd w:val="clear" w:fill="${color}"/>`);
        } else if (color) {
          unsupported.push("unsupported highlight color");
        }
        break;
      }
      case "link":
        if (includeLinkWarnings) {
          const linkInfo = getLinkInfo(run);

          if (linkInfo.href && isSupportedDOCXHyperlinkHref(linkInfo.href)) {
            warn(
              context,
              location,
              "docx-link-attribute-fallback",
              "DOCX foundation omits unsupported link target/title attrs."
            );
          } else {
            warn(
              context,
              location,
              "docx-link-target-fallback",
              "Unsupported link href is emitted as plain text."
            );
          }
        }
        break;
      case "subscript":
        fragments.push('<w:vertAlign w:val="subscript"/>');
        break;
      case "superscript":
        fragments.push('<w:vertAlign w:val="superscript"/>');
        break;
      case "inlineTag":
      case "unknown":
      default:
        unsupported.push(`unsupported mark: ${mark.type}`);
        break;
    }
  });

  if (unsupported.length > 0) {
    warn(
      context,
      location,
      "docx-run-style-fallback",
      Array.from(new Set(unsupported)).join("; ")
    );
  }

  return fragments.length ? `<w:rPr>${fragments.join("")}</w:rPr>` : "";
};

const renderInlineNode = (
  node: IRInlineNode,
  context: RenderContext,
  location: BlockLocation
) => {
  if (node.type === "hardBreak") {
    return "<w:r><w:br/></w:r>";
  }

  if (node.type === "noteReference") {
    const native = context.noteNativeIds.get(node.noteId);
    if (!native || native.kind !== node.kind) {
      throw new IRNoteCompatibilityError("DOCX_NOTE_EXPORT_INVALID_REFERENCE", "DOCX note reference has no native id.");
    }
    return `<w:r><w:${native.kind}Reference w:id="${native.id}"/></w:r>`;
  }

  const linkInfo = getLinkInfo(node);
  const runXml = [
    "<w:r>",
    renderRunProperties(node, context, location, {
      includeLinkWarnings: !linkInfo
    }),
    `<w:t xml:space="preserve">${escapeXml(node.text)}</w:t>`,
    "</w:r>"
  ].join("");

  if (!linkInfo) {
    return runXml;
  }

  if (!linkInfo.href || !isSupportedDOCXHyperlinkHref(linkInfo.href)) {
    warn(
      context,
      location,
      "docx-link-target-fallback",
      "Unsupported link href is emitted as plain text."
    );
    return runXml;
  }

  if (linkInfo.target || linkInfo.title) {
    warn(
      context,
      location,
      "docx-link-attribute-fallback",
      "DOCX foundation omits unsupported link target/title attrs."
    );
  }

  const relationshipId = registerDOCXHyperlinkRelationship(
    context.relationships,
    linkInfo.href
  );

  return `<w:hyperlink r:id="${escapeXml(relationshipId)}">${runXml}</w:hyperlink>`;
};

const getFirstString = (attrs: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = attrs[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const getLinkInfo = (run: IRTextRun) => {
  const mark = run.marks.find((candidate) => candidate.type === "link");

  if (!mark) {
    return null;
  }

  const attrs = mark.attrs || {};

  return {
    href: getFirstString(attrs, ["href"]),
    target: getFirstString(attrs, ["target"]),
    title: getFirstString(attrs, ["title"])
  };
};

const isSupportedDOCXHyperlinkHref = (href: string) => {
  const target = href.trim();

  if (!target) {
    return false;
  }

  try {
    const parsed = new URL(target);

    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const createDOCXDocumentRelationshipRegistry = (
  nextId = 3
): DOCXDocumentRelationshipRegistry => ({
    nextId,
    relationships: [],
    hyperlinkTargetToId: new Map()
  });

const createDOCXNumberingRegistry = (): DOCXNumberingRegistry => ({
  nextNumId: 1,
  definitions: [],
  signatureToNumId: new Map()
});

const createDOCXMediaRegistry = (): DOCXMediaRegistry => ({
  nextImageId: 1,
  entries: [],
  signatureToEntry: new Map()
});

const createDOCXParagraphStyleRegistry = (): DOCXParagraphStyleRegistry => ({
  nextGeneratedId: 1,
  definitions: [],
  idToDefinition: new Map(),
  generatedKeyToId: new Map()
});

const normalizeHeadingLevel = (level: unknown) =>
  Math.min(6, Math.max(1, toPositiveInt(level, 1)));

const getHeadingStyleId = (level: unknown) =>
  `Heading${normalizeHeadingLevel(level)}`;

const DOCX_BUILT_IN_PARAGRAPH_STYLE_IDS = new Set([
  "Normal",
  ...Array.from({ length: 6 }, (_, index) => `Heading${index + 1}`)
]);

const normalizeParagraphStyleText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isBuiltInParagraphStyleId = (styleId: string) =>
  DOCX_BUILT_IN_PARAGRAPH_STYLE_IDS.has(styleId);

const getBuiltInParagraphStyleName = (styleId: string) => {
  const headingMatch = /^Heading([1-6])$/.exec(styleId);

  return headingMatch ? `heading ${headingMatch[1]}` : styleId;
};

const isEquivalentBuiltInParagraphStyleName = (
  styleId: string,
  styleName: string
) => {
  const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();

  return (
    normalize(styleName) === normalize(styleId) ||
    normalize(styleName) === normalize(getBuiltInParagraphStyleName(styleId))
  );
};

const getDOCXListStart = (block: IRListBlock) => {
  if (block.listType !== "ordered") {
    return null;
  }

  return toPositiveInt(block.attrs.start, toPositiveInt(block.attrs.startNumber, 1));
};

const registerDOCXListNumbering = (
  registry: DOCXNumberingRegistry,
  block: IRListBlock
) => {
  const kind = block.listType === "ordered" ? "ordered" : "bullet";
  const start = getDOCXListStart(block);
  const signature = `${kind}:${start ?? "none"}`;
  const existing = registry.signatureToNumId.get(signature);

  if (existing) {
    return existing;
  }

  const numId = String(registry.nextNumId);
  registry.nextNumId += 1;
  registry.signatureToNumId.set(signature, numId);
  registry.definitions.push({ numId, kind, start });

  return numId;
};

const registerDOCXHyperlinkRelationship = (
  registry: DOCXDocumentRelationshipRegistry,
  href: string
) => {
  const target = href.trim();
  const existing = registry.hyperlinkTargetToId.get(target);

  if (existing) {
    return existing;
  }

  const id = `rId${registry.nextId}`;
  registry.nextId += 1;
  registry.hyperlinkTargetToId.set(target, id);
  registry.relationships.push({
    id,
    type: "hyperlink",
    target,
    targetMode: "External"
  });

  return id;
};

const registerDOCXImageRelationship = (
  relationshipRegistry: DOCXDocumentRelationshipRegistry,
  mediaRegistry: DOCXMediaRegistry,
  image: SupportedDOCXImageData
) => {
  const signature = `${image.mimeType}:${image.base64}`;
  const existing = mediaRegistry.signatureToEntry.get(signature);

  if (existing) {
    return existing;
  }

  const id = `image${mediaRegistry.nextImageId}`;
  const fileName = `${id}.${image.extension}`;
  const target = `media/${fileName}`;
  const relationshipId = `rId${relationshipRegistry.nextId}`;
  relationshipRegistry.nextId += 1;

  const entry: DOCXMediaEntry = {
    id,
    fileName,
    extension: image.extension,
    mimeType: image.mimeType,
    bytes: image.bytes,
    relationshipId
  };

  mediaRegistry.nextImageId += 1;
  mediaRegistry.signatureToEntry.set(signature, entry);
  mediaRegistry.entries.push(entry);
  relationshipRegistry.relationships.push({
    id: relationshipId,
    type: "image",
    target
  });

  return entry;
};

type DOCXParagraphExportAttrs = Pick<
  IRParagraphBlock["attrs"],
  | "docxParagraphSpacingBefore"
  | "docxParagraphSpacingAfter"
  | "docxParagraphSpacingLine"
  | "docxParagraphSpacingLineRule"
  | "docxParagraphStyleId"
  | "docxParagraphStyleName"
  | "docxParagraphTabs"
>;

const DOCX_SPACING_LINE_RULE_VALUES = Object.freeze([
  "auto",
  "exact",
  "atLeast"
] as const);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const normalizeDOCXLineRule = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  const match = DOCX_SPACING_LINE_RULE_VALUES.find(
    (candidate) => candidate.toLowerCase() === normalized.toLowerCase()
  );

  return match ?? null;
};

const buildParagraphSpacingXml = (
  attrs: DOCXParagraphExportAttrs
): string => {
  const parts: string[] = [];
  const before = attrs.docxParagraphSpacingBefore;
  const after = attrs.docxParagraphSpacingAfter;
  const line = attrs.docxParagraphSpacingLine;
  const lineRule = normalizeDOCXLineRule(attrs.docxParagraphSpacingLineRule);

  if (isFiniteNumber(before)) {
    parts.push(`w:before="${escapeXml(before)}"`);
  }

  if (isFiniteNumber(after)) {
    parts.push(`w:after="${escapeXml(after)}"`);
  }

  if (isFiniteNumber(line)) {
    parts.push(`w:line="${escapeXml(line)}"`);
  }

  if (lineRule) {
    parts.push(`w:lineRule="${escapeXml(lineRule)}"`);
  }

  return parts.length > 0 ? `<w:spacing ${parts.join(" ")}/>` : "";
};

const buildParagraphTabsXml = (attrs: DOCXParagraphExportAttrs): string => {
  const tabs = attrs.docxParagraphTabs;

  if (!tabs || !Array.isArray(tabs) || tabs.length === 0) {
    return "";
  }

  const tabXml = tabs
    .map((tab): string | null => {
      if (!tab || !isNonNegativeInt(tab.positionTwips)) {
        return null;
      }

      const type =
        typeof tab.type === "string" && tab.type.trim() ? tab.type.trim() : "left";
      const leader =
        typeof tab.leader === "string" && tab.leader.trim()
          ? tab.leader.trim()
          : null;
      const parts: string[] = [];

      parts.push(`w:val="${escapeXml(type)}"`);
      parts.push(`w:pos="${escapeXml(tab.positionTwips)}"`);

      if (leader) {
        parts.push(`w:leader="${escapeXml(leader)}"`);
      }

      return `<w:tab ${parts.join(" ")}/>`;
    })
    .filter((entry): entry is string => entry !== null);

  return tabXml.length > 0 ? `<w:tabs>${tabXml.join("")}</w:tabs>` : "";
};

const buildParagraphPropertiesXml = (
  attrs: DOCXParagraphExportAttrs,
  extraProperties = ""
): string => {
  // CT_PPr child element order is numPr < tabs < spacing, so keep numPr
  // (passed in extraProperties for native list paragraphs) before tabs and
  // spacing to stay schema-valid.
  const tabsXml = buildParagraphTabsXml(attrs);
  const spacingXml = buildParagraphSpacingXml(attrs);

  return `${extraProperties}${tabsXml}${spacingXml}`;
};

const getGeneratedParagraphStyleId = (
  registry: DOCXParagraphStyleRegistry,
  key: string
) => {
  const existing = registry.generatedKeyToId.get(key);

  if (existing) {
    return existing;
  }

  const styleId = `DockitParagraphStyle${registry.nextGeneratedId}`;
  registry.nextGeneratedId += 1;
  registry.generatedKeyToId.set(key, styleId);

  return styleId;
};

const registerParagraphStyleDefinition = (
  registry: DOCXParagraphStyleRegistry,
  definition: DOCXParagraphStyleDefinition,
  context: RenderContext,
  location: BlockLocation
) => {
  const existing = registry.idToDefinition.get(definition.styleId);

  if (existing) {
    if (
      existing.name !== definition.name ||
      existing.basedOn !== definition.basedOn ||
      existing.headingLevel !== definition.headingLevel
    ) {
      warn(
        context,
        location,
        "docx-paragraph-style-fallback",
        `DOCX minimal export reused paragraph style id '${definition.styleId}' and omitted conflicting style metadata for this paragraph.`
      );
    }

    return existing.styleId;
  }

  registry.idToDefinition.set(definition.styleId, definition);
  registry.definitions.push(definition);

  return definition.styleId;
};

const resolveParagraphStyleId = (
  attrs: DOCXParagraphExportAttrs,
  context: RenderContext,
  location: BlockLocation,
  options: { fallbackStyleId: string | null; headingLevel?: number | null }
) => {
  const fallbackStyleId = options.fallbackStyleId;
  const styleId = normalizeParagraphStyleText(attrs.docxParagraphStyleId);
  const styleName = normalizeParagraphStyleText(attrs.docxParagraphStyleName);
  const headingLevel = options.headingLevel ?? null;

  if (!styleId && !styleName) {
    return fallbackStyleId;
  }

  if (styleId && isBuiltInParagraphStyleId(styleId)) {
    if (
      styleName &&
      !isEquivalentBuiltInParagraphStyleName(styleId, styleName)
    ) {
      warn(
        context,
        location,
        "docx-paragraph-style-fallback",
        `DOCX minimal export reused built-in paragraph style id '${styleId}' and omitted custom style name metadata.`
      );
    }

    return styleId;
  }

  const basedOn = headingLevel ? getHeadingStyleId(headingLevel) : "Normal";
  const resolvedStyleId =
    styleId ||
    getGeneratedParagraphStyleId(
      context.paragraphStyles,
      `${basedOn}|${styleName ?? ""}`
    );

  return registerParagraphStyleDefinition(
    context.paragraphStyles,
    {
      styleId: resolvedStyleId,
      name: styleName,
      basedOn,
      headingLevel
    },
    context,
    location
  );
};

const renderParagraph = (
  runs: readonly IRInlineNode[],
  styleId: string | null,
  context: RenderContext,
  location: BlockLocation,
  paragraphProperties = ""
) =>
  [
    "<w:p>",
    styleId || paragraphProperties
      ? `<w:pPr>${
          styleId ? `<w:pStyle w:val="${escapeXml(styleId)}"/>` : ""
        }${paragraphProperties}</w:pPr>`
      : "",
    runs.map((run) => renderInlineNode(run, context, location)).join(""),
    "</w:p>"
  ].join("");

const renderBlock = (
  block: IRBlock,
  context: RenderContext,
  location: BlockLocation
): string => {
  switch (block.type) {
    case "paragraph":
      return renderParagraph(
        block.runs,
        resolveParagraphStyleId(block.attrs, context, location, {
          fallbackStyleId: null
        }),
        context,
        location,
        buildParagraphPropertiesXml(block.attrs)
      );
    case "heading": {
      const headingStyleId = getHeadingStyleId(block.attrs.level);

      return renderParagraph(
        block.runs,
        resolveParagraphStyleId(block.attrs, context, location, {
          fallbackStyleId: headingStyleId,
          headingLevel: normalizeHeadingLevel(block.attrs.level)
        }),
        context,
        location,
        buildParagraphPropertiesXml(block.attrs)
      );
    }
    case "list":
      return renderList(block, context, location);
    case "table":
      return renderTable(block, context, location);
    case "object":
      return renderObject(block, context, location);
    case "unsupported":
    default:
      return renderUnsupported(block, context, location);
  }
};

const renderList = (
  block: IRListBlock,
  context: RenderContext,
  location: BlockLocation
) => {
  if (isNativeDOCXList(block)) {
    return block.items
      .map((item, itemIndex) =>
        renderNativeListItem(block, item, itemIndex, context, location)
      )
      .join("");
  }

  warn(
    context,
    location,
    "docx-list-fallback",
    "DOCX foundation writes list markers as paragraph text."
  );

  return block.items
    .map((item, itemIndex) => renderListItem(block, item, itemIndex, context, location))
    .join("");
};

const getListMarker = (block: IRListBlock, itemIndex: number, item: IRListItem) => {
  if (block.listType === "ordered") {
    const start =
      typeof block.attrs.start === "number"
        ? block.attrs.start
        : typeof block.attrs.startNumber === "number"
          ? block.attrs.startNumber
          : 1;

    return `${start + itemIndex}. `;
  }

  if (block.listType === "task") {
    return item.attrs?.checked === true ? "[x] " : "[ ] ";
  }

  return "- ";
};

const renderListItem = (
  block: IRListBlock,
  item: IRListItem,
  itemIndex: number,
  context: RenderContext,
  location: BlockLocation
) => {
  const marker = getListMarker(block, itemIndex, item);
  const markerParagraph = renderParagraph(
    [{ type: "textRun", text: marker, marks: [] }],
    null,
    context,
    { ...location, path: `${location.path}.items.${itemIndex}.marker` }
  );

  return [
    markerParagraph,
    item.blocks
      .map((childBlock, childIndex) =>
        renderBlock(childBlock, context, {
          ...location,
          blockType: childBlock.type,
          path: `${location.path}.items.${itemIndex}.blocks.${childIndex}`
        })
      )
      .join("")
  ].join("");
};

const isNativeDOCXList = (block: IRListBlock) => {
  const model = normalizeListNumbering(block);

  return (
    model.maxDepth === 0 &&
    (block.listType === "ordered" || block.listType === "bullet") &&
    !hasCustomDOCXListMarker(block) &&
    model.items.every((item) => item.childListCount === 0)
  );
};

const hasCustomDOCXListMarker = (block: IRListBlock) => {
  const attrs = block.attrs || {};
  const markerKind = attrs.markerKind;
  const markerFormat = attrs.markerFormat;

  if (
    typeof markerKind === "string" &&
    markerKind.trim() &&
    markerKind !== block.listType
  ) {
    return true;
  }

  if (
    typeof markerFormat === "string" &&
    markerFormat.trim() &&
    ((block.listType === "ordered" && markerFormat !== "decimal") ||
      (block.listType === "bullet" && markerFormat !== "bullet"))
  ) {
    return true;
  }

  return ["marker", "markerText", "listStyleType"].some(
    (key) => typeof attrs[key] === "string" && String(attrs[key]).trim()
  );
};

const renderNativeListItem = (
  block: IRListBlock,
  item: IRListItem,
  itemIndex: number,
  context: RenderContext,
  location: BlockLocation
) => {
  const numId = registerDOCXListNumbering(context.numbering, block);
  const numPr = `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${escapeXml(
    numId
  )}"/></w:numPr>`;

  return item.blocks
    .map((childBlock, childIndex) => {
      const childLocation = {
        ...location,
        blockType: childBlock.type,
        path: `${location.path}.items.${itemIndex}.blocks.${childIndex}`
      };

      if (childBlock.type === "paragraph") {
        return renderParagraph(
          childBlock.runs,
          resolveParagraphStyleId(childBlock.attrs, context, childLocation, {
            fallbackStyleId: null
          }),
          context,
          childLocation,
          buildParagraphPropertiesXml(childBlock.attrs, numPr)
        );
      }

      if (childBlock.type === "heading") {
        const headingStyleId = getHeadingStyleId(childBlock.attrs.level);

        return renderParagraph(
          childBlock.runs,
          resolveParagraphStyleId(childBlock.attrs, context, childLocation, {
            fallbackStyleId: headingStyleId,
            headingLevel: normalizeHeadingLevel(childBlock.attrs.level)
          }),
          context,
          childLocation,
          buildParagraphPropertiesXml(childBlock.attrs, numPr)
        );
      }

      warn(
        context,
        childLocation,
        "docx-list-fallback",
        "DOCX native numbering only applies to paragraph-like top-level list items."
      );

      return [
        renderParagraph(
          [{ type: "textRun", text: getListMarker(block, itemIndex, item), marks: [] }],
          null,
          context,
          { ...childLocation, path: `${childLocation.path}.marker` }
        ),
        renderBlock(childBlock, context, childLocation)
      ].join("");
    })
    .join("");
};

const DOCX_TABLE_BORDER_SIDE_NAMES = Object.freeze({
  top: "w:top",
  right: "w:right",
  bottom: "w:bottom",
  left: "w:left"
});

const DOCX_TABLE_BORDER_STYLE_MAP = Object.freeze({
  solid: "single",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
  none: "nil"
});

const tableLengthToBorderSize = (
  width: { value: number; unit: string } | null
) => {
  if (!width || !Number.isFinite(width.value) || width.value < 0) {
    return null;
  }

  const points =
    width.unit === "mm"
      ? width.value * 2.834645669
      : width.unit === "px" || width.unit === "unknown"
        ? width.value * 0.75
        : width.unit === "pt"
          ? width.value
          : null;

  if (points === null || !Number.isFinite(points)) {
    return null;
  }

  return Math.max(0, Math.min(96, Math.round(points * 8)));
};

const tableLengthToTwips = (
  width: { value: number; unit: string } | null
) => {
  if (!width || !Number.isFinite(width.value) || width.value <= 0) {
    return null;
  }

  switch (width.unit) {
    case "pt":
      return Math.round(width.value * 20);
    case "px":
    case "unknown":
      return Math.round(width.value * 15);
    case "mm":
      return Math.round(width.value * 56.69291339);
    default:
      return null;
  }
};

const renderDOCXBorderLine = (
  line: {
    side: string;
    color: string | null;
    style: string | null;
    width: { value: number; unit: string } | null;
    source: string;
  },
  tagName: string
) => {
  if (line.source === "none") {
    return { xml: "", unsupported: [] as string[] };
  }

  const unsupported: string[] = [];
  const val =
    line.style && Object.prototype.hasOwnProperty.call(DOCX_TABLE_BORDER_STYLE_MAP, line.style)
      ? DOCX_TABLE_BORDER_STYLE_MAP[line.style as keyof typeof DOCX_TABLE_BORDER_STYLE_MAP]
      : line.style
        ? null
        : "single";
  const color = normalizeHexColor(line.color);
  const size = tableLengthToBorderSize(line.width);

  if (!val) {
    unsupported.push(`unsupported ${line.side} border style`);
  }

  if (line.color && !color) {
    unsupported.push(`unsupported ${line.side} border color`);
  }

  if (line.width && size === null) {
    unsupported.push(`unsupported ${line.side} border width`);
  }

  if (unsupported.length > 0) {
    return { xml: "", unsupported };
  }

  return {
    xml: `<${tagName} w:val="${val}" w:sz="${size ?? 4}" w:space="0" w:color="${color ?? "auto"}"/>`,
    unsupported
  };
};

const renderDOCXBorderBox = (
  borderBox: {
    sides: Record<
      string,
      {
        side: string;
        color: string | null;
        style: string | null;
        width: { value: number; unit: string } | null;
        source: string;
      }
    >;
  },
  containerTag: "w:tblBorders" | "w:tcBorders"
) => {
  const rendered = (["top", "left", "bottom", "right"] as const).map((side) =>
    renderDOCXBorderLine(
      borderBox.sides[side],
      DOCX_TABLE_BORDER_SIDE_NAMES[side]
    )
  );
  const xml = rendered.map((result) => result.xml).join("");
  const unsupported = rendered.flatMap((result) => result.unsupported);

  if (!xml) {
    return { xml: "", unsupported };
  }

  const insideXml =
    containerTag === "w:tblBorders"
      ? (() => {
          const top = renderDOCXBorderLine(borderBox.sides.top, "w:insideH").xml;
          const left = renderDOCXBorderLine(borderBox.sides.left, "w:insideV").xml;

          return `${top}${left}`;
        })()
      : "";

  return {
    xml: `<${containerTag}>${xml}${insideXml}</${containerTag}>`,
    unsupported
  };
};

const renderDOCXCellFill = (colorValue: unknown) => {
  if (typeof colorValue !== "string" || !colorValue.trim()) {
    return { xml: "", unsupported: false };
  }

  const color = normalizeHexColor(colorValue);

  if (!color) {
    return { xml: "", unsupported: true };
  }

  return {
    xml: `<w:shd w:val="clear" w:fill="${escapeXml(color)}"/>`,
    unsupported: false
  };
};

const renderTable = (
  block: IRTableBlock,
  context: RenderContext,
  location: BlockLocation
) => {
  const tableModel = normalizeTableModel(block);
  const tableBorders = renderDOCXBorderBox(tableModel.tableBorder, "w:tblBorders");
  const tableGrid = renderDOCXTableGrid(tableModel.columns);

  if (
    tableModel.unsupported.length > 0 ||
    tableModel.cells.some((cell) => cell.gridColumnSpan > 1)
  ) {
    warn(
      context,
      location,
      "docx-table-style-fallback",
      "DOCX foundation keeps table text/grid but omits advanced table layout fidelity."
    );
  }

  if (tableBorders.unsupported.length > 0) {
    warn(
      context,
      location,
      "docx-table-border-fallback",
      tableBorders.unsupported.join("; ")
    );
  }

  return [
    "<w:tbl>",
    `<w:tblPr><w:tblW w:w="0" w:type="auto"/>${tableBorders.xml}</w:tblPr>`,
    tableGrid,
    Array.from({ length: tableModel.rowCount }, (_, rowIndex) =>
      renderDOCXTableRow(block, tableModel, rowIndex, context, location)
    ).join(""),
    "</w:tbl>"
  ].join("");
};

const renderDOCXTableGrid = (
  columns: readonly {
    width: { value: number; unit: string } | null;
  }[]
) => {
  const gridCols = columns
    .map((column) => tableLengthToTwips(column.width))
    .map((width) => (width ? `<w:gridCol w:w="${width}"/>` : "<w:gridCol/>"))
    .join("");

  return gridCols ? `<w:tblGrid>${gridCols}</w:tblGrid>` : "";
};

const getTableCellLocation = (
  location: BlockLocation,
  rowIndex: number,
  cellIndex: number,
  suffix = ""
) => ({
  ...location,
  blockType: "tableCell",
  path: `${location.path}.rows.${rowIndex}.cells.${cellIndex}${suffix}`
});

const renderDOCXTableRow = (
  block: IRTableBlock,
  tableModel: ReturnType<typeof normalizeTableModel>,
  rowIndex: number,
  context: RenderContext,
  location: BlockLocation
) => {
  const starters = tableModel.cells
    .filter((cell) => cell.rowIndex === rowIndex)
    .map((modelCell) => ({
      gridColumnStart: modelCell.gridColumnStart,
      xml: renderTableCell(
        block.rows[modelCell.rowIndex].cells[modelCell.cellIndex],
        modelCell,
        context,
        getTableCellLocation(location, modelCell.rowIndex, modelCell.cellIndex),
        modelCell.gridRowSpan > 1 ? "restart" as const : null
      )
    }));
  const continuations = tableModel.cells
    .filter(
      (cell) =>
        cell.rowIndex < rowIndex && rowIndex < cell.rowIndex + cell.gridRowSpan
    )
    .map((modelCell) => ({
      gridColumnStart: modelCell.gridColumnStart,
      xml: renderTableCell(
        block.rows[modelCell.rowIndex].cells[modelCell.cellIndex],
        modelCell,
        context,
        getTableCellLocation(
          location,
          modelCell.rowIndex,
          modelCell.cellIndex,
          `.vMergeContinueRow${rowIndex}`
        ),
        "continue"
      )
    }));

  return `<w:tr>${[...starters, ...continuations]
    .sort((left, right) => left.gridColumnStart - right.gridColumnStart)
    .map((entry) => entry.xml)
    .join("")}</w:tr>`;
};

const renderTableCell = (
  cell: IRTableCell,
  modelCell:
    | {
        gridColumnSpan: number;
        border: {
          sides: Record<
            string,
            {
              side: string;
              color: string | null;
              style: string | null;
              width: { value: number; unit: string } | null;
              source: string;
            }
          >;
        };
      }
    | undefined,
  context: RenderContext,
  location: BlockLocation,
  verticalMerge: "restart" | "continue" | null = null
) => {
  const colspan = modelCell?.gridColumnSpan ?? toPositiveInt(cell.attrs.colspan, 1);
  const cellBorders = modelCell
    ? renderDOCXBorderBox(modelCell.border, "w:tcBorders")
    : { xml: "", unsupported: [] as string[] };
  const fill =
    verticalMerge === "continue"
      ? { xml: "", unsupported: false }
      : renderDOCXCellFill(cell.attrs.backgroundColor);

  if (cellBorders.unsupported.length > 0) {
    warn(
      context,
      location,
      "docx-table-border-fallback",
      cellBorders.unsupported.join("; ")
    );
  }

  if (fill.unsupported) {
    warn(
      context,
      location,
      "docx-table-fill-fallback",
      "Unsupported DOCX table cell fill color is omitted."
    );
  }

  const tcPr = [
    "<w:tcPr>",
    colspan > 1 ? `<w:gridSpan w:val="${colspan}"/>` : "",
    verticalMerge ? `<w:vMerge w:val="${verticalMerge}"/>` : "",
    cellBorders.xml,
    fill.xml,
    "</w:tcPr>"
  ].join("");

  return [
    "<w:tc>",
    tcPr,
    verticalMerge === "continue"
      ? "<w:p/>"
      : cell.blocks.length
      ? cell.blocks
          .map((block, blockIndex) =>
            renderBlock(block, context, {
              ...location,
              blockType: block.type,
              path: `${location.path}.blocks.${blockIndex}`
            })
          )
          .join("")
      : "<w:p/>",
    "</w:tc>"
  ].join("");
};

const decodeBase64Bytes = (base64: string) => {
  try {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
};

const hasPNGSignature = (bytes: Uint8Array) =>
  bytes.length >= 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47 &&
  bytes[4] === 0x0d &&
  bytes[5] === 0x0a &&
  bytes[6] === 0x1a &&
  bytes[7] === 0x0a;

const hasJPEGSignature = (bytes: Uint8Array) =>
  bytes.length >= 4 &&
  bytes[0] === 0xff &&
  bytes[1] === 0xd8 &&
  bytes[bytes.length - 2] === 0xff &&
  bytes[bytes.length - 1] === 0xd9;

const parseSupportedDOCXImageDataUri = (
  source: string | null
): SupportedDOCXImageData | null => {
  const match = source?.match(/^data:(image\/png|image\/jpe?g);base64,([\s\S]+)$/i);

  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const base64 = match[2].replace(/\s+/g, "");
  const bytes = decodeBase64Bytes(base64);

  if (!bytes || bytes.length === 0 || bytes.length > DOCX_MAX_EMBEDDED_IMAGE_BYTES) {
    return null;
  }

  if (mimeType === "image/png" && !hasPNGSignature(bytes)) {
    return null;
  }

  if (mimeType === "image/jpeg" && !hasJPEGSignature(bytes)) {
    return null;
  }

  return {
    mimeType,
    extension,
    bytes,
    base64
  };
};

const lengthToEMU = (
  length: { value: number; unit: string } | null,
  fallback: number
) => {
  if (!length || !Number.isFinite(length.value) || length.value <= 0) {
    return fallback;
  }

  switch (length.unit) {
    case "mm":
      return Math.round(length.value * 36000);
    case "pt":
      return Math.round(length.value * 12700);
    case "px":
    case "unknown":
      return Math.round(length.value * 9525);
    default:
      return fallback;
  }
};

const DOCX_ANCHOR_MODE_TO_RELATIVE_FROM = {
  page: "page",
  column: "column",
  paragraph: "paragraph",
  character: "character"
} as const;

const getDOCXAnchorRelativeFrom = (
  anchorMode: string | null,
  axis: "horizontal" | "vertical"
) => {
  if (anchorMode && anchorMode in DOCX_ANCHOR_MODE_TO_RELATIVE_FROM) {
    return DOCX_ANCHOR_MODE_TO_RELATIVE_FROM[
      anchorMode as keyof typeof DOCX_ANCHOR_MODE_TO_RELATIVE_FROM
    ];
  }

  return axis === "horizontal" ? "column" : "paragraph";
};

const shouldRenderDOCXAnchor = ({
  flowMode,
  anchorMode
}: {
  flowMode: string | null;
  anchorMode: string | null;
}) =>
  flowMode === "floating" ||
  flowMode === "behindText" ||
  flowMode === "inFrontOfText" ||
  (anchorMode !== null && anchorMode !== "inline");

const renderImageDrawingParagraph = ({
  relationshipId,
  mediaEntry,
  label,
  description,
  widthEmu,
  heightEmu,
  flowMode,
  anchorMode
}: {
  relationshipId: string;
  mediaEntry: DOCXMediaEntry;
  label: string;
  description: string;
  widthEmu: number;
  heightEmu: number;
  flowMode: string | null;
  anchorMode: string | null;
}) => {
  const docPrId = escapeXml(mediaEntry.id.replace(/\D/g, "") || "1");
  const pictureXml = [
    `<wp:extent cx="${widthEmu}" cy="${heightEmu}"/>`,
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
    `<wp:docPr id="${docPrId}" name="${escapeXml(label)}" descr="${escapeXml(
      description
    )}"/>`,
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(
      mediaEntry.fileName
    )}" descr="${escapeXml(description)}"/><pic:cNvPicPr/></pic:nvPicPr>`,
    `<pic:blipFill><a:blip r:embed="${escapeXml(
      relationshipId
    )}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`,
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`,
    "</a:graphicData></a:graphic>"
  ].join("");

  if (shouldRenderDOCXAnchor({ flowMode, anchorMode })) {
    const relativeFromH = getDOCXAnchorRelativeFrom(anchorMode, "horizontal");
    const relativeFromV = getDOCXAnchorRelativeFrom(anchorMode, "vertical");
    const behindDoc = flowMode === "behindText" ? "1" : "0";

    return [
      "<w:p><w:r><w:drawing>",
      `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="${behindDoc}" locked="0" layoutInCell="1" allowOverlap="1">`,
      '<wp:simplePos x="0" y="0"/>',
      `<wp:positionH relativeFrom="${relativeFromH}"><wp:posOffset>0</wp:posOffset></wp:positionH>`,
      `<wp:positionV relativeFrom="${relativeFromV}"><wp:posOffset>0</wp:posOffset></wp:positionV>`,
      '<wp:wrapSquare wrapText="bothSides"/>',
      pictureXml,
      "</wp:anchor>",
      "</w:drawing></w:r></w:p>"
    ].join("");
  }

  return [
    "<w:p><w:r><w:drawing>",
    `<wp:inline distT="0" distB="0" distL="0" distR="0">${pictureXml}</wp:inline>`,
    "</w:drawing></w:r></w:p>"
  ].join("");
};

const renderObject = (
  block: IRObjectBlock,
  context: RenderContext,
  location: BlockLocation
) => {
  const objectModel = normalizeObjectModel(block);
  const label =
    objectModel.metadata.altText ||
    objectModel.metadata.title ||
    objectModel.relationship.fileName ||
    objectModel.relationship.objectId ||
    block.objectType;

  if (objectModel.objectKind === "image") {
    const imageData = parseSupportedDOCXImageDataUri(objectModel.relationship.target);

    if (imageData) {
      const mediaEntry = registerDOCXImageRelationship(
        context.relationships,
        context.media,
        imageData
      );
      const widthEmu = lengthToEMU(
        objectModel.size.width,
        DOCX_DEFAULT_IMAGE_WIDTH_EMU
      );
      const heightEmu = lengthToEMU(
        objectModel.size.height,
        DOCX_DEFAULT_IMAGE_HEIGHT_EMU
      );
      const description =
        objectModel.metadata.altText ||
        objectModel.metadata.description ||
        objectModel.metadata.title ||
        "";

      return renderImageDrawingParagraph({
        relationshipId: mediaEntry.relationshipId,
        mediaEntry,
        label,
        description,
        widthEmu,
        heightEmu,
        flowMode: objectModel.flowMode,
        anchorMode: objectModel.anchorMode
      });
    }

    if (objectModel.relationship.targetKind === "data-uri") {
      warn(
        context,
        location,
        "docx-image-relationship-fallback",
        "DOCX foundation only embeds valid PNG/JPEG data URI images."
      );
    }
  }

  warn(
    context,
    location,
    "docx-object-placeholder",
    `DOCX foundation uses visible placeholder for ${block.objectType}.`
  );

  return renderParagraph(
    [
      {
        type: "textRun",
        text: `[Object placeholder: ${block.objectType} ${label}]`,
        marks: []
      }
    ],
    null,
    context,
    location
  );
};

const normalizeRawText = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (typeof record.textContent === "string" && record.textContent.trim()) {
      return record.textContent.trim();
    }

    if (typeof record.text === "string" && record.text.trim()) {
      return record.text.trim();
    }

    if (Array.isArray(record.content)) {
      const text = record.content
        .map((item) => normalizeRawText(item))
        .filter(Boolean)
        .join("\n")
        .trim();

      return text || null;
    }
  }

  return null;
};

const renderUnsupported = (
  block: IRUnsupportedBlock,
  context: RenderContext,
  location: BlockLocation
) => {
  const fallbackText =
    normalizeRawText(block.raw) || `[Unsupported block: ${block.nodeType}]`;

  warn(
    context,
    location,
    "docx-unsupported-block",
    `Unsupported ${block.nodeType} is emitted as fallback text.`
  );

  return renderParagraph(
    [{ type: "textRun", text: fallbackText, marks: [] }],
    null,
    context,
    location
  );
};

const buildDocumentXml = (
  input: DOCXMinimalExportInputV1,
  context: RenderContext
) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<w:document ${WORD_NS}>`,
    "<w:body>",
    input.irDocument.sections
      .map((section, sectionIndex) =>
        section.blocks
          .map((block, blockIndex) =>
            renderBlock(block, context, {
              sectionIndex,
              blockIndex,
              blockType: block.type,
              path: `sections.${sectionIndex}.blocks.${blockIndex}`
            })
          )
          .join("")
      )
      .join(""),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>',
    "</w:body>",
    "</w:document>"
  ].join("");

const assertDOCXNoteBodyRepresentable = (note: Readonly<IRNoteBody>) => {
  note.paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraph.attrs && Object.keys(paragraph.attrs).length) {
      throw new IRNoteCompatibilityError(
        "DOCX_NOTE_EXPORT_PARAGRAPH_ATTR_UNSUPPORTED",
        `DOCX note paragraph attrs are not faithfully representable: ${note.noteId}.${paragraphIndex}.`
      );
    }

    paragraph.runs.forEach((run, runIndex) => {
      if (run.type !== "textRun") return;

      const seenMarkTypes = new Set<string>();
      run.marks.forEach((mark) => {
        const attrs = mark.attrs ?? {};
        const attrKeys = Object.keys(attrs);

        if (seenMarkTypes.has(mark.type)) {
          throw new IRNoteCompatibilityError(
            "DOCX_NOTE_EXPORT_MARK_UNSUPPORTED",
            `DOCX note mark is duplicated: ${note.noteId}.${paragraphIndex}.${runIndex}.${mark.type}.`
          );
        }

        seenMarkTypes.add(mark.type);

        if (mark.type === "link") {
          const href = typeof attrs.href === "string" ? attrs.href : "";
          if (
            attrKeys.some((key) => key !== "href") ||
            !isSupportedDOCXHyperlinkHref(href)
          ) {
            throw new IRNoteCompatibilityError(
              "DOCX_NOTE_EXPORT_UNSAFE_LINK",
              `DOCX note hyperlink is unsafe or has unsupported attributes: ${note.noteId}.`
            );
          }
          return;
        }

        if (mark.type === "textStyle") {
          const color =
            typeof attrs.color === "string" ? stripHash(attrs.color) : null;
          if (
            attrKeys.length !== 1 ||
            attrKeys[0] !== "color" ||
            !isSafeHexColor(color)
          ) {
            throw new IRNoteCompatibilityError(
              "DOCX_NOTE_EXPORT_MARK_UNSUPPORTED",
              `DOCX note textStyle attrs are not faithfully representable: ${note.noteId}.${paragraphIndex}.${runIndex}.`
            );
          }
          return;
        }

        if (
          ![
            "bold",
            "italic",
            "underline",
            "strike",
            "subscript",
            "superscript"
          ].includes(mark.type) ||
          attrKeys.length > 0
        ) {
          throw new IRNoteCompatibilityError(
            "DOCX_NOTE_EXPORT_MARK_UNSUPPORTED",
            `DOCX note mark is not faithfully representable: ${note.noteId}.${paragraphIndex}.${runIndex}.${mark.type}.`
          );
        }
      });
    });
  });
};

const buildNotePart = (
  kind: "footnote" | "endnote",
  notes: readonly Readonly<IRNoteBody>[],
  context: RenderContext
) => {
  const noteContext: RenderContext = {
    ...context,
    relationships: createDOCXDocumentRelationshipRegistry(1)
  };
  const element = kind === "footnote" ? "footnote" : "endnote";
  const marker = kind === "footnote" ? "footnoteRef" : "endnoteRef";
  const bodyXml = notes
    .map((note) => {
      const id = context.noteNativeIds.get(note.noteId)?.id;
      return [
        `<w:${element} w:id="${id}">`,
        note.paragraphs
          .map((paragraph, paragraphIndex) =>
            [
              "<w:p>",
              paragraphIndex === 0 ? `<w:r><w:${marker}/></w:r>` : "",
              paragraph.runs
                .map((run) =>
                  renderInlineNode(run, noteContext, {
                    sectionIndex: 0,
                    blockIndex: null,
                    blockType: "note",
                    path: `notes.${note.noteId}.paragraphs.${paragraphIndex}`
                  })
                )
                .join(""),
              "</w:p>"
            ].join("")
          )
          .join(""),
        `</w:${element}>`
      ].join("");
    })
    .join("");
  const special = [
    `<w:${element} w:id="-1" w:type="separator"><w:p><w:r><w:separator/></w:r></w:p></w:${element}>`,
    `<w:${element} w:id="0" w:type="continuationSeparator"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:${element}>`
  ].join("");

  return {
    xml: [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      `<w:${kind}s ${WORD_NS}>`,
      special,
      bodyXml,
      `</w:${kind}s>`
    ].join(""),
    relationships: noteContext.relationships
  };
};

const buildCustomParagraphStyleXml = (
  definition: DOCXParagraphStyleDefinition
) => {
  const nameXml = definition.name
    ? `<w:name w:val="${escapeXml(definition.name)}"/>`
    : "";
  const headingXml = definition.headingLevel
    ? `<w:qFormat/><w:pPr><w:outlineLvl w:val="${escapeXml(
        definition.headingLevel - 1
      )}"/></w:pPr>`
    : "";

  return `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${escapeXml(
    definition.styleId
  )}">${nameXml}<w:basedOn w:val="${escapeXml(
    definition.basedOn
  )}"/>${headingXml}</w:style>`;
};

const buildStylesXml = (registry: DOCXParagraphStyleRegistry) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<w:styles ${WORD_NS}>`,
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
    ...Array.from({ length: 6 }, (_, index) => {
      const level = index + 1;
      return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="${index}"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>`;
    }),
    ...registry.definitions.map(buildCustomParagraphStyleXml),
    "</w:styles>"
  ].join("");

const buildContentTypesXml = (
  noteKinds: readonly ("footnote" | "endnote")[] = []
) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Types ${CONTENT_TYPES_NS}>`,
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
    '<Default Extension="jpg" ContentType="image/jpeg"/>',
    '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
    ...noteKinds.map(
      (kind) =>
        `<Override PartName="/word/${kind}s.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}s+xml"/>`
    ),
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    "</Types>"
  ].join("");

const buildRootRelsXml = () =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships ${REL_NS}>`,
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
    "</Relationships>"
  ].join("");

const buildDocumentRelsXml = (
  registry: DOCXDocumentRelationshipRegistry,
  noteRelationships: readonly Readonly<DOCXNativeNoteRelationship>[] = []
) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships ${REL_NS}>`,
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    ...noteRelationships.map(
      ({ id, kind }) =>
        `<Relationship Id="${escapeXml(
          id
        )}" Type="${DOCX_REL_TYPE_PREFIX}${kind}s" Target="${kind}s.xml"/>`
    ),
    ...registry.relationships.map(
      (relationship) => {
        if (relationship.type === "hyperlink") {
          return `<Relationship Id="${escapeXml(
            relationship.id
          )}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(
            relationship.target
          )}" TargetMode="${relationship.targetMode}"/>`;
        }

        return `<Relationship Id="${escapeXml(
          relationship.id
        )}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${escapeXml(
          relationship.target
        )}"/>`;
      }
    ),
    "</Relationships>"
  ].join("");

const buildNoteRelsXml = (registry: DOCXDocumentRelationshipRegistry) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships ${REL_NS}>`,
    ...registry.relationships
      .filter((relationship) => relationship.type === "hyperlink")
      .map(
        (relationship) =>
          `<Relationship Id="${escapeXml(
            relationship.id
          )}" Type="${DOCX_REL_TYPE_PREFIX}hyperlink" Target="${escapeXml(
            relationship.target
          )}" TargetMode="External"/>`
      ),
    "</Relationships>"
  ].join("");

const buildNumberingXml = (registry: DOCXNumberingRegistry) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<w:numbering ${WORD_NS}>`,
    '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>',
    '<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl></w:abstractNum>',
    ...registry.definitions.map((definition) => {
      const abstractNumId = definition.kind === "ordered" ? "1" : "2";
      const startOverride =
        definition.kind === "ordered" && definition.start !== null
          ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${escapeXml(
              String(definition.start)
            )}"/></w:lvlOverride>`
          : "";

      return `<w:num w:numId="${escapeXml(
        definition.numId
      )}"><w:abstractNumId w:val="${abstractNumId}"/>${startOverride}</w:num>`;
    }),
    "</w:numbering>"
  ].join("");

const buildCoreXml = (input: DOCXMinimalExportInputV1) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    "<dc:title>Dockit DOCX minimal export spike</dc:title>",
    "<dc:creator>Dockit IR</dc:creator>",
    `<dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(
      input.irDocument.metadata.extractedAt
    )}</dcterms:created>`,
    "</cp:coreProperties>"
  ].join("");

const buildAppXml = () =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    "<Application>Dockit</Application>",
    "</Properties>"
  ].join("");

const createPackageSummary = (
  entries: readonly Readonly<DOCXMinimalPackageEntry>[]
): Readonly<DOCXMinimalPackageSummary> => {
  const entryPaths = new Set(entries.map((entry) => entry.path));

  return Object.freeze({
    entryCount: entries.length,
    requiredEntries: Object.freeze({
      "[Content_Types].xml": entryPaths.has("[Content_Types].xml"),
      "_rels/.rels": entryPaths.has("_rels/.rels"),
      "word/document.xml": entryPaths.has("word/document.xml"),
      "word/_rels/document.xml.rels": entryPaths.has(
        "word/_rels/document.xml.rels"
      ),
      "word/styles.xml": entryPaths.has("word/styles.xml"),
      "word/numbering.xml": entryPaths.has("word/numbering.xml")
    }),
    documentPart: "word/document.xml",
    hasStyles: entryPaths.has("word/styles.xml"),
    hasCoreProperties: entryPaths.has("docProps/core.xml"),
    hasAppProperties: entryPaths.has("docProps/app.xml")
  });
};

export const exportIRToMinimalDOCX = (
  input: DOCXMinimalExportInputV1
): Readonly<DOCXMinimalExportResult> => {
  assertValidIRNoteSemantics(input.irDocument);
  const references = getIRNoteReferences(input.irDocument);
  (input.irDocument.notes ?? []).forEach(assertDOCXNoteBodyRepresentable);
  const context: RenderContext = {
    warnings: [],
    warningKeys: new Set(),
    relationships: createDOCXDocumentRelationshipRegistry(),
    numbering: createDOCXNumberingRegistry(),
    media: createDOCXMediaRegistry(),
    paragraphStyles: createDOCXParagraphStyleRegistry(),
    noteNativeIds: new Map()
  };
  const kindCounters = { footnote: 0, endnote: 0 };
  references.forEach((reference) => {
    kindCounters[reference.kind] += 1;
    context.noteNativeIds.set(reference.noteId, { kind: reference.kind, id: kindCounters[reference.kind] });
  });
  const noteKinds = (["footnote", "endnote"] as const).filter(
    (kind) => kindCounters[kind] > 0
  );
  const noteParts = noteKinds.map((kind) => ({
    kind,
    ...buildNotePart(
      kind,
      (input.irDocument.notes ?? []).filter((note) => note.kind === kind),
      context
    )
  }));
  const documentXml = buildDocumentXml(input, context);
  const noteRelationships = noteKinds.map((kind) => {
    const relationship = {
      id: `rId${context.relationships.nextId}`,
      kind
    } satisfies DOCXNativeNoteRelationship;

    context.relationships.nextId += 1;
    return relationship;
  });
  const entries = freezeArray<DOCXMinimalPackageEntry>([
    Object.freeze({
      path: "[Content_Types].xml",
      mediaType: "application/xml",
      content: buildContentTypesXml(noteKinds)
    }),
    Object.freeze({
      path: "_rels/.rels",
      mediaType: "application/vnd.openxmlformats-package.relationships+xml",
      content: buildRootRelsXml()
    }),
    Object.freeze({
      path: "word/document.xml",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      content: documentXml
    }),
    Object.freeze({
      path: "word/_rels/document.xml.rels",
      mediaType: "application/vnd.openxmlformats-package.relationships+xml",
      content: buildDocumentRelsXml(context.relationships, noteRelationships)
    }),
    Object.freeze({
      path: "word/styles.xml",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
      content: buildStylesXml(context.paragraphStyles)
    }),
    Object.freeze({
      path: "word/numbering.xml",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
      content: buildNumberingXml(context.numbering)
    }),
    ...noteParts.flatMap((part) => [
      Object.freeze({
        path: `word/${part.kind}s.xml`,
        mediaType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${part.kind}s+xml`,
        content: part.xml
      }),
      Object.freeze({
        path: `word/_rels/${part.kind}s.xml.rels`,
        mediaType: "application/vnd.openxmlformats-package.relationships+xml",
        content: buildNoteRelsXml(part.relationships)
      })
    ]),
    ...context.media.entries.map((entry) =>
      Object.freeze({
        path: `word/media/${entry.fileName}`,
        mediaType: entry.mimeType,
        content: entry.bytes
      })
    ),
    Object.freeze({
      path: "docProps/core.xml",
      mediaType: "application/xml",
      content: buildCoreXml(input)
    }),
    Object.freeze({
      path: "docProps/app.xml",
      mediaType: "application/xml",
      content: buildAppXml()
    })
  ]);

  return Object.freeze({
    packageBytes: createStoredZip(entries),
    entries,
    warnings: freezeArray(context.warnings),
    packageSummary: createPackageSummary(entries)
  });
};

const toBytes = (content: string | Uint8Array) =>
  typeof content === "string" ? encoder.encode(content) : content;

const uint16 = (value: number) => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
};

const uint32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
};

const concatBytes = (chunks: readonly Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
};

let crcTable: Uint32Array | null = null;

const getCrcTable = () => {
  if (crcTable) {
    return crcTable;
  }

  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  crcTable = table;
  return table;
};

const crc32 = (bytes: Uint8Array) => {
  const table = getCrcTable();
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
};

const createStoredZip = (entries: readonly DOCXMinimalPackageEntry[]) => {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.path);
    const contentBytes = toBytes(entry.content);
    const checksum = crc32(contentBytes);
    const localHeader = concatBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(contentBytes.length),
      uint32(contentBytes.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes
    ]);

    localChunks.push(localHeader, contentBytes);
    centralChunks.push(
      concatBytes([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(checksum),
        uint32(contentBytes.length),
        uint32(contentBytes.length),
        uint16(nameBytes.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        nameBytes
      ])
    );
    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectory = concatBytes(centralChunks);
  const endOfCentralDirectory = concatBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);

  return concatBytes([
    ...localChunks,
    centralDirectory,
    endOfCentralDirectory
  ]);
};

export const DOCX_MINIMAL_MIME_TYPE = DOCX_MIME_TYPE;
