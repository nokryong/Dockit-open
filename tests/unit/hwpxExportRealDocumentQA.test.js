import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromEditorStateToIR } from "../../app/LIB/ir/fromProseMirror";
import {
  createHWPXV0ExportInput,
  exportIRToHWPXV0,
  summarizeHWPXV0Warnings
} from "../../app/LIB/ir/hwpxMinimalExport";
import {
  buildHWPXV0ExportNotice,
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

const exportRealisticDoc = (sample) => {
  const ir = fromEditorStateToIR(createEditorState(sample.pmDoc), {
    pageSettings: createHWPXV0PageSettingsFromDocSetting({
      pageWidth: 210,
      pageHeight: 297,
      paddingTop: 20,
      paddingBottom: 20,
      paddingLeft: 22,
      paddingRight: 22,
      lineHeight: 1.55
    }),
    extractedAt: "2026-05-13T00:00:00.000Z",
    extractorVersion: "dockit-hwpx-export-v0-real-document-qa"
  });
  const result = exportIRToHWPXV0(createHWPXV0ExportInput(ir));
  const warningSummary = summarizeHWPXV0Warnings(result.warnings);

  return {
    fileName: createHWPXV0DownloadFileName(sample.title),
    entries: readZipEntries(result.packageBytes),
    ir,
    result,
    warningSummary,
    notice: buildHWPXV0ExportNotice({
      hwpxWarningSummary: warningSummary,
      irWarningCount: ir.metadata.warnings.length
    })
  };
};

const maybeWriteQAArtifacts = (sample, smoke) => {
  const outputDir = process.env.HWPX_REAL_DOCUMENT_QA_OUT;

  if (!outputDir) {
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  const baseName = smoke.fileName.replace(/\.hwpx$/i, "");
  writeFileSync(path.join(outputDir, smoke.fileName), smoke.result.packageBytes);
  writeFileSync(
    path.join(outputDir, `${baseName}.warnings.json`),
    `${JSON.stringify(
      {
        title: sample.title,
        notice: smoke.notice,
        irWarningCount: smoke.ir.metadata.warnings.length,
        hwpxWarnings: smoke.result.warnings
      },
      null,
      2
    )}\n`
  );
};

const paragraph = (text, attrs) => ({
  type: "paragraph",
  attrs,
  content: [{ type: "text", text }]
});

const textCell = (text, attrs = {}) => ({
  type: "table_cell",
  attrs: {
    colspan: 1,
    rowspan: 1,
    colwidth: [140],
    borderColor: "#333333",
    borderStyle: "solid",
    borderWidth: "1pt",
    ...attrs
  },
  content: [paragraph(text)]
});

const table = (rows, attrs = {}) => ({
  type: "table",
  attrs: {
    borderColor: "#333333",
    borderStyle: "solid",
    borderWidth: "1pt",
    ...attrs
  },
  content: rows.map((cells) => ({
    type: "table_row",
    content: cells
  }))
});

const samples = [
  {
    title: "주간 회의록 2026-05-13",
    expectedToastType: "success",
    expectedTexts: ["주간 회의록", "결정 사항", "담당자별 액션"],
    pmDoc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "주간 회의록" }]
        },
        paragraph("일시: 2026-05-13 10:00 / 참석: 기획, 개발, 디자인"),
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            {
              type: "listItem",
              content: [paragraph("결정 사항: HWPX v0는 열림 품질을 우선한다.")]
            },
            {
              type: "listItem",
              content: [paragraph("담당자별 액션: QA 문서와 warning 기준을 갱신한다.")]
            }
          ]
        }
      ]
    }
  },
  {
    title: "프로젝트 제안서 초안",
    expectedToastType: "success",
    expectedTexts: ["프로젝트 제안서", "핵심 목표", "리스크"],
    pmDoc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "프로젝트 제안서" }]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "핵심 목표: " },
            {
              type: "text",
              text: "문서 호환성 검증",
              marks: [{ type: "bold" }, { type: "highlight", attrs: { color: "#fff59d" } }]
            }
          ]
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph("리스크: 복잡한 서식은 v0에서 단순화")] },
            { type: "listItem", content: [paragraph("범위: heading, list, table, embedded PNG")] }
          ]
        }
      ]
    }
  },
  {
    title: "월간 비용 정산표",
    expectedToastType: "info",
    expectedWarningCodes: ["table-merge-layout-warning"],
    expectedTexts: ["월간 비용 정산표", "항목", "합계", "1,200,000원"],
    pmDoc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "월간 비용 정산표" }]
        },
        table([
          [textCell("항목", { colspan: 2 }), textCell("금액")],
          [textCell("클라우드"), textCell("운영"), textCell("1,200,000원")],
          [textCell("합계", { colspan: 2 }), textCell("1,200,000원")]
        ])
      ]
    }
  },
  {
    title: "제품 이미지 브리프",
    expectedToastType: "success",
    expectedTexts: ["제품 이미지 브리프", "대표 이미지"],
    expectedEntries: ["BinData/dockit-image-fixture.png"],
    pmDoc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "제품 이미지 브리프" }]
        },
        paragraph("대표 이미지"),
        {
          type: "image",
          attrs: {
            src: imageFixtureDataUri,
            objectId: "product-image",
            fileName: "dockit-image-fixture.png",
            mimeType: "image/png",
            width: "16px",
            height: "16px",
            altText: "제품 이미지"
          }
        }
      ]
    }
  },
  {
    title: "링크 포함 안내문",
    expectedToastType: "success",
    expectedTexts: ["링크 포함 안내문", "외부 자료"],
    expectedHyperlink: "https://example.com/reference",
    pmDoc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "링크 포함 안내문" }]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "참고: " },
            {
              type: "text",
              text: "외부 자료",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/reference" }
                },
                { type: "underline" },
                { type: "textStyle", attrs: { color: "#336699" } }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    title: "리서치 노트 - 외부 자료",
    expectedToastType: "warning",
    expectedWarningCodes: ["object-placeholder", "semantic-block-fallback"],
    expectedTexts: [
      "리서치 노트",
      "[Object placeholder: image remote-chart]",
      "console.log('unsupported');"
    ],
    pmDoc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "리서치 노트" }]
        },
        {
          type: "image",
          attrs: {
            src: "https://example.com/chart.png",
            objectId: "remote-chart",
            fileName: "chart.png",
            mimeType: "image/png",
            altText: "외부 차트"
          }
        },
        {
          type: "codeBlock",
          content: [{ type: "text", text: "console.log('unsupported');" }]
        }
      ]
    }
  }
];

