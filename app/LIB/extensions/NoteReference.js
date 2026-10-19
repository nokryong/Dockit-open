import { t as uiText, getLanguage } from "../i18n";
import { Node } from "@tiptap/core";
import { deriveNoteReferenceNumbers } from "../utils/noteSemanticUtils";

let cachedNumberingDocument = null;
let cachedNumberById = new Map();

const TOOLTIP_DELAY_MS = 400;
const NOTE_BODY_SELECTOR = '[data-dockit-note-body="true"]';

const getDerivedNumber = (document, noteId) => {
  if (cachedNumberingDocument !== document) {
    cachedNumberingDocument = document;
    cachedNumberById = new Map(
      deriveNoteReferenceNumbers(document).map(({ noteId: id, number }) => [id, number])
    );
  }
  return cachedNumberById.get(noteId) ?? null;
};

const scrollNoteBodyIntoView = (view, noteId) => {
  const target = [...view.dom.querySelectorAll(NOTE_BODY_SELECTOR)].find(
    (element) => element.getAttribute("data-dockit-note-id") === noteId
  );
  target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return Boolean(target);
};

const NoteReference = Node.create({
  name: "noteReference",

  inline: true,
  group: "inline",
  atom: true,
  selectable: false,

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
    return [{ tag: 'span[data-dockit-note-reference="true"]' }];
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement("span");
      dom.contentEditable = "false";
      dom.className = "dockit-note-reference";
      dom.role = "doc-noteref";
      dom.tabIndex = 0;
      dom.dataset.dockitNoteReference = "true";

      let tooltipCleanup = null;
      let tooltipHovered = false;
      let renderKey = "";

      const hideTooltip = () => {
        tooltipHovered = false;
        tooltipCleanup?.();
        tooltipCleanup = null;
      };

      const showTooltip = () => {
        tooltipHovered = true;
        import("./noteTooltip")
          .then(({ scheduleNoteTooltip }) => {
            if (!tooltipHovered || !dom.isConnected) return;
            tooltipCleanup?.();
            tooltipCleanup = scheduleNoteTooltip({
              dom,
              documentNode: editor.state.doc,
              noteId: node.attrs.noteId,
              kind: node.attrs.kind,
              number: getDerivedNumber(editor.state.doc, node.attrs.noteId),
              delay: TOOLTIP_DELAY_MS
            });
          })
          .catch(() => {});
      };

      const render = (currentNode) => {
        const number = getDerivedNumber(editor.state.doc, currentNode.attrs.noteId);
        const editable = editor.isEditable;
        const nextRenderKey = [
          currentNode.attrs.noteId,
          currentNode.attrs.kind,
          number,
          editable,
          getLanguage()
        ].join("|");
        if (renderKey === nextRenderKey) return;
        renderKey = nextRenderKey;
        const kindLabel = currentNode.attrs.kind === "endnote" ? uiText("미주") : uiText("각주");
        const numberText = number ? String(number) : "?";
        dom.textContent = numberText;
        dom.setAttribute(
          "aria-label",
          uiText("{0} {1} 내용으로 이동", kindLabel, number ?? uiText("번호 없음"))
        );
        dom.classList.toggle("is-read-only", !editable);
        dom.dataset.dockitNoteId = currentNode.attrs.noteId ?? "";
        dom.dataset.dockitNoteKind = currentNode.attrs.kind ?? "";
      };

      const activate = (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideTooltip();
        const focusBody = editor.storage.noteInteraction?.focusNoteBody;
        if (!editor.isEditable || !focusBody?.(editor, node.attrs.noteId)) {
          scrollNoteBodyIntoView(editor.view, node.attrs.noteId);
        }
      };
      const preserveCaretOnPrimaryPress = (event) => {
        if ("button" in event && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
      };
      const handleKeyDown = (event) => {
        if (event.key === "Enter" || event.key === " ") activate(event);
      };
      const refresh = () => render(node);

      dom.addEventListener("pointerdown", preserveCaretOnPrimaryPress);
      dom.addEventListener("mousedown", preserveCaretOnPrimaryPress);
      dom.addEventListener("click", activate);
      dom.addEventListener("keydown", handleKeyDown);
      dom.addEventListener("mouseenter", showTooltip);
      dom.addEventListener("mouseleave", hideTooltip);
      editor.on("transaction", refresh);
      render(node);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          render(node);
          return true;
        },
        stopEvent: (event) =>
          event.target === dom && event.type !== "contextmenu",
        destroy() {
          hideTooltip();
          dom.removeEventListener("pointerdown", preserveCaretOnPrimaryPress);
          dom.removeEventListener("mousedown", preserveCaretOnPrimaryPress);
          dom.removeEventListener("click", activate);
          dom.removeEventListener("keydown", handleKeyDown);
          dom.removeEventListener("mouseenter", showTooltip);
          dom.removeEventListener("mouseleave", hideTooltip);
          editor.off("transaction", refresh);
        }
      };
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        "data-dockit-note-reference": "true"
      }
    ];
  }
});

export default NoteReference;
