import { useEffect } from "react";
import { CellSelection } from "@tiptap/pm/tables";
import { getEditorViewSafely } from "@/app/LIB/utils/editorViewUtils";

export default function useWriteHeaderSelection(
  editor,
  fontSizeInputRef,
  savedSelectionRef,
  savedCellSelectionRef
) {
  // Input의 실제 input 요소에 포커스 이벤트 리스너 추가
  useEffect(() => {
    if (!fontSizeInputRef.current) return;

    // Input 컴포넌트 내부의 실제 input 요소 찾기
    const findInputElement = (element) => {
      if (!element) return null;
      if (element.tagName === "INPUT") return element;
      return element.querySelector("input");
    };

    const inputElement = findInputElement(fontSizeInputRef.current);
    if (!inputElement) return;

    // 포커스 이벤트 리스너 추가
    const handleFocus = () => {
      // Input에 포커스가 가기 전에 에디터 선택 상태 저장
      if (editor) {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          savedSelectionRef.current = { from, to };
        }
      }
    };

    // mousedown 이벤트로도 처리 (포커스보다 먼저 실행)
    const handleMouseDown = () => {
      if (editor) {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          savedSelectionRef.current = { from, to };
        }
        // CellSelection도 저장
        if (editor.state.selection instanceof CellSelection) {
          savedCellSelectionRef.current = editor.state.selection;
        }
      }
    };

    inputElement.addEventListener("mousedown", handleMouseDown, true);
    inputElement.addEventListener("focus", handleFocus, true);

    return () => {
      inputElement.removeEventListener("mousedown", handleMouseDown, true);
      inputElement.removeEventListener("focus", handleFocus, true);
    };
  }, [editor, fontSizeInputRef, savedSelectionRef, savedCellSelectionRef]);

  // CellSelection이 활성화된 경우 현재 또는 저장된 선택 영역에 textStyle mark를 적용
  const applyTextStyleToSelection = (attrs) => {
    const editorView = getEditorViewSafely(editor);

    if (!editor || !editorView) return false;

    const { state } = editor;
    const { schema } = state;
    const markType = schema.marks.textStyle;
    if (!markType) return false;

    // 현재 선택이 CellSelection이거나 저장된 CellSelection이 있는 경우 처리
    const cellSel =
      state.selection instanceof CellSelection
        ? state.selection
        : savedCellSelectionRef.current;

    if (!cellSel) return false;

    const tr = state.tr;

    cellSel.forEachCell((cellNode, cellPos) => {
      const from = cellPos + 1;
      const to = cellPos + cellNode.nodeSize - 1;

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return;

        const nodeFrom = Math.max(pos, from);
        const nodeTo = Math.min(pos + node.nodeSize, to);

        // 기존 textStyle mark의 속성을 보존하면서 새 속성 병합
        const existingMark = node.marks.find((m) => m.type === markType);
        const existingAttrs = existingMark ? { ...existingMark.attrs } : {};
        const newMark = markType.create({ ...existingAttrs, ...attrs });

        tr.addMark(nodeFrom, nodeTo, newMark);
      });
    });

    editorView.dispatch(tr);
    savedCellSelectionRef.current = null;
    return true;
  };

  // CellSelection이 활성화된 경우 현재 또는 저장된 선택 영역에 textAlign을 적용
  const applyTextAlignToSelection = (alignment) => {
    const editorView = getEditorViewSafely(editor);

    if (!editor || !editorView) return false;

    const { state } = editor;

    const cellSel =
      state.selection instanceof CellSelection
        ? state.selection
        : savedCellSelectionRef.current;

    if (!cellSel) return false;

    const tr = state.tr;
    const alignTypes = ["paragraph", "heading"];

    cellSel.forEachCell((cellNode, cellPos) => {
      const from = cellPos + 1;
      const to = cellPos + cellNode.nodeSize - 1;

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (alignTypes.includes(node.type.name)) {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            textAlign: alignment
          });
        }
      });
    });

    editorView.dispatch(tr);
    savedCellSelectionRef.current = null;
    return true;
  };

  // CellSelection을 저장하는 헬퍼 (툴바 인터랙션 전에 호출)
  const saveCellSelection = () => {
    if (editor && editor.state.selection instanceof CellSelection) {
      savedCellSelectionRef.current = editor.state.selection;
    }
  };

  return {
    applyTextStyleToSelection,
    applyTextAlignToSelection,
    saveCellSelection
  };
}
