/* @vitest-environment jsdom */

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import NoteBody from "../../app/LIB/extensions/NoteBody";
import NoteReference from "../../app/LIB/extensions/NoteReference";
import { stageFootnoteBodiesForMeasurement } from "../../app/LIB/pagination/notes/collectFootnoteDomCandidate";

const editors = [];
const rect = ({ width, height }) => ({
  top: 0,
  left: 0,
  right: width,
  bottom: height,
  width,
  height
});

afterEach(() => {
  while (editors.length > 0) editors.pop().destroy();
  document.body.replaceChildren();
});

describe("N4b1b footnote measurement portal with a live EditorView", () => {
  it("never reparents or mutates the canonical NodeView across a DOMObserver flush", async () => {
    const id = "note-v1-editor-view";
    const host = document.body.appendChild(document.createElement("div"));
    const editor = new Editor({
      element: host,
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
            content: [
              { type: "text", text: "본문" },
              {
                type: "noteReference",
                attrs: { noteId: id, kind: "footnote" }
              }
            ]
          },
          {
            type: "noteBody",
            attrs: { noteId: id, kind: "footnote" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "각주 본문" }]
              }
            ]
          }
        ]
      }
    });
    editors.push(editor);

    let bodyPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "noteBody") bodyPos = pos;
    });
    expect(bodyPos).not.toBeNull();

    const selectionPos = bodyPos + 2;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, selectionPos)
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const root = editor.view.dom;
    const bodyDom = editor.view.nodeDOM(bodyPos);
    expect(bodyDom).toBeInstanceOf(HTMLElement);
    expect(bodyDom.parentNode).toBe(root);
    root.getBoundingClientRect = () => rect({ width: 640, height: 480 });
    bodyDom.getBoundingClientRect = () => rect({ width: 600, height: 80 });
    bodyDom.setAttribute("data-dockit-footnote-projection-canonical", "true");
    bodyDom.style.position = "absolute";
    bodyDom.style.top = "400px";
    bodyDom.style.maxHeight = "24px";
    bodyDom.style.overflow = "clip";
    bodyDom.style.setProperty(
      "--dockit-footnote-canonical-fragment-height",
      "24px"
    );

    const beforeDoc = editor.state.doc;
    const beforeSelection = editor.state.selection.from;
    const beforeClass = bodyDom.getAttribute("class");
    const beforeHtml = bodyDom.innerHTML;
    const beforeChildren = [...root.children];

    const lifecycle = stageFootnoteBodiesForMeasurement({
      root,
      bodies: [bodyDom]
    });

    expect(lifecycle.stagedBodies).toHaveLength(1);
    expect(lifecycle.stagedBodies[0]).not.toBe(bodyDom);
    expect(
      lifecycle.stagedBodies[0].hasAttribute(
        "data-dockit-footnote-projection-canonical"
      )
    ).toBe(false);
    expect(lifecycle.stagedBodies[0].style.position).toBe("");
    expect(lifecycle.stagedBodies[0].style.top).toBe("");
    expect(lifecycle.stagedBodies[0].style.maxHeight).toBe("");
    expect(lifecycle.stagedBodies[0].style.overflow).toBe("");
    expect(bodyDom.parentNode).toBe(root);
    expect([...root.children]).toEqual(beforeChildren);
    expect(bodyDom.getAttribute("class")).toBe(beforeClass);
    expect(bodyDom.innerHTML).toBe(beforeHtml);
    expect(
      bodyDom.getAttribute("data-dockit-footnote-projection-canonical")
    ).toBe("true");
    expect(bodyDom.style.position).toBe("absolute");
    expect(bodyDom.style.maxHeight).toBe("24px");

    lifecycle.restore();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(editor.state.doc.eq(beforeDoc)).toBe(true);
    expect(editor.state.selection.from).toBe(beforeSelection);
    expect(editor.view.nodeDOM(bodyPos)).toBe(bodyDom);
    expect(bodyDom.parentNode).toBe(root);
    expect(document.querySelector(".dockit-footnote-measurement-stage")).toBeNull();
  });
});
