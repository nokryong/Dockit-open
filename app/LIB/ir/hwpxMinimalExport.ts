import {
  normalizeIRDocumentStyles,
  normalizeTextRunStyle,
  type IRBlockStyleV1,
  type IRListMarkerStyleV1,
  type IRObjectStyleV1,
  type IRTableStyleV1,
  type IRTextBlockStyleV1,
  type IRTextRunStyleV1
} from "./styleModel";
import {
  collectListNumberingModels,
  type IRListNumberingItemV1,
  type IRListNumberingModelV1
} from "./listNumberingModel";
import {
  normalizeTableModel,
  type IRTableBorderBoxV1,
  type IRTableBorderLineV1,
  type IRTableBorderSideV1,
  type IRTableLengthV1,
  type IRTableModelV1
} from "./tableModel";
import {
  normalizeObjectModel,
  type IRObjectModelV1
} from "./objectModel";
import {
  createHWPXNormalizedTableGridView,
  summarizeHWPXTableGridViewForWarning
} from "./hwpxTableGridView";
import {
  assertValidIRNoteSemantics,
  getIRNoteReferences,
  IRNoteCompatibilityError
} from "./noteIRUtils";
import type {
  IRBlock,
  IRDocument,
  IRHeadingBlock,
  IRInlineNode,
  IRListBlock,
  IRListItem,
  IRNoteBody,
  IRObjectBlock,
  IRParagraphBlock,
  IRTableBlock,
  IRTableCell,
  IRUnsupportedBlock
} from "./types";

export type HWPXMinimalWarningSeverity = "warning" | "blocked";

export type HWPXMinimalWarningCode =
  | "run-style-fallback"
  | "link-attribute-fallback"
  | "link-target-fallback"
  | "list-marker-text-fallback"
  | "task-list-fallback"
  | "nested-list-fallback"
  | "table-border-metadata-only"
  | "table-border-style-fallback"
  | "table-merge-layout-warning"
  | "paragraph-line-spacing-fallback"
  | "paragraph-tabs-fallback"
  | "paragraph-style-fallback"
  | "object-placeholder"
  | "semantic-block-fallback"
  | "unsupported-block"
  | "unsupported-nested-block";

export const HWPX_V0_WARNING_CONTRACT = Object.freeze({
  "run-style-fallback": {
    severity: "warning",
    fallback: "Text stays visible while unsupported run styling remains unmapped.",
    visiblePlaceholder: false
  },
  "link-attribute-fallback": {
    severity: "warning",
    fallback: "Hyperlink text and href stay native while unsupported link attributes are ignored.",
    visiblePlaceholder: false
  },
  "link-target-fallback": {
    severity: "warning",
    fallback: "Hyperlink text stays visible while unsupported or unsafe link targets are not emitted as native HWPX links.",
    visiblePlaceholder: false
  },
  "list-marker-text-fallback": {
    severity: "warning",
    fallback: "List marker is written as paragraph text instead of native numbering.",
    visiblePlaceholder: false
  },
  "task-list-fallback": {
    severity: "warning",
    fallback: "Task checkbox state is written as plain marker text.",
    visiblePlaceholder: false
  },
  "nested-list-fallback": {
    severity: "warning",
    fallback: "Nested list restart and indentation are marker-text-only.",
    visiblePlaceholder: false
  },
  "table-border-metadata-only": {
    severity: "warning",
    fallback: "Retained for older metadata-only table border paths.",
    visiblePlaceholder: false
  },
  "table-border-style-fallback": {
    severity: "warning",
    fallback: "Unsupported border values are mapped to conservative borderFill values.",
    visiblePlaceholder: false
  },
  "table-merge-layout-warning": {
    severity: "warning",
    fallback: "Merged cell metadata is preserved without full row-group layout fidelity.",
    visiblePlaceholder: false
  },
  "paragraph-line-spacing-fallback": {
    severity: "warning",
    fallback:
      "Unsupported DOCX paragraph line-spacing rules are not emitted as native HWPX lineSpacing; paragraph text stays visible with default or otherwise supported paragraph spacing.",
    visiblePlaceholder: false
  },
  "paragraph-tabs-fallback": {
    severity: "warning",
    fallback:
      "DOCX paragraph tab-stop metadata is preserved in IR but is not emitted as native HWPX tab stops.",
    visiblePlaceholder: false
  },
  "paragraph-style-fallback": {
    severity: "warning",
    fallback:
      "DOCX paragraph style id/name metadata is preserved in IR but is not emitted as native HWPX paragraph styles.",
    visiblePlaceholder: false
  },
  "object-placeholder": {
    severity: "warning",
    fallback: "Unsupported object media is written as a visible placeholder paragraph.",
    visiblePlaceholder: true
  },
  "semantic-block-fallback": {
    severity: "warning",
    fallback:
      "Supported semantic fallback blocks preserve raw text with conservative paragraph and run styling.",
    visiblePlaceholder: false
  },
  "unsupported-block": {
    severity: "blocked",
    fallback:
      "Unsupported top-level IR block preserves raw text when available, otherwise writes a visible placeholder.",
    visiblePlaceholder: true
  },
  "unsupported-nested-block": {
    severity: "warning",
    fallback:
      "Unsupported nested IR block preserves raw text when available, otherwise writes a nested placeholder.",
    visiblePlaceholder: true
  }
} satisfies Record<
  HWPXMinimalWarningCode,
  Readonly<{
    severity: HWPXMinimalWarningSeverity;
    fallback: string;
    visiblePlaceholder: boolean;
  }>
>);

export interface HWPXMinimalExportWarning {
  code: HWPXMinimalWarningCode;
  severity: HWPXMinimalWarningSeverity;
  message: string;
  sectionIndex: number;
  blockIndex: number | null;
  blockType: string;
  path: string;
}

export type HWPXMinimalStyleSectionsV1 = ReturnType<
  typeof normalizeIRDocumentStyles
>;

export interface HWPXMinimalBlockModelViewV1 {
  version: "hwpx-minimal-export-input-v1";
  sectionIndex: number;
  blockIndex: number;
  blockType: IRBlock["type"];
  style: IRBlockStyleV1;
  listNumbering: Readonly<IRListNumberingModelV1> | null;
  table: Readonly<IRTableModelV1> | null;
  object: Readonly<IRObjectModelV1> | null;
}

export interface HWPXMinimalExportInputV1 {
  version: "hwpx-minimal-export-input-v1";
  irDocument: IRDocument;
  styleSections: HWPXMinimalStyleSectionsV1;
  listNumberingModels: readonly Readonly<IRListNumberingModelV1>[];
  tableModels: readonly Readonly<IRTableModelV1>[];
  objectModels: readonly Readonly<IRObjectModelV1>[];
  blockViews: readonly Readonly<HWPXMinimalBlockModelViewV1>[];
}

export interface HWPXMinimalPackageEntry {
  path: string;
  mediaType: string;
  content: string | Uint8Array;
}

export interface HWPXMinimalExportResult {
  packageBytes: Uint8Array;
  entries: readonly Readonly<HWPXMinimalPackageEntry>[];
  warnings: readonly Readonly<HWPXMinimalExportWarning>[];
}

export type HWPXV0WarningCode = HWPXMinimalWarningCode;
export type HWPXV0ExportInput = HWPXMinimalExportInputV1;
export type HWPXV0ExportResult = HWPXMinimalExportResult;

export interface HWPXV0WarningSummaryItem {
  code: HWPXV0WarningCode;
  severity: HWPXMinimalWarningSeverity;
  count: number;
  fallback: string;
  visiblePlaceholder: boolean;
  firstMessage: string;
}

export interface HWPXV0WarningSummary {
  total: number;
  warningCount: number;
  blockedCount: number;
  items: readonly Readonly<HWPXV0WarningSummaryItem>[];
}

export const summarizeHWPXV0Warnings = (
  warnings: readonly Readonly<HWPXMinimalExportWarning>[]
): Readonly<HWPXV0WarningSummary> => {
  const grouped = new Map<HWPXV0WarningCode, HWPXV0WarningSummaryItem>();
  let warningCount = 0;
  let blockedCount = 0;

  warnings.forEach((warning) => {
    const contract = HWPX_V0_WARNING_CONTRACT[warning.code];
    const existing = grouped.get(warning.code);

    if (warning.severity === "blocked") {
      blockedCount += 1;
    } else {
      warningCount += 1;
    }

    if (existing) {
      grouped.set(warning.code, {
        ...existing,
        count: existing.count + 1
      });
      return;
    }

    grouped.set(warning.code, {
      code: warning.code,
      severity: warning.severity,
      count: 1,
      fallback: contract.fallback,
      visiblePlaceholder: contract.visiblePlaceholder,
      firstMessage: warning.message
    });
  });

  return Object.freeze({
    total: warnings.length,
    warningCount,
    blockedCount,
    items: Object.freeze(
      Array.from(grouped.values()).map((item) => Object.freeze(item))
    )
  });
};

const INPUT_VERSION = "hwpx-minimal-export-input-v1" as const;
const HWPX_MIMETYPE = "application/hwp+zip";
const BULLET_MARKER = String.fromCharCode(8226);
const CHECKED_MARKER = String.fromCharCode(10003);
const HWPUNIT_PER_MM = 283.465;
const HWPUNIT_PER_PX = 15;
const HWPUNIT_PER_IMAGE_PX = 75;
const DEFAULT_BORDER_FILL_ID = 1;
const DEFAULT_BORDER_COLOR = "#000000";
const DEFAULT_BORDER_WIDTH_MM = 0.1;
const HWPX_INLINE_CODE_FONT_FAMILY = "Consolas";
const HWPX_CODE_BLOCK_PARA_PR_ID = 100;
const HWPX_BLOCKQUOTE_PARA_PR_ID = 101;
const HWPX_CUSTOM_PARA_PR_START_ID = 102;
const DEFAULT_TABLE_ROW_HEIGHT = 2400;
const MM_PER_PT = 25.4 / 72;
const MM_PER_PX = 25.4 / 96;
const HWPX_BORDER_WIDTH_MM_VALUES: readonly Readonly<{
  value: number;
  label: string;
}>[] = Object.freeze([
  Object.freeze({ value: 0.1, label: "0.1" }),
  Object.freeze({ value: 0.12, label: "0.12" }),
  Object.freeze({ value: 0.15, label: "0.15" }),
  Object.freeze({ value: 0.2, label: "0.2" }),
  Object.freeze({ value: 0.25, label: "0.25" }),
  Object.freeze({ value: 0.3, label: "0.3" }),
  Object.freeze({ value: 0.4, label: "0.4" }),
  Object.freeze({ value: 0.5, label: "0.5" }),
  Object.freeze({ value: 0.6, label: "0.6" }),
  Object.freeze({ value: 0.7, label: "0.7" }),
  Object.freeze({ value: 1, label: "1.0" }),
  Object.freeze({ value: 1.5, label: "1.5" }),
  Object.freeze({ value: 2, label: "2.0" }),
  Object.freeze({ value: 3, label: "3.0" }),
  Object.freeze({ value: 4, label: "4.0" }),
  Object.freeze({ value: 5, label: "5.0" })
]);
const COMMON_HWPX_NAMESPACES =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" ' +
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" ' +
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ' +
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" ' +
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" ' +
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" ' +
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" ' +
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:opf="http://www.idpf.org/2007/opf/" ' +
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" ' +
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops" ' +
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

const asTextStyle = (style: IRBlockStyleV1): IRTextBlockStyleV1 | null =>
  style &&
  "blockType" in style &&
  (style.blockType === "paragraph" || style.blockType === "heading")
    ? style
    : null;

const asListStyle = (style: IRBlockStyleV1): IRListMarkerStyleV1 | null =>
  style && "numbering" in style ? style : null;

const asTableStyle = (style: IRBlockStyleV1): IRTableStyleV1 | null =>
  style && "table" in style ? style : null;

const asObjectStyle = (style: IRBlockStyleV1): IRObjectStyleV1 | null =>
  style && "object" in style ? style : null;

const collectTableModels = (
  blocks: readonly IRBlock[]
): readonly Readonly<IRTableModelV1>[] =>
  freezeArray(
    blocks.flatMap((block) => {
      if (block.type === "table") {
        return [normalizeTableModel(block)];
      }

      if (block.type === "object" && block.children?.length) {
        return collectTableModels(block.children);
      }

      if (block.type === "list") {
        return block.items.flatMap((item) => collectTableModels(item.blocks));
      }

      return [];
    })
  );

const collectObjectModels = (
  blocks: readonly IRBlock[]
): readonly Readonly<IRObjectModelV1>[] =>
  freezeArray(
    blocks.flatMap((block) => {
      if (block.type === "object") {
        return [
          normalizeObjectModel(block),
          ...(block.children?.length ? collectObjectModels(block.children) : [])
        ];
      }

      if (block.type === "table") {
        return block.rows.flatMap((row) =>
          row.cells.flatMap((cell) => collectObjectModels(cell.blocks))
        );
      }

      if (block.type === "list") {
        return block.items.flatMap((item) => collectObjectModels(item.blocks));
      }

      return [];
    })
  );

