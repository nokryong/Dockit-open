import type {
  IRBlock,
  IRBlockPaginationHints,
  IRDocument,
  IRHardBreak,
  IRHeadingBlock,
  IRInlineNode,
  IRListBlock,
  IRListItem,
  IRMark,
  IRNoteBody,
  IRNoteInlineNode,
  IRObjectAnchorMode,
  IRObjectBlock,
  IRObjectFlowMode,
  IRObjectPlacementHints,
  IRPageSettings,
  IRParagraphBlock,
  IRSection,
  IRSectionBreakType,
  IRTableBlock,
  IRTableCell,
  IRTablePaginationHints,
  IRTableRow,
  IRTextRun,
  IRUnsupportedBlock
} from "./types";
import { validateNoteSemantics } from "../utils/noteSemanticUtils";
import { IRNoteCompatibilityError } from "./noteIRUtils";

interface PMMark {
  type?: string;
  attrs?: Record<string, unknown>;
}

interface PMNode {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: PMMark[];
  content?: PMNode[];
}

export interface FromProseMirrorOptions {
  pageSettings?: Partial<IRPageSettings>;
  sectionId?: string;
  sectionBreakType?: IRSectionBreakType;
  extractedAt?: string;
  extractorVersion?: string;
}

const CURRENT_IR_VERSION: IRDocument["version"] = "ir-v1.1-draft";
const CURRENT_EXTRACTOR_VERSION = "0.2.0";

const DEFAULT_PAGE_SETTINGS: IRPageSettings = {
  widthMm: 210,
  heightMm: 297,
  paddingTopMm: 25,
  paddingBottomMm: 25,
  paddingLeftMm: 25,
  paddingRightMm: 25,
  lineHeight: 1.5
};

const KNOWN_MARK_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textStyle",
  "highlight",
  "subscript",
  "superscript",
  "inlineTag"
]);

const OBJECT_NODE_TYPES = new Set([
  "image",
  "shapeBlock",
  "chartBlock",
  "diagramBlock"
]);

const KNOWN_SECTION_BREAK_TYPES = new Set([
  "continuous",
  "nextPage",
  "evenPage",
  "oddPage"
]);

const KNOWN_OBJECT_FLOW_MODES = new Set([
  "inline",
  "block",
  "floating",
  "behindText",
  "inFrontOfText"
]);

const KNOWN_OBJECT_ANCHOR_MODES = new Set([
  "inline",
  "paragraph",
  "page",
  "column",
  "character"
]);

const PARAGRAPH_PAGINATION_ATTR_KEYS = [
  "keepWithNext",
  "keep_with_next",
  "keep-with-next",
  "keepLinesTogether",
  "keep_lines_together",
  "keep-lines-together",
  "pageBreakBefore",
  "page_break_before",
  "page-break-before",
  "widows",
  "orphans"
];

const DOCX_PARAGRAPH_METADATA_ATTR_KEYS = [
  "docxParagraphSpacingBefore",
  "docxParagraphSpacingAfter",
  "docxParagraphSpacingLine",
  "docxParagraphSpacingLineRule",
  "docxParagraphStyleId",
  "docxParagraphStyleName",
  "docxParagraphTabs"
];

const SECTION_BREAK_ATTR_KEYS = [
  "sectionBreakType",
  "section_break_type",
  "breakType"
];

const TABLE_PAGINATION_ATTR_KEYS = [
  "headerRowRepeat",
  "header_row_repeat",
  "repeatHeaderRow",
  "allowRowSplit",
  "allow_row_split"
];

const OBJECT_FLOW_ATTR_KEYS = ["flowMode", "flow_mode"];
const OBJECT_ANCHOR_ATTR_KEYS = ["anchorMode", "anchor_mode"];
const BORDER_SIDE_ATTR_KEYS = [
  "borderTopColor",
  "borderTopStyle",
  "borderTopWidth",
  "borderRightColor",
  "borderRightStyle",
  "borderRightWidth",
  "borderBottomColor",
  "borderBottomStyle",
  "borderBottomWidth",
  "borderLeftColor",
  "borderLeftStyle",
  "borderLeftWidth"
];

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const getAttrValue = (
  attrs: Record<string, unknown>,
  keys: string[]
): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(attrs, key)) {
      return attrs[key];
    }
  }

  return undefined;
};

const toBooleanOrNull = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toNumberOrStringOrNull = (value: unknown): number | string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : value.trim();
  }

  return null;
};

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const toDOCXParagraphTabsOrNull = (
  value: unknown
): IRParagraphBlock["attrs"]["docxParagraphTabs"] | null =>
  Array.isArray(value) ? value : null;

