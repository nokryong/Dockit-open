/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Editor, Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Link from "@tiptap/extension-link";
import { Fragment, Slice } from "@tiptap/pm/model";
import { history, redo, undo } from "@tiptap/pm/history";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import NoteClipboardRemap from "../../app/LIB/extensions/NoteClipboardRemap";
import { deriveNoteReferenceNumbers } from "../../app/LIB/utils/noteSemanticUtils";
import {
  NOTE_BODY_MAX_UTF8_BYTES,
  NOTE_PAIR_LIMIT
} from "../../app/LIB/utils/noteSemanticUtils";
import {
  NOTE_CLIPBOARD_ERROR_CODES,
  createNoteClipboardProvenance,
  executeNoteClipboardPaste,
  preflightNoteClipboardSlice,
  preflightRawNoteClipboardHtml
} from "../../app/LIB/utils/noteClipboardRemapUtils";

const editors = [];
const editorExtensionsPath = resolve(process.cwd(), "app/LIB/constant/editorExtensions.js");
const contentEditorPath = resolve(process.cwd(), "app/LIB/components/write/ContentEditor.js");
const noteRuntimePath = resolve(process.cwd(), "app/LIB/extensions/noteInteractionRuntime.js");
const id = (suffix) => `note-v1-${suffix}`;
const reference = (noteId, kind = "footnote") => ({ type: "noteReference", attrs: { noteId, kind } });
const body = (noteId, kind = "footnote", text = "body") => ({
  type: "noteBody", attrs: { noteId, kind }, content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }]
});
const documentWith = (...content) => ({ type: "doc", content });

const extensions = [
  Document.extend({ content: "(paragraph | noteBody)+" }),
  Paragraph,
  Text,
  Link.configure({ openOnClick: false }),
  NoteReference,
  NoteBody,
  Extension.create({ name: "noteClipboardHistory", addProseMirrorPlugins: () => [history()] })
];

const createEditor = (content, extra = []) => {
  const editor = new Editor({ element: document.createElement("div"), extensions: [...extensions, ...extra], content });
  editors.push(editor);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)));
  return editor;
};

const sliceFrom = (editor, content) => new Slice(
  Fragment.fromArray(content.map((node) => editor.schema.nodeFromJSON(node))),
  0,
  0
);

const dispatchCounter = (editor) => {
  const original = editor.view.dispatch.bind(editor.view);
  let calls = 0;
  editor.view.dispatch = (transaction) => { calls += 1; original(transaction); };
  return () => calls;
};

afterEach(() => { while (editors.length) editors.pop().destroy(); });

