import { useRef, useEffect, useCallback } from "react";
import { Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { getEditorViewSafely } from "../utils/editorViewUtils";
import { isPanelObjectType, isDoubleClickPanelObjectType } from "../utils/editorContractUtils";
import { isReadOnlyObjectTarget, isTextRangeSelection, resolveSelectionObjectAction, shouldHandleReadOnlyObjectPointer, shouldCollapseTextSelectionOnMouseDown } from "../utils/contentEditorUtils";

export default function useContentEditorObjectSelection(editor, isEditable, selectedObject, setSelectedObject, rememberTextSelection) {
  // 이전 선택 상태를 저장하여 불필요한 업데이트 방지
  const lastSelectionRef = useRef(null);

  // selectedObject를 ref로 추적하여 콜백 의존성 순환 방지
  const selectedObjectRef = useRef(selectedObject);
  useEffect(() => {
    selectedObjectRef.current = selectedObject;
  }, [selectedObject]);

  // 1. 객체 정보 추출 (텍스트 입력 중에도 도형 감지)
  const getObjectInfoFromSelection = useCallback(() => {
    if (!editor) return null;
    const { selection } = editor.state;

    // A. 노드 자체가 선택된 경우 (NodeSelection)
    if (selection.node) {
      const typeName = selection.node.type.name;
      if (isPanelObjectType(typeName)) {
        return {
          node: selection.node,
          from: selection.from,
          to: selection.to,
          type: typeName
        };
      }
    }
    // B. 텍스트 커서 상태일 때 (부모 확인: 테이블 OR 도형)
    else {
      let targetInfo = null;
      for (let depth = selection.$from.depth; depth > 0; depth--) {
        const node = selection.$from.node(depth);
        const name = node.type.name;

        // 테이블과 shapeBlock을 부모로 감지
        if (
          name === "table" ||
          name === "tableRow" ||
          name === "tableCell" ||
          name === "tableHeader" ||
          name === "table_row" ||
          name === "table_cell" ||
          name === "table_header" ||
          name === "shapeBlock"
        ) {
          const pos = selection.$from.before(depth);
          targetInfo = {
            node: node,
            from: pos,
            to: pos + node.nodeSize,
            type: name
          };
          break;
        }
      }
      return targetInfo;
    }
  }, [editor]);

  // 2. 선택 변경 핸들러 (원클릭 동작)
  const handleSelectionUpdate = useCallback(() => {
    if (!editor) return;

    if (!isEditable) {
      if (selectedObjectRef.current) {
        selectedObjectRef.current = null;
        setSelectedObject(null);
      }
      return;
    }

    const { selection } = editor.state;
    const isCellSelection = selection instanceof CellSelection;
    const hasTextRangeSelection = isTextRangeSelection({
      isEmpty: selection.empty,
      hasNodeSelection: Boolean(selection.node),
      isCellSelection
    });

    if (!selection.node) {
      rememberTextSelection(selection);
    }

    const selectionKey = `${selection.$from.pos}-${selection.$to.pos}`;

    if (lastSelectionRef.current === selectionKey) return;
    lastSelectionRef.current = selectionKey;

    const targetInfo = getObjectInfoFromSelection();

    const selectionAction = resolveSelectionObjectAction({
      isEditable,
      targetInfo,
      hasTextRangeSelection,
      activeElementTagName: document.activeElement?.tagName,
      previousSelectedObject: selectedObjectRef.current
    });

    if (selectionAction.action === "keep") {
      return;
    }

    if (selectionAction.action === "clear") {
      setSelectedObject(null);
      return;
    }

    setSelectedObject(selectionAction.value);
  }, [
    editor,
    getObjectInfoFromSelection,
    isEditable,
    rememberTextSelection,
    setSelectedObject
  ]);

  // 3. 더블 클릭 핸들러 (도형 선택 트리거)
  const handleDoubleClick = useCallback(
    (event) => {
      if (!isEditable) {
        return;
      }

      let targetInfo = getObjectInfoFromSelection();

      // DOM 기반 폴백: selection으로 감지 안 될 때도 실제 더블클릭한 객체를 우선 잡습니다.
      if (!targetInfo || !isDoubleClickPanelObjectType(targetInfo.type)) {
        const target = event.target;
        const editorView = getEditorViewSafely(editor);
        const resolveNodeTargetInfoFromWrapper = (wrapperEl, typeName) => {
          if (!wrapperEl || !editorView) {
            return null;
          }

          try {
            const pos = editorView.posAtDOM(wrapperEl, 0);
            const $pos = editor.state.doc.resolve(pos);

            for (let depth = $pos.depth; depth >= 0; depth -= 1) {
              const node = $pos.node(depth);

              if (node.type.name !== typeName) {
                continue;
              }

              const from = depth > 0 ? $pos.before(depth) : pos;

              return {
                node,
                from,
                to: from + node.nodeSize,
                type: typeName
              };
            }

            const nodeAtPos = editor.state.doc.nodeAt(pos);

            if (nodeAtPos && nodeAtPos.type.name === typeName) {
              return {
                node: nodeAtPos,
                from: pos,
                to: pos + nodeAtPos.nodeSize,
                type: typeName
              };
            }
          } catch (e) {
            // posAtDOM 에러 무시
          }

          return null;
        };

        if (target instanceof Element && editorView) {
          const imageEl =
            target.closest(".lazy-image-container") || target.closest("img");

          if (imageEl) {
            targetInfo = resolveNodeTargetInfoFromWrapper(
              imageEl.closest("[data-node-view-wrapper]"),
              "image"
            );
          }

          if (!targetInfo || targetInfo.type !== "image") {
            const shapeEl =
              target.closest(".shape-block-container") ||
              target.closest('[data-type="shape-block"]');

            if (shapeEl) {
              targetInfo = resolveNodeTargetInfoFromWrapper(
                shapeEl.closest("[data-node-view-wrapper]"),
                "shapeBlock"
              );
            }
          }
        }
      }

      // 이미지 또는 도형일 때만 더블클릭으로 선택(툴바 토글)
      if (targetInfo && isDoubleClickPanelObjectType(targetInfo.type)) {
        // selectedObjectRef를 사용하여 의존성 순환 방지
        const isSameObject =
          selectedObjectRef.current &&
          selectedObjectRef.current.from === targetInfo.from;

        if (isSameObject) {
          selectedObjectRef.current = null;
          setSelectedObject(null);
        } else {
          // ref를 먼저 동기 업데이트하여 setNodeSelection이 트리거하는
          // selectionUpdate에서 선택이 초기화되는 race condition 방지
          selectedObjectRef.current = targetInfo;
          setSelectedObject(targetInfo);
          // NodeSelection을 설정하여 outline이 표시되도록 함
          try {
            editor.commands.setNodeSelection(targetInfo.from);
          } catch (e) {
            // NodeSelection 설정 실패 시 무시
          }
        }
      }
    },
    [editor, getObjectInfoFromSelection, isEditable, setSelectedObject]
  );

  const handleReadOnlyObjectPointerEvent = useCallback(
    (event) => {
      const editorView = getEditorViewSafely(editor);
      const editorDom = editorView?.dom;

      if (isEditable || !editorDom) {
        return;
      }

      const isTargetingReadOnlyObject = isReadOnlyObjectTarget(
        event.target,
        editorDom
      );

      if (
        !shouldHandleReadOnlyObjectPointer({
          isEditable,
          hasEditorDom: Boolean(editorDom),
          isTargetingReadOnlyObject
        })
      ) {
        return;
      }

      event.stopPropagation();

      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      if (selectedObjectRef.current) {
        selectedObjectRef.current = null;
        setSelectedObject(null);
      }
    },
    [editor, isEditable, setSelectedObject]
  );

  const handleTextSelectionMouseDown = useCallback(
    (event) => {
      const editorView = getEditorViewSafely(editor);
      const editorDom = editorView?.dom;

      if (!editor || editor.isDestroyed || !editorView || !editorDom) {
        return;
      }

      const clickResult = editorView.posAtCoords({
        left: event.clientX,
        top: event.clientY
      });
      const { selection } = editor.state;
      const shouldCollapseSelection = shouldCollapseTextSelectionOnMouseDown({
        isEditable,
        hasEditorDom: Boolean(editorDom),
        isPrimaryButton: event.button === 0,
        hasModifierKey:
          event.shiftKey || event.metaKey || event.ctrlKey || event.altKey,
        selectionEmpty: selection.empty,
        hasNodeSelection: Boolean(selection.node),
        isCellSelection: selection instanceof CellSelection,
        clickPos: clickResult?.pos,
        selectionFrom: selection.from,
        selectionTo: selection.to,
        targetTagName: event.target?.tagName
      });

      if (!shouldCollapseSelection) {
        return;
      }

      const docSize = editor.state.doc.content.size;
      const clickPos = Math.max(0, Math.min(clickResult.pos, docSize));
      const tr = editor.state.tr.setSelection(
        Selection.near(editor.state.doc.resolve(clickPos))
      );

      editorView.dispatch(tr.scrollIntoView());
      editorView.focus();
      event.preventDefault();
    },
    [editor, isEditable]
  );

  return { selectedObjectRef, handleSelectionUpdate, handleDoubleClick, handleReadOnlyObjectPointerEvent, handleTextSelectionMouseDown };
}