const getDOCXParagraphMetadataAttrs = (
  attrs: Record<string, unknown>
): Partial<IRParagraphBlock["attrs"]> => ({
  docxParagraphSpacingBefore: toNumberOrNull(attrs.docxParagraphSpacingBefore),
  docxParagraphSpacingAfter: toNumberOrNull(attrs.docxParagraphSpacingAfter),
  docxParagraphSpacingLine: toNumberOrNull(attrs.docxParagraphSpacingLine),
  docxParagraphSpacingLineRule: toStringOrNull(attrs.docxParagraphSpacingLineRule),
  docxParagraphStyleId: toStringOrNull(attrs.docxParagraphStyleId),
  docxParagraphStyleName: toStringOrNull(attrs.docxParagraphStyleName),
  docxParagraphTabs: toDOCXParagraphTabsOrNull(attrs.docxParagraphTabs)
});

const pushUnmappedAttrWarnings = (
  entityKind: "node" | "mark",
  entityType: string,
  attrs: Record<string, unknown>,
  mappedKeys: string[],
  warnings: string[]
) => {
  const mappedKeySet = new Set(mappedKeys);

  Object.keys(attrs).forEach((key) => {
    if (!mappedKeySet.has(key)) {
      warnings.push(`미매핑 ${entityKind} attr: ${entityType}.${key}`);
    }
  });
};

const normalizeSectionBreakType = (
  value: unknown,
  warnings: string[]
): IRSectionBreakType | null => {
  const raw = toStringOrNull(value);

  if (!raw) {
    return null;
  }

  const normalized =
    raw === "next-page"
      ? "nextPage"
      : raw === "even-page"
        ? "evenPage"
        : raw === "odd-page"
          ? "oddPage"
          : raw;

  if (KNOWN_SECTION_BREAK_TYPES.has(normalized)) {
    return normalized as IRSectionBreakType;
  }

  warnings.push(`알 수 없는 section breakType: ${raw}`);
  return "unknown";
};

const normalizeObjectFlowMode = (
  value: unknown,
  warnings: string[]
): IRObjectFlowMode | null => {
  const raw = toStringOrNull(value);

  if (!raw) {
    return null;
  }

  const normalized =
    raw === "inFlow" || raw === "in-flow" || raw === "inflow"
      ? "block"
      : raw === "behind-text"
        ? "behindText"
        : raw === "in-front-of-text"
          ? "inFrontOfText"
          : raw;

  if (KNOWN_OBJECT_FLOW_MODES.has(normalized)) {
    return normalized as IRObjectFlowMode;
  }

  warnings.push(`알 수 없는 object flowMode: ${raw}`);
  return "unknown";
};

const normalizeObjectAnchorMode = (
  value: unknown,
  warnings: string[]
): IRObjectAnchorMode | null => {
  const raw = toStringOrNull(value);

  if (!raw) {
    return null;
  }

  const normalized =
    raw === "asCharacter" || raw === "as-character"
      ? "inline"
      : raw;

  if (KNOWN_OBJECT_ANCHOR_MODES.has(normalized)) {
    return normalized as IRObjectAnchorMode;
  }

  warnings.push(`알 수 없는 object anchorMode: ${raw}`);
  return "unknown";
};

const extractBlockPaginationHints = (
  attrs: Record<string, unknown>
): IRBlockPaginationHints => {
  const hints: IRBlockPaginationHints = {};
  const keepWithNext = toBooleanOrNull(
    getAttrValue(attrs, ["keepWithNext", "keep_with_next", "keep-with-next"])
  );
  const keepLinesTogether = toBooleanOrNull(
    getAttrValue(attrs, [
      "keepLinesTogether",
      "keep_lines_together",
      "keep-lines-together"
    ])
  );
  const pageBreakBefore = toBooleanOrNull(
    getAttrValue(attrs, [
      "pageBreakBefore",
      "page_break_before",
      "page-break-before"
    ])
  );
  const widows = toNumberOrNull(getAttrValue(attrs, ["widows"]));
  const orphans = toNumberOrNull(getAttrValue(attrs, ["orphans"]));

  if (keepWithNext !== null) {
    hints.keepWithNext = keepWithNext;
  }

  if (keepLinesTogether !== null) {
    hints.keepLinesTogether = keepLinesTogether;
  }

  if (pageBreakBefore !== null) {
    hints.pageBreakBefore = pageBreakBefore;
  }

  if (widows !== null) {
    hints.widows = widows;
  }

  if (orphans !== null) {
    hints.orphans = orphans;
  }

  return hints;
};