export const createHWPXMinimalExportInput = (
  irDocument: IRDocument
): Readonly<HWPXMinimalExportInputV1> => {
  const styleSections = normalizeIRDocumentStyles(irDocument);
  const blockViews = freezeArray(
    irDocument.sections.flatMap((section, sectionIndex) =>
      section.blocks.map((block, blockIndex) => {
        const style =
          styleSections[sectionIndex]?.blocks[blockIndex]?.style ?? null;
        const listStyle = asListStyle(style);
        const tableStyle = asTableStyle(style);
        const objectStyle = asObjectStyle(style);

        return Object.freeze({
          version: INPUT_VERSION,
          sectionIndex,
          blockIndex,
          blockType: block.type,
          style,
          listNumbering: listStyle?.numbering ?? null,
          table: tableStyle?.table ?? null,
          object: objectStyle?.object ?? null
        });
      })
    )
  );

  return Object.freeze({
    version: INPUT_VERSION,
    irDocument,
    styleSections,
    listNumberingModels: freezeArray(
      irDocument.sections.flatMap((section) =>
        collectListNumberingModels(section.blocks)
      )
    ),
    tableModels: freezeArray(
      irDocument.sections.flatMap((section) => collectTableModels(section.blocks))
    ),
    objectModels: freezeArray(
      irDocument.sections.flatMap((section) =>
        collectObjectModels(section.blocks)
      )
    ),
    blockViews
  });
};

interface RenderContext {
  warnings: HWPXMinimalExportWarning[];
  warningKeys: Set<string>;
  paragraphId: number;
  tableId: number;
  pictureId: number;
  nativeListIds: HWPXNativeListIds;
  charProperties: HWPXCharPrRegistryV1;
  borderFills: HWPXBorderFillRegistryV1;
  imageMedia: HWPXImageMediaRegistryV1;
  paragraphSpacingParaPrs: HWPXParagraphSpacingParaPrRegistryV1;
  hyperlinkId: number;
  noteNativeIds: Map<
    string,
    { kind: "footnote" | "endnote"; instId: number; number: number }
  >;
  notesById: Map<string, Readonly<IRNoteBody>>;
}

interface HWPXNativeListIds {
  orderedParaPrId: number | null;
  bulletParaPrId: number | null;
}

interface HWPXCharPrDefinitionV1 {
  id: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  verticalAlign: IRTextRunStyleV1["verticalAlign"];
  height: number;
  fontFaceId: number;
  textColor: string;
  shadeColor: string;
}

interface HWPXCharPrRegistryV1 {
  definitions: HWPXCharPrDefinitionV1[];
  signatureToId: Map<string, number>;
  fontFaceToId: Map<string, number>;
}

interface BlockLocation {
  sectionIndex: number;
  blockIndex: number | null;
  blockType: string;
  path: string;
}

type HWPXBorderLineTypeV1 =
  | "NONE"
  | "SOLID"
  | "DASH"
  | "DOT"
  | "DOUBLE_SLIM";

interface HWPXBorderFillLineV1 {
  type: HWPXBorderLineTypeV1;
  width: string;
  color: string;
}

interface HWPXBorderFillDefinitionV1 {
  id: number;
  sides: Readonly<Record<IRTableBorderSideV1, Readonly<HWPXBorderFillLineV1>>>;
  backgroundColor: string | null;
}

interface HWPXBorderFillRegistryV1 {
  definitions: readonly Readonly<HWPXBorderFillDefinitionV1>[];
  signatureToId: ReadonlyMap<string, number>;
}

interface HWPXBorderFillSourceV1 {
  borderBox: Readonly<IRTableBorderBoxV1>;
  backgroundColor: string | null;
}

type HWPXImageMediaType = "image/png" | "image/jpeg";

interface HWPXImageMediaDefinitionV1 {
  id: string;
  path: string;
  mediaType: HWPXImageMediaType;
  content: Uint8Array;
  fileName: string;
  pixelWidth: number;
  pixelHeight: number;
  relationshipKey: string;
}

interface HWPXImageMediaRegistryV1 {
  definitions: readonly Readonly<HWPXImageMediaDefinitionV1>[];
  keyToImage: ReadonlyMap<string, Readonly<HWPXImageMediaDefinitionV1>>;
}

interface HWPXParagraphSpacingParaPrDefinitionV1 {
  id: number;
  headingLevel: number;
  prev: number;
  next: number;
  lineSpacing: number;
}

interface HWPXParagraphSpacingParaPrRegistryV1 {
  nextId: number;
  definitions: HWPXParagraphSpacingParaPrDefinitionV1[];
  signatureToId: Map<string, number>;
}

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const nextParagraphId = (context: RenderContext) => {
  const paragraphId = context.paragraphId;
  context.paragraphId += 1;
  return paragraphId;
};

const pushWarning = (
  context: RenderContext,
  warning: HWPXMinimalExportWarning
) => {
  const key = [
    warning.code,
    warning.sectionIndex,
    warning.blockIndex ?? "nested",
    warning.path,
    warning.message
  ].join("|");

  if (context.warningKeys.has(key)) {
    return;
  }

  context.warningKeys.add(key);
  context.warnings.push(Object.freeze(warning));
};

const warn = (
  context: RenderContext,
  location: BlockLocation,
  code: HWPXMinimalWarningCode,
  message: string,
  severity: HWPXMinimalWarningSeverity = "warning"
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

const getBlockView = (
  input: HWPXMinimalExportInputV1,
  sectionIndex: number,
  blockIndex: number
) =>
  input.blockViews.find(
    (view) =>
      view.sectionIndex === sectionIndex && view.blockIndex === blockIndex
  ) ?? null;

const plainInlineText = (runs: readonly IRInlineNode[]) =>
  runs
    .map((run) => (run.type === "textRun" ? run.text : "\n"))
    .join("");

const isRawTextContainer = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizePreservedRawText = (value: string) => {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return normalized.trim() ? normalized : null;
};

const rawTextContentJoiner = (nodeType: unknown) =>
  nodeType === "paragraph" ||
  nodeType === "heading" ||
  nodeType === "codeBlock" ||
  nodeType === "text"
    ? ""
    : "\n";

const extractRawTextContent = (value: unknown): string | null => {
  if (typeof value === "string") {
    return normalizePreservedRawText(value);
  }

  if (Array.isArray(value)) {
    return normalizePreservedRawText(
      value
        .map((item) => extractRawTextContent(item))
        .filter((text): text is string => Boolean(text))
        .join("\n")
    );
  }

  if (!isRawTextContainer(value)) {
    return null;
  }

  if (typeof value.textContent === "string") {
    const textContent = normalizePreservedRawText(value.textContent);

    if (textContent) {
      return textContent;
    }
  }

  if (typeof value.text === "string") {
    const text = normalizePreservedRawText(value.text);

    if (text) {
      return text;
    }
  }

  if (value.type === "hardBreak") {
    return "\n";
  }

  if (Array.isArray(value.content)) {
    return normalizePreservedRawText(
      value.content
        .map((item) => extractRawTextContent(item))
        .filter((text): text is string => Boolean(text))
        .join(rawTextContentJoiner(value.type))
    );
  }

  return null;
};

const getUnsupportedBlockFallbackText = (block: IRUnsupportedBlock) =>
  extractRawTextContent(block.raw) ?? `[Unsupported block: ${block.nodeType}]`;

const plainBlockText = (block: IRBlock): string => {
  if (block.type === "paragraph" || block.type === "heading") {
    return plainInlineText(block.runs);
  }

  if (block.type === "list") {
    return block.items
      .map((item) => item.blocks.map(plainBlockText).join(" "))
      .join("\n");
  }

  if (block.type === "table") {
    return block.rows
      .map((row) =>
        row.cells
          .map((cell) => cell.blocks.map(plainBlockText).join(" "))
          .join("\t")
      )
      .join("\n");
  }

  if (block.type === "object") {
    return `[Object placeholder: ${block.objectType}]`;
  }

  return getUnsupportedBlockFallbackText(block);
};

const hasUnsupportedHwpxRunColor = (value: string | null) =>
  Boolean(value && !isSupportedHwpxColor(value));

const isSupportedHwpxFontFamily = (value: string | null) =>
  Boolean(value && /^[\p{L}\p{N}\s._-]{1,80}$/u.test(value.trim()));

const toHwpxFontSizePt = (fontSize: IRTextRunStyleV1["fontSize"]) => {
  if (!fontSize) {
    return null;
  }

  if (fontSize.unit === "pt") {
    return fontSize.value;
  }

  if (fontSize.unit === "px") {
    return fontSize.value * 0.75;
  }

  if (fontSize.unit === "mm") {
    return fontSize.value * 2.8346456693;
  }

  return null;
};

const toHwpxCharHeight = (fontSize: IRTextRunStyleV1["fontSize"]) => {
  const pt = toHwpxFontSizePt(fontSize);

  if (!pt || pt < 1 || pt > 200) {
    return null;
  }

  return Math.round(pt * 100);
};

const hasLossyRunStyle = (runStyle: IRTextRunStyleV1) =>
  Boolean(
    (runStyle.fontFamily && !isSupportedHwpxFontFamily(runStyle.fontFamily)) ||
      (runStyle.fontSize && toHwpxCharHeight(runStyle.fontSize) === null) ||
      runStyle.inlineTagColor ||
      hasUnsupportedHwpxRunColor(runStyle.color) ||
      hasUnsupportedHwpxRunColor(runStyle.backgroundColor) ||
      hasUnsupportedHwpxRunColor(runStyle.highlightColor) ||
      runStyle.unsupported.length > 0
  );

const createDefaultCharPrDefinition = (id: number): HWPXCharPrDefinitionV1 => ({
  id,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  verticalAlign: null,
  height: 1000,
  fontFaceId: 0,
  textColor: "#000000",
  shadeColor: "none"
});

const createBaseCharPrDefinitions = (): HWPXCharPrDefinitionV1[] =>
  Array.from({ length: 7 }, (_, id) => {
    const definition = createDefaultCharPrDefinition(id);

    if (id === 1 || id === 3) {
      definition.bold = true;
    }

    if (id === 2 || id === 3) {
      definition.italic = true;
    }

    if (id === 4) {
      definition.underline = true;
    }

    if (id === 5) {
      definition.strike = true;
    }

    if (id === 6) {
      definition.shadeColor = "#F3F4F6";
    }

    return definition;
  });

const createCharPrRegistry = (): HWPXCharPrRegistryV1 => {
  const definitions = createBaseCharPrDefinitions();
  const signatureToId = new Map<string, number>();
  const fontFaceToId = new Map<string, number>([["Arial", 0]]);

  definitions.forEach(({ id, ...definition }) => {
    signatureToId.set(getCharPrSignature(definition), id);
  });

  return {
    definitions,
    signatureToId,
    fontFaceToId
  };
};

const getHwpxFontFaceId = (
  fontFamily: string | null,
  registry: HWPXCharPrRegistryV1
) => {
  const family = isSupportedHwpxFontFamily(fontFamily)
    ? fontFamily?.trim()
    : null;

  if (!family) {
    return 0;
  }

  const existingId = registry.fontFaceToId.get(family);

  if (existingId !== undefined) {
    return existingId;
  }

  const id = registry.fontFaceToId.size;
  registry.fontFaceToId.set(family, id);

  return id;
};

const getHyperlinkFallbackReasons = (link: IRTextRunStyleV1["link"]) => {
  const reasons: string[] = [];

  if (!link) {
    return reasons;
  }

  if (link.target) {
    reasons.push("target");
  }

  if (link.title) {
    reasons.push("title");
  }

  return reasons;
};

const getHyperlinkScheme = (href: string) => {
  const match = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);

  return match ? match[1].toLowerCase() : null;
};

