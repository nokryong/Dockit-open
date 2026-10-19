import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createDOCXMinimalExportInput,
  exportIRToMinimalDOCX
} from "../../app/LIB/ir/docxMinimalExport";
import { importDOCXToIR } from "../../app/LIB/ir/docxImport";
import {
  createHWPXV0ExportInput,
  exportIRToHWPXV0
} from "../../app/LIB/ir/hwpxMinimalExport";
import { importHWPXToIR } from "../../app/LIB/ir/hwpxImport";

const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const basePageSettings = {
  widthMm: 210,
  heightMm: 297,
  paddingTopMm: 20,
  paddingBottomMm: 20,
  paddingLeftMm: 25,
  paddingRightMm: 25,
  lineHeight: 1.5
};

const crossFormatS4IR = {
  type: "document",
  version: "ir-v1.1-draft",
  metadata: {
    extractedAt: "2026-06-19T00:00:00.000Z",
    extractorVersion: "cross-format-s1-test",
    source: {
      editor: "tiptap-prosemirror",
      mode: "readonly-snapshot"
    },
    warnings: []
  },
  sections: [
    {
      type: "section",
      id: "cross-format-s4",
      breakType: "continuous",
      pageSettings: basePageSettings,
      blocks: [
        {
          type: "heading",
          attrs: { level: 1 },
          runs: [
            {
              type: "textRun",
              text: "Cross format contract",
              marks: [{ type: "bold" }]
            }
          ]
        },
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
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/dockit?x=1&y=2" }
                }
              ]
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
        },
        {
          type: "list",
          listType: "ordered",
          attrs: { start: 3 },
          items: [
            {
              type: "listItem",
              attrs: { value: 3 },
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [{ type: "textRun", text: "Ordered item", marks: [] }]
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
                    backgroundColor: "#f5f5f5",
                    borderColor: "#333333",
                    borderStyle: "solid",
                    borderWidth: 1
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [
                        { type: "textRun", text: "Simple cell", marks: [] }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "object",
          objectType: "image",
          flowMode: "inline",
          anchorMode: "inline",
          attrs: {
            src: PNG_DATA_URI,
            width: 96,
            height: 48,
            altText: "Cross PNG",
            fileName: "cross-format.png",
            mimeType: "image/png"
          },
          children: []
        }
      ]
    }
  ]
};

const crossFormatS2MixedFixtureIR = {
  type: "document",
  version: "ir-v1.1-draft",
  metadata: {
    extractedAt: "2026-06-20T00:00:00.000Z",
    extractorVersion: "cross-format-s2-test",
    source: {
      editor: "tiptap-prosemirror",
      mode: "readonly-snapshot"
    },
    warnings: []
  },
  sections: [
    {
      type: "section",
      id: "cross-format-s2-mixed-fixture",
      breakType: "continuous",
      pageSettings: basePageSettings,
      blocks: [
        {
          type: "heading",
          attrs: { level: 2 },
          runs: [
            {
              type: "textRun",
              text: "Dockit launch memo",
              marks: [{ type: "bold" }]
            }
          ]
        },
        {
          type: "paragraph",
          attrs: {},
          runs: [
            { type: "textRun", text: "Review ", marks: [] },
            {
              type: "textRun",
              text: "HWPX",
              marks: [{ type: "bold" }]
            },
            { type: "textRun", text: " and ", marks: [] },
            {
              type: "textRun",
              text: "DOCX guide",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/dockit/guide" }
                }
              ]
            },
            { type: "textRun", text: " before release.", marks: [] }
          ]
        },
        {
          type: "list",
          listType: "ordered",
          attrs: { start: 1 },
          items: [
            {
              type: "listItem",
              attrs: { value: 1 },
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [{ type: "textRun", text: "Import samples", marks: [] }]
                }
              ]
            },
            {
              type: "listItem",
              attrs: { value: 2 },
              blocks: [
                {
                  type: "paragraph",
                  attrs: {},
                  runs: [{ type: "textRun", text: "Export samples", marks: [] }]
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
                  runs: [{ type: "textRun", text: "Keep warnings explicit", marks: [] }]
                }
              ]
            }
          ]
        },
        {
          type: "table",
          attrs: {
            borderColor: "#4B5563",
            borderStyle: "solid",
            borderWidth: 1
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
                    colspan: 2,
                    colwidth: [140, 180],
                    backgroundColor: "#E8F3FF",
                    borderColor: "#4B5563",
                    borderStyle: "solid",
                    borderWidth: 1
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "Conversion status", marks: [] }]
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
                    colwidth: [140],
                    backgroundColor: "#FFFFFF",
                    borderColor: "#4B5563",
                    borderStyle: "solid",
                    borderWidth: 1
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "HWPX", marks: [] }]
                    }
                  ]
                },
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {
                    colwidth: [180],
                    backgroundColor: "#F9FAFB",
                    borderColor: "#4B5563",
                    borderStyle: "solid",
                    borderWidth: 1
                  },
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "textRun", text: "DOCX", marks: [] }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "object",
          objectType: "image",
          flowMode: "inline",
          anchorMode: "inline",
          attrs: {
            src: PNG_DATA_URI,
            width: 80,
            height: 40,
            title: "Fixture image",
            altText: "Fixture image alt",
            fileName: "fixture-image.png",
            mimeType: "image/png"
          },
          children: []
        }
      ]
    }
  ]
};

