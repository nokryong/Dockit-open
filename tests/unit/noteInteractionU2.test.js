/* @vitest-environment jsdom */

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNoteContextMenuItemModel } from "../../app/LIB/components/write/NoteContextMenu";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import { noteClipboardRemapKey } from "../../app/LIB/extensions/NoteClipboardRemap";
import {
  installNoteInteraction,
  noteInteractionPluginKey
} from "../../app/LIB/extensions/NoteInteraction";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import { installNoteInteractionRuntime } from "../../app/LIB/extensions/noteInteractionRuntime";
import { executeOrderedNoteOperation } from "../../app/LIB/extensions/orderedNoteExecutor";
import { createNoteDocumentOperationAdapter } from "../../app/LIB/utils/noteDocumentOperationAdapter";
import { captureNotePersistenceSnapshot } from "../../app/LIB/utils/notePersistenceGate";
import { DOCUMENT_OPERATION_TRANSACTION_META_KEY } from "../../app/LIB/utils/documentOperationUtils";

const instances = [];

const reference = (noteId, kind = "footnote") => ({
  type: "noteReference",
  attrs: { noteId, kind }
});

const body = (noteId, kind = "footnote", text = "body") => ({
  type: "noteBody",
  attrs: { noteId, kind },
  content: [{
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {})
  }]
});

const paragraph = (...content) => ({ type: "paragraph", content });

const createEditor = (content, { installInteraction = true } = {}) => {
  const element = document.body.appendChild(document.createElement("div"));
  const editor = new Editor({
    element,
    extensions: [
      Document.extend({ content: "(paragraph | noteBody)+" }),
      Paragraph,
      Text,
      UndoRedo,
      NoteReference,
      NoteBody
    ],
    content: { type: "doc", content }
  });
  const operations = [];
  const dispose = installInteraction
    ? installNoteInteraction(editor, {
        executeOperation: (operation) => {
          operations.push(operation);
          return executeOrderedNoteOperation(editor, operation);
        },
        insertNote: () => ({ ok: false })
      })
    : () => {};
  instances.push({ dispose, editor, element });
  return { editor, operations };
};

const findNodePosition = (editor, type, noteId) => {
  let position = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.type.name === type && node.attrs?.noteId === noteId) {
      position = nodePosition;
      return false;
    }
    return true;
  });
  return position;
};

const noteCounts = (editor, noteId) => {
  const counts = { bodies: 0, references: 0 };
  editor.state.doc.descendants((node) => {
    if (node.attrs?.noteId !== noteId) return true;
    if (node.type.name === "noteReference") counts.references += 1;
    if (node.type.name === "noteBody") counts.bodies += 1;
    return false;
  });
  return counts;
};

const rootBodyOrder = (editor) => {
  const order = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === "noteBody") order.push(node.attrs.noteId);
  });
  return order;
};

const referenceOrder = (editor) => {
  const order = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "noteBody") return false;
    if (node.type.name === "noteReference") order.push(node.attrs.noteId);
    return true;
  });
  return order;
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

afterEach(async () => {
  while (instances.length > 0) {
    const { dispose, editor, element } = instances.pop();
    dispose();
    if (!editor.isDestroyed) editor.destroy();
    element.remove();
  }
  await Promise.resolve();
  document.querySelectorAll('[data-dockit-note-context-menu-host="true"]')
    .forEach((element) => element.remove());
});

