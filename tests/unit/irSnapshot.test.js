import { describe, expect, it } from "vitest";
import {
  fromEditorStateToIR,
  fromProseMirrorDocToIR
} from "../../app/LIB/ir/fromProseMirror";

const samplePmDoc = {
  type: "doc",
  attrs: { sectionBreakType: "nextPage" },
  content: [
    {
      type: "heading",
      attrs: {
        level: 1,
        headingId: "h-1",
        textAlign: "left",
        indent: 18,
        indentLevel: 1,
        docxParagraphStyleId: "DockitHeadingStyle",
        docxParagraphStyleName: "Dockit heading",
        keepWithNext: true
      },
      content: [{ type: "text", text: "제목" }]
    },
    {
      type: "paragraph",
      attrs: {
        textAlign: "justify",
        lineHeight: "1.5",
        indent: 24,
        indentLevel: 2,
        wordBreak: "keep-all",
        docxParagraphSpacingBefore: 240,
        docxParagraphSpacingAfter: 120,
        docxParagraphSpacingLine: 276,
        docxParagraphSpacingLineRule: "auto",
        docxParagraphStyleId: "DockitBodyStyle",
        docxParagraphStyleName: "Dockit body",
        docxParagraphTabs: [
          { positionTwips: 720, type: "left", leader: null }
        ],
        keepLinesTogether: true,
        widows: 3,
        orphans: 2
      },
      content: [
        { type: "text", text: "안녕하세요 ", marks: [{ type: "bold" }] },
        {
          type: "text",
          text: "Dockit",
          marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }]
        },
        {
          type: "text",
          text: " 코드",
          marks: [{ type: "code" }]
        }
      ]
    },
    {
      type: "table",
      attrs: {
        borderColor: "#006d75",
        borderWidth: 1,
        cellPaddingTop: 8,
        cellPaddingBottom: 8,
        indent: 12,
        indentLevel: 1,
        headerRowRepeat: true,
        allowRowSplit: false
      },
      content: [
        {
          type: "table_row",
          attrs: { height: 12.3 },
          content: [
            {
              type: "table_header",
              attrs: {
                colspan: 1,
                rowspan: 1,
                verticalAlign: "middle",
                wordBreak: "keep-all"
              },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "헤더" }]
                }
              ]
            },
            {
              type: "table_cell",
              attrs: {
                colspan: 1,
                rowspan: 1,
                verticalAlign: "top",
                backgroundColor: "#f5f5f5",
                wordBreak: "break-word"
              },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "내용" }]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      type: "image",
      attrs: {
        src: "https://example.com/a.png",
        objectId: "img-1",
        width: 300,
        flowMode: "floating",
        anchorMode: "page"
      }
    }
  ]
};

describe("fromProseMirrorDocToIR", () => {
  it("IR v1.1 read-only snapshot과 pagination semantics를 생성한다", () => {
    const ir = fromProseMirrorDocToIR(samplePmDoc, {
      pageSettings: {
        widthMm: 210,
        heightMm: 297,
        paddingTopMm: 20,
        paddingBottomMm: 20,
        paddingLeftMm: 25,
        paddingRightMm: 25,
        lineHeight: 1.5
      }
    });

    expect(ir.type).toBe("document");
    expect(ir.version).toBe("ir-v1.1-draft");
    expect(ir.sections).toHaveLength(1);
    expect(ir.sections[0].breakType).toBe("nextPage");

    expect(ir.sections[0].blocks[0]).toMatchObject({
      type: "heading",
      keepWithNext: true,
      attrs: {
        level: 1,
        headingId: "h-1",
        indent: 18,
        indentLevel: 1,
        docxParagraphStyleId: "DockitHeadingStyle",
        docxParagraphStyleName: "Dockit heading"
      }
    });

    expect(ir.sections[0].blocks[1]).toMatchObject({
      type: "paragraph",
      keepLinesTogether: true,
      widows: 3,
      orphans: 2,
      attrs: {
        wordBreak: "keep-all",
        indent: 24,
        indentLevel: 2,
        docxParagraphSpacingBefore: 240,
        docxParagraphSpacingAfter: 120,
        docxParagraphSpacingLine: 276,
        docxParagraphSpacingLineRule: "auto",
        docxParagraphStyleId: "DockitBodyStyle",
        docxParagraphStyleName: "Dockit body",
        docxParagraphTabs: [
          { positionTwips: 720, type: "left", leader: null }
        ]
      }
    });
    expect(ir.sections[0].blocks[1].runs[2].marks[0].type).toBe("code");

    expect(ir.sections[0].blocks[2]).toMatchObject({
      type: "table",
      headerRowRepeat: true,
      allowRowSplit: false,
      attrs: {
        indent: 12,
        indentLevel: 1
      }
    });

    expect(ir.sections[0].blocks[2].rows[0].cells[0].attrs.wordBreak).toBe(
      "keep-all"
    );
    expect(ir.sections[0].blocks[2].rows[0].cells[1].attrs.wordBreak).toBe(
      "break-word"
    );

    expect(ir.sections[0].blocks[3]).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "floating",
      anchorMode: "page"
    });

    expect(ir.metadata.warnings).toEqual([]);
  });

  it("editorState 래퍼에서도 동일한 IR을 생성한다", () => {
    const editorState = {
      doc: {
        toJSON: () => samplePmDoc
      }
    };

    const ir = fromEditorStateToIR(editorState, {
      extractedAt: "2026-04-22T00:00:00.000Z",
      extractorVersion: "test-run"
    });

    expect(ir.metadata.extractedAt).toBe("2026-04-22T00:00:00.000Z");
    expect(ir.metadata.extractorVersion).toBe("test-run");
    expect(ir.sections[0].breakType).toBe("nextPage");
    expect(ir.sections[0].blocks[3].flowMode).toBe("floating");
  });
});
