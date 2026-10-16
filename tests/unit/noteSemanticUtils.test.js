/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import { undo, undoDepth } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import { editorExtensions } from "../../app/LIB/constant/editorExtensions";
import {
  NOTE_BODY_MAX_UTF8_BYTES,
  NOTE_ID_MAX_LENGTH,
  NOTE_ID_PREFIX,
  NOTE_PAIR_LIMIT,
  deriveNoteReferenceNumbers,
  validateNoteSemantics
} from "../../app/LIB/utils/noteSemanticUtils";
import {
  executeNoteOperation,
  NOTE_OPERATION_TYPES
} from "../../app/LIB/utils/noteOperationAdapter";



vi.mock("../../app/LIB/extensions/DiagramBlockView.js", () => ({
  default: function MockDiagramBlockView() {
    return null;
  }
}));
const editors = [];
const noteId = (suffix) => `note-v1-${suffix}`;
const createReference = (id, kind = "footnote") => ({
  type: "noteReference",
  attrs: { noteId: id, kind }
});
const createBody = (id, kind = "footnote", content = [{ type: "paragraph" }]) => ({
  type: "noteBody",
  attrs: { noteId: id, kind },
  content
});
const createDocument = (content) => ({ type: "doc", content });
const codes = (result) => result.errors.map((error) => error.code);

const noteExtensions = [
  Document.extend({ content: "(paragraph | noteBody)+" }),
  Paragraph,
  Text,
  Bold,
  NoteReference,
  NoteBody
];

const createEditor = (content) => {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: noteExtensions,
    content
  });
  editors.push(editor);
  return editor;
};

afterEach(() => {
  while (editors.length > 0) {
    editors.pop().destroy();
  }
});

