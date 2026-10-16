import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  importDOCXToIR,
  readDOCXPackageFromBytes
} from "../../app/LIB/ir/docxImport";
import {
  createHWPXV0ExportInput,
  exportIRToHWPXV0
} from "../../app/LIB/ir/hwpxMinimalExport";
import { importHWPXToIR } from "../../app/LIB/ir/hwpxImport";

const fixturePath = (...parts) =>
  path.join(process.cwd(), "tests", "fixtures", "docx", ...parts);

const readDOCXFixture = (fileName) => readFileSync(fixturePath(fileName));

const importDOCXFixture = (fileName) =>
  importDOCXToIR(readDOCXFixture(fileName), {
    sourceName: fileName,
    extractedAt: "2026-07-01T00:00:00.000Z"
  });

const inflateRaw = (bytes) => new Uint8Array(inflateRawSync(bytes));

const inlineText = (runs) =>
  runs.map((run) => (run.type === "textRun" ? run.text : "\n")).join("");

const textRuns = (block) => block.runs.filter((run) => run.type === "textRun");

const linkMark = (run) => run.marks.find((mark) => mark.type === "link");

const blockText = (block) => {
  if (block.type === "paragraph" || block.type === "heading") {
    return inlineText(block.runs);
  }

  if (block.type === "list") {
    return block.items.map((item) => item.blocks.map(blockText).join("")).join("\n");
  }

  if (block.type === "table") {
    return block.rows
      .map((row) =>
        row.cells.map((cell) => cell.blocks.map(blockText).join("")).join("\t")
      )
      .join("\n");
  }

  return "";
};

const normalizeColor = (value) =>
  typeof value === "string" && /^#?[0-9a-fA-F]{6}$/.test(value)
    ? `#${value.replace(/^#/, "").toUpperCase()}`
    : value ?? null;

const firstPresent = (...values) =>
  values.find((value) => value !== null && value !== undefined) ?? null;

const projectTextBlock = (block) => ({
  type: block.type,
  level: block.type === "heading" ? block.attrs.level ?? null : null,
  text: inlineText(block.runs),
  links: textRuns(block)
    .flatMap((run) =>
      run.marks
        .filter((mark) => mark.type === "link")
        .map((mark) => mark.attrs?.href ?? null)
    )
    .filter(Boolean)
});

const projectList = (block) => ({
  type: "list",
  listType: block.listType,
  start: block.listType === "ordered" ? block.attrs.start ?? null : null,
  items: block.items.map((item) => ({
    value: block.listType === "ordered" ? item.attrs.value ?? null : null,
    text: item.blocks.map(blockText).join("")
  }))
});

const projectTable = (block) => ({
  type: "table",
  borderColor: normalizeColor(
    firstPresent(
      block.attrs.borderColor,
      block.attrs.borderTopColor,
      block.attrs.borderRightColor,
      block.attrs.borderBottomColor,
      block.attrs.borderLeftColor
    )
  ),
  borderStyle: firstPresent(
    block.attrs.borderStyle,
    block.attrs.borderTopStyle,
    block.attrs.borderRightStyle,
    block.attrs.borderBottomStyle,
    block.attrs.borderLeftStyle
  ),
  rows: block.rows.map((row) => ({
    cells: row.cells.map((cell) => ({
      text: cell.blocks.map(blockText).join(""),
      colspan: cell.attrs.colspan ?? 1,
      backgroundColor: normalizeColor(cell.attrs.backgroundColor),
      borderColor: normalizeColor(
        firstPresent(
          cell.attrs.borderColor,
          cell.attrs.borderTopColor,
          cell.attrs.borderRightColor,
          cell.attrs.borderBottomColor,
          cell.attrs.borderLeftColor
        )
      ),
      borderStyle: firstPresent(
        cell.attrs.borderStyle,
        cell.attrs.borderTopStyle,
        cell.attrs.borderRightStyle,
        cell.attrs.borderBottomStyle,
        cell.attrs.borderLeftStyle
      )
    }))
  }))
});

const projectImage = (block) => ({
  type: "image",
  objectType: block.objectType,
  mimeType: block.attrs.mimeType ?? null,
  title: block.attrs.title ?? null,
  altText: block.attrs.altText ?? null,
  hasBinaryEntry: Boolean(block.attrs.hasBinaryEntry),
  binaryRestored: block.attrs.binaryRestored ?? null
});

const projectCellBlocks = (blocks) =>
  blocks.flatMap((block) => {
    if (block.type === "paragraph" || block.type === "heading") {
      return [projectTextBlock(block)];
    }

    if (block.type === "object" && block.objectType === "image") {
      return [projectImage(block)];
    }

    return [];
  });

const isObjectPlaceholderParagraph = (block) =>
  block.type === "paragraph" &&
  inlineText(block.runs).startsWith("[Object placeholder: image ");

const projectParagraphTabs = (block) =>
  Array.isArray(block.attrs.docxParagraphTabs)
    ? block.attrs.docxParagraphTabs.map((tabStop) => ({
        positionTwips: tabStop.positionTwips,
        type: tabStop.type ?? null,
        leader: tabStop.leader ?? null
      }))
    : null;

const projectSupportedSemantics = (
  irDocument,
  { includeImages = true, includeObjectPlaceholders = false } = {}
) =>
  irDocument.sections.flatMap((section) =>
    section.blocks.flatMap((block) => {
      if (block.type === "paragraph" || block.type === "heading") {
        if (includeObjectPlaceholders || !isObjectPlaceholderParagraph(block)) {
          return [projectTextBlock(block)];
        }

        return [];
      }

      if (block.type === "list") {
        return [projectList(block)];
      }

      if (block.type === "table") {
        return [projectTable(block)];
      }

      if (includeImages && block.type === "object" && block.objectType === "image") {
        return [projectImage(block)];
      }

      return [];
    })
  );

const assertOnlyDOCXWarnings = (
  result,
  allowedCodes = ["docx-import-section-properties-partial"]
) => {
  const allowed = new Set(allowedCodes);
  const unexpected = result.warnings
    .map((warning) => warning.code)
    .filter((code) => !allowed.has(code));

  expect(unexpected).toEqual([]);
};

const assertNoUnexpectedDOCXWarnings = (result) =>
  assertOnlyDOCXWarnings(result);

