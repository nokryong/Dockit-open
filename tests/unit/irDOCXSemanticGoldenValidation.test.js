import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseStringPromise } from "xml2js";
import { describe, expect, it } from "vitest";
import {
  DOCX_MINIMAL_WARNING_CONTRACT,
  createDOCXMinimalExportInput,
  exportIRToMinimalDOCX
} from "../../app/LIB/ir/docxMinimalExport";
import expectations from "../fixtures/docx/semanticGoldenExpectations.json";
import {
  listTableReadinessIR,
  objectUnsupportedReadinessIR,
  paragraphHeadingReadinessIR
} from "./fixtures/irExportReadinessFixtures";

const decoder = new TextDecoder();
const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const REQUIRED_ENTRIES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels",
  "word/numbering.xml",
  "word/styles.xml",
  "docProps/core.xml",
  "docProps/app.xml"
];

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

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

    entries[entryPath] =
      method === 0 && !entryPath.startsWith("word/media/")
        ? decoder.decode(data)
        : data;
    offset = dataEnd;
  }

  return entries;
};

const decodeXmlText = (value) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const extractDocumentText = (documentXml) =>
  Array.from(documentXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
    .map((match) => decodeXmlText(match[1]))
    .join("");

const countTags = (xml, tagName) =>
  (xml.match(new RegExp(`<${tagName}(?:\\s|>|/)`, "g")) || []).length;

const getHeadingStyles = (documentXml) =>
  Array.from(documentXml.matchAll(/<w:pStyle w:val="([^"]+)"/g)).map(
    (match) => match[1]
  );

const createStyledTextIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "paragraph",
          attrs: {},
          runs: [
            { type: "textRun", text: "Bold", marks: [{ type: "bold" }] },
            { type: "textRun", text: " Italic", marks: [{ type: "italic" }] },
            {
              type: "textRun",
              text: " Underline",
              marks: [{ type: "underline" }]
            },
            { type: "textRun", text: " Strike", marks: [{ type: "strike" }] },
            {
              type: "textRun",
              text: " Color",
              marks: [{ type: "textStyle", attrs: { color: "#336699" } }]
            },
            {
              type: "textRun",
              text: " Link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }]
            },
            {
              type: "textRun",
              text: " Sup",
              marks: [{ type: "superscript" }]
            },
            {
              type: "textRun",
              text: " Sub",
              marks: [{ type: "subscript" }]
            }
          ]
        }
      ]
    }
  ]
});

const createReadinessSmokeIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        ...paragraphHeadingReadinessIR.sections[0].blocks,
        ...listTableReadinessIR.sections[0].blocks,
        ...objectUnsupportedReadinessIR.sections[0].blocks
      ]
    }
  ]
});

const createLinkPolicyIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "paragraph",
          attrs: {},
          runs: [
            {
              type: "textRun",
              text: "Website",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com/dockit?x=1&y=2",
                    target: "_blank",
                    title: "Dockit"
                  }
                }
              ]
            },
            {
              type: "textRun",
              text: " Mail",
              marks: [
                { type: "link", attrs: { href: "mailto:hello@example.com" } }
              ]
            },
            {
              type: "textRun",
              text: " Internal",
              marks: [{ type: "link", attrs: { href: "#local" } }]
            }
          ]
        }
      ]
    }
  ]
});

const createListPolicyIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "list",
          listType: "ordered",
          attrs: { start: 5 },
          items: [
            {
              type: "listItem",
              attrs: {},
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [
                    { type: "textRun", text: "Starts at five", marks: [] }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "list",
          listType: "bullet",
          attrs: {},
          items: [
            {
              type: "listItem",
              attrs: {},
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [{ type: "textRun", text: "Bullet item", marks: [] }]
                }
              ]
            }
          ]
        },
        {
          type: "list",
          listType: "task",
          attrs: {},
          items: [
            {
              type: "listItem",
              attrs: { checked: false },
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [{ type: "textRun", text: "Task item", marks: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});

const createEmbeddedImageIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "object",
          objectType: "image",
          flowMode: "inline",
          anchorMode: "inline",
          attrs: {
            src: PNG_DATA_URI,
            width: 96,
            height: 48,
            altText: "Embedded PNG"
          },
          children: []
        }
      ]
    }
  ]
});

const fixtureMap = {
  paragraphHeadingReadinessIR,
  styledTextIR: createStyledTextIR(),
  listTableReadinessIR,
  objectUnsupportedReadinessIR,
  readinessSmokeIR: createReadinessSmokeIR(),
  linkPolicyIR: createLinkPolicyIR(),
  listPolicyIR: createListPolicyIR(),
  embeddedImageIR: createEmbeddedImageIR()
};

