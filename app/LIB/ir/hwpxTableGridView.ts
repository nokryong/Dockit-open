import type { IRTableModelCellV1, IRTableModelV1 } from "./tableModel";

export type HWPXTableGridSlotKindV1 = "anchor" | "covered" | "empty";

export type HWPXTableGridRiskCodeV1 =
  | "covered-slot"
  | "rowspan-clamped"
  | "uneven-row-group"
  | "mixed-rowspan-boundary"
  | "empty-slot";

export interface HWPXTableGridSlotV1 {
  version: "hwpx-table-grid-view-v1";
  kind: HWPXTableGridSlotKindV1;
  rowIndex: number;
  columnIndex: number;
  anchorRowIndex: number | null;
  anchorCellIndex: number | null;
  anchorColumnIndex: number | null;
}

export interface HWPXTableRowGroupV1 {
  version: "hwpx-table-grid-view-v1";
  startRowIndex: number;
  endRowIndex: number;
  rowIndexes: readonly number[];
  anchorCellRefs: readonly string[];
  coveredSlotCount: number;
  requiresNormalization: boolean;
}

export interface HWPXTableGridRiskV1 {
  version: "hwpx-table-grid-view-v1";
  code: HWPXTableGridRiskCodeV1;
  rowIndex: number;
  cellIndex: number | null;
  columnIndex: number | null;
  message: string;
}

export interface HWPXNormalizedTableGridViewV1 {
  version: "hwpx-table-grid-view-v1";
  rowCount: number;
  columnCount: number;
  slots: readonly Readonly<HWPXTableGridSlotV1>[];
  coveredSlots: readonly Readonly<HWPXTableGridSlotV1>[];
  emptySlots: readonly Readonly<HWPXTableGridSlotV1>[];
  rowGroups: readonly Readonly<HWPXTableRowGroupV1>[];
  risks: readonly Readonly<HWPXTableGridRiskV1>[];
}

const VIEW_VERSION = "hwpx-table-grid-view-v1" as const;

const freezeArray = <T>(items: readonly T[]) => Object.freeze([...items]);

const cellRef = (cell: Readonly<IRTableModelCellV1>) =>
  `r${cell.rowIndex}c${cell.cellIndex}`;

const createSlot = ({
  kind,
  rowIndex,
  columnIndex,
  anchor
}: {
  kind: HWPXTableGridSlotKindV1;
  rowIndex: number;
  columnIndex: number;
  anchor: Readonly<IRTableModelCellV1> | null;
}): Readonly<HWPXTableGridSlotV1> =>
  Object.freeze({
    version: VIEW_VERSION,
    kind,
    rowIndex,
    columnIndex,
    anchorRowIndex: anchor?.rowIndex ?? null,
    anchorCellIndex: anchor?.cellIndex ?? null,
    anchorColumnIndex: anchor?.gridColumnStart ?? null
  });

const createRisk = ({
  code,
  rowIndex,
  cellIndex,
  columnIndex,
  message
}: {
  code: HWPXTableGridRiskCodeV1;
  rowIndex: number;
  cellIndex: number | null;
  columnIndex: number | null;
  message: string;
}): Readonly<HWPXTableGridRiskV1> =>
  Object.freeze({
    version: VIEW_VERSION,
    code,
    rowIndex,
    cellIndex,
    columnIndex,
    message
  });

const mergeIntervals = (
  intervals: readonly Readonly<{
    start: number;
    end: number;
    cell: Readonly<IRTableModelCellV1>;
  }>[]
) => {
  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  const groups: {
    start: number;
    end: number;
    cells: Readonly<IRTableModelCellV1>[];
  }[] = [];

  sorted.forEach((interval) => {
    const last = groups[groups.length - 1];

    if (!last || interval.start > last.end + 1) {
      groups.push({
        start: interval.start,
        end: interval.end,
        cells: [interval.cell]
      });
      return;
    }

    last.end = Math.max(last.end, interval.end);
    last.cells.push(interval.cell);
  });

  return groups;
};