const expectedMixedProjection = [
  {
    type: "heading",
    level: 2,
    text: "Dockit launch memo",
    links: []
  },
  {
    type: "paragraph",
    level: null,
    text: "Review HWPX and DOCX guide before release.",
    links: ["https://example.com/dockit/guide"]
  },
  {
    type: "list",
    listType: "ordered",
    start: 4,
    items: [
      { value: 4, text: "Import samples" },
      { value: 5, text: "Export samples" }
    ]
  },
  {
    type: "list",
    listType: "bullet",
    start: null,
    items: [{ value: null, text: "Keep warnings explicit" }]
  },
  {
    type: "table",
    borderColor: "#4B5563",
    borderStyle: "solid",
    rows: [
      {
        cells: [
          {
            text: "Conversion status",
            colspan: 2,
            backgroundColor: "#E8F3FF",
            borderColor: "#4B5563",
            borderStyle: "solid"
          }
        ]
      },
      {
        cells: [
          {
            text: "HWPX",
            colspan: 1,
            backgroundColor: "#FFFFFF",
            borderColor: "#4B5563",
            borderStyle: "solid"
          },
          {
            text: "DOCX",
            colspan: 1,
            backgroundColor: "#F9FAFB",
            borderColor: "#4B5563",
            borderStyle: "solid"
          }
        ]
      }
    ]
  },
  {
    type: "image",
    objectType: "image",
    mimeType: "image/png",
    title: "Fixture image",
    altText: "Fixture image alt",
    hasBinaryEntry: true,
    binaryRestored: true
  }
];

const expectedMixedProjectionAfterHWPX = expectedMixedProjection.map((block) => {
  if (block.type !== "table") {
    return block;
  }

  return {
    ...block,
    rows: block.rows.map((row, rowIndex) => ({
      cells: row.cells.map((cell, cellIndex) => ({
        ...cell,
        backgroundColor:
          rowIndex === 1 && cellIndex === 0 ? null : cell.backgroundColor
      }))
    }))
  };
});