const remoteImageBoundaryIR = {
  type: "document",
  version: "ir-v1.1-draft",
  metadata: {
    extractedAt: "2026-06-20T00:00:00.000Z",
    extractorVersion: "cross-format-s2-test",
    source: {
      editor: "tiptap-prosemirror",
      mode: "readonly-snapshot"
    },
    warnings: []
  },
  sections: [
    {
      type: "section",
      id: "cross-format-s2-remote-image-boundary",
      breakType: "continuous",
      pageSettings: basePageSettings,
      blocks: [
        {
          type: "paragraph",
          attrs: {},
          runs: [
            {
              type: "textRun",
              text: "Remote media boundary",
              marks: [{ type: "bold" }]
            }
          ]
        },
        {
          type: "object",
          objectType: "image",
          flowMode: "floating",
          anchorMode: "page",
          attrs: {
            src: "https://example.com/remote-image.png",
            width: 320,
            height: 180,
            title: "Remote image",
            altText: "Remote image alt",
            fileName: "remote-image.png",
            mimeType: "image/png"
          },
          children: []
        }
      ]
    }
  ]
};

const unsupportedImageDataUriBoundaryIR = {
  type: "document",
  version: "ir-v1.1-draft",
  metadata: {
    extractedAt: "2026-06-20T00:00:00.000Z",
    extractorVersion: "cross-format-s2-test",
    source: {
      editor: "tiptap-prosemirror",
      mode: "readonly-snapshot"
    },
    warnings: []
  },
  sections: [
    {
      type: "section",
      id: "cross-format-s2-unsupported-image-data-uri-boundary",
      breakType: "continuous",
      pageSettings: basePageSettings,
      blocks: [
        {
          type: "paragraph",
          attrs: {},
          runs: [
            {
              type: "textRun",
              text: "Unsupported image format boundary",
              marks: [{ type: "bold" }]
            }
          ]
        },
        {
          type: "object",
          objectType: "image",
          flowMode: "inline",
          anchorMode: "inline",
          attrs: {
            src: "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==",
            width: 96,
            height: 48,
            title: "GIF image",
            altText: "GIF image alt",
            fileName: "unsupported-image.gif",
            mimeType: "image/gif"
          },
          children: []
        }
      ]
    }
  ]
};

const inflateRaw = (bytes) => new Uint8Array(inflateRawSync(bytes));