describe("N1d deterministic note clipboard remap", () => {
  it("remaps single and multi-pair slices deterministically, including collisions", () => {
    const source = createEditor(documentWith({ type: "paragraph", content: [{ type: "text", text: "source" }] }));
    const slice = sliceFrom(source, [
      { type: "paragraph", content: [reference(id("one"), "footnote"), reference(id("two"), "endnote")] },
      body(id("one"), "footnote", "one"), body(id("two"), "endnote", "two")
    ]);
    const destination = createEditor(documentWith({ type: "paragraph", content: [{ type: "text", text: "destination" }] }));
    const first = preflightNoteClipboardSlice({ slice, destinationDocument: destination.state.doc });
    const second = preflightNoteClipboardSlice({ slice, destinationDocument: destination.state.doc });
    expect(first).toMatchObject({ ok: true, result: "remapped" });
    expect(first.mapping).toEqual(second.mapping);
    expect(first.mapping.map(({ sourceId }) => sourceId)).toEqual([id("one"), id("two")]);

    const collisionId = first.mapping[0].noteId;
    const collision = createEditor(documentWith(
      { type: "paragraph", content: [reference(collisionId)] }, body(collisionId)
    ));
    const collided = preflightNoteClipboardSlice({ slice, destinationDocument: collision.state.doc });
    expect(collided.mapping[0].noteId).toBe(`${collisionId}-2`);
  });

  it("keeps footnote/endnote pairing and numbering after one atomic paste with exact undo/redo", () => {
    const editor = createEditor(documentWith({ type: "paragraph", content: [{ type: "text", text: "destination" }] }));
    const slice = sliceFrom(editor, [
      { type: "paragraph", content: [reference(id("foot")), reference(id("end"), "endnote")] },
      body(id("foot"), "footnote", "foot"), body(id("end"), "endnote", "end")
    ]);
    const before = editor.getJSON();
    const count = dispatchCounter(editor);
    const result = executeNoteClipboardPaste(editor.view, slice);
    const after = editor.getJSON();
    expect(result).toMatchObject({ ok: true, result: "applied" });
    expect(count()).toBe(1);
    expect(deriveNoteReferenceNumbers(editor.state.doc)).toEqual([
      { noteId: result.mapping[0].noteId, kind: "footnote", number: 1 },
      { noteId: result.mapping[1].noteId, kind: "endnote", number: 1 }
    ]);
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(after);
  });

  it("normalizes pasted bodies to the resulting reference order before exact dispatch validation", () => {
    const existing = id("paste-order-existing");
    const incoming = id("paste-order-incoming");
    const editor = createEditor(documentWith(
      { type: "paragraph", content: [reference(existing)] },
      body(existing, "footnote", "existing")
    ));
    const slice = sliceFrom(editor, [
      { type: "paragraph", content: [reference(incoming)] },
      body(incoming, "footnote", "incoming")
    ]);

    const result = executeNoteClipboardPaste(editor.view, slice);
    const references = deriveNoteReferenceNumbers(editor.state.doc)
      .map(({ noteId }) => noteId);
    const bodies = [];
    editor.state.doc.forEach((node) => {
      if (node.type.name === "noteBody") bodies.push(node.attrs.noteId);
    });

    expect(result).toMatchObject({ ok: true, result: "applied" });
    expect(bodies).toEqual(references);
  });

  it("rejects partial, duplicate, invalid, nested, and over-limit note slices without dispatch or mutation", () => {
    const existing = id("existing");
    const editor = createEditor(documentWith(
      { type: "paragraph", content: [reference(existing)] }, body(existing)
    ));
    const cases = [
      [sliceFrom(editor, [{ type: "paragraph", content: [reference(id("partial"))] }]), NOTE_CLIPBOARD_ERROR_CODES.INCOMPLETE_PAIR],
      [sliceFrom(editor, [{ type: "paragraph", content: [reference(id("duplicate")), reference(id("duplicate"))] }, body(id("duplicate"))]), NOTE_CLIPBOARD_ERROR_CODES.DUPLICATE_PAIR],
      [sliceFrom(editor, [{ type: "paragraph", content: [reference("bad id")] }, body("bad id")]), NOTE_CLIPBOARD_ERROR_CODES.INVALID_PAIR],
      [sliceFrom(editor, [{ type: "paragraph", content: [reference(id("nested"))] }, {
        type: "noteBody", attrs: { noteId: id("nested"), kind: "footnote" }, content: [{ type: "paragraph", content: [reference(id("inside"))] }]
      }]), NOTE_CLIPBOARD_ERROR_CODES.INCOMPLETE_PAIR]
    ];
    cases.forEach(([slice, code]) => {
      const before = editor.getJSON();
      const beforeSelection = editor.state.selection.toJSON();
      const count = dispatchCounter(editor);
      expect(executeNoteClipboardPaste(editor.view, slice)).toMatchObject({ ok: false, error: { code } });
      expect(count()).toBe(0);
      expect(editor.getJSON()).toEqual(before);
      expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
    });

    const unsafeId = id("unsafe-link");
    const unsafe = sliceFrom(editor, [
      { type: "paragraph", content: [reference(unsafeId)] },
      {
        type: "noteBody",
        attrs: { noteId: unsafeId, kind: "footnote" },
        content: [{
          type: "paragraph",
          content: [{
            type: "text",
            text: "unsafe",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }]
          }]
        }]
      }
    ]);
    expect(executeNoteClipboardPaste(editor.view, unsafe)).toMatchObject({
      ok: false,
      error: {
        code: NOTE_CLIPBOARD_ERROR_CODES.CANDIDATE_INVALID,
        semanticCodes: expect.arrayContaining(["NOTE_BODY_UNSAFE_LINK"])
      }
    });

    const oversizedId = id("oversized");
    const oversized = sliceFrom(editor, [
      { type: "paragraph", content: [reference(oversizedId)] },
      body(oversizedId, "footnote", "x".repeat(NOTE_BODY_MAX_UTF8_BYTES + 1))
    ]);
    expect(executeNoteClipboardPaste(editor.view, oversized)).toMatchObject({
      ok: false,
      error: {
        code: NOTE_CLIPBOARD_ERROR_CODES.CANDIDATE_INVALID,
        semanticCodes: expect.arrayContaining(["NOTE_BODY_PAYLOAD_TOO_LARGE"])
      }
    });

    const overLimit = [];
    for (let index = 0; index < NOTE_PAIR_LIMIT; index += 1) {
      overLimit.push({ type: "paragraph", content: [reference(id(`limit-${index}`))] }, body(id(`limit-${index}`)));
    }
    const before = editor.getJSON();
    const count = dispatchCounter(editor);
    expect(executeNoteClipboardPaste(editor.view, sliceFrom(editor, overLimit))).toMatchObject({
      ok: false, error: { code: NOTE_CLIPBOARD_ERROR_CODES.CANDIDATE_INVALID }
    });
    expect(count()).toBe(0);
    expect(editor.getJSON()).toEqual(before);
  });

  it("preserves IDs only for confirmed same-editor cuts; copies and external slices remap", () => {
    const editor = createEditor(documentWith({ type: "paragraph", content: [{ type: "text", text: "destination" }] }));
    const pairSlice = sliceFrom(editor, [{ type: "paragraph", content: [reference(id("cut"))] }, body(id("cut"))]);
    const provenance = createNoteClipboardProvenance();
    provenance.begin("copy");
    provenance.record(pairSlice, editor.state.doc);
    expect(executeNoteClipboardPaste(editor.view, pairSlice, provenance).mapping[0].noteId).not.toBe(id("cut"));

    const cutEditor = createEditor(documentWith(
      { type: "paragraph", content: [reference(id("cut"))] },
      body(id("cut"))
    ));
    const cutSlice = sliceFrom(cutEditor, [
      { type: "paragraph", content: [reference(id("cut"))] },
      body(id("cut"))
    ]);
    const cutProvenance = createNoteClipboardProvenance();
    cutProvenance.begin("cut");
    cutProvenance.record(cutSlice, cutEditor.view);
    expect(cutProvenance.canPreserve(cutSlice, cutEditor.view)).toBe(false);
    cutEditor.commands.setContent(
      documentWith({ type: "paragraph", content: [{ type: "text", text: "destination" }] }),
      false
    );
    cutProvenance.confirmCut(cutEditor.view);
    expect(cutProvenance.canPreserve(cutSlice, cutEditor.view)).toBe(true);
    expect(executeNoteClipboardPaste(cutEditor.view, cutSlice, cutProvenance).mapping).toEqual([
      { sourceId: id("cut"), noteId: id("cut") }
    ]);
    expect(cutProvenance.canPreserve(cutSlice, cutEditor.view)).toBe(false);

    const sourceEditor = createEditor(documentWith(
      { type: "paragraph", content: [reference(id("cross"))] },
      body(id("cross"))
    ));
    const destinationEditor = createEditor(
      documentWith({ type: "paragraph", content: [{ type: "text", text: "destination" }] })
    );
    const crossContent = [
      { type: "paragraph", content: [reference(id("cross"))] },
      body(id("cross"))
    ];
    const crossSlice = sliceFrom(sourceEditor, crossContent);
    const destinationSlice = sliceFrom(destinationEditor, crossContent);
    const crossProvenance = createNoteClipboardProvenance();
    crossProvenance.begin("cut");
    crossProvenance.record(crossSlice, sourceEditor.view);
    sourceEditor.commands.setContent(documentWith({ type: "paragraph" }), false);
    crossProvenance.confirmCut(sourceEditor.view);
    const crossResult = executeNoteClipboardPaste(
      destinationEditor.view,
      destinationSlice,
      crossProvenance
    );
    expect(crossResult).toMatchObject({ ok: true, result: "applied" });
    expect(crossResult.mapping[0].noteId).not.toBe(id("cross"));
  });

  it("keeps confirmed cut provenance after a pre-dispatch failure so retry is exact", () => {
    const editor = createEditor(documentWith(
      { type: "paragraph", content: [reference(id("retry"))] },
      body(id("retry"))
    ));
    const slice = sliceFrom(editor, [
      { type: "paragraph", content: [reference(id("retry"))] },
      body(id("retry"))
    ]);
    const provenance = createNoteClipboardProvenance();
    provenance.begin("cut");
    provenance.record(slice, editor.view);
    editor.commands.setContent(documentWith({ type: "paragraph" }), false);
    provenance.confirmCut(editor.view);

    const originalDispatch = editor.view.dispatch.bind(editor.view);
    editor.view.dispatch = () => {
      throw new Error("pre-dispatch failure");
    };
    expect(executeNoteClipboardPaste(editor.view, slice, provenance)).toMatchObject({
      ok: false,
      error: {
        code: NOTE_CLIPBOARD_ERROR_CODES.DISPATCH_FAILED,
        recoveryRequired: false
      }
    });
    expect(provenance.canPreserve(slice, editor.view)).toBe(true);

    editor.view.dispatch = originalDispatch;
    expect(executeNoteClipboardPaste(editor.view, slice, provenance).mapping).toEqual([
      { sourceId: id("retry"), noteId: id("retry") }
    ]);
    expect(provenance.canPreserve(slice, editor.view)).toBe(false);
  });

  it("rejects raw note HTML that would silently drop unknown or unsafe body payload", () => {
    const editor = createEditor(documentWith({ type: "paragraph" }));
    const noteId = id("raw");
    const slice = sliceFrom(editor, [
      { type: "paragraph", content: [reference(noteId)] },
      body(noteId)
    ]);
    const canonical =
      `<p><span data-dockit-note-reference="true" data-dockit-note-id="${noteId}" data-dockit-note-kind="footnote"></span></p>` +
      `<section data-dockit-note-body="true" data-dockit-note-id="${noteId}" data-dockit-note-kind="footnote"><p>body</p></section>`;
    expect(preflightRawNoteClipboardHtml({ html: canonical, slice })).toMatchObject({
      ok: true,
      result: "validated-note-html"
    });
    expect(
      preflightRawNoteClipboardHtml({
        html: canonical.replace("<p>body</p>", "<p><video>hidden</video>body</p>"),
        slice
      })
    ).toMatchObject({
      ok: false,
      error: { code: NOTE_CLIPBOARD_ERROR_CODES.RAW_HTML_INVALID }
    });
    expect(
      preflightRawNoteClipboardHtml({
        html: canonical.replace("<p>body</p>", '<p><a href="javascript:alert(1)">body</a></p>'),
        slice
      })
    ).toMatchObject({
      ok: false,
      error: { code: NOTE_CLIPBOARD_ERROR_CODES.RAW_HTML_INVALID }
    });
  });

  it("keeps rejection diagnostics free of source and destination note IDs", () => {
    const privateId = id("private-destination-id");
    const invalidDestination = createEditor(
      documentWith({ type: "paragraph", content: [reference(privateId)] })
    );
    const sourceId = id("private-source-id");
    const slice = sliceFrom(invalidDestination, [
      { type: "paragraph", content: [reference(sourceId)] },
      body(sourceId)
    ]);
    const result = preflightNoteClipboardSlice({
      slice,
      destinationDocument: invalidDestination.state.doc
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: NOTE_CLIPBOARD_ERROR_CODES.PREFLIGHT_FAILED,
        semanticCodes: expect.arrayContaining(["DANGLING_NOTE_REFERENCE"])
      }
    });
    expect(JSON.stringify(result.error)).not.toContain(privateId);
    expect(JSON.stringify(result.error)).not.toContain(sourceId);
  });

  it("passes note-free paste through and is registered alongside the existing table paste guard", () => {
    const editor = createEditor(documentWith({ type: "paragraph", content: [{ type: "text", text: "destination" }] }), [NoteClipboardRemap]);
    const plain = sliceFrom(editor, [{ type: "paragraph", content: [{ type: "text", text: "plain" }] }]);
    const clipboardPlugin = editor.state.plugins.find((plugin) =>
      plugin.key.startsWith("noteClipboardRemap")
    );
    const handlePaste = clipboardPlugin.props.handlePaste;
    expect(handlePaste(editor.view, {}, plain)).toBe(false);
    const count = dispatchCounter(editor);
    const notes = sliceFrom(editor, [{ type: "paragraph", content: [reference(id("extension"))] }, body(id("extension"))]);
    expect(handlePaste(editor.view, {}, notes)).toBe(true);
    expect(count()).toBe(1);
    const rawNoteId = id("extension-raw");
    const rawNotes = sliceFrom(editor, [
      { type: "paragraph", content: [reference(rawNoteId)] },
      body(rawNoteId)
    ]);
    const unsafeRawHtml =
      `<p><span data-dockit-note-reference="true" data-dockit-note-id="${rawNoteId}" data-dockit-note-kind="footnote"></span></p>` +
      `<section data-dockit-note-body="true" data-dockit-note-id="${rawNoteId}" data-dockit-note-kind="footnote"><p><video>hidden</video>body</p></section>`;
    expect(handlePaste(editor.view, {
      clipboardData: { getData: () => unsafeRawHtml }
    }, rawNotes)).toBe(true);
    expect(count()).toBe(1);
    expect(NoteClipboardRemap.name).toBe("noteClipboardRemap");
    expect(readFileSync(editorExtensionsPath, "utf8")).not.toContain("NoteClipboardRemap");
    expect(readFileSync(contentEditorPath, "utf8")).toContain("noteInteractionRuntime");
    expect(readFileSync(noteRuntimePath, "utf8")).toContain("installNoteClipboardRemap");
    expect(readFileSync(contentEditorPath, "utf8")).toContain("TableRowOverflowGuard.configure");
  });

  it("wires exact same-editor cut provenance through the extension", async () => {
    const noteId = id("extension-cut");
    const editor = createEditor(documentWith(
      { type: "paragraph", content: [reference(noteId)] },
      body(noteId)
    ), [NoteClipboardRemap]);
    const clipboardPlugin = editor.state.plugins.find((plugin) =>
      plugin.key.startsWith("noteClipboardRemap")
    );
    const slice = sliceFrom(editor, [
      { type: "paragraph", content: [reference(noteId)] },
      body(noteId)
    ]);

    clipboardPlugin.props.handleDOMEvents.cut(editor.view, { type: "cut" });
    clipboardPlugin.props.transformCopied(slice, editor.view);
    editor.commands.setContent(documentWith({ type: "paragraph" }), false);
    await Promise.resolve();

    expect(clipboardPlugin.props.handlePaste(editor.view, {}, slice)).toBe(true);
    expect(deriveNoteReferenceNumbers(editor.state.doc)).toEqual([
      { noteId, kind: "footnote", number: 1 }
    ]);
  });

  it("returns recovery-required diagnostics if an append transaction diverges", () => {
    const corrupt = Extension.create({
      name: "clipboardCorruptAfterPaste",
      addProseMirrorPlugins: () => [new Plugin({
        key: new PluginKey("clipboardCorruptAfterPaste"),
        appendTransaction(transactions, _oldState, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          let target;
          state.doc.descendants((node, pos) => { if (!target && node.type.name === "noteBody") target = { node, pos }; });
          return target ? state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, kind: "endnote" }) : null;
        }
      })]
    });
    const editor = createEditor(documentWith({ type: "paragraph", content: [{ type: "text", text: "destination" }] }), [corrupt]);
    const slice = sliceFrom(editor, [{ type: "paragraph", content: [reference(id("bad"))] }, body(id("bad"))]);
    expect(executeNoteClipboardPaste(editor.view, slice)).toMatchObject({
      ok: false, error: { code: NOTE_CLIPBOARD_ERROR_CODES.POST_DISPATCH_INVALID, recoveryRequired: true }
    });
  });
});
