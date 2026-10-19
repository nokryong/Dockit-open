/* @vitest-environment jsdom */

import fs from "node:fs";
import path from "node:path";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import NoteInteraction, {
  NOTE_INSERT_REQUEST_EVENT,
  focusNoteReference,
  getSelectionNoteBodyId,
  installNoteInteraction
} from "../../app/LIB/extensions/NoteInteraction";
import NoteReference from "../../app/LIB/extensions/NoteReference";

const editors = [];
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
);
const noteId = "note-v1-u1-interaction";
const reference = (id = noteId, kind = "footnote") => ({
  type: "noteReference",
  attrs: { noteId: id, kind }
});
const noteBody = (id = noteId, kind = "footnote", text = "본문") => ({
  type: "noteBody",
  attrs: { noteId: id, kind },
  content: [{
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {})
  }]
});
const documentWithNote = (text = "본문", kind = "footnote") => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "A" },
        reference(noteId, kind),
        { type: "text", text: "B" }
      ]
    },
    noteBody(noteId, kind, text)
  ]
});

const createEditor = ({
  content = documentWithNote(),
  editable = true,
  interaction = true
} = {}) => {
  const element = document.body.appendChild(document.createElement("div"));
  const editor = new Editor({
    element,
    editable,
    extensions: [
      Document.extend({ content: "(paragraph | noteBody)+" }),
      Paragraph,
      Text,
      NoteReference,
      NoteBody,
      ...(interaction ? [NoteInteraction] : [])
    ],
    content
  });
  editors.push({ editor, element });
  return editor;
};

const findPosition = (editor, typeName, id = noteId) => {
  let position = null;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.type.name === typeName && node.attrs?.noteId === id) {
      position = nodePosition;
      return false;
    }
    return true;
  });
  return position;
};

