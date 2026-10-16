import { useRef, useState } from "react";
import {
  createData,
  deleteData,
  updateData,
  moveData
} from "../../LIB/utils/dataUtils";
import {
  convertMarkdownToHtml,
  convertPlainTextToHtml
} from "../../LIB/utils/markdownImportUtils";
import { convertOfficeFileToDocument } from "../../LIB/utils/officeFileImportUtils";
import { toast } from "sud-ui";
import {
  getCreatedDockitDocumentId,
  normalizeDockitDocumentForImport,
  validateDockitImportFile
} from "../../LIB/utils/dktDocumentUtils";

const buildConversionFailureToastMessage = (classification) => {
  const title = `${classification?.title ?? ""}`.trim();
  const message = `${classification?.message ?? ""}`.trim();

  if (!title) {
    return message;
  }

  if (!message || message.startsWith(title)) {
    return message || title;
  }

  return `${title} ${message}`;
};

export function useWorkspaceActions({
  user,
  currentFolderId,
  fetchContent,
  fetchFolderTree,
  folderTree,
  navigateToDocument,
  openDocumentWidget
}) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [onDelete, setOnDelete] = useState(false);
  const [onUpload, setOnUpload] = useState(false);
  const [documentCreationState, setDocumentCreationState] = useState({
    status: "idle",
    documentId: null,
    failurePhase: null
  });
  const documentCreationOperationRef = useRef({
    inFlight: null,
    inFlightCommandKey: null,
    pending: null
  });

  const getApiErrorDetail = (error) => {
    if (!error?.body) {
      return "";
    }

    try {
      const parsed = JSON.parse(error.body);
      return parsed?.detail || "";
    } catch {
      return `${error.body}`.trim();
    }
  };

  const getUploadErrorMessage = (error, ext) => {
    if (error?.conversionFailure) {
      return buildConversionFailureToastMessage(error.conversionFailure);
    }

    const detail = getApiErrorDetail(error);

    if (error?.status === 400) {
      return detail || "지원하지 않는 파일 형식입니다.";
    }

    if (error?.status >= 500) {
      return "파일을 불러오는 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }

    return detail || error?.message || "파일을 읽는 중 오류가 발생했습니다.";
  };

  const extractImportHtml = (htmlString) => {
    if (typeof window === "undefined") {
      return { title: "", content: htmlString };
    }

    const parser = new DOMParser();
    const parsed = parser.parseFromString(htmlString, "text/html");
    const dockitContent =
      parsed.querySelector(".tiptap-container") ||
      parsed.querySelector(".printable-area") ||
      parsed.body;

    return {
      title: parsed.title || "",
      content: dockitContent?.innerHTML || htmlString
    };
  };

  const runDocumentCreationCommand = async ({
    document = null,
    openAfterCreate = false,
    widgetId = null,
    commandKey = null
  } = {}) => {
    if (documentCreationOperationRef.current.inFlight) {
      if (
        !document ||
        documentCreationOperationRef.current.inFlightCommandKey === commandKey
      ) {
        return documentCreationOperationRef.current.inFlight;
      }

      toast.danger(
        "다른 문서 생성이 진행 중입니다. 완료된 뒤 다시 선택해 주세요."
      );
      return null;
    }

    const operation = (async () => {
      let pending = documentCreationOperationRef.current.pending;

      if (
        pending &&
        document &&
        pending.commandKey !== commandKey
      ) {
        toast.danger(
          "이전에 생성된 문서 처리가 끝나지 않았습니다. 먼저 다시 시도해 주세요."
        );
        return null;
      }

      if (!pending) {
        if (!document) {
          return null;
        }

        setDocumentCreationState({
          status: "creating",
          documentId: null,
          failurePhase: null
        });

        let createdDocument;
        try {
          createdDocument = await createData(
            "documents",
            currentFolderId,
            document
          );
        } catch (error) {
          console.error("문서 생성 실패:", error);
          setDocumentCreationState({
            status: "failed",
            documentId: null,
            failurePhase: "create"
          });
          toast.danger("문서 생성에 실패했습니다.");
          return null;
        }

        pending = {
          createdDocument,
          documentId: getCreatedDockitDocumentId(createdDocument),
          parentId: currentFolderId,
          openAfterCreate,
          widgetId,
          commandKey,
          refreshCompleted: {
            content: false,
            folderTree: false
          },
          widgetOpened: false
        };
        documentCreationOperationRef.current.pending = pending;
      }

      setDocumentCreationState({
        status: "finalizing",
        documentId: pending.documentId,
        failurePhase: null
      });

      const refreshOperations = [
        {
          key: "content",
          run: () => fetchContent(pending.parentId)
        },
        {
          key: "folderTree",
          run: () => fetchFolderTree()
        }
      ].filter(({ key }) => !pending.refreshCompleted[key]);

      if (refreshOperations.length > 0) {
        const refreshResults = await Promise.allSettled(
          refreshOperations.map(({ run }) => Promise.resolve().then(run))
        );
        let refreshFailed = false;

        refreshResults.forEach((result, index) => {
          const { key } = refreshOperations[index];
          if (result.status === "fulfilled") {
            pending.refreshCompleted[key] = true;
            return;
          }

          refreshFailed = true;
          console.error(
            `문서 생성 후 ${key} 갱신 실패:`,
            result.reason
          );
        });

        if (refreshFailed && !pending.openAfterCreate) {
          setDocumentCreationState({
            status: "retryable",
            documentId: pending.documentId,
            failurePhase: "refresh"
          });
          toast.danger(
            "문서는 생성되었지만 목록을 갱신하지 못했습니다. 다시 시도해 주세요."
          );
          return pending.createdDocument;
        }
      }

      try {
        if (pending.widgetId && !pending.widgetOpened) {
          if (!openDocumentWidget) {
            throw new Error("문서 위젯 열기 callback이 없습니다.");
          }
          await openDocumentWidget(pending.widgetId);
          pending.widgetOpened = true;
        }

        if (pending.openAfterCreate) {
          if (!pending.documentId) {
            throw new Error("생성된 문서 ID를 확인할 수 없습니다.");
          }
          if (!navigateToDocument) {
            throw new Error("문서 이동 callback이 없습니다.");
          }
          await navigateToDocument(pending.documentId);
        }
      } catch (error) {
        console.error("문서 생성 후 열기 실패:", error);
        setDocumentCreationState({
          status: "retryable",
          documentId: pending.documentId,
          failurePhase: "navigation"
        });
        toast.danger(
          "문서는 생성되었지만 열지 못했습니다. 다시 시도해 주세요."
        );
        return pending.createdDocument;
      }

      documentCreationOperationRef.current.pending = null;
      setDocumentCreationState({
        status: "idle",
        documentId: null,
        failurePhase: null
      });
      toast.success("문서가 생성되었습니다.");
      return pending.createdDocument;
    })();

    documentCreationOperationRef.current.inFlight = operation;
    documentCreationOperationRef.current.inFlightCommandKey = commandKey;
    try {
      return await operation;
    } finally {
      if (documentCreationOperationRef.current.inFlight === operation) {
        documentCreationOperationRef.current.inFlight = null;
        documentCreationOperationRef.current.inFlightCommandKey = null;
      }
    }
  };

  const handleCreateDocument = async (document, options = {}) => {
    const commandKey =
      options.commandKey ??
      JSON.stringify([
        "document",
        currentFolderId ?? null,
        options.openAfterCreate ? "open" : "stay",
        options.widgetId ?? null
      ]);
    return runDocumentCreationCommand({
      ...options,
      document,
      commandKey
    });
  };

  const retryPendingDocumentCreation = async () =>
    runDocumentCreationCommand();

  const handleCreateContent = async (type) => {
    if (type === "documents") {
      const countDocumentsInTree = (items) => {
        let count = 0;
        for (const item of items) {
          if (item.content_type === "documents") count++;
          if (item.children?.length > 0)
            count += countDocumentsInTree(item.children);
        }
        return count;
      };

      // if (countDocumentsInTree(folderTree) >= 10) {
      //   toast.danger("베타버전에서 문서는 최대 10개까지만 생성할 수 있습니다.");
      //   return;
      // }
    }

    if (type === "documents") {
      return handleCreateDocument({ title: "새 문서" });
    }

    try {
      await createData(type, currentFolderId, {
        title: type === "documents" ? "새 문서" : "새 폴더"
      });
      await fetchContent(currentFolderId);
      await fetchFolderTree();
      toast.success(
        `${type === "documents" ? "문서" : "폴더"}가 생성되었습니다.`
      );
    } catch (error) {
      console.error("콘텐츠 생성 실패:", error);
      toast.danger("생성에 실패했습니다");
    }
  };

  const handleUploadFile = async (file, setContextMenu) => {
    setContextMenu?.({ visible: false, x: 0, y: 0 });
    if (!file) return;
    setOnUpload(true);

    const ext = file.name.split(".").pop().toLowerCase();
    let newDoc = null;

    try {
      if (ext === "dkt") {
        const validation = validateDockitImportFile(file);
        if (!validation.valid) {
          throw new Error(validation.message);
        }
        newDoc = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const data = JSON.parse(e.target.result);
              resolve(normalizeDockitDocumentForImport(data));
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = () => reject(new Error("파일 읽기 실패"));
          reader.readAsText(file);
        });
      } else if (["docx", "hwpx"].includes(ext)) {
        const result = await convertOfficeFileToDocument(file);

        newDoc = {
          title: result.title,
          content: result.content,
          sourceFileName: result.sourceFileName
        };

        if (result.warningTotal > 0) {
          toast.info(
            `일부 서식이 단순화되었을 수 있습니다. 확인할 항목 ${result.warningTotal}개`
          );
        }
      } else if (ext === "txt") {
        newDoc = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              title: file.name.split(".")[0],
              content: convertPlainTextToHtml(e.target.result)
            });
          };
          reader.onerror = () => reject(new Error("파일 읽기 실패"));
          reader.readAsText(file);
        });
      } else if (ext === "md") {
        newDoc = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              title: file.name.split(".")[0],
              content: convertMarkdownToHtml(e.target.result)
            });
          };
          reader.onerror = () => reject(new Error("파일 읽기 실패"));
          reader.readAsText(file);
        });
      } else if (["html", "htm"].includes(ext)) {
        newDoc = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const { title, content } = extractImportHtml(e.target.result);
            resolve({
              title: title || file.name.split(".")[0],
              content
            });
          };
          reader.onerror = () => reject(new Error("파일 읽기 실패"));
          reader.readAsText(file);
        });
      } else {
        toast.danger("지원하지 않는 파일 형식입니다.");
        return;
      }
      await createData("documents", currentFolderId, newDoc);
      await fetchContent(currentFolderId);
      await fetchFolderTree();
      toast.success(`'${newDoc.title}'을 불러왔습니다.`);
    } catch (error) {
      console.error(error);
      toast.danger(getUploadErrorMessage(error, ext));
    } finally {
      setOnUpload(false);
    }
  };

  const handleDelete = async (type, contentId, clearSelection) => {
    if (!user || !contentId) return;
    setOnDelete(true);
    try {
      await deleteData(type, contentId);
      toast.success("삭제되었습니다.");
      setDeleteModalOpen(false);
      setDeleteInput("");
      setSelectedItem(null);
      clearSelection();
      setOnDelete(false);
      await fetchContent(currentFolderId);
      await fetchFolderTree();
    } catch (error) {
      console.error("삭제 실패:", error);
      toast.danger("삭제에 실패했습니다.");
    }
  };

  const handleDeleteMultiple = async (selectedItems, clearSelection) => {
    if (!user || selectedItems.length === 0) return;
    setOnDelete(true);
    try {
      for (const item of selectedItems) {
        await deleteData(item.content_type, item._id);
      }
      toast.success(`${selectedItems.length}개 항목이 삭제되었습니다.`);
      setDeleteModalOpen(false);
      setDeleteInput("");
      setSelectedItem(null);
      clearSelection();
      setOnDelete(false);
      await fetchContent(currentFolderId);
      await fetchFolderTree();
    } catch (error) {
      console.error("삭제 실패:", error);
      toast.danger("삭제에 실패했습니다.");
    }
  };

  const handleRename = async (
    type,
    contentId,
    newTitle,
    expectedRevision = null
  ) => {
    if (!user || !contentId || !newTitle) return;
    try {
      await updateData(
        type,
        contentId,
        type === "documents"
          ? { title: newTitle, expectedRevision }
          : { title: newTitle }
      );
      await fetchContent(currentFolderId);
      toast.success("이름이 변경되었습니다.");
      setRenameModalOpen(false);
      setSelectedItem(null);
    } catch (error) {
      console.error("이름 변경 실패:", error);
      if (error?.code === "RevisionConflict") {
        await fetchContent(currentFolderId).catch(() => {});
        toast.danger(
          "다른 창에서 문서가 변경되었습니다. 목록을 새로 확인해 주세요."
        );
      } else {
        toast.danger("이름 변경에 실패했습니다.");
      }
    }
  };

  const handleMoveContent = async (
    type,
    contentId,
    newParentId,
    clearSelection
  ) => {
    if (!user || !contentId) return;
    try {
      await moveData(type, contentId, newParentId);
      await fetchContent(currentFolderId);
      await fetchFolderTree();
      toast.success("이동되었습니다.");
      setMoveModalOpen(false);
      setSelectedItem(null);
      clearSelection();
    } catch (error) {
      console.error("이동 실패:", error);
      toast.danger("이동에 실패했습니다.");
    }
  };

  const handleMoveMultiple = async (
    selectedItems,
    newParentId,
    clearSelection
  ) => {
    if (!user || selectedItems.length === 0) return;
    try {
      for (const item of selectedItems) {
        await moveData(item.content_type, item._id, newParentId);
      }
      await fetchContent(currentFolderId);
      await fetchFolderTree();
      toast.success(`${selectedItems.length}개 항목이 이동되었습니다.`);
      setMoveModalOpen(false);
      setSelectedItem(null);
      clearSelection();
    } catch (error) {
      console.error("이동 실패:", error);
      toast.danger("이동에 실패했습니다.");
    }
  };

  return {
    deleteModalOpen,
    setDeleteModalOpen,
    renameModalOpen,
    setRenameModalOpen,
    moveModalOpen,
    setMoveModalOpen,
    deleteInput,
    setDeleteInput,
    selectedItem,
    setSelectedItem,
    onDelete,
    onUpload,
    documentCreationState,
    handleCreateDocument,
    retryPendingDocumentCreation,
    handleCreateContent,
    handleUploadFile,
    handleDelete,
    handleDeleteMultiple,
    handleRename,
    handleMoveContent,
    handleMoveMultiple
  };
}
