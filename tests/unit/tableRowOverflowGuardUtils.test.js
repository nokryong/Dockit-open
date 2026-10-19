import { describe, expect, it } from "vitest";
import {
  buildTableRowGroupMeta,
  getTableRowOverflowLimit,
  getTableRowOverflowReports,
  getTooTallTableRowReports
} from "../../app/LIB/extensions/utils/tableRowOverflowGuardUtils";

const node = (typeName, attrs = {}, content = []) => ({
  type: { name: typeName },
  attrs,
  content,
  nodeSize:
    2 +
    content.reduce((sum, child) => {
      return sum + (child.nodeSize || 1);
    }, 0)
});

const cell = (attrs = {}) => node("tableCell", attrs, []);
const row = (cells = []) => node("tableRow", {}, cells);

describe("tableRowOverflowGuardUtils", () => {
  it("pageMetrics에서 표 행 최대 높이를 content area height로 계산한다", () => {
    expect(
      getTableRowOverflowLimit({
        pageHeightPx: 500,
        padding: {
          top: 60,
          bottom: 40
        }
      })
    ).toBe(400);
  });

  it("rowspan이 걸친 병합 row group 범위를 계산한다", () => {
    const rows = [
      row([cell({ rowspan: 2 }), cell()]),
      row([cell()]),
      row([cell()])
    ];

    expect(buildTableRowGroupMeta(rows)).toEqual([
      {
        rowIndex: 0,
        hasMergedCells: true,
        groupStartIndex: 0,
        groupEndIndex: 1
      },
      {
        rowIndex: 1,
        hasMergedCells: true,
        groupStartIndex: 0,
        groupEndIndex: 1
      },
      {
        rowIndex: 2,
        hasMergedCells: false,
        groupStartIndex: 2,
        groupEndIndex: 2
      }
    ]);
  });

  it("페이지보다 큰 단일 row와 병합 row group을 too-tall report로 분리한다", () => {
    const rowMeasurements = [
      { node: row([cell({ rowspan: 2 }), cell()]), heightPx: 70 },
      { node: row([cell()]), heightPx: 50 },
      { node: row([cell()]), heightPx: 130 }
    ];

    expect(
      getTooTallTableRowReports({
        tablePos: 10,
        rowMeasurements,
        maxHeightPx: 100,
        tolerancePx: 0
      })
    ).toMatchObject([
      {
        key: "10:0-1",
        kind: "group",
        tablePos: 10,
        rowIndex: 0,
        groupStartIndex: 0,
        groupEndIndex: 1,
        heightPx: 120,
        maxHeightPx: 100
      },
      {
        key: "10:2",
        kind: "row",
        tablePos: 10,
        rowIndex: 2,
        groupStartIndex: 2,
        groupEndIndex: 2,
        heightPx: 130,
        maxHeightPx: 100
      }
    ]);
  });

  it("ProseMirror view에서 table row DOM 높이를 읽어 overflow report를 만든다", () => {
    const table = node("table", {}, [
      row([cell({ rowspan: 2 }), cell()]),
      row([cell()])
    ]);
    const firstRowPos = 6;
    const secondRowPos = 6 + table.content[0].nodeSize;
    const heights = new Map([
      [firstRowPos, 65],
      [secondRowPos, 55]
    ]);
    const view = {
      state: {
        doc: {
          descendants(callback) {
            callback(table, 5);
          }
        }
      },
      nodeDOM(pos) {
        return {
          getBoundingClientRect() {
            return {
              height: heights.get(pos) || 0
            };
          }
        };
      }
    };

    expect(
      getTableRowOverflowReports(view, {
        pageMetrics: {
          pageHeightPx: 120,
          padding: {
            top: 10,
            bottom: 10
          }
        },
        tolerancePx: 0
      })
    ).toMatchObject([
      {
        key: "5:0-1",
        kind: "group",
        heightPx: 120,
        maxHeightPx: 100
      }
    ]);
  });
});