const isNativeHttpHref = (href: string) => {
  try {
    const url = new URL(href);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isNativeMailtoHref = (href: string) => {
  try {
    const url = new URL(href);

    return url.protocol === "mailto:" && href.length > "mailto:".length;
  } catch {
    return false;
  }
};

const isFileLikeHref = (href: string) =>
  /^file:/i.test(href) || /^[A-Za-z]:[\\/]/.test(href) || /^\\\\/.test(href);

const getHyperlinkTargetPolicy = (link: IRTextRunStyleV1["link"]) => {
  const href = link?.href?.trim() ?? "";

  if (!href) {
    return Object.freeze({
      nativeHref: null,
      reasons: Object.freeze(["missing href"])
    });
  }

  if (isNativeHttpHref(href) || isNativeMailtoHref(href)) {
    return Object.freeze({
      nativeHref: href,
      reasons: Object.freeze([] as string[])
    });
  }

  if (href.startsWith("#")) {
    return Object.freeze({
      nativeHref: null,
      reasons: Object.freeze(["internal anchor"])
    });
  }

  if (isFileLikeHref(href)) {
    return Object.freeze({
      nativeHref: null,
      reasons: Object.freeze(["file link"])
    });
  }

  const scheme = getHyperlinkScheme(href);

  return Object.freeze({
    nativeHref: null,
    reasons: Object.freeze([
      scheme ? `unsupported scheme: ${scheme}` : "relative or invalid href"
    ])
  });
};

const nextHyperlinkId = (context: RenderContext) => {
  const id = context.hyperlinkId;
  context.hyperlinkId += 1;
  return id;
};

const toHwpxHyperlinkCommand = (href: string) =>
  `${href.replace(/:/g, "\\:")};1;0;0;`;

const renderHyperlinkRun = (
  text: string,
  href: string,
  charPrIdRef: number,
  context: RenderContext
) => {
  const hyperlinkIndex = nextHyperlinkId(context);
  const fieldId = String(8800000 + hyperlinkIndex);
  const fieldInstanceId = String(8900000 + hyperlinkIndex);
  const command = toHwpxHyperlinkCommand(href);

  return [
    `<hp:run charPrIDRef="${charPrIdRef}"><hp:ctrl><hp:fieldBegin id="${fieldId}" type="HYPERLINK" name="" editable="0" dirty="0" zorder="-1" fieldid="${fieldInstanceId}" metaTag=""><hp:parameters cnt="5" name=""><hp:integerParam name="Prop">0</hp:integerParam><hp:stringParam name="Command">${escapeXml(
      command
    )}</hp:stringParam><hp:stringParam name="Category">HWPHYPERLINK_TYPE_URL</hp:stringParam><hp:stringParam name="TargetType">HWPHYPERLINK_TARGET_HYPERLINK</hp:stringParam><hp:stringParam name="DocOpenType">HWPHYPERLINK_JUMP_DONTCARE</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl></hp:run>`,
    `<hp:run charPrIDRef="${charPrIdRef}"><hp:t>${escapeXml(text)}</hp:t></hp:run>`,
    `<hp:run charPrIDRef="${charPrIdRef}"><hp:ctrl><hp:fieldEnd beginIDRef="${fieldId}" fieldid="${fieldInstanceId}"/></hp:ctrl><hp:t/></hp:run>`
  ].join("");
};

const getSupportedRunColor = (value: string | null) =>
  value && isSupportedHwpxColor(value) ? normalizeHwpxColor(value) : null;

const getRunShadeColor = (runStyle: IRTextRunStyleV1) =>
  getSupportedRunColor(runStyle.highlightColor) ??
  getSupportedRunColor(runStyle.backgroundColor) ??
  (runStyle.code ? "#F3F4F6" : "none");

const getRunFontFamily = (runStyle: IRTextRunStyleV1) => {
  if (isSupportedHwpxFontFamily(runStyle.fontFamily)) {
    return runStyle.fontFamily;
  }

  return runStyle.code ? HWPX_INLINE_CODE_FONT_FAMILY : null;
};

const getCharPrSignature = (definition: Omit<HWPXCharPrDefinitionV1, "id">) =>
  [
    definition.bold ? "b1" : "b0",
    definition.italic ? "i1" : "i0",
    definition.underline ? "u1" : "u0",
    definition.strike ? "s1" : "s0",
    definition.verticalAlign ?? "baseline",
    definition.height,
    definition.fontFaceId,
    definition.textColor,
    definition.shadeColor
  ].join("|");

const registerCharPrDefinition = (
  definition: Omit<HWPXCharPrDefinitionV1, "id">,
  registry: HWPXCharPrRegistryV1
) => {
  const signature = getCharPrSignature(definition);
  const existingId = registry.signatureToId.get(signature);

  if (existingId !== undefined) {
    return existingId;
  }

  const id = registry.definitions.length;
  registry.signatureToId.set(signature, id);
  registry.definitions.push({
    id,
    ...definition
  });

  return id;
};

const getCharPrIdRef = (
  runStyle: IRTextRunStyleV1 | null,
  registry: HWPXCharPrRegistryV1
) => {
  if (!runStyle) {
    return 0;
  }

  const definition = {
    bold: runStyle.bold,
    italic: runStyle.italic,
    underline: runStyle.underline,
    strike: runStyle.strike,
    verticalAlign: runStyle.verticalAlign,
    height: toHwpxCharHeight(runStyle.fontSize) ?? 1000,
    fontFaceId: getHwpxFontFaceId(getRunFontFamily(runStyle), registry),
    textColor: getSupportedRunColor(runStyle.color) ?? "#000000",
    shadeColor: getRunShadeColor(runStyle)
  };

  return registerCharPrDefinition(definition, registry);
};

const getSemanticCodeBlockCharPrIdRef = (registry: HWPXCharPrRegistryV1) =>
  registerCharPrDefinition(
    {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      verticalAlign: null,
      height: 950,
      fontFaceId: getHwpxFontFaceId(HWPX_INLINE_CODE_FONT_FAMILY, registry),
      textColor: "#111827",
      shadeColor: "#F3F4F6"
    },
    registry
  );

const getSemanticBlockquoteCharPrIdRef = (registry: HWPXCharPrRegistryV1) =>
  registerCharPrDefinition(
    {
      bold: false,
      italic: true,
      underline: false,
      strike: false,
      verticalAlign: null,
      height: 1000,
      fontFaceId: 0,
      textColor: "#374151",
      shadeColor: "none"
    },
    registry
  );

const renderInlineRuns = (
  runs: readonly IRInlineNode[],
  textStyle: IRTextBlockStyleV1 | null,
  context: RenderContext,
  location: BlockLocation
) => {
  let textRunIndex = 0;
  const rendered = runs
    .map((run, inlineIndex) => {
      if (run.type === "hardBreak") {
        return "<hp:lineBreak/>";
      }

      if (run.type === "noteReference") {
        const native = context.noteNativeIds.get(run.noteId);
        if (!native || native.kind !== run.kind) {
          throw new IRNoteCompatibilityError("HWPX_NOTE_EXPORT_INVALID_REFERENCE", "HWPX note reference has no native identity.");
        }
        const note = context.notesById.get(run.noteId);
        if (!note) throw new IRNoteCompatibilityError("HWPX_NOTE_EXPORT_INVALID_REFERENCE", "HWPX note reference has no body.");
        return renderNativeNote(note, context);
      }

      const runStyle = textStyle?.runs[textRunIndex] ?? null;
      textRunIndex += 1;

      if (runStyle && hasLossyRunStyle(runStyle)) {
        warn(
          context,
          location,
          "run-style-fallback",
          `Text run ${inlineIndex} has style metadata that the minimal HWPX spike does not map natively.`
        );
      }

      const charPrIdRef = getCharPrIdRef(
        runStyle,
        context.charProperties
      );

      if (runStyle?.link) {
        const linkFallbackReasons = getHyperlinkFallbackReasons(runStyle.link);
        const linkTargetPolicy = getHyperlinkTargetPolicy(runStyle.link);

        if (linkFallbackReasons.length > 0) {
          warn(
            context,
            location,
            "link-attribute-fallback",
            `Text run ${inlineIndex} has unsupported link metadata: ${linkFallbackReasons.join(
              ", "
            )}.`
          );
        }

        if (linkTargetPolicy.reasons.length > 0) {
          warn(
            context,
            location,
            "link-target-fallback",
            `Text run ${inlineIndex} has unsupported link target: ${linkTargetPolicy.reasons.join(
              ", "
            )}.`
          );
        }

        if (linkTargetPolicy.nativeHref) {
          return renderHyperlinkRun(
            run.text,
            linkTargetPolicy.nativeHref,
            charPrIdRef,
            context
          );
        }
      }

      return `<hp:run charPrIDRef="${charPrIdRef}"><hp:t>${escapeXml(
        run.text
      )}</hp:t></hp:run>`;
    })
    .join("");

  return rendered || '<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>';
};

const assertHWPXNoteBodyRepresentable = (note: Readonly<IRNoteBody>) => {
  note.paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraph.attrs && Object.keys(paragraph.attrs).length) {
      throw new IRNoteCompatibilityError("HWPX_NOTE_EXPORT_PARAGRAPH_ATTR_UNSUPPORTED", `HWPX note paragraph attrs are unsupported: ${note.noteId}.${paragraphIndex}.`);
    }
    paragraph.runs.forEach((run, runIndex) => {
      if (run.type === "hardBreak") return;
      const seen = new Set<string>();
      run.marks.forEach((mark) => {
        if (seen.has(mark.type)) {
          throw new IRNoteCompatibilityError(
            "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED",
            `HWPX note mark is duplicated: ${note.noteId}.${paragraphIndex}.${runIndex}.${mark.type}.`
          );
        }
        seen.add(mark.type);
        const attrs = mark.attrs ?? {};
        if (mark.type === "link") {
          const href = typeof attrs.href === "string" ? attrs.href : "";
          if (
            Object.keys(attrs).length !== 1 ||
            !getHyperlinkTargetPolicy({ href, target: null, title: null }).nativeHref
          ) {
            throw new IRNoteCompatibilityError(
              "HWPX_NOTE_EXPORT_UNSAFE_LINK",
              `HWPX note hyperlink is unsafe: ${note.noteId}.`
            );
          }
          return;
        }
        if (mark.type === "textStyle") {
          const color = attrs.color;
          if (
            Object.keys(attrs).length !== 1 ||
            typeof color !== "string" ||
            !/^#[0-9a-f]{6}$/i.test(color)
          ) {
            throw new IRNoteCompatibilityError(
              "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED",
              `HWPX note textStyle supports one six-digit color only: ${note.noteId}.${paragraphIndex}.${runIndex}.`
            );
          }
          return;
        }
        if (
          !["bold", "italic", "underline", "strike", "subscript", "superscript"].includes(
            mark.type
          ) ||
          Object.keys(attrs).length
        ) {
          throw new IRNoteCompatibilityError(
            "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED",
            `HWPX note mark is unsupported: ${note.noteId}.${paragraphIndex}.${runIndex}.${mark.type}.`
          );
        }
      });
      if (seen.has("subscript") && seen.has("superscript")) {
        throw new IRNoteCompatibilityError(
          "HWPX_NOTE_EXPORT_MARK_UNSUPPORTED",
          `HWPX note text cannot be subscript and superscript together: ${note.noteId}.${paragraphIndex}.${runIndex}.`
        );
      }
    });
  });
};

const renderNoteRun = (
  run: IRNoteBody["paragraphs"][number]["runs"][number],
  context: RenderContext
) => {
  if (run.type === "hardBreak") {
    return '<hp:run charPrIDRef="0"><hp:t><hp:lineBreak/></hp:t></hp:run>';
  }
  const charPrIdRef = getCharPrIdRef(
    normalizeTextRunStyle(run),
    context.charProperties
  );
  const link = run.marks.find((mark) => mark.type === "link");
  const href =
    link && typeof link.attrs?.href === "string"
      ? getHyperlinkTargetPolicy({
          href: link.attrs.href,
          target: null,
          title: null
        }).nativeHref
      : null;
  return href
    ? renderHyperlinkRun(run.text, href, charPrIdRef, context)
    : `<hp:run charPrIDRef="${charPrIdRef}"><hp:t>${escapeXml(
        run.text
      )}</hp:t></hp:run>`;
};

