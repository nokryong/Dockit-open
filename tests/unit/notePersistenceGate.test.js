/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import {
  captureNotePersistenceSnapshot,
  NOTE_PERSISTENCE_ERROR_CODES,
  parseNotePersistenceHtml,
  restoreValidatedNotePersistenceHtml
} from "../../app/LIB/utils/notePersistenceGate";

const editors = [];
const noteId = "note-v1-persistence-roundtrip";
const extensions = [
  Document.extend({ content: "(paragraph | noteBody)+" }),
  Paragraph,
  Text,
  NoteReference,
  NoteBody
];

const createEditor = (content = "<p>legacy</p>") => {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions,
    content
  });
  editors.push(editor);
  return editor;
};

afterEach(() => {
  while (editors.length > 0) editors.pop().destroy();
});

describe("N1c note persistence gate", () => {
  it("round-trips a valid note and accepts legacy note-free HTML", () => {
    const validHtml =
      `<p>text<span data-dockit-note-reference="true" data-dockit-note-id="${noteId}" data-dockit-note-kind="footnote"></span></p>` +
      `<section data-dockit-note-body="true" data-dockit-note-id="${noteId}" data-dockit-note-kind="footnote"><p>body</p></section>`;
    const source = createEditor(validHtml);
    const snapshot = captureNotePersistenceSnapshot(source);
    const reopened = createEditor();

    expect(snapshot.ok).toBe(true);
    expect(parseNotePersistenceHtml(reopened, snapshot.html).ok).toBe(true);
    expect(restoreValidatedNotePersistenceHtml(reopened, snapshot.html).ok).toBe(true);
    expect(reopened.getJSON()).toEqual(source.getJSON());
    expect(captureNotePersistenceSnapshot(createEditor("<p>legacy</p>")).ok).toBe(true);
  });

  it("rejects invalid save candidates before every covered persistence boundary writes", () => {
    const invalidHtml =
      '<p>text<span data-dockit-note-reference="true" data-dockit-note-id="note-v1-dangling" data-dockit-note-kind="footnote"></span></p>';
    const editor = createEditor(invalidHtml);
    const writes = { cloud: 0, autosave: 0, draft: 0, dkt: 0, durable: 0 };
    const snapshot = captureNotePersistenceSnapshot(editor);

    const persist = (key) => {
      if (!snapshot.ok) return;
      writes[key] += 1;
      writes.durable += 1;
    };

    persist("cloud");
    persist("autosave");
    persist("draft");
    persist("dkt");

    expect(snapshot).toMatchObject({
      ok: false,
      error: { code: NOTE_PERSISTENCE_ERROR_CODES.SEMANTIC_INVALID }
    });
    expect(writes).toEqual({ cloud: 0, autosave: 0, draft: 0, dkt: 0, durable: 0 });
  });

  it("fails closed on invalid reopen without replacing the current valid document", () => {
    const editor = createEditor("<p>keep this valid document</p>");
    const before = editor.getJSON();
    const invalidHtml =
      '<p>x<span data-dockit-note-reference="true" data-dockit-note-id="bad id" data-dockit-note-kind="footnote"></span></p>' +
      '<section data-dockit-note-body="true" data-dockit-note-id="bad id" data-dockit-note-kind="footnote"><p>body</p></section>';

    const result = restoreValidatedNotePersistenceHtml(editor, invalidHtml);

    expect(result).toMatchObject({
      ok: false,
      error: { code: NOTE_PERSISTENCE_ERROR_CODES.SEMANTIC_INVALID }
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("rolls back when setContent mutates the document but reports failure", () => {
    const editor = createEditor("<p>keep this valid document</p>");
    const before = editor.getJSON();
    const commandsGetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(editor),
      "commands"
    ).get;
    let calls = 0;
    Object.defineProperty(editor, "commands", {
      configurable: true,
      value: {
        setContent: (content, emitUpdate) => {
          calls += 1;
          const applied = commandsGetter.call(editor).setContent(content, emitUpdate);
          return calls === 1 ? false : applied;
        }
      }
    });

    const result = restoreValidatedNotePersistenceHtml(editor, "<p>candidate</p>");

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: NOTE_PERSISTENCE_ERROR_CODES.SET_CONTENT_FAILED,
        recoveryRequired: false,
        rolledBack: true
      }
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("rejects uppercase note markup without an editor while preserving note-free legacy HTML", () => {
    const uppercaseNoteHtml =
      '<p><span DATA-DOCKIT-NOTE-REFERENCE="true"></span></p>';

    expect(
      parseNotePersistenceHtml(null, uppercaseNoteHtml, {
        allowLegacyWithoutEditor: true
      })
    ).toMatchObject({
      ok: false,
      error: { code: NOTE_PERSISTENCE_ERROR_CODES.INVALID_EDITOR }
    });
    expect(
      parseNotePersistenceHtml(null, "<p>legacy without notes</p>", {
        allowLegacyWithoutEditor: true
      })
    ).toMatchObject({ ok: true, legacyWithoutEditor: true });
  });

  it("returns semantic rejection diagnostics without document values", () => {
    const result = captureNotePersistenceSnapshot(
      createEditor(
        '<p>x<span data-dockit-note-reference="true" data-dockit-note-id="private-note-id" data-dockit-note-kind="footnote"></span></p>'
      )
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: NOTE_PERSISTENCE_ERROR_CODES.SEMANTIC_INVALID,
        semanticCodes: expect.arrayContaining(["DANGLING_NOTE_REFERENCE"])
      }
    });
    expect(JSON.stringify(result.error)).not.toContain("private-note-id");
  });

  it("does not accept a snapshot whose synchronous HTML read changed editor state", () => {
    const editor = createEditor("<p>before</p>");
    const originalGetHtml = editor.getHTML.bind(editor);
    editor.getHTML = () => {
      editor.commands.setContent("<p>after</p>", false);
      return originalGetHtml();
    };

    expect(captureNotePersistenceSnapshot(editor)).toMatchObject({
      ok: false,
      error: { code: NOTE_PERSISTENCE_ERROR_CODES.STALE_SNAPSHOT }
    });
  });
});