describe("DOCX real fixture import", () => {
  it("reads checked-in DOCX binaries and reports required OpenXML entries", () => {
    const packageSummary = readDOCXPackageFromBytes(
      readDOCXFixture("real-supported-s2-mixed.docx")
    ).packageSummary;

    expect(packageSummary.requiredEntries).toEqual({
      contentTypes: true,
      packageRels: true,
      documentXml: true
    });
    expect(packageSummary.optionalEntries).toEqual({
      documentRels: true,
      stylesXml: true,
      numberingXml: true
    });
    expect(packageSummary.entries).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "word/_rels/document.xml.rels",
        "word/document.xml",
        "word/media/dockit-image-fixture.png",
        "word/numbering.xml",
        "word/styles.xml"
      ])
    );
  });

  it("imports a real simple list fixture with heading style inheritance", () => {
    const result = importDOCXFixture("real-simple-list.docx");
    const [heading, orderedList, bulletList] = result.irDocument.sections[0].blocks;

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(inlineText(heading.runs)).toBe("Real fixture list");
    expect(textRuns(heading)[0].marks).toContainEqual({ type: "bold" });
    expect(orderedList).toMatchObject({
      type: "list",
      listType: "ordered",
      attrs: { start: 4 },
      items: [
        { type: "listItem", attrs: { value: 4 } },
        { type: "listItem", attrs: { value: 5 } }
      ]
    });
    expect(orderedList.items.map((item) => blockText(item.blocks[0]))).toEqual([
      "Import samples",
      "Export samples"
    ]);
    expect(bulletList).toMatchObject({
      type: "list",
      listType: "bullet",
      attrs: {},
      items: [{ type: "listItem", attrs: {} }]
    });
    expect(blockText(bulletList.items[0].blocks[0])).toBe(
      "Keep warnings explicit"
    );
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("imports a real table/link fixture with cell styles and external hrefs", () => {
    const result = importDOCXFixture("real-table-link.docx");
    const [, paragraphBlock, table] = result.irDocument.sections[0].blocks;
    const linkRun = textRuns(paragraphBlock).find((run) =>
      run.text.includes("DOCX guide")
    );

    expect(inlineText(paragraphBlock.runs)).toBe(
      "Review DOCX guide before release."
    );
    expect(linkMark(linkRun)).toEqual({
      type: "link",
      attrs: { href: "https://example.com/dockit/guide" }
    });
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(table.rows[0].cells[0]).toMatchObject({
      attrs: {
        colspan: 2,
        colwidth: [140, 180],
        verticalAlign: "center",
        backgroundColor: "#E8F3FF",
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(blockText(table.rows[0].cells[0].blocks[0])).toBe(
      "Conversion status"
    );
    expect(table.rows[1].cells.map((cell) => cell.attrs.colwidth)).toEqual([
      [140],
      [180]
    ]);
    expect(table.rows[1].cells.map((cell) => cell.attrs.backgroundColor)).toEqual([
      "#FFFFFF",
      "#F9FAFB"
    ]);
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("imports a real merged table fixture with spans and grid widths", () => {
    const result = importDOCXFixture("real-merged-table.docx");
    const [heading, table] = result.irDocument.sections[0].blocks;

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real merged table");
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0].cells).toHaveLength(1);
    expect(table.rows[0].cells[0]).toMatchObject({
      attrs: {
        colspan: 3,
        colwidth: [120, 160, 200],
        verticalAlign: "center",
        backgroundColor: "#DDEBFF"
      }
    });
    expect(blockText(table.rows[0].cells[0].blocks[0])).toBe(
      "Merged schedule"
    );
    expect(table.rows[1].cells).toHaveLength(3);
    expect(table.rows[1].cells[0]).toMatchObject({
      attrs: {
        rowspan: 2,
        colwidth: [120],
        verticalAlign: "center",
        backgroundColor: "#FEF3C7"
      }
    });
    expect(blockText(table.rows[1].cells[0].blocks[0])).toBe("Phase A");
    expect(table.rows[1].cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Phase A",
      "Docs",
      "Ready"
    ]);
    expect(table.rows[2].cells).toHaveLength(2);
    expect(table.rows[2].cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "QA",
      "Queued"
    ]);
    expect(table.rows[2].cells.map((cell) => cell.attrs.colwidth)).toEqual([
      [160],
      [200]
    ]);
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("keeps a real nested table fixture as warning-backed unsupported content", () => {
    const result = importDOCXFixture("real-nested-table.docx");
    const [heading, table] = result.irDocument.sections[0].blocks;
    const outerCell = table.rows[0].cells[0];
    const unsupported = outerCell.blocks.find((block) => block.type === "unsupported");

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real nested table");
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(outerCell).toMatchObject({
      attrs: {
        colwidth: [320],
        backgroundColor: "#F8FAFC",
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(blockText(outerCell.blocks[0])).toBe("Outer cell");
    expect(unsupported).toMatchObject({
      type: "unsupported",
      nodeType: "docx-tbl",
      raw: {
        textContent: "Nested detail"
      }
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "docx-import-section-properties-partial",
        "docx-import-table-partial",
        "docx-import-unsupported-block"
      ])
    );
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-table-partial",
      "docx-import-unsupported-block"
    ]);
  });

  it("keeps a real table content control fixture as warning-backed unsupported content", () => {
    const result = importDOCXFixture("real-table-content-control-unsupported.docx");
    const [heading, table] = result.irDocument.sections[0].blocks;
    const [regularCell, controlledCell] = table.rows[0].cells;
    const unsupported = controlledCell.blocks.find(
      (block) => block.type === "unsupported"
    );
    const tableWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-table-partial"
    );
    const unsupportedWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-unsupported-block"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real table content control");
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        docxTableWidthType: "dxa",
        docxTableWidthValue: 4800,
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(regularCell).toMatchObject({
      attrs: {
        colwidth: [160],
        backgroundColor: "#F8FAFC",
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(blockText(regularCell.blocks[0])).toBe("Regular cell");
    expect(controlledCell).toMatchObject({
      attrs: {
        colwidth: [160],
        backgroundColor: "#FEF3C7",
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(blockText(controlledCell.blocks[0])).toBe("Before control");
    expect(unsupported).toMatchObject({
      type: "unsupported",
      nodeType: "docx-sdt",
      raw: {
        textContent: "Controlled option"
      }
    });
    expect(tableWarnings).toHaveLength(1);
    expect(tableWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      path: "word/document.xml.body.children[1].children[2].cells[1].children[2]",
      message:
        "DOCX table cell child 'sdt' was preserved as unsupported content."
    });
    expect(unsupportedWarnings).toHaveLength(1);
    expect(unsupportedWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      path: "word/document.xml.body.children[1].children[2].cells[1].children[2]",
      message: "DOCX block 'sdt' is not imported in S4; raw text was preserved."
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-table-partial",
      "docx-import-unsupported-block"
    ]);
  });

  it("imports a real mixed-width table fixture without inventing pct or auto colwidths", () => {
    const result = importDOCXFixture("real-mixed-width-table.docx");
    const [heading, table, noGridTable] = result.irDocument.sections[0].blocks;
    const [fixedCell, percentCell, autoCell] = table.rows[0].cells;
    const [fixedNoGridCell, percentNoGridCell, autoNoGridCell] =
      noGridTable.rows[0].cells;

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real mixed width table");
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        docxTableWidthType: "pct",
        docxTableWidthValue: 5000,
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(table.rows[0].cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Fixed dxa",
      "Percent width",
      "Auto width"
    ]);
    expect(table.rows[0].cells.map((cell) => cell.attrs.colwidth)).toEqual([
      [96],
      [144],
      [240]
    ]);
    expect(fixedCell.attrs).toMatchObject({
      docxCellWidthType: "dxa",
      docxCellWidthValue: 1440,
      colwidth: [96]
    });
    expect(percentCell.attrs).toMatchObject({
      docxCellWidthType: "pct",
      docxCellWidthValue: 2500,
      colwidth: [144]
    });
    expect(autoCell.attrs).toMatchObject({
      docxCellWidthType: "auto",
      docxCellWidthValue: 0,
      colwidth: [240]
    });
    expect(noGridTable).toMatchObject({
      type: "table",
      attrs: {
        docxTableWidthType: "auto",
        docxTableWidthValue: 0
      }
    });
    expect(
      noGridTable.rows[0].cells.map((cell) => blockText(cell.blocks[0]))
    ).toEqual(["Fixed no grid", "Percent no grid", "Auto no grid"]);
    expect(fixedNoGridCell.attrs).toMatchObject({
      docxCellWidthType: "dxa",
      docxCellWidthValue: 1440,
      colwidth: [96]
    });
    expect(percentNoGridCell.attrs).toMatchObject({
      docxCellWidthType: "pct",
      docxCellWidthValue: 2500
    });
    expect(autoNoGridCell.attrs).toMatchObject({
      docxCellWidthType: "auto",
      docxCellWidthValue: 0
    });
    expect(percentNoGridCell.attrs).not.toHaveProperty("colwidth");
    expect(autoNoGridCell.attrs).not.toHaveProperty("colwidth");
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("imports a real repeated-header table fixture as explicit layout metadata", () => {
    const result = importDOCXFixture("real-repeated-header-table.docx");
    const [heading, table] = result.irDocument.sections[0].blocks;
    const [headerRow, bodyRow, disabledRow] = table.rows;
    const tableWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-table-partial"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real repeated header table");
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        docxTableWidthType: "dxa",
        docxTableWidthValue: 7200,
        docxTableLayoutType: "fixed",
        docxTableJustification: "center",
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(table.headerRowRepeat).toBeUndefined();
    expect(table.allowRowSplit).toBeUndefined();
    expect(headerRow.attrs).toMatchObject({
      docxTableHeaderRepeat: true,
      docxRowCantSplit: true
    });
    expect(bodyRow.attrs).not.toHaveProperty("docxTableHeaderRepeat");
    expect(bodyRow.attrs).not.toHaveProperty("docxRowCantSplit");
    expect(disabledRow.attrs).not.toHaveProperty("docxTableHeaderRepeat");
    expect(disabledRow.attrs).not.toHaveProperty("docxRowCantSplit");
    expect(headerRow.cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Milestone",
      "Owner",
      "Status"
    ]);
    expect(bodyRow.cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Import warnings",
      "Codex",
      "Explicit"
    ]);
    expect(disabledRow.cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Disabled header",
      "Import",
      "Silent"
    ]);
    expect(headerRow.cells.map((cell) => cell.attrs.colwidth)).toEqual([
      [160],
      [160],
      [160]
    ]);
    expect(tableWarnings).toHaveLength(2);
    expect(tableWarnings.map((warning) => warning.severity)).toEqual([
      "warning",
      "warning"
    ]);
    expect(tableWarnings.map((warning) => warning.entry)).toEqual([
      "word/document.xml",
      "word/document.xml"
    ]);
    expect(new Set(tableWarnings.map((warning) => warning.path))).toEqual(
      new Set(["word/document.xml.body.children[1].children[2]"])
    );
    expect(tableWarnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining([
        "DOCX repeated table header row metadata was preserved, but automatic repeated-header behavior is not enabled.",
        "DOCX non-splitting table row metadata was preserved, but automatic row pagination behavior is not enabled."
      ])
    );
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-table-partial"
    ]);
  });

  it("imports a real table cell layout fixture as metadata with explicit warning", () => {
    const result = importDOCXFixture("real-table-cell-layout-unsupported.docx");
    const [heading, layoutTable, controlTable] = result.irDocument.sections[0].blocks;
    const [defaultCell, overrideCell, noWrapCell] = layoutTable.rows[0].cells;
    const [controlCellA, controlCellB] = controlTable.rows[0].cells;
    const tableWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-table-partial"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real table cell layout metadata");
    expect(layoutTable).toMatchObject({
      type: "table",
      attrs: {
        docxTableWidthType: "dxa",
        docxTableWidthValue: 7200,
        docxTableCellMarginTop: 120,
        docxTableCellMarginTopType: "dxa",
        docxTableCellMarginBottom: 180,
        docxTableCellMarginBottomType: "dxa",
        docxTableCellMarginLeft: 240,
        docxTableCellMarginLeftType: "dxa",
        docxTableCellMarginRight: 300,
        docxTableCellMarginRightType: "dxa",
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(layoutTable.rows[0].cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Default margins",
      "Cell override",
      "No wrap"
    ]);
    expect(layoutTable.rows[0].cells.map((cell) => cell.attrs.colwidth)).toEqual([
      [96],
      [144],
      [240]
    ]);
    expect(defaultCell.attrs).not.toHaveProperty("docxCellMarginTop");
    expect(defaultCell.attrs).not.toHaveProperty("docxCellNoWrap");
    expect(overrideCell.attrs).toMatchObject({
      docxCellMarginTop: 360,
      docxCellMarginTopType: "dxa",
      docxCellMarginBottom: 420,
      docxCellMarginBottomType: "dxa",
      docxCellMarginLeft: 480,
      docxCellMarginLeftType: "dxa",
      docxCellMarginRight: 540,
      docxCellMarginRightType: "dxa"
    });
    expect(overrideCell.attrs).not.toHaveProperty("docxCellNoWrap");
    expect(noWrapCell.attrs).toMatchObject({
      docxCellNoWrap: true
    });
    expect(noWrapCell.attrs).not.toHaveProperty("docxCellMarginTop");

    expect(controlTable).toMatchObject({
      type: "table",
      attrs: {
        docxTableWidthType: "dxa",
        docxTableWidthValue: 3600,
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(controlTable.attrs).not.toHaveProperty("docxTableCellMarginTop");
    expect(controlTable.rows[0].cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Control A",
      "Control B"
    ]);
    expect(controlTable.rows[0].cells.map((cell) => cell.attrs.colwidth)).toEqual([
      [120],
      [120]
    ]);
    expect(controlCellA.attrs).not.toHaveProperty("docxCellMarginTop");
    expect(controlCellA.attrs).not.toHaveProperty("docxCellNoWrap");
    expect(controlCellB.attrs).not.toHaveProperty("docxCellMarginTop");
    expect(controlCellB.attrs).not.toHaveProperty("docxCellNoWrap");

    expect(tableWarnings).toHaveLength(1);
    expect(tableWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      path: "word/document.xml.body.children[1]",
      message:
        "DOCX table cell margin or no-wrap layout metadata was preserved, but cell padding and no-wrap behavior is not enabled."
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-table-partial"
    ]);
  });

  it("keeps real table cell direction metadata warning-backed while preserving alignments", () => {
    const result = importDOCXFixture(
      "real-table-cell-direction-alignment-unsupported.docx"
    );
    const [heading, table] = result.irDocument.sections[0].blocks;
    const [topCell, centerCell, bottomCell] = table.rows[0].cells;
    const [topParagraph] = topCell.blocks;
    const [centerParagraph] = centerCell.blocks;
    const [bottomParagraph] = bottomCell.blocks;
    const tableWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-table-partial"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real table cell direction/alignment metadata");
    expect(table).toMatchObject({
      type: "table",
      attrs: {
        docxTableWidthType: "dxa",
        docxTableWidthValue: 7200,
        docxTableJustification: "center",
        borderColor: "#4B5563",
        borderStyle: "solid",
        borderWidth: 1
      }
    });
    expect(table.rows[0].cells.map((cell) => blockText(cell.blocks[0]))).toEqual([
      "Vertical top",
      "Vertical center",
      "Horizontal bottom"
    ]);
    expect(topCell.attrs).toMatchObject({
      colwidth: [160],
      verticalAlign: "top"
    });
    expect(centerCell.attrs).toMatchObject({
      colwidth: [160],
      verticalAlign: "center"
    });
    expect(bottomCell.attrs).toMatchObject({
      colwidth: [160],
      verticalAlign: "bottom"
    });
    expect(topParagraph.attrs).toMatchObject({ textAlign: "left" });
    expect(centerParagraph.attrs).toMatchObject({ textAlign: "center" });
    expect(bottomParagraph.attrs).toMatchObject({ textAlign: "right" });
    expect(tableWarnings).toHaveLength(1);
    expect(tableWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      path: "word/document.xml.body.children[1]",
      message:
        "DOCX table cell text direction metadata is not imported in S4; cell vertical alignment and paragraph alignment were preserved when present."
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-table-partial"
    ]);
  });

  it("preserves real table-embedded image semantics through DOCX -> IR -> HWPX -> IR", () => {
    const docxImport = importDOCXFixture("real-table-embedded-image.docx");
    const [heading, table] = docxImport.irDocument.sections[0].blocks;
    const [labelCell, imageCell] = table.rows[0].cells;
    const imageBlock = imageCell.blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );
    const hwpxExport = exportIRToHWPXV0(
      createHWPXV0ExportInput(docxImport.irDocument)
    );
    const hwpxReimport = importHWPXToIR(hwpxExport.packageBytes, {
      sourceName: "real-table-embedded-image.roundtrip.hwpx",
      inflateRaw,
      extractedAt: "2026-07-03T00:00:00.000Z"
    });
    const roundtripTable = hwpxReimport.irDocument.sections[0].blocks.find(
      (block) => block.type === "table"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real table embedded image");
    expect(table.rows[0].cells.map((cell) => cell.attrs.colwidth)).toEqual([
      [160],
      [160]
    ]);
    expect(blockText(labelCell.blocks[0])).toBe("Preview label");
    expect(projectCellBlocks(imageCell.blocks)).toEqual([
      {
        type: "paragraph",
        level: null,
        text: "Preview image",
        links: []
      },
      {
        type: "image",
        objectType: "image",
        mimeType: "image/png",
        title: "Fixture image",
        altText: "Fixture image alt",
        hasBinaryEntry: true,
        binaryRestored: true
      }
    ]);
    expect(imageBlock).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "inline",
      anchorMode: "inline",
      attrs: {
        mimeType: "image/png",
        title: "Fixture image",
        altText: "Fixture image alt",
        hasBinaryEntry: true,
        binaryRestored: true
      }
    });
    // HWPX v0 동결 계약: 셀 안 이미지는 재수입 시 셀 내부로 복원되지 않고
    // 표 뒤 최상위 이미지 블록으로 이동하며, 명시적 경고가 남는다.
    expect(projectCellBlocks(roundtripTable.rows[0].cells[1].blocks)).toEqual([
      {
        type: "paragraph",
        level: null,
        text: "Preview image",
        links: []
      }
    ]);
    const roundtripBlocks = hwpxReimport.irDocument.sections[0].blocks;
    const roundtripTableIndex = roundtripBlocks.indexOf(roundtripTable);
    const relocatedImage = roundtripBlocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );
    expect(roundtripBlocks.indexOf(relocatedImage)).toBeGreaterThan(
      roundtripTableIndex
    );
    expect(relocatedImage).toMatchObject({
      type: "object",
      objectType: "image",
      attrs: {
        mimeType: "image/png",
        hasBinaryEntry: true,
        binaryRestored: true
      }
    });
    expect(hwpxExport.warnings.map((warning) => warning.code)).not.toContain(
      "object-placeholder"
    );
    expect(hwpxReimport.warnings.map((warning) => warning.code)).toContain(
      "hwpx-import-unsupported-structure"
    );
    assertNoUnexpectedDOCXWarnings(docxImport);
  });

  it("imports real paragraph spacing metadata with explicit paragraph warnings", () => {
    const result = importDOCXFixture("real-paragraph-spacing.docx");
    const blocks = result.irDocument.sections[0].blocks;
    const heading = blocks.find(
      (block) => block.type === "heading" && blockText(block) === "Real paragraph spacing"
    );
    const directParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" && blockText(block) === "Direct spacing paragraph"
    );
    const styleParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" && blockText(block) === "Style spacing paragraph"
    );
    const controlParagraph = blocks.find(
      (block) => block.type === "paragraph" && blockText(block) === "Control paragraph"
    );
    const paragraphWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-paragraph-partial"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(heading.attrs).not.toHaveProperty("docxParagraphSpacingBefore");
    expect(directParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphSpacingBefore: 240,
        docxParagraphSpacingAfter: 120,
        docxParagraphSpacingLine: 276,
        docxParagraphSpacingLineRule: "auto"
      }
    });
    expect(styleParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphSpacingBefore: 360,
        docxParagraphSpacingAfter: 180,
        docxParagraphSpacingLine: 480,
        docxParagraphSpacingLineRule: "exact"
      }
    });
    expect(controlParagraph).toMatchObject({
      type: "paragraph"
    });
    expect(controlParagraph.attrs).not.toHaveProperty("docxParagraphSpacingBefore");
    expect(controlParagraph.attrs).not.toHaveProperty("docxParagraphSpacingAfter");
    expect(controlParagraph.attrs).not.toHaveProperty("docxParagraphSpacingLine");
    expect(controlParagraph.attrs).not.toHaveProperty(
      "docxParagraphSpacingLineRule"
    );

    expect(paragraphWarnings).toHaveLength(2);
    expect(paragraphWarnings.map((warning) => warning.path)).toEqual([
      "word/document.xml.body.children[1]",
      "word/document.xml.body.children[2]"
    ]);
    expect(paragraphWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      message:
        "DOCX paragraph spacing metadata was preserved and is re-exported by DOCX minimal export; editor attrs preserve it, supported before/after spacing, auto line spacing, and exact line spacing render in the editor; before/after spacing and auto line spacing roundtrip through HWPX paraPr margins/lineSpacing, unsupported exact/atLeast native HWPX line-spacing is warning-backed, but atLeast editor rendering and other non-DOCX behavior are not enabled."
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-paragraph-partial"
    ]);
  });

  it("imports real paragraph style id/name metadata with explicit paragraph warnings", () => {
    const result = importDOCXFixture("real-paragraph-style-metadata.docx");
    const blocks = result.irDocument.sections[0].blocks;
    const heading = blocks.find(
      (block) =>
        block.type === "heading" &&
        blockText(block) === "Real paragraph style metadata"
    );
    const bodyParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" && blockText(block) === "Styled body paragraph"
    );
    const styledHeading = blocks.find(
      (block) =>
        block.type === "heading" && blockText(block) === "Styled heading paragraph"
    );
    const missingStyleParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" && blockText(block) === "Missing style paragraph"
    );
    const controlParagraph = blocks.find(
      (block) => block.type === "paragraph" && blockText(block) === "Control paragraph"
    );
    const paragraphWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-paragraph-partial"
    );
    const styleWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-style-unsupported"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: {
        level: 2,
        docxParagraphStyleId: "DockitFixtureHeading",
        docxParagraphStyleName: "heading 2"
      }
    });
    expect(bodyParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        textAlign: "center",
        docxParagraphStyleId: "DockitFixtureBodyStyle",
        docxParagraphStyleName: "Dockit body style"
      }
    });
    expect(styledHeading).toMatchObject({
      type: "heading",
      attrs: {
        level: 3,
        textAlign: "center",
        docxParagraphStyleId: "DockitFixtureNamedHeading",
        docxParagraphStyleName: "heading 3"
      }
    });
    expect(missingStyleParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphStyleId: "DockitMissingStyle"
      }
    });
    expect(missingStyleParagraph.attrs).not.toHaveProperty(
      "docxParagraphStyleName"
    );
    expect(controlParagraph).toMatchObject({
      type: "paragraph"
    });
    expect(controlParagraph.attrs).not.toHaveProperty("docxParagraphStyleId");
    expect(controlParagraph.attrs).not.toHaveProperty("docxParagraphStyleName");

    expect(paragraphWarnings).toHaveLength(2);
    expect(paragraphWarnings.map((warning) => warning.path)).toEqual([
      "word/document.xml.body.children[1]",
      "word/document.xml.body.children[3]"
    ]);
    expect(paragraphWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      message:
        "DOCX paragraph style id/name metadata was preserved and is re-exported by DOCX minimal export; editor attrs preserve it, but style class rendering, HWPX/non-DOCX export behavior, and full style property/class semantics are not enabled."
    });
    expect(styleWarnings).toHaveLength(1);
    expect(styleWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      path: "word/document.xml.body.children[3]"
    });
    expect(styleWarnings[0].message).toContain("DockitMissingStyle");
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-style-unsupported",
      "docx-import-paragraph-partial"
    ]);
  });

  it("imports real paragraph tabs metadata with explicit paragraph warnings", () => {
    const result = importDOCXFixture("real-paragraph-tabs.docx");
    const blocks = result.irDocument.sections[0].blocks;
    const heading = blocks.find(
      (block) => block.type === "heading" && blockText(block) === "Real paragraph tabs"
    );
    const directParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" && blockText(block) === "Direct tabs paragraph"
    );
    const styleParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" && blockText(block) === "Style tabs paragraph"
    );
    const overrideParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" &&
        blockText(block) === "Direct overrides style tabs paragraph"
    );
    const spacingTabsParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" && blockText(block) === "Spacing tabs paragraph"
    );
    const styleSpacingTabsParagraph = blocks.find(
      (block) =>
        block.type === "paragraph" &&
        blockText(block) === "Style spacing tabs paragraph"
    );
    const controlParagraph = blocks.find(
      (block) => block.type === "paragraph" && blockText(block) === "Control paragraph"
    );
    const paragraphWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-paragraph-partial"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(heading.attrs).not.toHaveProperty("docxParagraphTabs");
    expect(projectParagraphTabs(directParagraph)).toEqual([
      {
        positionTwips: 720,
        type: "left",
        leader: null
      },
      {
        positionTwips: 9360,
        type: "right",
        leader: "dot"
      }
    ]);
    expect(projectParagraphTabs(styleParagraph)).toEqual([
      {
        positionTwips: 9360,
        type: "right",
        leader: "dot"
      }
    ]);
    expect(overrideParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphStyleId: "DockitFixtureTabbedParagraph",
        docxParagraphStyleName: "Dockit tabbed paragraph"
      }
    });
    expect(projectParagraphTabs(overrideParagraph)).toEqual([
      {
        positionTwips: 1440,
        type: "center",
        leader: "hyphen"
      }
    ]);
    expect(spacingTabsParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphSpacingBefore: 240,
        docxParagraphSpacingAfter: 120
      }
    });
    expect(projectParagraphTabs(spacingTabsParagraph)).toEqual([
      {
        positionTwips: 3600,
        type: "decimal",
        leader: null
      }
    ]);
    expect(styleSpacingTabsParagraph).toMatchObject({
      type: "paragraph",
      attrs: {
        docxParagraphStyleId: "DockitFixtureSpacedTabbedParagraph",
        docxParagraphStyleName: "Dockit spaced tabbed paragraph",
        docxParagraphSpacingBefore: 120,
        docxParagraphSpacingAfter: 60
      }
    });
    expect(projectParagraphTabs(styleSpacingTabsParagraph)).toEqual([
      {
        positionTwips: 4680,
        type: "center",
        leader: null
      }
    ]);
    expect(controlParagraph).toMatchObject({
      type: "paragraph"
    });
    expect(controlParagraph.attrs).not.toHaveProperty("docxParagraphTabs");

    expect(paragraphWarnings).toHaveLength(5);
    expect(paragraphWarnings.map((warning) => warning.path)).toEqual([
      "word/document.xml.body.children[1]",
      "word/document.xml.body.children[2]",
      "word/document.xml.body.children[3]",
      "word/document.xml.body.children[4]",
      "word/document.xml.body.children[5]"
    ]);
    expect(paragraphWarnings.map((warning) => warning.severity)).toEqual([
      "warning",
      "warning",
      "warning",
      "warning",
      "warning"
    ]);
    expect(paragraphWarnings.map((warning) => warning.entry)).toEqual([
      "word/document.xml",
      "word/document.xml",
      "word/document.xml",
      "word/document.xml",
      "word/document.xml"
    ]);
    expect(paragraphWarnings.map((warning) => warning.message)).toEqual([
      "DOCX paragraph tabs metadata was preserved and is re-exported by DOCX minimal export; editor attrs preserve it, but Word tab-stop rendering/navigation and HWPX/non-DOCX behavior are not enabled.",
      "DOCX paragraph tabs and style id/name metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve them, but Word tab-stop rendering/navigation, HWPX/non-DOCX export behavior, and full style property/class semantics are not enabled.",
      "DOCX paragraph tabs and style id/name metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve them, but Word tab-stop rendering/navigation, HWPX/non-DOCX export behavior, and full style property/class semantics are not enabled.",
      "DOCX paragraph spacing and tabs metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve them, supported before/after spacing, auto line spacing, and exact line spacing render in the editor; before/after spacing and auto line spacing roundtrip through HWPX paraPr margins/lineSpacing, unsupported exact/atLeast native HWPX line-spacing is warning-backed, but atLeast editor rendering, Word tab-stop rendering/navigation, and other non-DOCX behavior are not enabled.",
      "DOCX paragraph spacing, tabs, and style id/name metadata were preserved and are re-exported by DOCX minimal export; editor attrs preserve them, supported before/after spacing, auto line spacing, and exact line spacing render in the editor; before/after spacing and auto line spacing roundtrip through HWPX paraPr margins/lineSpacing, unsupported exact/atLeast native HWPX line-spacing is warning-backed, but atLeast editor rendering, Word tab-stop rendering/navigation, and full style property/class semantics are not enabled."
    ]);
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-paragraph-partial"
    ]);
  });

  it("keeps real section/page setting variance warning-backed with default IR page settings", () => {
    const packageResult = readDOCXPackageFromBytes(
      readDOCXFixture("real-section-page-settings-unsupported.docx")
    );
    const documentXml =
      packageResult.entryMap.get("word/document.xml")?.text ?? "";
    const result = importDOCXFixture(
      "real-section-page-settings-unsupported.docx"
    );
    const [section] = result.irDocument.sections;
    const sectionWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-section-properties-partial"
    );

    expect(documentXml).toContain('<w:type w:val="nextPage"/>');
    expect(documentXml).toContain('w:orient="landscape"');
    expect(documentXml).toContain('<w:cols w:num="2" w:space="720"/>');
    expect(documentXml).toContain("<w:titlePg/>");
    expect(documentXml).toContain('<w:pgNumType w:start="7"/>');

    expect(result.irDocument.sections).toHaveLength(1);
    expect(section).toMatchObject({
      type: "section",
      id: "docx-section-1",
      breakType: "unknown",
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
    expect(section.blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "heading",
      "paragraph"
    ]);
    expect(section.blocks.map(blockText)).toEqual([
      "Real section/page settings",
      "Intro paragraph before section break",
      "Paragraph-level section break to landscape",
      "Second section heading",
      "Trailing paragraph after page setting variance"
    ]);

    expect(sectionWarnings).toHaveLength(2);
    expect(sectionWarnings).toEqual([
      {
        code: "docx-import-section-properties-partial",
        severity: "warning",
        message:
          "DOCX paragraph-level section properties are not restored in import S4; default page settings were used.",
        entry: "word/document.xml",
        path: "word/document.xml.body.children[2]"
      },
      {
        code: "docx-import-section-properties-partial",
        severity: "warning",
        message:
          "DOCX section properties are not restored in import S4; default page settings were used.",
        entry: "word/document.xml",
        path: "word/document.xml.body.children[5]"
      }
    ]);
    expect(result.warnings).toHaveLength(2);
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("keeps real character style semantics warning-backed while preserving direct run formatting", () => {
    const result = importDOCXFixture("real-character-style-unsupported.docx");
    const [heading, paragraphBlock] = result.irDocument.sections[0].blocks;
    const [styledRun, controlRun] = textRuns(paragraphBlock);
    const runWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-run-unsupported"
    );

    expect(heading).toMatchObject({
      type: "heading",
      attrs: { level: 2 }
    });
    expect(blockText(heading)).toBe("Real character style");
    expect(inlineText(paragraphBlock.runs)).toBe(
      "Styled character run and direct control"
    );
    expect(styledRun).toMatchObject({
      text: "Styled character run",
      marks: [
        { type: "bold" },
        { type: "textStyle", attrs: { color: "#1D4ED8" } }
      ]
    });
    expect(styledRun.marks).not.toContainEqual({ type: "italic" });
    expect(styledRun.marks).not.toContainEqual({ type: "underline" });
    expect(controlRun).toMatchObject({
      text: " and direct control",
      marks: [{ type: "italic" }]
    });
    expect(runWarnings).toHaveLength(1);
    expect(runWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      path: "word/document.xml.body.children[1].children[0]",
      message:
        "DOCX character style 'DockitFixtureEmphasisChar' is not imported in S4; direct run formatting was preserved when present."
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-run-unsupported"
    ]);
  });

  it("imports a real embedded PNG fixture with restored binary and metadata", () => {
    const result = importDOCXFixture("real-embedded-image.docx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "inline",
      anchorMode: "inline",
      attrs: {
        mediaRelationshipId: "rId4",
        relationshipTarget: "media/dockit-image-fixture.png",
        docxMediaPath: "word/media/dockit-image-fixture.png",
        fileName: "dockit-image-fixture.png",
        mimeType: "image/png",
        isEmbedded: true,
        hasBinaryEntry: true,
        binaryRestored: true,
        binarySize: 176,
        widthEmu: 762000,
        heightEmu: 381000,
        altText: "Fixture image alt",
        title: "Fixture image",
        description: "Fixture image alt"
      }
    });
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/);
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("imports a real anchored PNG fixture as floating page-anchored media", () => {
    const result = importDOCXFixture("real-anchored-image.docx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "floating",
      anchorMode: "page",
      attrs: {
        mediaRelationshipId: "rId4",
        relationshipTarget: "media/dockit-image-fixture.png",
        docxMediaPath: "word/media/dockit-image-fixture.png",
        docxDrawingType: "anchor",
        docxAnchorRelativeFromH: "page",
        docxAnchorRelativeFromV: "paragraph",
        docxAnchorPositionHOffsetEmu: 914400,
        docxAnchorPositionVOffsetEmu: 182880,
        docxAnchorSimplePosXEmu: 0,
        docxAnchorSimplePosYEmu: 0,
        docxAnchorWrapType: "wrapSquare",
        docxAnchorWrapText: "bothSides",
        docxAnchorDistanceTopEmu: 0,
        docxAnchorDistanceBottomEmu: 0,
        docxAnchorDistanceLeftEmu: 114300,
        docxAnchorDistanceRightEmu: 114300,
        docxAnchorRelativeHeight: 251659264,
        docxAnchorBehindDoc: false,
        docxAnchorLocked: false,
        docxAnchorLayoutInCell: true,
        docxAnchorAllowOverlap: true,
        fileName: "dockit-image-fixture.png",
        mimeType: "image/png",
        isEmbedded: true,
        hasBinaryEntry: true,
        binaryRestored: true,
        widthEmu: 762000,
        heightEmu: 381000,
        altText: "Anchored fixture image alt",
        title: "Anchored fixture image",
        description: "Anchored fixture image alt"
      }
    });
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/);
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("imports a real advanced anchored PNG fixture with align and behind-text metadata", () => {
    const result = importDOCXFixture("real-advanced-anchored-image.docx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "behindText",
      anchorMode: "page",
      attrs: {
        mediaRelationshipId: "rId4",
        relationshipTarget: "media/dockit-image-fixture.png",
        docxMediaPath: "word/media/dockit-image-fixture.png",
        docxDrawingType: "anchor",
        docxAnchorRelativeFromH: "margin",
        docxAnchorRelativeFromV: "page",
        docxAnchorPositionHAlign: "center",
        docxAnchorPositionVAlign: "bottom",
        docxAnchorSimplePosXEmu: 0,
        docxAnchorSimplePosYEmu: 0,
        docxAnchorWrapType: "wrapNone",
        docxAnchorDistanceTopEmu: 228600,
        docxAnchorDistanceBottomEmu: 342900,
        docxAnchorDistanceLeftEmu: 457200,
        docxAnchorDistanceRightEmu: 571500,
        docxAnchorRelativeHeight: 42,
        docxAnchorBehindDoc: true,
        docxAnchorLocked: true,
        docxAnchorLayoutInCell: false,
        docxAnchorAllowOverlap: false,
        fileName: "dockit-image-fixture.png",
        mimeType: "image/png",
        isEmbedded: true,
        hasBinaryEntry: true,
        binaryRestored: true,
        widthEmu: 914400,
        heightEmu: 457200,
        altText: "Advanced anchored fixture image alt",
        title: "Advanced anchored fixture image",
        description: "Advanced anchored fixture image alt"
      }
    });
    expect(image.attrs).not.toHaveProperty("docxAnchorPositionHOffsetEmu");
    expect(image.attrs).not.toHaveProperty("docxAnchorPositionVOffsetEmu");
    expect(image.attrs).not.toHaveProperty("docxAnchorWrapText");
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/);
    assertNoUnexpectedDOCXWarnings(result);
  });

  it("imports a real grouped image fixture as metadata-only grouped media", () => {
    const packageResult = readDOCXPackageFromBytes(
      readDOCXFixture("real-grouped-image-metadata-only.docx")
    );
    const documentXml =
      packageResult.entryMap.get("word/document.xml")?.text ?? "";
    const result = importDOCXFixture("real-grouped-image-metadata-only.docx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );
    const mediaWarnings = result.warnings.filter(
      (warning) => warning.code === "docx-import-media-metadata-only"
    );

    expect(documentXml).toContain("<wpg:wgp>");
    expect(documentXml).toContain('uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"');
    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "floating",
      anchorMode: "page",
      attrs: {
        src: "word/media/dockit-image-fixture.png",
        mediaRelationshipId: "rId4",
        relationshipTarget: "media/dockit-image-fixture.png",
        docxMediaPath: "word/media/dockit-image-fixture.png",
        docxDrawingType: "anchor",
        docxDrawingContainerType: "group",
        docxAnchorRelativeFromH: "page",
        docxAnchorRelativeFromV: "paragraph",
        docxAnchorPositionHOffsetEmu: 457200,
        docxAnchorPositionVOffsetEmu: 228600,
        docxAnchorSimplePosXEmu: 0,
        docxAnchorSimplePosYEmu: 0,
        docxAnchorWrapType: "wrapSquare",
        docxAnchorWrapText: "bothSides",
        docxAnchorRelativeHeight: 7,
        docxAnchorBehindDoc: false,
        docxAnchorLocked: false,
        docxAnchorLayoutInCell: true,
        docxAnchorAllowOverlap: true,
        fileName: "dockit-image-fixture.png",
        mimeType: "image/png",
        isEmbedded: true,
        hasBinaryEntry: true,
        binaryRestored: false,
        binarySize: 176,
        widthEmu: 914400,
        heightEmu: 457200,
        altText: "Grouped fixture image alt",
        title: "Grouped fixture image",
        description: "Grouped fixture image alt"
      }
    });
    expect(image.attrs.src).toBe("word/media/dockit-image-fixture.png");
    expect(mediaWarnings).toHaveLength(1);
    expect(mediaWarnings[0]).toMatchObject({
      severity: "warning",
      entry: "word/document.xml",
      message:
        "DOCX group image relationship 'rId4' was imported as metadata only."
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-media-metadata-only"
    ]);
  });

  it("imports a real external image fixture as metadata-only remote media", () => {
    const result = importDOCXFixture("real-external-image.docx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "inline",
      anchorMode: "inline",
      attrs: {
        src: "https://example.com/remote-image.png",
        mediaRelationshipId: "rId4",
        relationshipTarget: "https://example.com/remote-image.png",
        relationshipTargetMode: "External",
        docxDrawingType: "inline",
        fileName: "remote-image.png",
        mimeType: "image/png",
        isEmbedded: false,
        hasBinaryEntry: false,
        binaryRestored: false,
        altText: "External fixture image alt",
        title: "External fixture image",
        description: "External fixture image alt"
      }
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-media-metadata-only"
    ]);
  });

  it("imports a real missing internal image fixture as metadata-only package media", () => {
    const result = importDOCXFixture("real-missing-image.docx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "inline",
      anchorMode: "inline",
      attrs: {
        src: "word/media/missing-image.png",
        mediaRelationshipId: "rId4",
        relationshipTarget: "media/missing-image.png",
        docxMediaPath: "word/media/missing-image.png",
        docxDrawingType: "inline",
        fileName: "missing-image.png",
        mimeType: "image/png",
        isEmbedded: true,
        hasBinaryEntry: false,
        binaryRestored: false,
        altText: "Missing fixture image alt",
        title: "Missing fixture image",
        description: "Missing fixture image alt"
      }
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-media-metadata-only"
    ]);
  });

  it("imports a real unsupported GIF fixture as metadata-only package media", () => {
    const result = importDOCXFixture("real-unsupported-gif-image.docx");
    const image = result.irDocument.sections[0].blocks.find(
      (block) => block.type === "object" && block.objectType === "image"
    );

    expect(image).toMatchObject({
      type: "object",
      objectType: "image",
      flowMode: "inline",
      anchorMode: "inline",
      attrs: {
        src: "word/media/unsupported-image.gif",
        mediaRelationshipId: "rId4",
        relationshipTarget: "media/unsupported-image.gif",
        docxMediaPath: "word/media/unsupported-image.gif",
        docxDrawingType: "inline",
        fileName: "unsupported-image.gif",
        mimeType: "image/gif",
        isEmbedded: true,
        hasBinaryEntry: true,
        binaryRestored: false,
        altText: "Unsupported GIF fixture image alt",
        title: "Unsupported GIF fixture image",
        description: "Unsupported GIF fixture image alt"
      }
    });
    assertOnlyDOCXWarnings(result, [
      "docx-import-section-properties-partial",
      "docx-import-media-metadata-only"
    ]);
  });

  it("contracts grouped DOCX image media through DOCX -> IR -> HWPX -> IR as an explicit placeholder boundary", () => {
    const docxImport = importDOCXFixture("real-grouped-image-metadata-only.docx");
    const hwpxExport = exportIRToHWPXV0(
      createHWPXV0ExportInput(docxImport.irDocument)
    );
    const hwpxReimport = importHWPXToIR(hwpxExport.packageBytes, {
      sourceName: "real-grouped-image-metadata-only.roundtrip.hwpx",
      inflateRaw,
      extractedAt: "2026-07-03T00:00:00.000Z"
    });

    expect(projectSupportedSemantics(docxImport.irDocument)).toEqual([
      {
        type: "paragraph",
        level: null,
        text: "Grouped image fixture",
        links: []
      },
      {
        type: "image",
        objectType: "image",
        mimeType: "image/png",
        title: "Grouped fixture image",
        altText: "Grouped fixture image alt",
        hasBinaryEntry: true,
        binaryRestored: false
      }
    ]);
    expect(
      projectSupportedSemantics(hwpxReimport.irDocument, {
        includeObjectPlaceholders: true
      })
    ).toEqual([
      {
        type: "paragraph",
        level: null,
        text: "Grouped image fixture",
        links: []
      },
      {
        type: "paragraph",
        level: null,
        text: "[Object placeholder: image docx-image-rId4]",
        links: []
      }
    ]);
    expect(docxImport.warnings.map((warning) => warning.code)).toContain(
      "docx-import-media-metadata-only"
    );
    expect(hwpxExport.warnings.map((warning) => warning.code)).toContain(
      "object-placeholder"
    );
  });

  it("preserves real mixed DOCX fixture semantics through DOCX -> IR -> HWPX -> IR", () => {
    const docxImport = importDOCXFixture("real-supported-s2-mixed.docx");
    const hwpxExport = exportIRToHWPXV0(
      createHWPXV0ExportInput(docxImport.irDocument)
    );
    const hwpxReimport = importHWPXToIR(hwpxExport.packageBytes, {
      sourceName: "real-supported-s2-mixed.roundtrip.hwpx",
      inflateRaw,
      extractedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(projectSupportedSemantics(docxImport.irDocument)).toEqual(
      expectedMixedProjection
    );
    expect(projectSupportedSemantics(hwpxReimport.irDocument)).toEqual(
      expectedMixedProjectionAfterHWPX
    );
    expect(hwpxExport.warnings.map((warning) => warning.code)).not.toContain(
      "object-placeholder"
    );
    expect(hwpxReimport.warnings.map((warning) => warning.code)).not.toContain(
      "hwpx-import-unsupported-structure"
    );
    assertNoUnexpectedDOCXWarnings(docxImport);
  });
});
