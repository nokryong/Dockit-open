import { describe, expect, it } from "vitest";
import { normalizeTableModel } from "../../app/LIB/ir/tableModel";

const paragraph = (text) => ({
  type: "paragraph",
  attrs: {},
  runs: [{ type: "textRun", text, marks: [] }]
});

const gridTableBlock = {
  type: "table",
  attrs: {
    borderColor: "#333333",
    borderStyle: "solid",
    borderWidth: 1
  },
  rows: [
    {
      type: "tableRow",
      attrs: { height: 24 },
      cells: [
        {
          type: "tableCell",
          role: "header",
          attrs: {
            colspan: 2,
            rowspan: 1,
            colwidth: [80, 120]
          },
          blocks: [paragraph("A")]
        },
        {
          type: "tableCell",
          role: "header",
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: [100]
          },
          blocks: [paragraph("B")]
        }
      ]
    },
    {
      type: "tableRow",
      attrs: { height: 24 },
      cells: [
        {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: 1,
            rowspan: 2,
            colwidth: [80]
          },
          blocks: [paragraph("C")]
        },
        {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: [120]
          },
          blocks: [paragraph("D")]
        },
        {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: [100]
          },
          blocks: [paragraph("E")]
        }
      ]
    },
    {
      type: "tableRow",
      attrs: { height: 24 },
      cells: [
        {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: [120]
          },
          blocks: [paragraph("F")]
        },
        {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: [100]
          },
          blocks: [paragraph("G")]
        }
      ]
    }
  ]
};

const borderTableBlock = {
  type: "table",
  attrs: {
    borderColor: "#333333",
    borderStyle: "solid",
    borderWidth: 1,
    borderBottomColor: "#111111",
    borderBottomWidth: "2pt"
  },
  rows: [
    {
      type: "tableRow",
      attrs: {},
      cells: [
        {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: [100],
            borderColor: "#999999",
            borderStyle: "dotted",
            borderWidth: "0.5pt",
            borderTopColor: "#ff0000",
            borderTopStyle: "dashed",
            borderTopWidth: 2
          },
          blocks: [paragraph("A")]
        },
        {
          type: "tableCell",
          role: "cell",
          attrs: {
            colspan: 1,
            rowspan: 1,
            colwidth: [100]
          },
          blocks: [paragraph("B")]
        }
      ]
    }
  ]
};

describe("IR table model v1", () => {
  it("colspan/rowspan을 반영한 grid placement와 column width를 만든다", () => {
    const model = normalizeTableModel(gridTableBlock);

    expect(model).toMatchObject({
      version: "ir-table-model-v1",
      rowCount: 3,
      columnCount: 3,
      columns: [
        {
          index: 0,
          width: { value: 80, unit: "px", raw: 80 },
          widthSource: "colwidth"
        },
        {
          index: 1,
          width: { value: 120, unit: "px", raw: 120 },
          widthSource: "colwidth"
        },
        {
          index: 2,
          width: { value: 100, unit: "px", raw: 100 },
          widthSource: "colwidth"
        }
      ]
    });
    expect(model.cells[0]).toMatchObject({
      rowIndex: 0,
      cellIndex: 0,
      gridColumnStart: 0,
      gridColumnEnd: 2,
      gridColumnSpan: 2,
      gridRowSpan: 1,
      columnIndexes: [0, 1],
      columnWidthSources: ["colwidth", "colwidth"],
      isMerged: true
    });
    expect(
      model.cells.find((cell) => cell.rowIndex === 2 && cell.cellIndex === 0)
    ).toMatchObject({
      gridColumnStart: 1,
      gridColumnEnd: 2
    });
    expect(Object.isFrozen(model.columns)).toBe(true);
    expect(Object.isFrozen(model.cells[0].columnIndexes)).toBe(true);
  });

  it("단일 colwidth가 colspan 전체를 대표하면 column width를 나눠 기록한다", () => {
    const model = normalizeTableModel({
      type: "table",
      attrs: {},
      rows: [
        {
          type: "tableRow",
          attrs: {},
          cells: [
            {
              type: "tableCell",
              role: "cell",
              attrs: {
                colspan: 2,
                rowspan: 1,
                colwidth: [240]
              },
              blocks: [paragraph("wide")]
            }
          ]
        }
      ]
    });

    expect(model.columns).toMatchObject([
      {
        width: { value: 120, unit: "px", raw: 240 },
        widthSource: "derived-from-colspan",
        rawWidths: [240]
      },
      {
        width: { value: 120, unit: "px", raw: 240 },
        widthSource: "derived-from-colspan",
        rawWidths: [240]
      }
    ]);
    expect(model.cells[0]).toMatchObject({
      columnWidthSources: ["derived-from-colspan", "derived-from-colspan"],
      columnRawWidths: [240, 240]
    });
  });

  it("cell side border, cell all-border, table border fallback을 per-side로 정규화한다", () => {
    const model = normalizeTableModel(borderTableBlock);
    const explicitCell = model.cells[0];
    const tableFallbackCell = model.cells[1];

    expect(model.tableBorder.sides.bottom).toMatchObject({
      color: "#111111",
      style: "solid",
      width: { value: 2, unit: "pt", raw: "2pt" },
      source: "table-side"
    });
    expect(explicitCell.border.sides.top).toMatchObject({
      color: "#ff0000",
      style: "dashed",
      width: { value: 2, unit: "pt", raw: 2 },
      source: "cell-side"
    });
    expect(explicitCell.border.sides.right).toMatchObject({
      color: "#999999",
      style: "dotted",
      width: { value: 0.5, unit: "pt", raw: "0.5pt" },
      source: "cell-all"
    });
    expect(tableFallbackCell.border.sides.top).toMatchObject({
      color: "#333333",
      style: "solid",
      width: { value: 1, unit: "pt", raw: 1 },
      source: "table-all"
    });
    expect(tableFallbackCell.border.sides.bottom).toMatchObject({
      color: "#111111",
      style: "solid",
      width: { value: 2, unit: "pt", raw: "2pt" },
      source: "table-side"
    });
  });
});