afterEach(() => {
  while (editors.length > 0) {
    const { editor, element } = editors.pop();
    if (!editor.isDestroyed) editor.destroy();
    element.remove();
  }
  document.querySelectorAll(".dockit-note-reference-tooltip")
    .forEach((element) => element.remove());
  if (originalScrollIntoView) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView
    );
  } else {
    delete HTMLElement.prototype.scrollIntoView;
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("U1 note interaction", () => {
  it("keeps canonical HTML unchanged and shows a delayed bounded tooltip", async () => {
    vi.useFakeTimers();
    const editor = createEditor({ content: documentWithNote("가".repeat(205)) });
    const marker = editor.view.dom.querySelector(".dockit-note-reference");

    expect(editor.getHTML()).toBe(
      `<p>A<span data-dockit-note-id="${noteId}" data-dockit-note-kind="footnote" data-dockit-note-reference="true"></span>B</p>` +
      `<section data-dockit-note-id="${noteId}" data-dockit-note-kind="footnote" data-dockit-note-body="true"><p>${"가".repeat(205)}</p></section>`
    );
    marker.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(399);
    expect(document.querySelector(".dockit-note-reference-tooltip")).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    const tooltip = document.querySelector(".dockit-note-reference-tooltip");
    const preview = tooltip.querySelector(
      ".dockit-note-reference-tooltip__preview"
    );
    expect(tooltip.querySelector(
      ".dockit-note-reference-tooltip__label"
    ).textContent).toBe("각주 1");
    expect(preview.textContent).toHaveLength(200);
    expect(preview.textContent.endsWith("…")).toBe(true);
    expect(marker.getAttribute("aria-describedby")).toBe(tooltip.id);

    marker.dispatchEvent(new MouseEvent("mouseleave"));
    expect(document.querySelector(".dockit-note-reference-tooltip")).toBeNull();
    expect(marker.hasAttribute("aria-describedby")).toBe(false);
  });

  it.each(["click", "Enter", " "])(
    "moves from a marker to its body with %s and Escape returns after the reference",
    (activation) => {
      const editor = createEditor();
      const marker = editor.view.dom.querySelector(".dockit-note-reference");
      const referencePosition = findPosition(editor, "noteReference");

      if (activation === "click") {
        marker.click();
      } else {
        marker.dispatchEvent(new KeyboardEvent("keydown", {
          bubbles: true,
          key: activation
        }));
      }

      expect(getSelectionNoteBodyId(editor.state.selection)).toBe(noteId);
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape"
      }));
      expect(getSelectionNoteBodyId(editor.state.selection)).toBeNull();
      expect(editor.state.selection.from).toBe(referencePosition + 1);
    }
  );

  it("scrolls in read-only mode without moving the document selection", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    const editor = createEditor({ editable: false });
    const beforeSelection = editor.state.selection.toJSON();
    const marker = editor.view.dom.querySelector(".dockit-note-reference");

    marker.click();

    expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(marker.getAttribute("aria-label")).toBe("각주 1 내용으로 이동");
  });

  it("returns to the first main text position when the reference is missing", () => {
    const editor = createEditor({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Fallback" }] },
          noteBody(noteId)
        ]
      }
    });
    const bodyPosition = findPosition(editor, "noteBody");
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, bodyPosition + 2)
    ));

    expect(focusNoteReference(editor, noteId)).toBe(true);
    expect(getSelectionNoteBodyId(editor.state.selection)).toBeNull();
    expect(editor.state.selection.from).toBe(1);
  });

  it("routes standard shortcuts and blocks nested insertion before the tracked path", () => {
    const editor = createEditor();
    const insertRequests = [];
    editor.view.dom.addEventListener(NOTE_INSERT_REQUEST_EVENT, (event) => {
      insertRequests.push(event.detail);
    });

    expect(editor.commands.keyboardShortcut("Mod-Alt-f")).toBe(true);
    expect(editor.commands.keyboardShortcut("Mod-Alt-d")).toBe(true);
    expect(insertRequests).toEqual([
      { kind: "footnote" },
      { kind: "endnote" }
    ]);

    const bodyPosition = findPosition(editor, "noteBody");
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, bodyPosition + 2)
    ));
    const before = editor.getJSON();
    expect(editor.commands.keyboardShortcut("Mod-Alt-f")).toBe(true);
    expect(editor.commands.keyboardShortcut("Tab")).toBe(true);
    expect(insertRequests).toHaveLength(3);
    expect(insertRequests[2]).toEqual(expect.objectContaining({
      kind: "footnote",
      error: expect.objectContaining({ code: "NOTE_NESTED_INSERT_BLOCKED" })
    }));
    expect(editor.getJSON()).toEqual(before);
  });

  it("routes the HWP Ctrl+N chord to footnote and endnote insertion", () => {
    const editor = createEditor();
    const insertRequests = [];
    editor.view.dom.addEventListener(NOTE_INSERT_REQUEST_EVENT, (event) => {
      insertRequests.push(event.detail);
    });
    const press = (key, options = {}) => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
        ...options
      });
      editor.view.dom.dispatchEvent(event);
      return event;
    };

    const footnotePrefix = press("n", { ctrlKey: true });
    expect(footnotePrefix.defaultPrevented).toBe(true);
    expect(insertRequests).toEqual([]);
    expect(press("n").defaultPrevented).toBe(true);
    expect(insertRequests).toEqual([{ kind: "footnote" }]);

    press("n", { ctrlKey: true });
    expect(press("e").defaultPrevented).toBe(true);
    expect(insertRequests).toEqual([
      { kind: "footnote" },
      { kind: "endnote" }
    ]);

    press("n", { ctrlKey: true });
    expect(press("x").defaultPrevented).toBe(false);
    expect(press("n").defaultPrevented).toBe(false);
    expect(insertRequests).toHaveLength(2);
  });

  it("installs the editing-only shortcut callback and removes it cleanly", () => {
    const editor = createEditor({ interaction: false });
    const insertNote = vi.fn(() => ({ ok: true }));
    const dispose = installNoteInteraction(editor, insertNote);

    expect(editor.commands.keyboardShortcut("Mod-Alt-f")).toBe(true);
    expect(insertNote).toHaveBeenCalledWith("footnote");
    expect(editor.storage.noteInteraction.focusNoteBody).toBeTypeOf("function");

    dispose();
    expect(editor.storage.noteInteraction).toBeUndefined();
  });

  it("decorates an empty body placeholder without serializing it", () => {
    const editor = createEditor({ content: documentWithNote("") });
    const placeholder = editor.view.dom.querySelector(
      ".dockit-note-body-placeholder"
    );

    expect(placeholder?.getAttribute("data-placeholder")).toBe("내용 입력");
    expect(editor.getHTML()).not.toContain("내용 입력");
    expect(editor.getJSON()).toEqual(documentWithNote(""));
  });

  it("keeps the marker visual contract inside the note CSS namespace", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "app/LIB/css/tiptap.css"),
      "utf8"
    );
    const markerRule = css.match(/\.dockit-note-reference \{([\s\S]*?)\n\}/)?.[1];

    expect(markerRule).toContain("color: inherit");
    expect(markerRule).toContain("font-size: 0.75em");
    expect(markerRule).toContain("vertical-align: super");
    expect(markerRule).not.toContain("--accent-color");
  });
});