const extractTablePaginationHints = (
  attrs: Record<string, unknown>
): IRTablePaginationHints => {
  const hints: IRTablePaginationHints = {};
  const headerRowRepeat = toBooleanOrNull(
    getAttrValue(attrs, [
      "headerRowRepeat",
      "header_row_repeat",
      "repeatHeaderRow"
    ])
  );
  const allowRowSplit = toBooleanOrNull(
    getAttrValue(attrs, ["allowRowSplit", "allow_row_split"])
  );

  if (headerRowRepeat !== null) {
    hints.headerRowRepeat = headerRowRepeat;
  }

  if (allowRowSplit !== null) {
    hints.allowRowSplit = allowRowSplit;
  }

  return hints;
};

const extractObjectPlacementHints = (
  attrs: Record<string, unknown>,
  warnings: string[]
): IRObjectPlacementHints => {
  const explicitFlowMode = normalizeObjectFlowMode(
    getAttrValue(attrs, OBJECT_FLOW_ATTR_KEYS),
    warnings
  );
  const explicitAnchorMode = normalizeObjectAnchorMode(
    getAttrValue(attrs, OBJECT_ANCHOR_ATTR_KEYS),
    warnings
  );

  return {
    flowMode: explicitFlowMode ?? "block",
    anchorMode: explicitAnchorMode ?? "paragraph"
  };
};

const toMark = (mark: PMMark, warnings: string[]): IRMark => {
  const type = `${mark?.type || "unknown"}`;

  if (!KNOWN_MARK_TYPES.has(type)) {
    warnings.push(`알 수 없는 mark 타입: ${type}`);
    return { type: "unknown", attrs: asRecord(mark?.attrs) };
  }

  return {
    type: type as IRMark["type"],
    attrs: asRecord(mark?.attrs)
  };
};

const mapInline = (node: PMNode, warnings: string[]): IRInlineNode | null => {
  const nodeType = `${node?.type || ""}`;

  if (nodeType === "text") {
    const run: IRTextRun = {
      type: "textRun",
      text: node.text || "",
      marks: (node.marks || []).map((mark) => toMark(mark, warnings))
    };

    return run;
  }

  if (nodeType === "hardBreak") {
    const hardBreak: IRHardBreak = { type: "hardBreak" };
    return hardBreak;
  }

  if (nodeType === "noteReference") {
    const attrs = asRecord(node.attrs);
    return {
      type: "noteReference",
      noteId: String(attrs.noteId ?? ""),
      kind: attrs.kind === "endnote" ? "endnote" : "footnote"
    };
  }

  warnings.push(`지원하지 않는 inline node: ${nodeType || "(empty)"}`);
  return null;
};

const mapInlineContent = (node: PMNode, warnings: string[]): IRInlineNode[] =>
  (node.content || [])
    .map((child) => mapInline(child, warnings))
    .filter((child): child is IRInlineNode => Boolean(child));

const mapNoteBodyInlineContent = (
  node: PMNode,
  warnings: string[]
): IRNoteInlineNode[] => {
  const runs = mapInlineContent(node, warnings);

  if (runs.some((run) => run.type === "noteReference")) {
    throw new IRNoteCompatibilityError(
      "PM_NOTE_SEMANTICS_INVALID",
      "ProseMirror note body contains a nested note reference."
    );
  }

  return runs.filter(
    (run): run is IRNoteInlineNode => run.type !== "noteReference"
  );
};

const mapParagraph = (node: PMNode, warnings: string[]): IRParagraphBlock => {
  const attrs = asRecord(node.attrs);
  const paginationHints = extractBlockPaginationHints(attrs);

  pushUnmappedAttrWarnings(
    "node",
    "paragraph",
    attrs,
    [
      "textAlign",
      "lineHeight",
      "fontSize",
      "indent",
      "indentLevel",
      "wordBreak",
      ...DOCX_PARAGRAPH_METADATA_ATTR_KEYS,
      ...PARAGRAPH_PAGINATION_ATTR_KEYS
    ],
    warnings
  );

  return {
    type: "paragraph",
    attrs: {
      textAlign: (attrs.textAlign as string) ?? null,
      lineHeight: (attrs.lineHeight as string | number) ?? null,
      fontSize: toNumberOrNull(attrs.fontSize),
      indent: (attrs.indent as number | string) ?? null,
      indentLevel: toNumberOrNull(attrs.indentLevel),
      wordBreak: toStringOrNull(attrs.wordBreak),
      ...getDOCXParagraphMetadataAttrs(attrs)
    },
    ...paginationHints,
    runs: mapInlineContent(node, warnings)
  };
};

