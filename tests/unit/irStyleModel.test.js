import { describe, expect, it } from "vitest";
import {
  normalizeIRBlockStyle,
  normalizeIRDocumentStyles,
  normalizeListMarkerStyle,
  normalizeObjectStyle,
  normalizeTableStyle,
  normalizeTextBlockStyle,
  normalizeTextRunStyle,
  normalizeTextRunStyles
} from "../../app/LIB/ir/styleModel";
import {
  listTableReadinessIR,
  paragraphHeadingReadinessIR
} from "./fixtures/irExportReadinessFixtures";

const objectBlock = {
  type: "object",
  objectType: "image",
  flowMode: "floating",
  anchorMode: "page",
  attrs: {
    width: "120mm",
    height: 180,
    x: "12px",
    y: "25mm"
  },
  children: []
};

const styledParagraph = {
  type: "paragraph",
  attrs: {
    textAlign: "left",
    lineHeight: "150%",
    fontSize: "11pt"
  },
  runs: [
    {
      type: "textRun",
      text: "Styled linked text",
      marks: [
        { type: "bold" },
        { type: "italic" },
        { type: "underline" },
        { type: "strike" },
        { type: "code" },
        {
          type: "textStyle",
          attrs: {
            fontFamily: "Pretendard",
            fontSize: "13pt",
            color: "#111111",
            backgroundColor: "#ffeeaa"
          }
        },
        {
          type: "highlight",
          attrs: {
            color: "#fff3bf"
          }
        },
        {
          type: "inlineTag",
          attrs: {
            color: "#ffcc00"
          }
        },
        {
          type: "link",
          attrs: {
            href: "https://example.com",
            target: "_blank",
            title: "Example"
          }
        },
        { type: "superscript" }
      ]
    }
  ]
};

