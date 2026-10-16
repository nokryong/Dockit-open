import { useState } from "react";
import { moveData } from "../../LIB/utils/dataUtils";
import { toast } from "sud-ui";

export function useWorkspaceDragDrop({
  currentPath,
  currentFolderId,
  fetchContent,
  fetchFolderTree
}) {
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);

  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragOver = (e, item) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (item.content_type === "folders" && item._id !== draggedItem?._id) {
      setDragOverItem(item);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = async (e, targetItem) => {
    e.preventDefault();

    if (!draggedItem || !targetItem || targetItem.content_type !== "folders") {
      setDragOverItem(null);
      return;
    }

    if (draggedItem._id === targetItem._id) {
      setDragOverItem(null);
      return;
    }

    if (draggedItem.content_type === "folders") {
      const isSubFolder = currentPath.some(
        (folder) => folder.id === draggedItem._id
      );
      if (isSubFolder) {
        toast.danger("폴더를 자신의 하위 폴더로 이동할 수 없습니다.");
        setDragOverItem(null);
        return;
      }
    }

    try {
      await moveData(draggedItem.content_type, draggedItem._id, targetItem._id);
      await fetchContent(currentFolderId);
      await fetchFolderTree();
      toast.success(
        `${draggedItem.title}이(가) ${targetItem.title} 폴더로 이동되었습니다.`
      );
    } catch (error) {
      console.error("이동 실패:", error);
    }

    setDragOverItem(null);
  };

  return {
    draggedItem,
    dragOverItem,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}
