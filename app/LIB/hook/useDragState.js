import { useState, useCallback } from "react";
import { arrayMove } from "@dnd-kit/sortable";

/**
 * 드래그 상태 관리 커스텀 훅
 * DnD 관련 상태와 핸들러를 중앙에서 관리
 */
export function useDragState() {
  const [activeId, setActiveId] = useState(null);
  const [overContainerId, setOverContainerId] = useState(null);

  // 컨테이너 찾기 유틸리티 함수
  const findContainer = useCallback((id, left, right) => {
    if (left.includes(id)) {
      return "left";
    }
    if (right.includes(id)) {
      return "right";
    }
    // 아이템 ID가 아니라 컨테이너 자체의 ID일 수도 있습니다.
    if (id === "left" || id === "right") {
      return id;
    }
    return null;
  }, []);

  // 드래그 시작
  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  // 드래그 오버
  const handleDragOver = useCallback(
    (event, left, right) => {
      const { over } = event;
      const overId = over ? findContainer(over.id, left, right) : null;
      setOverContainerId(overId);
    },
    [findContainer]
  );

  // 드래그 종료
  const handleDragEnd = useCallback(
    (event, left, right, setLeft, setRight) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      // findContainer 함수를 사용해 시작 컨테이너와 종료 컨테이너를 찾습니다.
      const activeContainer = findContainer(active.id, left, right);
      const overContainer = findContainer(over.id, left, right);

      if (!activeContainer || !overContainer) return;

      // --- 같은 컨테이너 내에서 이동 ---
      if (activeContainer === overContainer) {
        const items = activeContainer === "left" ? left : right;
        const setter = activeContainer === "left" ? setLeft : setRight;

        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);

        if (oldIndex !== newIndex) {
          setter(arrayMove(items, oldIndex, newIndex));
        }
      }
      // --- 다른 컨테이너로 이동 ---
      else {
        const fromItems = activeContainer === "left" ? left : right;
        const fromSetter = activeContainer === "left" ? setLeft : setRight;
        const toItems = overContainer === "left" ? left : right;
        const toSetter = overContainer === "left" ? setLeft : setRight;

        const fromIndex = fromItems.indexOf(active.id);
        // over.id가 컨테이너 ID일 경우 toItems.indexOf(over.id)는 -1을 반환합니다.
        let toIndex = toItems.indexOf(over.id);
        // 빈 공간에 드롭했다면 (toIndex가 -1), 배열의 맨 끝에 추가합니다.
        if (toIndex === -1) {
          toIndex = toItems.length;
        }

        const itemToMove = fromItems[fromIndex];

        fromSetter((prev) => prev.filter((item) => item !== itemToMove));
        toSetter((prev) => {
          const newArray = [...prev];
          newArray.splice(toIndex, 0, itemToMove);
          return newArray;
        });
      }
      setOverContainerId(null);
    },
    [findContainer]
  );

  // 드래그 취소
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverContainerId(null);
  }, []);

  // 드래그 상태 초기화
  const resetDragState = useCallback(() => {
    setActiveId(null);
    setOverContainerId(null);
  }, []);

  return {
    // 상태
    activeId,
    overContainerId,

    // 세터
    setActiveId,
    setOverContainerId,

    // 이벤트 핸들러들
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragCancel,

    // 유틸리티 함수들
    resetDragState,
  };
}
