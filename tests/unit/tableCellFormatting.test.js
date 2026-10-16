/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { readFileSync } from "node:fs";
import { editorExtensions } from "../../app/LIB/constant/editorExtensions";





vi.mock("../../app/LIB/extensions/DiagramBlockView.js", () => ({
  default: function MockDiagramBlockView() {
    return null;
  }
}));

const editors = [];

const registerEditor = (editor) => {
  editors.push(editor);
  return editor;
};

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
});

const createTableDoc = (cellAttrs = {}) => ({
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              attrs: {
                colspan: 1,
                rowspan: 1,
                colwidth: null,
                ...cellAttrs
              },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "A1" }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});

const createEditor = (cellAttrs = {}) =>
  registerEditor(
    new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions,
      content: createTableDoc(cellAttrs)
    })
  );

const findFirstCell = (json) => json.content[0].content[0].content[0];

const setSelectionAtText = (editor, targetText) => {
  let textStart = null;

  editor.state.doc.descendants((node, pos) => {
    if (textStart !== null) {
      return false;
    }

    if (node.isText && node.text === targetText) {
      textStart = pos;
      return false;
    }

    return true;
  });

  if (textStart === null) {
    throw new Error(`Could not find text node: ${targetText}`);
  }

  editor.commands.setTextSelection(textStart);
};

describe("table cell formatting", () => {
  it("editor schema accepts table cell fill and per-side border attrs", () => {
    const editor = createEditor();
    const attrNames = Object.keys(editor.state.schema.nodes.tableCell.attrs);

    expect(attrNames).toEqual(
      expect.arrayContaining([
        "backgroundColor",
        "borderColor",
        "borderStyle",
        "borderWidth",
        "borderTopColor",
        "borderTopStyle",
        "borderTopWidth",
        "borderRightColor",
        "borderRightStyle",
        "borderRightWidth",
        "borderBottomColor",
        "borderBottomStyle",
        "borderBottomWidth",
        "borderLeftColor",
        "borderLeftStyle",
        "borderLeftWidth"
      ])
    );
  });

  it("serializes table cell fill and per-side border styles into HTML", () => {
    const editor = createEditor({
      backgroundColor: "#FFF59D",
      borderTopColor: "#FF0000",
      borderTopStyle: "dashed",
      borderTopWidth: "2pt",
      borderRightColor: "#00FF00",
      borderRightStyle: "dotted",
      borderRightWidth: 1
    });
    const html = editor.getHTML();

    expect(html).toContain("--table-cell-bg: #FFF59D");
    expect(html).toContain("background-color: rgb(255, 245, 157)");
    expect(html).toContain("--table-cell-border-top: 2pt dashed #FF0000");
    expect(html).toContain("border-top: 2pt dashed rgb(255, 0, 0)");
    expect(html).toContain("--table-cell-border-right: 1pt dotted #00FF00");
    expect(html).toContain("border-right: 1pt dotted rgb(0, 255, 0)");
  });

  it("setCellAttribute updates selected cell border attrs", () => {
    const editor = createEditor();

    setSelectionAtText(editor, "A1");
    const applied = editor
      .chain()
      .focus()
      .setCellAttribute("borderLeftColor", "#111111")
      .setCellAttribute("borderLeftStyle", "double")
      .setCellAttribute("borderLeftWidth", 3)
      .run();

    expect(applied).toBe(true);
    expect(findFirstCell(editor.getJSON()).attrs).toMatchObject({
      borderLeftColor: "#111111",
      borderLeftStyle: "double",
      borderLeftWidth: 3
    });
  });

  it("editor CSS allows imported cell fill and per-cell borders to win", () => {
    const css = readFileSync("app/LIB/css/tiptap.css", "utf8");
    const tableCellRule = css.match(
      /\.tiptap-container table td \{[\s\S]*?\n\}/
    )?.[0];

    expect(tableCellRule).toBeDefined();
    expect(tableCellRule).not.toContain("background-color: transparent !important;");
    expect(css).toContain("background-color: var(--table-cell-bg, transparent);");
    expect(css).toContain("--table-cell-border-top");
    expect(css).toContain("--table-cell-border-right");
    expect(css).toContain("--table-cell-border-bottom");
    expect(css).toContain("--table-cell-border-left");
  });
});
