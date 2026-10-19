/* @vitest-environment jsdom */

import { Editor } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import Link from "@tiptap/extension-link";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import NoteInteraction, {
  getSelectionNoteBodyId
} from "../../app/LIB/extensions/NoteInteraction";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import { deriveNoteReferenceNumbers } from "../../app/LIB/utils/noteSemanticUtils";
import {
  getContainedSelectionNoteBodyId
} from "../../app/LIB/utils/noteSelectionUtils";

if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => []
  });
}
if (!Range.prototype.getBoundingClientRect) {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0
    })
  });
}

const editors = [];
const paragraph = (text = "") => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {})
});
const reference = (noteId, kind = "footnote") => ({
  type: "noteReference",
  attrs: { noteId, kind }
});
const noteBody = (noteId, kind = "footnote", content = [paragraph()]) => ({
  type: "noteBody",
  attrs: { noteId, kind },
  content
});

const makeEditor = ({ content, editable = true, extensions = [] }) => {
  const editor = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    editable,
    extensions: [
      Document.extend({ content: "(paragraph | noteBody)+" }),
      Paragraph,
      Text,
      ...extensions,
      NoteReference,
      NoteBody,
      NoteInteraction
    ],
    content
  });
  editors.push(editor);
  return editor;
};

const getNoteBodyPosition = (editor, noteId) => {
  let position = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.type.name === "noteBody" && node.attrs.noteId === noteId) {
      position = nodePosition;
      return false;
    }
    return true;
  });
  return position;
};