const maybeWriteGeneratedDOCX = (id, packageBytes) => {
  const outputDir = process.env.DOCX_SEMANTIC_FIXTURE_OUT;

  if (!outputDir) {
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, `${id}.docx`), packageBytes);
};

describe("DOCX semantic golden validation", () => {
  it("generated DOCX packages preserve expected semantic document.xml signals", async () => {
    for (const fixture of expectations) {
      const irDocument = fixtureMap[fixture.source];

      expect(irDocument, `missing IR fixture ${fixture.source}`).toBeTruthy();

      const result = exportIRToMinimalDOCX(
        createDOCXMinimalExportInput(irDocument)
      );
      const entries = readZipEntries(result.packageBytes);
      const documentXml = entries["word/document.xml"];
      const documentText = extractDocumentText(documentXml);

      maybeWriteGeneratedDOCX(fixture.id, result.packageBytes);

      expect([...result.packageBytes.slice(0, 4)]).toEqual([
        0x50, 0x4b, 0x03, 0x04
      ]);
      expect(Object.keys(entries)).toEqual(expect.arrayContaining(REQUIRED_ENTRIES));
      REQUIRED_ENTRIES.forEach((entryPath) => {
        expect(result.packageSummary.requiredEntries[entryPath] ?? true).toBe(true);
      });

      await expect(parseStringPromise(entries["[Content_Types].xml"])).resolves.toBeTruthy();
      await expect(parseStringPromise(entries["_rels/.rels"])).resolves.toBeTruthy();
      await expect(parseStringPromise(documentXml)).resolves.toBeTruthy();
      await expect(parseStringPromise(entries["word/_rels/document.xml.rels"])).resolves.toBeTruthy();
      await expect(parseStringPromise(entries["word/numbering.xml"])).resolves.toBeTruthy();
      await expect(parseStringPromise(entries["word/styles.xml"])).resolves.toBeTruthy();
      await expect(parseStringPromise(entries["docProps/core.xml"])).resolves.toBeTruthy();
      await expect(parseStringPromise(entries["docProps/app.xml"])).resolves.toBeTruthy();

      fixture.expectedText.forEach((text) => {
        expect(documentText).toContain(text);
      });
      fixture.forbiddenText.forEach((text) => {
        expect(documentXml).not.toContain(text);
      });
      fixture.headingStyles.forEach((styleId) => {
        expect(getHeadingStyles(documentXml)).toContain(styleId);
      });
      fixture.requiredRunXml.forEach((xml) => {
        expect(documentXml).toContain(xml);
      });
      (fixture.requiredNumberingXml ?? []).forEach((xml) => {
        expect(entries["word/numbering.xml"]).toContain(xml);
      });
      expect(countTags(documentXml, "w:hyperlink")).toBe(
        fixture.documentCounts.hyperlink ?? 0
      );
      expect(countTags(documentXml, "w:numPr")).toBe(
        fixture.documentCounts.numPr ?? 0
      );
      expect(countTags(documentXml, "w:drawing")).toBe(
        fixture.documentCounts.drawing ?? 0
      );
      (fixture.requiredDocumentXml ?? []).forEach((xml) => {
        expect(documentXml).toContain(xml);
      });
      (fixture.mediaEntries ?? []).forEach((entryPath) => {
        expect(entries[entryPath]).toBeInstanceOf(Uint8Array);
      });
      (fixture.hyperlinkTargets ?? []).forEach((target) => {
        expect(entries["word/_rels/document.xml.rels"]).toContain(
          `Target="${escapeXml(target)}"`
        );
      });
      if ((fixture.hyperlinkTargets ?? []).length > 0) {
        expect(entries["word/_rels/document.xml.rels"]).toContain(
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"'
        );
        expect(entries["word/_rels/document.xml.rels"]).toContain(
          'TargetMode="External"'
        );
      }
      expect(countTags(documentXml, "w:tbl")).toBe(fixture.documentCounts.table);
      expect(countTags(documentXml, "w:tr")).toBe(fixture.documentCounts.row);
      expect(countTags(documentXml, "w:tc")).toBe(fixture.documentCounts.cell);
      expect(result.warnings.map((warning) => warning.code)).toEqual(
        fixture.warningCodes
      );
      result.warnings.forEach((warning) => {
        expect(DOCX_MINIMAL_WARNING_CONTRACT[warning.code]).toBeDefined();
        expect(warning.severity).toBe(
          DOCX_MINIMAL_WARNING_CONTRACT[warning.code].severity
        );
      });
    }
  });
});
