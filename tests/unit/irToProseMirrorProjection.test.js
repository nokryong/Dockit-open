import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { importHWPXToIR } from "../../app/LIB/ir/hwpxImport";
import { validateProseMirrorProjection } from "../../app/LIB/ir/proseMirrorProjectionValidation";
import { irToProseMirror } from "../../app/LIB/ir/toProseMirror";
import { buildDOCXParagraphMetadataHTMLAttrs } from "../../app/LIB/extensions/DOCXParagraphMetadataExtension";

const fixturePath = (...parts) =>
  path.join(process.cwd(), "tests", "fixtures", "hwpx", ...parts);

const readFixture = (...parts) => readFileSync(fixturePath(...parts));

const inflateRaw = (bytes) => new Uint8Array(inflateRawSync(bytes));

const projectFixture = (...parts) => {
  const importResult = importHWPXToIR(readFixture(...parts), {
    sourceName: parts.join("/"),
    inflateRaw,
    extractedAt: "2026-06-03T00:00:00.000Z"
  });

  return {
    importResult,
    projection: irToProseMirror(importResult.irDocument)
  };
};

const collectText = (node) =>
  [
    node.text ?? "",
    ...(node.content ?? []).map((child) => collectText(child))
  ].join("");

const findNodes = (node, type) => [
  ...(node.type === type ? [node] : []),
  ...(node.content ?? []).flatMap((child) => findNodes(child, type))
];

const findTextNode = (node, text) => {
  if (node.type === "text" && node.text === text) {
    return node;
  }

  for (const child of node.content ?? []) {
    const found = findTextNode(child, text);

    if (found) {
      return found;
    }
  }

  return null;
};

const findTextNodeByTrim = (node, text) => {
  if (node.type === "text" && node.text?.trim() === text) {
    return node;
  }

  for (const child of node.content ?? []) {
    const found = findTextNodeByTrim(child, text);

    if (found) {
      return found;
    }
  }

  return null;
};

const markTypes = (node) => (node?.marks ?? []).map((mark) => mark.type);

const expectValidProjection = (projection) => {
  const validation = validateProseMirrorProjection(projection.doc);

  expect(validation.errors).toEqual([]);
  expect(validation.valid).toBe(true);
  expect(validation.editorStateDryRun).toMatchObject({
    attempted: true,
    valid: true,
    docNodeType: "doc"
  });

  return validation;
};