const renderNativeNote = (note: Readonly<IRNoteBody>, context: RenderContext) => {
  const native = context.noteNativeIds.get(note.noteId)!;
  const element = note.kind === "footnote" ? "footNote" : "endNote";
  const numType = note.kind === "footnote" ? "FOOTNOTE" : "ENDNOTE";
  const paragraphs = note.paragraphs
    .map((paragraph, paragraphIndex) => {
      const marker =
        paragraphIndex === 0
          ? `<hp:run charPrIDRef="0"><hp:ctrl><hp:autoNum num="${native.number}" numType="${numType}"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/></hp:autoNum></hp:ctrl><hp:t> </hp:t></hp:run>`
          : "";
      const bodyRuns = paragraph.runs
        .map((run) => renderNoteRun(run, context))
        .join("");
      return [
        `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
        marker,
        bodyRuns || '<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>',
        renderLineSegArray(),
        "</hp:p>"
      ].join("");
    })
    .join("");

  return [
    '<hp:run charPrIDRef="0"><hp:ctrl>',
    `<hp:${element} instId="${native.instId}">`,
    '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">',
    paragraphs,
    "</hp:subList>",
    `</hp:${element}>`,
    "</hp:ctrl></hp:run>"
  ].join("");
};

const getHeadingLevel = (block: IRHeadingBlock) => {
  const level = Number(block.attrs.level);

  return Number.isFinite(level) ? Math.min(6, Math.max(1, Math.trunc(level))) : 1;
};

const docxSpacingTwipsToHwpUnit = (value: unknown) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return Math.round(numberValue * 5);
};

const docxAutoLineSpacingToHWPXPercent = (line: unknown, lineRule: unknown) => {
  const lineValue = Number(line);
  const normalizedLineRule =
    typeof lineRule === "string" ? lineRule.trim().toLowerCase() : "";

  if (
    !Number.isFinite(lineValue) ||
    lineValue <= 0 ||
    (normalizedLineRule && normalizedLineRule !== "auto")
  ) {
    return null;
  }

  return Math.max(1, Math.round((lineValue / 240) * 100));
};

const getUnsupportedDOCXLineSpacingRuleForHWPX = (
  attrs: Readonly<IRParagraphBlock["attrs"] | IRHeadingBlock["attrs"]>
) => {
  const lineValue = Number(attrs.docxParagraphSpacingLine);
  const rawLineRule = attrs.docxParagraphSpacingLineRule;
  const normalizedLineRule =
    typeof rawLineRule === "string" ? rawLineRule.trim() : "";

  if (
    !Number.isFinite(lineValue) ||
    lineValue <= 0 ||
    !normalizedLineRule ||
    normalizedLineRule.toLowerCase() === "auto"
  ) {
    return null;
  }

  return {
    line: lineValue,
    lineRule: normalizedLineRule
  };
};

const getDOCXParagraphTabStopCountForHWPX = (
  attrs: Readonly<IRParagraphBlock["attrs"] | IRHeadingBlock["attrs"]>
) =>
  Array.isArray(attrs.docxParagraphTabs) && attrs.docxParagraphTabs.length > 0
    ? attrs.docxParagraphTabs.length
    : 0;

const normalizeDOCXParagraphMetadataText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getDOCXParagraphStyleDescriptionForHWPX = (
  attrs: Readonly<IRParagraphBlock["attrs"] | IRHeadingBlock["attrs"]>
) => {
  const styleId = normalizeDOCXParagraphMetadataText(attrs.docxParagraphStyleId);
  const styleName = normalizeDOCXParagraphMetadataText(
    attrs.docxParagraphStyleName
  );
  const parts = [
    styleId ? `style id '${styleId}'` : null,
    styleName ? `style name '${styleName}'` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" and ") : null;
};

const getParagraphSpacingParaPrSpec = (
  attrs: Readonly<IRParagraphBlock["attrs"] | IRHeadingBlock["attrs"]>
) => {
  const prev = docxSpacingTwipsToHwpUnit(attrs.docxParagraphSpacingBefore);
  const next = docxSpacingTwipsToHwpUnit(attrs.docxParagraphSpacingAfter);
  const lineSpacing = docxAutoLineSpacingToHWPXPercent(
    attrs.docxParagraphSpacingLine,
    attrs.docxParagraphSpacingLineRule
  );

  if (
    (prev === null || prev === 0) &&
    (next === null || next === 0) &&
    lineSpacing === null
  ) {
    return null;
  }

  return {
    prev: prev ?? 0,
    next: next ?? 0,
    lineSpacing: lineSpacing ?? 160
  };
};

const getParagraphSpacingParaPrId = (
  attrs: Readonly<IRParagraphBlock["attrs"] | IRHeadingBlock["attrs"]>,
  headingLevel: number,
  context: RenderContext
) => {
  const spacingSpec = getParagraphSpacingParaPrSpec(attrs);

  if (!spacingSpec) {
    return headingLevel;
  }

  const signature = `${headingLevel}:${spacingSpec.prev}:${spacingSpec.next}:${spacingSpec.lineSpacing}`;
  const existing = context.paragraphSpacingParaPrs.signatureToId.get(signature);

  if (existing) {
    return existing;
  }

  const id = context.paragraphSpacingParaPrs.nextId;
  context.paragraphSpacingParaPrs.nextId += 1;
  context.paragraphSpacingParaPrs.signatureToId.set(signature, id);
  context.paragraphSpacingParaPrs.definitions.push({
    id,
    headingLevel,
    prev: spacingSpec.prev,
    next: spacingSpec.next,
    lineSpacing: spacingSpec.lineSpacing
  });

  return id;
};

const renderLineSegArray = () =>
  '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1200" textheight="1200" baseline="1020" spacing="720" horzpos="0" horzsize="48188" flags="393216"/></hp:linesegarray>';

const renderTextBlock = (
  block: IRParagraphBlock | IRHeadingBlock,
  style: IRBlockStyleV1,
  context: RenderContext,
  location: BlockLocation
) => {
  const headingLevel = block.type === "heading" ? getHeadingLevel(block) : 0;
  const unsupportedLineSpacing = getUnsupportedDOCXLineSpacingRuleForHWPX(
    block.attrs
  );
  const docxTabStopCount = getDOCXParagraphTabStopCountForHWPX(block.attrs);
  const docxStyleDescription = getDOCXParagraphStyleDescriptionForHWPX(
    block.attrs
  );

  if (unsupportedLineSpacing) {
    warn(
      context,
      location,
      "paragraph-line-spacing-fallback",
      `DOCX paragraph line spacing rule '${unsupportedLineSpacing.lineRule}' with line ${unsupportedLineSpacing.line} is not emitted as native HWPX lineSpacing by the current supported subset.`
    );
  }

  if (docxTabStopCount > 0) {
    warn(
      context,
      location,
      "paragraph-tabs-fallback",
      `DOCX paragraph tab-stop metadata (${docxTabStopCount} stop(s)) is preserved in IR but is not emitted as native HWPX tab stops by the current supported subset.`
    );
  }

  if (docxStyleDescription) {
    warn(
      context,
      location,
      "paragraph-style-fallback",
      `DOCX paragraph ${docxStyleDescription} metadata is preserved in IR but is not emitted as native HWPX paragraph styles by the current supported subset.`
    );
  }

  const paraPrIdRef = getParagraphSpacingParaPrId(block.attrs, headingLevel, context);
  const styleIdRef = headingLevel;
  const textStyle = asTextStyle(style);

  return [
    `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="${paraPrIdRef}" styleIDRef="${styleIdRef}" pageBreak="0" columnBreak="0" merged="0">`,
    renderInlineRuns(block.runs, textStyle, context, location),
    renderLineSegArray(),
    "</hp:p>"
  ].join("");
};

const renderSyntheticParagraph = (
  text: string,
  context: RenderContext,
  location: BlockLocation
) =>
  [
    `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
    `<hp:run charPrIDRef="0"><hp:t>${escapeXml(text)}</hp:t></hp:run>`,
    renderLineSegArray(),
    "</hp:p>"
  ].join("");

const renderStyledSyntheticParagraph = (
  text: string,
  paraPrIdRef: number,
  charPrIdRef: number,
  context: RenderContext
) =>
  [
    `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="${paraPrIdRef}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
    `<hp:run charPrIDRef="${charPrIdRef}"><hp:t>${escapeXml(text)}</hp:t></hp:run>`,
    renderLineSegArray(),
    "</hp:p>"
  ].join("");

const isSamePath = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const findNumberingItem = (
  model: Readonly<IRListNumberingModelV1> | null,
  path: readonly number[]
) => model?.items.find((item) => isSamePath(item.path, path)) ?? null;

const getListItemMarker = (
  listBlock: IRListBlock,
  item: IRListItem,
  itemIndex: number,
  numberingItem: Readonly<IRListNumberingItemV1> | null
) => {
  if (listBlock.listType === "ordered") {
    return `${numberingItem?.effectiveNumber ?? itemIndex + 1}. `;
  }

  if (listBlock.listType === "bullet") {
    return `${BULLET_MARKER} `;
  }

  if (listBlock.listType === "task") {
    return item.attrs.checked === true ? "[x] " : "[ ] ";
  }

  return "- ";
};

const supportsNativeListLevel = (
  listType: IRListBlock["listType"],
  pathPrefix: readonly number[]
) => pathPrefix.length === 0 && (listType === "ordered" || listType === "bullet");

const getNativeListParaPrId = (
  listType: IRListBlock["listType"],
  nativeListIds: HWPXNativeListIds
) =>
  listType === "ordered"
    ? nativeListIds.orderedParaPrId
    : listType === "bullet"
      ? nativeListIds.bulletParaPrId
      : null;

const extractListItemText = (
  item: IRListItem,
  context: RenderContext,
  location: BlockLocation
) => {
  const textBlocks: string[] = [];

  item.blocks.forEach((block, blockIndex) => {
    if (block.type === "paragraph" || block.type === "heading") {
      textBlocks.push(plainInlineText(block.runs));
      return;
    }

    if (block.type !== "list") {
      warn(
        context,
        {
          ...location,
          blockType: block.type,
          path: `${location.path}.items.blocks[${blockIndex}]`
        },
        "unsupported-nested-block",
        `Nested ${block.type} inside a list item is not emitted by the minimal HWPX list fallback.`
      );
    }
  });

  return textBlocks.join(" ");
};

const renderListBlock = (
  block: IRListBlock,
  model: Readonly<IRListNumberingModelV1> | null,
  context: RenderContext,
  location: BlockLocation,
  pathPrefix: readonly number[] = []
): string => {
  const nativeParaPrId = getNativeListParaPrId(
    block.listType,
    context.nativeListIds
  );
  const useNativeList =
    supportsNativeListLevel(block.listType, pathPrefix) && nativeParaPrId !== null;

  if (!useNativeList) {
    warn(
      context,
      location,
      "list-marker-text-fallback",
      "Native HWPX numbering definitions are not emitted for this list level; list markers are written as paragraph text."
    );
  }

  if (block.listType === "task") {
    warn(
      context,
      location,
      "task-list-fallback",
      "Task list checkbox semantics are rendered as plain marker text."
    );
  }

  if (pathPrefix.length > 0) {
    warn(
      context,
      location,
      "nested-list-fallback",
      "Nested list restart and indentation are marker-text-only in the minimal HWPX spike."
    );
  }

  return block.items
    .map((item, itemIndex) => {
      const itemPath = [...pathPrefix, itemIndex];
      const numberingItem = findNumberingItem(model, itemPath);
      const marker = getListItemMarker(block, item, itemIndex, numberingItem);
      const text = extractListItemText(item, context, location);
      const renderedText = useNativeList ? text : `${marker}${text}`;
      const paraPrId = useNativeList ? nativeParaPrId : 0;
      const listParagraph = [
        `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="${paraPrId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
        `<hp:run charPrIDRef="0"><hp:t>${escapeXml(renderedText)}</hp:t></hp:run>`,
        renderLineSegArray(),
        "</hp:p>"
      ].join("");
      let childListIndex = 0;
      const nestedLists = item.blocks
        .map((childBlock) => {
          if (childBlock.type !== "list") {
            return "";
          }

          const nested = renderListBlock(
            childBlock,
            model,
            context,
            {
              ...location,
              path: `${location.path}.items[${itemIndex}].lists[${childListIndex}]`
            },
            [...itemPath, childListIndex]
          );

          childListIndex += 1;
          return nested;
        })
        .join("");

      return `${listParagraph}${nestedLists}`;
    })
    .join("");
};

const mmToHwpUnit = (value: number) => Math.round(value * HWPUNIT_PER_MM);

const tableLengthToHwpUnit = (
  length: Readonly<{ value: number; unit: string }> | null,
  fallback: number
) => {
  if (!length) {
    return fallback;
  }

  if (length.unit === "mm") {
    return mmToHwpUnit(length.value);
  }

  if (length.unit === "px") {
    return Math.round(length.value * HWPUNIT_PER_PX);
  }

  if (length.unit === "pt") {
    return Math.round(length.value * 100);
  }

  return fallback;
};

const objectLengthToHwpUnit = (
  length: Readonly<{ value: number; unit: string }> | null,
  fallback: number
) => {
  if (!length) {
    return fallback;
  }

  if (length.unit === "mm") {
    return mmToHwpUnit(length.value);
  }

  if (length.unit === "px") {
    return Math.round(length.value * HWPUNIT_PER_IMAGE_PX);
  }

  if (length.unit === "pt") {
    return Math.round(length.value * 100);
  }

  return fallback;
};

const getImageFileExtension = (mediaType: HWPXImageMediaType) =>
  mediaType === "image/jpeg" ? "jpg" : "png";

const sanitizeImageFileName = (
  value: string | null,
  fallbackBase: string,
  mediaType: HWPXImageMediaType
) => {
  const fileName = value?.split(/[\\/]/).pop()?.split("?")[0]?.split("#")[0];
  const extension = getImageFileExtension(mediaType);
  const sanitized = fileName
    ?.replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.(png|jpe?g)$/i, "");
  const baseName = sanitized?.replace(/^[._-]+|[._-]+$/g, "");

  return `${baseName || fallbackBase}.${extension}`;
};

