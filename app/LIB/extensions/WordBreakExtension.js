import { Extension } from "@tiptap/core";

export const WordBreakExtension = Extension.create({
  name: "wordBreak",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "listItem", "tableCell", "tableHeader"],
        attributes: {
          wordBreak: {
            default: null,
            parseHTML: (element) => {
              return element.style.wordBreak || null;
            },
            renderHTML: (attributes) => {
              if (!attributes.wordBreak) return {};
              return {
                style: `word-break: ${attributes.wordBreak};`
              };
            }
          }
        }
      }
    ];
  },

  addCommands() {
    return {
      setWordBreak:
        (wordBreak) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state;

          if (dispatch) {
            doc.descendants((node, pos) => {
              if (
                node.type.name === "paragraph" ||
                node.type.name === "heading" ||
                node.type.name === "listItem" ||
                node.type.name === "tableCell" ||
                node.type.name === "tableHeader"
              ) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  wordBreak
                });
              }
            });
          }

          return true;
        }
    };
  }
});
