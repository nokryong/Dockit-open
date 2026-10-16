/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { Editor, Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import CodeBlock from "@tiptap/extension-code-block";
import Link from "@tiptap/extension-link";
import { history, redo, redoDepth, undo, undoDepth } from "@tiptap/pm/history";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import {
  NOTE_BODY_MAX_UTF8_BYTES,
  NOTE_PAIR_LIMIT,
  deriveNoteReferenceNumbers
} from "../../app/LIB/utils/noteSemanticUtils";
import {
  createNoteOperationAdapter,
  executeNoteOperation,
  NOTE_OPERATION_ERROR_CODES,
  NOTE_OPERATION_TYPES
} from "../../app/LIB/utils/noteOperationAdapter";

const editors = [];
const noteId = (suffix) => `note-v1-${suffix}`;
const bodyContent = (text = "") => text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [{ type: "paragraph" }];
const reference = (id, kind = "footnote") => ({ type: "noteReference", attrs: { noteId: id, kind } });
const body = (id, kind = "footnote", content = bodyContent()) => ({ type: "noteBody", attrs: { noteId: id, kind }, content });

const noteExtensions = [
  Document.extend({ content: "(paragraph | noteBody)+" }),
  Paragraph,
  Text,
  Bold,
  Link,
  NoteReference,
  NoteBody,
  Extension.create({
    name: "noteOperationTestHistory",
    addProseMirrorPlugins: () => [history()]
  })
];

const createEditor = (content, extraExtensions = []) => {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [...noteExtensions, ...extraExtensions],
    content
  });
  editors.push(editor);
  return editor;
};

const setCursor = (editor, position) => editor.view.dispatch(
  editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position))
);

const countDispatches = (editor) => {
  const original = editor.view.dispatch.bind(editor.view);
  let count = 0;
  editor.view.dispatch = (transaction) => {
    count += 1;
    original(transaction);
  };
  return () => count;
};

const expectRejectedWithoutDispatch = (editor, operation, code, options) => {
  const before = editor.getJSON();
  const dispatches = countDispatches(editor);
  const result = executeNoteOperation(editor, operation, options);
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(dispatches()).toBe(0);
  expect(editor.getJSON()).toEqual(before);
};

afterEach(() => {
  while (editors.length) editors.pop().destroy();
});

