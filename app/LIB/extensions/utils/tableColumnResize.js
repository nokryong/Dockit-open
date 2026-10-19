import { Plugin, PluginKey } from "@tiptap/pm/state";
import { columnResizingPluginKey, TableMap, updateColumnsOnResize } from "@tiptap/pm/tables";

const number = value => parseFloat(value) || 0;

// 에디터 확대·축소와 상관없이 문서 픽셀 기준으로 측정
export function getTableResizeGeometry(view, tablePos) {
  const wrapper = view.nodeDOM(tablePos);
  const table = wrapper?.nodeName === "TABLE" ? wrapper : wrapper?.querySelector("table");
  if (!table) return null;
  const tableRect = table.getBoundingClientRect();
  const scale = tableRect.width / table.offsetWidth;
  if (!scale) return null;
  let right = Infinity;
  // 부모 칸·들여쓰기와 문서 자체 오른쪽 여백까지 포함
  for (let parent = table.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    right = Math.min(right, parent.getBoundingClientRect().right -
      (number(style.borderRightWidth) + number(style.paddingRight)) * scale);
    if (parent === view.dom) break;
  }
  const widths = Array.from(table.querySelector("colgroup").children,
    col => col.getBoundingClientRect().width / scale);
  return { table, scale, widths, remainingWidth: (right - tableRect.right) / scale };
}

function columnGeometry(view, cellPos) {
  const $cell = view.state.doc.resolve(cellPos);
  const node = $cell.node(-1);
  const map = TableMap.get(node);
  const start = $cell.start(-1);
  const column = map.colCount(cellPos - start) + $cell.nodeAfter.attrs.colspan - 1;
  const geometry = getTableResizeGeometry(view, start - 1);
  if (!geometry) return null;
  const renderedWidth = geometry.widths[column];
  return { ...geometry, node, map, start, column, renderedWidth,
    maxWidth: renderedWidth + geometry.remainingWidth };
}

function commitWidth(view, cellPos, width) {
  const { node, map, start, column } = columnGeometry(view, cellPos);
  const tr = view.state.tr;
  const visited = new Set();
  for (let row = 0; row < map.height; row++) {
    const pos = map.map[row * map.width + column];
    if (visited.has(pos)) continue;
    visited.add(pos);
    const attrs = node.nodeAt(pos).attrs;
    const index = column - map.colCount(pos);
    const colwidth = attrs.colwidth ? [...attrs.colwidth] : Array(attrs.colspan).fill(0);
    if (colwidth[index] === width) continue;
    colwidth[index] = width;
    tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth });
  }
  if (tr.docChanged) view.dispatch(tr);
}

export function boundedTableColumnResize(cellMinWidth) {
  let cleanup;
  return new Plugin({
    key: new PluginKey("boundedTableColumnResize"),
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const state = columnResizingPluginKey.getState(view.state);
          if (!view.editable || event.button !== 0 || !state || state.activeHandle < 0 || state.dragging) return false;
          const initial = columnGeometry(view, state.activeHandle);
          if (!initial) return false;
          const cell = view.state.doc.nodeAt(state.activeHandle);
          const startWidth = cell.attrs.colwidth?.at(-1) || initial.renderedWidth;
          const startX = event.clientX;
          const win = view.dom.ownerDocument.defaultView;
          const widthAt = event => {
            const current = columnResizingPluginKey.getState(view.state);
            const geometry = current?.activeHandle >= 0 && columnGeometry(view, current.activeHandle);
            if (!geometry) return null;
            const requested = startWidth + (event.clientX - startX) / geometry.scale;
            const width = Math.max(cellMinWidth, Math.min(requested, geometry.maxWidth));
            return { geometry, width };
          };
          const move = event => {
            if (!event.buttons) return finish(event);
            const next = widthAt(event);
            if (next) updateColumnsOnResize(next.geometry.node,
              next.geometry.table.querySelector("colgroup"), next.geometry.table,
              cellMinWidth, next.geometry.column, next.width);
          };
          const finish = event => {
            cleanup();
            const current = columnResizingPluginKey.getState(view.state);
            if (!current?.dragging) return;
            const next = widthAt(event);
            if (next) commitWidth(view, current.activeHandle, next.width);
            view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, { setDragging: null }));
          };
          cleanup = () => {
            win.removeEventListener("mousemove", move);
            win.removeEventListener("mouseup", finish);
          };
          view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, {
            setDragging: { startX, startWidth }
          }));
          win.addEventListener("mousemove", move);
          win.addEventListener("mouseup", finish);
          event.preventDefault();
          return true;
        }
      }
    },
    view: () => ({ destroy: () => cleanup?.() })
  });
}
