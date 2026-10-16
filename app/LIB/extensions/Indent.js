import { Extension } from "@tiptap/core";
import { pt2px } from "../utils/unitUtils";

// 기본 폰트 크기 (pt) — 12pt = 16px @ 96dpi
const DEFAULT_FONT_SIZE = 12;
const MAX_INDENT_LEVEL = 9;

/**
 * 노드에서 폰트 크기를 추출
 * TextStyle 마크의 fontSize 속성에서 가져옴
 */
function findFontSizeInNode(node) {
  if (!node) return null;

  if (node.isText && node.marks) {
    for (const mark of node.marks) {
      if (mark.type.name === "textStyle" && mark.attrs.fontSize) {
        const size = parseFloat(mark.attrs.fontSize);
        if (!isNaN(size) && size > 0) return size;
      }
    }
  }

  if (!node.content || !node.content.content) return null;

  for (const child of node.content.content) {
    const size = findFontSizeInNode(child);
    if (size) return size;
  }

  return null;
}

function getFontSizeFromNode(node) {
  return findFontSizeInNode(node) || DEFAULT_FONT_SIZE;
}

function getActiveListItemInfo(selection) {
  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const typeName = node.type.name;

    if (typeName === "listItem" || typeName === "taskItem") {
      return {
        node,
        pos: $from.before(depth),
        typeName
      };
    }
  }

  return null;
}

function adjustActiveListItemIndent(editor, deltaLevel) {
  const activeListItem = getActiveListItemInfo(editor.state.selection);

  if (!activeListItem) return false;

  const { node, typeName } = activeListItem;
  const currentIndent = node.attrs.indent || 0;
  const currentLevel = node.attrs.indentLevel || 0;
  const fontSize = getFontSizeFromNode(node);
  const nextIndent = Math.max(0, Math.round(currentIndent + fontSize * deltaLevel));
  const nextLevel = Math.max(0, currentLevel + deltaLevel);

  return editor.commands.updateAttributes(typeName, {
    indent: nextIndent,
    indentLevel: nextLevel
  });
}

