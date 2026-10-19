import { describe, expect, it } from "vitest";
import { auditIRExportReadiness } from "../../app/LIB/ir/exportReadinessAudit";
import {
  listTableReadinessIR,
  objectUnsupportedReadinessIR,
  paragraphHeadingReadinessIR
} from "./fixtures/irExportReadinessFixtures";

describe("auditIRExportReadiness", () => {
  it("paragraph/heading snapshot의 지원 범위와 inline/page gaps를 요약한다", () => {
    const report = auditIRExportReadiness(paragraphHeadingReadinessIR);
    const heading = report.blocks[0];
    const paragraph = report.blocks[1];

    expect(report).toMatchObject({
      overallStatus: "partial",
      blockCount: 2
    });
    expect(heading.supported).toEqual(
      expect.arrayContaining([
        "export-neutral style model v1",
        "text block style normalization",
        "text run style normalization"
      ])
    );
    expect(heading.supported).toContain("headingId");
    expect(heading.gaps).toContain("outline level/style mapping is incomplete");
    expect(paragraph.supported).toContain("export-neutral style model v1");
    expect(paragraph.supported).toContain("widows");
    expect(paragraph.gaps).toContain("block-level font family is not normalized");
    expect(paragraph.gaps).toContain(
      "inlineTag visual style has no external format mapping"
    );
    expect(paragraph.pageMetadataUses).toEqual([
      "map block to page range",
      "detect page-spanning block",
      "read break reasons"
    ]);
  });

  it("list/table snapshot에서 numbering, merge, border 쪽 export gaps를 드러낸다", () => {
    const report = auditIRExportReadiness(listTableReadinessIR);
    const list = report.blocks[0];
    const table = report.blocks[1];

    expect(report.overallStatus).toBe("partial");
    expect(list.supported).toContain("listType");
    expect(list.supported).toContain("export-neutral style model v1");
    expect(list.supported).toContain("list numbering model v1");
    expect(list.supported).toContain("list marker style summary");
    expect(list.gaps).toEqual(
      expect.arrayContaining([
        "numbering definition id is not stable",
        "nested list restart policy is adapter-defined",
        "custom marker style is not modeled",
        "list attr tight remains raw",
        "list item value is preserved but not canonical numbering"
      ])
    );
    expect(table.supported).toEqual(
      expect.arrayContaining([
        "colspan",
        "rowspan",
        "export-neutral style model v1",
        "table model v1",
        "table grid model v1",
        "per-side cell borders",
        "headerRowRepeat hint"
      ])
    );
    expect(table.gaps).toEqual(
      expect.arrayContaining([
        "table preferred width is not modeled",
        "border conflict resolution is adapter-defined",
        "cell merge export requires row-group normalization"
      ])
    );
    expect(table.pageMetadataUses).toContain("audit merged table row group");
  });

  it("object와 unsupported block은 relationship 후보와 남은 gap을 표시한다", () => {
    const report = auditIRExportReadiness(objectUnsupportedReadinessIR);
    const object = report.blocks[0];
    const unsupported = report.blocks[1];

    expect(report.overallStatus).toBe("blocked");
    expect(object).toMatchObject({
      blockType: "object",
      exportStatus: "partial"
    });
    expect(object.supported).toEqual(
      expect.arrayContaining([
        "object model v1",
        "export-neutral style model v1",
        "size unit normalization",
        "media relationship candidates",
        "caption metadata candidates"
      ])
    );
    expect(object.gaps).toEqual(
      expect.arrayContaining([
        "export relationship id is candidate-only",
        "image binary/blob part is not created",
        "relationship id is candidate-only in v1",
        "numeric object units remain unknown unless source attrs include a unit"
      ])
    );
    expect(unsupported).toMatchObject({
      blockType: "unsupported",
      exportStatus: "blocked"
    });
    expect(unsupported.gaps).toContain("unsupported node type: columnBlock");
    expect(report.pageMetadataUses).toContain("choose page break insertion points");
  });

  it("integrated model coverage summary가 현재 export helper들을 모두 노출한다", () => {
    const report = auditIRExportReadiness({
      type: "document",
      version: "ir-v1.1-draft",
      metadata: {
        extractedAt: "2026-05-07T00:00:00.000Z",
        extractorVersion: "integrated-audit-test",
        source: {
          editor: "tiptap-prosemirror",
          mode: "readonly-snapshot"
        },
        warnings: []
      },
      sections: [
        {
          type: "section",
          id: "integrated-audit",
          breakType: "continuous",
          pageSettings: {
            widthMm: 210,
            heightMm: 297,
            paddingTopMm: 20,
            paddingBottomMm: 20,
            paddingLeftMm: 25,
            paddingRightMm: 25,
            lineHeight: 1.5
          },
          blocks: [
            paragraphHeadingReadinessIR.sections[0].blocks[1],
            listTableReadinessIR.sections[0].blocks[0],
            listTableReadinessIR.sections[0].blocks[1],
            objectUnsupportedReadinessIR.sections[0].blocks[0]
          ]
        }
      ]
    });

    expect(report.overallStatus).toBe("partial");
    expect(report.supportedByBlockType.paragraph).toEqual(
      expect.arrayContaining([
        "export-neutral style model v1",
        "text run style normalization"
      ])
    );
    expect(report.supportedByBlockType.list).toEqual(
      expect.arrayContaining([
        "list numbering model v1",
        "list marker style summary"
      ])
    );
    expect(report.supportedByBlockType.table).toEqual(
      expect.arrayContaining(["table model v1", "per-side cell borders"])
    );
    expect(report.supportedByBlockType.object).toEqual(
      expect.arrayContaining(["object model v1", "media relationship candidates"])
    );
    expect(report.pageMetadataUses).toEqual(
      expect.arrayContaining([
        "choose page break insertion points",
        "flag table row fallback cases"
      ])
    );
  });
});
