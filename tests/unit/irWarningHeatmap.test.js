import { describe, expect, it } from "vitest";
import { fromProseMirrorDocToIR } from "../../app/LIB/ir/fromProseMirror";
import { normalizeTableModel } from "../../app/LIB/ir/tableModel";
import { DOCX_MINIMAL_WARNING_CONTRACT } from "../../app/LIB/ir/docxMinimalExport";
import { HWPX_V0_WARNING_CONTRACT } from "../../app/LIB/ir/hwpxMinimalExport";
import { DOCX_V0_WARNING_COPY } from "../../app/LIB/utils/docxExportButtonUtils";
import { HWPX_V0_WARNING_DETAIL_COPY } from "../../app/LIB/utils/hwpxExportButtonUtils";
import { irWarningFixtureDocs } from "./fixtures/irWarningFixtures";

const collectWarningCounts = (fixtures) => {
  const warningCounts = new Map();

  fixtures.forEach(({ doc }) => {
    const ir = fromProseMirrorDocToIR(doc, {
      extractedAt: "2026-04-22T00:00:00.000Z",
      extractorVersion: "heatmap-test"
    });

    ir.metadata.warnings.forEach((warning) => {
      warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1);
    });
  });

  return warningCounts;
};

describe("IR warning heatmap fixtures", () => {
  it("warning detail modal copy mappings cover every known export warning code", () => {
    const docxKnownCodes = [
      ...Object.keys(DOCX_MINIMAL_WARNING_CONTRACT),
      "ir-extraction-warning"
    ].sort();
    const docxMappedCodes = Object.keys(DOCX_V0_WARNING_COPY).sort();
    const hwpxKnownCodes = [
      ...Object.keys(HWPX_V0_WARNING_CONTRACT),
      "ir-extraction-warning"
    ].sort();
    const hwpxMappedCodes = Object.keys(HWPX_V0_WARNING_DETAIL_COPY).sort();

    expect(docxMappedCodes).toEqual(docxKnownCodes);
    expect(hwpxMappedCodes).toEqual(hwpxKnownCodes);
  });

  it("대표 fixture의 warnings 상위 이슈를 안정적으로 집계한다", () => {
    const warningCounts = collectWarningCounts(irWarningFixtureDocs);

    expect(warningCounts.get("지원하지 않는 block node: tocItem")).toBe(3);
    expect(warningCounts.get("지원하지 않는 block node: captionBlock")).toBe(2);
    expect(warningCounts.get("지원하지 않는 block node: captionTocItem")).toBe(
      2
    );
    expect(warningCounts.get("지원하지 않는 inline node: inlineMath")).toBe(2);
    expect(warningCounts.get("지원하지 않는 block node: columnBlock")).toBe(2);
  });

  it("table four-side border attrs를 IR과 table model에 보존한다", () => {
    const tableGapDoc = irWarningFixtureDocs.find(
      ({ name }) => name === "legacy-blocks-and-table-gap"
    ).doc;
    const ir = fromProseMirrorDocToIR(tableGapDoc);
    const tableBlock = ir.sections[0].blocks.find(
      (block) => block.type === "table"
    );
    const tableModel = normalizeTableModel(tableBlock);

    expect(ir.metadata.warnings).not.toContain(
      "미매핑 node attr: table_cell.borderTopColor"
    );
    expect(tableBlock.rows[0].cells[0].attrs).toMatchObject({
      borderTopColor: "#000000",
      borderRightColor: "#111111",
      borderBottomColor: "#222222",
      borderLeftColor: "#333333",
      borderTopWidth: 1,
      borderRightWidth: 2,
      borderBottomWidth: 3,
      borderLeftWidth: 4
    });
    expect(tableModel.cells[0].border.sides).toMatchObject({
      top: {
        color: "#000000",
        width: { value: 1, unit: "pt", raw: 1 },
        source: "cell-side"
      },
      right: {
        color: "#111111",
        width: { value: 2, unit: "pt", raw: 2 },
        source: "cell-side"
      },
      bottom: {
        color: "#222222",
        width: { value: 3, unit: "pt", raw: 3 },
        source: "cell-side"
      },
      left: {
        color: "#333333",
        width: { value: 4, unit: "pt", raw: 4 },
        source: "cell-side"
      }
    });
  });
});
