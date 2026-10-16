/* @vitest-environment jsdom */

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorProvider, useEditor } from "../../app/LIB/context/EditorContext";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import NoteInteraction, {
  getSelectionNoteBodyId
} from "../../app/LIB/extensions/NoteInteraction";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import { executeNoteOperation } from "../../app/LIB/utils/noteOperationAdapter";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const editors = [];
const roots = [];
let currentContext = null;

const ContextProbe = () => {
  currentContext = useEditor();
  return null;
};

const createEditor = (content = "<p>본문</p>") => {
  const editor = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    extensions: [
      Document.extend({ content: "(paragraph | noteBody)+" }),
      Paragraph,
      Text,
      NoteReference,
      NoteBody,
      NoteInteraction
    ],
    content
  });
  editors.push(editor);
  return editor;
};

const renderProvider = async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(
      React.createElement(
        EditorProvider,
        null,
        React.createElement(ContextProbe)
      )
    );
  });
};

afterEach(() => {
  while (roots.length > 0) {
    const { root, container } = roots.pop();
    act(() => root.unmount());
    container.remove();
  }
  while (editors.length > 0) editors.pop().destroy();
  currentContext = null;
});

describe("N2b toolbar tracked note executor", () => {
  it("fails closed without registration and routes insertion only through the registered executor", async () => {
    const editor = createEditor();
    await renderProvider();
    await act(async () => currentContext.setEditor(editor));

    const initialDocument = editor.getJSON();
    expect(currentContext.insertNoteAtRememberedSelection("footnote")).toEqual({
      ok: false,
      result: "rejected",
      error: { code: "NOTE_TRACKED_EXECUTOR_UNAVAILABLE" }
    });
    expect(editor.getJSON()).toEqual(initialDocument);

    const trackedExecutor = vi.fn((operation) =>
      executeNoteOperation(editor, operation, {
        idFactory: () => "note-v1-context-tracked"
      })
    );
    const unregister = currentContext.registerTrackedNoteExecutor(trackedExecutor);
    let inserted;
    await act(async () => {
      inserted = currentContext.insertNoteAtRememberedSelection("footnote");
    });

    expect(inserted).toMatchObject({ ok: true, result: "applied" });
    expect(trackedExecutor).toHaveBeenCalledTimes(1);
    expect(trackedExecutor.mock.calls[0][0]).toMatchObject({
      type: "insertNote",
      kind: "footnote"
    });
    expect(currentContext).not.toHaveProperty("notePanelRequest");
    expect(currentContext).not.toHaveProperty("setNotePanelRequest");
    expect(getSelectionNoteBodyId(editor.state.selection)).toBe(
      "note-v1-context-tracked"
    );

    const afterTrackedInsert = editor.getJSON();
    expect(currentContext.insertNoteAtRememberedSelection("endnote")).toEqual({
      ok: false,
      result: "rejected",
      error: { code: "NOTE_NESTED_INSERT_BLOCKED" }
    });
    expect(editor.getJSON()).toEqual(afterTrackedInsert);
    expect(trackedExecutor).toHaveBeenCalledTimes(1);

    editor.commands.setTextSelection(1);
    currentContext.rememberTextSelection(editor.state.selection);
    unregister();
    expect(currentContext.insertNoteAtRememberedSelection("endnote")).toMatchObject({
      ok: false,
      error: { code: "NOTE_TRACKED_EXECUTOR_UNAVAILABLE" }
    });
    expect(editor.getJSON()).toEqual(afterTrackedInsert);
    expect(trackedExecutor).toHaveBeenCalledTimes(1);
  });

  it.each(["footnote", "endnote"])(
    "anchors a new %s after the remembered text range",
    async (kind) => {
      const editor = createEditor();
      await renderProvider();
      await act(async () => currentContext.setEditor(editor));

      editor.commands.setTextSelection({ from: 1, to: 3 });
      currentContext.rememberTextSelection(editor.state.selection);
      const noteId = `note-v1-range-end-${kind}`;
      const trackedExecutor = vi.fn((operation) =>
        executeNoteOperation(editor, operation, {
          idFactory: () => noteId
        })
      );
      currentContext.registerTrackedNoteExecutor(trackedExecutor);

      let result;
      await act(async () => {
        result = currentContext.insertNoteAtRememberedSelection(kind);
      });

      expect(result).toMatchObject({ ok: true, result: "applied" });
      expect(trackedExecutor).toHaveBeenCalledWith(expect.objectContaining({
        kind,
        position: 3,
        type: "insertNote"
      }));
      expect(editor.getJSON().content[0].content).toEqual([
        { type: "text", text: "본문" },
        {
          type: "noteReference",
          attrs: { noteId, kind }
        }
      ]);
      expect(getSelectionNoteBodyId(editor.state.selection)).toBe(noteId);
    }
  );

});