const Indent = Extension.create({
  name: "indent",

  addOptions() {
    return {
      types: [
        "paragraph",
        "heading",
        "blockquote",
        "listItem",
        "table",
        "taskItem"
      ]
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
            indent: {
              default: 0,
              renderHTML: (attributes) => {
                if (attributes.indent === 0) {
                  return {};
                }
                const indentPx = pt2px(attributes.indent);
                return {
                  "data-indent": attributes.indent,
                  style: `--tiptap-indent-offset: ${indentPx}px; margin-left: ${indentPx}px`
                };
              },
            parseHTML: (element) => {
              const dataIndent = element.getAttribute("data-indent");
              if (dataIndent) {
                return parseInt(dataIndent, 10);
              }

              const paddingLeft = parseInt(element.style.paddingLeft, 10);
              const marginLeft = parseInt(element.style.marginLeft, 10);
              return paddingLeft || marginLeft || 0;
            }
          },
          indentLevel: {
            default: 0,
            renderHTML: (attributes) => {
              if (attributes.indentLevel === 0) {
                return {};
              }
              return {
                "data-indent-level": attributes.indentLevel
              };
            },
            parseHTML: (element) => {
              const level = element.getAttribute("data-indent-level");
              if (level) return parseInt(level, 10);
              // 기존 data-indent로부터 레벨 역산 (하위 호환)
              const dataIndent = element.getAttribute("data-indent");
              if (dataIndent) {
                const px = parseInt(dataIndent, 10);
                return Math.round(px / DEFAULT_FONT_SIZE);
              }
              return 0;
            }
          }
        }
      }
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const activeListItem = getActiveListItemInfo(this.editor.state.selection);

        if (!activeListItem) return false;

        return this.editor.commands.splitListItem(activeListItem.typeName, {
          indent: activeListItem.node.attrs.indent || 0,
          indentLevel: activeListItem.node.attrs.indentLevel || 0
        });
      },
      Tab: () => {
        const isListContext = !!getActiveListItemInfo(this.editor.state.selection);
        const handled = this.editor.commands.indent();

        return isListContext ? true : handled;
      },
      "Shift-Tab": () => {
        const isListContext = !!getActiveListItemInfo(this.editor.state.selection);
        const handled = this.editor.commands.outdent();

        return isListContext ? true : handled;
      }
    };
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, dispatch, state }) => {
          const activeListItem = getActiveListItemInfo(state.selection);

          if (activeListItem) {
            const handled = this.editor.commands.sinkListItem(activeListItem.typeName);
            if (handled) {
              adjustActiveListItemIndent(this.editor, 1);
              return true;
            }

            const currentLevel = activeListItem.node.attrs.indentLevel || 0;
            if (currentLevel >= MAX_INDENT_LEVEL) {
              return true;
            }

            return adjustActiveListItemIndent(this.editor, 1);
          }

          const { selection } = tr;
          const { from, to } = selection;

          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const $pos = tr.doc.resolve(pos);
              const parentNode = $pos.parent;

              if (node.type.name === "taskItem") {
                return;
              } else if (
                parentNode.type.name === "taskItem" &&
                node.type.name === "paragraph"
              ) {
                // Task List의 paragraph에 indent 적용
              } else if (
                parentNode.type.name === "listItem" &&
                node.type.name === "paragraph"
              ) {
                // listItem 내부 paragraph는 건너뜀 (listItem 자체에서 처리)
                return false;
              }

              const currentIndent = node.attrs.indent || 0;
              const currentLevel = node.attrs.indentLevel || 0;

              if (currentLevel >= MAX_INDENT_LEVEL) return;

              // 현재 폰트 크기만큼 들여쓰기
              const fontSize = getFontSizeFromNode(node);
              const newIndent = currentIndent + fontSize;
              const newLevel = currentLevel + 1;

              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                indent: Math.round(newIndent),
                indentLevel: newLevel
              });

              // listItem은 자식(paragraph)까지 처리하지 않음
              if (node.type.name === "listItem") return false;
            }
          });

          if (tr.docChanged) {
            dispatch?.(tr);
            return true;
          }
          return false;
        },
      outdent:
        () =>
        ({ tr, dispatch, state }) => {
          const activeListItem = getActiveListItemInfo(state.selection);

          if (activeListItem) {
            const handled = this.editor.commands.liftListItem(activeListItem.typeName);
            if (handled) {
              adjustActiveListItemIndent(this.editor, -1);
              return true;
            }

            const currentIndent = activeListItem.node.attrs.indent || 0;
            const currentLevel = activeListItem.node.attrs.indentLevel || 0;

            if (currentLevel <= 0 || currentIndent <= 0) {
              return true;
            }

            return adjustActiveListItemIndent(this.editor, -1);
          }

          const { selection } = tr;
          const { from, to } = selection;

          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const $pos = tr.doc.resolve(pos);
              const parentNode = $pos.parent;

              if (node.type.name === "taskItem") {
                return;
              } else if (
                parentNode.type.name === "taskItem" &&
                node.type.name === "paragraph"
              ) {
                // Task List의 paragraph에 indent 적용
              } else if (
                parentNode.type.name === "listItem" &&
                node.type.name === "paragraph"
              ) {
                // listItem 내부 paragraph는 건너뜀
                return false;
              }

              const currentIndent = node.attrs.indent || 0;
              const currentLevel = node.attrs.indentLevel || 0;

              if (currentLevel <= 0 || currentIndent <= 0) return;

              // 현재 폰트 크기만큼 내어쓰기
              const fontSize = getFontSizeFromNode(node);
              const newIndent = Math.max(0, currentIndent - fontSize);
              const newLevel = Math.max(0, currentLevel - 1);

              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                indent: Math.round(newIndent),
                indentLevel: newLevel
              });

              // listItem은 자식(paragraph)까지 처리하지 않음
              if (node.type.name === "listItem") return false;
            }
          });

          if (tr.docChanged) {
            dispatch?.(tr);
            return true;
          }
          return false;
        }
    };
  }
});

export default Indent;
