import type {
  IRBlock,
  IRDocument,
  IRHeadingBlock,
  IRListBlock,
  IRMark,
  IRObjectBlock,
  IRParagraphBlock,
  IRTableBlock,
  IRTableCell,
  IRTextRun
} from "./types";
import {
  normalizeListNumbering,
  type IRListNumberingModelV1
} from "./listNumberingModel";
import {
  normalizeObjectModel,
  type IRObjectModelV1
} from "./objectModel";
import {
  normalizeTableModel,
  type IRTableBorderSidesV1,
  type IRTableModelV1
} from "./tableModel";

export type IRStyleLengthUnit = "pt" | "px" | "mm" | "percent" | "ratio" | "unknown";

export interface IRStyleLength {
  value: number;
  unit: IRStyleLengthUnit;
  raw: unknown;
}

export type IRStyleTextAlign = "left" | "center" | "right" | "justify" | "unknown";
export type IRStyleVerticalAlign = "top" | "middle" | "bottom" | "unknown";
export type IRStyleBorderStyle =
  | "solid"
  | "dashed"
  | "dotted"
  | "double"
  | "none"
  | "unknown";

export interface IRTextBlockStyleV1 {
  version: "ir-style-v1";
  blockType: "paragraph" | "heading";
  textAlign: IRStyleTextAlign | null;
  lineHeight: Readonly<IRStyleLength> | null;
  fontSize: Readonly<IRStyleLength> | null;
  indent: Readonly<IRStyleLength> | null;
  indentLevel: number | null;
  wordBreak: string | null;
  runs: readonly Readonly<IRTextRunStyleV1>[];
  headingLevel?: number | null;
  headingStyleId?: string | null;
}

export interface IRTextRunStyleV1 {
  version: "ir-style-v1";
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link: Readonly<{
    href: string | null;
    target: string | null;
    title: string | null;
  }> | null;
  fontFamily: string | null;
  fontSize: Readonly<IRStyleLength> | null;
  color: string | null;
  backgroundColor: string | null;
  highlightColor: string | null;
  inlineTagColor: string | null;
  verticalAlign: "subscript" | "superscript" | null;
  unsupported: readonly string[];
}

export interface IRListMarkerStyleV1 {
  version: "ir-style-v1";
  listType: IRListBlock["listType"];
  markerKind: "bullet" | "ordered" | "task" | "unknown";
  markerFormat: "bullet" | "decimal" | "checkbox" | "unknown";
  startNumber: number | null;
  numbering: Readonly<IRListNumberingModelV1>;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

export interface IRTableBorderStyleV1 {
  color: string | null;
  style: IRStyleBorderStyle | null;
  width: Readonly<IRStyleLength> | null;
}

export interface IRBoxEdgesStyleV1 {
  top: Readonly<IRStyleLength> | null;
  right: Readonly<IRStyleLength> | null;
  bottom: Readonly<IRStyleLength> | null;
  left: Readonly<IRStyleLength> | null;
}

export interface IRTableCellStyleV1 {
  version: "ir-style-v1";
  role: IRTableCell["role"];
  padding: Readonly<IRBoxEdgesStyleV1>;
  border: Readonly<{
    all: Readonly<IRTableBorderStyleV1> | null;
    sides: Readonly<IRTableBorderSidesV1>;
  }>;
  verticalAlign: IRStyleVerticalAlign | null;
  backgroundColor: string | null;
  wordBreak: string | null;
  unsupported: readonly string[];
}

export interface IRTableStyleV1 {
  version: "ir-style-v1";
  padding: Readonly<IRBoxEdgesStyleV1>;
  border: Readonly<{
    all: Readonly<IRTableBorderStyleV1> | null;
    sides: Readonly<IRTableBorderSidesV1>;
  }>;
  indent: Readonly<IRStyleLength> | null;
  indentLevel: number | null;
  table: Readonly<IRTableModelV1>;
  cellStyles: readonly (readonly Readonly<IRTableCellStyleV1>[])[];
  unsupported: readonly string[];
}

export interface IRObjectStyleV1 {
  version: "ir-style-v1";
  objectType: string;
  flowMode: IRObjectBlock["flowMode"] | null;
  anchorMode: IRObjectBlock["anchorMode"] | null;
  size: Readonly<{
    width: Readonly<IRStyleLength> | null;
    height: Readonly<IRStyleLength> | null;
  }>;
  position: Readonly<{
    x: Readonly<IRStyleLength> | null;
    y: Readonly<IRStyleLength> | null;
  }>;
  object: Readonly<IRObjectModelV1>;
  unsupported: readonly string[];
}

export type IRBlockStyleV1 =
  | Readonly<IRTextBlockStyleV1>
  | Readonly<IRListMarkerStyleV1>
  | Readonly<IRTableStyleV1>
  | Readonly<IRObjectStyleV1>
  | null;

const STYLE_VERSION = "ir-style-v1" as const;

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

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

const parseLength = (
  value: unknown,
  defaultUnit: IRStyleLengthUnit
): Readonly<IRStyleLength> | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.freeze({ value, unit: defaultUnit, raw: value });
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(pt|px|mm|%)?$/i);

  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const unit = match[2]?.toLowerCase();

  return Object.freeze({
    value: numericValue,
    unit: unit === "%" ? "percent" : (unit as IRStyleLengthUnit) || defaultUnit,
    raw: value
  });
};

