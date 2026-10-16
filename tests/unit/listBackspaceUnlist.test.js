/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import {
  BulletList,
  ListItem,
  OrderedList
} from "@tiptap/extension-list";
import ListBackspaceUnlist from "../../app/LIB/extensions/ListBackspaceUnlist";

const listItemNode = (text) => ({
  type: "listItem",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }]
    }
  ]
});

const createEditor = (content) =>
  new Editor({
    element: document.createElement("div"),
    extensions: [
      Document,
      Paragraph,
      Text,
      BulletList,
      OrderedList,
      ListItem,
      ListBackspaceUnlist
    ],
    content
  });

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

const setSelectionAtTextStart = (editor, targetText) => {
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

describe("listBackspaceUnlist", () => {
  it("ordered list marker backspace lifts the current item into a paragraph instead of merging backward", () => {
    const editor = registerEditor(
      createEditor({
        type: "doc",
        content: [
          {
            type: "orderedList",
            content: [
              listItemNode("alpha"),
              listItemNode("beta"),
              listItemNode("gamma")
            ]
          }
        ]
      })
    );

    setSelectionAtTextStart(editor, "beta");
    editor.commands.keyboardShortcut("Backspace");

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [listItemNode("alpha")]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "beta" }]
        },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [listItemNode("gamma")]
        }
      ]
    });
  });

  it("bullet list marker backspace also lifts the current item into a paragraph", () => {
    const editor = registerEditor(
      createEditor({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              listItemNode("first"),
              listItemNode("second"),
              listItemNode("third")
            ]
          }
        ]
      })
    );

    setSelectionAtTextStart(editor, "second");
    editor.commands.keyboardShortcut("Backspace");

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [listItemNode("first")]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "second" }]
        },
        {
          type: "bulletList",
          content: [listItemNode("third")]
        }
      ]
    });
  });
});