const mapHeading = (node: PMNode, warnings: string[]): IRHeadingBlock => {
  const attrs = asRecord(node.attrs);
  const paginationHints = extractBlockPaginationHints(attrs);

  pushUnmappedAttrWarnings(
    "node",
    "heading",
    attrs,
    [
      "level",
      "textAlign",
      "headingId",
      "lineHeight",
      "indent",
      "indentLevel",
      "wordBreak",
      ...DOCX_PARAGRAPH_METADATA_ATTR_KEYS,
      ...PARAGRAPH_PAGINATION_ATTR_KEYS
    ],
    warnings
  );

  return {
    type: "heading",
    attrs: {
      level: toNumberOrNull(attrs.level),
      textAlign: (attrs.textAlign as string) ?? null,
      headingId: (attrs.headingId as string) ?? null,
      lineHeight: (attrs.lineHeight as string | number) ?? null,
      indent: (attrs.indent as number | string) ?? null,
      indentLevel: toNumberOrNull(attrs.indentLevel),
      wordBreak: toStringOrNull(attrs.wordBreak),
      ...getDOCXParagraphMetadataAttrs(attrs)
    },
    ...paginationHints,
    runs: mapInlineContent(node, warnings)
  };
};

const mapListType = (nodeType: string): IRListBlock["listType"] => {
  if (nodeType === "bulletList") return "bullet";
  if (nodeType === "orderedList") return "ordered";
  if (nodeType === "taskList") return "task";
  return "unknown";
};

const mapUnsupported = (
  nodeType: string,
  node: PMNode,
  warnings: string[]
): IRUnsupportedBlock => {
  warnings.push(`지원하지 않는 block node: ${nodeType}`);
  return {
    type: "unsupported",
    nodeType,
    attrs: asRecord(node.attrs),
    raw: node
  };
};

const mapTableCell = (
  node: PMNode,
  role: "header" | "cell",
  warnings: string[]
): IRTableCell => {
  const attrs = asRecord(node.attrs);

  pushUnmappedAttrWarnings(
    "node",
    role === "header" ? "table_header" : "table_cell",
    attrs,
    [
      "colspan",
      "rowspan",
      "colwidth",
      "verticalAlign",
      "backgroundColor",
      "borderColor",
      "borderStyle",
      "borderWidth",
      ...BORDER_SIDE_ATTR_KEYS,
      "wordBreak"
    ],
    warnings
  );

  return {
    type: "tableCell",
    role,
    attrs: {
      colspan: toNumberOrNull(attrs.colspan) ?? 1,
      rowspan: toNumberOrNull(attrs.rowspan) ?? 1,
      colwidth: (attrs.colwidth as number[] | null) ?? null,
      verticalAlign: (attrs.verticalAlign as string) ?? null,
      backgroundColor: (attrs.backgroundColor as string) ?? null,
      borderColor: toStringOrNull(attrs.borderColor),
      borderStyle: toStringOrNull(attrs.borderStyle),
      borderWidth: toNumberOrStringOrNull(attrs.borderWidth),
      borderTopColor: toStringOrNull(attrs.borderTopColor),
      borderTopStyle: toStringOrNull(attrs.borderTopStyle),
      borderTopWidth: toNumberOrStringOrNull(attrs.borderTopWidth),
      borderRightColor: toStringOrNull(attrs.borderRightColor),
      borderRightStyle: toStringOrNull(attrs.borderRightStyle),
      borderRightWidth: toNumberOrStringOrNull(attrs.borderRightWidth),
      borderBottomColor: toStringOrNull(attrs.borderBottomColor),
      borderBottomStyle: toStringOrNull(attrs.borderBottomStyle),
      borderBottomWidth: toNumberOrStringOrNull(attrs.borderBottomWidth),
      borderLeftColor: toStringOrNull(attrs.borderLeftColor),
      borderLeftStyle: toStringOrNull(attrs.borderLeftStyle),
      borderLeftWidth: toNumberOrStringOrNull(attrs.borderLeftWidth),
      wordBreak: toStringOrNull(attrs.wordBreak)
    },
    blocks: (node.content || []).map((child) => mapBlock(child, warnings))
  };
};