describe("N1b typed note operation adapter", () => {
  it("inserts one pair in one transaction, derives numbering, and undo/redo is one step", () => {
    const editor = createEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }] });
    setCursor(editor, 3);
    const before = editor.getJSON();
    const dispatches = countDispatches(editor);
    const adapter = createNoteOperationAdapter({ idFactory: () => noteId("inserted") });
    const result = adapter.execute(editor, {
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      bodyContent: bodyContent("Inserted body")
    });
    const after = editor.getJSON();

    expect(result).toEqual({
      ok: true,
      result: "applied",
      numbering: [{ noteId: noteId("inserted"), kind: "footnote", number: 1 }]
    });
    expect(dispatches()).toBe(1);
    expect(after.content[0].content).toEqual([
      { type: "text", text: "Al" }, reference(noteId("inserted")), { type: "text", text: "pha" }
    ]);
    expect(after.content[1]).toEqual(body(noteId("inserted"), "footnote", bodyContent("Inserted body")));
    expect(undoDepth(editor.state)).toBe(1);
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(after);
    expect(redoDepth(editor.state)).toBe(0);
  });

  it("updates only the target body and preserves every unrelated JSON byte", () => {
    const target = noteId("update-target");
    const other = noteId("update-other");
    const editor = createEditor({ type: "doc", content: [
      { type: "paragraph", attrs: { custom: "kept" }, content: [{ type: "text", text: "One " }, reference(target), { type: "text", text: " two" }] },
      { type: "paragraph", content: [reference(other, "endnote")] },
      body(target, "footnote", bodyContent("old")),
      body(other, "endnote", bodyContent("other"))
    ] });
    const before = editor.getJSON();
    const dispatches = countDispatches(editor);
    const result = executeNoteOperation(editor, {
      type: NOTE_OPERATION_TYPES.UPDATE_BODY,
      noteId: target,
      bodyContent: bodyContent("new")
    });
    const after = editor.getJSON();

    expect(result.ok).toBe(true);
    expect(dispatches()).toBe(1);
    expect(after.content.slice(0, 3)).toEqual([...before.content.slice(0, 2), body(target, "footnote", bodyContent("new"))]);
    expect(after.content[3]).toEqual(before.content[3]);
    expect(deriveNoteReferenceNumbers(after)).toEqual([
      { noteId: target, kind: "footnote", number: 1 },
      { noteId: other, kind: "endnote", number: 1 }
    ]);
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("deletes exactly the matching reference and root body atomically", () => {
    const target = noteId("delete-target");
    const other = noteId("delete-other");
    const editor = createEditor({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "A" }, reference(target), { type: "text", text: "B" }, reference(other)] },
      body(target, "footnote", bodyContent("target")),
      body(other, "footnote", bodyContent("other"))
    ] });
    const before = editor.getJSON();
    const dispatches = countDispatches(editor);
    const result = executeNoteOperation(editor, { type: NOTE_OPERATION_TYPES.DELETE, noteId: target });

    expect(result).toMatchObject({ ok: true, numbering: [{ noteId: other, kind: "footnote", number: 1 }] });
    expect(dispatches()).toBe(1);
    expect(editor.getJSON()).toEqual({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "AB" }, reference(other)] },
      body(other, "footnote", bodyContent("other"))
    ] });
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("converts both kinds atomically while preserving ID/body and renumbering both series", () => {
    const target = noteId("convert-target");
    const footnote = noteId("convert-footnote");
    const editor = createEditor({ type: "doc", content: [
      { type: "paragraph", content: [reference(target, "footnote")] },
      { type: "paragraph", content: [reference(footnote, "footnote")] },
      body(target, "footnote", bodyContent("keep me")),
      body(footnote, "footnote", bodyContent("other"))
    ] });
    const before = editor.getJSON();
    const dispatches = countDispatches(editor);
    const result = executeNoteOperation(editor, { type: NOTE_OPERATION_TYPES.CONVERT_KIND, noteId: target, kind: "endnote" });
    const after = editor.getJSON();

    expect(result).toMatchObject({ ok: true, numbering: [
      { noteId: target, kind: "endnote", number: 1 },
      { noteId: footnote, kind: "footnote", number: 1 }
    ] });
    expect(dispatches()).toBe(1);
    expect(after.content[0]).toEqual({ type: "paragraph", content: [reference(target, "endnote")] });
    expect(after.content[2]).toEqual(body(target, "endnote", bodyContent("keep me")));
    expect(after.content[1]).toEqual(before.content[1]);
    expect(after.content[3]).toEqual(before.content[3]);
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("fails closed without dispatch for every invalid operation path", () => {
    const id = noteId("existing");
    const editor = createEditor({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "text" }, reference(id)] }, body(id, "footnote", bodyContent("body"))
    ] });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 2)));
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", bodyContent: bodyContent() }, NOTE_OPERATION_ERROR_CODES.INVALID_POSITION);
    expectRejectedWithoutDispatch(editor, { type: "unknown" }, NOTE_OPERATION_ERROR_CODES.UNKNOWN_OPERATION);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.INSERT, kind: "side-note", bodyContent: bodyContent() }, NOTE_OPERATION_ERROR_CODES.INVALID_KIND);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", position: 1, bodyContent: [{ type: "heading" }] }, NOTE_OPERATION_ERROR_CODES.UNSUPPORTED_BODY_CONTENT);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", position: 999, bodyContent: bodyContent() }, NOTE_OPERATION_ERROR_CODES.INVALID_POSITION);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.UPDATE_BODY, noteId: "bad id", bodyContent: bodyContent() }, NOTE_OPERATION_ERROR_CODES.INVALID_NOTE_ID);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.UPDATE_BODY, noteId: noteId("missing"), bodyContent: bodyContent() }, NOTE_OPERATION_ERROR_CODES.NOTE_NOT_FOUND);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.CONVERT_KIND, noteId: id, kind: "side-note" }, NOTE_OPERATION_ERROR_CODES.INVALID_KIND);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.UPDATE_BODY, noteId: id, bodyContent: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:bad" } }] }] }] }, NOTE_OPERATION_ERROR_CODES.CANDIDATE_INVALID);
  });

  it("rejects invalid current pairs, collisions, and exact pair/body limits without dispatch", () => {
    const collision = noteId("collision");
    const editor = createEditor({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "x" }, reference(collision)] }, body(collision)
    ] });
    setCursor(editor, 2);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", bodyContent: bodyContent() }, NOTE_OPERATION_ERROR_CODES.NOTE_ID_COLLISION, { idFactory: () => collision });

    const exactContent = [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
    const emptyBytes = new TextEncoder().encode(JSON.stringify(exactContent)).length;
    exactContent[0].content[0].text = "x".repeat(NOTE_BODY_MAX_UTF8_BYTES - emptyBytes);
    expect(new TextEncoder().encode(JSON.stringify(exactContent))).toHaveLength(NOTE_BODY_MAX_UTF8_BYTES);
    const result = executeNoteOperation(editor, { type: NOTE_OPERATION_TYPES.UPDATE_BODY, noteId: collision, bodyContent: exactContent });
    expect(result.ok).toBe(true);
    expectRejectedWithoutDispatch(editor, { type: NOTE_OPERATION_TYPES.UPDATE_BODY, noteId: collision, bodyContent: [{ type: "paragraph", content: [{ type: "text", text: `${exactContent[0].content[0].text}x` }] }] }, NOTE_OPERATION_ERROR_CODES.CANDIDATE_INVALID);

    const pairs = [];
    for (let index = 0; index < NOTE_PAIR_LIMIT; index += 1) {
      const id = noteId(`limit-${index}`);
      pairs.push({ type: "paragraph", content: [reference(id)] }, body(id));
    }
    const atLimit = createEditor({ type: "doc", content: pairs });
    setCursor(atLimit, 1);
    expectRejectedWithoutDispatch(atLimit, { type: NOTE_OPERATION_TYPES.INSERT, kind: "footnote", bodyContent: bodyContent() }, NOTE_OPERATION_ERROR_CODES.CANDIDATE_INVALID, { idFactory: () => noteId("over-limit") });

    const invalid = createEditor({ type: "doc", content: [{ type: "paragraph", content: [reference(noteId("dangling"))] }] });
    expectRejectedWithoutDispatch(invalid, { type: NOTE_OPERATION_TYPES.DELETE, noteId: noteId("dangling") }, NOTE_OPERATION_ERROR_CODES.PREFLIGHT_FAILED);
  });

  it("rejects no-op updates and same-kind conversions without dispatch or history", () => {
    const id = noteId("no-op");
    const content = bodyContent("unchanged");
    const editor = createEditor({ type: "doc", content: [
      { type: "paragraph", content: [reference(id)] },
      body(id, "footnote", content)
    ] });
    const before = editor.getJSON();

    expectRejectedWithoutDispatch(
      editor,
      { type: NOTE_OPERATION_TYPES.UPDATE_BODY, noteId: id, bodyContent: content },
      NOTE_OPERATION_ERROR_CODES.NO_CHANGE
    );
    expectRejectedWithoutDispatch(
      editor,
      { type: NOTE_OPERATION_TYPES.CONVERT_KIND, noteId: id, kind: "footnote" },
      NOTE_OPERATION_ERROR_CODES.NO_CHANGE
    );
    expect(editor.getJSON()).toEqual(before);
    expect(undoDepth(editor.state)).toBe(0);
  });

  it("rejects an incompatible textblock before building or dispatching a transaction", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        Document.extend({ content: "(paragraph | codeBlock | noteBody)+" }),
        Paragraph,
        CodeBlock,
        Text,
        NoteReference,
        NoteBody
      ],
      content: { type: "doc", content: [{
        type: "codeBlock",
        content: [{ type: "text", text: "code" }]
      }] }
    });
    editors.push(editor);
    const before = editor.getJSON();
    const dispatches = countDispatches(editor);
    const result = executeNoteOperation(editor, {
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      position: 2,
      bodyContent: bodyContent("body")
    }, { idFactory: () => noteId("code-block") });

    expect(result).toMatchObject({
      ok: false,
      error: { code: NOTE_OPERATION_ERROR_CODES.INVALID_POSITION }
    });
    expect(dispatches()).toBe(0);
    expect(editor.getJSON()).toEqual(before);
  });

  it("does not report success when a plugin rejects the dispatched transaction", () => {
    const rejectChanges = Extension.create({
      name: "rejectNoteOperationChanges",
      addProseMirrorPlugins: () => [new Plugin({
        key: new PluginKey("rejectNoteOperationChanges"),
        filterTransaction: (transaction) => !transaction.docChanged
      })]
    });
    const editor = createEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "text" }] }]
    }, [rejectChanges]);
    setCursor(editor, 2);
    const before = editor.getJSON();
    const dispatches = countDispatches(editor);
    const result = executeNoteOperation(editor, {
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      bodyContent: bodyContent("body")
    }, { idFactory: () => noteId("filtered") });

    expect(result).toMatchObject({
      ok: false,
      error: { code: NOTE_OPERATION_ERROR_CODES.DISPATCH_REJECTED }
    });
    expect(dispatches()).toBe(1);
    expect(editor.getJSON()).toEqual(before);
    expect(undoDepth(editor.state)).toBe(0);
  });

  it("detects an invalid append-transaction result and requires recovery instead of claiming success", () => {
    const corruptMeta = "testCorruptNotePair";
    const corruptPair = Extension.create({
      name: "corruptNotePairAfterDispatch",
      addProseMirrorPlugins: () => [new Plugin({
        key: new PluginKey("corruptNotePairAfterDispatch"),
        appendTransaction(transactions, _oldState, newState) {
          if (
            transactions.some((transaction) => transaction.getMeta(corruptMeta)) ||
            !transactions.some((transaction) => transaction.docChanged)
          ) {
            return null;
          }
          let target = null;
          newState.doc.descendants((node, position) => {
            if (!target && node.type.name === "noteBody") {
              target = { node, position };
            }
          });
          if (!target) return null;
          return newState.tr
            .setNodeMarkup(target.position, undefined, {
              ...target.node.attrs,
              kind: "endnote"
            })
            .setMeta(corruptMeta, true);
        }
      })]
    });
    const editor = createEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "text" }] }]
    }, [corruptPair]);
    setCursor(editor, 2);
    const dispatches = countDispatches(editor);
    const result = executeNoteOperation(editor, {
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      bodyContent: bodyContent("body")
    }, { idFactory: () => noteId("post-dispatch") });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: NOTE_OPERATION_ERROR_CODES.POST_DISPATCH_INVALID,
        recoveryRequired: true
      }
    });
    expect(dispatches()).toBe(1);
    expect(result.error.errors.map((error) => error.code)).toContain(
      "NOTE_KIND_MISMATCH"
    );
  });

  it("detects a valid but semantically divergent append transaction", () => {
    const rewriteMeta = "testRewriteNotePair";
    const rewritePair = Extension.create({
      name: "rewriteNotePairAfterDispatch",
      addProseMirrorPlugins: () => [new Plugin({
        key: new PluginKey("rewriteNotePairAfterDispatch"),
        appendTransaction(transactions, _oldState, newState) {
          if (
            transactions.some((transaction) => transaction.getMeta(rewriteMeta)) ||
            !transactions.some((transaction) => transaction.docChanged)
          ) {
            return null;
          }
          const targets = [];
          newState.doc.descendants((node, position) => {
            if (node.type.name === "noteReference" || node.type.name === "noteBody") {
              targets.push({ node, position });
            }
          });
          if (targets.length !== 2) return null;
          const transaction = newState.tr;
          targets.forEach(({ node, position }) => {
            transaction.setNodeMarkup(position, undefined, {
              ...node.attrs,
              kind: "endnote"
            });
          });
          return transaction.setMeta(rewriteMeta, true);
        }
      })]
    });
    const editor = createEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "text" }] }]
    }, [rewritePair]);
    setCursor(editor, 2);
    const result = executeNoteOperation(editor, {
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      bodyContent: bodyContent("body")
    }, { idFactory: () => noteId("diverged") });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: NOTE_OPERATION_ERROR_CODES.POST_DISPATCH_DIVERGED,
        recoveryRequired: true
      }
    });
    expect(deriveNoteReferenceNumbers(editor.state.doc)).toEqual([
      { noteId: noteId("diverged"), kind: "endnote", number: 1 }
    ]);
  });

  it("distinguishes dispatch exceptions before and after an applied mutation", () => {
    const makeEditor = (suffix) => {
      const editor = createEditor({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "text" }] }]
      });
      setCursor(editor, 2);
      return {
        editor,
        operation: {
          type: NOTE_OPERATION_TYPES.INSERT,
          kind: "footnote",
          bodyContent: bodyContent("body")
        },
        options: { idFactory: () => noteId(suffix) }
      };
    };

    const rejected = makeEditor("throw-before");
    const rejectedBefore = rejected.editor.getJSON();
    rejected.editor.view.dispatch = () => {
      throw new Error("rejected before apply");
    };
    const rejectedResult = executeNoteOperation(
      rejected.editor,
      rejected.operation,
      rejected.options
    );
    expect(rejectedResult).toMatchObject({
      ok: false,
      error: {
        code: NOTE_OPERATION_ERROR_CODES.DISPATCH_FAILED,
        recoveryRequired: false
      }
    });
    expect(rejected.editor.getJSON()).toEqual(rejectedBefore);

    const partial = makeEditor("throw-after");
    const partialBefore = partial.editor.getJSON();
    const originalDispatch = partial.editor.view.dispatch.bind(partial.editor.view);
    partial.editor.view.dispatch = (transaction) => {
      originalDispatch(transaction);
      throw new Error("failed after apply");
    };
    const partialResult = executeNoteOperation(
      partial.editor,
      partial.operation,
      partial.options
    );
    expect(partialResult).toMatchObject({
      ok: false,
      error: {
        code: NOTE_OPERATION_ERROR_CODES.DISPATCH_FAILED,
        recoveryRequired: true
      }
    });
    expect(partial.editor.getJSON()).not.toEqual(partialBefore);
  });
});