const createUniqueImageFileName = (
  fileName: string,
  usedFileNames: Set<string>
) => {
  const normalized = fileName || "image.png";
  const match = normalized.match(/^(.*?)(\.[^.]+)$/);
  const baseName = match?.[1] || normalized;
  const extension = match?.[2] || "";
  let candidate = normalized;
  let index = 2;

  while (usedFileNames.has(candidate.toLowerCase())) {
    candidate = `${baseName}-${index}${extension}`;
    index += 1;
  }

  usedFileNames.add(candidate.toLowerCase());
  return candidate;
};

const decodeBase64 = (value: string): Uint8Array | null => {
  try {
    const binary = atob(value.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
};

const parsePngDimensions = (bytes: Uint8Array) => {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false)
  };
};

const parseJpegDimensions = (bytes: Uint8Array) => {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    return null;
  }

  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      return null;
    }

    const segmentLength = (bytes[offset] << 8) + bytes[offset + 1];

    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame && segmentLength >= 7) {
      return {
        width: (bytes[offset + 5] << 8) + bytes[offset + 6],
        height: (bytes[offset + 3] << 8) + bytes[offset + 4]
      };
    }

    offset += segmentLength;
  }

  return null;
};

const normalizeImageDataUriMediaType = (
  value: string
): HWPXImageMediaType | null => {
  const mediaType = value.toLowerCase();

  if (mediaType === "image/jpg") {
    return "image/jpeg";
  }

  if (mediaType === "image/png" || mediaType === "image/jpeg") {
    return mediaType;
  }

  return null;
};

const parseImageDataUri = (target: string | null) => {
  const match = target?.match(/^data:(image\/(?:png|jpe?g));base64,([\s\S]+)$/i);

  if (!match) {
    return null;
  }

  const mediaType = normalizeImageDataUriMediaType(match[1]);
  const content = decodeBase64(match[2]);

  if (!mediaType || !content) {
    return null;
  }

  const dimensions =
    mediaType === "image/png"
      ? parsePngDimensions(content)
      : parseJpegDimensions(content);

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return null;
  }

  return {
    mediaType,
    content,
    dimensions
  };
};

const getImageRelationshipKey = (objectModel: Readonly<IRObjectModelV1>) =>
  objectModel.relationship.target ??
  objectModel.relationship.relationshipIdCandidate ??
  objectModel.relationship.objectId ??
  "";

const buildImageMediaRegistry = (
  input: HWPXMinimalExportInputV1
): Readonly<HWPXImageMediaRegistryV1> => {
  const definitions: Readonly<HWPXImageMediaDefinitionV1>[] = [];
  const keyToImage = new Map<string, Readonly<HWPXImageMediaDefinitionV1>>();
  const usedFileNames = new Set<string>();

  input.objectModels.forEach((objectModel) => {
    if (objectModel.objectKind !== "image") {
      return;
    }

    const relationshipKey = getImageRelationshipKey(objectModel);

    if (!relationshipKey || keyToImage.has(relationshipKey)) {
      return;
    }

    const parsed = parseImageDataUri(objectModel.relationship.target);

    if (!parsed) {
      return;
    }

    const id = `image${definitions.length + 1}`;
    const fileName = createUniqueImageFileName(
      sanitizeImageFileName(objectModel.relationship.fileName, id, parsed.mediaType),
      usedFileNames
    );
    const definition = Object.freeze({
      id,
      path: `BinData/${fileName}`,
      mediaType: parsed.mediaType,
      content: parsed.content,
      fileName,
      pixelWidth: parsed.dimensions.width,
      pixelHeight: parsed.dimensions.height,
      relationshipKey
    });

    definitions.push(definition);
    keyToImage.set(relationshipKey, definition);
  });

  return Object.freeze({
    definitions: freezeArray(definitions),
    keyToImage
  });
};

const getImageMedia = (
  registry: Readonly<HWPXImageMediaRegistryV1>,
  objectModel: Readonly<IRObjectModelV1>
) => registry.keyToImage.get(getImageRelationshipKey(objectModel)) ?? null;

const HWPX_BORDER_SIDE_TAGS: Readonly<
  Record<IRTableBorderSideV1, "leftBorder" | "rightBorder" | "topBorder" | "bottomBorder">
> = Object.freeze({
  left: "leftBorder",
  right: "rightBorder",
  top: "topBorder",
  bottom: "bottomBorder"
});

const HWPX_BORDER_SIDE_ORDER: readonly IRTableBorderSideV1[] = [
  "left",
  "right",
  "top",
  "bottom"
];

const HWPX_NAMED_COLORS: Readonly<Record<string, string>> = Object.freeze({
  black: "#000000",
  silver: "#C0C0C0",
  gray: "#808080",
  grey: "#808080",
  white: "#FFFFFF",
  maroon: "#800000",
  red: "#FF0000",
  purple: "#800080",
  fuchsia: "#FF00FF",
  magenta: "#FF00FF",
  green: "#008000",
  lime: "#00FF00",
  olive: "#808000",
  yellow: "#FFFF00",
  navy: "#000080",
  blue: "#0000FF",
  teal: "#008080",
  aqua: "#00FFFF",
  cyan: "#00FFFF",
  orange: "#FFA500",
  brown: "#A52A2A",
  pink: "#FFC0CB",
  transparent: "transparent"
});

const toHwpxHexColor = (red: number, green: number, blue: number) =>
  `#${[red, green, blue]
    .map((part) =>
      Math.max(0, Math.min(255, Math.round(part)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase()}`;

const parseRgbColorPart = (part: string) => {
  const trimmed = part.trim();
  const percentage = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);

  if (percentage) {
    const value = Number(percentage[1]);

    return Number.isFinite(value) && value >= 0 && value <= 100
      ? (value / 100) * 255
      : null;
  }

  const value = Number(trimmed);

  return Number.isFinite(value) && value >= 0 && value <= 255 ? value : null;
};

const isOpaqueAlpha = (part: string | undefined) => {
  if (part === undefined) {
    return true;
  }

  const trimmed = part.trim();
  const percentage = trimmed.match(/^(\d+(?:\.\d+)?)%$/);

  if (percentage) {
    return Number(percentage[1]) === 100;
  }

  return Number(trimmed) === 1;
};

const parseRgbFunctionalColor = (trimmed: string) => {
  const match = trimmed.match(/^rgba?\((.+)\)$/i);

  if (!match) {
    return null;
  }

  const body = match[1].trim();
  const slashParts = body.split("/");
  const alphaPart = slashParts.length === 2 ? slashParts[1] : undefined;

  if (slashParts.length > 2 || !isOpaqueAlpha(alphaPart)) {
    return null;
  }

  const colorPart = slashParts[0].trim();
  const parts = colorPart.includes(",")
    ? colorPart.split(",").map((part) => part.trim())
    : colorPart.split(/\s+/);
  const effectiveAlphaPart =
    colorPart.includes(",") && parts.length === 4 ? parts.pop() : undefined;

  if (parts.length !== 3 || !isOpaqueAlpha(effectiveAlphaPart)) {
    return null;
  }

  const channels = parts.map(parseRgbColorPart);

  return channels.every((part): part is number => part !== null)
    ? toHwpxHexColor(channels[0], channels[1], channels[2])
    : null;
};

const getCssVarFallback = (trimmed: string) => {
  const match = trimmed.match(/^var\(\s*--[\w-]+\s*,\s*(.+)\)$/i);

  return match ? match[1].trim() : null;
};

const resolveHwpxColor = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const shortHex = trimmed.match(/^#([0-9a-f]{3})$/i);

  if (shortHex) {
    return `#${shortHex[1]
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase()}`;
  }

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const namedColor = HWPX_NAMED_COLORS[trimmed.toLowerCase()];

  if (namedColor && namedColor !== "transparent") {
    return namedColor;
  }

  const rgbColor = parseRgbFunctionalColor(trimmed);

  if (rgbColor) {
    return rgbColor;
  }

  const fallback = getCssVarFallback(trimmed);

  return fallback ? resolveHwpxColor(fallback) : null;
};

const normalizeHwpxColor = (value: string | null) =>
  resolveHwpxColor(value) ?? DEFAULT_BORDER_COLOR;

const isSupportedHwpxColor = (value: string | null) =>
  value === null || resolveHwpxColor(value) !== null;

const normalizeHwpxFillColor = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const resolved = resolveHwpxColor(value);

  return resolved && resolved !== "#FFFFFF" ? resolved : null;
};

const hasUnsupportedHwpxFillColor = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (typeof value !== "string") {
    return true;
  }

  const trimmed = value.trim();

  return Boolean(
    trimmed &&
      trimmed.toLowerCase() !== "transparent" &&
      resolveHwpxColor(trimmed) === null
  );
};

const formatBorderWidthMm = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return `${DEFAULT_BORDER_WIDTH_MM} mm`;
  }

  const nearest = HWPX_BORDER_WIDTH_MM_VALUES.reduce((best, candidate) =>
    Math.abs(candidate.value - value) < Math.abs(best.value - value)
      ? candidate
      : best
  );

  return `${nearest.label} mm`;
};

const borderLengthToWidth = (
  length: Readonly<IRTableLengthV1> | null
): string => {
  if (!length || !Number.isFinite(length.value) || length.value <= 0) {
    return `${DEFAULT_BORDER_WIDTH_MM} mm`;
  }

  if (length.unit === "mm") {
    return formatBorderWidthMm(length.value);
  }

  if (length.unit === "pt") {
    return formatBorderWidthMm(length.value * MM_PER_PT);
  }

  if (length.unit === "px") {
    return formatBorderWidthMm(length.value * MM_PER_PX);
  }

  return `${DEFAULT_BORDER_WIDTH_MM} mm`;
};

const borderStyleToHWPXType = (
  line: Readonly<IRTableBorderLineV1>
): HWPXBorderLineTypeV1 => {
  if (line.source === "none" || line.style === "none") {
    return "NONE";
  }

  if (line.style === "dashed") {
    return "DASH";
  }

  if (line.style === "dotted") {
    return "DOT";
  }

  if (line.style === "double") {
    return "DOUBLE_SLIM";
  }

  return "SOLID";
};

const createBorderFillLine = (
  line: Readonly<IRTableBorderLineV1>
): Readonly<HWPXBorderFillLineV1> =>
  Object.freeze({
    type: borderStyleToHWPXType(line),
    width: borderLengthToWidth(line.width),
    color: normalizeHwpxColor(line.color)
  });

const createDefaultBorderFillDefinition = (): Readonly<HWPXBorderFillDefinitionV1> =>
  Object.freeze({
    id: DEFAULT_BORDER_FILL_ID,
    sides: Object.freeze({
      top: Object.freeze({
        type: "NONE" as const,
        width: `${DEFAULT_BORDER_WIDTH_MM} mm`,
        color: DEFAULT_BORDER_COLOR
      }),
      right: Object.freeze({
        type: "NONE" as const,
        width: `${DEFAULT_BORDER_WIDTH_MM} mm`,
        color: DEFAULT_BORDER_COLOR
      }),
      bottom: Object.freeze({
        type: "NONE" as const,
        width: `${DEFAULT_BORDER_WIDTH_MM} mm`,
        color: DEFAULT_BORDER_COLOR
      }),
      left: Object.freeze({
        type: "NONE" as const,
        width: `${DEFAULT_BORDER_WIDTH_MM} mm`,
        color: DEFAULT_BORDER_COLOR
      })
    }),
    backgroundColor: null
  });

const createParagraphSpacingParaPrRegistry =
  (): HWPXParagraphSpacingParaPrRegistryV1 => ({
    nextId: HWPX_CUSTOM_PARA_PR_START_ID,
    definitions: [],
    signatureToId: new Map()
  });

const createBorderFillSource = (
  borderBox: Readonly<IRTableBorderBoxV1>,
  backgroundColor: unknown
): Readonly<HWPXBorderFillSourceV1> =>
  Object.freeze({
    borderBox,
    backgroundColor: normalizeHwpxFillColor(backgroundColor)
  });

const createBorderFillDefinition = (
  source: Readonly<HWPXBorderFillSourceV1>,
  id: number
): Readonly<HWPXBorderFillDefinitionV1> =>
  Object.freeze({
    id,
    sides: Object.freeze({
      top: createBorderFillLine(source.borderBox.sides.top),
      right: createBorderFillLine(source.borderBox.sides.right),
      bottom: createBorderFillLine(source.borderBox.sides.bottom),
      left: createBorderFillLine(source.borderBox.sides.left)
    }),
    backgroundColor: source.backgroundColor
  });

const getBorderFillSignature = (
  definition: Readonly<HWPXBorderFillDefinitionV1>
) =>
  HWPX_BORDER_SIDE_ORDER.map((side) => {
    const line = definition.sides[side];

    return `${side}:${line.type}:${line.width}:${line.color}`;
  })
    .concat(`fill:${definition.backgroundColor ?? ""}`)
    .join("|");

const getBorderFillSignatureForSource = (
  source: Readonly<HWPXBorderFillSourceV1>
) => getBorderFillSignature(createBorderFillDefinition(source, 0));