const mapTableRow = (node: PMNode, warnings: string[]): IRTableRow => {
  const attrs = asRecord(node.attrs);

  pushUnmappedAttrWarnings("node", "table_row", attrs, ["height"], warnings);

  return {
    type: "tableRow",
    attrs: {
      height: toNumberOrNull(attrs.height)
    },
    cells: (node.content || []).map((cellNode) => {
      const cellType = `${cellNode?.type || ""}`;

      if (cellType === "table_header") {
        return mapTableCell(cellNode, "header", warnings);
      }

      if (cellType === "table_cell") {
        return mapTableCell(cellNode, "cell", warnings);
      }

      warnings.push(`table_row 내 알 수 없는 셀 타입: ${cellType || "(empty)"}`);
      return mapTableCell(cellNode, "cell", warnings);
    })
  };
};

const mapTable = (node: PMNode, warnings: string[]): IRTableBlock => {
  const attrs = asRecord(node.attrs);
  const tablePaginationHints = extractTablePaginationHints(attrs);

  pushUnmappedAttrWarnings(
    "node",
    "table",
    attrs,
    [
      "headerColor",
      "borderColor",
      "borderStyle",
      "borderWidth",
      ...BORDER_SIDE_ATTR_KEYS,
      "objectId",
      "cellPaddingTop",
      "cellPaddingBottom",
      "cellPaddingLeft",
      "cellPaddingRight",
      "indent",
      "indentLevel",
      ...TABLE_PAGINATION_ATTR_KEYS
    ],
    warnings
  );

  return {
    type: "table",
    attrs: {
      headerColor: (attrs.headerColor as string) ?? null,
      borderColor: toStringOrNull(attrs.borderColor),
      borderStyle: toStringOrNull(attrs.borderStyle),
      borderWidth: toNumberOrStringOrNull(attrs.borderWidth),
      borderTopColor: toStringOrNull(attrs.borderTopColor),
      borderTopStyle: toStringOrNull(attrs.borderTopStyle),
      borderTopWidth: toNumberOrStringOrNull(attrs.borderTopWidth),
      borderRightColor: toStringOrNull(attrs.borderRightColor),
      borderRightStyle: toStringOrNull(attrs.borderRightStyle),
      borderRightWidth: toNumberOrStringOrNull(attrs.borderRightWidth),
      borderBottomColor: toStringOrNull(attrs.borderBottomColor),
      borderBottomStyle: toStringOrNull(attrs.borderBottomStyle),
      borderBottomWidth: toNumberOrStringOrNull(attrs.borderBottomWidth),
      borderLeftColor: toStringOrNull(attrs.borderLeftColor),
      borderLeftStyle: toStringOrNull(attrs.borderLeftStyle),
      borderLeftWidth: toNumberOrStringOrNull(attrs.borderLeftWidth),
      objectId: (attrs.objectId as string) ?? null,
      cellPaddingTop: toNumberOrNull(attrs.cellPaddingTop),
      cellPaddingBottom: toNumberOrNull(attrs.cellPaddingBottom),
      cellPaddingLeft: toNumberOrNull(attrs.cellPaddingLeft),
      cellPaddingRight: toNumberOrNull(attrs.cellPaddingRight),
      indent: (attrs.indent as number | string) ?? null,
      indentLevel: toNumberOrNull(attrs.indentLevel)
    },
    ...tablePaginationHints,
    rows: (node.content || []).map((rowNode) => {
      const rowType = `${rowNode?.type || ""}`;

      if (rowType !== "table_row") {
        warnings.push(`table 내 예상 밖 row 타입: ${rowType || "(empty)"}`);
      }

      return mapTableRow(rowNode, warnings);
    })
  };
};

const mapObject = (node: PMNode, warnings: string[]): IRObjectBlock => {
  const nodeType = `${node?.type || "unknown"}`;
  const attrs = asRecord(node.attrs);

  return {
    type: "object",
    objectType: nodeType,
    attrs,
    ...extractObjectPlacementHints(attrs, warnings),
    children: (node.content || []).map((child) => mapBlock(child, warnings))
  };
};

const mapListItem = (node: PMNode, warnings: string[]): IRListItem => ({
  type: "listItem",
  attrs: asRecord(node.attrs),
  blocks: (node.content || []).map((child) => mapBlock(child, warnings))
});

