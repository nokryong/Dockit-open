import { useCallback, useEffect, useRef, useState } from "react";
import {
  extendWorkspaceItemSelection,
  getWorkspaceShortcutAction,
  mergeUniqueWorkspaceItems,
  toggleWorkspaceItemSelection
} from "../utils/workspaceSelectionUtils";

export function useWorkspaceSelection({
  containerRef,
  getAllItems,
  modalsOpen,
  contextMenuVisible,
  onDeleteRequest,
  onClearItem
}) {
  const [selectedItems, setSelectedItems] = useState([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);

  // 드래그 선택 상태
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState({
    startX: 0, startY: 0, endX: 0, endY: 0
  });
  const [itemRects, setItemRects] = useState([]);
  const justFinishedSelectingRef = useRef(false);
  const selectionStartPointRef = useRef({ x: 0, y: 0 });
  const selectedItemsRef = useRef([]);
  const dragSelectionBaseRef = useRef([]);
  const dragSelectionAdditiveRef = useRef(false);

  useEffect(() => {
    selectedItemsRef.current = selectedItems;
  }, [selectedItems]);

  const isItemSelected = useCallback((itemId) => {
    return selectedItems.some((item) => item._id === itemId);
  }, [selectedItems]);

  const handleItemClick = useCallback(
    (e, item, allItems) => {
      e.stopPropagation();
      const itemIndex = allItems.findIndex((candidate) => candidate._id === item._id);

      if (e.ctrlKey || e.metaKey) {
        setSelectedItems((prev) => toggleWorkspaceItemSelection(prev, item));
        setLastSelectedIndex(itemIndex);
        return;
      }

      if (e.shiftKey && lastSelectedIndex !== null) {
        setSelectedItems((prev) =>
          extendWorkspaceItemSelection({
            selectedItems: prev,
            allItems,
            lastSelectedIndex,
            itemIndex
          })
        );
        return;
      }

      setSelectedItems([item]);
      setLastSelectedIndex(itemIndex);
    },
    [lastSelectedIndex]
  );

  const handleSelectionStart = useCallback((e) => {
    if (modalsOpen) return;
    if (e.target.closest("[data-item-id]")) return;
    if (e.target.closest("[data-no-drag-select]")) return;
    if (contextMenuVisible) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const y = e.clientY - rect.top + container.scrollTop;

    setIsSelecting(true);
    selectionStartPointRef.current = { x, y };
    setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
    dragSelectionAdditiveRef.current = Boolean(e.ctrlKey || e.metaKey);
    dragSelectionBaseRef.current = dragSelectionAdditiveRef.current
      ? selectedItemsRef.current
      : [];

    const items = container.querySelectorAll("[data-item-id]");
    const rects = [];
    items.forEach((item) => {
      const itemRect = item.getBoundingClientRect();
      rects.push({
        id: item.getAttribute("data-item-id"),
        left: itemRect.left - rect.left + container.scrollLeft,
        top: itemRect.top - rect.top + container.scrollTop,
        right: itemRect.right - rect.left + container.scrollLeft,
        bottom: itemRect.bottom - rect.top + container.scrollTop
      });
    });
    setItemRects(rects);

    if (!dragSelectionAdditiveRef.current) {
      setSelectedItems([]);
    }
  }, [containerRef, contextMenuVisible, modalsOpen]);

  const handleSelectionMove = useCallback((e) => {
    if (!isSelecting) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const y = e.clientY - rect.top + container.scrollTop;

    setSelectionBox((prev) => ({ ...prev, endX: x, endY: y }));

    const box = {
      left: Math.min(selectionStartPointRef.current.x, x),
      top: Math.min(selectionStartPointRef.current.y, y),
      right: Math.max(selectionStartPointRef.current.x, x),
      bottom: Math.max(selectionStartPointRef.current.y, y)
    };

    const allItems = getAllItems();
    const intersectingItems = [];

    itemRects.forEach((itemRect) => {
      const intersects = !(
        box.right < itemRect.left ||
        box.left > itemRect.right ||
        box.bottom < itemRect.top ||
        box.top > itemRect.bottom
      );
      if (intersects) {
        const item = allItems.find((i) => i._id === itemRect.id);
        if (item) intersectingItems.push(item);
      }
    });

    setSelectedItems(
      dragSelectionAdditiveRef.current
        ? mergeUniqueWorkspaceItems(
            dragSelectionBaseRef.current,
            intersectingItems
          )
        : intersectingItems
    );
  }, [containerRef, getAllItems, isSelecting, itemRects]);

  const handleSelectionEnd = useCallback(() => {
    if (isSelecting) {
      justFinishedSelectingRef.current = true;
      setTimeout(() => {
        justFinishedSelectingRef.current = false;
      }, 0);
    }

    dragSelectionBaseRef.current = [];
    dragSelectionAdditiveRef.current = false;
    setIsSelecting(false);
    setItemRects([]);
  }, [isSelecting]);

  const getSelectionBoxStyle = useCallback(() => {
    if (!isSelecting) return { display: "none" };
    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);
    return {
      position: "absolute",
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: "1px solid #12b886",
      backgroundColor: "rgba(18, 184, 134, 0.1)",
      pointerEvents: "none",
      zIndex: 1000
    };
  }, [isSelecting, selectionBox.endX, selectionBox.endY, selectionBox.startX, selectionBox.startY]);

  // Ctrl+A, ESC, Delete 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e) => {
      const action = getWorkspaceShortcutAction({
        event: e,
        modalsOpen,
        contextMenuVisible,
        hasSelection: selectedItemsRef.current.length > 0
      });

      if (action === "selectAll") {
        e.preventDefault();
        const allItems = getAllItems();
        setSelectedItems(allItems);
        setLastSelectedIndex(allItems.length > 0 ? allItems.length - 1 : null);
        return;
      }

      if (action === "clear") {
        setSelectedItems([]);
        setLastSelectedIndex(null);
        onClearItem?.();
        return;
      }

      if (action === "delete") {
        onDeleteRequest?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextMenuVisible, getAllItems, modalsOpen, onClearItem, onDeleteRequest]);

  const clearSelection = useCallback(() => {
    setSelectedItems([]);
    setLastSelectedIndex(null);
  }, []);

  return {
    selectedItems, setSelectedItems,
    isSelecting,
    justFinishedSelectingRef,
    isItemSelected,
    handleItemClick,
    handleSelectionStart, handleSelectionMove, handleSelectionEnd,
    getSelectionBoxStyle,
    clearSelection
  };
}