const buildBorderFillRegistry = (
  input: HWPXMinimalExportInputV1
): Readonly<HWPXBorderFillRegistryV1> => {
  const definitions: Readonly<HWPXBorderFillDefinitionV1>[] = [
    createDefaultBorderFillDefinition()
  ];
  const signatureToId = new Map<string, number>([
    [getBorderFillSignature(definitions[0]), DEFAULT_BORDER_FILL_ID]
  ]);

  const registerBorderFill = (source: Readonly<HWPXBorderFillSourceV1>) => {
    const signature = getBorderFillSignatureForSource(source);

    if (signatureToId.has(signature)) {
      return;
    }

    const id = definitions.length + 1;
    const definition = createBorderFillDefinition(source, id);

    definitions.push(definition);
    signatureToId.set(signature, id);
  };

  input.tableModels.forEach((tableModel) => {
    registerBorderFill(
      createBorderFillSource(
        tableModel.tableBorder,
        tableModel.tableBorder.rawAttrs.backgroundColor
      )
    );
    tableModel.cells.forEach((cell) =>
      registerBorderFill(
        createBorderFillSource(cell.border, cell.rawAttrs.backgroundColor)
      )
    );
  });

  return Object.freeze({
    definitions: freezeArray(definitions),
    signatureToId
  });
};

const getBorderFillId = (
  registry: Readonly<HWPXBorderFillRegistryV1>,
  borderBox: Readonly<IRTableBorderBoxV1> | null | undefined,
  backgroundColor: unknown = null
) =>
  borderBox
    ? registry.signatureToId.get(
        getBorderFillSignatureForSource(
          createBorderFillSource(borderBox, backgroundColor)
        )
      ) ??
      DEFAULT_BORDER_FILL_ID
    : DEFAULT_BORDER_FILL_ID;

const hasBorderFallback = (line: Readonly<IRTableBorderLineV1>) =>
  line.style === "unknown" ||
  line.width?.unit === "percent" ||
  line.width?.unit === "unknown" ||
  !isSupportedHwpxColor(line.color);

const hasTableBorderFallback = (tableModel: Readonly<IRTableModelV1>) =>
  [
    tableModel.tableBorder,
    ...tableModel.cells.map((cell) => cell.border)
  ].some((borderBox) =>
    HWPX_BORDER_SIDE_ORDER.some((side) => hasBorderFallback(borderBox.sides[side]))
  ) ||
  hasUnsupportedHwpxFillColor(tableModel.tableBorder.rawAttrs.backgroundColor) ||
  tableModel.cells.some((cell) =>
    hasUnsupportedHwpxFillColor(cell.rawAttrs.backgroundColor)
  );

const getTableCellWidth = (
  tableModel: Readonly<IRTableModelV1> | null,
  start: number,
  end: number
) => {
  if (!tableModel) {
    return 5000;
  }

  return tableModel.columns
    .slice(start, end)
    .reduce(
      (sum, column) =>
        sum + tableLengthToHwpUnit(column.width, 5000),
      0
    );
};

const getTableRowHeight = (
  tableModel: Readonly<IRTableModelV1> | null,
  rowIndex: number
) =>
  tableLengthToHwpUnit(
    tableModel?.rows.find((row) => row.rowIndex === rowIndex)?.height ?? null,
    DEFAULT_TABLE_ROW_HEIGHT
  );

const getTableCellHeight = (
  tableModel: Readonly<IRTableModelV1> | null,
  rowIndex: number,
  rowSpan: number
) =>
  Array.from({ length: rowSpan }, (_, offset) =>
    getTableRowHeight(tableModel, rowIndex + offset)
  ).reduce((sum, rowHeight) => sum + rowHeight, 0);

const getTableHeight = (
  tableModel: Readonly<IRTableModelV1> | null,
  rowCount: number
) =>
  Array.from({ length: Math.max(1, rowCount) }, (_, rowIndex) =>
    getTableRowHeight(tableModel, rowIndex)
  ).reduce((sum, rowHeight) => sum + rowHeight, 0);

const renderNestedBlock = (
  block: IRBlock,
  context: RenderContext,
  location: BlockLocation
): string => {
  if (block.type === "paragraph" || block.type === "heading") {
    return renderTextBlock(block, null, context, {
      ...location,
      blockType: block.type
    });
  }

  if (block.type === "list") {
    return renderListBlock(block, null, context, {
      ...location,
      blockType: "list"
    });
  }

  if (block.type === "object") {
    return renderObjectBlock(block, null, context, {
      ...location,
      blockType: "object"
    });
  }

  if (block.type === "unsupported") {
    return renderUnsupportedBlock(block, context, {
      ...location,
      blockType: "unsupported"
    });
  }

  warn(
    context,
    location,
    "unsupported-nested-block",
    `Nested ${block.type} is not emitted by the minimal HWPX writer.`
  );

  return renderSyntheticParagraph(`[Unsupported nested block: ${block.type}]`, context, {
    ...location,
    blockType: block.type
  });
};

const renderTableCell = (
  cell: IRTableCell,
  tableModel: Readonly<IRTableModelV1> | null,
  rowIndex: number,
  cellIndex: number,
  tableRowCount: number,
  context: RenderContext,
  location: BlockLocation
) => {
  const modelCell =
    tableModel?.cells.find(
      (candidate) =>
        candidate.rowIndex === rowIndex && candidate.cellIndex === cellIndex
    ) ?? null;
  const gridColumnStart = modelCell?.gridColumnStart ?? cellIndex;
  const gridColumnEnd = modelCell?.gridColumnEnd ?? cellIndex + 1;
  const rawRowSpan = modelCell?.gridRowSpan ?? cell.attrs.rowspan ?? 1;
  const safeRowSpan = Math.min(rawRowSpan, Math.max(1, tableRowCount - rowIndex));
  const cellWidth = getTableCellWidth(tableModel, gridColumnStart, gridColumnEnd);
  const cellHeight = getTableCellHeight(tableModel, rowIndex, safeRowSpan);
  const borderFillId = getBorderFillId(
    context.borderFills,
    modelCell?.border,
    modelCell?.rawAttrs.backgroundColor ?? cell.attrs.backgroundColor
  );
  const cellBlocks = cell.blocks
    .map((block, nestedIndex) =>
      renderNestedBlock(block, context, {
        ...location,
        blockIndex: null,
        blockType: block.type,
        path: `${location.path}.rows[${rowIndex}].cells[${cellIndex}].blocks[${nestedIndex}]`
      })
    )
    .join("");

  return [
    `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${borderFillId}">`,
    '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">',
    cellBlocks || renderSyntheticParagraph("", context, location),
    "</hp:subList>",
    `<hp:cellAddr colAddr="${gridColumnStart}" rowAddr="${rowIndex}"/>`,
    `<hp:cellSpan colSpan="${
      modelCell?.gridColumnSpan ?? cell.attrs.colspan ?? 1
    }" rowSpan="${safeRowSpan}"/>`,
    `<hp:cellSz width="${cellWidth}" height="${cellHeight}"/>`,
    '<hp:cellMargin left="141" right="141" top="141" bottom="141"/>',
    "</hp:tc>"
  ].join("");
};

const renderTableBlock = (
  block: IRTableBlock,
  tableModel: Readonly<IRTableModelV1> | null,
  context: RenderContext,
  location: BlockLocation
) => {
  const tableId = context.tableId;
  context.tableId += 1;
  const tableGridView = tableModel
    ? createHWPXNormalizedTableGridView(tableModel)
    : null;

  if (tableModel && hasTableBorderFallback(tableModel)) {
    warn(
      context,
      location,
      "table-border-style-fallback",
      "Some table border values are outside the HWPX borderFill spike scope and were mapped with conservative fallback values."
    );
  }

  if (tableModel?.cells.some((cell) => cell.isMerged)) {
    warn(
      context,
      location,
      "table-merge-layout-warning",
      `Merged cells preserve colspan/rowspan metadata, but row-group export normalization is not implemented. ${
        tableGridView
          ? summarizeHWPXTableGridViewForWarning(tableGridView)
          : "coveredSlots=unknown; rowGroups=unknown; risks=unknown"
      }.`
    );
  }

  const effectiveRowCount = block.rows.length;
  const rows = block.rows
    .map(
      (row, rowIndex) =>
        `<hp:tr>${row.cells
          .map((cell, cellIndex) =>
            renderTableCell(
              cell,
              tableModel,
              rowIndex,
              cellIndex,
              effectiveRowCount,
              context,
              location
            )
          )
          .join("")}</hp:tr>`
    )
    .join("");
  const tableBorderFillId = getBorderFillId(
    context.borderFills,
    tableModel?.tableBorder,
    tableModel?.tableBorder.rawAttrs.backgroundColor
  );

  return [
    `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
    '<hp:run charPrIDRef="0">',
    `<hp:tbl id="${2147000000 + tableId}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${effectiveRowCount}" colCnt="${tableModel?.columnCount ?? 0}" cellSpacing="0" borderFillIDRef="${tableBorderFillId}" noAdjust="0">`,
    `<hp:sz width="${getTableCellWidth(tableModel, 0, tableModel?.columnCount ?? 1)}" widthRelTo="ABSOLUTE" height="${getTableHeight(tableModel, effectiveRowCount)}" heightRelTo="ABSOLUTE" protect="0"/>`,
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>',
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>',
    '<hp:inMargin left="141" right="141" top="141" bottom="141"/>',
    rows,
    "</hp:tbl>",
    "<hp:t/>",
    "</hp:run>",
    renderLineSegArray(),
    "</hp:p>"
  ].join("");
};

const getObjectLabel = (
  block: IRObjectBlock,
  objectModel: Readonly<IRObjectModelV1> | null
) => {
  const objectId =
    objectModel?.relationship.objectId ??
    (typeof block.attrs.objectId === "string" ? block.attrs.objectId : null) ??
    (typeof block.attrs.id === "string" ? block.attrs.id : null);
  const kind = objectModel?.objectKind ?? block.objectType;

  return `[Object placeholder: ${kind}${objectId ? ` ${objectId}` : ""}]`;
};

const renderImageObjectBlock = (
  objectModel: Readonly<IRObjectModelV1>,
  image: Readonly<HWPXImageMediaDefinitionV1>,
  context: RenderContext
) => {
  const pictureId = context.pictureId;
  context.pictureId += 1;

  const intrinsicWidth = image.pixelWidth * HWPUNIT_PER_IMAGE_PX;
  const intrinsicHeight = image.pixelHeight * HWPUNIT_PER_IMAGE_PX;
  const width = objectLengthToHwpUnit(objectModel.size.width, intrinsicWidth);
  const height = objectLengthToHwpUnit(objectModel.size.height, intrinsicHeight);
  const altText = objectModel.metadata.altText ?? "Image";
  const title = objectModel.metadata.title ?? image.fileName;
  const shapeComment = `${title}\n${altText}`;

  return [
    `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
    '<hp:run charPrIDRef="0">',
    `<hp:pic id="${2147100000 + pictureId}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${9000000 + pictureId}" reverse="0">`,
    '<hp:offset x="0" y="0"/>',
    `<hp:orgSz width="${intrinsicWidth}" height="${intrinsicHeight}"/>`,
    '<hp:curSz width="0" height="0"/>',
    '<hp:flip horizontal="0" vertical="0"/>',
    '<hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/>',
    '<hp:renderingInfo>',
    '<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>',
    '<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>',
    '<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>',
    '</hp:renderingInfo>',
    `<hc:img binaryItemIDRef="${escapeXml(
      image.id
    )}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>`,
    '<hp:imgRect>',
    '<hc:pt0 x="0" y="0"/>',
    `<hc:pt1 x="${intrinsicWidth}" y="0"/>`,
    `<hc:pt2 x="${intrinsicWidth}" y="${intrinsicHeight}"/>`,
    `<hc:pt3 x="0" y="${intrinsicHeight}"/>`,
    '</hp:imgRect>',
    '<hp:imgClip left="0" right="0" top="0" bottom="0"/>',
    '<hp:inMargin left="0" right="0" top="0" bottom="0"/>',
    '<hp:imgDim dimwidth="0" dimheight="0"/>',
    '<hp:effects/>',
    `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>`,
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>',
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>',
    `<hp:shapeComment>${escapeXml(shapeComment)}</hp:shapeComment>`,
    '</hp:pic>',
    '<hp:t/>',
    '</hp:run>',
    renderLineSegArray(),
    '</hp:p>'
  ].join("");
};

