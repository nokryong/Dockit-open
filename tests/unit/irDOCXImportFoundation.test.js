import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  createDOCXMinimalExportInput,
  exportIRToMinimalDOCX
} from "../../app/LIB/ir/docxMinimalExport";
import {
  importDOCXToIR,
  readDOCXPackageFromBytes
} from "../../app/LIB/ir/docxImport";
import {
  listTableReadinessIR,
  paragraphHeadingReadinessIR
} from "./fixtures/irExportReadinessFixtures";

const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const exportToDOCXBytes = (irDocument) =>
  exportIRToMinimalDOCX(createDOCXMinimalExportInput(irDocument)).packageBytes;

const mutateDOCXEntries = (packageBytes, updaters) => {
  const entries = unzipSync(packageBytes);

  Object.entries(updaters).forEach(([entryPath, updater]) => {
    entries[entryPath] = strToU8(updater(strFromU8(entries[entryPath])));
  });

  return zipSync(entries);
};

const mutateDOCXBinaryEntries = (packageBytes, updaters) => {
  const entries = unzipSync(packageBytes);

  Object.entries(updaters).forEach(([entryPath, updater]) => {
    entries[entryPath] = updater(entries[entryPath]);
  });

  return zipSync(entries);
};

const inlineText = (runs) =>
  runs.map((run) => (run.type === "textRun" ? run.text : "\n")).join("");

const replaceNth = (value, search, occurrenceIndex, replacement) => {
  let currentIndex = -1;

  return value.replace(new RegExp(search, "g"), (match) => {
    currentIndex += 1;
    return currentIndex === occurrenceIndex ? replacement : match;
  });
};

const textRuns = (block) => block.runs.filter((run) => run.type === "textRun");

const runMarkTypes = (run) => run.marks.map((mark) => mark.type);

const linkMark = (run) => run.marks.find((mark) => mark.type === "link");

const createStyledImportIR = () => ({
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
              text: " Sup",
              marks: [{ type: "superscript" }]
            },
            {
              type: "textRun",
              text: " Sub",
              marks: [{ type: "subscript" }]
            },
            { type: "hardBreak" },
            {
              type: "textRun",
              text: " Link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }]
            }
          ]
        }
      ]
    }
  ]
});

const createImageImportIR = () => ({
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
        }
      ]
    }
  ]
});

const createBulletListImportIR = () => ({
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
        }
      ]
    }
  ]
});

const createDOCXAdvancedTableIR = () => ({
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
                  attrs: {},
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
                  attrs: {},
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
                  attrs: {},
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "A2", marks: [] }]
                    }
                  ]
                },
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {},
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

