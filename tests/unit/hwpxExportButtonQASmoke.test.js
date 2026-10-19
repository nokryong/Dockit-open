import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromEditorStateToIR } from "../../app/LIB/ir/fromProseMirror";
import {
  createHWPXV0ExportInput,
  exportIRToHWPXV0,
  summarizeHWPXV0Warnings
} from "../../app/LIB/ir/hwpxMinimalExport";
import {
  HWPX_V0_MIME_TYPE,
  createHWPXV0DownloadFileName,
  createHWPXV0PageSettingsFromDocSetting,
  isHWPXV0PackageBytes
} from "../../app/LIB/utils/hwpxExportButtonUtils";

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

const createEditorState = (pmDoc) => ({
  doc: {
    toJSON: () => pmDoc
  }
});

const exportSmokeDoc = (pmDoc, title = "QA 문서") => {
  const ir = fromEditorStateToIR(createEditorState(pmDoc), {
    pageSettings: createHWPXV0PageSettingsFromDocSetting({
      pageWidth: 210,
      pageHeight: 297,
      paddingTop: 25,
      paddingBottom: 25,
      paddingLeft: 25,
      paddingRight: 25,
      lineHeight: 1.5
    }),
    extractedAt: "2026-05-10T00:00:00.000Z",
    extractorVersion: "dockit-hwpx-export-button-v0-qa-smoke"
  });
  const result = exportIRToHWPXV0(createHWPXV0ExportInput(ir));

  return {
    fileName: createHWPXV0DownloadFileName(title),
    ir,
    result,
    entries: readZipEntries(result.packageBytes),
    warningSummary: summarizeHWPXV0Warnings(result.warnings)
  };
};

describe("HWPX export button v0 QA smoke", () => {
  it("빈 문서도 HWPX package로 내려받을 수 있는 구조를 만든다", () => {
    const smoke = exportSmokeDoc({
      type: "doc",
      content: [{ type: "paragraph" }]
    });

    expect(smoke.fileName).toBe("QA 문서.hwpx");
    expect(HWPX_V0_MIME_TYPE).toBe("application/hwp+zip");
    expect(isHWPXV0PackageBytes(smoke.result.packageBytes)).toBe(true);
    expect(Object.keys(smoke.entries)).toContain("Contents/section0.xml");
    expect(smoke.warningSummary.total).toBe(0);
  });

  it("긴 문단은 section XML에 유지한다", () => {
    const longText = `긴 문단 ${"Dockit HWPX QA ".repeat(180)}`;
    const smoke = exportSmokeDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: longText }]
        }
      ]
    });

    expect(isHWPXV0PackageBytes(smoke.result.packageBytes)).toBe(true);
    expect(smoke.entries["Contents/section0.xml"]).toContain("긴 문단");
    expect(smoke.entries["Preview/PrvText.txt"]).toContain("Dockit HWPX QA");
  });

  it("ordered/bullet list는 HWPX native numbering 경로로 export한다", () => {
    const smoke = exportSmokeDoc({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "세 번째 항목" }]
                }
              ]
            }
          ]
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "불릿 항목" }]
                }
              ]
            }
          ]
        }
      ]
    });

    expect(smoke.entries["Contents/header.xml"]).toContain("<hh:numberings");
    expect(smoke.entries["Contents/header.xml"]).toContain("<hh:bullets");
    expect(smoke.entries["Contents/section0.xml"]).toContain("세 번째 항목");
    expect(smoke.entries["Contents/section0.xml"]).toContain("불릿 항목");
  });

  it("basic table은 table XML과 borderFill을 만든다", () => {
    const smoke = exportSmokeDoc({
      type: "doc",
      content: [
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
                      content: [{ type: "text", text: "표 셀" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    expect(smoke.entries["Contents/section0.xml"]).toContain("<hp:tbl");
    expect(smoke.entries["Contents/section0.xml"]).toContain("표 셀");
    expect(smoke.entries["Contents/header.xml"]).toContain("<hh:borderFill");
  });

  it("embedded PNG image는 BinData entry와 image reference를 만든다", () => {
    const smoke = exportSmokeDoc({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: imageFixtureDataUri,
            objectId: "qa-image",
            fileName: "dockit-image-fixture.png",
            mimeType: "image/png",
            width: "16px",
            height: "16px",
            altText: "QA image"
          }
        }
      ]
    });

    expect(Object.keys(smoke.entries)).toContain("BinData/dockit-image-fixture.png");
    expect(smoke.entries["Contents/content.hpf"]).toContain(
      'media-type="image/png"'
    );
    expect(smoke.entries["Contents/section0.xml"]).toContain("<hp:pic");
    expect(smoke.entries["Contents/section0.xml"]).toContain(
      '<hc:img binaryItemIDRef="image1"'
    );
  });
});