const importExportHWPX = (irDocument) =>
  importHWPXToIR(
    exportIRToHWPXV0(createHWPXV0ExportInput(irDocument)).packageBytes,
    {
      sourceName: "cross-format-s1.hwpx",
      inflateRaw,
      extractedAt: "2026-06-19T00:00:00.000Z"
    }
  );

const importExportDOCX = (irDocument) =>
  importDOCXToIR(
    exportIRToMinimalDOCX(createDOCXMinimalExportInput(irDocument)).packageBytes,
    {
      extractedAt: "2026-06-19T00:00:00.000Z"
    }
  );

const hwpxToDocxToIR = (irDocument) =>
  importExportDOCX(importExportHWPX(irDocument).irDocument);

const docxToHwpxToIR = (irDocument) =>
  importExportHWPX(importExportDOCX(irDocument).irDocument);

const inlineText = (runs) =>
  runs.map((run) => (run.type === "textRun" ? run.text : "\n")).join("");

const normalizeColor = (value) =>
  typeof value === "string" && /^#?[0-9a-fA-F]{6}$/.test(value)
    ? `#${value.replace(/^#/, "").toUpperCase()}`
    : value ?? null;

const firstPresent = (...values) =>
  values.find((value) => value !== null && value !== undefined) ?? null;

const markSignature = (mark) => {
  if (mark.type === "link") {
    return { type: "link", href: mark.attrs?.href ?? null };
  }

  if (mark.type === "textStyle") {
    return { type: "textStyle", color: normalizeColor(mark.attrs?.color) };
  }

  return { type: mark.type };
};

const textRunProjection = (run) => ({
  text: run.text,
  marks: run.marks.map(markSignature).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  )
});

const projectInlineRuns = (runs) =>
  runs
    .filter((run) => run.type === "textRun")
    .map(textRunProjection)
    .filter((run) => run.text.length > 0);

const projectTextBlock = (block) => ({
  type: block.type,
  level: block.type === "heading" ? block.attrs.level ?? null : null,
  text: inlineText(block.runs),
  runs: projectInlineRuns(block.runs)
});

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
  fileName: block.attrs.fileName ?? null,
  title: block.attrs.title ?? null,
  altText: block.attrs.altText ?? null,
  hasBinaryEntry: Boolean(block.attrs.hasBinaryEntry),
  binaryRestored: block.attrs.binaryRestored ?? null
});

const isObjectPlaceholderParagraph = (block) =>
  block.type === "paragraph" &&
  inlineText(block.runs).startsWith("[Object placeholder: image ");

