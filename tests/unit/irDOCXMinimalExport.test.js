import { parseStringPromise } from "xml2js";
import { describe, expect, it } from "vitest";
import {
  DOCX_MINIMAL_WARNING_CONTRACT,
  createDOCXMinimalExportInput,
  exportIRToMinimalDOCX
} from "../../app/LIB/ir/docxMinimalExport";
import { importDOCXToIR } from "../../app/LIB/ir/docxImport";
import {
  listTableReadinessIR,
  objectUnsupportedReadinessIR,
  paragraphHeadingReadinessIR
} from "./fixtures/irExportReadinessFixtures";

const decoder = new TextDecoder();
const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const JPEG_DATA_URI = "data:image/jpeg;base64,/9j/2Q==";

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
    const path = decoder.decode(bytes.slice(nameStart, nameEnd));
    const data = bytes.slice(dataStart, dataEnd);

    entries[path] =
      method === 0 && !path.startsWith("word/media/")
        ? decoder.decode(data)
        : data;
    offset = dataEnd;
  }

  return entries;
};

const createStyledIR = () => ({
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

const createRowspanTableIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
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
                    rowspan: 2,
                    colwidth: [96]
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "A1", marks: [] }]
                    }
                  ]
                },
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {
                    colwidth: [192]
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "B1", marks: [] }]
                    }
                  ]
                }
              ]
            },
            {
              type: "tableRow",
              attrs: {},
              cells: [
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {
                    colwidth: [192]
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "B2", marks: [] }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});

const createParagraphLayoutIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "paragraph",
          attrs: {
            docxParagraphSpacingBefore: 240,
            docxParagraphSpacingAfter: 120,
            docxParagraphSpacingLine: 276,
            docxParagraphSpacingLineRule: "auto",
            docxParagraphTabs: [
              { positionTwips: 720, type: "left", leader: null },
              { positionTwips: 3600, type: "decimal", leader: "dot" }
            ]
          },
          runs: [{ type: "textRun", text: "Paragraph layout", marks: [] }]
        },
        {
          type: "heading",
          attrs: {
            level: 2,
            docxParagraphSpacingAfter: 300,
            docxParagraphTabs: [
              { positionTwips: 2880, type: "center", leader: null }
            ]
          },
          runs: [{ type: "textRun", text: "Heading layout", marks: [] }]
        },
        {
          type: "list",
          listType: "ordered",
          attrs: {},
          items: [
            {
              type: "listItem",
              attrs: {},
              blocks: [
                {
                  type: "paragraph",
                  attrs: {
                    docxParagraphSpacingAfter: 60,
                    docxParagraphTabs: [
                      { positionTwips: 1440, type: "right", leader: null }
                    ]
                  },
                  runs: [{ type: "textRun", text: "List layout", marks: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});

const createParagraphStyleMetadataIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "paragraph",
          attrs: {
            docxParagraphStyleId: "DockitFixtureBodyStyle",
            docxParagraphStyleName: "Dockit body style",
            docxParagraphSpacingAfter: 120
          },
          runs: [{ type: "textRun", text: "Styled body", marks: [] }]
        },
        {
          type: "heading",
          attrs: {
            level: 2,
            docxParagraphStyleId: "DockitFixtureNamedHeading",
            docxParagraphStyleName: "Dockit heading style",
            docxParagraphTabs: [
              { positionTwips: 2880, type: "center", leader: null }
            ]
          },
          runs: [{ type: "textRun", text: "Styled heading", marks: [] }]
        },
        {
          type: "list",
          listType: "ordered",
          attrs: {},
          items: [
            {
              type: "listItem",
              attrs: {},
              blocks: [
                {
                  type: "paragraph",
                  attrs: {
                    docxParagraphStyleId: "DockitFixtureListParagraph",
                    docxParagraphStyleName: "Dockit list paragraph"
                  },
                  runs: [{ type: "textRun", text: "Styled list", marks: [] }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});

const inlineText = (block) =>
  block.runs.map((run) => (run.type === "textRun" ? run.text : "\n")).join("");

describe("DOCX minimal export foundation", () => {
  it("creates a minimal DOCX package with required OpenXML entries", async () => {
    const input = createDOCXMinimalExportInput(paragraphHeadingReadinessIR);
    const result = exportIRToMinimalDOCX(input);
    const entries = readZipEntries(result.packageBytes);

    expect([...result.packageBytes.slice(0, 4)]).toEqual([
      0x50, 0x4b, 0x03, 0x04
    ]);
    expect(Object.keys(entries).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/app.xml",
      "docProps/core.xml",
            "word/_rels/document.xml.rels",
            "word/document.xml",
            "word/numbering.xml",
            "word/styles.xml"
          ]);
    expect(result.packageSummary).toMatchObject({
      entryCount: 8,
      documentPart: "word/document.xml",
      hasStyles: true,
      hasCoreProperties: true,
      hasAppProperties: true
    });
    expect(Object.values(result.packageSummary.requiredEntries)).toEqual(
      expect.arrayContaining([true])
    );
    expect(Object.values(result.packageSummary.requiredEntries).every(Boolean)).toBe(
      true
    );

    await expect(parseStringPromise(entries["[Content_Types].xml"])).resolves.toBeTruthy();
    await expect(parseStringPromise(entries["_rels/.rels"])).resolves.toBeTruthy();
    await expect(parseStringPromise(entries["word/document.xml"])).resolves.toBeTruthy();
    await expect(parseStringPromise(entries["word/numbering.xml"])).resolves.toBeTruthy();
    await expect(parseStringPromise(entries["word/styles.xml"])).resolves.toBeTruthy();
  });

  it("exports paragraph and heading text with basic run properties", () => {
    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(paragraphHeadingReadinessIR)
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];

    expect(documentXml).toContain('w:pStyle w:val="Heading1"');
    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain("Export readiness");
    expect(documentXml).toContain("A long paragraph with an inline tag.");
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "docx-run-style-fallback"
    ]);
  });

  it("exports supported run marks and native hyperlink relationships", () => {
    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(createStyledIR())
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const relsXml = entries["word/_rels/document.xml.rels"];

    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain("<w:i/>");
    expect(documentXml).toContain('<w:u w:val="single"/>');
    expect(documentXml).toContain("<w:strike/>");
    expect(documentXml).toContain('<w:color w:val="336699"/>');
    expect(documentXml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(documentXml).toContain('<w:vertAlign w:val="subscript"/>');
    expect(documentXml).toContain("Link");
    expect(documentXml).toContain('<w:hyperlink r:id="rId3">');
    expect(relsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"'
    );
    expect(relsXml).toContain('Target="https://example.com"');
    expect(relsXml).toContain('TargetMode="External"');
    expect(result.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it("falls back unsupported DOCX hyperlink targets to visible text", () => {
    const irDocument = createStyledIR();
    irDocument.sections[0].blocks[0].runs = [
      {
        type: "textRun",
        text: "Internal",
        marks: [{ type: "link", attrs: { href: "#local" } }]
      },
      {
        type: "textRun",
        text: " File",
        marks: [{ type: "link", attrs: { href: "file:///tmp/source.docx" } }]
      }
    ];

    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(irDocument)
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const relsXml = entries["word/_rels/document.xml.rels"];

    expect(documentXml).not.toContain("<w:hyperlink");
    expect(documentXml).toContain("Internal");
    expect(documentXml).toContain("File");
    expect(relsXml).not.toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"'
    );
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "docx-link-target-fallback"
    ]);
  });

  it("warns when native DOCX hyperlinks omit unsupported link attrs", () => {
    const irDocument = createStyledIR();
    irDocument.sections[0].blocks[0].runs = [
      {
        type: "textRun",
        text: "Titled link",
        marks: [
          {
            type: "link",
            attrs: {
              href: "mailto:hello@example.com",
              target: "_blank",
              title: "Greeting"
            }
          }
        ]
      }
    ];

    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(irDocument)
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const relsXml = entries["word/_rels/document.xml.rels"];

    expect(documentXml).toContain('<w:hyperlink r:id="rId3">');
    expect(documentXml).toContain("Titled link");
    expect(relsXml).toContain(`Target="${escapeXml("mailto:hello@example.com")}"`);
    expect(relsXml).toContain('TargetMode="External"');
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "docx-link-attribute-fallback"
    ]);
  });

  it("exports native ordered list numbering and table XML with style fallback warnings", () => {
    const input = createDOCXMinimalExportInput(listTableReadinessIR);
    const result = exportIRToMinimalDOCX(input);
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const numberingXml = entries["word/numbering.xml"];
    const relsXml = entries["word/_rels/document.xml.rels"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(input).toMatchObject({
      tableCount: 1,
      objectCount: 0
    });
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("<w:tr>");
    expect(documentXml).toContain("<w:tc>");
    expect(documentXml).toContain("<w:tblBorders>");
    expect(documentXml).toContain("<w:tcBorders>");
    expect(documentXml).toContain('<w:top w:val="single" w:sz="8" w:space="0" w:color="333333"/>');
    expect(documentXml).toContain('<w:insideH w:val="single" w:sz="8" w:space="0" w:color="333333"/>');
    expect(documentXml).toContain('<w:shd w:val="clear" w:fill="F5F5F5"/>');
    expect(documentXml).toContain("<w:numPr>");
    expect(documentXml).toContain('<w:ilvl w:val="0"/>');
    expect(documentXml).toContain('<w:numId w:val="1"/>');
    expect(documentXml).not.toContain("3. ");
    expect(documentXml).toContain("Nested item");
    expect(documentXml).toContain("Merged cell");
    expect(numberingXml).toContain('<w:numFmt w:val="decimal"/>');
    expect(numberingXml).toContain('<w:startOverride w:val="3"/>');
    expect(relsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"'
    );
    expect(warningCodes).not.toContain("docx-list-fallback");
    expect(warningCodes).not.toContain("docx-table-border-fallback");
    expect(warningCodes).not.toContain("docx-table-fill-fallback");
    expect(warningCodes).not.toContain("docx-table-style-fallback");
  });

  it("exports IR rowspan and column widths as DOCX vMerge and tblGrid", () => {
    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(createRowspanTableIR())
    );
    const documentXml = readZipEntries(result.packageBytes)["word/document.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(documentXml).toContain("<w:tblGrid>");
    expect(documentXml).toContain('<w:gridCol w:w="1440"/>');
    expect(documentXml).toContain('<w:gridCol w:w="2880"/>');
    expect(documentXml).toContain('<w:vMerge w:val="restart"/>');
    expect(documentXml).toContain('<w:vMerge w:val="continue"/>');
    expect(documentXml.match(/<w:tr>/g)).toHaveLength(2);
    expect(documentXml.match(/<w:tc>/g)).toHaveLength(4);
    expect(documentXml.indexOf("A1")).toBeLessThan(documentXml.indexOf("B1"));
    expect(documentXml.indexOf('<w:vMerge w:val="continue"/>')).toBeLessThan(
      documentXml.indexOf("B2")
    );
    expect(warningCodes).not.toContain("docx-table-style-fallback");
  });

  it("roundtrips exported DOCX rowspan and widths through DOCX import", () => {
    const exportResult = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(createRowspanTableIR())
    );
    const importResult = importDOCXToIR(exportResult.packageBytes);
    const table = importResult.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );

    expect(table.rows[0].cells[0]).toMatchObject({
      attrs: {
        rowspan: 2,
        colwidth: [96]
      }
    });
    expect(table.rows[0].cells[1]).toMatchObject({
      attrs: {
        colwidth: [192]
      }
    });
    expect(table.rows[1].cells).toHaveLength(1);
    expect(table.rows[1].cells[0]).toMatchObject({
      attrs: {
        colwidth: [192]
      }
    });
    expect(
      importResult.warnings.map((warning) => warning.message).join("\n")
    ).not.toMatch(
      /vertically merged table cell was imported without rowspan fidelity/
    );
  });

  it("exports DOCX paragraph spacing and tab metadata", () => {
    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(createParagraphLayoutIR())
    );
    const documentXml = readZipEntries(result.packageBytes)["word/document.xml"];

    expect(documentXml).toContain(
      '<w:tabs><w:tab w:val="left" w:pos="720"/><w:tab w:val="decimal" w:pos="3600" w:leader="dot"/></w:tabs><w:spacing w:before="240" w:after="120" w:line="276" w:lineRule="auto"/>'
    );
    expect(documentXml).toContain(
      '<w:pStyle w:val="Heading2"/><w:tabs><w:tab w:val="center" w:pos="2880"/></w:tabs><w:spacing w:after="300"/>'
    );
    expect(documentXml).toContain(
      '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:tabs><w:tab w:val="right" w:pos="1440"/></w:tabs><w:spacing w:after="60"/>'
    );
    expect(result.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it("roundtrips exported DOCX paragraph spacing and tabs through DOCX import", () => {
    const exportResult = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(createParagraphLayoutIR())
    );
    const importResult = importDOCXToIR(exportResult.packageBytes);
    const blocks = importResult.irDocument.sections[0].blocks;
    const paragraph = blocks.find(
      (block) => block.type === "paragraph" && inlineText(block) === "Paragraph layout"
    );
    const heading = blocks.find(
      (block) => block.type === "heading" && inlineText(block) === "Heading layout"
    );

    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphSpacingBefore: 240,
        docxParagraphSpacingAfter: 120,
        docxParagraphSpacingLine: 276,
        docxParagraphSpacingLineRule: "auto",
        docxParagraphTabs: [
          { positionTwips: 720, type: "left", leader: null },
          { positionTwips: 3600, type: "decimal", leader: "dot" }
        ]
      }
    });
    expect(heading).toMatchObject({
      type: "heading",
      attrs: {
        level: 2,
        docxParagraphSpacingAfter: 300,
        docxParagraphTabs: [
          { positionTwips: 2880, type: "center", leader: null }
        ]
      }
    });
    expect(importResult.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["docx-import-paragraph-partial"])
    );
    expect(importResult.warnings.map((warning) => warning.message).join("\n")).toContain(
      "re-exported by DOCX minimal export"
    );
  });

  it("exports preserved DOCX paragraph style metadata as custom styles", () => {
    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(createParagraphStyleMetadataIR())
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const stylesXml = entries["word/styles.xml"];

    expect(documentXml).toContain("Styled body");
    expect(documentXml).toContain("Styled heading");
    expect(documentXml).toContain("Styled list");
    expect(documentXml).toContain(
      '<w:pStyle w:val="DockitFixtureBodyStyle"/><w:spacing w:after="120"/>'
    );
    expect(documentXml).toContain(
      '<w:pStyle w:val="DockitFixtureNamedHeading"/><w:tabs><w:tab w:val="center" w:pos="2880"/></w:tabs>'
    );
    expect(documentXml).toContain(
      '<w:pStyle w:val="DockitFixtureListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    );
    expect(stylesXml).toContain(
      '<w:style w:type="paragraph" w:customStyle="1" w:styleId="DockitFixtureBodyStyle"><w:name w:val="Dockit body style"/><w:basedOn w:val="Normal"/></w:style>'
    );
    expect(stylesXml).toContain(
      '<w:style w:type="paragraph" w:customStyle="1" w:styleId="DockitFixtureNamedHeading"><w:name w:val="Dockit heading style"/><w:basedOn w:val="Heading2"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>'
    );
    expect(stylesXml).toContain(
      '<w:style w:type="paragraph" w:customStyle="1" w:styleId="DockitFixtureListParagraph"><w:name w:val="Dockit list paragraph"/><w:basedOn w:val="Normal"/></w:style>'
    );
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "docx-paragraph-style-fallback"
    );
  });

  it("roundtrips exported DOCX paragraph style metadata through DOCX import", () => {
    const exportResult = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(createParagraphStyleMetadataIR())
    );
    const importResult = importDOCXToIR(exportResult.packageBytes);
    const blocks = importResult.irDocument.sections[0].blocks;
    const paragraph = blocks.find(
      (block) => block.type === "paragraph" && inlineText(block) === "Styled body"
    );
    const heading = blocks.find(
      (block) => block.type === "heading" && inlineText(block) === "Styled heading"
    );
    const list = blocks.find((block) => block.type === "list");
    const listParagraph = list?.items[0]?.blocks[0];

    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphStyleId: "DockitFixtureBodyStyle",
        docxParagraphStyleName: "Dockit body style",
        docxParagraphSpacingAfter: 120
      }
    });
    expect(heading).toMatchObject({
      type: "heading",
      attrs: {
        level: 2,
        docxParagraphStyleId: "DockitFixtureNamedHeading",
        docxParagraphStyleName: "Dockit heading style",
        docxParagraphTabs: [
          { positionTwips: 2880, type: "center", leader: null }
        ]
      }
    });
    expect(listParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphStyleId: "DockitFixtureListParagraph",
        docxParagraphStyleName: "Dockit list paragraph"
      }
    });
    expect(
      importResult.warnings.map((warning) => warning.message).join("\n")
    ).toContain("style id/name metadata");
  });

  it("warns when custom DOCX paragraph style ids carry conflicting metadata", () => {
    const irDocument = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "paragraph",
              attrs: {
                docxParagraphStyleId: "DockitSharedStyle",
                docxParagraphStyleName: "Shared style one"
              },
              runs: [{ type: "textRun", text: "First shared style", marks: [] }]
            },
            {
              type: "paragraph",
              attrs: {
                docxParagraphStyleId: "DockitSharedStyle",
                docxParagraphStyleName: "Shared style two"
              },
              runs: [{ type: "textRun", text: "Second shared style", marks: [] }]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalDOCX(createDOCXMinimalExportInput(irDocument));
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const stylesXml = entries["word/styles.xml"];
    const styleWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-paragraph-style-fallback"
    );

    expect(documentXml.match(/w:pStyle w:val="DockitSharedStyle"/g)).toHaveLength(2);
    expect(stylesXml).toContain('<w:name w:val="Shared style one"/>');
    expect(stylesXml).not.toContain('<w:name w:val="Shared style two"/>');
    expect(styleWarnings).toHaveLength(1);
    expect(styleWarnings[0]).toMatchObject({
      severity: "warning",
      path: "sections.0.blocks.1",
      message:
        "DOCX minimal export reused paragraph style id 'DockitSharedStyle' and omitted conflicting style metadata for this paragraph."
    });
    styleWarnings.forEach((warning) => {
      expect(warning.severity).toBe("warning");
      expect(DOCX_MINIMAL_WARNING_CONTRACT[warning.code]).toBeDefined();
    });
  });

  it("warns and omits unsupported DOCX table border and fill metadata", () => {
    const irDocument = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "table",
              attrs: {
                borderColor: "var(--table-border)",
                borderStyle: "groove",
                borderWidth: "2rem"
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
                        backgroundColor: "theme-7"
                      },
                      blocks: [
                        {
                          type: "paragraph",
                          attrs: {},
                          runs: [{ type: "textRun", text: "Unsafe style", marks: [] }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(irDocument)
    );
    const documentXml = readZipEntries(result.packageBytes)["word/document.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(documentXml).toContain("Unsafe style");
    expect(documentXml).not.toContain("<w:tblBorders>");
    expect(documentXml).not.toContain("<w:tcBorders>");
    expect(documentXml).not.toContain("<w:shd");
    expect(warningCodes).toContain("docx-table-border-fallback");
    expect(warningCodes).toContain("docx-table-fill-fallback");
  });

  it("exports native bullet lists and keeps task/custom lists as fallback text", () => {
    const irDocument = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
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
                  attrs: { checked: true },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "Task item", marks: [] }]
                    }
                  ]
                }
              ]
            },
            {
              type: "list",
              listType: "ordered",
              attrs: { markerText: "A)" },
              items: [
                {
                  type: "listItem",
                  attrs: {},
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "Custom item", marks: [] }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(irDocument)
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const numberingXml = entries["word/numbering.xml"];

    expect(documentXml).toContain('<w:numId w:val="1"/>');
    expect(documentXml).toContain("Bullet item");
    expect(documentXml).not.toContain("- ");
    expect(numberingXml).toContain('<w:numFmt w:val="bullet"/>');
    expect(documentXml).toContain("[x] ");
    expect(documentXml).toContain("Task item");
    expect(documentXml).toContain("Custom item");
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "docx-list-fallback",
      "docx-list-fallback"
    ]);
  });

  it("exports object and unsupported block as visible fallback text", () => {
    const input = createDOCXMinimalExportInput(objectUnsupportedReadinessIR);
    const result = exportIRToMinimalDOCX(input);
    const documentXml = readZipEntries(result.packageBytes)["word/document.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(input).toMatchObject({
      tableCount: 0,
      objectCount: 1
    });
    expect(documentXml).toContain("[Object placeholder: image");
    expect(documentXml).toContain("[Unsupported block: columnBlock]");
    expect(warningCodes).toContain("docx-object-placeholder");
    expect(warningCodes).toContain("docx-unsupported-block");
  });

  it("embeds PNG and JPEG data URI image objects as DOCX media relationships", () => {
    const irDocument = {
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
                width: 100,
                height: 50,
                altText: "PNG alt"
              },
              children: []
            },
            {
              type: "object",
              objectType: "image",
              flowMode: "inline",
              anchorMode: "inline",
              attrs: {
                src: JPEG_DATA_URI,
                width: "25mm",
                height: "10mm",
                title: "JPEG title"
              },
              children: []
            }
          ]
        }
      ]
    };

    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(irDocument)
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];
    const relsXml = entries["word/_rels/document.xml.rels"];
    const contentTypesXml = entries["[Content_Types].xml"];
    const pngBytes = entries["word/media/image1.png"];
    const jpegBytes = entries["word/media/image2.jpg"];

    expect(documentXml).toContain("<w:drawing>");
    expect(documentXml).toContain('r:embed="rId3"');
    expect(documentXml).toContain('r:embed="rId4"');
    expect(documentXml).toContain('cx="952500"');
    expect(documentXml).toContain('cy="476250"');
    expect(documentXml).toContain('cx="900000"');
    expect(documentXml).toContain('cy="360000"');
    expect(documentXml).not.toContain("[Object placeholder");
    expect(relsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"'
    );
    expect(relsXml).toContain('Target="media/image1.png"');
    expect(relsXml).toContain('Target="media/image2.jpg"');
    expect(contentTypesXml).toContain('Default Extension="png" ContentType="image/png"');
    expect(contentTypesXml).toContain('Default Extension="jpg" ContentType="image/jpeg"');
    expect([...pngBytes.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);
    expect([...jpegBytes]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it("exports floating image placement as DOCX anchored drawing and imports it back", () => {
    const irDocument = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "object",
              objectType: "image",
              flowMode: "floating",
              anchorMode: "page",
              attrs: {
                src: PNG_DATA_URI,
                width: 120,
                height: 60,
                altText: "Floating PNG",
                title: "Floating title"
              },
              children: []
            }
          ]
        }
      ]
    };

    const exportResult = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(irDocument)
    );
    const documentXml = readZipEntries(exportResult.packageBytes)[
      "word/document.xml"
    ];
    const importResult = importDOCXToIR(exportResult.packageBytes);
    const image = importResult.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(documentXml).toContain("<wp:anchor ");
    expect(documentXml).not.toContain("<wp:inline");
    expect(documentXml).toContain('behindDoc="0"');
    expect(documentXml).toContain('<wp:positionH relativeFrom="page">');
    expect(documentXml).toContain('<wp:positionV relativeFrom="page">');
    expect(documentXml).toContain('<wp:wrapSquare wrapText="bothSides"/>');
    expect(exportResult.warnings.map((warning) => warning.code)).toEqual([]);
    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "floating",
      anchorMode: "page",
      attrs: {
        docxDrawingType: "anchor",
        docxAnchorRelativeFromH: "page",
        docxAnchorRelativeFromV: "page",
        docxAnchorPositionHOffsetEmu: 0,
        docxAnchorPositionVOffsetEmu: 0,
        docxAnchorWrapType: "wrapSquare",
        docxAnchorWrapText: "bothSides",
        docxAnchorDistanceTopEmu: 0,
        docxAnchorDistanceBottomEmu: 0,
        docxAnchorDistanceLeftEmu: 0,
        docxAnchorDistanceRightEmu: 0,
        docxAnchorBehindDoc: false,
        docxAnchorLocked: false,
        docxAnchorLayoutInCell: true,
        docxAnchorAllowOverlap: true,
        mimeType: "image/png",
        binaryRestored: true,
        title: "Floating PNG",
        altText: "Floating PNG"
      }
    });
    expect(importResult.warnings.map((warning) => warning.code)).not.toContain(
      "docx-import-media-metadata-only"
    );
  });

  it("keeps invalid image data URI as placeholder fallback", () => {
    const irDocument = {
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
                src: "data:image/png;base64,ZmFrZQ==",
                altText: "Broken image"
              },
              children: []
            }
          ]
        }
      ]
    };

    const result = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(irDocument)
    );
    const entries = readZipEntries(result.packageBytes);
    const documentXml = entries["word/document.xml"];

    expect(documentXml).not.toContain("<w:drawing>");
    expect(documentXml).toContain("[Object placeholder: image Broken image]");
    expect(Object.keys(entries).some((path) => path.startsWith("word/media/"))).toBe(
      false
    );
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "docx-image-relationship-fallback",
      "docx-object-placeholder"
    ]);
    result.warnings.forEach((warning) => {
      expect(DOCX_MINIMAL_WARNING_CONTRACT[warning.code]).toBeDefined();
    });
  });

  it("warning contract covers all emitted DOCX warning codes and severities", () => {
    [
      paragraphHeadingReadinessIR,
      listTableReadinessIR,
      objectUnsupportedReadinessIR,
      createStyledIR()
    ].forEach((irDocument) => {
      const result = exportIRToMinimalDOCX(
        createDOCXMinimalExportInput(irDocument)
      );

      result.warnings.forEach((warning) => {
        expect(DOCX_MINIMAL_WARNING_CONTRACT[warning.code]).toBeDefined();
        expect(warning.severity).toBe(
          DOCX_MINIMAL_WARNING_CONTRACT[warning.code].severity
        );
      });
    });
  });
});
