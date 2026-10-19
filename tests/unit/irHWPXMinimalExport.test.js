import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HWPX_V0_WARNING_CONTRACT,
  createHWPXMinimalExportInput,
  createHWPXV0ExportInput,
  exportIRToHWPXV0,
  exportIRToMinimalHWPX
} from "../../app/LIB/ir/hwpxMinimalExport";
import { importHWPXToIR } from "../../app/LIB/ir/hwpxImport";
import { createHWPXNormalizedTableGridView } from "../../app/LIB/ir/hwpxTableGridView";
import {
  listTableReadinessIR,
  objectUnsupportedReadinessIR,
  paragraphHeadingReadinessIR
} from "./fixtures/irExportReadinessFixtures";

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
    const path = decoder.decode(bytes.slice(nameStart, nameEnd));
    const data = bytes.slice(dataStart, dataEnd);

    entries[path] = method === 0 ? decoder.decode(data) : data;
    offset = dataEnd;
  }

  return entries;
};

const maybeWriteStyledTextFixture = (result) => {
  const outputDir = process.env.HWPX_STYLED_TEXT_FIXTURE_OUT;

  if (!outputDir) {
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "minimal-styled-text.hwpx"), result.packageBytes);
  writeFileSync(
    path.join(outputDir, "minimal-styled-text.hwpx.warnings.json"),
    `${JSON.stringify(result.warnings, null, 2)}\n`
  );
};

const maybeWriteLinkFixture = (result) => {
  const outputDir = process.env.HWPX_LINK_FIXTURE_OUT;

  if (!outputDir) {
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "minimal-link.hwpx"), result.packageBytes);
  writeFileSync(
    path.join(outputDir, "minimal-link.hwpx.warnings.json"),
    `${JSON.stringify(result.warnings, null, 2)}\n`
  );
};

const maybeWriteMergedTableFixture = (result) => {
  const outputDir = process.env.HWPX_MERGED_TABLE_FIXTURE_OUT;

  if (!outputDir) {
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "minimal-merged-table.hwpx"), result.packageBytes);
  writeFileSync(
    path.join(outputDir, "minimal-merged-table.hwpx.warnings.json"),
    `${JSON.stringify(result.warnings, null, 2)}\n`
  );
};

const maybeWriteTableMergeMatrixFixtures = (results) => {
  const outputDir = process.env.HWPX_TABLE_MERGE_MATRIX_FIXTURE_OUT;

  if (!outputDir) {
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  Object.entries(results).forEach(([fileName, result]) => {
    writeFileSync(path.join(outputDir, fileName), result.packageBytes);
    writeFileSync(
      path.join(outputDir, `${fileName}.warnings.json`),
      `${JSON.stringify(result.warnings, null, 2)}\n`
    );
  });
};

const maybeWriteSemanticBlocksFixture = (result) => {
  const outputDir = process.env.HWPX_SEMANTIC_BLOCKS_FIXTURE_OUT;

  if (!outputDir) {
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "minimal-semantic-blocks.hwpx"), result.packageBytes);
  writeFileSync(
    path.join(outputDir, "minimal-semantic-blocks.hwpx.warnings.json"),
    `${JSON.stringify(result.warnings, null, 2)}\n`
  );
};

const createTextCell = (text, attrs = {}) => ({
  type: "tableCell",
  role: "cell",
  attrs: {
    colspan: 1,
    rowspan: 1,
    colwidth: [100],
    borderColor: "#333333",
    borderStyle: "solid",
    borderWidth: 1,
    ...attrs
  },
  blocks: [
    {
      type: "paragraph",
      attrs: {},
      runs: [{ type: "textRun", text, marks: [] }]
    }
  ]
});

const createTableMergeFixtureIR = (rows, tableAttrs = {}) => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        paragraphHeadingReadinessIR.sections[0].blocks[0],
        {
          type: "table",
          attrs: {
            borderColor: "#333333",
            borderStyle: "solid",
            borderWidth: 1,
            ...tableAttrs
          },
          rows
        }
      ]
    }
  ]
});

const createColspanOnlyTableIR = () =>
  createTableMergeFixtureIR([
    {
      type: "tableRow",
      attrs: { height: 20 },
      cells: [
        createTextCell("Colspan top", {
          colspan: 2,
          colwidth: [90, 110]
        }),
        createTextCell("Top right", { colwidth: [140] })
      ]
    },
    {
      type: "tableRow",
      attrs: { height: 22 },
      cells: [
        createTextCell("Bottom left", { colwidth: [90] }),
        createTextCell("Bottom middle", { colwidth: [110] }),
        createTextCell("Bottom right", { colwidth: [140] })
      ]
    }
  ]);

const createRowspanOnlyTableIR = () =>
  createTableMergeFixtureIR([
    {
      type: "tableRow",
      attrs: { height: 18 },
      cells: [
        createTextCell("Rowspan left", {
          rowspan: 3,
          colwidth: [100]
        }),
        createTextCell("R1C2", { colwidth: [120] })
      ]
    },
    {
      type: "tableRow",
      attrs: { height: 24 },
      cells: [createTextCell("R2C2", { colwidth: [120] })]
    },
    {
      type: "tableRow",
      attrs: { height: 30 },
      cells: [createTextCell("R3C2", { colwidth: [120] })]
    }
  ]);

const createMixedSpanTableIR = () =>
  createTableMergeFixtureIR([
    {
      type: "tableRow",
      attrs: { height: 21 },
      cells: [
        createTextCell("Mixed block", {
          colspan: 2,
          rowspan: 2,
          colwidth: [80, 120]
        }),
        createTextCell("Top right", { colwidth: [160] })
      ]
    },
    {
      type: "tableRow",
      attrs: { height: 27 },
      cells: [createTextCell("Middle right", { colwidth: [160] })]
    },
    {
      type: "tableRow",
      attrs: { height: 25 },
      cells: [
        createTextCell("Bottom left", { colwidth: [80] }),
        createTextCell("Bottom middle", { colwidth: [120] }),
        createTextCell("Bottom right", { colwidth: [160] })
      ]
    }
  ]);

const createClampedRowspanTableIR = () =>
  createTableMergeFixtureIR([
    {
      type: "tableRow",
      attrs: { height: 20 },
      cells: [
        createTextCell("Oversized rowspan", {
          rowspan: 5,
          colwidth: [100]
        }),
        createTextCell("Clamp top", { colwidth: [130] })
      ]
    },
    {
      type: "tableRow",
      attrs: { height: 26 },
      cells: [createTextCell("Clamp bottom", { colwidth: [130] })]
    }
  ]);

const createEmbeddedImageIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        paragraphHeadingReadinessIR.sections[0].blocks[0],
        {
          type: "object",
          objectType: "image",
          flowMode: "block",
          anchorMode: "paragraph",
          attrs: {
            src: imageFixtureDataUri,
            objectId: "embedded-img-1",
            fileName: "dockit-image-fixture.png",
            mimeType: "image/png",
            width: "16px",
            height: "16px",
            altText: "Dockit fixture image",
            title: "Dockit image fixture"
          },
          children: []
        }
      ]
    }
  ]
});

const createConsolidatedV0IR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        ...paragraphHeadingReadinessIR.sections[0].blocks,
        ...listTableReadinessIR.sections[0].blocks,
        createEmbeddedImageIR().sections[0].blocks[1]
      ]
    }
  ]
});

const createUnsupportedRawTextIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "unsupported",
          nodeType: "codeBlock",
          attrs: { language: "js" },
          raw: {
            type: "codeBlock",
            attrs: { language: "js" },
            content: [
              { type: "text", text: "const dockit = true;" },
              { type: "hardBreak" },
              { type: "text", text: "return dockit;" }
            ]
          }
        }
      ]
    }
  ]
});

const createBlockquoteRawTextIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "unsupported",
          nodeType: "blockquote",
          attrs: {},
          raw: {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "인용문 첫 줄" }]
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: "인용문 둘째 줄" }]
              }
            ]
          }
        }
      ]
    }
  ]
});

const createSemanticBlocksIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        {
          type: "heading",
          attrs: { level: 2 },
          runs: [{ type: "textRun", text: "Semantic fallback blocks", marks: [] }]
        },
        createUnsupportedRawTextIR().sections[0].blocks[0],
        createBlockquoteRawTextIR().sections[0].blocks[0]
      ]
    }
  ]
});