const projectSupportedSemantics = (
  irDocument,
  { includeImages = false, includeObjectPlaceholders = false } = {}
) =>
  irDocument.sections.flatMap((section) =>
    section.blocks.flatMap((block) => {
      if (block.type === "paragraph" || block.type === "heading") {
        if (!includeObjectPlaceholders && isObjectPlaceholderParagraph(block)) {
          return [];
        }

        return [projectTextBlock(block)];
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

const expectedTextListTableProjection = [
  {
    type: "heading",
    level: 1,
    text: "Cross format contract",
    runs: [{ text: "Cross format contract", marks: [{ type: "bold" }] }]
  },
  {
    type: "paragraph",
    level: null,
    text: "Bold Italic Underline Strike Color Link Sup Sub",
    runs: [
      { text: "Bold", marks: [{ type: "bold" }] },
      { text: " Italic", marks: [{ type: "italic" }] },
      { text: " Underline", marks: [{ type: "underline" }] },
      { text: " Strike", marks: [{ type: "strike" }] },
      { text: " Color", marks: [{ type: "textStyle", color: "#336699" }] },
      {
        text: " Link",
        marks: [
          {
            type: "link",
            href: "https://example.com/dockit?x=1&y=2"
          }
        ]
      },
      { text: " Sup", marks: [{ type: "superscript" }] },
      { text: " Sub", marks: [{ type: "subscript" }] }
    ]
  },
  {
    type: "list",
    listType: "ordered",
    start: 3,
    items: [{ value: 3, text: "Ordered item" }]
  },
  {
    type: "list",
    listType: "bullet",
    start: null,
    items: [{ value: null, text: "Bullet item" }]
  },
  {
    type: "table",
    borderColor: "#333333",
    borderStyle: "solid",
    rows: [
      {
        cells: [
          {
            text: "Simple cell",
            colspan: 1,
            backgroundColor: "#F5F5F5",
            borderColor: "#333333",
            borderStyle: "solid"
          }
        ]
      }
    ]
  }
];

const expectedMixedFixtureProjection = [
  {
    type: "heading",
    level: 2,
    text: "Dockit launch memo",
    runs: [{ text: "Dockit launch memo", marks: [{ type: "bold" }] }]
  },
  {
    type: "paragraph",
    level: null,
    text: "Review HWPX and DOCX guide before release.",
    runs: [
      { text: "Review ", marks: [] },
      { text: "HWPX", marks: [{ type: "bold" }] },
      { text: " and ", marks: [] },
      {
        text: "DOCX guide",
        marks: [{ type: "link", href: "https://example.com/dockit/guide" }]
      },
      { text: " before release.", marks: [] }
    ]
  },
  {
    type: "list",
    listType: "ordered",
    start: 1,
    items: [
      { value: 1, text: "Import samples" },
      { value: 2, text: "Export samples" }
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
            backgroundColor: null,
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
  }
];

describe("HWPX/DOCX cross-format semantic roundtrip", () => {
  it("preserves a realistic mixed S2 fixture through both cross-format routes", () => {
    const routes = [
      {
        name: "HWPX -> DOCX",
        result: hwpxToDocxToIR(crossFormatS2MixedFixtureIR)
      },
      {
        name: "DOCX -> HWPX",
        result: docxToHwpxToIR(crossFormatS2MixedFixtureIR)
      }
    ];

    routes.forEach(({ name, result }) => {
      const warningCodes = result.warnings.map((warning) => warning.code);
      const imageProjection = projectSupportedSemantics(result.irDocument, {
        includeImages: true
      }).find((block) => block.type === "image");

      expect(projectSupportedSemantics(result.irDocument), name).toEqual(
        expectedMixedFixtureProjection
      );
      expect(warningCodes, name).not.toContain("docx-import-media-metadata-only");
      expect(warningCodes, name).not.toContain("docx-import-unsupported-block");
      expect(warningCodes, name).not.toContain("hwpx-import-list-partial");
      expect(warningCodes, name).not.toContain("hwpx-import-unsupported-structure");
      expect(imageProjection, name).toMatchObject({
        type: "image",
        objectType: "image",
        mimeType: "image/png",
        altText: "Fixture image alt",
        hasBinaryEntry: true,
        binaryRestored: true
      });
    });
  });

  it("contracts remote DOCX image export as an explicit placeholder boundary", () => {
    const exportResult = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(remoteImageBoundaryIR)
    );
    const importResult = importDOCXToIR(exportResult.packageBytes, {
      extractedAt: "2026-06-20T00:00:00.000Z"
    });

    expect(exportResult.warnings.map((warning) => warning.code)).toContain(
      "docx-object-placeholder"
    );
    expect(exportResult.warnings.map((warning) => warning.code)).not.toContain(
      "docx-image-relationship-fallback"
    );
    expect(
      projectSupportedSemantics(importResult.irDocument, {
        includeObjectPlaceholders: true
      })
    ).toEqual([
      {
        type: "paragraph",
        level: null,
        text: "Remote media boundary",
        runs: [{ text: "Remote media boundary", marks: [{ type: "bold" }] }]
      },
      {
        type: "paragraph",
        level: null,
        text: "[Object placeholder: image Remote image alt]",
        runs: [
          {
            text: "[Object placeholder: image Remote image alt]",
            marks: []
          }
        ]
      }
    ]);
  });

  it("contracts unsupported GIF DOCX image data URIs as a placeholder/warning boundary", () => {
    const exportResult = exportIRToMinimalDOCX(
      createDOCXMinimalExportInput(unsupportedImageDataUriBoundaryIR)
    );
    const importResult = importDOCXToIR(exportResult.packageBytes, {
      extractedAt: "2026-06-20T00:00:00.000Z"
    });
    const warningCodes = exportResult.warnings.map((warning) => warning.code);

    expect(warningCodes).toContain("docx-image-relationship-fallback");
    expect(warningCodes).toContain("docx-object-placeholder");
    expect(
      projectSupportedSemantics(importResult.irDocument, {
        includeObjectPlaceholders: true
      })
    ).toEqual([
      {
        type: "paragraph",
        level: null,
        text: "Unsupported image format boundary",
        runs: [
          {
            text: "Unsupported image format boundary",
            marks: [{ type: "bold" }]
          }
        ]
      },
      {
        type: "paragraph",
        level: null,
        text: "[Object placeholder: image GIF image alt]",
        runs: [
          {
            text: "[Object placeholder: image GIF image alt]",
            marks: []
          }
        ]
      }
    ]);
  });

  it("preserves the supported S4 subset through HWPX -> IR -> DOCX -> IR", () => {
    const result = hwpxToDocxToIR(crossFormatS4IR);
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(projectSupportedSemantics(result.irDocument)).toEqual(
      expectedTextListTableProjection
    );
    expect(warningCodes).not.toContain("docx-import-media-metadata-only");
    expect(warningCodes).not.toContain("docx-import-numbering-unsupported");
    expect(warningCodes).not.toContain("docx-import-unsupported-block");
    const imageProjection = projectSupportedSemantics(result.irDocument, {
      includeImages: true
    }).find((block) => block.type === "image");

    expect(imageProjection).toMatchObject({
      type: "image",
      objectType: "image",
      mimeType: "image/png",
      fileName: "image1.png",
      title: "Cross PNG",
      altText: "Cross PNG",
      hasBinaryEntry: true,
      binaryRestored: true
    });
  });

  it("preserves the supported S4 subset through DOCX -> IR -> HWPX -> IR", () => {
    const result = docxToHwpxToIR(crossFormatS4IR);
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(projectSupportedSemantics(result.irDocument)).toEqual(
      expectedTextListTableProjection
    );
    expect(warningCodes).not.toContain("hwpx-import-list-partial");
    expect(warningCodes).not.toContain("hwpx-import-unsupported-structure");
  });

  it("restores DOCX image binaries before HWPX export embeds them", () => {
    const docxImport = importExportDOCX(crossFormatS4IR);
    const hwpxExport = exportIRToHWPXV0(
      createHWPXV0ExportInput(docxImport.irDocument)
    );
    const reimported = importHWPXToIR(hwpxExport.packageBytes, {
      sourceName: "docx-image-metadata-through-hwpx.hwpx",
      inflateRaw,
      extractedAt: "2026-06-19T00:00:00.000Z"
    });
    const reimportedImageProjection = projectSupportedSemantics(
      reimported.irDocument,
      { includeImages: true }
    ).find((block) => block.type === "image");

    expect(docxImport.warnings.map((warning) => warning.code)).not.toContain(
      "docx-import-media-metadata-only"
    );
    expect(hwpxExport.warnings.map((warning) => warning.code)).not.toContain(
      "object-placeholder"
    );
    expect(reimportedImageProjection).toMatchObject({
      type: "image",
      objectType: "image",
      mimeType: "image/png",
      title: "Cross PNG",
      altText: "Cross PNG",
      hasBinaryEntry: true,
      binaryRestored: true
    });
  });
});
