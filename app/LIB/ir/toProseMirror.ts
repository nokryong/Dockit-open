import type {
  IRBlock,
  IRDocument,
  IRHeadingBlock,
  IRInlineNode,
  IRListBlock,
  IRListItem,
  IRMark,
  IRNoteBody,
  IRObjectBlock,
  IRParagraphBlock,
  IRTableBlock,
  IRTableCell,
  IRUnsupportedBlock
} from "./types";
import { assertValidIRNoteSemantics } from "./noteIRUtils";

export type IRProjectionWarningCode =
  | "ir-projection-section-flattened"
  | "ir-projection-unsupported-block"
  | "ir-projection-unsupported-list"
  | "ir-projection-unsupported-mark"
  | "ir-projection-unsupported-object"
  | "ir-projection-invalid-structure";

export type IRProjectionWarningSeverity = "warning" | "error";

export interface IRProjectionWarning {
  code: IRProjectionWarningCode;
  severity: IRProjectionWarningSeverity;
  message: string;
  path?: string;
}

export interface ProseMirrorJSONMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface ProseMirrorJSONNode {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: ProseMirrorJSONMark[];
  content?: ProseMirrorJSONNode[];
}

export interface IRToProseMirrorProjectionResult {
  doc: ProseMirrorJSONNode;
  warnings: readonly Readonly<IRProjectionWarning>[];
}

const SUPPORTED_MARK_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "link",
  "textStyle",
  "highlight",
  "subscript",
  "superscript",
  "inlineTag"
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const pushWarning = (
  warnings: IRProjectionWarning[],
  warning: IRProjectionWarning
) => {
  warnings.push(Object.freeze(warning));
};

const compactAttrs = (attrs: Record<string, unknown>) => {
  const compact: Record<string, unknown> = {};

  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      compact[key] = value;
    }
  });

  return Object.keys(compact).length ? compact : undefined;
};

const mapDOCXParagraphMetadataAttrs = (
  attrs: Readonly<IRParagraphBlock["attrs"] | IRHeadingBlock["attrs"]>
) => ({
  docxParagraphSpacingBefore: attrs.docxParagraphSpacingBefore,
  docxParagraphSpacingAfter: attrs.docxParagraphSpacingAfter,
  docxParagraphSpacingLine: attrs.docxParagraphSpacingLine,
  docxParagraphSpacingLineRule: attrs.docxParagraphSpacingLineRule,
  docxParagraphStyleId: attrs.docxParagraphStyleId,
  docxParagraphStyleName: attrs.docxParagraphStyleName,
  docxParagraphTabs: attrs.docxParagraphTabs
});

const textNode = (
  text: string,
  marks: readonly ProseMirrorJSONMark[] = []
): ProseMirrorJSONNode => ({
  type: "text",
  text,
  ...(marks.length ? { marks: [...marks] } : {})
});

const paragraphNode = (
  content: readonly ProseMirrorJSONNode[] = [],
  attrs?: Record<string, unknown>
): ProseMirrorJSONNode => ({
  type: "paragraph",
  ...(attrs ? { attrs } : {}),
  ...(content.length ? { content: [...content] } : {})
});

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const inlineTextFromRaw = (raw: unknown): string => {
  if (typeof raw === "string") {
    return raw;
  }

  if (!isRecord(raw)) {
    return "";
  }

  if (typeof raw.textContent === "string") {
    return raw.textContent;
  }

  if (typeof raw.text === "string") {
    return raw.text;
  }

  const content = Array.isArray(raw.content) ? raw.content : [];

  return content.map(inlineTextFromRaw).join("");
};

