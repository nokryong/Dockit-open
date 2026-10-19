import type { IRTableBlock, IRTableCell } from "./types";

export type IRTableBorderSideV1 = "top" | "right" | "bottom" | "left";
export type IRTableLengthUnitV1 = "pt" | "px" | "mm" | "percent" | "unknown";
export type IRTableBorderStyleV1 =
  | "solid"
  | "dashed"
  | "dotted"
  | "double"
  | "none"
  | "unknown";
export type IRTableColumnWidthSourceV1 =
  | "colwidth"
  | "derived-from-colspan"
  | "missing";
export type IRTableBorderSourceV1 =
  | "cell-side"
  | "cell-all"
  | "table-side"
  | "table-all"
  | "none";

export interface IRTableLengthV1 {
  value: number;
  unit: IRTableLengthUnitV1;
  raw: unknown;
}

export interface IRTableGridColumnV1 {
  version: "ir-table-model-v1";
  index: number;
  width: Readonly<IRTableLengthV1> | null;
  widthSource: IRTableColumnWidthSourceV1;
  rawWidths: readonly unknown[];
  unsupported: readonly string[];
}

export interface IRTableGridCellV1 {
  version: "ir-table-model-v1";
  rowIndex: number;
  cellIndex: number;
  role: IRTableCell["role"];
  gridColumnStart: number;
  gridColumnEnd: number;
  gridColumnSpan: number;
  gridRowSpan: number;
  columnIndexes: readonly number[];
  columnWidths: readonly (Readonly<IRTableLengthV1> | null)[];
  columnWidthSources: readonly IRTableColumnWidthSourceV1[];
  columnRawWidths: readonly unknown[];
  blockCount: number;
  isMerged: boolean;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

export interface IRTableGridRowV1 {
  version: "ir-table-model-v1";
  rowIndex: number;
  cellCount: number;
  gridColumnCount: number;
  height: Readonly<IRTableLengthV1> | null;
  cells: readonly Readonly<IRTableGridCellV1>[];
}

export interface IRTableBorderLineV1 {
  version: "ir-table-model-v1";
  side: IRTableBorderSideV1;
  color: string | null;
  style: IRTableBorderStyleV1 | null;
  width: Readonly<IRTableLengthV1> | null;
  source: IRTableBorderSourceV1;
}

export type IRTableBorderSidesV1 = Readonly<
  Record<IRTableBorderSideV1, Readonly<IRTableBorderLineV1>>
>;

export interface IRTableBorderBoxV1 {
  version: "ir-table-model-v1";
  sides: IRTableBorderSidesV1;
  rawAttrs: Readonly<Record<string, unknown>>;
  unsupported: readonly string[];
}

export interface IRTableModelCellV1 extends IRTableGridCellV1 {
  border: Readonly<IRTableBorderBoxV1>;
}

export interface IRTableModelV1 {
  version: "ir-table-model-v1";
  rowCount: number;
  columnCount: number;
  columns: readonly Readonly<IRTableGridColumnV1>[];
  rows: readonly Readonly<IRTableGridRowV1>[];
  cells: readonly Readonly<IRTableModelCellV1>[];
  tableBorder: Readonly<IRTableBorderBoxV1>;
  unsupported: readonly string[];
}

const MODEL_VERSION = "ir-table-model-v1" as const;
const SIDES: readonly IRTableBorderSideV1[] = [
  "top",
  "right",
  "bottom",
  "left"
];

const SIDE_ATTR_PARTS = Object.freeze({
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left"
});

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const toPositiveInteger = (value: unknown, fallback = 1) => {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : null;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(numericValue as number));
};

const parseLength = (
  value: unknown,
  defaultUnit: IRTableLengthUnitV1
): Readonly<IRTableLengthV1> | null => {
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
    unit: unit === "%" ? "percent" : (unit as IRTableLengthUnitV1) || defaultUnit,
    raw: value
  });
};

const divideLength = (
  length: Readonly<IRTableLengthV1>,
  divisor: number
): Readonly<IRTableLengthV1> =>
  Object.freeze({
    value: length.value / divisor,
    unit: length.unit,
    raw: length.raw
  });