export const createHWPXNormalizedTableGridView = (
  tableModel: Readonly<IRTableModelV1>
): Readonly<HWPXNormalizedTableGridViewV1> => {
  const slotAnchors = new Map<string, Readonly<IRTableModelCellV1>>();
  const rowSpanIntervals: {
    start: number;
    end: number;
    cell: Readonly<IRTableModelCellV1>;
  }[] = [];
  const risks: Readonly<HWPXTableGridRiskV1>[] = [];

  tableModel.cells.forEach((cell) => {
    const safeRowSpan = Math.min(
      cell.gridRowSpan,
      Math.max(1, tableModel.rowCount - cell.rowIndex)
    );

    if (cell.gridRowSpan > safeRowSpan) {
      risks.push(
        createRisk({
          code: "rowspan-clamped",
          rowIndex: cell.rowIndex,
          cellIndex: cell.cellIndex,
          columnIndex: cell.gridColumnStart,
          message: `Cell ${cellRef(cell)} declares rowspan ${cell.gridRowSpan}, but export can only address ${safeRowSpan} rows.`
        })
      );
    }

    for (
      let rowIndex = cell.rowIndex;
      rowIndex < cell.rowIndex + safeRowSpan;
      rowIndex += 1
    ) {
      for (
        let columnIndex = cell.gridColumnStart;
        columnIndex < Math.min(cell.gridColumnEnd, tableModel.columnCount);
        columnIndex += 1
      ) {
        slotAnchors.set(`${rowIndex}:${columnIndex}`, cell);
      }
    }

    if (cell.gridRowSpan > 1) {
      rowSpanIntervals.push({
        start: cell.rowIndex,
        end: cell.rowIndex + safeRowSpan - 1,
        cell
      });
    }
  });

  const slots: Readonly<HWPXTableGridSlotV1>[] = [];

  for (let rowIndex = 0; rowIndex < tableModel.rowCount; rowIndex += 1) {
    for (
      let columnIndex = 0;
      columnIndex < tableModel.columnCount;
      columnIndex += 1
    ) {
      const anchor = slotAnchors.get(`${rowIndex}:${columnIndex}`) ?? null;
      const kind = !anchor
        ? "empty"
        : anchor.rowIndex === rowIndex &&
            anchor.gridColumnStart === columnIndex
          ? "anchor"
          : "covered";

      slots.push(createSlot({ kind, rowIndex, columnIndex, anchor }));
    }
  }

  const coveredSlots = slots.filter((slot) => slot.kind === "covered");
  const emptySlots = slots.filter((slot) => slot.kind === "empty");

  coveredSlots.forEach((slot) => {
    risks.push(
      createRisk({
        code: "covered-slot",
        rowIndex: slot.rowIndex,
        cellIndex: slot.anchorCellIndex,
        columnIndex: slot.columnIndex,
        message: `Slot r${slot.rowIndex}c${slot.columnIndex} is covered by anchor r${slot.anchorRowIndex}c${slot.anchorCellIndex}.`
      })
    );
  });

  emptySlots.forEach((slot) => {
    risks.push(
      createRisk({
        code: "empty-slot",
        rowIndex: slot.rowIndex,
        cellIndex: null,
        columnIndex: slot.columnIndex,
        message: `Slot r${slot.rowIndex}c${slot.columnIndex} has no source cell anchor.`
      })
    );
  });

  const rowGroups = mergeIntervals(rowSpanIntervals).map((group) => {
    const rowIndexes = Array.from(
      { length: group.end - group.start + 1 },
      (_, offset) => group.start + offset
    );
    const coveredSlotCount = coveredSlots.filter(
      (slot) => slot.rowIndex >= group.start && slot.rowIndex <= group.end
    ).length;
    const distinctEnds = new Set(
      group.cells.map((cell) =>
        Math.min(
          tableModel.rowCount - 1,
          cell.rowIndex + Math.max(1, cell.gridRowSpan) - 1
        )
      )
    );
    const physicalCellCounts = new Set(
      rowIndexes.map(
        (rowIndex) =>
          tableModel.rows.find((row) => row.rowIndex === rowIndex)?.cellCount ?? 0
      )
    );
    const requiresNormalization =
      coveredSlotCount > 0 ||
      distinctEnds.size > 1 ||
      physicalCellCounts.size > 1;

    if (physicalCellCounts.size > 1) {
      risks.push(
        createRisk({
          code: "uneven-row-group",
          rowIndex: group.start,
          cellIndex: null,
          columnIndex: null,
          message: `Rows ${group.start}-${group.end} have uneven physical cell counts inside a rowspan group.`
        })
      );
    }

    if (distinctEnds.size > 1) {
      risks.push(
        createRisk({
          code: "mixed-rowspan-boundary",
          rowIndex: group.start,
          cellIndex: null,
          columnIndex: null,
          message: `Rows ${group.start}-${group.end} contain rowspans ending at different row boundaries.`
        })
      );
    }

    return Object.freeze({
      version: VIEW_VERSION,
      startRowIndex: group.start,
      endRowIndex: group.end,
      rowIndexes: freezeArray(rowIndexes),
      anchorCellRefs: freezeArray(group.cells.map(cellRef)),
      coveredSlotCount,
      requiresNormalization
    });
  });

  return Object.freeze({
    version: VIEW_VERSION,
    rowCount: tableModel.rowCount,
    columnCount: tableModel.columnCount,
    slots: freezeArray(slots),
    coveredSlots: freezeArray(coveredSlots),
    emptySlots: freezeArray(emptySlots),
    rowGroups: freezeArray(rowGroups),
    risks: freezeArray(risks)
  });
};

export const summarizeHWPXTableGridViewForWarning = (
  view: Readonly<HWPXNormalizedTableGridViewV1>
) => {
  const riskCodes = Array.from(new Set(view.risks.map((risk) => risk.code)));

  return [
    `coveredSlots=${view.coveredSlots.length}`,
    `rowGroups=${view.rowGroups.length}`,
    `risks=${riskCodes.length ? riskCodes.join(",") : "none"}`
  ].join("; ");
};