const mapMark = (
  mark: Readonly<IRMark>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONMark | null => {
  if (mark.type === "code") {
    pushWarning(warnings, {
      code: "ir-projection-unsupported-mark",
      severity: "warning",
      message:
        "Inline code mark is not available in the editor schema and was projected as monospace textStyle.",
      path
    });

    return {
      type: "textStyle",
      attrs: { fontFamily: "monospace" }
    };
  }

  if (!SUPPORTED_MARK_TYPES.has(mark.type)) {
    pushWarning(warnings, {
      code: "ir-projection-unsupported-mark",
      severity: "warning",
      message: `Unsupported IR mark was skipped: ${mark.type}.`,
      path
    });
    return null;
  }

  const attrs = compactAttrs(isRecord(mark.attrs) ? mark.attrs : {});

  return {
    type: mark.type,
    ...(attrs ? { attrs } : {})
  };
};

const mergeMarks = (
  marks: readonly ProseMirrorJSONMark[]
): ProseMirrorJSONMark[] => {
  const merged: ProseMirrorJSONMark[] = [];

  marks.forEach((mark) => {
    const existingIndex = merged.findIndex((item) => item.type === mark.type);

    if (existingIndex === -1) {
      merged.push(mark);
      return;
    }

    const existing = merged[existingIndex];
    const attrs = compactAttrs({
      ...(existing.attrs ?? {}),
      ...(mark.attrs ?? {})
    });

    merged[existingIndex] = {
      type: existing.type,
      ...(attrs ? { attrs } : {})
    };
  });

  return merged;
};

const mapInlineNode = (
  node: Readonly<IRInlineNode>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode | null => {
  if (node.type === "hardBreak") {
    return { type: "hardBreak" };
  }

  if (node.type === "noteReference") {
    return { type: "noteReference", attrs: { noteId: node.noteId, kind: node.kind } };
  }

  if (!node.text) {
    return null;
  }

  const marks = node.marks
    .map((mark, markIndex) =>
      mapMark(mark, warnings, `${path}.marks[${markIndex}]`)
    )
    .filter((mark): mark is ProseMirrorJSONMark => Boolean(mark));

  return textNode(node.text, mergeMarks(marks));
};

const mapInlineContent = (
  block: Readonly<IRParagraphBlock | IRHeadingBlock>,
  warnings: IRProjectionWarning[],
  path: string
) =>
  block.runs
    .map((run, runIndex) =>
      mapInlineNode(run, warnings, `${path}.runs[${runIndex}]`)
    )
    .filter((node): node is ProseMirrorJSONNode => Boolean(node));

const mapParagraphAttrs = (attrs: Readonly<IRParagraphBlock["attrs"]>) =>
  compactAttrs({
    textAlign: attrs.textAlign,
    lineHeight: attrs.lineHeight,
    fontSize: attrs.fontSize,
    indent: attrs.indent,
    indentLevel: attrs.indentLevel,
    wordBreak: attrs.wordBreak,
    ...mapDOCXParagraphMetadataAttrs(attrs)
  });

const mapHeadingLevel = (
  level: number | null | undefined,
  warnings: IRProjectionWarning[],
  path: string
) => {
  if (typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 6) {
    return level;
  }

  pushWarning(warnings, {
    code: "ir-projection-invalid-structure",
    severity: "warning",
    message: `Heading level was normalized to 1: ${String(level)}.`,
    path
  });
  return 1;
};

const mapParagraph = (
  block: Readonly<IRParagraphBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode =>
  paragraphNode(mapInlineContent(block, warnings, path), mapParagraphAttrs(block.attrs));

const mapHeading = (
  block: Readonly<IRHeadingBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => ({
  type: "heading",
  attrs: compactAttrs({
    level: mapHeadingLevel(block.attrs.level, warnings, path),
    textAlign: block.attrs.textAlign,
    headingId: block.attrs.headingId,
    lineHeight: block.attrs.lineHeight,
    indent: block.attrs.indent,
    indentLevel: block.attrs.indentLevel,
    wordBreak: block.attrs.wordBreak,
    ...mapDOCXParagraphMetadataAttrs(block.attrs)
  }),
  content: mapInlineContent(block, warnings, path)
});

const mapListItem = (
  item: Readonly<IRListItem>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => {
  const content = item.blocks.map((block, blockIndex) =>
    mapBlock(block, warnings, `${path}.blocks[${blockIndex}]`)
  );

  return {
    type: "listItem",
    ...(content.length ? { content } : { content: [paragraphNode()] })
  };
};

const mapList = (
  block: Readonly<IRListBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => {
  const listType =
    block.listType === "ordered"
      ? "orderedList"
      : block.listType === "bullet"
        ? "bulletList"
        : null;

  if (!listType) {
    pushWarning(warnings, {
      code: "ir-projection-unsupported-list",
      severity: "warning",
      message: `Unsupported IR list type was projected as bulletList: ${block.listType}.`,
      path
    });
  }

  const start =
    block.listType === "ordered"
      ? toNumberOrNull(block.attrs.start) ??
        toNumberOrNull(block.attrs.startNumber) ??
        1
      : null;

  return {
    type: listType ?? "bulletList",
    attrs: compactAttrs({
      start
    }),
    content: block.items.map((item, itemIndex) =>
      mapListItem(item, warnings, `${path}.items[${itemIndex}]`)
    )
  };
};

const mapTableAttrs = (attrs: Readonly<IRTableBlock["attrs"]>) =>
  compactAttrs({
    objectId: attrs.objectId,
    headerColor: attrs.headerColor,
    borderColor: attrs.borderColor,
    borderStyle: attrs.borderStyle,
    borderWidth: attrs.borderWidth,
    borderTopColor: attrs.borderTopColor,
    borderTopStyle: attrs.borderTopStyle,
    borderTopWidth: attrs.borderTopWidth,
    borderRightColor: attrs.borderRightColor,
    borderRightStyle: attrs.borderRightStyle,
    borderRightWidth: attrs.borderRightWidth,
    borderBottomColor: attrs.borderBottomColor,
    borderBottomStyle: attrs.borderBottomStyle,
    borderBottomWidth: attrs.borderBottomWidth,
    borderLeftColor: attrs.borderLeftColor,
    borderLeftStyle: attrs.borderLeftStyle,
    borderLeftWidth: attrs.borderLeftWidth,
    cellPaddingTop: attrs.cellPaddingTop,
    cellPaddingBottom: attrs.cellPaddingBottom,
    cellPaddingLeft: attrs.cellPaddingLeft,
    cellPaddingRight: attrs.cellPaddingRight,
    indent: attrs.indent,
    indentLevel: attrs.indentLevel
  });

const mapTableCellAttrs = (attrs: Readonly<IRTableCell["attrs"]>) =>
  compactAttrs({
    colspan: attrs.colspan ?? 1,
    rowspan: attrs.rowspan ?? 1,
    colwidth: attrs.colwidth,
    verticalAlign: attrs.verticalAlign,
    backgroundColor: attrs.backgroundColor,
    borderColor: attrs.borderColor,
    borderStyle: attrs.borderStyle,
    borderWidth: attrs.borderWidth,
    borderTopColor: attrs.borderTopColor,
    borderTopStyle: attrs.borderTopStyle,
    borderTopWidth: attrs.borderTopWidth,
    borderRightColor: attrs.borderRightColor,
    borderRightStyle: attrs.borderRightStyle,
    borderRightWidth: attrs.borderRightWidth,
    borderBottomColor: attrs.borderBottomColor,
    borderBottomStyle: attrs.borderBottomStyle,
    borderBottomWidth: attrs.borderBottomWidth,
    borderLeftColor: attrs.borderLeftColor,
    borderLeftStyle: attrs.borderLeftStyle,
    borderLeftWidth: attrs.borderLeftWidth,
    wordBreak: attrs.wordBreak
  });

const mapTableCell = (
  cell: Readonly<IRTableCell>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => {
  const content = cell.blocks.map((block, blockIndex) =>
    mapBlock(block, warnings, `${path}.blocks[${blockIndex}]`)
  );

  return {
    type: cell.role === "header" ? "tableHeader" : "tableCell",
    attrs: mapTableCellAttrs(cell.attrs),
    content: content.length ? content : [paragraphNode()]
  };
};

const mapTable = (
  block: Readonly<IRTableBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => ({
  type: "table",
  attrs: mapTableAttrs(block.attrs),
  content: block.rows.map((row, rowIndex) => ({
    type: "tableRow",
    attrs: compactAttrs({ height: row.attrs.height }),
    content: row.cells.map((cell, cellIndex) =>
      mapTableCell(cell, warnings, `${path}.rows[${rowIndex}].cells[${cellIndex}]`)
    )
  }))
});

const mapImageObject = (
  block: Readonly<IRObjectBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => {
  const src = toStringOrNull(block.attrs.src);

  if (!src) {
    pushWarning(warnings, {
      code: "ir-projection-unsupported-object",
      severity: "warning",
      message: "Image object did not include a usable src and was projected as text fallback.",
      path
    });
    return paragraphNode([textNode("[Unsupported object: image]")]);
  }

  return {
    type: "image",
    attrs: compactAttrs({
      src,
      objectId: toStringOrNull(block.attrs.objectId),
      fileName: toStringOrNull(block.attrs.fileName),
      mimeType: toStringOrNull(block.attrs.mimeType),
      alt:
        toStringOrNull(block.attrs.alt) ??
        toStringOrNull(block.attrs.altText) ??
        toStringOrNull(block.attrs.shapeComment),
      title: toStringOrNull(block.attrs.title),
      width: block.attrs.width ?? block.attrs.widthPx ?? block.attrs.widthHwpUnit,
      height: block.attrs.height ?? block.attrs.heightPx ?? block.attrs.heightHwpUnit,
      textAlign: block.attrs.textAlign
    })
  };
};

const mapObject = (
  block: Readonly<IRObjectBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => {
  if (block.objectType === "image") {
    return mapImageObject(block, warnings, path);
  }

  pushWarning(warnings, {
    code: "ir-projection-unsupported-object",
    severity: "warning",
    message: `Unsupported object type was projected as paragraph fallback: ${block.objectType}.`,
    path
  });
  return paragraphNode([textNode(`[Unsupported object: ${block.objectType}]`)]);
};

const mapUnsupported = (
  block: Readonly<IRUnsupportedBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => {
  pushWarning(warnings, {
    code: "ir-projection-unsupported-block",
    severity: "warning",
    message: `Unsupported IR block was projected as paragraph fallback: ${block.nodeType}.`,
    path
  });

  const rawText = inlineTextFromRaw(block.raw);
  const fallbackText = rawText || `[Unsupported block: ${block.nodeType}]`;

  return paragraphNode([textNode(fallbackText)]);
};

const mapBlock = (
  block: Readonly<IRBlock>,
  warnings: IRProjectionWarning[],
  path: string
): ProseMirrorJSONNode => {
  switch (block.type) {
    case "paragraph":
      return mapParagraph(block, warnings, path);
    case "heading":
      return mapHeading(block, warnings, path);
    case "list":
      return mapList(block, warnings, path);
    case "table":
      return mapTable(block, warnings, path);
    case "object":
      return mapObject(block, warnings, path);
    case "unsupported":
      return mapUnsupported(block, warnings, path);
    default:
      pushWarning(warnings, {
        code: "ir-projection-unsupported-block",
        severity: "warning",
        message: "Unknown IR block was projected as empty paragraph.",
        path
      });
      return paragraphNode();
  }
};

export const irToProseMirror = (
  irDocument: Readonly<IRDocument>
): Readonly<IRToProseMirrorProjectionResult> => {
  assertValidIRNoteSemantics(irDocument);
  const warnings: IRProjectionWarning[] = [];

  if (irDocument.sections.length > 1) {
    pushWarning(warnings, {
      code: "ir-projection-section-flattened",
      severity: "warning",
      message: `IRDocument sections were flattened into one ProseMirror doc: ${irDocument.sections.length}.`
    });
  }

  const content = irDocument.sections.flatMap((section, sectionIndex) =>
    section.blocks.map((block, blockIndex) =>
      mapBlock(block, warnings, `sections[${sectionIndex}].blocks[${blockIndex}]`)
    )
  );
  const noteBodies = [...(irDocument.notes ?? [])]
    .sort((left, right) => left.referenceOrder - right.referenceOrder)
    .map((note, noteIndex) => ({
      type: "noteBody",
      attrs: { noteId: note.noteId, kind: note.kind },
      content: note.paragraphs.map((paragraph, paragraphIndex) =>
        paragraphNode(
          paragraph.runs
            .map((run, runIndex) =>
              mapInlineNode(
                run,
                warnings,
                `notes[${noteIndex}].paragraphs[${paragraphIndex}].runs[${runIndex}]`
              )
            )
            .filter((node): node is ProseMirrorJSONNode => Boolean(node)),
          compactAttrs(isRecord(paragraph.attrs) ? paragraph.attrs : {})
        )
      )
    }));

  return Object.freeze({
    doc: Object.freeze({
      type: "doc",
      content: [...(content.length ? content : [paragraphNode()]), ...noteBodies]
    }),
    warnings: Object.freeze([...warnings])
  });
};