describe("HWPX export v0 real document QA samples", () => {
  it.each(samples)("$title sample matches the v0 export warning contract", (sample) => {
    const smoke = exportRealisticDoc(sample);
    const sectionXml = smoke.entries["Contents/section0.xml"];
    const previewText = smoke.entries["Preview/PrvText.txt"];
    const warningCodes = smoke.result.warnings.map((warning) => warning.code);

    maybeWriteQAArtifacts(sample, smoke);

    expect(smoke.fileName).toBe(`${sample.title}.hwpx`);
    expect(isHWPXV0PackageBytes(smoke.result.packageBytes)).toBe(true);
    expect(Object.keys(smoke.entries)).toEqual(
      expect.arrayContaining([
        "mimetype",
        "version.xml",
        "META-INF/container.xml",
        "Contents/content.hpf",
        "Contents/header.xml",
        "Contents/section0.xml",
        "Preview/PrvText.txt"
      ])
    );
    expect(smoke.notice.toastType).toBe(sample.expectedToastType);

    for (const text of sample.expectedTexts) {
      expect(`${sectionXml}\n${previewText}`).toContain(text);
    }

    for (const entry of sample.expectedEntries || []) {
      expect(Object.keys(smoke.entries)).toContain(entry);
    }

    if (sample.expectedHyperlink) {
      expect(sectionXml).toContain('type="HYPERLINK"');
      expect(sectionXml).toContain(
        `<hp:stringParam name="Command">${sample.expectedHyperlink.replace(
          ":",
          "\\:"
        )};1;0;0;</hp:stringParam>`
      );
      expect(warningCodes).not.toContain("run-style-fallback");
      expect(warningCodes).not.toContain("link-attribute-fallback");
    }

    for (const code of sample.expectedWarningCodes || []) {
      expect(warningCodes).toContain(code);
    }

    if (sample.title === "리서치 노트 - 외부 자료") {
      expect(sectionXml).not.toContain("[Unsupported block: codeBlock]");
      expect(sectionXml).toContain('paraPrIDRef="100"');
    }
  });
});