describe("U2 note deletion, context menu, and endnote order", () => {
  it("deletes an adjacent pair through the typed executor and restores it in one undo", () => {
    const noteId = "note-v1-u2-delete";
    const { editor, operations } = createEditor([
      paragraph({ type: "text", text: "A" }, reference(noteId)),
      body(noteId)
    ]);
    const position = findNodePosition(editor, "noteReference", noteId);
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, position)
    ));

    expect(dispatchDeleteKey(editor, "Delete")).toBe(true);
    expect(operations).toEqual([{ type: "deleteNote", noteId }]);
    expect(noteCounts(editor, noteId)).toEqual({ bodies: 0, references: 0 });
    expect(captureNotePersistenceSnapshot(editor).ok).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    expect(noteCounts(editor, noteId)).toEqual({ bodies: 1, references: 1 });
  });

  it("turns every marker in a range into sequential typed deletions", () => {
    const first = "note-v1-u2-range-first";
    const second = "note-v1-u2-range-second";
    const { editor, operations } = createEditor([
      paragraph(
        { type: "text", text: "A" },
        reference(first),
        { type: "text", text: "B" },
        reference(second),
        { type: "text", text: "C" }
      ),
      body(first),
      body(second)
    ]);
    const firstPosition = findNodePosition(editor, "noteReference", first);
    const secondPosition = findNodePosition(editor, "noteReference", second);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(
      editor.state.doc,
      firstPosition - 1,
      secondPosition + 2
    )));

    expect(dispatchDeleteKey(editor, "Backspace")).toBe(true);
    expect(operations).toEqual([
      { type: "deleteNote", noteId: first },
      { type: "deleteNote", noteId: second }
    ]);
    expect(referenceOrder(editor)).toEqual([]);
    expect(rootBodyOrder(editor)).toEqual([]);
    expect(captureNotePersistenceSnapshot(editor).ok).toBe(true);
  });

  it("rejects a raw reference-only transaction but allows an empty body", () => {
    const noteId = "note-v1-u2-filter";
    const { editor } = createEditor([
      paragraph({ type: "text", text: "A" }, reference(noteId)),
      body(noteId, "footnote", "delete body text")
    ]);
    const referencePosition = findNodePosition(editor, "noteReference", noteId);
    const before = editor.getJSON();
    editor.view.dispatch(editor.state.tr.delete(
      referencePosition,
      referencePosition + 1
    ));
    expect(editor.getJSON()).toEqual(before);

    const bodyPosition = findNodePosition(editor, "noteBody", noteId);
    editor.view.dispatch(editor.state.tr.delete(
      bodyPosition + 2,
      bodyPosition + 2 + "delete body text".length
    ));
    expect(noteCounts(editor, noteId)).toEqual({ bodies: 1, references: 1 });
    expect(editor.view.dom.querySelector(
      ".dockit-note-body-placeholder"
    )?.getAttribute("data-placeholder")).toBe("내용 입력");
    expect(captureNotePersistenceSnapshot(editor).ok).toBe(true);
  });

  it("renders one endnote heading, regenerated number labels, and no legacy activator", () => {
    const first = "note-v1-u2-end-first";
    const second = "note-v1-u2-end-second";
    const { editor } = createEditor([
      paragraph(reference(first, "endnote"), reference(second, "endnote")),
      body(first, "endnote", "first"),
      body(second, "endnote", "second")
    ]);

    expect(editor.view.dom.querySelectorAll(
      ".dockit-endnote-section-heading"
    )).toHaveLength(1);
    expect([...editor.view.dom.querySelectorAll(
      '.dockit-note-body[data-dockit-note-kind="endnote"] .dockit-note-body-number'
    )].map((element) => element.textContent)).toEqual(["1", "2"]);
    expect(editor.view.dom.querySelector(
      ".dockit-note-body-activator"
    )).toBeNull();
  });

  it("normalizes body order with a reference reorder and undoes both together", () => {
    const first = "note-v1-u2-order-first";
    const second = "note-v1-u2-order-second";
    const { editor } = createEditor([
      paragraph(reference(first)),
      paragraph(reference(second)),
      body(first),
      body(second)
    ]);
    const before = editor.getJSON();
    const nodes = [];
    editor.state.doc.forEach((node) => nodes.push(node));

    editor.view.dispatch(editor.state.tr.replaceWith(
      0,
      editor.state.doc.content.size,
      Fragment.fromArray([nodes[1], nodes[0], nodes[2], nodes[3]])
    ));

    expect(referenceOrder(editor)).toEqual([second, first]);
    expect(rootBodyOrder(editor)).toEqual([second, first]);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("keeps journal metadata and ordered bodies on the production typed adapter path", () => {
    const existing = "note-v1-u2-journal-existing";
    const { editor } = createEditor([
      paragraph({ type: "text", text: "A" }, reference(existing)),
      body(existing)
    ]);
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, 1)
    ));
    const metadata = [];
    let docChangedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (!transaction.docChanged) return;
      docChangedTransactions += 1;
      metadata.push(transaction.getMeta(
        DOCUMENT_OPERATION_TRANSACTION_META_KEY
      ));
    });
    const onDocumentOperationSettled = vi.fn();
    const onDocumentOperationWillApply = vi.fn(() => true);
    const adapter = createNoteDocumentOperationAdapter({
      actor: "u2-test-actor",
      editor,
      noteExecutor: executeOrderedNoteOperation,
      onDocumentOperationSettled,
      onDocumentOperationWillApply
    });

    const result = adapter.execute({
      type: "insertNote",
      kind: "endnote",
      bodyContent: [{ type: "paragraph" }]
    });

    expect(result).toMatchObject({ ok: true, result: "applied" });
    expect(rootBodyOrder(editor)).toEqual(referenceOrder(editor));
    expect(docChangedTransactions).toBe(1);
    expect(metadata[0]).toMatchObject({
      operationType: "note-mutation",
      source: "manual",
      type: "document-operation"
    });
    expect(onDocumentOperationWillApply).toHaveBeenCalledOnce();
    expect(onDocumentOperationSettled).toHaveBeenCalledOnce();
  });

  it("exposes the required kind-aware context menu actions", () => {
    expect(createNoteContextMenuItemModel({
      kind: "footnote",
      source: "reference"
    })).toEqual([
      { action: "convert", title: "미주로 변환" },
      { action: "navigate", title: "내용으로 이동" },
      { action: "delete", danger: true, title: "각주 삭제" }
    ]);
    expect(createNoteContextMenuItemModel({
      kind: "endnote",
      source: "body"
    }).map(({ title }) => title)).toEqual([
      "각주로 변환",
      "참조로 이동",
      "미주 삭제"
    ]);
  });

  it("installs and disposes interaction plus clipboard only in the editing runtime", () => {
    const { editor } = createEditor([
      paragraph({ type: "text", text: "runtime" })
    ], { installInteraction: false });
    const runtime = installNoteInteractionRuntime({
      actor: "u2-runtime-actor",
      editor,
      insertNote: () => ({ ok: false }),
      onDocumentOperationSettled: () => {},
      onDocumentOperationWillApply: () => true
    });
    const pluginKeys = () => editor.state.plugins.map((plugin) => plugin.key);

    expect(pluginKeys()).toContain(noteInteractionPluginKey.key);
    expect(pluginKeys()).toContain(noteClipboardRemapKey.key);
    runtime.dispose();
    expect(pluginKeys()).not.toContain(noteInteractionPluginKey.key);
    expect(pluginKeys()).not.toContain(noteClipboardRemapKey.key);
  });

  it("routes marker conversion and body deletion from the menu through typed operations", async () => {
    const noteId = "note-v1-u2-menu";
    const { editor, operations } = createEditor([
      paragraph(reference(noteId)),
      body(noteId)
    ]);
    const marker = editor.view.dom.querySelector(
      `[data-dockit-note-reference="true"][data-dockit-note-id="${noteId}"]`
    );
    marker.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20
    }));
    await vi.waitFor(() => {
      expect(document.querySelector(
        '[data-dockit-note-context-menu="true"]'
      )).not.toBeNull();
    });
    [...document.querySelectorAll(
      '[data-dockit-note-context-menu="true"] button'
    )].find((item) => item.textContent.includes("미주로 변환"))?.click();
    await vi.waitFor(() => {
      expect(editor.view.dom.querySelector(
        `[data-dockit-note-body="true"][data-dockit-note-kind="endnote"]`
      )).not.toBeNull();
    });

    const convertedBody = editor.view.dom.querySelector(
      `[data-dockit-note-body="true"][data-dockit-note-id="${noteId}"]`
    );
    convertedBody.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 24
    }));
    await vi.waitFor(() => {
      expect([...document.querySelectorAll(
        '[data-dockit-note-context-menu="true"] button'
      )].some((item) => item.textContent.includes("미주 삭제"))).toBe(true);
    });
    [...document.querySelectorAll(
      '[data-dockit-note-context-menu="true"] button'
    )].find((item) => item.textContent.includes("미주 삭제"))?.click();

    await vi.waitFor(() => {
      expect(noteCounts(editor, noteId)).toEqual({ bodies: 0, references: 0 });
    });
    expect(operations).toEqual([
      { type: "convertNoteKind", noteId, kind: "endnote" },
      { type: "deleteNote", noteId }
    ]);
  });
});
