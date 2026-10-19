/* @vitest-environment jsdom */
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import { buildFootnoteScreenProjection } from "../../app/LIB/pagination/render/buildFootnoteScreenProjection";
import {
  mountCanonicalFootnoteBody,
  restoreCanonicalFootnoteBodies
} from "../../app/LIB/pagination/render/mountFootnoteProjectionClone";

const rect = ({ left, top, width, height }) => ({
  left, top, width, height, right: left + width, bottom: top + height
});

const editors = [];

afterEach(() => {
  while (editors.length > 0) editors.pop().destroy();
  document.body.replaceChildren();
});

describe("U3 canonical footnote screen projection", () => {
  it("marks only each note's first fragment as canonical", () => {
    const root = document.createElement("div");
    root.innerHTML = '<section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="n1"><p>long</p></section>';
    const body = root.querySelector("section");
    Object.defineProperty(body, "offsetWidth", { value: 200 });
    const projection = buildFootnoteScreenProjection({
      view: { dom: root },
      candidate: { status: "ok", footnotes: [{ body: {
        noteId: "n1", fragments: [
          { fragmentIndex: 0, measuredHeight: 10 },
          { fragmentIndex: 1, measuredHeight: 10 }
        ]
      } }] },
      footnoteLayout: { segments: [
        { noteId: "n1", pageNumber: 1, segmentIndex: 0, fragmentStartIndex: 0, fragmentEndIndex: 1 },
        { noteId: "n1", pageNumber: 2, segmentIndex: 1, fragmentStartIndex: 1, fragmentEndIndex: 2, continuationFromPreviousLabel: "각주 계속" }
      ] }
    });

    expect(projection.segments.map((segment) => segment.canonical)).toEqual([true, false]);
    expect(projection.segments[0].clone).toBeUndefined();
    expect(projection.segments[1].clone).toBeInstanceOf(HTMLElement);
  });

  it("positions the canonical NodeView in the first slot and restores its legacy DOM style", () => {
    const editor = document.body.appendChild(document.createElement("div"));
    editor.className = "ProseMirror";
    const body = document.createElement("section");
    body.setAttribute("data-dockit-note-body", "true");
    body.setAttribute("data-dockit-note-kind", "footnote");
    body.setAttribute("data-dockit-note-id", "n1");
    editor.appendChild(body);
    const slot = document.body.appendChild(document.createElement("div"));
    editor.getBoundingClientRect = () => rect({ left: 10, top: 20, width: 500, height: 300 });
    slot.getBoundingClientRect = () => rect({ left: 30, top: 70, width: 200, height: 40 });

    const restore = mountCanonicalFootnoteBody(
      slot,
      { noteId: "n1", height: 40 },
      { editorRoot: editor }
    );
    expect(body.parentElement).toBe(editor);
    expect(body.getAttribute("data-dockit-footnote-projection-canonical")).toBe("true");
    expect(body.style.left).toBe("20px");
    expect(body.style.top).toBe("50px");
    expect(body.style.width).toBe("200px");
    expect(body.style.getPropertyValue(
      "--dockit-footnote-canonical-fragment-height"
    )).toBe("40px");

    restore();
    expect(body.hasAttribute("data-dockit-footnote-projection-canonical")).toBe(false);
    expect(body.hasAttribute("style")).toBe(false);
  });

  it("converts a zoomed projection slot back to the editor's CSS coordinate space", () => {
    const editor = document.body.appendChild(document.createElement("div"));
    editor.className = "ProseMirror";
    const body = document.createElement("section");
    body.setAttribute("data-dockit-note-body", "true");
    body.setAttribute("data-dockit-note-kind", "footnote");
    body.setAttribute("data-dockit-note-id", "n1");
    editor.appendChild(body);
    const slot = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(editor, "offsetWidth", { value: 500 });
    Object.defineProperty(editor, "offsetHeight", { value: 300 });
    editor.getBoundingClientRect = () => rect({
      left: 10,
      top: 20,
      width: 575,
      height: 345
    });
    slot.getBoundingClientRect = () => rect({
      left: 67.5,
      top: 135,
      width: 230,
      height: 46
    });

    mountCanonicalFootnoteBody(
      slot,
      { noteId: "n1", height: 40 },
      { editorRoot: editor }
    );

    expect(Number.parseFloat(body.style.left)).toBeCloseTo(50, 6);
    expect(Number.parseFloat(body.style.top)).toBeCloseTo(100, 6);
    expect(Number.parseFloat(body.style.width)).toBeCloseTo(200, 6);
  });

  it("keeps the live NodeView, selection, and canonical HTML unchanged", async () => {
    const noteId = "note-v1-u3-canonical-html";
    const container = document.body.appendChild(document.createElement("div"));
    container.className = "tiptap-container";
    const editorHost = container.appendChild(document.createElement("div"));
    const editor = new Editor({
      element: editorHost,
      extensions: [
        Document.extend({ content: "(paragraph | noteBody)+" }),
        Paragraph,
        Text,
        NoteReference,
        NoteBody
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{
              type: "noteReference",
              attrs: { noteId, kind: "footnote" }
            }]
          },
          {
            type: "noteBody",
            attrs: { noteId, kind: "footnote" },
            content: [{
              type: "paragraph",
              content: [{ type: "text", text: "canonical" }]
            }]
          }
        ]
      }
    });
    editors.push(editor);

    let bodyPosition = null;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === "noteBody") bodyPosition = position;
    });
    editor.view.dispatch(editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, bodyPosition + 2)
    ));
    const selectionBefore = editor.state.selection.from;
    const htmlBefore = editor.getHTML();
    const body = editor.view.nodeDOM(bodyPosition);
    const slot = container.appendChild(document.createElement("div"));
    editor.view.dom.getBoundingClientRect = () => rect({
      left: 10,
      top: 20,
      width: 500,
      height: 300
    });
    slot.getBoundingClientRect = () => rect({
      left: 30,
      top: 70,
      width: 200,
      height: 40
    });

    mountCanonicalFootnoteBody(
      slot,
      { noteId, height: 40 },
      { editorRoot: editor.view.dom }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(body.parentElement).toBe(editor.view.dom);
    expect(editor.view.nodeDOM(bodyPosition)).toBe(body);
    expect(body.getAttribute(
      "data-dockit-footnote-projection-canonical"
    )).toBe("true");
    expect(editor.state.selection.from).toBe(selectionBefore);
    expect(editor.getHTML()).toBe(htmlBefore);
    expect(editor.getHTML()).not.toContain(
      "data-dockit-footnote-projection-canonical"
    );

    restoreCanonicalFootnoteBodies(editor.view.dom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(body.hasAttribute(
      "data-dockit-footnote-projection-canonical"
    )).toBe(false);
    expect(editor.state.selection.from).toBe(selectionBefore);
    expect(editor.getHTML()).toBe(htmlBefore);
  });
});