describe("IRDocument -> ProseMirror projection foundation", () => {
  it("DOCX paragraph metadata를 editor attrs로 보존하고 supported spacing만 CSS로 렌더링한다", () => {
    const projection = irToProseMirror({
      type: "document",
      version: "ir-v1.1-draft",
      metadata: {
        extractedAt: "2026-07-01T00:00:00.000Z",
        extractorVersion: "test",
        source: { editor: "docx", mode: "import-snapshot" },
        warnings: []
      },
      sections: [
        {
          type: "section",
          id: "section-1",
          breakType: "continuous",
          pageSettings: {
            widthMm: 210,
            heightMm: 297,
            paddingTopMm: 20,
            paddingBottomMm: 20,
            paddingLeftMm: 20,
            paddingRightMm: 20,
            lineHeight: 1.6
          },
          blocks: [
            {
              type: "paragraph",
              attrs: {
                docxParagraphSpacingBefore: 240,
                docxParagraphSpacingAfter: 120,
                docxParagraphSpacingLine: 276,
                docxParagraphSpacingLineRule: "auto",
                docxParagraphStyleId: "DockitBody",
                docxParagraphStyleName: "Dockit body",
                docxParagraphTabs: [
                  { positionTwips: 720, type: "left", leader: null }
                ]
              },
              runs: [{ type: "textRun", text: "DOCX body metadata", marks: [] }]
            },
            {
              type: "heading",
              attrs: {
                level: 2,
                docxParagraphSpacingAfter: 300,
                docxParagraphStyleId: "DockitHeading",
                docxParagraphStyleName: "Dockit heading"
              },
              runs: [{ type: "textRun", text: "DOCX heading metadata", marks: [] }]
            }
          ]
        }
      ]
    });
    const paragraph = findNodes(projection.doc, "paragraph")[0];
    const heading = findNodes(projection.doc, "heading")[0];
    const renderedAttrs = buildDOCXParagraphMetadataHTMLAttrs(paragraph.attrs);
    const exactLineAttrs = buildDOCXParagraphMetadataHTMLAttrs({
      docxParagraphSpacingLine: 480,
      docxParagraphSpacingLineRule: "exact"
    });
    const atLeastLineAttrs = buildDOCXParagraphMetadataHTMLAttrs({
      docxParagraphSpacingLine: 480,
      docxParagraphSpacingLineRule: "atLeast"
    });
    const negativeSpacingAttrs = buildDOCXParagraphMetadataHTMLAttrs({
      docxParagraphSpacingBefore: -20
    });

    expectValidProjection(projection);
    expect(paragraph).toMatchObject({
      attrs: {
        docxParagraphSpacingBefore: 240,
        docxParagraphSpacingAfter: 120,
        docxParagraphSpacingLine: 276,
        docxParagraphSpacingLineRule: "auto",
        docxParagraphStyleId: "DockitBody",
        docxParagraphStyleName: "Dockit body",
        docxParagraphTabs: [
          { positionTwips: 720, type: "left", leader: null }
        ]
      }
    });
    expect(heading).toMatchObject({
      attrs: {
        level: 2,
        docxParagraphSpacingAfter: 300,
        docxParagraphStyleId: "DockitHeading",
        docxParagraphStyleName: "Dockit heading"
      }
    });
    expect(renderedAttrs).toMatchObject({
      "data-docx-paragraph-spacing-before": "240",
      "data-docx-paragraph-spacing-after": "120",
      "data-docx-paragraph-spacing-line": "276",
      "data-docx-paragraph-spacing-line-rule": "auto",
      "data-docx-paragraph-style-id": "DockitBody",
      "data-docx-paragraph-style-name": "Dockit body",
      "data-docx-paragraph-tabs":
        '[{"positionTwips":720,"type":"left","leader":null}]',
      style: "margin-top: 12pt; margin-bottom: 6pt; line-height: 1.15"
    });
    expect(exactLineAttrs).toMatchObject({
      "data-docx-paragraph-spacing-line": "480",
      "data-docx-paragraph-spacing-line-rule": "exact",
      style: "line-height: 24pt"
    });
    expect(atLeastLineAttrs).toMatchObject({
      "data-docx-paragraph-spacing-line": "480",
      "data-docx-paragraph-spacing-line-rule": "atLeast"
    });
    expect(atLeastLineAttrs).not.toHaveProperty("style");
    expect(negativeSpacingAttrs).toMatchObject({
      "data-docx-paragraph-spacing-before": "-20"
    });
    expect(negativeSpacingAttrs).not.toHaveProperty("style");
  });

  it("paragraph/heading fixture를 doc JSON으로 투영하고 visible text를 보존한다", () => {
    const { projection } = projectFixture("minimal-paragraph-heading.hwpx");

    expect(projection.doc.type).toBe("doc");
    expect(projection.warnings).toEqual([]);
    expectValidProjection(projection);
    expect(findNodes(projection.doc, "heading")[0]).toMatchObject({
      attrs: { level: 1 }
    });
    expect(collectText(projection.doc)).toContain("Export readiness");
    expect(collectText(projection.doc)).toContain(
      "A long paragraph with an inline tag."
    );
  });

  it("native list fixture를 orderedList/bulletList/listItem으로 투영한다", () => {
    const { projection } = projectFixture("minimal-list-object.hwpx");

    expect(projection.warnings).toEqual([]);
    expectValidProjection(projection);
    expect(findNodes(projection.doc, "orderedList")[0]).toMatchObject({
      attrs: { start: 3 }
    });
    expect(findNodes(projection.doc, "bulletList")).toHaveLength(1);
    expect(findNodes(projection.doc, "listItem")).toHaveLength(2);
    expect(collectText(projection.doc)).toContain("Nested item");
    expect(collectText(projection.doc)).toContain("Bullet item");
  });

  it("basic table fixture를 table/table_row/table_cell 구조로 투영한다", () => {
    const { projection } = projectFixture("minimal-basic-table.hwpx");
    const table = findNodes(projection.doc, "table")[0];
    const cell = findNodes(projection.doc, "tableCell")[0];

    expect(projection.warnings).toEqual([]);
    expectValidProjection(projection);
    expect(table).toBeDefined();
    expect(findNodes(projection.doc, "tableRow")).toHaveLength(1);
    expect(cell).toMatchObject({
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: [1800],
        borderTopColor: "#333333",
        borderTopStyle: "solid"
      }
    });
    expect(collectText(projection.doc)).toContain("Simple cell");
  });

  it("IR table cell backgroundColor를 ProseMirror tableCell attr로 보존한다", () => {
    const projection = irToProseMirror({
      type: "document",
      version: "ir-v1.1-draft",
      metadata: {
        extractedAt: "2026-06-06T00:00:00.000Z",
        extractorVersion: "test",
        source: { editor: "compatibility-test", mode: "readonly-snapshot" },
        warnings: []
      },
      sections: [
        {
          type: "section",
          id: "section-1",
          breakType: "continuous",
          pageSettings: {
            widthMm: 210,
            heightMm: 297,
            paddingTopMm: 20,
            paddingBottomMm: 20,
            paddingLeftMm: 20,
            paddingRightMm: 20,
            lineHeight: 1.6
          },
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
                        colspan: 1,
                        rowspan: 1,
                        backgroundColor: "#FFF59D"
                      },
                      blocks: [
                        {
                          type: "paragraph",
                          attrs: {},
                          runs: [
                            {
                              type: "textRun",
                              text: "Highlighted cell",
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
    });
    const cell = findNodes(projection.doc, "tableCell")[0];

    expectValidProjection(projection);
    expect(cell).toMatchObject({
      attrs: {
        backgroundColor: "#FFF59D"
      }
    });
    expect(collectText(projection.doc)).toContain("Highlighted cell");
  });

  it("IR table cell per-side border attrs project to ProseMirror tableCell attrs", () => {
    const projection = irToProseMirror({
      type: "document",
      version: "ir-v1.1-draft",
      metadata: {
        extractedAt: "2026-06-19T00:00:00.000Z",
        extractorVersion: "test",
        source: { editor: "compatibility-test", mode: "readonly-snapshot" },
        warnings: []
      },
      sections: [
        {
          type: "section",
          id: "section-1",
          breakType: "continuous",
          pageSettings: {
            widthMm: 210,
            heightMm: 297,
            paddingTopMm: 20,
            paddingBottomMm: 20,
            paddingLeftMm: 20,
            paddingRightMm: 20,
            lineHeight: 1.6
          },
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
                        colspan: 1,
                        rowspan: 1,
                        borderTopColor: "#FF0000",
                        borderTopStyle: "dashed",
                        borderTopWidth: "2pt",
                        borderRightColor: "#00FF00",
                        borderRightStyle: "dotted",
                        borderRightWidth: "1pt",
                        borderBottomColor: "#0000FF",
                        borderBottomStyle: "double",
                        borderBottomWidth: "1mm",
                        borderLeftColor: "#111111",
                        borderLeftStyle: "solid",
                        borderLeftWidth: 1
                      },
                      blocks: [
                        {
                          type: "paragraph",
                          attrs: {},
                          runs: [
                            {
                              type: "textRun",
                              text: "Bordered cell",
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
    });
    const cell = findNodes(projection.doc, "tableCell")[0];
    const validation = expectValidProjection(projection);

    expect(
      validation.warnings.map((warning) => warning.message).join("\n")
    ).not.toMatch(/border(?:Top|Right|Bottom|Left)(?:Color|Style|Width)/);
    expect(cell).toMatchObject({
      attrs: {
        borderTopColor: "#FF0000",
        borderTopStyle: "dashed",
        borderTopWidth: "2pt",
        borderRightColor: "#00FF00",
        borderRightStyle: "dotted",
        borderRightWidth: "1pt",
        borderBottomColor: "#0000FF",
        borderBottomStyle: "double",
        borderBottomWidth: "1mm",
        borderLeftColor: "#111111",
        borderLeftStyle: "solid",
        borderLeftWidth: 1
      }
    });
  });

  it.each([
    ["minimal-table-merge-colspan-only.hwpx", "Colspan top"],
    ["minimal-table-merge-rowspan-only.hwpx", "Rowspan left"],
    ["minimal-table-merge-mixed-span.hwpx", "Mixed block"],
    ["minimal-table-merge-clamped-rowspan.hwpx", "Oversized rowspan"]
  ])("merged table fixture %s를 projection + EditorState dry-run까지 통과한다", (fileName, expectedText) => {
    const { projection } = projectFixture(fileName);

    expectValidProjection(projection);
    expect(findNodes(projection.doc, "table")).toHaveLength(1);
    expect(findNodes(projection.doc, "tableCell").length).toBeGreaterThan(0);
    expect(collectText(projection.doc)).toContain(expectedText);
  });

  it("link fixture를 text link mark로 투영한다", () => {
    const { projection } = projectFixture("minimal-link.hwpx");
    const linkText = findTextNode(projection.doc, "Dockit 링크");

    expect(projection.warnings).toEqual([]);
    expectValidProjection(projection);
    expect(linkText).toBeDefined();
    expect(linkText.marks).toContainEqual({
      type: "link",
      attrs: { href: "https://example.com/dockit?x=1&y=2" }
    });
  });

  it("image fixture를 block image node로 투영한다", () => {
    const { projection } = projectFixture("minimal-image-object.hwpx");
    const image = findNodes(projection.doc, "image")[0];

    expect(projection.warnings).toEqual([]);
    expectValidProjection(projection);
    expect(image).toMatchObject({
      attrs: {
        objectId: "image1",
        fileName: "dockit-image-fixture.png",
        mimeType: "image/png"
      }
    });
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/);
    expect(image.attrs.alt).toContain("Dockit fixture image");
  });

  it("styled text fixture를 supported inline marks로 투영한다", () => {
    const { projection } = projectFixture("minimal-styled-text.hwpx");

    expect(projection.warnings).toContainEqual(
      expect.objectContaining({
        code: "ir-projection-unsupported-mark",
        severity: "warning"
      })
    );
    expectValidProjection(projection);
    expect(markTypes(findTextNodeByTrim(projection.doc, "굵게"))).toContain("bold");
    expect(markTypes(findTextNodeByTrim(projection.doc, "기울임"))).toContain(
      "italic"
    );
    expect(markTypes(findTextNodeByTrim(projection.doc, "밑줄"))).toContain(
      "underline"
    );
    expect(markTypes(findTextNodeByTrim(projection.doc, "취소선"))).toContain(
      "strike"
    );
    expect(findTextNodeByTrim(projection.doc, "코드").marks).toContainEqual(
      expect.objectContaining({
        type: "textStyle",
        attrs: expect.objectContaining({ fontFamily: "Consolas" })
      })
    );
    expect(markTypes(findTextNodeByTrim(projection.doc, "위첨자"))).toContain(
      "superscript"
    );
    expect(markTypes(findTextNodeByTrim(projection.doc, "아래첨자"))).toContain(
      "subscript"
    );
    expect(findTextNodeByTrim(projection.doc, "색상").marks).toContainEqual({
      type: "textStyle",
      attrs: {
        color: "#336699",
        fontFamily: "Noto Sans KR",
        fontSize: "13pt"
      }
    });
    expect(findTextNodeByTrim(projection.doc, "강조").marks).toContainEqual({
      type: "highlight",
      attrs: { color: "#FFF59D" }
    });
  });

  it("semantic block fixture의 code/blockquote materialized text를 paragraph/style로 보존한다", () => {
    const { projection } = projectFixture("minimal-semantic-blocks.hwpx");

    expect(projection.warnings).toContainEqual(
      expect.objectContaining({
        code: "ir-projection-unsupported-mark",
        severity: "warning"
      })
    );
    expectValidProjection(projection);
    expect(collectText(projection.doc)).toContain("const dockit = true;");
    expect(collectText(projection.doc)).toContain("인용문 첫 줄");
    expect(collectText(projection.doc)).not.toContain("[Unsupported block:");
  });

  it("projection-only unsupported IR block은 paragraph fallback과 warning으로 남긴다", () => {
    const projection = irToProseMirror({
      type: "document",
      version: "ir-v1.1-draft",
      metadata: {
        extractedAt: "2026-06-03T00:00:00.000Z",
        extractorVersion: "test",
        source: { editor: "tiptap-prosemirror", mode: "readonly-snapshot" },
        warnings: []
      },
      sections: [
        {
          type: "section",
          id: "section-1",
          breakType: "unknown",
          pageSettings: {
            widthMm: 210,
            heightMm: 297,
            paddingTopMm: 20,
            paddingBottomMm: 20,
            paddingLeftMm: 20,
            paddingRightMm: 20,
            lineHeight: 1.6
          },
          blocks: [
            {
              type: "unsupported",
              nodeType: "externalControlBlock",
              attrs: {},
              raw: { textContent: "External fallback text" }
            }
          ]
        }
      ]
    });

    expect(collectText(projection.doc)).toContain("External fallback text");
    expectValidProjection(projection);
    expect(projection.warnings).toContainEqual(
      expect.objectContaining({
        code: "ir-projection-unsupported-block",
        severity: "warning"
      })
    );
  });

  it("external-like partial IR도 warning을 남기고 valid EditorState dry-run을 통과한다", () => {
    const projection = irToProseMirror({
      type: "document",
      version: "ir-v1.1-draft",
      metadata: {
        extractedAt: "2026-06-04T00:00:00.000Z",
        extractorVersion: "test",
        source: { editor: "hwpx-import", mode: "parser-only" },
        warnings: []
      },
      sections: [
        {
          type: "section",
          id: "section-1",
          breakType: "continuous",
          pageSettings: {
            widthMm: 210,
            heightMm: 297,
            paddingTopMm: 20,
            paddingBottomMm: 20,
            paddingLeftMm: 20,
            paddingRightMm: 20,
            lineHeight: 1.6
          },
          blocks: [
            {
              type: "list",
              listType: "task",
              attrs: {},
              items: [
                {
                  blocks: [
                    {
                      type: "paragraph",
                      attrs: {},
                      runs: [{ type: "text", text: "Task-like item", marks: [] }]
                    }
                  ]
                }
              ]
            },
            {
              type: "object",
              objectType: "image",
              attrs: { objectId: "missing-src" },
              raw: {}
            },
            {
              type: "unsupported",
              nodeType: "externalWidget",
              attrs: {},
              raw: { textContent: "External widget text" }
            }
          ]
        },
        {
          type: "section",
          id: "section-2",
          breakType: "nextPage",
          pageSettings: {
            widthMm: 210,
            heightMm: 297,
            paddingTopMm: 20,
            paddingBottomMm: 20,
            paddingLeftMm: 20,
            paddingRightMm: 20,
            lineHeight: 1.6
          },
          blocks: [
            {
              type: "paragraph",
              attrs: {},
              runs: [{ type: "text", text: "Second section text", marks: [] }]
            }
          ]
        }
      ]
    });

    expect(collectText(projection.doc)).toContain("Task-like item");
    expect(collectText(projection.doc)).toContain("[Unsupported object: image]");
    expect(collectText(projection.doc)).toContain("External widget text");
    expect(projection.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "ir-projection-section-flattened",
        "ir-projection-unsupported-list",
        "ir-projection-unsupported-object",
        "ir-projection-unsupported-block"
      ])
    );
    expectValidProjection(projection);
  });

  it("validation dry-run은 unknown node/mark를 schema error로 분리한다", () => {
    const validation = validateProseMirrorProjection({
      type: "doc",
      content: [
        {
          type: "unknownNode",
          content: [
            {
              type: "text",
              text: "Invalid",
              marks: [{ type: "unknownMark" }]
            }
          ]
        }
      ]
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "pm-projection-unknown-node",
        "pm-projection-unknown-mark",
        "pm-projection-schema-invalid"
      ])
    );
    expect(validation.editorStateDryRun).toMatchObject({
      attempted: false,
      valid: false,
      skippedReason: "schema-invalid"
    });
  });
});