afterEach(() => {
  while (editors.length > 0) editors.pop().destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("U4 in-place note editing boundary", () => {
  it("keeps rich note content in the canonical body without a manual panel or activator", () => {
    const noteId = "note-v1-rich";
    const editor = makeEditor({
      extensions: [Bold, Link],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [reference(noteId)] },
          noteBody(noteId, "footnote", [{
            type: "paragraph",
            content: [{
              type: "text",
              text: "Dockit",
              marks: [
                { type: "bold" },
                {
                  type: "link",
                  attrs: { href: "https://dockit.example/report" }
                }
              ]
            }]
          }])
        ]
      }
    });

    const contentDOM = editor.view.dom.querySelector(
      ".dockit-note-body-content"
    );
    expect(contentDOM.textContent).toBe("Dockit");
    expect(contentDOM.querySelector("strong")).not.toBeNull();
    expect(contentDOM.querySelector("a")?.getAttribute("href"))
      .toBe("https://dockit.example/report");
    expect(editor.view.dom.querySelector(".dockit-note-manual-panel"))
      .toBeNull();
    expect(editor.view.dom.querySelector(".dockit-note-body-activator"))
      .toBeNull();
  });

  it("navigates directly between marker and body without the legacy activation event", () => {
    const noteId = "note-v1-navigation";
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "A" }, reference(noteId)]
          },
          noteBody(noteId, "footnote", [paragraph("body")])
        ]
      }
    });
    const marker = editor.view.dom.querySelector(".dockit-note-reference");
    const numberLabel = editor.view.dom.querySelector(
      '[data-dockit-note-number="true"]'
    );
    let legacyActivations = 0;
    editor.view.dom.addEventListener("dockit-note-activate", () => {
      legacyActivations += 1;
    });

    marker.click();
    expect(getSelectionNoteBodyId(editor.state.selection)).toBe(noteId);
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true
    }));
    expect(getSelectionNoteBodyId(editor.state.selection)).toBeNull();

    marker.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true
    }));
    expect(getSelectionNoteBodyId(editor.state.selection)).toBe(noteId);
    numberLabel.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(getSelectionNoteBodyId(editor.state.selection)).toBeNull();
    expect(legacyActivations).toBe(0);
    expect(deriveNoteReferenceNumbers(editor.state.doc)).toEqual([{
      noteId,
      kind: "footnote",
      number: 1
    }]);
  });

  it("keeps the displayed note number derived and non-editable", () => {
    const noteId = "note-v1-derived-number";
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [reference(noteId)] },
          noteBody(noteId, "footnote", [paragraph("body")])
        ]
      }
    });
    const numberLabel = editor.view.dom.querySelector(
      '[data-dockit-note-number="true"]'
    );
    const before = editor.getJSON();

    expect(numberLabel.contentEditable).toBe("false");
    numberLabel.textContent = "";
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, 1)
    ));

    expect(numberLabel.textContent).toBe("1");
    expect(editor.getJSON()).toEqual(before);
  });

  it("keeps read-only marker activation scroll-only with no caret or editing affordance", () => {
    const noteId = "note-v1-read-only";
    const editor = makeEditor({
      editable: false,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Read " }, reference(noteId)]
          },
          noteBody(noteId, "footnote", [paragraph("visible body")])
        ]
      }
    });
    const marker = editor.view.dom.querySelector(".dockit-note-reference");
    const bodyElement = editor.view.dom.querySelector(
      '[data-dockit-note-body="true"]'
    );
    const numberLabel = bodyElement.querySelector(
      '[data-dockit-note-number="true"]'
    );
    const scrollIntoView = vi.fn();
    bodyElement.scrollIntoView = scrollIntoView;
    const beforeSelection = editor.state.selection.toJSON();

    marker.click();
    marker.dispatchEvent(new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true
    }));
    numberLabel.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(marker.classList.contains("is-read-only")).toBe(true);
    expect(marker.tabIndex).toBe(0);
    expect(marker.getAttribute("aria-label")).toBe("각주 1 내용으로 이동");
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
    expect(editor.view.dom.querySelector(".dockit-note-placeholder")).toBeNull();
    expect(editor.view.dom.querySelector(".dockit-note-manual-panel")).toBeNull();
    expect(editor.view.dom.querySelector(".dockit-note-body-activator")).toBeNull();
  });

  it("blocks primary marker press caret placement but leaves secondary press available", () => {
    const noteId = "note-v1-pointer-boundary";
    const editor = makeEditor({
      editable: false,
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [reference(noteId)] },
          noteBody(noteId, "footnote", [paragraph("body")])
        ]
      }
    });
    const marker = editor.view.dom.querySelector(".dockit-note-reference");
    const primaryPress = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true
    });
    const secondaryPress = new MouseEvent("mousedown", {
      bubbles: true,
      button: 2,
      cancelable: true
    });

    expect(marker.dispatchEvent(primaryPress)).toBe(false);
    expect(primaryPress.defaultPrevented).toBe(true);
    expect(marker.dispatchEvent(secondaryPress)).toBe(true);
    expect(secondaryPress.defaultPrevented).toBe(false);
  });

  it("targets AI note actions only when the complete selection belongs to one body", () => {
    const noteId = "note-v1-ai-target";
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [reference(noteId)] },
          noteBody(noteId, "footnote", [paragraph("target")])
        ]
      }
    });
    const bodyPosition = getNoteBodyPosition(editor, noteId);
    const bodyTextPosition = bodyPosition + 2;
    const bodySelection = TextSelection.create(
      editor.state.doc,
      bodyTextPosition
    );

    expect(getContainedSelectionNoteBodyId(bodySelection, editor.state.doc))
      .toBe(noteId);
    const crossBoundarySelection = {
      $from: editor.state.doc.resolve(bodyTextPosition),
      $to: editor.state.doc.resolve(1)
    };
    expect(getSelectionNoteBodyId(crossBoundarySelection, editor.state.doc))
      .toBe(noteId);
    expect(getContainedSelectionNoteBodyId(
      crossBoundarySelection,
      editor.state.doc
    )).toBeNull();
    expect(getContainedSelectionNoteBodyId({
      from: bodyTextPosition,
      to: bodyTextPosition
    }, editor.state.doc)).toBe(noteId);
  });
});
