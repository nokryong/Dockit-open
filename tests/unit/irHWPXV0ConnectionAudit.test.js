import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromEditorStateToIR } from "../../app/LIB/ir/fromProseMirror";
import {
  createHWPXV0ExportInput,
  exportIRToHWPXV0,
  summarizeHWPXV0Warnings
} from "../../app/LIB/ir/hwpxMinimalExport";

const decoder = new TextDecoder();
const imageFixtureBytes = readFileSync(
  path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "hwpx",
    "media",
    "dockit-image-fixture.png"
  )
);
const imageFixtureDataUri = `data:image/png;base64,${imageFixtureBytes.toString(
  "base64"
)}`;

const readZipEntries = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = {};
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);

    if (signature !== 0x04034b50) {
      break;
    }

    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const entryPath = decoder.decode(bytes.slice(nameStart, nameEnd));
    const data = bytes.slice(dataStart, dataEnd);

    entries[entryPath] = method === 0 ? decoder.decode(data) : data;
    offset = dataEnd;
  }

  return entries;
};

const dockitDocSetting = {
  pageWidth: 210,
  pageHeight: 297,
  paddingTop: 25,
  paddingBottom: 25,
  paddingLeft: 25,
  paddingRight: 25,
  lineHeight: 1.5
};

const toIRPageSettings = (setting) => ({
  widthMm: setting.pageWidth,
  heightMm: setting.pageHeight,
  paddingTopMm: setting.paddingTop,
  paddingBottomMm: setting.paddingBottom,
  paddingLeftMm: setting.paddingLeft,
  paddingRightMm: setting.paddingRight,
  lineHeight: setting.lineHeight
});

const createEditorState = (pmDoc) => ({
  doc: {
    toJSON: () => pmDoc
  }
});

const supportedDockitPmDoc = {
  type: "doc",
  attrs: { sectionBreakType: "continuous" },
  content: [
    {
      type: "heading",
      attrs: { level: 1, headingId: "audit-heading", textAlign: "left" },
      content: [{ type: "text", text: "Audit heading" }]
    },
    {
      type: "paragraph",
      attrs: { textAlign: "justify", lineHeight: "1.5" },
      content: [
        { type: "text", text: "Styled ", marks: [{ type: "bold" }] },
        {
          type: "text",
          text: "paragraph",
          marks: [{ type: "textStyle", attrs: { color: "#336699" } }]
        }
      ]
    },
    {
      type: "orderedList",
      attrs: { start: 2 },
      content: [
        {
          type: "listItem",
          attrs: { value: 2 },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Numbered item" }]
            }
          ]
        }
      ]
    },
    {
      type: "table",
      attrs: {
        borderColor: "#333333",
        borderStyle: "solid",
        borderWidth: "1pt"
      },
      content: [
        {
          type: "table_row",
          content: [
            {
              type: "table_cell",
              attrs: {
                colspan: 1,
                rowspan: 1,
                colwidth: [120],
                borderColor: "#333333",
                borderStyle: "solid",
                borderWidth: "1pt"
              },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Table cell" }]
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
        src: imageFixtureDataUri,
        objectId: "embedded-image",
        fileName: "dockit-image-fixture.png",
        mimeType: "image/png",
        width: "16px",
        height: "16px",
        altText: "Embedded image"
      }
    }
  ]
};

const fallbackDockitPmDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Fallback audit" }]
    },
    {
      type: "image",
      attrs: {
        src: "https://example.com/remote.png",
        objectId: "remote-image",
        width: "320px",
        height: "180px"
      }
    },
    {
      type: "columnBlock",
      attrs: { columnCount: 2 },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Unsupported columns" }]
        }
      ]
    }
  ]
};

describe("Dockit document to IR to HWPX v0 connection audit", () => {
  it("현재 editor state에서 IR snapshot과 HWPX v0 input까지 dry-run 한다", () => {
    const ir = fromEditorStateToIR(createEditorState(supportedDockitPmDoc), {
      pageSettings: toIRPageSettings(dockitDocSetting),
      extractedAt: "2026-05-09T00:00:00.000Z",
      extractorVersion: "dockit-hwpx-v0-connection-audit"
    });
    const input = createHWPXV0ExportInput(ir);
    const result = exportIRToHWPXV0(input);
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const summary = summarizeHWPXV0Warnings(result.warnings);

    expect(ir.metadata.source).toMatchObject({
      editor: "tiptap-prosemirror",
      mode: "readonly-snapshot"
    });
    expect(ir.sections[0].pageSettings).toMatchObject({
      widthMm: 210,
      heightMm: 297,
      paddingTopMm: 25
    });
    expect(ir.sections[0].blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "table",
      "object"
    ]);
    expect(input.blockViews.map((view) => view.blockType)).toEqual([
      "heading",
      "paragraph",
      "list",
      "table",
      "object"
    ]);
    expect(input.listNumberingModels).toHaveLength(1);
    expect(input.tableModels).toHaveLength(1);
    expect(input.objectModels).toHaveLength(1);
    expect(header).toContain('<hh:paraHead start="2"');
    expect(header).toContain("<hh:borderFill");
    expect(section).toContain("Audit heading");
    expect(section).toContain("Styled ");
    expect(section).toContain("Numbered item");
    expect(section).not.toContain("2. Numbered item");
    expect(section).toContain("<hp:tbl");
    expect(section).toContain("<hp:pic");
    expect(section).toContain('<hc:img binaryItemIDRef="image1"');
    expect(Object.keys(entries)).toContain("BinData/dockit-image-fixture.png");
    expect(summary).toMatchObject({
      total: 0,
      warningCount: 0,
      blockedCount: 0,
      items: []
    });
  });

  it("미지원 object/block fallback은 사용자 표시용 warning summary로 묶을 수 있다", () => {
    const ir = fromEditorStateToIR(createEditorState(fallbackDockitPmDoc), {
      pageSettings: toIRPageSettings(dockitDocSetting)
    });
    const result = exportIRToHWPXV0(createHWPXV0ExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const section = entries["Contents/section0.xml"];
    const summary = summarizeHWPXV0Warnings(result.warnings);

    expect(ir.metadata.warnings).toEqual([
      "지원하지 않는 block node: columnBlock"
    ]);
    expect(section).toContain("[Object placeholder: image remote-image]");
    expect(section).toContain("Unsupported columns");
    expect(section).not.toContain("[Unsupported block: columnBlock]");
    expect(summary).toMatchObject({
      total: 2,
      warningCount: 1,
      blockedCount: 1
    });
    expect(summary.items).toEqual([
      expect.objectContaining({
        code: "object-placeholder",
        severity: "warning",
        count: 1,
        visiblePlaceholder: true
      }),
      expect.objectContaining({
        code: "unsupported-block",
        severity: "blocked",
        count: 1,
        visiblePlaceholder: true
      })
    ]);
    expect(summary.items.map((item) => item.fallback)).toEqual([
      "Unsupported object media is written as a visible placeholder paragraph.",
      "Unsupported top-level IR block preserves raw text when available, otherwise writes a visible placeholder."
    ]);
  });
});
