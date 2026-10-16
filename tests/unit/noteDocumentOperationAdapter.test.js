/* @vitest-environment jsdom */

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { afterEach, describe, expect, it, vi } from "vitest";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import {
  appendDocumentOperationAttempt,
  appendDocumentOperationResult,
  createDocumentOperationContentCheckpoint,
  readDocumentOperationJournal,
  resolveDocumentOperationContentCheckpoint,
  transitionDocumentOperationsThrough
} from "../../app/LIB/utils/documentOperationJournal";
import { DOCUMENT_OPERATION_TRANSACTION_META_KEY } from "../../app/LIB/utils/documentOperationUtils";
import {
  NOTE_DOCUMENT_OPERATION_ERROR,
  createNoteDocumentOperationAdapter
} from "../../app/LIB/utils/noteDocumentOperationAdapter";
import { NOTE_OPERATION_TYPES, executeNoteOperation } from "../../app/LIB/utils/noteOperationAdapter";
import {
  captureNotePersistenceSnapshot,
  restoreValidatedNotePersistenceHtml
} from "../../app/LIB/utils/notePersistenceGate";

const editors = [];
const paragraph = (text = "") => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const body = (noteId, kind = "footnote", text = "old") => ({
  type: "noteBody", attrs: { noteId, kind }, content: [paragraph(text)]
});
const reference = (noteId, kind = "footnote") => ({ type: "noteReference", attrs: { noteId, kind } });
const makeEditor = (content) => {
  const editor = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    extensions: [
      Document.extend({ content: "(paragraph | noteBody)+" }),
      Paragraph,
      Text,
      UndoRedo,
      NoteReference,
      NoteBody
    ],
    content
  });
  editors.push(editor);
  return editor;
};
const run = (editor, callbacks = {}, options = {}) => createNoteDocumentOperationAdapter({
  actor: "user:test", editor, nonceFactory: () => "n2b-test", ...callbacks, ...options
});
const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    serialized: () => [...values.values()].join("\n")
  };
};

afterEach(() => { while (editors.length) editors.pop().destroy(); });

