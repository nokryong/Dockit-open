import { Extension } from "@tiptap/core";

const BLOCK_TYPES = ["paragraph", "heading"];
const TABLE_TYPES = ["table"];

const parseBooleanDataAttribute = (element, attributeName) => {
  const value = element.getAttribute(attributeName);

  if (value === null) {
    return null;
  }

  return value === "true";
};

const renderBooleanDataAttribute = (value, attributeName) => {
  if (value === null || value === undefined) {
    return {};
  }

  return {
    [attributeName]: String(value)
  };
};

const parseNumberDataAttribute = (element, attributeName) => {
  const value = element.getAttribute(attributeName);

  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const renderNumberDataAttribute = (value, attributeName) => {
  if (value === null || value === undefined) {
    return {};
  }

  return {
    [attributeName]: String(value)
  };
};

const updateSelectedBlockNodes = (state, tr, typeNames, nextAttrs) => {
  const { from, to } = state.selection;
  let updated = false;

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!typeNames.includes(node.type.name)) {
      return;
    }

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...nextAttrs
    });
    updated = true;
  });

  return updated;
};

const findParentNodeOfType = (selection, typeNames) => {
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);

    if (typeNames.includes(node.type.name)) {
      return {
        node,
        pos: selection.$from.before(depth)
      };
    }
  }

  return null;
};

export const PaginationSemanticsExtension = Extension.create({
  name: "paginationSemantics",

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          keepWithNext: {
            default: null,
            parseHTML: (element) =>
              parseBooleanDataAttribute(element, "data-keep-with-next"),
            renderHTML: (attributes) =>
              renderBooleanDataAttribute(
                attributes.keepWithNext,
                "data-keep-with-next"
              )
          },
          keepLinesTogether: {
            default: null,
            parseHTML: (element) =>
              parseBooleanDataAttribute(element, "data-keep-lines-together"),
            renderHTML: (attributes) =>
              renderBooleanDataAttribute(
                attributes.keepLinesTogether,
                "data-keep-lines-together"
              )
          },
          pageBreakBefore: {
            default: null,
            parseHTML: (element) =>
              parseBooleanDataAttribute(element, "data-page-break-before"),
            renderHTML: (attributes) =>
              renderBooleanDataAttribute(
                attributes.pageBreakBefore,
                "data-page-break-before"
              )
          },
          widows: {
            default: null,
            parseHTML: (element) =>
              parseNumberDataAttribute(element, "data-widows"),
            renderHTML: (attributes) =>
              renderNumberDataAttribute(attributes.widows, "data-widows")
          },
          orphans: {
            default: null,
            parseHTML: (element) =>
              parseNumberDataAttribute(element, "data-orphans"),
            renderHTML: (attributes) =>
              renderNumberDataAttribute(attributes.orphans, "data-orphans")
          }
        }
      },
      {
        types: TABLE_TYPES,
        attributes: {
          headerRowRepeat: {
            default: null,
            parseHTML: (element) =>
              parseBooleanDataAttribute(element, "data-header-row-repeat"),
            renderHTML: (attributes) =>
              renderBooleanDataAttribute(
                attributes.headerRowRepeat,
                "data-header-row-repeat"
              )
          },
          allowRowSplit: {
            default: null,
            parseHTML: (element) =>
              parseBooleanDataAttribute(element, "data-allow-row-split"),
            renderHTML: (attributes) =>
              renderBooleanDataAttribute(
                attributes.allowRowSplit,
                "data-allow-row-split"
              )
          }
        }
      }
    ];
  },

  addCommands() {
    return {
      setBlockPaginationHints:
        (nextAttrs = {}) =>
        ({ state, dispatch }) => {
          const tr = state.tr;
          const updated = updateSelectedBlockNodes(
            state,
            tr,
            BLOCK_TYPES,
            nextAttrs
          );

          if (updated && dispatch) {
            dispatch(tr);
          }

          return updated;
        },

      setTablePaginationHints:
        (nextAttrs = {}) =>
        ({ state, dispatch }) => {
          const tableNode = findParentNodeOfType(state.selection, TABLE_TYPES);

          if (!tableNode) {
            return false;
          }

          if (dispatch) {
            dispatch(
              state.tr.setNodeMarkup(tableNode.pos, undefined, {
                ...tableNode.node.attrs,
                ...nextAttrs
              })
            );
          }

          return true;
        },

      setSectionBreakType:
        (sectionBreakType) =>
        ({ state, dispatch }) => {
          if (!dispatch) {
            return true;
          }

          dispatch(
            state.tr.setNodeMarkup(0, undefined, {
              ...state.doc.attrs,
              sectionBreakType
            })
          );

          return true;
        }
    };
  }
});
