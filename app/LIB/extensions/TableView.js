// TableView.js (타입 제거 버전)

import { getColStyleDeclaration } from "./colStyle";

export function updateColumns(
  node,
  colgroup,
  table,
  cellMinWidth,
  overrideCol,
  overrideValue
) {
  let totalWidth = 0;
  let fixedWidth = true;
  let nextDOM = colgroup.firstChild;
  const row = node.firstChild;

  if (row !== null) {
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs;

      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth =
          overrideCol === col ? overrideValue : colwidth && colwidth[j];
        const cssWidth = hasWidth ? `${hasWidth}px` : "";

        totalWidth += hasWidth || cellMinWidth;

        if (!hasWidth) {
          fixedWidth = false;
        }

        if (!nextDOM) {
          const colElement = document.createElement("col");
          const [propertyKey, propertyValue] = getColStyleDeclaration(
            cellMinWidth,
            hasWidth
          );
          colElement.style.setProperty(propertyKey, propertyValue);
          colgroup.appendChild(colElement);
        } else {
          if (nextDOM.style.width !== cssWidth) {
            const [propertyKey, propertyValue] = getColStyleDeclaration(
              cellMinWidth,
              hasWidth
            );
            nextDOM.style.setProperty(propertyKey, propertyValue);
          }
          nextDOM = nextDOM.nextSibling;
        }
      }
    }
  }

  while (nextDOM) {
    const after = nextDOM.nextSibling;
    nextDOM.parentNode?.removeChild(nextDOM);
    nextDOM = after;
  }

  const hasUserWidth =
    node.attrs.style &&
    typeof node.attrs.style === "string" &&
    /\bwidth\s*:/i.test(node.attrs.style);

  if (fixedWidth && !hasUserWidth) {
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = "";
  } else {
    table.style.width = "";
    table.style.minWidth = `${totalWidth}px`;
  }
}

export class TableView {
  constructor(node, cellMinWidth, view, getPos) {
    this.node = node;
    this.cellMinWidth = cellMinWidth;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("div");
    this.dom.className = "tableWrapper";
    this.dom.style.position = "relative";
    this.table = this.dom.appendChild(document.createElement("table"));

    // 초기 로드 시 커스텀 스타일 적용 (수정 부분)
    if (node.attrs.style) {
      this.table.style.cssText = node.attrs.style;
    }

    // 헤더/선 색상 초기 적용
    this.applyCustomStyles(node);

    this.colgroup = this.table.appendChild(document.createElement("colgroup"));
    updateColumns(node, this.colgroup, this.table, cellMinWidth);
    this.contentDOM = this.table.appendChild(document.createElement("tbody"));

    // 행 높이 드래그 핸들
    this._rowResizeObserver = new MutationObserver(() => {
      requestAnimationFrame(() => this._updateRowHandles());
    });
    this._rowResizeObserver.observe(this.contentDOM, { childList: true });
    requestAnimationFrame(() => this._updateRowHandles());
  }

  _updateRowHandles() {
    this.dom.querySelectorAll(".row-resize-handle").forEach((el) => el.remove());

    if (!this.view?.editable) return;

    const rows = Array.from(
      this.contentDOM.querySelectorAll("tr:not(.tiptap-table-page-break-row)")
    );
    if (rows.length === 0) return;

    const wrapperRect = this.dom.getBoundingClientRect();

    rows.forEach((tr, rowIdx) => {
      const trRect = tr.getBoundingClientRect();
      const top = trRect.bottom - wrapperRect.top;

      const handle = document.createElement("div");
      handle.className = "row-resize-handle";
      handle.style.cssText = `
        position: absolute;
        left: 0;
        width: 100%;
        height: 6px;
        top: ${top - 3}px;
        cursor: row-resize;
        z-index: 20;
        background: transparent;
      `;

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._startRowResize(e, tr, rowIdx);
      });

      this.dom.appendChild(handle);
    });
  }

  _startRowResize(e, tr, rowIdx) {
    if (!this.view?.editable) return;

    const startY = e.clientY;
    const startHeight = tr.getBoundingClientRect().height;

    const onMouseMove = (e) => {
      const dy = e.clientY - startY;
      const newHeightPx = Math.max(12, startHeight + dy);
      const newHeightMm = newHeightPx * (25.4 / 96);
      this._commitRowHeight(rowIdx, newHeightMm);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      requestAnimationFrame(() => this._updateRowHandles());
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  _commitRowHeight(rowIdx, heightMm) {
    if (!this.view?.editable || !this.view || !this.getPos) return;
    const tablePos = this.getPos();
    if (tablePos == null) return;

    const { state, dispatch } = this.view;
    const tableNode = state.doc.nodeAt(tablePos);
    if (!tableNode) return;

    let pos = tablePos + 1;
    for (let i = 0; i < tableNode.childCount; i++) {
      const child = tableNode.child(i);
      if (i === rowIdx) {
        dispatch(
          state.tr.setNodeMarkup(pos, undefined, {
            ...child.attrs,
            height: Math.round(heightMm * 100) / 100
          })
        );
        return;
      }
      pos += child.nodeSize;
    }
  }

  // 중복 코드를 방지하기 위해 스타일 적용 로직 분리
  applyCustomStyles(node) {
    if (node.attrs.headerColor) {
      this.table.style.setProperty("--header-bg", node.attrs.headerColor);
    }
    if (node.attrs.borderColor) {
      this.table.style.setProperty("--table-border", node.attrs.borderColor);
    }
    if (node.attrs.borderStyle) {
      this.table.style.setProperty("--table-border-style", node.attrs.borderStyle);
    }
    if (node.attrs.borderWidth != null) {
      this.table.style.setProperty("--table-border-width", `${node.attrs.borderWidth}pt`);
    }

    if (node.attrs.backgroundColor) {
      this.table.style.setProperty("--row-bg", node.attrs.backgroundColor);
    }
    if (node.attrs.cellPaddingTop != null) {
      this.table.style.setProperty("--cell-pt", `${node.attrs.cellPaddingTop}px`);
    }
    if (node.attrs.cellPaddingBottom != null) {
      this.table.style.setProperty("--cell-pb", `${node.attrs.cellPaddingBottom}px`);
    }
    if (node.attrs.cellPaddingLeft != null) {
      this.table.style.setProperty("--cell-pl", `${node.attrs.cellPaddingLeft}px`);
    }
    if (node.attrs.cellPaddingRight != null) {
      this.table.style.setProperty("--cell-pr", `${node.attrs.cellPaddingRight}px`);
    }
  }

  update(node) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    // 변경된 색상을 실시간으로 반영
    this.applyCustomStyles(node);

    updateColumns(node, this.colgroup, this.table, this.cellMinWidth);
    requestAnimationFrame(() => this._updateRowHandles());
    return true;
  }

  destroy() {
    this._rowResizeObserver?.disconnect();
  }

  ignoreMutation(mutation) {
    const target = mutation.target;
    const isInsideWrapper = this.dom.contains(target);
    const isInsideContent = this.contentDOM.contains(target);

    if (isInsideWrapper && !isInsideContent) {
      if (
        mutation.type === "attributes" ||
        mutation.type === "childList" ||
        mutation.type === "characterData"
      ) {
        return true;
      }
    }
    return false;
  }
}
