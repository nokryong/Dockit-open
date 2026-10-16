import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import DiagramBlockView from "./DiagramBlockView";

const DiagramBlock = Node.create({
  name: "diagramBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: "flowchart LR\n  A[시작] --> B[끝]",
        parseHTML: (el) => el.getAttribute("data-mermaid-code") ?? "",
        renderHTML: (attrs) => ({ "data-mermaid-code": attrs.code })
      },
      previewSvg: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-preview-svg") || "",
        renderHTML: (attrs) => ({ "data-preview-svg": attrs.previewSvg })
      },
      previewCode: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-preview-code") || "",
        renderHTML: (attrs) => ({ "data-preview-code": attrs.previewCode })
      },
      fontFamily: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mermaid-font") || "",
        renderHTML: (attrs) => attrs.fontFamily ? { "data-mermaid-font": attrs.fontFamily } : {}
      },
      previewFontFamily: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-preview-font") || "",
        renderHTML: (attrs) => attrs.previewFontFamily ? { "data-preview-font": attrs.previewFontFamily } : {}
      },
      width: {
        default: 100,
        parseHTML: (el) => parseFloat(el.getAttribute("data-width")) || 100,
        renderHTML: (attrs) => ({ "data-width": attrs.width })
      },
      height: {
        default: 500,
        parseHTML: (el) => parseFloat(el.getAttribute("data-height")) || 500,
        renderHTML: (attrs) => ({ "data-height": attrs.height })
      },
      textAlign: {
        default: "center",
        parseHTML: (el) => el.getAttribute("data-text-align") || "center",
        renderHTML: (attrs) => ({ "data-text-align": attrs.textAlign })
      },
      objectId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-object-id") || null,
        renderHTML: (attrs) =>
          attrs.objectId ? { "data-object-id": attrs.objectId } : {}
      }
    };
  },

  parseHTML() {
    return [{ tag: "div[data-diagram-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-diagram-block": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramBlockView);
  },

  addCommands() {
    return {
      setDiagramFontFamily: (fontFamily) => ({ state, commands }) => {
        if (state.selection.node?.type.name !== "diagramBlock" || typeof fontFamily !== "string") return false;
        return commands.updateAttributes("diagramBlock", { fontFamily });
      },
      insertDiagramBlock: () => ({ commands }) => {
        return commands.insertContent({ type: "diagramBlock", attrs: {} });
      },
      updateDiagramBlock: (pos, attrs) => ({ state, dispatch }) => {
        const node = state.doc.nodeAt(pos);
        if (!node || node.type.name !== "diagramBlock") return false;
        if (dispatch) {
          dispatch(
            state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              ...attrs
            })
          );
        }
        return true;
      }
    };
  }
});

export default DiagramBlock;