describe("DOCX import foundation", () => {
  it("reads a DOCX package and reports required OpenXML entries", () => {
    const packageBytes = exportToDOCXBytes(paragraphHeadingReadinessIR);
    const result = readDOCXPackageFromBytes(packageBytes);

    expect(result.packageSummary.requiredEntries).toEqual({
      contentTypes: true,
      packageRels: true,
      documentXml: true
    });
    expect(result.packageSummary.optionalEntries).toMatchObject({
      documentRels: true,
      stylesXml: true,
      numberingXml: true
    });
    expect(result.entryMap.get("word/document.xml")?.text).toContain(
      "<w:document"
    );
    expect(result.warnings).toEqual([]);
  });

  it("imports exported paragraph and heading text into IR", () => {
    const result = importDOCXToIR(exportToDOCXBytes(paragraphHeadingReadinessIR), {
      extractedAt: "2026-06-18T00:00:00.000Z"
    });
    const [heading, paragraph] = result.irDocument.sections[0].blocks;

    expect(result.irDocument.metadata).toMatchObject({
      extractorVersion: "dockit-docx-import-s5",
      source: {
        editor: "docx",
        mode: "import-snapshot"
      }
    });
    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 1 }
    });
    expect(inlineText(heading.runs)).toBe("Export readiness");
    expect(runMarkTypes(textRuns(heading)[0])).toContain("bold");
    expect(paragraph).toMatchObject({ type: "paragraph" });
    expect(inlineText(paragraph.runs)).toContain(
      "A long paragraph with an inline tag."
    );
    expect(result.warnings.map((item) => item.code)).toContain(
      "docx-import-section-properties-partial"
    );
  });

  it("imports basic DOCX run marks and restores external hyperlink targets", () => {
    const result = importDOCXToIR(exportToDOCXBytes(createStyledImportIR()));
    const paragraph = result.irDocument.sections[0].blocks[0];
    const runs = textRuns(paragraph);

    expect(inlineText(paragraph.runs)).toBe(
      "Bold Italic Underline Strike Color Sup Sub\n Link"
    );
    expect(runMarkTypes(runs[0])).toContain("bold");
    expect(runMarkTypes(runs[1])).toContain("italic");
    expect(runMarkTypes(runs[2])).toContain("underline");
    expect(runMarkTypes(runs[3])).toContain("strike");
    expect(runs[4].marks).toContainEqual({
      type: "textStyle",
      attrs: { color: "#336699" }
    });
    expect(runMarkTypes(runs[5])).toContain("superscript");
    expect(runMarkTypes(runs[6])).toContain("subscript");
    expect(linkMark(runs[7])).toEqual({
      type: "link",
      attrs: { href: "https://example.com" }
    });
    expect(result.warnings.map((item) => item.code)).toContain(
      "docx-import-section-properties-partial"
    );
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "docx-import-hyperlink-relationship-unsupported"
    );
  });

  it("resolves custom heading styles through styles.xml basedOn inheritance", () => {
    const packageBytes = mutateDOCXEntries(
      exportToDOCXBytes(paragraphHeadingReadinessIR),
      {
        "word/document.xml": (xml) =>
          xml.replace(
            /<w:pStyle w:val="Heading1"\/>/,
            '<w:pStyle w:val="DockitTitle"/>'
          ),
        "word/styles.xml": (xml) =>
          xml.replace(
            "</w:styles>",
            [
              '<w:style w:type="paragraph" w:styleId="DockitTitle">',
              '<w:name w:val="Dockit Title"/>',
              '<w:basedOn w:val="Heading2"/>',
              "<w:rPr>",
              "<w:i/>",
              '<w:color w:val="AA5500"/>',
              "</w:rPr>",
              "</w:style>",
              "</w:styles>"
            ].join("")
          )
      }
    );
    expect(
      readDOCXPackageFromBytes(packageBytes).entryMap.get("word/document.xml")?.text
    ).toContain('w:pStyle w:val="DockitTitle"');
    const result = importDOCXToIR(packageBytes);
    const heading = result.irDocument.sections[0].blocks[0];
    const firstRun = textRuns(heading)[0];

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(runMarkTypes(firstRun)).toEqual(
      expect.arrayContaining(["bold", "italic", "textStyle"])
    );
    expect(firstRun.marks).toContainEqual({
      type: "textStyle",
      attrs: { color: "#AA5500" }
    });
  });

  it("applies paragraph style run properties and paragraph alignment", () => {
    const packageBytes = mutateDOCXEntries(
      exportToDOCXBytes(paragraphHeadingReadinessIR),
      {
        "word/document.xml": (xml) =>
          xml
            .replace(
              /(<\/w:p><w:p>)(<w:r>)/,
              '$1<w:pPr><w:pStyle w:val="DockitBody"/></w:pPr>$2'
            )
            .replace(
              /(<w:pPr><w:pStyle w:val="DockitBody"\/><\/w:pPr>)(<w:r>.*?<\/w:r>)/,
              '$1<w:hyperlink r:id="rIdStyleInherited">$2</w:hyperlink>'
            ),
        "word/styles.xml": (xml) =>
          xml.replace(
            "</w:styles>",
            [
              '<w:style w:type="paragraph" w:styleId="DockitBody">',
              '<w:name w:val="Dockit Body"/>',
              '<w:basedOn w:val="Normal"/>',
              '<w:pPr><w:jc w:val="center"/></w:pPr>',
              "<w:rPr>",
              "<w:u/>",
              '<w:color w:val="336699"/>',
              "</w:rPr>",
              "</w:style>",
              "</w:styles>"
            ].join("")
          )
      }
    );
    expect(
      readDOCXPackageFromBytes(packageBytes).entryMap.get("word/document.xml")?.text
    ).toContain('w:pStyle w:val="DockitBody"');
    const result = importDOCXToIR(packageBytes);
    const paragraph = result.irDocument.sections[0].blocks[1];
    const firstRun = textRuns(paragraph)[0];

    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: { textAlign: "center" }
    });
    expect(runMarkTypes(firstRun)).toEqual(
      expect.arrayContaining(["underline", "textStyle"])
    );
    expect(firstRun.marks).toContainEqual({
      type: "textStyle",
      attrs: { color: "#336699" }
    });
    expect(result.warnings.map((item) => item.code)).toContain(
      "docx-import-hyperlink-relationship-unsupported"
    );
  });

  it("imports DOCX image relationships as image object metadata", () => {
    const result = importDOCXToIR(exportToDOCXBytes(createImageImportIR()));
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toBeDefined();
    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "inline",
      anchorMode: "inline",
      attrs: {
        mediaRelationshipId: "rId3",
        relationshipTarget: "media/image1.png",
        docxMediaPath: "word/media/image1.png",
        fileName: "image1.png",
        mimeType: "image/png",
        isEmbedded: true,
        hasBinaryEntry: true,
        binaryRestored: true,
        widthEmu: 952500,
        heightEmu: 476250,
        altText: "PNG alt",
        title: "PNG alt"
      }
    });
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/);
    expect(image.attrs.binarySize).toBeGreaterThan(0);
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "docx-import-media-metadata-only"
    );
  });

  it("keeps oversized DOCX image binaries as explicit metadata-only media", () => {
    const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const packageBytes = mutateDOCXBinaryEntries(
      exportToDOCXBytes(createImageImportIR()),
      {
        "word/media/image1.png": () => oversizedBytes
      }
    );
    const result = importDOCXToIR(packageBytes);
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      attrs: {
        src: "word/media/image1.png",
        docxMediaPath: "word/media/image1.png",
        mimeType: "image/png",
        hasBinaryEntry: true,
        binaryRestored: false,
        binarySize: oversizedBytes.length
      }
    });
    expect(image.attrs.src).not.toMatch(/^data:image\/png;base64,/);
    expect(result.warnings.map((item) => item.code)).toContain(
      "docx-import-media-metadata-only"
    );
  });

  it("imports simple DOCX numbering and tables into IR lists and tables", () => {
    const result = importDOCXToIR(exportToDOCXBytes(listTableReadinessIR));
    const blocks = result.irDocument.sections[0].blocks;
    const list = blocks.find((block) => block.type === "list");
    const table = blocks.find((block) => block.type === "table");

    expect(list).toMatchObject({
      type: "list",
      listType: "ordered",
      attrs: { start: 3 },
      items: [
        {
          type: "listItem",
          attrs: { value: 3 }
        }
      ]
    });
    expect(inlineText(list.items[0].blocks[0].runs)).toBe("Nested item");
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        borderColor: "#333333",
        borderStyle: "solid",
        borderWidth: 1
      },
      rows: [
        {
          type: "tableRow",
          cells: [
            {
              type: "tableCell",
              role: "cell",
              attrs: {
                backgroundColor: "#F5F5F5",
                borderColor: "#333333",
                borderStyle: "solid",
                borderWidth: 1
              }
            }
          ]
        }
      ]
    });
    expect(inlineText(table.rows[0].cells[0].blocks[0].runs)).toBe(
      "Merged cell"
    );
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "docx-import-numbering-unsupported"
    );
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "docx-import-unsupported-block"
    );
  });

  it("imports DOCX vertical merges and table grid widths into IR table attrs", () => {
    const packageBytes = mutateDOCXEntries(
      exportToDOCXBytes(createDOCXAdvancedTableIR()),
      {
        "word/document.xml": (xml) => {
          let nextXml = xml.replace(
            "</w:tblPr>",
            [
              "</w:tblPr>",
              "<w:tblGrid>",
              '<w:gridCol w:w="1440"/>',
              '<w:gridCol w:w="2880"/>',
              "</w:tblGrid>"
            ].join("")
          );

          nextXml = replaceNth(
            nextXml,
            "<w:tcPr>",
            0,
            '<w:tcPr><w:vMerge w:val="restart"/>'
          );
          nextXml = replaceNth(
            nextXml,
            "<w:tcPr>",
            2,
            "<w:tcPr><w:vMerge/>"
          );

          return nextXml;
        }
      }
    );
    const result = importDOCXToIR(packageBytes);
    const table = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );

    expect(table).toBeDefined();
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells).toHaveLength(2);
    expect(table.rows[1].cells).toHaveLength(1);
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
    expect(table.rows[1].cells[0]).toMatchObject({
      attrs: {
        colwidth: [192]
      }
    });
    expect(inlineText(table.rows[0].cells[0].blocks[0].runs)).toBe("A1");
    expect(inlineText(table.rows[1].cells[0].blocks[0].runs)).toBe("B2");
    expect(result.warnings.map((item) => item.message).join("\n")).not.toMatch(
      /vertically merged table cell was imported without rowspan fidelity/
    );
  });

  it("uses DOCX tcW as a cell colwidth fallback when tblGrid is absent", () => {
    const packageBytes = mutateDOCXEntries(
      exportToDOCXBytes(createDOCXAdvancedTableIR()),
      {
        "word/document.xml": (xml) =>
          replaceNth(
            xml,
            "<w:tcPr>",
            0,
            '<w:tcPr><w:tcW w:w="3000" w:type="dxa"/>'
          )
      }
    );
    const result = importDOCXToIR(packageBytes);
    const table = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );

    expect(table.rows[0].cells[0]).toMatchObject({
      attrs: {
        colwidth: [200]
      }
    });
  });

  it("imports simple DOCX bullet numbering into an IR bullet list", () => {
    const result = importDOCXToIR(exportToDOCXBytes(createBulletListImportIR()));
    const list = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "list"
    );

    expect(list).toMatchObject({
      type: "list",
      listType: "bullet",
      attrs: {},
      items: [{ type: "listItem", attrs: {} }]
    });
    expect(inlineText(list.items[0].blocks[0].runs)).toBe("Bullet item");
  });

  it("returns an empty IR document with an error warning for invalid packages", () => {
    const result = importDOCXToIR(new Uint8Array([1, 2, 3, 4]));

    expect(result.irDocument.sections[0].blocks).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toContain(
      "docx-import-package-error"
    );
  });
});