const mapList = (node: PMNode, warnings: string[]): IRListBlock => ({
  type: "list",
  listType: mapListType(`${node?.type || ""}`),
  attrs: asRecord(node.attrs),
  items: (node.content || []).map((child) => {
    const childType = `${child?.type || ""}`;

    if (childType !== "listItem" && childType !== "taskItem") {
      warnings.push(`리스트 하위에서 예상 밖 노드 타입: ${childType || "(empty)"}`);
    }

    return mapListItem(child, warnings);
  })
});

const mapBlock = (node: PMNode, warnings: string[]): IRBlock => {
  const nodeType = `${node?.type || ""}`;

  switch (nodeType) {
    case "paragraph":
      return mapParagraph(node, warnings);
    case "heading":
      return mapHeading(node, warnings);
    case "bulletList":
    case "orderedList":
    case "taskList":
      return mapList(node, warnings);
    case "table":
      return mapTable(node, warnings);
    default:
      if (OBJECT_NODE_TYPES.has(nodeType)) {
        return mapObject(node, warnings);
      }

      return mapUnsupported(nodeType || "(empty)", node, warnings);
  }
};

export const fromProseMirrorDocToIR = (
  pmDoc: PMNode,
  options: FromProseMirrorOptions = {}
): IRDocument => {
  if (!pmDoc || pmDoc.type !== "doc") {
    throw new Error("fromProseMirrorDocToIR: 입력 pmDoc은 type='doc' 이어야 합니다.");
  }

  const noteSemantics = validateNoteSemantics(pmDoc);
  if (!noteSemantics.valid) {
    throw new IRNoteCompatibilityError(
      "PM_NOTE_SEMANTICS_INVALID",
      `ProseMirror note semantics are invalid: ${noteSemantics.errors.map((error) => error.code).join(", ")}.`
    );
  }

  const warnings: string[] = [];
  const docAttrs = asRecord(pmDoc.attrs);
  const sectionBreakType = normalizeSectionBreakType(
    options.sectionBreakType ??
      getAttrValue(docAttrs, SECTION_BREAK_ATTR_KEYS),
    warnings
  );

  pushUnmappedAttrWarnings(
    "node",
    "doc",
    docAttrs,
    SECTION_BREAK_ATTR_KEYS,
    warnings
  );

  const topLevelContent = pmDoc.content || [];
  const hasTopLevelNoteBodies = topLevelContent.some(
    (node) => node?.type === "noteBody"
  );

  const section: IRSection = {
    type: "section",
    id: options.sectionId || "section-1",
    breakType: sectionBreakType,
    pageSettings: {
      ...DEFAULT_PAGE_SETTINGS,
      ...(options.pageSettings || {})
    },
    blocks: topLevelContent.flatMap((blockNode, sourceBlockIndex) => {
      if (blockNode?.type === "noteBody") {
        return [];
      }

      const block = mapBlock(blockNode, warnings);
      return [
        hasTopLevelNoteBodies
          ? { ...block, sourceBlockIndex }
          : block
      ];
    })
  };

  const noteBodies: IRNoteBody[] = topLevelContent
    .filter((node) => node?.type === "noteBody")
    .map((node) => ({
      noteId: String(node.attrs?.noteId ?? ""),
      kind: node.attrs?.kind === "endnote" ? "endnote" : "footnote",
      referenceOrder: noteSemantics.numbering.findIndex(
        (entry) => entry.noteId === node.attrs?.noteId
      ),
      paragraphs: (node.content || []).map((paragraph) => {
        const attrs = asRecord(paragraph.attrs);

        return {
          type: "paragraph" as const,
          ...(Object.keys(attrs).length ? { attrs } : {}),
          runs: mapNoteBodyInlineContent(paragraph, warnings)
        };
      })
    }));

  return {
    type: "document",
    version: CURRENT_IR_VERSION,
    metadata: {
      extractedAt: options.extractedAt || new Date().toISOString(),
      extractorVersion: options.extractorVersion || CURRENT_EXTRACTOR_VERSION,
      source: {
        editor: "tiptap-prosemirror",
        mode: "readonly-snapshot"
      },
      warnings
    },
    sections: [section],
    ...(noteBodies.length ? { notes: noteBodies } : {})
  };
};

export const fromEditorStateToIR = (
  editorState: { doc?: { toJSON?: () => PMNode } },
  options: FromProseMirrorOptions = {}
): IRDocument => {
  const pmDoc = editorState?.doc?.toJSON?.();

  if (!pmDoc) {
    throw new Error("fromEditorStateToIR: editorState.doc.toJSON() 결과를 얻지 못했습니다.");
  }

  return fromProseMirrorDocToIR(pmDoc, options);
};
