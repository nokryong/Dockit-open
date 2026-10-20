import { Table } from "@tiptap/extension-table";
import { mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TableMap, cellAround, CellSelection } from "@tiptap/pm/tables";
import { TableView } from "./TableView.js";
import { boundedTableColumnResize } from "./utils/tableColumnResize";
import {
  getTableCellArrowDirection,
  shouldHandleTableCellArrowEvent
} from "../utils/tableKeyboardNavigationUtils";
import { runTableAutofill, runTableSelectionSum } from "./utils/tableAutofillUtils";
import {
  findTablePos,
  getTableContext,
  getCurrentCellPos,
  isWholeTableSelected,
  isSingleCellSelected,
  createCellCursorSelection,
  createWholeTableSelection,
  createArrowCellSelection,
  isIgnoredShortcutTarget,
  isBlockedCellSelectionInput
} from "./utils/tableSelectionUtils";
import {
  TABLE_KEYBOARD_RESIZE_STEP_PX,
  adjustSelectedColumnWidths,
  adjustSelectedRowHeights,
  equalizeSelectedColumnWidths,
  equalizeSelectedRowHeights
} from "./utils/tableKeyboardResizeUtils";

const CustomTable = Table.extend({
  name: "table",
  priority: 1000,

  addOptions() {
    return { ...this.parent?.(), View: TableView };
  },

  addNodeView() {
    const cellMinWidth = this.options.cellMinWidth;
    return ({ node, editor, getPos }) =>
      new TableView(node, cellMinWidth, editor.view, getPos);
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      headerColor: {
        default: "#dcdddd",
        parseHTML: (element) =>
          element.style.getPropertyValue("--header-bg") || "#dcdddd",
        renderHTML: (attributes) => {
          if (!attributes.headerColor) return {};
          return { style: `--header-bg: ${attributes.headerColor}` };
        },
      },
      borderColor: {
        default: "#006d75",
        parseHTML: (element) =>
          element.style.getPropertyValue("--table-border") || "#006d75",
        renderHTML: (attributes) => {
          if (!attributes.borderColor) return {};
          return { style: `--table-border: ${attributes.borderColor}` };
        },
      },
      borderStyle: {
        default: "solid",
        parseHTML: (element) =>
          element.style.getPropertyValue("--table-border-style") || "solid",
        renderHTML: (attributes) => {
          if (!attributes.borderStyle || attributes.borderStyle === "solid") return {};
          return { style: `--table-border-style: ${attributes.borderStyle}` };
        },
      },
      borderWidth: {
        default: 1,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--table-border-width");
          return val ? parseFloat(val) : 1;
        },
        renderHTML: (attributes) => {
          if (!attributes.borderWidth || attributes.borderWidth === 1) return {};
          return { style: `--table-border-width: ${attributes.borderWidth}pt` };
        },
      },
      objectId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-object-id") || null,
        renderHTML: (attributes) =>
          attributes.objectId ? { "data-object-id": attributes.objectId } : {},
      },
      cellPaddingTop: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pt");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingTop == null) return {};
          return { style: `--cell-pt: ${attributes.cellPaddingTop}px` };
        },
      },
      cellPaddingBottom: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pb");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingBottom == null) return {};
          return { style: `--cell-pb: ${attributes.cellPaddingBottom}px` };
        },
      },
      cellPaddingLeft: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pl");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingLeft == null) return {};
          return { style: `--cell-pl: ${attributes.cellPaddingLeft}px` };
        },
      },
      cellPaddingRight: {
        default: null,
        parseHTML: (element) => {
          const val = element.style.getPropertyValue("--cell-pr");
          return val ? parseFloat(val) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.cellPaddingRight == null) return {};
          return { style: `--cell-pr: ${attributes.cellPaddingRight}px` };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "table",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      ["tbody", 0],
    ];
  },

  addCommands() {
    const cellMinWidth = this.options.cellMinWidth || 25;

    const setAttr = (key, value) => ({ state, tr, dispatch }) => {
      const tablePos = findTablePos(state);
      if (tablePos !== null && dispatch) {
        const node = state.doc.nodeAt(tablePos);
        dispatch(
          tr.setNodeMarkup(tablePos, undefined, {
            ...node.attrs,
            [key]: value,
          })
        );
        return true;
      }
      return false;
    };

    return {
      ...this.parent?.(),
      setHeaderColor: (color) => setAttr("headerColor", color),
      setBorderColor: (color) => setAttr("borderColor", color),
      setBorderStyle: (style) => setAttr("borderStyle", style),
      setBorderWidth: (width) => setAttr("borderWidth", width),
      setCellPaddingTop: (val) => setAttr("cellPaddingTop", val),
      setCellPaddingBottom: (val) => setAttr("cellPaddingBottom", val),
      setCellPaddingLeft: (val) => setAttr("cellPaddingLeft", val),
      setCellPaddingRight: (val) => setAttr("cellPaddingRight", val),

      // 선택된 열(들)의 모든 셀 너비를 일괄 설정 (widthPx: 픽셀 단위)
      setColumnWidth: (widthPx) => ({ state, tr, dispatch }) => {
        const tablePos = findTablePos(state);
        if (tablePos === null) return false;

        const tableNode = state.doc.nodeAt(tablePos);
        if (!tableNode) return false;

        const map = TableMap.get(tableNode);
        const roundedWidth = widthPx ? Math.round(Number(widthPx)) : 0;
        const numWidth =
          roundedWidth > 0
            ? Math.max(cellMinWidth, roundedWidth)
            : 0;
        const { selection } = state;

        // 선택된 열 인덱스 수집
        const cols = new Set();
        if (selection instanceof CellSelection) {
          selection.forEachCell((_, pos) => {
            const relPos = pos - tablePos - 1;
            try {
              const rect = map.findCell(relPos);
              for (let c = rect.left; c < rect.right; c++) cols.add(c);
            } catch {}
          });
        } else {
          const $cell = cellAround(selection.$head);
          if (!$cell) return false;
          const cellRelPos = $cell.pos - tablePos - 1;
          try {
            const rect = map.findCell(cellRelPos);
            cols.add(rect.left);
          } catch {
            return false;
          }
        }

        // 수집된 열의 모든 셀에 colwidth 적용 (중복 제거)
        const visited = new Set();
        for (const col of cols) {
          for (let row = 0; row < map.height; row++) {
            const cellRelP = map.map[row * map.width + col];
            if (visited.has(cellRelP)) continue;
            visited.add(cellRelP);

            const cellAbsPos = tablePos + 1 + cellRelP;
            const cell = state.doc.nodeAt(cellAbsPos);
            if (!cell) continue;

            const cellLeft = map.findCell(cellRelP).left;
            const colOffset = col - cellLeft;
            const colspan = cell.attrs.colspan || 1;
            const oldCw = cell.attrs.colwidth
              ? [...cell.attrs.colwidth]
              : Array(colspan).fill(0);
            while (oldCw.length < colspan) oldCw.push(0);
            oldCw[colOffset] = numWidth;

            tr.setNodeMarkup(cellAbsPos, undefined, {
              ...cell.attrs,
              colwidth: numWidth ? oldCw : null
            });
          }
        }

        if (dispatch) dispatch(tr);
        return true;
      },

      // 선택된 행(들)의 높이 설정 (heightMm: mm 단위)
      setRowHeight: (heightMm) => ({ state, tr, dispatch }) => {
        const { selection } = state;
        const h = heightMm ? Number(heightMm) : null;

        // 선택된 행 위치 수집
        const rowPositions = new Set();
        if (selection instanceof CellSelection) {
          selection.forEachCell((_, pos) => {
            const $pos = state.doc.resolve(pos);
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === "tableRow") {
                rowPositions.add($pos.before(d));
                break;
              }
            }
          });
        } else {
          for (let d = selection.$from.depth; d > 0; d--) {
            if (selection.$from.node(d).type.name === "tableRow") {
              rowPositions.add(selection.$from.before(d));
              break;
            }
          }
        }

        if (rowPositions.size === 0) return false;

        for (const rowPos of rowPositions) {
          const rowNode = state.doc.nodeAt(rowPos);
          if (!rowNode) continue;
          tr.setNodeMarkup(rowPos, undefined, { ...rowNode.attrs, height: h });
        }

        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || [];
    const cellMinWidth = this.options.cellMinWidth || 25;
    const editor = this.editor;
    const tableCellArrowNavigationPlugin = new Plugin({
      key: new PluginKey("tableCellArrowNavigation"),
      props: {
        handleKeyDown(view, event) {
          if (!shouldHandleTableCellArrowEvent(event)) {
            return false;
          }

          if (event.isComposing || view.composing) {
            return false;
          }

          const target = event.target;

          if (isIgnoredShortcutTarget(target)) {
            return false;
          }

          const { state } = view;

          if (!(state.selection instanceof CellSelection)) {
            return false;
          }

          const tableContext = getTableContext(state);

          if (!tableContext) {
            return false;
          }

          const direction = getTableCellArrowDirection(event.key);
          const nextSelection = createArrowCellSelection(
            state,
            tableContext,
            direction,
            event.shiftKey
          );

          event.preventDefault();

          if (nextSelection) {
            view.dispatch(state.tr.setSelection(nextSelection).scrollIntoView());
          }

          return true;
        }
      }
    });

    return [
      tableCellArrowNavigationPlugin,
      boundedTableColumnResize(cellMinWidth),
      ...parentPlugins,
      new Plugin({
        key: new PluginKey("tableSelectionCycle"),
        props: {
          handleKeyDown(view, event) {
            if (event.key !== "F5") {
              return false;
            }

            if (event.isComposing || view.composing) {
              return false;
            }

            const target = event.target;

            if (isIgnoredShortcutTarget(target)) {
              return false;
            }

            const { state } = view;
            const tableContext = getTableContext(state);

            if (!tableContext) {
              return false;
            }

            const { selection } = state;
            const currentCellPos = getCurrentCellPos(state, tableContext.tablePos);

            if (currentCellPos === null) {
              return false;
            }

            let nextSelection = null;

            if (selection instanceof CellSelection) {
              if (isWholeTableSelected(selection, tableContext.tablePos, tableContext.map)) {
                nextSelection = createCellCursorSelection(state.doc, selection.$anchorCell.pos);
              } else if (isSingleCellSelected(selection)) {
                nextSelection = createWholeTableSelection(
                  state.doc,
                  tableContext.tablePos,
                  tableContext.map
                );
              } else {
                nextSelection = createWholeTableSelection(
                  state.doc,
                  tableContext.tablePos,
                  tableContext.map
                );
              }
            } else {
              nextSelection = CellSelection.create(state.doc, currentCellPos);
            }

            if (!nextSelection) {
              return false;
            }

            event.preventDefault();
            view.dispatch(state.tr.setSelection(nextSelection).scrollIntoView());
            return true;
          }
        }
      }),
      new Plugin({
        key: new PluginKey("tableKeyboardResize"),
        props: {
          handleKeyDown(view, event) {
            const isResizeShortcut =
              event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key
              );

            if (!isResizeShortcut) {
              return false;
            }

            if (event.isComposing || view.composing) {
              return false;
            }

            const target = event.target;

            if (isIgnoredShortcutTarget(target)) {
              return false;
            }

            const { state } = view;

            if (!(state.selection instanceof CellSelection)) {
              return false;
            }

            const tableContext = getTableContext(state);

            if (!tableContext) {
              return false;
            }

            let handled = false;

            if (event.key === "ArrowLeft") {
              handled = adjustSelectedColumnWidths(
                view,
                tableContext,
                -TABLE_KEYBOARD_RESIZE_STEP_PX,
                cellMinWidth
              );
            } else if (event.key === "ArrowRight") {
              handled = adjustSelectedColumnWidths(
                view,
                tableContext,
                TABLE_KEYBOARD_RESIZE_STEP_PX,
                cellMinWidth
              );
            } else if (event.key === "ArrowUp") {
              handled = adjustSelectedRowHeights(
                view,
                tableContext,
                -TABLE_KEYBOARD_RESIZE_STEP_PX
              );
            } else if (event.key === "ArrowDown") {
              handled = adjustSelectedRowHeights(
                view,
                tableContext,
                TABLE_KEYBOARD_RESIZE_STEP_PX
              );
            }

            if (!handled) {
              event.preventDefault();
              return true;
            }

            event.preventDefault();
            return true;
          }
        }
      }),
      new Plugin({
        key: new PluginKey("tableKeyboardActions"),
        props: {
          handleKeyDown(view, event) {
            if (event.isComposing || view.composing) {
              return false;
            }

            const target = event.target;

            if (isIgnoredShortcutTarget(target)) {
              return false;
            }

            const { state } = view;
            const tableContext = getTableContext(state);

            if (!tableContext) {
              return false;
            }

            const normalizedKey =
              typeof event.key === "string" && event.key.length === 1
                ? event.key.toLowerCase()
                : event.key;
            const normalizedCode =
              typeof event.code === "string" ? event.code : "";
            const matchesLetterKey = (letter) => {
              const upperLetter = letter.toUpperCase();
              return (
                normalizedKey === letter.toLowerCase() ||
                normalizedCode === `Key${upperLetter}`
              );
            };

            if (
              event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              !event.shiftKey
            ) {
              if (normalizedKey === "Enter") {
                event.preventDefault();
                editor.chain().focus().addRowAfter().run();
                return true;
              }

              if (normalizedKey === "Backspace") {
                event.preventDefault();
                editor.chain().focus().deleteRow().run();
                return true;
              }

              if (matchesLetterKey("a")) {
                event.preventDefault();
                view.dispatch(
                  state.tr
                    .setSelection(
                      createWholeTableSelection(
                        state.doc,
                        tableContext.tablePos,
                        tableContext.map
                      )
                    )
                    .scrollIntoView()
                );
                return true;
              }
            }

            if (
              event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey
            ) {
              if (matchesLetterKey("h")) {
                event.preventDefault();
                editor.chain().focus().toggleHeaderRow().run();
                return true;
              }

              if (matchesLetterKey("r")) {
                event.preventDefault();
                editor.chain().focus().toggleHeaderColumn().run();
                return true;
              }

              if (matchesLetterKey("s")) {
                event.preventDefault();
                editor.chain().focus().toggleHeaderCell().run();
                return true;
              }
            }

            if (!(state.selection instanceof CellSelection)) {
              return false;
            }

            if (
              event.ctrlKey ||
              event.altKey ||
              event.metaKey ||
              event.shiftKey
            ) {
              return false;
            }

            if (matchesLetterKey("h")) {
              event.preventDefault();
              equalizeSelectedRowHeights(view, tableContext);
              return true;
            }

            if (matchesLetterKey("a")) {
              event.preventDefault();
              runTableAutofill(view, tableContext);
              return true;
            }

            if (matchesLetterKey("s")) {
              event.preventDefault();
              runTableSelectionSum(view, tableContext);
              return true;
            }

            if (matchesLetterKey("w")) {
              event.preventDefault();
              equalizeSelectedColumnWidths(view, tableContext, cellMinWidth);
              return true;
            }

            if (matchesLetterKey("m")) {
              event.preventDefault();
              editor.chain().focus().mergeCells().run();
              return true;
            }

            return false;
          }
        }
      }),
      new Plugin({
        key: new PluginKey("tableCellSelectionInputGuard"),
        props: {
          handleTextInput(view) {
            if (!(view.state.selection instanceof CellSelection)) {
              return false;
            }

            return true;
          },
          handleDOMEvents: {
            beforeinput(view, event) {
              if (!(view.state.selection instanceof CellSelection)) {
                return false;
              }

              const target = event.target;

              if (isIgnoredShortcutTarget(target)) {
                return false;
              }

              if (!isBlockedCellSelectionInput(event.inputType)) {
                return false;
              }

              event.preventDefault();
              return true;
            }
          }
        }
      })
    ];
  }
});

export default CustomTable;
