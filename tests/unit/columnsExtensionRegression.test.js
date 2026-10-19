/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
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

const createEditor = (content) =>
  registerEditor(
    new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions,
      content
    })
  );

const createParagraphDoc = (text) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }]
    }
  ]
});

const createColumnDoc = () => ({
  type: "doc",
  content: [
    {
      type: "columnBlock",
      content: [
        {
          type: "column",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Left" }]
            }
          ]
        },
        {
          type: "column",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Right" }]
            }
          ]
        }
      ]
    }
  ]
});

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

const getTopLevelTypes = (editor) =>
  editor.getJSON().content.map((node) => node.type);

describe("local ColumnsExtension regression", () => {
  it("registers the same column node names used by export readiness checks", () => {
    const editor = createEditor(createParagraphDoc("Base"));

    expect(editor.state.schema.nodes.column).toBeDefined();
    expect(editor.state.schema.nodes.columnBlock).toBeDefined();
    expect(editor.can().setColumns(2)).toBe(true);
    expect(editor.can().unsetColumns()).toBe(false);
  });

  it("setColumns inserts a columnBlock with the requested column count", () => {
    const editor = createEditor(createParagraphDoc("Base"));

    setSelectionAtText(editor, "Base");
    const applied = editor.chain().focus().setColumns(3).run();
    const [columnBlock] = editor.getJSON().content;

    expect(applied).toBe(true);
    expect(columnBlock.type).toBe("columnBlock");
    expect(columnBlock.content).toHaveLength(3);
    expect(columnBlock.content.map((node) => node.type)).toEqual([
      "column",
      "column",
      "column"
    ]);
  });

  it("setColumns can preserve selected content in the first column", () => {
    const editor = createEditor(createParagraphDoc("Keep me"));

    setSelectionAtText(editor, "Keep me");
    const applied = editor.chain().focus().setColumns(2, true).run();
    const firstColumn = editor.getJSON().content[0].content[0];

    expect(applied).toBe(true);
    expect(firstColumn.type).toBe("column");
    expect(firstColumn.content[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Keep me" }]
    });
  });

  it("unsetColumns flattens column content back into top-level blocks", () => {
    const editor = createEditor(createColumnDoc());

    setSelectionAtText(editor, "Left");
    const applied = editor.chain().focus().unsetColumns().run();

    expect(applied).toBe(true);
    expect(getTopLevelTypes(editor)).toEqual(["paragraph", "paragraph"]);
    expect(editor.getText()).toContain("Left");
    expect(editor.getText()).toContain("Right");
  });
});