const normalizeLineHeight = (value: unknown) => {
  const parsed = parseLength(value, "ratio");

  if (!parsed) {
    return null;
  }

  if (parsed.unit === "percent") {
    return Object.freeze({
      value: parsed.value / 100,
      unit: "ratio" as const,
      raw: value
    });
  }

  return parsed;
};

const normalizeTextAlign = (value: unknown): IRStyleTextAlign | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return value === "left" ||
    value === "center" ||
    value === "right" ||
    value === "justify"
    ? value
    : "unknown";
};

const normalizeVerticalAlign = (value: unknown): IRStyleVerticalAlign | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return value === "top" || value === "middle" || value === "bottom"
    ? value
    : "unknown";
};

const normalizeBorderStyle = (value: unknown): IRStyleBorderStyle | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return value === "solid" ||
    value === "dashed" ||
    value === "dotted" ||
    value === "double" ||
    value === "none"
    ? value
    : "unknown";
};

const normalizeColor = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getFirstStringAttr = (
  attrs: Record<string, unknown> = {},
  keys: readonly string[]
) => {
  for (const key of keys) {
    const value = attrs[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const normalizeBorder = ({
  color,
  style,
  width,
  defaultWidthUnit = "pt"
}: {
  color?: unknown;
  style?: unknown;
  width?: unknown;
  defaultWidthUnit?: IRStyleLengthUnit;
}): Readonly<IRTableBorderStyleV1> | null => {
  const normalizedColor = normalizeColor(color);
  const normalizedStyle = normalizeBorderStyle(style);
  const normalizedWidth = parseLength(width, defaultWidthUnit);

  if (!normalizedColor && !normalizedStyle && !normalizedWidth) {
    return null;
  }

  return Object.freeze({
    color: normalizedColor,
    style: normalizedStyle,
    width: normalizedWidth
  });
};

const normalizeEdges = (
  values: {
    top?: unknown;
    right?: unknown;
    bottom?: unknown;
    left?: unknown;
  },
  defaultUnit: IRStyleLengthUnit
): Readonly<IRBoxEdgesStyleV1> =>
  Object.freeze({
    top: parseLength(values.top, defaultUnit),
    right: parseLength(values.right, defaultUnit),
    bottom: parseLength(values.bottom, defaultUnit),
    left: parseLength(values.left, defaultUnit)
  });

const getStartNumber = (attrs: Record<string, unknown>) =>
  toNumberOrNull(attrs.start) ?? toNumberOrNull(attrs.startNumber) ?? null;

const getListUnsupported = (block: IRListBlock) => {
  const unsupported: string[] = [];

  if (block.listType === "ordered" && getStartNumber(block.attrs) === null) {
    unsupported.push("ordered numbering start defaults to adapter policy");
  }

  if (Object.keys(block.attrs || {}).some((attr) => attr !== "start" && attr !== "startNumber")) {
    unsupported.push("list attrs are not fully normalized");
  }

  if (block.items.some((item) => Object.keys(item.attrs || {}).length > 0)) {
    unsupported.push("list item attrs remain raw");
  }

  return freezeArray(unsupported);
};

export const normalizeTextBlockStyle = (
  block: IRParagraphBlock | IRHeadingBlock
): Readonly<IRTextBlockStyleV1> => {
  const headingLevel =
    block.type === "heading" ? toNumberOrNull(block.attrs.level) : null;

  return Object.freeze({
    version: STYLE_VERSION,
    blockType: block.type,
    textAlign: normalizeTextAlign(block.attrs.textAlign),
    lineHeight: normalizeLineHeight(block.attrs.lineHeight),
    fontSize:
      block.type === "paragraph"
        ? parseLength(block.attrs.fontSize, "pt")
        : null,
    indent: parseLength(block.attrs.indent, "pt"),
    indentLevel: toNumberOrNull(block.attrs.indentLevel),
    wordBreak: block.attrs.wordBreak || null,
    runs: normalizeTextRunStyles(block.runs.filter((run) => run.type === "textRun")),
    ...(block.type === "heading"
      ? {
          headingLevel,
          headingStyleId: headingLevel ? `heading-${headingLevel}` : null
        }
      : {})
  });
};

const applyTextStyleMark = (
  style: {
    fontFamily: string | null;
    fontSize: Readonly<IRStyleLength> | null;
    color: string | null;
    backgroundColor: string | null;
  },
  attrs: Record<string, unknown>
) => {
  const fontFamily = getFirstStringAttr(attrs, ["fontFamily", "font-family"]);
  const fontSize =
    parseLength(attrs.fontSize, "pt") ||
    parseLength(attrs["font-size"], "pt");
  const color = getFirstStringAttr(attrs, ["color", "textColor"]);
  const backgroundColor = getFirstStringAttr(attrs, [
    "backgroundColor",
    "background-color",
    "bgColor"
  ]);

  return {
    fontFamily: fontFamily ?? style.fontFamily,
    fontSize: fontSize ?? style.fontSize,
    color: color ?? style.color,
    backgroundColor: backgroundColor ?? style.backgroundColor
  };
};

export const normalizeTextRunStyle = (
  run: IRTextRun
): Readonly<IRTextRunStyleV1> => {
  const unsupported: string[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let strike = false;
  let code = false;
  let link: IRTextRunStyleV1["link"] = null;
  let fontFamily: string | null = null;
  let fontSize: Readonly<IRStyleLength> | null = null;
  let color: string | null = null;
  let backgroundColor: string | null = null;
  let highlightColor: string | null = null;
  let inlineTagColor: string | null = null;
  let verticalAlign: IRTextRunStyleV1["verticalAlign"] = null;

  run.marks.forEach((mark: IRMark) => {
    const attrs = mark.attrs || {};

    switch (mark.type) {
      case "bold":
        bold = true;
        break;
      case "italic":
        italic = true;
        break;
      case "underline":
        underline = true;
        break;
      case "strike":
        strike = true;
        break;
      case "code":
        code = true;
        break;
      case "link":
        link = Object.freeze({
          href: getFirstStringAttr(attrs, ["href"]),
          target: getFirstStringAttr(attrs, ["target"]),
          title: getFirstStringAttr(attrs, ["title"])
        });
        break;
      case "textStyle": {
        const nextStyle = applyTextStyleMark(
          {
            fontFamily,
            fontSize,
            color,
            backgroundColor
          },
          attrs
        );

        fontFamily = nextStyle.fontFamily;
        fontSize = nextStyle.fontSize;
        color = nextStyle.color;
        backgroundColor = nextStyle.backgroundColor;
        break;
      }
      case "highlight":
        highlightColor =
          getFirstStringAttr(attrs, ["color", "backgroundColor"]) ||
          highlightColor;
        break;
      case "inlineTag":
        inlineTagColor =
          getFirstStringAttr(attrs, ["color", "backgroundColor"]) ||
          inlineTagColor;
        break;
      case "subscript":
        verticalAlign = "subscript";
        break;
      case "superscript":
        verticalAlign = "superscript";
        break;
      case "unknown":
      default:
        unsupported.push(`unsupported mark: ${mark.type}`);
        break;
    }
  });

  return Object.freeze({
    version: STYLE_VERSION,
    text: run.text,
    bold,
    italic,
    underline,
    strike,
    code,
    link,
    fontFamily,
    fontSize,
    color,
    backgroundColor,
    highlightColor,
    inlineTagColor,
    verticalAlign,
    unsupported: freezeArray(unsupported)
  });
};

export const normalizeTextRunStyles = (
  runs: readonly IRTextRun[]
): readonly Readonly<IRTextRunStyleV1>[] =>
  freezeArray(runs.map((run) => normalizeTextRunStyle(run)));

export const normalizeListMarkerStyle = (
  block: IRListBlock
): Readonly<IRListMarkerStyleV1> => {
  const markerKind =
    block.listType === "bullet" ||
    block.listType === "ordered" ||
    block.listType === "task"
      ? block.listType
      : "unknown";
  const markerFormat =
    block.listType === "ordered"
      ? "decimal"
      : block.listType === "bullet"
        ? "bullet"
        : block.listType === "task"
          ? "checkbox"
          : "unknown";

  return Object.freeze({
    version: STYLE_VERSION,
    listType: block.listType,
    markerKind,
    markerFormat,
    startNumber: block.listType === "ordered" ? getStartNumber(block.attrs) : null,
    numbering: normalizeListNumbering(block),
    rawAttrs: Object.freeze({ ...(block.attrs || {}) }),
    unsupported: getListUnsupported(block)
  });
};

export const normalizeTableCellStyle = (
  cell: IRTableCell,
  inheritedPadding: Readonly<IRBoxEdgesStyleV1>,
  borderSides: Readonly<IRTableBorderSidesV1>
): Readonly<IRTableCellStyleV1> => {
  const usesTableOrDefaultBorder = Object.values(borderSides).some(
    (side) => side.source === "table-side" || side.source === "table-all" || side.source === "none"
  );
  const unsupported = usesTableOrDefaultBorder
    ? ["cell border sides use table/default fallback"]
    : [];

  return Object.freeze({
    version: STYLE_VERSION,
    role: cell.role,
    padding: inheritedPadding,
    border: Object.freeze({
      all: normalizeBorder({
        color: cell.attrs.borderColor,
        style: cell.attrs.borderStyle,
        width: cell.attrs.borderWidth
      }),
      sides: borderSides
    }),
    verticalAlign: normalizeVerticalAlign(cell.attrs.verticalAlign),
    backgroundColor: normalizeColor(cell.attrs.backgroundColor),
    wordBreak: cell.attrs.wordBreak || null,
    unsupported: freezeArray(unsupported)
  });
};

export const normalizeTableStyle = (
  block: IRTableBlock
): Readonly<IRTableStyleV1> => {
  const table = normalizeTableModel(block);
  const padding = normalizeEdges(
    {
      top: block.attrs.cellPaddingTop,
      right: block.attrs.cellPaddingRight,
      bottom: block.attrs.cellPaddingBottom,
      left: block.attrs.cellPaddingLeft
    },
    "pt"
  );

  return Object.freeze({
    version: STYLE_VERSION,
    padding,
    border: Object.freeze({
      all: normalizeBorder({
        color: block.attrs.borderColor,
        style: block.attrs.borderStyle,
        width: block.attrs.borderWidth
      }),
      sides: table.tableBorder.sides
    }),
    indent: parseLength(block.attrs.indent, "pt"),
    indentLevel: toNumberOrNull(block.attrs.indentLevel),
    table,
    cellStyles: freezeArray(
      block.rows.map((row, rowIndex) =>
        freezeArray(
          row.cells.map((cell, cellIndex) => {
            const tableCell = table.cells.find(
              (candidate) =>
                candidate.rowIndex === rowIndex &&
                candidate.cellIndex === cellIndex
            );

            return normalizeTableCellStyle(
              cell,
              padding,
              tableCell?.border.sides ?? table.tableBorder.sides
            );
          })
        )
      )
    ),
    unsupported: freezeArray([
      ...table.unsupported,
      "table preferred width is not modeled in v1",
      "merged cell export row-group normalization is not modeled in v1"
    ])
  });
};

export const normalizeObjectStyle = (
  block: IRObjectBlock
): Readonly<IRObjectStyleV1> => {
  const object = normalizeObjectModel(block);

  return Object.freeze({
    version: STYLE_VERSION,
    objectType: block.objectType,
    flowMode: block.flowMode ?? null,
    anchorMode: block.anchorMode ?? null,
    size: Object.freeze({
      width: parseLength(block.attrs.width, "unknown"),
      height: parseLength(block.attrs.height, "unknown")
    }),
    position: Object.freeze({
      x: parseLength(block.attrs.x, "unknown"),
      y: parseLength(block.attrs.y, "unknown")
    }),
    object,
    unsupported: freezeArray([
      "wrap offsets are not normalized in v1",
      ...object.unsupported
    ])
  });
};

export const normalizeIRBlockStyle = (block: IRBlock): IRBlockStyleV1 => {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return normalizeTextBlockStyle(block);
    case "list":
      return normalizeListMarkerStyle(block);
    case "table":
      return normalizeTableStyle(block);
    case "object":
      return normalizeObjectStyle(block);
    default:
      return null;
  }
};

export const normalizeIRDocumentStyles = (irDocument: IRDocument) =>
  Object.freeze(
    irDocument.sections.map((section, sectionIndex) =>
      Object.freeze({
        sectionIndex,
        sectionId: section.id,
        blocks: freezeArray(
          section.blocks.map((block, blockIndex) =>
            Object.freeze({
              blockIndex,
              blockType: block.type,
              style: normalizeIRBlockStyle(block)
            })
          )
        )
      })
    )
  );