function renderObjectBlock(
  block: IRObjectBlock,
  objectModel: Readonly<IRObjectModelV1> | null,
  context: RenderContext,
  location: BlockLocation
) {
  const normalizedObjectModel = objectModel ?? normalizeObjectModel(block);
  const imageMedia =
    normalizedObjectModel.objectKind === "image"
      ? getImageMedia(context.imageMedia, normalizedObjectModel)
      : null;

  if (imageMedia) {
    return renderImageObjectBlock(normalizedObjectModel, imageMedia, context);
  }

  warn(
    context,
    location,
    "object-placeholder",
    "Object media parts and relationships are not emitted; a visible placeholder paragraph is written instead."
  );

  return renderSyntheticParagraph(
    getObjectLabel(block, normalizedObjectModel),
    context,
    location
  );
}

function renderUnsupportedBlock(
  block: IRUnsupportedBlock,
  context: RenderContext,
  location: BlockLocation
) {
  if (block.nodeType === "codeBlock") {
    warn(
      context,
      location,
      "semantic-block-fallback",
      "Unsupported IR codeBlock is emitted as code-like HWPX paragraphs with monospace shaded text."
    );

    const charPrIdRef = getSemanticCodeBlockCharPrIdRef(context.charProperties);

    return getUnsupportedBlockFallbackText(block)
      .split("\n")
      .map((line) =>
        renderStyledSyntheticParagraph(
          line,
          HWPX_CODE_BLOCK_PARA_PR_ID,
          charPrIdRef,
          context
        )
      )
      .join("");
  }

  if (block.nodeType === "blockquote") {
    warn(
      context,
      location,
      "semantic-block-fallback",
      "Unsupported IR blockquote is emitted as quote-like HWPX paragraphs with indentation and italic text."
    );

    const charPrIdRef = getSemanticBlockquoteCharPrIdRef(
      context.charProperties
    );

    return getUnsupportedBlockFallbackText(block)
      .split("\n")
      .map((line) =>
        renderStyledSyntheticParagraph(
          line,
          HWPX_BLOCKQUOTE_PARA_PR_ID,
          charPrIdRef,
          context
        )
      )
      .join("");
  }

  warn(
    context,
    location,
    "unsupported-block",
    `Unsupported IR block '${block.nodeType}' is emitted with raw text fallback when available.`,
    "blocked"
  );

  return getUnsupportedBlockFallbackText(block)
    .split("\n")
    .map((line) => renderSyntheticParagraph(line, context, location))
    .join("");
}

const renderBlock = (
  block: IRBlock,
  view: Readonly<HWPXMinimalBlockModelViewV1> | null,
  context: RenderContext,
  location: BlockLocation
) => {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return renderTextBlock(block, view?.style ?? null, context, location);
    case "list":
      return renderListBlock(
        block,
        view?.listNumbering ?? asListStyle(view?.style ?? null)?.numbering ?? null,
        context,
        location
      );
    case "table":
      return renderTableBlock(
        block,
        view?.table ?? asTableStyle(view?.style ?? null)?.table ?? null,
        context,
        location
      );
    case "object":
      return renderObjectBlock(
        block,
        view?.object ?? asObjectStyle(view?.style ?? null)?.object ?? null,
        context,
        location
      );
    case "unsupported":
      return renderUnsupportedBlock(block, context, location);
    default:
      return "";
  }
};

const buildSectionXml = (
  input: HWPXMinimalExportInputV1,
  sectionIndex: number,
  context: RenderContext
) => {
  const section = input.irDocument.sections[sectionIndex];
  const page = section.pageSettings;
  const pageWidth = mmToHwpUnit(page.widthMm);
  const pageHeight = mmToHwpUnit(page.heightMm);
  const marginTop = mmToHwpUnit(page.paddingTopMm);
  const marginBottom = mmToHwpUnit(page.paddingBottomMm);
  const marginLeft = mmToHwpUnit(page.paddingLeftMm);
  const marginRight = mmToHwpUnit(page.paddingRightMm);
  const sectionPr = [
    `<hp:p id="${nextParagraphId(context)}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`,
    '<hp:run charPrIDRef="0">',
    '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="1" textVerticalWidthHead="0" masterPageCnt="0">',
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>',
    '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>',
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>',
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>',
    `<hp:pagePr landscape="WIDELY" width="${pageWidth}" height="${pageHeight}" gutterType="LEFT_ONLY"><hp:margin header="2834" footer="2834" gutter="0" left="${marginLeft}" right="${marginRight}" top="${marginTop}" bottom="${marginBottom}"/></hp:pagePr>`,
    '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>',
    '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>',
    '<hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>',
    '</hp:secPr>',
    '</hp:run>',
    renderLineSegArray(),
    '</hp:p>'
  ].join("");
  const blocks = section.blocks
    .map((block, blockIndex) =>
      renderBlock(
        block,
        getBlockView(input, sectionIndex, blockIndex),
        context,
        {
          sectionIndex,
          blockIndex,
          blockType: block.type,
          path: `sections[${sectionIndex}].blocks[${blockIndex}]`
        }
      )
    )
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<hs:sec ${COMMON_HWPX_NAMESPACES}>`,
    sectionPr,
    blocks,
    "</hs:sec>"
  ].join("");
};

const buildFontFacesXml = (charProperties: HWPXCharPrRegistryV1) => {
  const langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];
  const fontFaces = Array.from(charProperties.fontFaceToId.entries()).sort(
    ([, leftId], [, rightId]) => leftId - rightId
  );
  const createFontXml = ([face, id]: readonly [string, number]) =>
    `<hh:font id="${id}" face="${escapeXml(
      face
    )}" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="5" proportion="3" contrast="2" strokeVariation="0" armStyle="0" letterform="2" midline="0" xHeight="4"/></hh:font>`;
  const allFontXml = fontFaces.map(createFontXml).join("");
  const defaultFontXml = createFontXml(["Arial", 0]);

  return [
    '<hh:fontfaces itemCnt="7">',
    ...langs.map((lang) =>
      lang === "SYMBOL" || lang === "USER"
        ? `<hh:fontface lang="${lang}" fontCnt="1">${defaultFontXml}</hh:fontface>`
        : `<hh:fontface lang="${lang}" fontCnt="${fontFaces.length}">${allFontXml}</hh:fontface>`
    ),
    "</hh:fontfaces>"
  ].join("");
};

const renderBorderFillXml = (
  definition: Readonly<HWPXBorderFillDefinitionV1>
) =>
  [
    `<hh:borderFill id="${definition.id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">`,
    '<hh:slash type="NONE" Crooked="0" isCounter="0"/>',
    '<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>',
    ...HWPX_BORDER_SIDE_ORDER.map((side) => {
      const line = definition.sides[side];

      return `<hh:${HWPX_BORDER_SIDE_TAGS[side]} type="${line.type}" width="${escapeXml(
        line.width
      )}" color="${escapeXml(line.color)}"/>`;
    }),
    '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>',
    definition.backgroundColor
      ? `<hh:fillBrush><hc:winBrush faceColor="${escapeXml(
          definition.backgroundColor
        )}" hatchColor="#000000" alpha="0"/></hh:fillBrush>`
      : "",
    "</hh:borderFill>"
  ].join("");

const buildBorderFillsXml = (
  registry: Readonly<HWPXBorderFillRegistryV1>
) =>
  [
    `<hh:borderFills itemCnt="${registry.definitions.length}">`,
    ...registry.definitions.map(renderBorderFillXml),
    "</hh:borderFills>"
  ].join("");

const buildCharPrXml = (definition: HWPXCharPrDefinitionV1) =>
  [
    `<hh:charPr id="${definition.id}" height="${definition.height}" textColor="${escapeXml(
      definition.textColor
    )}" shadeColor="${escapeXml(
      definition.shadeColor
    )}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1" bold="${
      definition.bold ? 1 : 0
    }" italic="${definition.italic ? 1 : 0}">`,
    `<hh:fontRef hangul="${definition.fontFaceId}" latin="${definition.fontFaceId}" hanja="${definition.fontFaceId}" japanese="${definition.fontFaceId}" other="${definition.fontFaceId}" symbol="0" user="0"/>`,
    '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>',
    '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>',
    '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>',
    '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>',
    `<hh:underline type="${
      definition.underline ? "BOTTOM" : "NONE"
    }" shape="SOLID" color="${escapeXml(definition.textColor)}"/>`,
    `<hh:strikeout shape="${
      definition.strike ? "SOLID" : "NONE"
    }" color="${escapeXml(definition.textColor)}"/>`,
    '<hh:outline type="NONE"/>',
    '<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>',
    definition.verticalAlign === "superscript" ? "<hh:supscript/>" : "",
    definition.verticalAlign === "subscript" ? "<hh:subscript/>" : "",
    "</hh:charPr>"
  ].join("");

const buildParaPrXml = (
  id: number,
  headingLevel: number,
  options: { prev?: number; next?: number; lineSpacing?: number } = {}
) =>
  [
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">`,
    '<hh:align horizontal="JUSTIFY" vertical="BASELINE"/>',
    `<hh:heading type="NONE" idRef="0" level="${headingLevel}"/>`,
    '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>',
    '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>',
    `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="${options.prev ?? 0}" unit="HWPUNIT"/><hc:next value="${options.next ?? 0}" unit="HWPUNIT"/></hh:margin>`,
    `<hh:lineSpacing type="PERCENT" value="${options.lineSpacing ?? 160}" unit="HWPUNIT"/>`,
    '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>',
    "</hh:paraPr>"
  ].join("");

const buildSemanticParaPrXml = (
  id: number,
  {
    left,
    right = 0,
    prev = 0,
    next = 0,
    lineSpacing = 160,
    horizontal = "JUSTIFY"
  }: {
    left: number;
    right?: number;
    prev?: number;
    next?: number;
    lineSpacing?: number;
    horizontal?: "JUSTIFY" | "LEFT";
  }
) =>
  [
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">`,
    `<hh:align horizontal="${horizontal}" vertical="BASELINE"/>`,
    '<hh:heading type="NONE" idRef="0" level="0"/>',
    '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>',
    '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>',
    `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="${left}" unit="HWPUNIT"/><hc:right value="${right}" unit="HWPUNIT"/><hc:prev value="${prev}" unit="HWPUNIT"/><hc:next value="${next}" unit="HWPUNIT"/></hh:margin>`,
    `<hh:lineSpacing type="PERCENT" value="${lineSpacing}" unit="HWPUNIT"/>`,
    '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>',
    "</hh:paraPr>"
  ].join("");

const hasListType = (
  input: HWPXMinimalExportInputV1,
  listType: IRListBlock["listType"]
) => input.listNumberingModels.some((model) => model.rootListType === listType);

const getNativeOrderedStart = (input: HWPXMinimalExportInputV1) =>
  input.listNumberingModels.find((model) => model.rootListType === "ordered")
    ?.levels[0]?.startNumber ?? 1;

const createNativeListIds = (
  input: HWPXMinimalExportInputV1
): HWPXNativeListIds => {
  let nextParaPrId = 7;
  const orderedParaPrId = hasListType(input, "ordered") ? nextParaPrId : null;

  if (orderedParaPrId !== null) {
    nextParaPrId += 1;
  }

  const bulletParaPrId = hasListType(input, "bullet") ? nextParaPrId : null;

  return {
    orderedParaPrId,
    bulletParaPrId
  };
};

const buildListParaPrXml = (
  id: number,
  type: "NUMBER" | "BULLET",
  idRef: number
) =>
  [
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">`,
    '<hh:align horizontal="JUSTIFY" vertical="BASELINE"/>',
    `<hh:heading type="${type}" idRef="${idRef}" level="0"/>`,
    '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>',
    '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>',
    '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="1200" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>',
    '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>',
    '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>',
    "</hh:paraPr>"
  ].join("");

const buildNumberingsXml = (
  input: HWPXMinimalExportInputV1,
  nativeListIds: HWPXNativeListIds
) => {
  if (nativeListIds.orderedParaPrId === null) {
    return '<hh:numberings itemCnt="0"/>';
  }

  const start = getNativeOrderedStart(input);

  return [
    '<hh:numberings itemCnt="1">',
    '<hh:numbering id="1" start="0">',
    `<hh:paraHead start="${start}" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead>`,
    "</hh:numbering>",
    "</hh:numberings>"
  ].join("");
};

const buildBulletsXml = (nativeListIds: HWPXNativeListIds) =>
  nativeListIds.bulletParaPrId !== null
    ? `<hh:bullets itemCnt="1"><hh:bullet id="1" charPrIDRef="0" checkable="0" char="${BULLET_MARKER}" checkedChar="${CHECKED_MARKER}" useImage="0"/></hh:bullets>`
    : '<hh:bullets itemCnt="0"/>';