describe("IR export-neutral style model v1", () => {
  it("text run mark를 export-neutral run style로 정규화한다", () => {
    const runStyle = normalizeTextRunStyle(styledParagraph.runs[0]);

    expect(runStyle).toMatchObject({
      version: "ir-style-v1",
      text: "Styled linked text",
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      code: true,
      link: {
        href: "https://example.com",
        target: "_blank",
        title: "Example"
      },
      fontFamily: "Pretendard",
      fontSize: { value: 13, unit: "pt", raw: "13pt" },
      color: "#111111",
      backgroundColor: "#ffeeaa",
      highlightColor: "#fff3bf",
      inlineTagColor: "#ffcc00",
      verticalAlign: "superscript",
      unsupported: []
    });
    expect(Object.isFrozen(runStyle)).toBe(true);
    expect(Object.isFrozen(runStyle.link)).toBe(true);
  });

  it("paragraph/heading attrs를 export-neutral text block style로 정규화한다", () => {
    const heading = paragraphHeadingReadinessIR.sections[0].blocks[0];
    const paragraph = styledParagraph;
    const headingStyle = normalizeTextBlockStyle(heading);
    const paragraphStyle = normalizeTextBlockStyle(paragraph);

    expect(headingStyle).toMatchObject({
      version: "ir-style-v1",
      blockType: "heading",
      textAlign: "left",
      lineHeight: { value: 1.4, unit: "ratio", raw: "1.4" },
      indent: { value: 0, unit: "pt", raw: 0 },
      indentLevel: 0,
      wordBreak: "keep-all",
      headingLevel: 1,
      headingStyleId: "heading-1"
    });
    expect(paragraphStyle).toMatchObject({
      blockType: "paragraph",
      textAlign: "left",
      lineHeight: { value: 1.5, unit: "ratio", raw: "150%" },
      fontSize: { value: 11, unit: "pt", raw: "11pt" },
      runs: [
        {
          fontFamily: "Pretendard",
          color: "#111111"
        }
      ]
    });
    expect(Object.isFrozen(paragraphStyle)).toBe(true);
    expect(Object.isFrozen(paragraphStyle.runs)).toBe(true);
  });

  it("list marker style은 가능한 범위만 정규화하고 numbering gap은 남긴다", () => {
    const listBlock = listTableReadinessIR.sections[0].blocks[0];
    const style = normalizeListMarkerStyle(listBlock);

    expect(style).toMatchObject({
      version: "ir-style-v1",
      listType: "ordered",
      markerKind: "ordered",
      markerFormat: "decimal",
      startNumber: 3,
      numbering: {
        rootListType: "ordered",
        levels: [
          {
            depth: 0,
            markerFormat: "decimal",
            startNumber: 3
          }
        ],
        items: [
          {
            effectiveNumber: 3
          }
        ]
      },
      rawAttrs: {
        start: 3,
        tight: false
      }
    });
    expect(style.unsupported).toContain("list attrs are not fully normalized");
    expect(style.unsupported).toContain("list item attrs remain raw");
  });

  it("table padding/grid/per-side border/alignment를 정규화한다", () => {
    const tableBlock = listTableReadinessIR.sections[0].blocks[1];
    const style = normalizeTableStyle(tableBlock);

    expect(style.table).toMatchObject({
      version: "ir-table-model-v1",
      rowCount: 1,
      columnCount: 1,
      columns: [
        {
          index: 0,
          width: { value: 120, unit: "px", raw: 120 },
          widthSource: "colwidth"
        }
      ],
      cells: [
        {
          gridColumnStart: 0,
          gridColumnEnd: 1,
          gridRowSpan: 2,
          isMerged: true
        }
      ]
    });
    expect(style.padding).toMatchObject({
      top: { value: 4, unit: "pt", raw: 4 },
      right: { value: 6, unit: "pt", raw: 6 },
      bottom: { value: 4, unit: "pt", raw: 4 },
      left: { value: 6, unit: "pt", raw: 6 }
    });
    expect(style.border.all).toMatchObject({
      color: "#333333",
      style: "solid",
      width: { value: 1, unit: "pt", raw: 1 }
    });
    expect(style.cellStyles[0][0]).toMatchObject({
      role: "cell",
      verticalAlign: "middle",
      backgroundColor: "#f5f5f5",
      wordBreak: "keep-all",
      border: {
        all: {
          color: "#333333",
          style: "solid",
          width: { value: 1, unit: "pt", raw: 1 }
        },
        sides: {
          top: {
            color: "#333333",
            style: "solid",
            width: { value: 1, unit: "pt", raw: 1 },
            source: "cell-all"
          }
        }
      }
    });
    expect(style.unsupported).toContain("table preferred width is not modeled in v1");
    expect(style.unsupported).toContain(
      "merged cell export row-group normalization is not modeled in v1"
    );
    expect(style.cellStyles[0][0].unsupported).toEqual([]);
  });

  it("list item과 table cell 내부 text run에도 같은 run style helper를 적용할 수 있다", () => {
    const listParagraph = {
      type: "paragraph",
      attrs: {},
      runs: [
        {
          type: "textRun",
          text: "List item",
          marks: [
            { type: "textStyle", attrs: { color: "#2563eb" } },
            { type: "subscript" }
          ]
        }
      ]
    };
    const tableCellParagraph = {
      type: "paragraph",
      attrs: {},
      runs: [
        {
          type: "textRun",
          text: "Cell text",
          marks: [
            { type: "textStyle", attrs: { fontFamily: "Noto Sans KR" } },
            { type: "highlight", attrs: { color: "#e0f2fe" } }
          ]
        }
      ]
    };

    expect(normalizeTextRunStyles(listParagraph.runs)[0]).toMatchObject({
      text: "List item",
      color: "#2563eb",
      verticalAlign: "subscript"
    });
    expect(normalizeTextRunStyles(tableCellParagraph.runs)[0]).toMatchObject({
      text: "Cell text",
      fontFamily: "Noto Sans KR",
      highlightColor: "#e0f2fe"
    });
  });

  it("object size/position은 단위가 있는 값만 확정 단위로 정규화한다", () => {
    const style = normalizeObjectStyle(objectBlock);

    expect(style).toMatchObject({
      version: "ir-style-v1",
      objectType: "image",
      flowMode: "floating",
      anchorMode: "page",
      size: {
        width: { value: 120, unit: "mm", raw: "120mm" },
        height: { value: 180, unit: "unknown", raw: 180 }
      },
      position: {
        x: { value: 12, unit: "px", raw: "12px" },
        y: { value: 25, unit: "mm", raw: "25mm" }
      },
      object: {
        version: "ir-object-model-v1",
        objectKind: "image",
        size: {
          width: { value: 120, unit: "mm", raw: "120mm" },
          height: { value: 180, unit: "unknown", raw: 180 }
        },
        relationship: {
          targetKind: "none"
        }
      }
    });
    expect(style.unsupported).toContain("image media target is missing");
    expect(style.unsupported).toContain(
      "numeric object units remain unknown unless source attrs include a unit"
    );
  });

  it("document 전체 style view를 block index와 함께 만든다", () => {
    const sections = normalizeIRDocumentStyles(listTableReadinessIR);
    const listStyle = normalizeIRBlockStyle(
      listTableReadinessIR.sections[0].blocks[0]
    );

    expect(sections[0]).toMatchObject({
      sectionIndex: 0,
      sectionId: "list-table",
      blocks: [
        {
          blockIndex: 0,
          blockType: "list"
        },
        {
          blockIndex: 1,
          blockType: "table"
        }
      ]
    });
    expect(sections[0].blocks[0].style).toEqual(listStyle);
    expect(Object.isFrozen(sections)).toBe(true);
    expect(Object.isFrozen(sections[0].blocks)).toBe(true);
  });
});