const sameLength = (
  left: Readonly<IRTableLengthV1> | null,
  right: Readonly<IRTableLengthV1> | null
) =>
  Boolean(
    left &&
      right &&
      left.value === right.value &&
      left.unit === right.unit
  );

const normalizeColor = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const normalizeBorderStyle = (value: unknown): IRTableBorderStyleV1 | null => {
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

const hasAnyBorderValue = ({
  color,
  style,
  width
}: {
  color: string | null;
  style: IRTableBorderStyleV1 | null;
  width: Readonly<IRTableLengthV1> | null;
}) => Boolean(color || style || width);

const getSideAttr = (
  attrs: Record<string, unknown>,
  side: IRTableBorderSideV1,
  attrKind: "Color" | "Style" | "Width"
) => attrs[`border${SIDE_ATTR_PARTS[side]}${attrKind}`];

const hasExplicitSideAttr = (
  attrs: Record<string, unknown>,
  side: IRTableBorderSideV1
) =>
  ["Color", "Style", "Width"].some((attrKind) =>
    Object.prototype.hasOwnProperty.call(
      attrs,
      `border${SIDE_ATTR_PARTS[side]}${attrKind}`
    )
  );

const getBorderParts = (
  attrs: Record<string, unknown>,
  side: IRTableBorderSideV1
) => {
  const explicitSide = hasExplicitSideAttr(attrs, side);
  const sideColor = normalizeColor(getSideAttr(attrs, side, "Color"));
  const sideStyle = normalizeBorderStyle(getSideAttr(attrs, side, "Style"));
  const sideWidth = parseLength(getSideAttr(attrs, side, "Width"), "pt");
  const allColor = normalizeColor(attrs.borderColor);
  const allStyle = normalizeBorderStyle(attrs.borderStyle);
  const allWidth = parseLength(attrs.borderWidth, "pt");

  return {
    explicitSide,
    side: {
      color: sideColor,
      style: sideStyle,
      width: sideWidth
    },
    all: {
      color: allColor,
      style: allStyle,
      width: allWidth
    },
    hasAll: hasAnyBorderValue({
      color: allColor,
      style: allStyle,
      width: allWidth
    })
  };
};

const createBorderLine = ({
  side,
  cellAttrs,
  tableAttrs
}: {
  side: IRTableBorderSideV1;
  cellAttrs?: Record<string, unknown>;
  tableAttrs: Record<string, unknown>;
}): Readonly<IRTableBorderLineV1> => {
  const cellParts = cellAttrs ? getBorderParts(cellAttrs, side) : null;
  const tableParts = getBorderParts(tableAttrs, side);

  if (cellParts?.explicitSide) {
    return Object.freeze({
      version: MODEL_VERSION,
      side,
      color:
        cellParts.side.color ??
        cellParts.all.color ??
        tableParts.side.color ??
        tableParts.all.color,
      style:
        cellParts.side.style ??
        cellParts.all.style ??
        tableParts.side.style ??
        tableParts.all.style,
      width:
        cellParts.side.width ??
        cellParts.all.width ??
        tableParts.side.width ??
        tableParts.all.width,
      source: "cell-side" as const
    });
  }

  if (cellParts?.hasAll) {
    return Object.freeze({
      version: MODEL_VERSION,
      side,
      color: cellParts.all.color,
      style: cellParts.all.style,
      width: cellParts.all.width,
      source: "cell-all" as const
    });
  }

  if (tableParts.explicitSide) {
    return Object.freeze({
      version: MODEL_VERSION,
      side,
      color: tableParts.side.color ?? tableParts.all.color,
      style: tableParts.side.style ?? tableParts.all.style,
      width: tableParts.side.width ?? tableParts.all.width,
      source: "table-side" as const
    });
  }

  if (tableParts.hasAll) {
    return Object.freeze({
      version: MODEL_VERSION,
      side,
      color: tableParts.all.color,
      style: tableParts.all.style,
      width: tableParts.all.width,
      source: "table-all" as const
    });
  }

  return Object.freeze({
    version: MODEL_VERSION,
    side,
    color: null,
    style: null,
    width: null,
    source: "none" as const
  });
};

const createBorderBox = (
  rawAttrs: Record<string, unknown>,
  tableAttrs: Record<string, unknown>,
  cellAttrs?: Record<string, unknown>
): Readonly<IRTableBorderBoxV1> =>
  Object.freeze({
    version: MODEL_VERSION,
    sides: Object.freeze({
      top: createBorderLine({ side: "top", cellAttrs, tableAttrs }),
      right: createBorderLine({ side: "right", cellAttrs, tableAttrs }),
      bottom: createBorderLine({ side: "bottom", cellAttrs, tableAttrs }),
      left: createBorderLine({ side: "left", cellAttrs, tableAttrs })
    }),
    rawAttrs: Object.freeze({ ...rawAttrs }),
    unsupported: freezeArray([])
  });

const getRawColwidths = (cell: IRTableCell) => {
  const colwidth = cell.attrs.colwidth;

  return Array.isArray(colwidth) ? colwidth : [];
};

const normalizeCellColumnWidths = (
  cell: IRTableCell,
  colspan: number,
  unsupported: string[]
) => {
  const rawColwidths = getRawColwidths(cell);

  if (rawColwidths.length === colspan) {
    return rawColwidths.map((rawWidth) => ({
      width: parseLength(rawWidth, "px"),
      source: "colwidth" as const,
      raw: rawWidth
    }));
  }

  if (rawColwidths.length === 1 && colspan > 1) {
    const parsedWidth = parseLength(rawColwidths[0], "px");

    if (parsedWidth) {
      return Array.from({ length: colspan }, () => ({
        width: divideLength(parsedWidth, colspan),
        source: "derived-from-colspan" as const,
        raw: rawColwidths[0]
      }));
    }
  }

  if (rawColwidths.length > 0) {
    unsupported.push("colwidth length does not match colspan");
  }

  return Array.from({ length: colspan }, (_, widthIndex) => {
    const rawWidth = rawColwidths[widthIndex];

    return {
      width: rawWidth === undefined ? null : parseLength(rawWidth, "px"),
      source: rawWidth === undefined ? "missing" as const : "colwidth" as const,
      raw: rawWidth
    };
  });
};

const createGridCell = ({
  cell,
  rowIndex,
  cellIndex,
  gridColumnStart
}: {
  cell: IRTableCell;
  rowIndex: number;
  cellIndex: number;
  gridColumnStart: number;
}): Readonly<IRTableGridCellV1> => {
  const rawAttrs = asRecord(cell.attrs);
  const gridColumnSpan = toPositiveInteger(cell.attrs.colspan, 1);
  const gridRowSpan = toPositiveInteger(cell.attrs.rowspan, 1);
  const unsupported: string[] = [];
  const normalizedWidths = normalizeCellColumnWidths(
    cell,
    gridColumnSpan,
    unsupported
  );
  const columnIndexes = Array.from(
    { length: gridColumnSpan },
    (_, columnOffset) => gridColumnStart + columnOffset
  );

  return Object.freeze({
    version: MODEL_VERSION,
    rowIndex,
    cellIndex,
    role: cell.role,
    gridColumnStart,
    gridColumnEnd: gridColumnStart + gridColumnSpan,
    gridColumnSpan,
    gridRowSpan,
    columnIndexes: freezeArray(columnIndexes),
    columnWidths: freezeArray(
      normalizedWidths.map((columnWidth) => columnWidth.width)
    ),
    columnWidthSources: freezeArray(
      normalizedWidths.map((columnWidth) => columnWidth.source)
    ),
    columnRawWidths: freezeArray(
      normalizedWidths.map((columnWidth) => columnWidth.raw)
    ),
    blockCount: cell.blocks.length,
    isMerged: gridColumnSpan > 1 || gridRowSpan > 1,
    rawAttrs: Object.freeze({ ...rawAttrs }),
    unsupported: freezeArray(unsupported)
  });
};

const collectPlacedCells = (tableBlock: IRTableBlock) => {
  const rowSpanRemaining: number[] = [];
  const rows: IRTableGridRowV1[] = [];
  const cells: IRTableGridCellV1[] = [];

  tableBlock.rows.forEach((row, rowIndex) => {
    const rowCells: IRTableGridCellV1[] = [];
    const occupiedByRowSpan = rowSpanRemaining.map((remaining) => remaining > 0);
    let cursor = 0;

    row.cells.forEach((cell, cellIndex) => {
      while (occupiedByRowSpan[cursor]) {
        cursor += 1;
      }

      const gridCell = createGridCell({
        cell,
        rowIndex,
        cellIndex,
        gridColumnStart: cursor
      });

      for (
        let columnIndex = gridCell.gridColumnStart;
        columnIndex < gridCell.gridColumnEnd;
        columnIndex += 1
      ) {
        occupiedByRowSpan[columnIndex] = true;
        rowSpanRemaining[columnIndex] = Math.max(
          rowSpanRemaining[columnIndex] || 0,
          gridCell.gridRowSpan
        );
      }

      rowCells.push(gridCell);
      cells.push(gridCell);
      cursor = gridCell.gridColumnEnd;
    });

    rows.push(
      Object.freeze({
        version: MODEL_VERSION,
        rowIndex,
        cellCount: row.cells.length,
        gridColumnCount: Math.max(
          0,
          ...rowCells.map((cell) => cell.gridColumnEnd),
          occupiedByRowSpan.length
        ),
        height: parseLength(row.attrs.height, "pt"),
        cells: freezeArray(rowCells)
      })
    );

    for (let index = 0; index < rowSpanRemaining.length; index += 1) {
      if (rowSpanRemaining[index] > 0) {
        rowSpanRemaining[index] -= 1;
      }
    }
  });

  return {
    rows,
    cells
  };
};

const createColumns = (cells: readonly IRTableGridCellV1[]) => {
  const columnCount = cells.reduce(
    (maxColumnCount, cell) => Math.max(maxColumnCount, cell.gridColumnEnd),
    0
  );
  const columnStates = Array.from({ length: columnCount }, () => ({
    width: null as Readonly<IRTableLengthV1> | null,
    widthSource: "missing" as IRTableColumnWidthSourceV1,
    rawWidths: [] as unknown[],
    unsupported: [] as string[]
  }));

  cells.forEach((cell) => {
    cell.columnIndexes.forEach((columnIndex, widthIndex) => {
      const width = cell.columnWidths[widthIndex];
      const source = cell.columnWidthSources[widthIndex];
      const rawWidth = cell.columnRawWidths[widthIndex];
      const columnState = columnStates[columnIndex];

      if (rawWidth !== undefined) {
        columnState.rawWidths.push(rawWidth);
      }

      if (!width) {
        return;
      }

      if (!columnState.width) {
        columnState.width = width;
        columnState.widthSource = source;
        return;
      }

      if (!sameLength(columnState.width, width)) {
        columnState.unsupported.push("conflicting colwidth values");
      }
    });
  });

  return freezeArray(
    columnStates.map((columnState, index) =>
      Object.freeze({
        version: MODEL_VERSION,
        index,
        width: columnState.width,
        widthSource: columnState.widthSource,
        rawWidths: freezeArray(columnState.rawWidths),
        unsupported: freezeArray(Array.from(new Set(columnState.unsupported)))
      })
    )
  );
};

export const normalizeTableModel = (
  tableBlock: IRTableBlock
): Readonly<IRTableModelV1> => {
  const tableAttrs = asRecord(tableBlock.attrs);
  const placed = collectPlacedCells(tableBlock);
  const columns = createColumns(placed.cells);
  const tableBorder = createBorderBox(tableAttrs, tableAttrs);
  const cells = freezeArray(
    placed.cells.map((gridCell) => {
      const sourceCell = tableBlock.rows[gridCell.rowIndex]?.cells[gridCell.cellIndex];

      return Object.freeze({
        ...gridCell,
        border: createBorderBox(
          asRecord(sourceCell?.attrs),
          tableAttrs,
          asRecord(sourceCell?.attrs)
        )
      });
    })
  );
  const unsupported = [
    ...columns.flatMap((column) => column.unsupported),
    ...placed.cells.flatMap((cell) => cell.unsupported)
  ];

  return Object.freeze({
    version: MODEL_VERSION,
    rowCount: tableBlock.rows.length,
    columnCount: columns.length,
    columns,
    rows: freezeArray(placed.rows),
    cells,
    tableBorder,
    unsupported: freezeArray(Array.from(new Set(unsupported)))
  });
};