const createMergedTableIR = () => ({
  ...paragraphHeadingReadinessIR,
  sections: [
    {
      ...paragraphHeadingReadinessIR.sections[0],
      blocks: [
        paragraphHeadingReadinessIR.sections[0].blocks[0],
        {
          type: "table",
          attrs: {
            borderColor: "#333333",
            borderStyle: "solid",
            borderWidth: 1
          },
          rows: [
            {
              type: "tableRow",
              attrs: { height: 24 },
              cells: [
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {
                    colspan: 1,
                    rowspan: 2,
                    colwidth: [120],
                    borderColor: "#333333",
                    borderStyle: "solid",
                    borderWidth: 1
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "Merged left", marks: [] }]
                    }
                  ]
                },
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {
                    colspan: 1,
                    rowspan: 1,
                    colwidth: [160],
                    borderColor: "#333333",
                    borderStyle: "solid",
                    borderWidth: 1
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "Top right", marks: [] }]
                    }
                  ]
                }
              ]
            },
            {
              type: "tableRow",
              attrs: { height: 30 },
              cells: [
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {
                    colspan: 1,
                    rowspan: 1,
                    colwidth: [160],
                    borderColor: "#333333",
                    borderStyle: "solid",
                    borderWidth: 1
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [
                        { type: "textRun", text: "Bottom right", marks: [] }
                      ]
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

describe("HWPX minimal export spike", () => {
  it("v0 entrypoint는 paragraph, heading, list, table, image object를 한 경로에서 처리한다", () => {
    const input = createHWPXV0ExportInput(createConsolidatedV0IR());
    const result = exportIRToHWPXV0(input);
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const contentHpf = entries["Contents/content.hpf"];

    expect(createHWPXV0ExportInput).toBe(createHWPXMinimalExportInput);
    expect(exportIRToHWPXV0).toBe(exportIRToMinimalHWPX);
    expect(input.blockViews.map((view) => view.blockType)).toEqual([
      "heading",
      "paragraph",
      "list",
      "table",
      "object"
    ]);
    expect(header).toContain('<hh:numberings itemCnt="1">');
    expect(header).toContain('<hh:borderFill id="2"');
    expect(section).toContain("Export readiness");
    expect(section).toContain("A long paragraph with an inline tag.");
    expect(section).toContain("<hp:t>Nested item</hp:t>");
    expect(section).toContain("<hp:tbl");
    expect(section).toContain("<hp:pic");
    expect(section).toContain('<hc:img binaryItemIDRef="image1"');
    expect(contentHpf).toContain(
      '<opf:item id="image1" href="BinData/dockit-image-fixture.png" media-type="image/png" isEmbeded="1"/>'
    );
    expect(Object.keys(entries)).toContain("BinData/dockit-image-fixture.png");
    expect(section).not.toContain("[Object placeholder: image embedded-img-1]");
    expect(
      result.warnings.every(
        (warning) => HWPX_V0_WARNING_CONTRACT[warning.code].severity === warning.severity
      )
    ).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "run-style-fallback",
      "table-merge-layout-warning"
    ]);
  });

  it("DOCX paragraph before/after spacing exports as HWPX paraPr margins and imports back", () => {
    const ir = {
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
                docxParagraphSpacingLineRule: "auto"
              },
              runs: [
                {
                  type: "textRun",
                  text: "Paragraph spacing",
                  marks: []
                }
              ]
            },
            {
              type: "heading",
              attrs: {
                level: 2,
                docxParagraphSpacingAfter: 300
              },
              runs: [
                {
                  type: "textRun",
                  text: "Heading spacing",
                  marks: []
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const imported = importHWPXToIR(result.packageBytes, {
      extractedAt: "2026-07-01T00:00:00.000Z"
    });
    const [paragraph, heading] = imported.irDocument.sections[0].blocks;

    expect(header).toContain('<hh:paraProperties itemCnt="11">');
    expect(section).toContain('paraPrIDRef="102" styleIDRef="0"');
    expect(section).toContain('paraPrIDRef="103" styleIDRef="2"');
    expect(header).toContain('<hh:paraPr id="102"');
    expect(header).toContain('<hc:prev value="1200" unit="HWPUNIT"/>');
    expect(header).toContain('<hc:next value="600" unit="HWPUNIT"/>');
    expect(header).toContain(
      '<hh:lineSpacing type="PERCENT" value="115" unit="HWPUNIT"/>'
    );
    expect(header).toContain('<hh:paraPr id="103"');
    expect(header).toContain('<hh:heading type="NONE" idRef="0" level="2"/>');
    expect(header).toContain('<hc:next value="1500" unit="HWPUNIT"/>');
    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphSpacingBefore: 240,
        docxParagraphSpacingAfter: 120,
        docxParagraphSpacingLine: 276,
        docxParagraphSpacingLineRule: "auto"
      }
    });
    expect(heading).toMatchObject({
      type: "heading",
      attrs: {
        level: 2,
        docxParagraphSpacingAfter: 300
      }
    });
    expect(result.warnings).toEqual([]);
  });

  it("DOCX exact/atLeast paragraph line spacing is warning-backed for HWPX export", () => {
    const ir = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "paragraph",
              attrs: {
                docxParagraphSpacingBefore: 240,
                docxParagraphSpacingLine: 480,
                docxParagraphSpacingLineRule: "exact"
              },
              runs: [
                {
                  type: "textRun",
                  text: "Exact line spacing",
                  marks: []
                }
              ]
            },
            {
              type: "heading",
              attrs: {
                level: 2,
                docxParagraphSpacingLine: 480,
                docxParagraphSpacingLineRule: "atLeast"
              },
              runs: [
                {
                  type: "textRun",
                  text: "At least line spacing",
                  marks: []
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const imported = importHWPXToIR(result.packageBytes, {
      extractedAt: "2026-07-01T00:00:00.000Z"
    });
    const [paragraph, heading] = imported.irDocument.sections[0].blocks;

    expect(header).toContain('<hh:paraPr id="102"');
    expect(header).toContain('<hc:prev value="1200" unit="HWPUNIT"/>');
    expect(header).toContain(
      '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>'
    );
    expect(header).not.toContain(
      '<hh:lineSpacing type="PERCENT" value="200" unit="HWPUNIT"/>'
    );
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "paragraph-line-spacing-fallback",
      "paragraph-line-spacing-fallback"
    ]);
    expect(
      result.warnings.every(
        (warning) => HWPX_V0_WARNING_CONTRACT[warning.code].severity === warning.severity
      )
    ).toBe(true);
    expect(result.warnings[0]).toMatchObject({
      severity: "warning",
      path: "sections[0].blocks[0]",
      message:
        "DOCX paragraph line spacing rule 'exact' with line 480 is not emitted as native HWPX lineSpacing by the current supported subset."
    });
    expect(result.warnings[1]).toMatchObject({
      severity: "warning",
      path: "sections[0].blocks[1]",
      message:
        "DOCX paragraph line spacing rule 'atLeast' with line 480 is not emitted as native HWPX lineSpacing by the current supported subset."
    });
    expect(paragraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphSpacingBefore: 240
      }
    });
    expect(paragraph.attrs).not.toHaveProperty("docxParagraphSpacingLine");
    expect(paragraph.attrs).not.toHaveProperty("docxParagraphSpacingLineRule");
    expect(heading).toMatchObject({
      type: "heading",
      attrs: {
        level: 2
      }
    });
    expect(heading.attrs).not.toHaveProperty("docxParagraphSpacingLine");
    expect(heading.attrs).not.toHaveProperty("docxParagraphSpacingLineRule");
  });

  it("DOCX paragraph tab/style metadata is warning-backed for HWPX export", () => {
    const ir = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "paragraph",
              attrs: {
                docxParagraphTabs: [
                  { position: 720, type: "left", leader: "none" },
                  { position: 1440, type: "right", leader: "dot" }
                ],
                docxParagraphStyleId: "DockitFixtureTabbedParagraph",
                docxParagraphStyleName: "Dockit tabbed paragraph"
              },
              runs: [
                {
                  type: "textRun",
                  text: "Tabbed styled paragraph",
                  marks: []
                }
              ]
            },
            {
              type: "heading",
              attrs: {
                level: 2,
                docxParagraphStyleId: "DockitFixtureHeading"
              },
              runs: [
                {
                  type: "textRun",
                  text: "Styled heading",
                  marks: []
                }
              ]
            }
          ]
        }
      ]
    };

    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const section = entries["Contents/section0.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(section).toContain("Tabbed styled paragraph");
    expect(section).toContain("Styled heading");
    expect(warningCodes).toEqual([
      "paragraph-tabs-fallback",
      "paragraph-style-fallback",
      "paragraph-style-fallback"
    ]);
    expect(
      result.warnings.every(
        (warning) => HWPX_V0_WARNING_CONTRACT[warning.code].severity === warning.severity
      )
    ).toBe(true);
    expect(result.warnings[0]).toMatchObject({
      severity: "warning",
      path: "sections[0].blocks[0]",
      message:
        "DOCX paragraph tab-stop metadata (2 stop(s)) is preserved in IR but is not emitted as native HWPX tab stops by the current supported subset."
    });
    expect(result.warnings[1]).toMatchObject({
      severity: "warning",
      path: "sections[0].blocks[0]",
      message:
        "DOCX paragraph style id 'DockitFixtureTabbedParagraph' and style name 'Dockit tabbed paragraph' metadata is preserved in IR but is not emitted as native HWPX paragraph styles by the current supported subset."
    });
    expect(result.warnings[2]).toMatchObject({
      severity: "warning",
      path: "sections[0].blocks[1]",
      message:
        "DOCX paragraph style id 'DockitFixtureHeading' metadata is preserved in IR but is not emitted as native HWPX paragraph styles by the current supported subset."
    });
  });

  it("styled text runs use native HWPX charPr entries when the style is supported", () => {
    const ir = {
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
                  text: "굵게",
                  marks: [{ type: "bold" }]
                },
                {
                  type: "textRun",
                  text: " 기울임",
                  marks: [{ type: "italic" }]
                },
                {
                  type: "textRun",
                  text: " 밑줄",
                  marks: [{ type: "underline" }]
                },
                {
                  type: "textRun",
                  text: " 취소선",
                  marks: [{ type: "strike" }]
                },
                {
                  type: "textRun",
                  text: " 색상",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: {
                        color: "#336699",
                        fontFamily: "Noto Sans KR",
                        fontSize: "13pt"
                      }
                    }
                  ]
                },
                {
                  type: "textRun",
                  text: " 강조",
                  marks: [{ type: "highlight", attrs: { color: "#fff59d" } }]
                },
                {
                  type: "textRun",
                  text: " 코드",
                  marks: [{ type: "code" }]
                },
                {
                  type: "textRun",
                  text: " 위첨자",
                  marks: [{ type: "superscript" }]
                },
                {
                  type: "textRun",
                  text: " 아래첨자",
                  marks: [{ type: "subscript" }]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];

    maybeWriteStyledTextFixture(result);

    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "run-style-fallback"
    );
    expect(header).toContain('bold="1"');
    expect(header).toContain('italic="1"');
    expect(header).toContain('<hh:underline type="BOTTOM"');
    expect(header).toContain('<hh:strikeout shape="SOLID"');
    expect(header).toContain('<hh:font id="1" face="Noto Sans KR"');
    expect(header).toContain('<hh:font id="2" face="Consolas"');
    expect(header).toContain('height="1300"');
    expect(header).toContain(
      '<hh:fontRef hangul="1" latin="1" hanja="1" japanese="1" other="1" symbol="0" user="0"/>'
    );
    expect(header).toContain('textColor="#336699"');
    expect(header).toContain('shadeColor="#FFF59D"');
    expect(header).toContain('shadeColor="#F3F4F6"');
    expect(header).toMatch(
      /<hh:charPr id="\d+"[^>]*shadeColor="#F3F4F6"[^>]*>.*?<hh:fontRef hangul="2" latin="2" hanja="2" japanese="2" other="2" symbol="0" user="0"\/>.*?<\/hh:charPr>/
    );
    expect(header).toContain("<hh:supscript/>");
    expect(header).toContain("<hh:subscript/>");
    expect(section).toContain('charPrIDRef="');
    expect(section).toContain("굵게");
    expect(section).toContain("코드");
    expect(section).toContain("위첨자");
    expect(section).toContain("아래첨자");
  });

  it("unsupported font tokens keep run-style-fallback warning", () => {
    const ir = {
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
                  text: "잘못된 폰트",
                  marks: [
                    { type: "code" },
                    {
                      type: "textStyle",
                      attrs: {
                        fontFamily: "Bad<Font>",
                        fontSize: "calc(12px + 1rem)"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];

    expect(result.warnings.map((warning) => warning.code)).toContain(
      "run-style-fallback"
    );
    expect(header).toContain('<hh:font id="1" face="Consolas"');
    expect(header).toContain('shadeColor="#F3F4F6"');
    expect(header).not.toContain("Bad&lt;Font&gt;");
    expect(header).not.toContain('height="calc');
  });

  it("named color, rgb/rgba, and CSS var fallback tokens are normalized for text runs", () => {
    const ir = {
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
                  text: " named",
                  marks: [{ type: "textStyle", attrs: { color: "navy" } }]
                },
                {
                  type: "textRun",
                  text: " rgb",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: { color: "rgb(51, 102, 153)" }
                    }
                  ]
                },
                {
                  type: "textRun",
                  text: " rgba",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: { backgroundColor: "rgba(255, 245, 157, 1)" }
                    }
                  ]
                },
                {
                  type: "textRun",
                  text: " css-var",
                  marks: [
                    {
                      type: "highlight",
                      attrs: { color: "var(--dockit-accent, rgb(0 128 128))" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];

    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "run-style-fallback"
    );
    expect(header).toContain('textColor="#000080"');
    expect(header).toContain('textColor="#336699"');
    expect(header).toContain('shadeColor="#FFF59D"');
    expect(header).toContain('shadeColor="#008080"');
  });

  it("unresolved theme tokens and translucent rgba colors keep run-style-fallback warning", () => {
    const ir = {
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
                  text: " theme token",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: { color: "theme-7" }
                    }
                  ]
                },
                {
                  type: "textRun",
                  text: " alpha",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: { backgroundColor: "rgba(51, 102, 153, 0.5)" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));

    expect(result.warnings.map((warning) => warning.code)).toContain(
      "run-style-fallback"
    );
  });

  it("link runs are emitted as native HWPX hyperlink fields without breaking charPr styling", () => {
    const ir = {
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
                  text: "Dockit 링크",
                  marks: [
                    { type: "bold" },
                    { type: "underline" },
                    {
                      type: "textStyle",
                      attrs: { color: "#336699", fontSize: "13pt" }
                    },
                    {
                      type: "link",
                      attrs: { href: "https://example.com/dockit?x=1&y=2" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    maybeWriteLinkFixture(result);

    expect(warningCodes).not.toContain("run-style-fallback");
    expect(warningCodes).not.toContain("link-attribute-fallback");
    expect(warningCodes).not.toContain("link-target-fallback");
    expect(header).toContain('bold="1"');
    expect(header).toContain('<hh:underline type="BOTTOM"');
    expect(header).toContain('textColor="#336699"');
    expect(header).toContain('height="1300"');
    expect(section).toContain(
      '<hp:fieldBegin id="8800001" type="HYPERLINK" name="" editable="0" dirty="0" zorder="-1" fieldid="8900001"'
    );
    expect(section).toContain(
      '<hp:stringParam name="Command">https\\://example.com/dockit?x=1&amp;y=2;1;0;0;</hp:stringParam>'
    );
    expect(section).toContain(
      '<hp:stringParam name="Category">HWPHYPERLINK_TYPE_URL</hp:stringParam>'
    );
    expect(section).toContain(
      '<hp:stringParam name="TargetType">HWPHYPERLINK_TARGET_HYPERLINK</hp:stringParam>'
    );
    expect(section).toContain(
      '<hp:stringParam name="DocOpenType">HWPHYPERLINK_JUMP_DONTCARE</hp:stringParam>'
    );
    expect(section).toContain("<hp:t>Dockit 링크</hp:t>");
    expect(section).toContain(
      '<hp:fieldEnd beginIDRef="8800001" fieldid="8900001"/>'
    );
  });

  it("unsupported link attributes keep href native and report a link fallback warning", () => {
    const ir = {
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
                  text: "새 창 링크",
                  marks: [
                    {
                      type: "link",
                      attrs: {
                        href: "https://example.com",
                        target: "_blank",
                        title: "Example"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const section = entries["Contents/section0.xml"];
    const linkWarning = result.warnings.find(
      (warning) => warning.code === "link-attribute-fallback"
    );

    expect(section).toContain('type="HYPERLINK"');
    expect(section).toContain(
      '<hp:stringParam name="Command">https\\://example.com;1;0;0;</hp:stringParam>'
    );
    expect(linkWarning).toMatchObject({
      severity: "warning",
      message: expect.stringContaining("target, title")
    });
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "run-style-fallback"
    );
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "link-target-fallback"
    );
  });

  it("mailto links are emitted as native HWPX hyperlink fields", () => {
    const ir = {
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
                  text: "메일 보내기",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "mailto:hello@example.com" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const section = entries["Contents/section0.xml"];

    expect(section).toContain('type="HYPERLINK"');
    expect(section).toContain(
      '<hp:stringParam name="Command">mailto\\:hello@example.com;1;0;0;</hp:stringParam>'
    );
    expect(section).toContain("<hp:t>메일 보내기</hp:t>");
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "link-target-fallback"
    );
  });

  it("internal, file, unsafe, and empty link targets stay visible without native hyperlink fields", () => {
    const ir = {
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
                  text: "내부 링크",
                  marks: [{ type: "link", attrs: { href: "#heading-1" } }]
                },
                {
                  type: "textRun",
                  text: " 파일 링크",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "file:///C:/secret/report.hwpx" }
                    }
                  ]
                },
                {
                  type: "textRun",
                  text: " 스크립트 링크",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "javascript:alert(1)" }
                    }
                  ]
                },
                {
                  type: "textRun",
                  text: " 빈 링크",
                  marks: [{ type: "link", attrs: { href: "" } }]
                }
              ]
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(ir));
    const entries = readZipEntries(result.packageBytes);
    const section = entries["Contents/section0.xml"];
    const targetWarnings = result.warnings.filter(
      (warning) => warning.code === "link-target-fallback"
    );

    expect(section).not.toContain('type="HYPERLINK"');
    expect(section).toContain("<hp:t>내부 링크</hp:t>");
    expect(section).toContain("<hp:t> 파일 링크</hp:t>");
    expect(section).toContain("<hp:t> 스크립트 링크</hp:t>");
    expect(section).toContain("<hp:t> 빈 링크</hp:t>");
    expect(targetWarnings).toHaveLength(4);
    expect(targetWarnings.map((warning) => warning.message).join("\n")).toContain(
      "internal anchor"
    );
    expect(targetWarnings.map((warning) => warning.message).join("\n")).toContain(
      "file link"
    );
    expect(targetWarnings.map((warning) => warning.message).join("\n")).toContain(
      "unsupported scheme: javascript"
    );
    expect(targetWarnings.map((warning) => warning.message).join("\n")).toContain(
      "missing href"
    );
  });

  it("IR + normalized model views만 입력으로 받아 최소 HWPX package entries를 만든다", () => {
    const input = createHWPXMinimalExportInput(paragraphHeadingReadinessIR);
    const result = exportIRToMinimalHWPX(input);
    const entries = readZipEntries(result.packageBytes);

    expect(input).toMatchObject({
      version: "hwpx-minimal-export-input-v1",
      styleSections: [
        {
          sectionIndex: 0,
          blocks: [
            { blockType: "heading" },
            { blockType: "paragraph" }
          ]
        }
      ],
      blockViews: [
        { blockType: "heading" },
        { blockType: "paragraph" }
      ]
    });
    expect(result.entries.map((entry) => entry.path)).toEqual([
      "mimetype",
      "META-INF/manifest.xml",
      "version.xml",
      "META-INF/container.xml",
      "META-INF/container.rdf",
      "Contents/content.hpf",
      "Contents/header.xml",
      "Contents/section0.xml",
      "Preview/PrvText.txt",
      "Scripts/headerScripts.js",
      "Scripts/sourceScripts.js",
      "settings.xml"
    ]);
    expect(entries.mimetype).toBe("application/hwp+zip");
    expect(entries["META-INF/container.xml"]).toContain("Contents/content.hpf");
    expect(entries["Contents/content.hpf"]).toContain("Contents/header.xml");
    expect(entries["Contents/content.hpf"]).toContain("Contents/section0.xml");
    expect(entries["Contents/content.hpf"]).toContain('idref="header"');
    expect(entries["Contents/header.xml"]).toContain('secCnt="1"');
    expect(entries["version.xml"]).toContain("hv:HCFVersion");
    expect(entries["Contents/section0.xml"]).toContain("Export readiness");
    expect(entries["Contents/section0.xml"]).toContain(
      "A long paragraph with an inline tag."
    );
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "run-style-fallback"
    );
  });

  it("ordered list는 numbering model의 start 값을 HWPX native numbering으로 연결한다", () => {
    const input = createHWPXMinimalExportInput(listTableReadinessIR);
    const result = exportIRToMinimalHWPX(input);
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(input.listNumberingModels[0]).toMatchObject({
      rootListType: "ordered",
      items: [{ effectiveNumber: 3 }]
    });
    expect(header).toContain('<hh:numberings itemCnt="1">');
    expect(header).toContain('<hh:paraHead start="3"');
    expect(header).toContain('<hh:heading type="NUMBER" idRef="1" level="0"/>');
    expect(section).toContain('paraPrIDRef="7"');
    expect(section).toContain("<hp:t>Nested item</hp:t>");
    expect(section).not.toContain("3. Nested item");
    expect(section).not.toContain("dockit:");
    expect(warningCodes).not.toContain("list-marker-text-fallback");
  });

  it("bullet list는 HWPX native bullet definition으로 연결한다", () => {
    const bulletIR = {
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
                      runs: [
                        {
                          type: "textRun",
                          text: "Bullet item",
                          marks: []
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
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(bulletIR));
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(header).toContain('<hh:bullets itemCnt="1">');
    expect(header).toContain('<hh:bullet id="1"');
    expect(header).toContain('<hh:heading type="BULLET" idRef="1" level="0"/>');
    expect(section).toContain('paraPrIDRef="7"');
    expect(section).toContain("<hp:t>Bullet item</hp:t>");
    expect(section).not.toContain("• Bullet item");
    expect(warningCodes).not.toContain("list-marker-text-fallback");
  });

  it("basic table은 grid/colspan/rowspan/border metadata를 section XML에 싣는다", () => {
    const input = createHWPXMinimalExportInput(listTableReadinessIR);
    const result = exportIRToMinimalHWPX(input);
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(input.tableModels[0]).toMatchObject({
      rowCount: 1,
      columnCount: 1,
      cells: [{ gridRowSpan: 2, gridColumnSpan: 1 }]
    });
    expect(header).toContain('<hh:borderFills itemCnt="3">');
    expect(header).toContain('<hh:borderFill id="2"');
    expect(header).toContain('<hh:borderFill id="3"');
    expect(header).toContain(
      '<hh:leftBorder type="SOLID" width="0.4 mm" color="#333333"/>'
    );
    expect(header).toContain(
      '<hh:fillBrush><hc:winBrush faceColor="#F5F5F5" hatchColor="#000000" alpha="0"/></hh:fillBrush>'
    );
    expect(section).toContain("<hp:tbl");
    expect(section).toContain('hp:tbl id="2147000000"');
    expect(section).toContain('cellSpacing="0" borderFillIDRef="2"');
    expect(section).toContain('hp:tc name=""');
    expect(section).toContain('dirty="0" borderFillIDRef="3"');
    expect(section).toContain('<hp:sz width="1800"');
    expect(section).toContain('<hp:cellSpan colSpan="1" rowSpan="1"');
    expect(section).toContain('<hp:cellAddr colAddr="0" rowAddr="0"');
    expect(section).toContain("Merged cell");
    expect(section).not.toContain("dockit:");
    expect(warningCodes).toEqual(
      expect.arrayContaining(["table-merge-layout-warning"])
    );
    expect(warningCodes).not.toContain("table-border-metadata-only");
  });

  it("table/cell per-side border를 HWPX borderFill definition으로 매핑한다", () => {
    const perSideBorderIR = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "table",
              attrs: {
                borderColor: "#111111",
                borderStyle: "solid",
                borderWidth: "1pt"
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
                        colspan: 1,
                        rowspan: 1,
                        colwidth: [100],
                        borderTopColor: "#ff0000",
                        borderTopStyle: "dashed",
                        borderTopWidth: "2pt",
                        borderRightColor: "#00ff00",
                        borderRightStyle: "dotted",
                        borderRightWidth: "0.5pt",
                        borderBottomColor: "#0000ff",
                        borderBottomStyle: "double",
                        borderBottomWidth: "1mm"
                      },
                      blocks: [
                        {
                          type: "paragraph",
                          attrs: {},
                          runs: [
                            {
                              type: "textRun",
                              text: "Per-side cell",
                              marks: []
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
        }
      ]
    };
    const result = exportIRToMinimalHWPX(
      createHWPXMinimalExportInput(perSideBorderIR)
    );
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];

    expect(header).toContain('<hh:borderFills itemCnt="3">');
    expect(header).toContain('<hh:borderFill id="3"');
    expect(header).toContain(
      '<hh:topBorder type="DASH" width="0.7 mm" color="#FF0000"/>'
    );
    expect(header).toContain(
      '<hh:rightBorder type="DOT" width="0.2 mm" color="#00FF00"/>'
    );
    expect(header).toContain(
      '<hh:bottomBorder type="DOUBLE_SLIM" width="1.0 mm" color="#0000FF"/>'
    );
    expect(section).toContain('cellSpacing="0" borderFillIDRef="2"');
    expect(section).toContain('dirty="0" borderFillIDRef="3"');
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "table-border-metadata-only"
    );
  });

  it("table border color tokens are normalized before HWPX borderFill output", () => {
    const tokenBorderIR = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "table",
              attrs: {
                borderColor: "rgb(51 102 153)",
                borderStyle: "solid",
                borderWidth: "1pt"
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
                        colspan: 1,
                        rowspan: 1,
                        colwidth: [100],
                        backgroundColor: "var(--dockit-fill, rgb(255 245 157))",
                        borderTopColor: "navy",
                        borderTopStyle: "dashed",
                        borderTopWidth: "1pt",
                        borderRightColor: "var(--dockit-border, #0f0)",
                        borderRightStyle: "dotted",
                        borderRightWidth: "1pt"
                      },
                      blocks: [
                        {
                          type: "paragraph",
                          attrs: {},
                          runs: [
                            {
                              type: "textRun",
                              text: "Token border cell",
                              marks: []
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
        }
      ]
    };
    const result = exportIRToMinimalHWPX(
      createHWPXMinimalExportInput(tokenBorderIR)
    );
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];

    expect(header).toContain(
      '<hh:topBorder type="DASH" width="0.4 mm" color="#000080"/>'
    );
    expect(header).toContain(
      '<hh:rightBorder type="DOT" width="0.4 mm" color="#00FF00"/>'
    );
    expect(header).toContain(
      '<hc:winBrush faceColor="#FFF59D" hatchColor="#000000" alpha="0"/>'
    );
    expect(header).toContain('color="#336699"');
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "table-border-style-fallback"
    );
  });

  it("merged table은 effective row count와 span height를 HWPX cell geometry에 반영한다", () => {
    const input = createHWPXMinimalExportInput(createMergedTableIR());
    const result = exportIRToMinimalHWPX(input);
    const entries = readZipEntries(result.packageBytes);
    const section = entries["Contents/section0.xml"];
    const warningCodes = result.warnings.map((warning) => warning.code);

    maybeWriteMergedTableFixture(result);

    expect(input.tableModels[0]).toMatchObject({
      rowCount: 2,
      columnCount: 2,
      cells: [
        { gridColumnStart: 0, gridColumnSpan: 1, gridRowSpan: 2 },
        { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 },
        { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 }
      ]
    });
    expect(section).toContain('rowCnt="2" colCnt="2"');
    expect(section).toContain('<hp:sz width="4200" widthRelTo="ABSOLUTE" height="5400"');
    expect(section).toContain('<hp:cellAddr colAddr="0" rowAddr="0"');
    expect(section).toContain('<hp:cellSpan colSpan="1" rowSpan="2"');
    expect(section).toContain('<hp:cellSz width="1800" height="5400"');
    expect(section).toContain('<hp:cellAddr colAddr="1" rowAddr="1"');
    expect(section).toContain("Merged left");
    expect(section).toContain("Top right");
    expect(section).toContain("Bottom right");
    expect(warningCodes).toContain("table-merge-layout-warning");
    expect(
      result.warnings.find((warning) => warning.code === "table-merge-layout-warning")
        ?.message
    ).toContain("coveredSlots=1; rowGroups=1; risks=covered-slot,uneven-row-group");
    expect(warningCodes).not.toContain("table-border-metadata-only");
  });

  it("table merge fixture matrix는 colspan/rowspan/mixed/clamped rowspan XML geometry를 고정한다", () => {
    const cases = [
      {
        fileName: "minimal-table-merge-colspan-only.hwpx",
        ir: createColspanOnlyTableIR(),
        gridView: {
          coveredSlots: 1,
          emptySlots: 0,
          rowGroups: [],
          riskCodes: ["covered-slot"]
        },
        model: {
          rowCount: 2,
          columnCount: 3,
          cells: [
            { gridColumnStart: 0, gridColumnSpan: 2, gridRowSpan: 1 },
            { gridColumnStart: 2, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 0, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 2, gridColumnSpan: 1, gridRowSpan: 1 }
          ]
        },
        expectedXml: [
          'rowCnt="2" colCnt="3"',
          '<hp:sz width="5100" widthRelTo="ABSOLUTE" height="4200"',
          '<hp:cellAddr colAddr="0" rowAddr="0"',
          '<hp:cellSpan colSpan="2" rowSpan="1"',
          '<hp:cellSz width="3000" height="2000"',
          '<hp:cellAddr colAddr="2" rowAddr="1"'
        ],
        expectedText: ["Colspan top", "Bottom middle"]
      },
      {
        fileName: "minimal-table-merge-rowspan-only.hwpx",
        ir: createRowspanOnlyTableIR(),
        gridView: {
          coveredSlots: 2,
          emptySlots: 0,
          rowGroups: [
            {
              startRowIndex: 0,
              endRowIndex: 2,
              coveredSlotCount: 2,
              requiresNormalization: true
            }
          ],
          riskCodes: ["covered-slot", "uneven-row-group"]
        },
        model: {
          rowCount: 3,
          columnCount: 2,
          cells: [
            { gridColumnStart: 0, gridColumnSpan: 1, gridRowSpan: 3 },
            { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 }
          ]
        },
        expectedXml: [
          'rowCnt="3" colCnt="2"',
          '<hp:sz width="3300" widthRelTo="ABSOLUTE" height="7200"',
          '<hp:cellAddr colAddr="0" rowAddr="0"',
          '<hp:cellSpan colSpan="1" rowSpan="3"',
          '<hp:cellSz width="1500" height="7200"',
          '<hp:cellAddr colAddr="1" rowAddr="2"'
        ],
        expectedText: ["Rowspan left", "R3C2"]
      },
      {
        fileName: "minimal-table-merge-mixed-span.hwpx",
        ir: createMixedSpanTableIR(),
        gridView: {
          coveredSlots: 3,
          emptySlots: 0,
          rowGroups: [
            {
              startRowIndex: 0,
              endRowIndex: 1,
              coveredSlotCount: 3,
              requiresNormalization: true
            }
          ],
          riskCodes: ["covered-slot", "uneven-row-group"]
        },
        model: {
          rowCount: 3,
          columnCount: 3,
          cells: [
            { gridColumnStart: 0, gridColumnSpan: 2, gridRowSpan: 2 },
            { gridColumnStart: 2, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 2, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 0, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 2, gridColumnSpan: 1, gridRowSpan: 1 }
          ]
        },
        expectedXml: [
          'rowCnt="3" colCnt="3"',
          '<hp:sz width="5400" widthRelTo="ABSOLUTE" height="7300"',
          '<hp:cellAddr colAddr="0" rowAddr="0"',
          '<hp:cellSpan colSpan="2" rowSpan="2"',
          '<hp:cellSz width="3000" height="4800"',
          '<hp:cellAddr colAddr="2" rowAddr="1"'
        ],
        expectedText: ["Mixed block", "Middle right", "Bottom middle"]
      },
      {
        fileName: "minimal-table-merge-clamped-rowspan.hwpx",
        ir: createClampedRowspanTableIR(),
        gridView: {
          coveredSlots: 1,
          emptySlots: 0,
          rowGroups: [
            {
              startRowIndex: 0,
              endRowIndex: 1,
              coveredSlotCount: 1,
              requiresNormalization: true
            }
          ],
          riskCodes: ["rowspan-clamped", "covered-slot", "uneven-row-group"]
        },
        model: {
          rowCount: 2,
          columnCount: 2,
          cells: [
            { gridColumnStart: 0, gridColumnSpan: 1, gridRowSpan: 5 },
            { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 },
            { gridColumnStart: 1, gridColumnSpan: 1, gridRowSpan: 1 }
          ]
        },
        expectedXml: [
          'rowCnt="2" colCnt="2"',
          '<hp:sz width="3450" widthRelTo="ABSOLUTE" height="4600"',
          '<hp:cellAddr colAddr="0" rowAddr="0"',
          '<hp:cellSpan colSpan="1" rowSpan="2"',
          '<hp:cellSz width="1500" height="4600"',
          '<hp:cellAddr colAddr="1" rowAddr="1"'
        ],
        expectedText: ["Oversized rowspan", "Clamp bottom"]
      }
    ];
    const fixtureResults = {};

    cases.forEach((fixtureCase) => {
      const originalIRSnapshot = JSON.stringify(fixtureCase.ir);
      const input = createHWPXMinimalExportInput(fixtureCase.ir);
      const result = exportIRToMinimalHWPX(input);
      const entries = readZipEntries(result.packageBytes);
      const section = entries["Contents/section0.xml"];
      const warningCodes = result.warnings.map((warning) => warning.code);
      const gridView = createHWPXNormalizedTableGridView(input.tableModels[0]);
      const mergeWarning = result.warnings.find(
        (warning) => warning.code === "table-merge-layout-warning"
      );

      fixtureResults[fixtureCase.fileName] = result;

      expect(JSON.stringify(fixtureCase.ir)).toBe(originalIRSnapshot);
      expect(Object.isFrozen(gridView)).toBe(true);
      expect(input.tableModels[0]).toMatchObject(fixtureCase.model);
      expect(gridView.coveredSlots).toHaveLength(fixtureCase.gridView.coveredSlots);
      expect(gridView.emptySlots).toHaveLength(fixtureCase.gridView.emptySlots);
      expect(gridView.rowGroups).toMatchObject(fixtureCase.gridView.rowGroups);
      expect(Array.from(new Set(gridView.risks.map((risk) => risk.code)))).toEqual(
        fixtureCase.gridView.riskCodes
      );
      fixtureCase.expectedXml.forEach((xml) => {
        expect(section).toContain(xml);
      });
      fixtureCase.expectedText.forEach((text) => {
        expect(section).toContain(text);
      });
      expect(warningCodes).toContain("table-merge-layout-warning");
      expect(mergeWarning?.message).toContain(
        `coveredSlots=${fixtureCase.gridView.coveredSlots}`
      );
      expect(mergeWarning?.message).toContain(
        `rowGroups=${fixtureCase.gridView.rowGroups.length}`
      );
      expect(warningCodes).not.toContain("table-border-metadata-only");
    });

    maybeWriteTableMergeMatrixFixtures(fixtureResults);
  });

  it("object와 unsupported block은 placeholder와 warning으로 남긴다", () => {
    const input = createHWPXMinimalExportInput(objectUnsupportedReadinessIR);
    const result = exportIRToMinimalHWPX(input);
    const entries = readZipEntries(result.packageBytes);
    const section = entries["Contents/section0.xml"];
    const objectWarning = result.warnings.find(
      (warning) => warning.code === "object-placeholder"
    );
    const unsupportedWarning = result.warnings.find(
      (warning) => warning.code === "unsupported-block"
    );

    expect(input.objectModels[0]).toMatchObject({
      objectKind: "image",
      relationship: {
        objectId: "img-1",
        targetKind: "url"
      }
    });
    expect(section).toContain("[Object placeholder: image img-1]");
    expect(section).toContain("[Unsupported block: columnBlock]");
    expect(objectWarning).toMatchObject({ severity: "warning" });
    expect(unsupportedWarning).toMatchObject({ severity: "blocked" });
  });

  it("codeBlock fallback은 원문 텍스트를 code-like HWPX paragraph style로 보존한다", () => {
    const result = exportIRToMinimalHWPX(
      createHWPXMinimalExportInput(createUnsupportedRawTextIR())
    );
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const previewText = entries["Preview/PrvText.txt"];
    const semanticWarning = result.warnings.find(
      (warning) => warning.code === "semantic-block-fallback"
    );

    expect(section).toContain("const dockit = true;");
    expect(section).toContain("return dockit;");
    expect(section).not.toContain("[Unsupported block: codeBlock]");
    expect(section).toContain('paraPrIDRef="100"');
    expect(header).toContain('<hh:paraPr id="100"');
    expect(header).toContain('<hh:font id="1" face="Consolas"');
    expect(header).toContain('shadeColor="#F3F4F6"');
    expect(previewText).toContain("const dockit = true;");
    expect(previewText).toContain("return dockit;");
    expect(semanticWarning).toMatchObject({ severity: "warning" });
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "unsupported-block"
    );
  });

  it("blockquote fallback은 원문 텍스트를 quote-like HWPX paragraph style로 보존한다", () => {
    const result = exportIRToMinimalHWPX(
      createHWPXMinimalExportInput(createBlockquoteRawTextIR())
    );
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];
    const previewText = entries["Preview/PrvText.txt"];
    const semanticWarning = result.warnings.find(
      (warning) => warning.code === "semantic-block-fallback"
    );

    expect(section).toContain("인용문 첫 줄");
    expect(section).toContain("인용문 둘째 줄");
    expect(section).not.toContain("[Unsupported block: blockquote]");
    expect(section).toContain('paraPrIDRef="101"');
    expect(header).toContain('<hh:paraPr id="101"');
    expect(header).toContain('<hc:left value="850" unit="HWPUNIT"/>');
    expect(header).toContain('italic="1"');
    expect(header).toContain('textColor="#374151"');
    expect(previewText).toContain("인용문 첫 줄");
    expect(previewText).toContain("인용문 둘째 줄");
    expect(semanticWarning).toMatchObject({ severity: "warning" });
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "unsupported-block"
    );
  });

  it("semantic block fixture는 codeBlock과 blockquote fallback을 함께 고정한다", () => {
    const result = exportIRToMinimalHWPX(
      createHWPXMinimalExportInput(createSemanticBlocksIR())
    );
    const entries = readZipEntries(result.packageBytes);
    const header = entries["Contents/header.xml"];
    const section = entries["Contents/section0.xml"];

    maybeWriteSemanticBlocksFixture(result);

    expect(section).toContain("Semantic fallback blocks");
    expect(section).toContain("const dockit = true;");
    expect(section).toContain("return dockit;");
    expect(section).toContain("인용문 첫 줄");
    expect(section).toContain("인용문 둘째 줄");
    expect(section).toContain('paraPrIDRef="100"');
    expect(section).toContain('paraPrIDRef="101"');
    expect(header).toContain('<hh:paraPr id="100"');
    expect(header).toContain('<hh:paraPr id="101"');
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "semantic-block-fallback",
      "semantic-block-fallback"
    ]);
  });

  it("embedded PNG data URI image object는 BinData media part와 hp:pic 참조로 출력한다", () => {
    const input = createHWPXMinimalExportInput(createEmbeddedImageIR());
    const result = exportIRToMinimalHWPX(input);
    const entries = readZipEntries(result.packageBytes);
    const contentHpf = entries["Contents/content.hpf"];
    const section = entries["Contents/section0.xml"];
    const imageEntry = result.entries.find(
      (entry) => entry.path === "BinData/dockit-image-fixture.png"
    );

    expect(input.objectModels[0]).toMatchObject({
      objectKind: "image",
      relationship: {
        targetKind: "data-uri",
        mimeType: "image/png",
        fileName: "dockit-image-fixture.png"
      }
    });
    expect(imageEntry).toMatchObject({
      path: "BinData/dockit-image-fixture.png",
      mediaType: "image/png"
    });
    expect(Array.from(imageEntry.content)).toEqual(Array.from(imageFixtureBytes));
    expect(contentHpf).toContain(
      '<opf:item id="image1" href="BinData/dockit-image-fixture.png" media-type="image/png" isEmbeded="1"/>'
    );
    expect(section).toContain("<hp:pic");
    expect(section).toContain('<hc:img binaryItemIDRef="image1"');
    expect(section).toContain('<hp:orgSz width="1200" height="1200"/>');
    expect(section).toContain('<hp:sz width="1200"');
    expect(section).toContain("<hp:t/>");
    expect(section).not.toContain("[Object placeholder: image");
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      "object-placeholder"
    );
  });

  it("image가 아닌 object는 기존 placeholder fallback을 유지한다", () => {
    const shapeIR = {
      ...paragraphHeadingReadinessIR,
      sections: [
        {
          ...paragraphHeadingReadinessIR.sections[0],
          blocks: [
            {
              type: "object",
              objectType: "shapeBlock",
              flowMode: "block",
              anchorMode: "paragraph",
              attrs: {
                objectId: "shape-1",
                width: "80px",
                height: "40px"
              },
              children: []
            }
          ]
        }
      ]
    };
    const result = exportIRToMinimalHWPX(createHWPXMinimalExportInput(shapeIR));
    const entries = readZipEntries(result.packageBytes);

    expect(entries["Contents/section0.xml"]).toContain(
      "[Object placeholder: shape shape-1]"
    );
    expect(entries["Contents/section0.xml"]).not.toContain("<hp:pic");
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "object-placeholder"
    );
  });

  it("v0 warning contract는 현재 export가 내보내는 code와 severity를 모두 덮는다", () => {
    [
      paragraphHeadingReadinessIR,
      listTableReadinessIR,
      objectUnsupportedReadinessIR,
      createEmbeddedImageIR()
    ].forEach((irDocument) => {
      const result = exportIRToHWPXV0(createHWPXV0ExportInput(irDocument));

      result.warnings.forEach((warning) => {
        expect(HWPX_V0_WARNING_CONTRACT[warning.code]).toBeDefined();
        expect(warning.severity).toBe(
          HWPX_V0_WARNING_CONTRACT[warning.code].severity
        );
      });
    });
  });
});