const buildHeaderXml = (
  sectionCount: number,
  input: HWPXMinimalExportInputV1,
  nativeListIds: HWPXNativeListIds,
  charProperties: HWPXCharPrRegistryV1,
  borderFills: Readonly<HWPXBorderFillRegistryV1>,
  paragraphSpacingParaPrs: Readonly<HWPXParagraphSpacingParaPrRegistryV1>
) => {
  const paragraphSpacingParaProperties =
    paragraphSpacingParaPrs.definitions
      .map((definition) =>
        buildParaPrXml(definition.id, definition.headingLevel, {
          prev: definition.prev,
          next: definition.next,
          lineSpacing: definition.lineSpacing
        })
      )
      .join("");
  const listParaProperties = [
    nativeListIds.orderedParaPrId !== null
      ? buildListParaPrXml(nativeListIds.orderedParaPrId, "NUMBER", 1)
      : "",
    nativeListIds.bulletParaPrId !== null
      ? buildListParaPrXml(nativeListIds.bulletParaPrId, "BULLET", 1)
      : ""
  ].join("");
  const paraPropertyCount =
    9 +
    paragraphSpacingParaPrs.definitions.length +
    (nativeListIds.orderedParaPrId !== null ? 1 : 0) +
    (nativeListIds.bulletParaPrId !== null ? 1 : 0);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<hh:head ${COMMON_HWPX_NAMESPACES} version="1.5" secCnt="${sectionCount}">`,
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>',
    '<hh:refList>',
    buildFontFacesXml(charProperties),
    buildBorderFillsXml(borderFills),
    `<hh:charProperties itemCnt="${charProperties.definitions.length}">` +
      charProperties.definitions.map(buildCharPrXml).join("") +
      "</hh:charProperties>",
    '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>',
    `<hh:paraProperties itemCnt="${paraPropertyCount}">` +
      Array.from({ length: 7 }, (_, id) => buildParaPrXml(id, id)).join("") +
      buildSemanticParaPrXml(HWPX_CODE_BLOCK_PARA_PR_ID, {
        left: 567,
        right: 567,
        prev: 120,
        next: 120,
        lineSpacing: 140,
        horizontal: "LEFT"
      }) +
      buildSemanticParaPrXml(HWPX_BLOCKQUOTE_PARA_PR_ID, {
        left: 850,
        right: 283,
        prev: 120,
        next: 120,
        lineSpacing: 160
      }) +
      paragraphSpacingParaProperties +
      listParaProperties +
      "</hh:paraProperties>",
    '<hh:styles itemCnt="7"><hh:style id="0" type="PARA" name="Normal" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1033" lockForm="0"/><hh:style id="1" type="PARA" name="Heading 1" engName="Heading 1" paraPrIDRef="1" charPrIDRef="1" nextStyleIDRef="0" langID="1033" lockForm="0"/><hh:style id="2" type="PARA" name="Heading 2" engName="Heading 2" paraPrIDRef="2" charPrIDRef="1" nextStyleIDRef="0" langID="1033" lockForm="0"/><hh:style id="3" type="PARA" name="Heading 3" engName="Heading 3" paraPrIDRef="3" charPrIDRef="1" nextStyleIDRef="0" langID="1033" lockForm="0"/><hh:style id="4" type="PARA" name="Heading 4" engName="Heading 4" paraPrIDRef="4" charPrIDRef="1" nextStyleIDRef="0" langID="1033" lockForm="0"/><hh:style id="5" type="PARA" name="Heading 5" engName="Heading 5" paraPrIDRef="5" charPrIDRef="1" nextStyleIDRef="0" langID="1033" lockForm="0"/><hh:style id="6" type="PARA" name="Heading 6" engName="Heading 6" paraPrIDRef="6" charPrIDRef="1" nextStyleIDRef="0" langID="1033" lockForm="0"/></hh:styles>',
    buildNumberingsXml(input, nativeListIds),
    buildBulletsXml(nativeListIds),
    '<hh:memoProperties itemCnt="1"><hh:memoPr id="0" width="4252" lineType="SOLID" lineWidth="0.1 mm" lineColor="#000000" fillColor="#FFFF99" active="0"/></hh:memoProperties>',
    "</hh:refList>",
    '<hh:compatibleDocument targetProgram="HWP2014"><hh:layoutCompatibility char="0" paragraph="0" section="0" object="0" field="0"/></hh:compatibleDocument>',
    '<hh:docOption><hh:linkinfo path=""/></hh:docOption>',
    "</hh:head>"
  ].join("");
};

const buildContentHpf = (
  sectionCount: number,
  imageMedia: Readonly<HWPXImageMediaRegistryV1>
) => {
  const sectionItems = Array.from({ length: sectionCount }, (_, index) =>
    `<opf:item id="section${index}" href="Contents/section${index}.xml" media-type="application/xml"/>`
  ).join("");
  const imageItems = imageMedia.definitions
    .map(
      (image) =>
        `<opf:item id="${escapeXml(image.id)}" href="${escapeXml(
          image.path
        )}" media-type="${escapeXml(image.mediaType)}" isEmbeded="1"/>`
    )
    .join("");
  const spineItems = Array.from({ length: sectionCount }, (_, index) =>
    `<opf:itemref idref="section${index}"/>`
  ).join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<opf:package ${COMMON_HWPX_NAMESPACES} version="" unique-identifier="" id="">`,
    '<opf:metadata><opf:title>Dockit HWPX minimal export spike</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">Dockit IR spike</opf:meta></opf:metadata>',
    '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
      imageItems +
      sectionItems +
      '<opf:item id="headersc" href="Scripts/headerScripts.js" media-type="application/x-javascript ;charset=utf-16"/><opf:item id="sourcesc" href="Scripts/sourceScripts.js" media-type="application/x-javascript ;charset=utf-16"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>',
    `<opf:spine><opf:itemref idref="header" linear="yes"/>${spineItems}<opf:itemref idref="headersc" linear="yes"/><opf:itemref idref="sourcesc" linear="yes"/></opf:spine>`,
    "</opf:package>"
  ].join("");
};

const buildVersionXml = () =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Dockit" appVersion="hwpx-minimal-export-spike"/>'
  ].join("");

const buildContainerXml = () =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">',
    '<ocf:rootfiles>',
    '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>',
    '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>',
    '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>',
    '</ocf:rootfiles>',
    '</ocf:container>'
  ].join("");

const buildContainerRdf = () =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/>'
  ].join("");

const buildSettingsXml = () =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>'
  ].join("");

const buildManifestXml = (entries: readonly HWPXMinimalPackageEntry[]) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">',
    '<manifest:file-entry manifest:media-type="application/hwp+zip" manifest:full-path="/"/>',
    entries
      .filter((entry) => entry.path !== "mimetype")
      .map(
        (entry) =>
          `<manifest:file-entry manifest:media-type="${escapeXml(
            entry.mediaType
          )}" manifest:full-path="${escapeXml(entry.path)}"/>`
      )
      .join(""),
    "</manifest:manifest>"
  ].join("");

const buildPreviewText = (input: HWPXMinimalExportInputV1) =>
  input.irDocument.sections
    .map((section) => section.blocks.map(plainBlockText).join("\n"))
    .join("\n\n");

const blockContainsNoteReference = (block: Readonly<IRBlock>): boolean => {
  if (block.type === "paragraph" || block.type === "heading") {
    return block.runs.some((run) => run.type === "noteReference");
  }
  if (block.type === "list") {
    return block.items.some((item) =>
      item.blocks.some((child) => blockContainsNoteReference(child))
    );
  }
  if (block.type === "table") {
    return block.rows.some((row) =>
      row.cells.some((cell) =>
        cell.blocks.some((child) => blockContainsNoteReference(child))
      )
    );
  }
  if (block.type === "object") {
    return (block.children ?? []).some((child) => blockContainsNoteReference(child));
  }
  return false;
};

const assertHWPXNoteReferencePlacements = (irDocument: Readonly<IRDocument>) => {
  const assertBlocks = (
    blocks: readonly Readonly<IRBlock>[],
    container: "section" | "tableCell"
  ) => {
    blocks.forEach((block) => {
      if (block.type === "list" || block.type === "object") {
        if (blockContainsNoteReference(block)) {
          throw new IRNoteCompatibilityError(
            "HWPX_NOTE_EXPORT_REFERENCE_CONTEXT_UNSUPPORTED",
            `HWPX note references inside ${block.type} children are not supported by the native writer.`
          );
        }
        return;
      }
      if (block.type === "table") {
        if (container !== "section") {
          if (blockContainsNoteReference(block)) {
            throw new IRNoteCompatibilityError(
              "HWPX_NOTE_EXPORT_REFERENCE_CONTEXT_UNSUPPORTED",
              "HWPX note references inside a nested table are not supported by the native writer."
            );
          }
          return;
        }
        block.rows.forEach((row) =>
          row.cells.forEach((cell) => assertBlocks(cell.blocks, "tableCell"))
        );
      }
    });
  };

  irDocument.sections.forEach((section) => assertBlocks(section.blocks, "section"));
};

export const exportIRToMinimalHWPX = (
  input: HWPXMinimalExportInputV1
): Readonly<HWPXMinimalExportResult> => {
  assertValidIRNoteSemantics(input.irDocument);
  assertHWPXNoteReferencePlacements(input.irDocument);
  (input.irDocument.notes ?? []).forEach(assertHWPXNoteBodyRepresentable);
  const noteNativeIds = new Map<
    string,
    { kind: "footnote" | "endnote"; instId: number; number: number }
  >();
  const noteCounters = { footnote: 0, endnote: 0 };
  getIRNoteReferences(input.irDocument).forEach((reference, referenceOrder) => {
    noteCounters[reference.kind] += 1;
    noteNativeIds.set(reference.noteId, {
      kind: reference.kind,
      instId: referenceOrder + 1,
      number: noteCounters[reference.kind]
    });
  });
  const nativeListIds = createNativeListIds(input);
  const borderFills = buildBorderFillRegistry(input);
  const imageMedia = buildImageMediaRegistry(input);
  const charProperties = createCharPrRegistry();
  const paragraphSpacingParaPrs = createParagraphSpacingParaPrRegistry();
  const context: RenderContext = {
    warnings: [],
    warningKeys: new Set(),
    paragraphId: 0,
    tableId: 0,
    pictureId: 0,
    nativeListIds,
    charProperties,
    borderFills,
    imageMedia,
    paragraphSpacingParaPrs,
    hyperlinkId: 1,
    noteNativeIds,
    notesById: new Map((input.irDocument.notes ?? []).map((note) => [note.noteId, note]))
  };
  const sectionEntries = input.irDocument.sections.map((_, sectionIndex) =>
    Object.freeze({
      path: `Contents/section${sectionIndex}.xml`,
      mediaType: "application/xml",
      content: buildSectionXml(input, sectionIndex, context)
    })
  );
  const initialEntries = freezeArray<HWPXMinimalPackageEntry>([
    Object.freeze({
      path: "mimetype",
      mediaType: HWPX_MIMETYPE,
      content: HWPX_MIMETYPE
    }),
    Object.freeze({
      path: "version.xml",
      mediaType: "application/xml",
      content: buildVersionXml()
    }),
    Object.freeze({
      path: "META-INF/container.xml",
      mediaType: "application/xml",
      content: buildContainerXml()
    }),
    Object.freeze({
      path: "META-INF/container.rdf",
      mediaType: "application/rdf+xml",
      content: buildContainerRdf()
    }),
    Object.freeze({
      path: "Contents/content.hpf",
      mediaType: "application/xml",
      content: buildContentHpf(input.irDocument.sections.length, imageMedia)
    }),
    Object.freeze({
      path: "Contents/header.xml",
      mediaType: "application/xml",
      content: buildHeaderXml(
        input.irDocument.sections.length,
        input,
        nativeListIds,
        charProperties,
        borderFills,
        paragraphSpacingParaPrs
      )
    }),
    ...imageMedia.definitions.map((image) =>
      Object.freeze({
        path: image.path,
        mediaType: image.mediaType,
        content: image.content
      })
    ),
    ...sectionEntries,
    Object.freeze({
      path: "Preview/PrvText.txt",
      mediaType: "text/plain",
      content: buildPreviewText(input)
    }),
    Object.freeze({
      path: "Scripts/headerScripts.js",
      mediaType: "application/x-javascript ;charset=utf-16",
      content: ""
    }),
    Object.freeze({
      path: "Scripts/sourceScripts.js",
      mediaType: "application/x-javascript ;charset=utf-16",
      content: ""
    }),
    Object.freeze({
      path: "settings.xml",
      mediaType: "application/xml",
      content: buildSettingsXml()
    })
  ]);
  const entries = freezeArray([
    initialEntries[0],
    Object.freeze({
      path: "META-INF/manifest.xml",
      mediaType: "application/xml",
      content: buildManifestXml(initialEntries)
    }),
    ...initialEntries.slice(1)
  ]);

  return Object.freeze({
    packageBytes: createStoredZip(entries),
    entries,
    warnings: freezeArray(context.warnings)
  });
};

export const createHWPXV0ExportInput = createHWPXMinimalExportInput;
export const exportIRToHWPXV0 = exportIRToMinimalHWPX;

const encoder = new TextEncoder();

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

const createStoredZip = (entries: readonly HWPXMinimalPackageEntry[]) => {
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
