/* @vitest-environment jsdom */

import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorExtensions } from "../../app/LIB/constant/editorExtensions";
import { installNoteInteraction } from "../../app/LIB/extensions/NoteInteraction";
import { executeOrderedNoteOperation } from "../../app/LIB/extensions/orderedNoteExecutor";
import { captureNotePersistenceSnapshot } from "../../app/LIB/utils/notePersistenceGate";

vi.mock("@excalidraw/excalidraw/index.css", () => ({}));
vi.mock("@excalidraw/excalidraw", () => ({ Excalidraw: () => null }));
vi.mock("../../app/LIB/extensions/DiagramBlockView.js", () => ({
  default: () => null
}));
const editors = [];

const reference = (noteId, kind) => ({
  type: "noteReference",
  attrs: { noteId, kind }
});

const noteBody = (noteId, kind, text) => ({
  type: "noteBody",
  attrs: { noteId, kind },
  content: [{
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {})
  }]
});

const paragraphWithReference = (noteId, kind = "footnote") => ({
  type: "paragraph",
  content: [
    { type: "text", text: "A" },
    reference(noteId, kind),
    { type: "text", text: "B" }
  ]
});

const createEditor = (content) => {
  const element = document.body.appendChild(document.createElement("div"));
  const editor = new Editor({
    element,
    extensions: editorExtensions,
    content: { type: "doc", content }
  });
  const disposeInteraction = installNoteInteraction(editor, {
    executeOperation: (operation) =>
      executeOrderedNoteOperation(editor, operation),
    insertNote: () => ({ ok: false })
  });
  editors.push({ disposeInteraction, editor, element });
  return editor;
};

const findReferencePosition = (editor, noteId) => {
  let position = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.type.name === "noteReference" && node.attrs.noteId === noteId) {
      position = nodePosition;
      return false;
    }
    return true;
  });
  return position;
};

const countPairNodes = (editor, noteId) => {
  const counts = { references: 0, bodies: 0 };
  editor.state.doc.descendants((node) => {
    if (node.attrs?.noteId !== noteId) return true;
    if (node.type.name === "noteReference") counts.references += 1;
    if (node.type.name === "noteBody") counts.bodies += 1;
    return true;
  });
  return counts;
};

const dispatchDeleteKey = (editor, key) => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key
  });
  editor.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};

const persistenceOutcome = (editor) => {
  const snapshot = captureNotePersistenceSnapshot(editor);
  return {
    ok: snapshot.ok,
    semanticCodes: snapshot.ok ? [] : snapshot.error?.semanticCodes || []
  };
};

const rootBodyOrder = (editor, kind) => {
  const order = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === "noteBody" && node.attrs.kind === kind) {
      order.push(node.attrs.noteId);
    }
  });
  return order;
};

afterEach(() => {
  while (editors.length > 0) {
    const { disposeInteraction, editor, element } = editors.pop();
    disposeInteraction();
    if (!editor.isDestroyed) editor.destroy();
    element.remove();
  }
});

describe("U0 note UX V2 diagnostic regressions", () => {
  it("deletes the whole note pair when Backspace removes an adjacent marker", () => {
    const noteId = "note-v1-u0-backspace";
    const editor = createEditor([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A" },
          reference(noteId, "footnote")
        ]
      },
      noteBody(noteId, "footnote", "backspace body")
    ]);
    const referencePosition = findReferencePosition(editor, noteId);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, referencePosition + 1)
      )
    );

    const handled = dispatchDeleteKey(editor, "Backspace");

    expect({
      handled,
      ...countPairNodes(editor, noteId),
      persistence: persistenceOutcome(editor)
    }).toEqual({
      handled: true,
      references: 0,
      bodies: 0,
      persistence: { ok: true, semanticCodes: [] }
    });
  });

  it("deletes every included note pair when a text range removes its marker", () => {
    const noteId = "note-v1-u0-range-delete";
    const editor = createEditor([
      paragraphWithReference(noteId),
      noteBody(noteId, "footnote", "range body")
    ]);
    const referencePosition = findReferencePosition(editor, noteId);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(
          editor.state.doc,
          referencePosition - 1,
          referencePosition + 2
        )
      )
    );

    const handled = dispatchDeleteKey(editor, "Delete");

    expect({
      handled,
      ...countPairNodes(editor, noteId),
      persistence: persistenceOutcome(editor)
    }).toEqual({
      handled: true,
      references: 0,
      bodies: 0,
      persistence: { ok: true, semanticCodes: [] }
    });
  });

  it("keeps on-screen endnote bodies in reference order", () => {
    const firstReference = "note-v1-u0-reference-first";
    const secondReference = "note-v1-u0-reference-second";
    const editor = createEditor([
      paragraphWithReference(firstReference, "endnote"),
      paragraphWithReference(secondReference, "endnote"),
      noteBody(secondReference, "endnote", "physically first body"),
      noteBody(firstReference, "endnote", "physically second body")
    ]);
    const expectedOrder = [firstReference, secondReference];
    const screenOrder = [...editor.view.dom.querySelectorAll(
      '[data-dockit-note-body="true"][data-dockit-note-kind="endnote"]'
    )].map((element) => element.getAttribute("data-dockit-note-id"));

    expect({
      documentBodyOrder: rootBodyOrder(editor, "endnote"),
      screenOrder
    }).toEqual({
      documentBodyOrder: expectedOrder,
      screenOrder: expectedOrder
    });
  });
});