describe("N1a note semantic foundation", () => {
  it("round-trips canonical note attrs and rich body text through HTML and reopen without an ordinal", () => {
    const id = noteId("roundtrip_01");
    const editor = createEditor(
      `<p>본문 <span data-dockit-note-reference="true" data-dockit-note-id="${id}" data-dockit-note-kind="footnote"></span></p>` +
        `<section data-dockit-note-body="true" data-dockit-note-id="${id}" data-dockit-note-kind="footnote"><p>보존할 <strong>rich text</strong></p></section>`
    );
    const firstJson = editor.getJSON();
    const html = editor.getHTML();
    const reopened = createEditor(html);

    expect(firstJson.content[0].content[1]).toMatchObject(createReference(id));
    expect(firstJson.content[0].content[1].attrs).toEqual({
      noteId: id,
      kind: "footnote"
    });
    expect(firstJson.content[1]).toMatchObject(createBody(id, "footnote"));
    expect(firstJson.content[1].attrs).toEqual({ noteId: id, kind: "footnote" });
    expect(firstJson.content[1].content[0].content[1]).toMatchObject({
      type: "text",
      text: "rich text",
      marks: [{ type: "bold" }]
    });
    expect(html).toContain('data-dockit-note-reference="true"');
    expect(html).toContain('data-dockit-note-body="true"');
    expect(html).toContain(`data-dockit-note-id="${id}"`);
    expect(html).not.toMatch(/note-(?:number|ordinal)|data-dockit-note-(?:number|ordinal)/);
    expect(reopened.getJSON()).toEqual(firstJson);
  });

  it("preserves malformed note semantics for explicit validator failure instead of silent HTML degradation", () => {
    const editor = createEditor(
      '<p>x<span data-dockit-note-reference="true" data-dockit-note-id="bad id" data-dockit-note-kind="footnote"></span></p>' +
        '<section data-dockit-note-body="true" data-dockit-note-id="bad id" data-dockit-note-kind="footnote"><p>body</p></section>'
    );

    expect(editor.getJSON().content[0].content[1]).toMatchObject({
      type: "noteReference",
      attrs: { noteId: "bad id", kind: "footnote" }
    });
    expect(codes(validateNoteSemantics(editor.getJSON()))).toContain(
      "INVALID_NOTE_ID"
    );
  });

  it("derives stable, independent numbers from reference order without mutating JSON", () => {
    const footnoteOne = noteId("footnote-one");
    const footnoteTwo = noteId("footnote-two");
    const endnoteOne = noteId("endnote-one");
    const input = createDocument([
      { type: "paragraph", content: [createReference(footnoteTwo)] },
      { type: "paragraph", content: [createReference(endnoteOne, "endnote")] },
      { type: "paragraph", content: [createReference(footnoteOne)] },
      createBody(footnoteOne),
      createBody(footnoteTwo),
      createBody(endnoteOne, "endnote")
    ]);
    const before = structuredClone(input);

    expect(deriveNoteReferenceNumbers(input)).toEqual([
      { noteId: footnoteTwo, kind: "footnote", number: 1 },
      { noteId: endnoteOne, kind: "endnote", number: 1 },
      { noteId: footnoteOne, kind: "footnote", number: 2 }
    ]);
    const reordered = createDocument([
      { type: "paragraph", content: [createReference(footnoteOne)] },
      { type: "paragraph", content: [createReference(endnoteOne, "endnote")] },
      { type: "paragraph", content: [createReference(footnoteTwo)] },
      createBody(footnoteOne),
      createBody(footnoteTwo),
      createBody(endnoteOne, "endnote")
    ]);

    expect(deriveNoteReferenceNumbers(reordered)).toEqual([
      { noteId: footnoteOne, kind: "footnote", number: 1 },
      { noteId: endnoteOne, kind: "endnote", number: 1 },
      { noteId: footnoteTwo, kind: "footnote", number: 2 }
    ]);
    expect(input).toEqual(before);
  });

  it.each([
    ["dangling reference", createDocument([{ type: "paragraph", content: [createReference(noteId("dangling"))] }]), "DANGLING_NOTE_REFERENCE"],
    ["orphan body", createDocument([createBody(noteId("orphan"))]), "ORPHAN_NOTE_BODY"],
    ["duplicate reference collision", createDocument([{ type: "paragraph", content: [createReference(noteId("collision")), createReference(noteId("collision"))] }, createBody(noteId("collision"))]), "DUPLICATE_NOTE_REFERENCE"],
    ["duplicate body collision", createDocument([{ type: "paragraph", content: [createReference(noteId("duplicate-body"))] }, createBody(noteId("duplicate-body")), createBody(noteId("duplicate-body"))]), "DUPLICATE_NOTE_BODY"],
    ["kind mismatch", createDocument([{ type: "paragraph", content: [createReference(noteId("kind"))] }, createBody(noteId("kind"), "endnote")]), "NOTE_KIND_MISMATCH"],
    ["invalid id", createDocument([{ type: "paragraph", content: [createReference("bad id")] }, createBody("bad id")]), "INVALID_NOTE_ID"],
    ["invalid kind", createDocument([{ type: "paragraph", content: [createReference(noteId("bad-kind"), "side-note")] }, createBody(noteId("bad-kind"), "side-note")]), "INVALID_NOTE_KIND"],
    ["nested reference", createDocument([{ type: "paragraph" }, createBody(noteId("nested"), "footnote", [{ type: "paragraph", content: [createReference(noteId("other"))] }])]), "NESTED_NOTE_REFERENCE"],
    ["unsupported body child", createDocument([{ type: "paragraph", content: [createReference(noteId("unsupported"))] }, createBody(noteId("unsupported"), "footnote", [{ type: "heading" }])]), "NOTE_BODY_UNSUPPORTED_CHILDREN"],
    ["unsupported body inline node", createDocument([{ type: "paragraph", content: [createReference(noteId("inline"))] }, createBody(noteId("inline"), "footnote", [{ type: "paragraph", content: [{ type: "image" }] }])]), "NOTE_BODY_UNSUPPORTED_INLINE"],
    ["unsupported body mark", createDocument([{ type: "paragraph", content: [createReference(noteId("mark"))] }, createBody(noteId("mark"), "footnote", [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "unknownMark" }] }] }])]), "NOTE_BODY_UNSUPPORTED_MARK"],
    ["unsafe body link", createDocument([{ type: "paragraph", content: [createReference(noteId("link"))] }, createBody(noteId("link"), "footnote", [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }])]), "NOTE_BODY_UNSAFE_LINK"],
    ["nested note body", createDocument([{ type: "paragraph", content: [createReference(noteId("nested-body")), { type: "noteBody", attrs: { noteId: noteId("nested-body"), kind: "footnote" }, content: [{ type: "paragraph" }] }] }]), "NOTE_BODY_NOT_DOCUMENT_OWNED"],
    ["root-level reference", createDocument([createReference(noteId("root-reference")), createBody(noteId("root-reference"))]), "NOTE_REFERENCE_NOT_INLINE"]
  ])("rejects %s", (_label, input, expectedCode) => {
    const result = validateNoteSemantics(input);

    expect(result.valid).toBe(false);
    expect(codes(result)).toContain(expectedCode);
  });

  it("rejects body payloads and documents over their N1a limits", () => {
    const payloadId = noteId("payload-limit");
    const bodyContent = [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
    const emptyPayloadBytes = new TextEncoder().encode(JSON.stringify(bodyContent)).length;
    bodyContent[0].content[0].text = "x".repeat(
      NOTE_BODY_MAX_UTF8_BYTES - emptyPayloadBytes
    );
    expect(new TextEncoder().encode(JSON.stringify(bodyContent))).toHaveLength(
      NOTE_BODY_MAX_UTF8_BYTES
    );
    const exactPayloadDocument = createDocument([
      { type: "paragraph", content: [createReference(payloadId)] },
      createBody(payloadId, "footnote", bodyContent)
    ]);
    const oversizedContent = structuredClone(bodyContent);
    oversizedContent[0].content[0].text += "x";
    const payloadResult = validateNoteSemantics(
      createDocument([
        { type: "paragraph", content: [createReference(payloadId)] },
        createBody(payloadId, "footnote", oversizedContent)
      ])
    );
    const pairContent = [];
    for (let index = 0; index <= NOTE_PAIR_LIMIT; index += 1) {
      const id = noteId(`limit-${index}`);
      pairContent.push({ type: "paragraph", content: [createReference(id)] }, createBody(id));
    }

    expect(validateNoteSemantics(exactPayloadDocument).valid).toBe(true);
    expect(codes(payloadResult)).toContain("NOTE_BODY_PAYLOAD_TOO_LARGE");
    expect(validateNoteSemantics(createDocument(
      pairContent.slice(0, NOTE_PAIR_LIMIT * 2)
    )).valid).toBe(true);
    expect(codes(validateNoteSemantics(createDocument(pairContent)))).toContain("NOTE_PAIR_LIMIT_EXCEEDED");
  });

  it("accepts supported rich-text marks and safe links", () => {
    const id = noteId("safe-rich-text");
    const result = validateNoteSemantics(createDocument([
      { type: "paragraph", content: [createReference(id)] },
      createBody(id, "footnote", [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "Dockit",
          marks: [
            { type: "bold" },
            { type: "link", attrs: { href: "https://dockit.example/report" } }
          ]
        }]
      }])
    ]));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.numbering).toEqual([
      { noteId: id, kind: "footnote", number: 1 }
    ]);
  });

  it("accepts the maximum note ID and rejects the next byte", () => {
    const exactId = `${NOTE_ID_PREFIX}${"a".repeat(
      NOTE_ID_MAX_LENGTH - NOTE_ID_PREFIX.length
    )}`;
    const exact = createDocument([
      { type: "paragraph", content: [createReference(exactId)] },
      createBody(exactId)
    ]);
    const tooLongId = `${exactId}a`;
    const tooLong = createDocument([
      { type: "paragraph", content: [createReference(tooLongId)] },
      createBody(tooLongId)
    ]);

    expect(validateNoteSemantics(exact).valid).toBe(true);
    expect(codes(validateNoteSemantics(tooLong))).toContain("INVALID_NOTE_ID");
  });

  it("fails closed for malformed document roots and does not number invalid pairs", () => {
    expect(codes(validateNoteSemantics({ type: "paragraph" }))).toContain(
      "INVALID_NOTE_DOCUMENT"
    );
    expect(deriveNoteReferenceNumbers(createDocument([
      { type: "paragraph", content: [createReference(noteId("dangling-number"))] }
    ]))).toEqual([]);
  });

  it("registers both N1a extensions in the main editor extension list", () => {
    const names = editorExtensions.map((extension) => extension.name);
    const id = noteId("main-registry");
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions,
      content: createDocument([
        { type: "paragraph", content: [createReference(id)] },
        createBody(id)
      ])
    });
    editors.push(editor);

    expect(names).toContain("noteReference");
    expect(names).toContain("noteBody");
    expect(editor.getJSON().content[1]).toMatchObject(createBody(id));
  });

  it("keeps an N1b insert valid and one-step undoable with the complete main editor extension list", async () => {
    const id = noteId("main-operation");
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: editorExtensions,
      content: createDocument([{
        type: "paragraph",
        content: [{ type: "text", text: "Alpha" }]
      }])
    });
    editors.push(editor);
    await new Promise((resolve) => setTimeout(resolve, 0));
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3))
    );
    const before = editor.getJSON();
    const originalDispatch = editor.view.dispatch.bind(editor.view);
    let dispatchCount = 0;
    editor.view.dispatch = (transaction) => {
      dispatchCount += 1;
      originalDispatch(transaction);
    };

    const result = executeNoteOperation(editor, {
      type: NOTE_OPERATION_TYPES.INSERT,
      kind: "footnote",
      bodyContent: [{
        type: "paragraph",
        content: [{ type: "text", text: "본문" }]
      }]
    }, { idFactory: () => id });

    expect(result.ok).toBe(true);
    expect(dispatchCount).toBe(1);
    expect(validateNoteSemantics(editor.state.doc).valid).toBe(true);
    expect(undoDepth(editor.state)).toBe(1);
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });
});