describe("N2b tracked note DocumentOperation bridge", () => {
  it("journals all four N1b actions, checkpoints the exact save, and reopens without replay", () => {
    const id = "note-v1-existing";
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }, reference(id)] }, body(id)] });
    const storage = createStorage();
    const uid = "user-test";
    const documentId = "doc-n2b";
    const metadata = [];
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) metadata.push(transaction.getMeta(DOCUMENT_OPERATION_TRANSACTION_META_KEY));
    });
    const adapter = run(editor, {
      onDocumentOperationWillApply: ({ operation, operationId }) =>
        appendDocumentOperationAttempt({
          uid,
          documentId,
          operation,
          operationId,
          storage
        }),
      onDocumentOperationSettled: ({ operation, result }) => {
        expect(appendDocumentOperationResult({
          uid,
          documentId,
          operation,
          result,
          storage
        })).toBe(true);
      }
    }, { nonceFactory: (() => { let i = 0; return () => `n2b-${++i}`; })() });
    const operations = [
      { type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", position: 2, bodyContent: [paragraph("secret insert")] },
      { type: NOTE_OPERATION_TYPES.UPDATE_BODY, noteId: id, bodyContent: [paragraph("secret update")] },
      { type: NOTE_OPERATION_TYPES.CONVERT_KIND, noteId: id, kind: "endnote" },
      { type: NOTE_OPERATION_TYPES.DELETE, noteId: id }
    ];
    operations.forEach((operation) => expect(adapter.execute(operation)).toMatchObject({ ok: true, result: "applied" }));
    const journalBeforeSave = readDocumentOperationJournal(uid, documentId, storage);
    expect(journalBeforeSave.map(({ kind }) => kind)).toEqual([
      "attempt", "applied",
      "attempt", "applied",
      "attempt", "applied",
      "attempt", "applied"
    ]);
    expect(metadata).toHaveLength(4);
    expect(metadata.every((entry) => entry?.operationType === "note-mutation")).toBe(true);
    expect(storage.serialized()).not.toContain("secret");
    expect(storage.serialized()).not.toContain("note-v1-existing");
    expect(storage.serialized()).not.toContain("payload");

    const snapshot = captureNotePersistenceSnapshot(editor);
    expect(snapshot.ok).toBe(true);
    const checkpoint = createDocumentOperationContentCheckpoint({
      uid,
      documentId,
      content: snapshot.html,
      storage
    });
    const coveredThroughSequence = resolveDocumentOperationContentCheckpoint(
      checkpoint,
      { uid, documentId, content: snapshot.html, storage }
    );
    expect(coveredThroughSequence).toBe(journalBeforeSave.at(-1).sequence);
    expect(transitionDocumentOperationsThrough({
      uid,
      documentId,
      coveredThroughSequence,
      acknowledgementId: "save-n2b-exact",
      persistenceStatus: "durable",
      storage
    })).toBe(true);

    const journalAfterSave = readDocumentOperationJournal(uid, documentId, storage);
    expect(journalAfterSave.filter(({ kind }) => kind === "transition")).toHaveLength(4);
    expect(journalAfterSave.filter(({ kind }) => kind === "transition")
      .every(({ persistenceStatus }) => persistenceStatus === "durable")).toBe(true);

    const reopened = makeEditor("<p>legacy</p>");
    expect(restoreValidatedNotePersistenceHtml(reopened, snapshot.html).ok).toBe(true);
    expect(reopened.getJSON()).toEqual(editor.getJSON());
    expect(readDocumentOperationJournal(uid, documentId, storage)).toEqual(journalAfterSave);
  });

  it("fails closed when no durable-attempt callback is registered", () => {
    const editor = makeEditor({ type: "doc", content: [paragraph("A")] });
    const before = editor.getJSON();
    expect(run(editor).execute({
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      position: 2,
      bodyContent: [paragraph("must not apply")]
    })).toEqual({
      ok: false,
      result: "rejected",
      error: { code: NOTE_DOCUMENT_OPERATION_ERROR }
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("fails closed when attempt exists but durable-result delivery is absent", () => {
    const editor = makeEditor({ type: "doc", content: [paragraph("A")] });
    const before = editor.getJSON();
    const attempted = vi.fn(() => true);
    expect(run(editor, {
      onDocumentOperationWillApply: attempted
    }).execute({
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      position: 2,
      bodyContent: [paragraph("must not apply")]
    })).toEqual({
      ok: false,
      result: "rejected",
      error: { code: NOTE_DOCUMENT_OPERATION_ERROR }
    });
    expect(attempted).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);
  });

  it("fails closed before dispatch when journal preparation declines", () => {
    const editor = makeEditor({ type: "doc", content: [paragraph("A")] });
    const before = editor.getJSON();
    const settled = vi.fn();
    const result = run(editor, { onDocumentOperationWillApply: () => false, onDocumentOperationSettled: settled })
      .execute({ type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", position: 2, bodyContent: [paragraph()] });
    expect(result).toEqual({ ok: false, result: "rejected", error: { code: NOTE_DOCUMENT_OPERATION_ERROR } });
    expect(editor.getJSON()).toEqual(before);
    expect(settled).not.toHaveBeenCalled();
  });

  it("settles rejected N1b mutations without changing the document", () => {
    const editor = makeEditor({ type: "doc", content: [paragraph("A")] });
    const before = editor.getJSON();
    const settled = [];
    const result = run(editor, { onDocumentOperationWillApply: () => true, onDocumentOperationSettled: (entry) => settled.push(entry) })
      .execute({ type: NOTE_OPERATION_TYPES.DELETE, noteId: "note-v1-missing" });
    expect(result.error.code).toBe(NOTE_DOCUMENT_OPERATION_ERROR);
    expect(editor.getJSON()).toEqual(before);
    expect(settled).toHaveLength(1);
    expect(settled[0].result).toMatchObject({ result: "rejected", ok: false });
  });

  it("restores a mutation that reports failure and journals verified compensation", () => {
    const editor = makeEditor({ type: "doc", content: [paragraph("A")] });
    const before = editor.getJSON();
    const settled = [];
    const mutatingFailure = (instance, operation, options) => {
      const dispatch = instance.view.dispatch;
      instance.view.dispatch = (transaction) => {
        dispatch(transaction);
        throw new Error("fault after mutation");
      };
      const failed = executeNoteOperation(instance, operation, options);
      instance.view.dispatch = dispatch;
      return failed;
    };
    const result = run(editor, { onDocumentOperationWillApply: () => true, onDocumentOperationSettled: (entry) => settled.push(entry) }, { noteExecutor: mutatingFailure })
      .execute({ type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", position: 2, bodyContent: [paragraph()] });
    expect(result.error.code).toBe(NOTE_DOCUMENT_OPERATION_ERROR);
    expect(editor.getJSON()).toEqual(before);
    expect(settled[0].result).toMatchObject({ error: "PostconditionFailed" });
    expect(settled[0].result.compensation).toMatchObject({ restorationVerified: true });
  });
});
