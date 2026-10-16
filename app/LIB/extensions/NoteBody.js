import { Node } from "@tiptap/core";
import { deriveNoteReferenceNumbers } from "../utils/noteSemanticUtils";

let cachedNumberingDocument = null;
let cachedNumberingById = new Map();
let cachedFirstEndnoteId = null;

const getNoteBodyPresentation = (documentNode, noteId) => {
  if (cachedNumberingDocument !== documentNode) {
    cachedNumberingDocument = documentNode;
    const numbering = deriveNoteReferenceNumbers(documentNode);
    cachedNumberingById = new Map(
      numbering.map((entry) => [entry.noteId, entry])
    );
    cachedFirstEndnoteId = numbering.find(
      ({ kind }) => kind === "endnote"
    )?.noteId || null;
  }
  return {
    currentNumber: cachedNumberingById.get(noteId) || null,
    firstEndnoteId: cachedFirstEndnoteId
  };
};

const NoteBody = Node.create({
  name: "noteBody",

  group: "noteBody",
  content: "paragraph+",
  isolating: true,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-dockit-note-id") || null,
        renderHTML: (attributes) => ({
          "data-dockit-note-id": attributes.noteId ?? ""
        })
      },
      kind: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-dockit-note-kind") || null,
        renderHTML: (attributes) => ({
          "data-dockit-note-kind": attributes.kind ?? ""
        })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-dockit-note-body="true"]' }];
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement("section");
      dom.className = "dockit-note-body";
      dom.setAttribute("data-dockit-note-body", "true");

      const endnoteHeading = document.createElement("div");
      endnoteHeading.contentEditable = "false";
      endnoteHeading.className = "dockit-endnote-section-heading";
      endnoteHeading.setAttribute("aria-hidden", "true");
      const endnoteTitle = document.createElement("div");
      endnoteTitle.className = "dockit-endnote-section-title";
      endnoteTitle.textContent = "미주";
      endnoteHeading.appendChild(endnoteTitle);

      const row = document.createElement("div");
      row.className = "dockit-note-body-row";
      const numberLabel = document.createElement("span");
      numberLabel.contentEditable = "false";
      numberLabel.className = "dockit-note-body-number";
      numberLabel.setAttribute("data-dockit-note-number", "true");
      const contentDOM = document.createElement("div");
      contentDOM.className = "dockit-note-body-content";
      row.append(numberLabel, contentDOM);
      dom.appendChild(row);

      const setAttributeIfChanged = (element, name, value) => {
        if (element.getAttribute(name) !== value) {
          element.setAttribute(name, value);
        }
      };

      const render = (currentNode) => {
        const kind = currentNode.attrs.kind;
        const kindLabel = kind === "endnote" ? "미주" : "각주";
        const { currentNumber, firstEndnoteId } = getNoteBodyPresentation(
          editor.state.doc,
          currentNode.attrs.noteId
        );
        const showEndnoteHeading =
          kind === "endnote" && firstEndnoteId === currentNode.attrs.noteId;

        setAttributeIfChanged(
          dom,
          "data-dockit-note-id",
          currentNode.attrs.noteId ?? ""
        );
        setAttributeIfChanged(
          dom,
          "data-dockit-note-kind",
          kind ?? ""
        );
        setAttributeIfChanged(
          dom,
          "role",
          kind === "endnote" ? "doc-endnote" : "doc-footnote"
        );
        setAttributeIfChanged(dom, "aria-label", `${kindLabel} 본문`);
        dom.classList.toggle("dockit-note-body--endnote", kind === "endnote");
        dom.classList.toggle("dockit-note-body--footnote", kind === "footnote");

        if (showEndnoteHeading && endnoteHeading.parentNode !== dom) {
          dom.insertBefore(endnoteHeading, row);
        } else if (!showEndnoteHeading && endnoteHeading.parentNode === dom) {
          endnoteHeading.remove();
        }

        const number = currentNumber?.number;
        const label = Number.isInteger(number) ? String(number) : "";
        if (numberLabel.textContent !== label) numberLabel.textContent = label;
        setAttributeIfChanged(
          numberLabel,
          "aria-label",
          label ? `${kindLabel} ${label} 참조로 이동` : `${kindLabel} 참조로 이동`
        );
      };
      const refresh = () => render(node);

      editor.on("transaction", refresh);
      editor.on("update", refresh);
      render(node);
      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          render(node);
          return true;
        },
        ignoreMutation(mutation) {
          return mutation.type === "attributes" &&
            mutation.target === dom &&
            (
              mutation.attributeName === "style" ||
              mutation.attributeName ===
                "data-dockit-footnote-projection-canonical"
            );
        },
        destroy() {
          editor.off("transaction", refresh);
          editor.off("update", refresh);
        }
      };
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      {
        ...HTMLAttributes,
        "data-dockit-note-body": "true"
      },
      0
    ];
  }
});

export default NoteBody;
