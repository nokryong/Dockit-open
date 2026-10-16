"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Div, Image, Upload, Typography } from "sud-ui";

import { useLayout } from "../LIB/context/LayoutContext";
import { useRouter, useSearchParams } from "@/desktop/navigation";
import { useUser } from "../LIB/context/UserContext";
import DeleteModal from "../LIB/components/docs/DeleteModal";
import RenameModal from "../LIB/components/docs/RenameModal";
import MoveModal from "../LIB/components/docs/MoveModal";
import { TriangleLeft } from "sud-icons";
import { TbFolder } from "react-icons/tb";
import { formatTime } from "../LIB/utils/commonUtils";
import ContextMenu from "../LIB/components/docs/ContextMenu";
import { LoadingAnimation } from "../LIB/components/docs/DocumentListStates";
import WorkspaceStarter from "../LIB/components/docs/WorkspaceStarter";
import { useDocument } from "../LIB/context/DocumentContext";
import { useFolderTree } from "../LIB/context/FolderTreeContext";
import { useInBook } from "../LIB/context/InBookContext";
import { useContent } from "../LIB/context/ContentContext";
import { useSetting } from "../LIB/context/SettingContext";
import LoadingComponent from "../LIB/components/panel/commonComponent/LoadingComponent";
import { useWorkspaceActions } from "./hooks/useWorkspaceActions";
import { useWorkspaceSelection } from "./hooks/useWorkspaceSelection";
import { useWorkspaceDragDrop } from "./hooks/useWorkspaceDragDrop";
import { newDropShadowDarkSm, newDropShadowLightSm, newShadowDarkSm, newShadowLightSm } from "../LIB/constant/uiProps";
import { useDarkMode } from "../LIB/context/DarkModeContext";
import { usePanels } from "../LIB/context/PanelContext";
import ScrollReveal from "../LIB/components/common/ScrollReveal";
import { cx, docsWorkspaceStyles } from "../LIB/constant/uiStyles";
import { PiFilePlus, PiFolderPlus, PiUploadSimple } from "react-icons/pi";

import { navigateToCreatedDocument } from "./documentNavigation";

export default function WorkspacePage() {
  const { layoutMode } = useLayout();
  const { setRight } = usePanels();
  const { user, userLoading } = useUser();
  const { isDarkMode, currentColors } = useDarkMode();
  const { setting, settingLoading } = useSetting();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folder");
  const hasInitialized = useRef(false);
  const { clearDocument, setError } = useDocument();
  const { folderTree, fetchFolderTree } = useFolderTree();
  const { enterBook, goToHome } = useInBook();
  const {
    workspaceContent: contentList,
    workspaceLoading: listLoading,
    currentFolderId,
    fetchWorkspaceContent: fetchContent
  } = useContent();
  const currentFolderIdRef = useRef(currentFolderId);
  const fetchContentRef = useRef(fetchContent);
  const fetchFolderTreeRef = useRef(fetchFolderTree);
  const orderTypeRef = useRef(null);
  const isAscendingRef = useRef(true);
  const initialSortSnapshotRef = useRef(null);

  // 기본 상태
  const [currentPath, setCurrentPath] = useState([]);
  const containerRef = useRef(null);

  // 모바일 롱프레스 제어용 Ref 추가
  const longPressTimer = useRef(null);
  const isLongPressTriggered = useRef(false);

  const viewMode = setting?.workspaceViewMode || "list";
  const orderType = setting?.workspaceOrderType || "created_at";
  const isAscending = setting?.workspaceIsAscending ?? true;
  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0
  });

  // 현재 표시되는 모든 아이템을 하나의 배열로 합침
  const getAllItems = useCallback(() => {
    const folders = contentList[0] || [];
    const documents = contentList[1] || [];
    return [...folders, ...documents];
  }, [contentList]);

  const navigateToDocument = useCallback(
    (documentId) =>
      navigateToCreatedDocument({
        documentId,
        push: (targetPath) => router.push(targetPath)
      }),
    [router]
  );
  const openDocumentWidget = useCallback(
    (widgetId) => {
      setRight((currentRight) =>
        currentRight.includes(widgetId)
          ? currentRight
          : [...currentRight, widgetId]
      );
    },
    [setRight]
  );

  // --- Custom Hooks ---
  const actions = useWorkspaceActions({
    user,
    currentFolderId,
    fetchContent,
    fetchFolderTree,
    folderTree,
    navigateToDocument,
    openDocumentWidget
  });
  const modalsOpen =
    actions.deleteModalOpen ||
    actions.renameModalOpen ||
    actions.moveModalOpen;

  const selection = useWorkspaceSelection({
    containerRef,
    getAllItems,
    modalsOpen,
    contextMenuVisible: contextMenu.visible,
    onDeleteRequest: () => actions.setDeleteModalOpen(true),
    onClearItem: () => actions.setSelectedItem(null)
  });

  const dragDrop = useWorkspaceDragDrop({
    currentPath,
    currentFolderId,
    fetchContent,
    fetchFolderTree
  });

  useEffect(() => {
    currentFolderIdRef.current = currentFolderId;
    fetchContentRef.current = fetchContent;
    fetchFolderTreeRef.current = fetchFolderTree;
  }, [currentFolderId, fetchContent, fetchFolderTree]);

  useEffect(() => {
    orderTypeRef.current = orderType;
    isAscendingRef.current = isAscending;
  }, [orderType, isAscending]);

  useEffect(() => {
    if (!modalsOpen) {
      return;
    }

    setContextMenu({ visible: false, x: 0, y: 0 });
  }, [modalsOpen]);

  // --- Navigation ---
  const createWorkspaceUrl = (targetFolderId = null) => {
    if (!targetFolderId) return "/docs";
    return `/docs?folder=${encodeURIComponent(targetFolderId)}`;
  };

  const findFolderPath = useCallback((items, targetFolderId, parents = []) => {
    if (!targetFolderId) return [];

    for (const item of items || []) {
      if (item?.content_type !== "folders") continue;

      const nextPath = [...parents, { id: item._id, title: item.title }];
      if (item._id === targetFolderId) {
        return nextPath;
      }

      const childPath = findFolderPath(
        item.children || [],
        targetFolderId,
        nextPath
      );
      if (childPath.length > 0) {
        return childPath;
      }
    }

    return [];
  }, []);

  // 초기 로드
  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push("/");
      return;
    }

    const init = async () => {
      try {
        const nextTree = await fetchFolderTree(folderId);
        const nextOrderType = orderTypeRef.current || "created_at";
        const nextIsAscending = isAscendingRef.current ?? true;
        const nextSortOrder = nextIsAscending ? 1 : -1;

        if (folderId) {
          const path = findFolderPath(nextTree, folderId);

          if (path.length === 0) {
            setCurrentPath([]);
            await fetchContent(null, null, nextOrderType, nextSortOrder);
            initialSortSnapshotRef.current = {
              folderId: null,
              orderType: nextOrderType,
              isAscending: nextIsAscending
            };
            goToHome();
            router.replace("/docs");
            hasInitialized.current = true;
            return;
          }

          setCurrentPath(path);
          await fetchContent(folderId, null, nextOrderType, nextSortOrder);
          initialSortSnapshotRef.current = {
            folderId,
            orderType: nextOrderType,
            isAscending: nextIsAscending
          };
          const currentFolder = path[path.length - 1];
          enterBook(currentFolder.id, currentFolder.title);
        } else {
          setCurrentPath([]);
          await fetchContent(null, null, nextOrderType, nextSortOrder);
          initialSortSnapshotRef.current = {
            folderId: null,
            orderType: nextOrderType,
            isAscending: nextIsAscending
          };
          goToHome();
        }

        hasInitialized.current = true;
      } catch (error) {
        console.error("Workspace 초기화 중 에러 발생:", error);
      }
    };
    init();
  }, [
    user,
    userLoading,
    folderId,
    fetchFolderTree,
    fetchContent,
    findFolderPath,
    enterBook,
    goToHome,
    router
  ]);

  useEffect(() => {
    if (!folderId) {
      setCurrentPath([]);
      return;
    }

    const path = findFolderPath(folderTree, folderId);
    if (path.length === 0) return;

    setCurrentPath(path);
  }, [folderTree, folderId, findFolderPath]);

  useEffect(() => {
    clearDocument();
    setError(false);
  }, [clearDocument, setError]);

  // 정렬 변경
  useEffect(() => {
    if (!user || userLoading || !hasInitialized.current || settingLoading)
      return;

    const currentFolderKey = folderId || null;
    const shouldSkipInitialSortFetch =
      initialSortSnapshotRef.current?.folderId === currentFolderKey &&
      initialSortSnapshotRef.current?.orderType === orderType &&
      initialSortSnapshotRef.current?.isAscending === isAscending;

    if (shouldSkipInitialSortFetch) {
      initialSortSnapshotRef.current = null;
      return;
    }

    initialSortSnapshotRef.current = null;
    const sortOrder = isAscending ? 1 : -1;
    fetchContent(folderId, null, orderType, sortOrder);
  }, [
    orderType,
    isAscending,
    folderId,
    user,
    userLoading,
    settingLoading,
    fetchContent
  ]);

  const handleOpenFolder = (nextFolderId) => {
    router.push(createWorkspaceUrl(nextFolderId));
  };

  const handleGoBack = () => {
    if (currentPath.length === 0) return;

    const parentFolder = currentPath[currentPath.length - 2];
    router.push(createWorkspaceUrl(parentFolder?.id));
  };

  const handleBreadcrumbClick = (index) => {
    if (index === -1) {
      router.push("/docs");
      return;
    }

    const targetFolder = currentPath[index];
    if (!targetFolder) return;

    router.push(createWorkspaceUrl(targetFolder.id));
  };
  // --- Context Menu ---
  const handleContextMenu = (e) => {
    if (modalsOpen) {
      return;
    }

    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  };

  const handleClickOutside = (e) => {
    if (modalsOpen) return;
    if (selection.justFinishedSelectingRef.current) return;
    if (!e.target.closest("[data-item-id]")) {
      setContextMenu({ visible: false, x: 0, y: 0 });
      actions.setSelectedItem(null);
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        selection.setSelectedItems([]);
      }
    }
  };

  // --- Mobile Long Press Handlers ---
  const handleTouchStart = (e, item) => {
    if (modalsOpen) {
      return;
    }

    isLongPressTriggered.current = false;

    // 터치 지점의 좌표 저장
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true;

      // 컨텍스트 메뉴 로직 실행
      if (!selection.isItemSelected(item._id)) {
        selection.setSelectedItems([item]);
      }
      actions.setSelectedItem(item);
      setContextMenu({
        visible: true,
        x: clientX,
        y: clientY
      });

      // 모바일 기기의 기본 햅틱 피드백 트리거 (지원하는 경우)
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500); // 500ms 길게 누르기
  };

  const handleTouchEndOrMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const folders = contentList[0] || [];
  const documents = contentList[1] || [];
  const hasWorkspaceItems = folders.length > 0 || documents.length > 0;
  const uploadExtensions = ["dkt", "html", "htm", "docx", "hwpx", "md", "txt"];

  // --- Render ---
  const renderList = (item, type, title, isDragOver) => {
    return (
      <div className={docsWorkspaceStyles.listRow}>
        {type === "documents" ? (
          <Image
            className={"hover-scale-6"}
            src={item.thumbnail || "/logo/document-empty.png"}
            alt={item.title}
            width={40}
            shape="rounded"
            height={50}
            preview={false}
            mask={null}
            style={{
              ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style
            }}
          />
        ) : (
          <Div className={"hover-scale-6"} color={`${setting.theme}-7`}>
            <TbFolder
              size={40}
              style={{
                ...(isDarkMode ? newDropShadowDarkSm : newDropShadowLightSm)
                  .style
              }}
            />
          </Div>
        )}
        <Typography
          pretendard="SB"
          size="sm"
          color="white-1"
          className="leading-tight"
        >
          {title}
        </Typography>

        <div className={docsWorkspaceStyles.listMeta}>
          <Typography size="xs" color="cool-gray-8">
            {type === "documents" && (
              <>{formatTime(item.updated_at)} 수정됨, </>
            )}
            생성일 : {formatTime(item.created_at)}
          </Typography>
        </div>
      </div>
    );
  };

  const renderGrid = (item, type, title, isDragOver) => {
    const isDocument = type === "documents";

    if (isDocument) {
      return (
        <div className={docsWorkspaceStyles.documentGridItem}>
          <Image
            className="hover-shadow-4 transition-shadow duration-200"
            src={item.thumbnail || "/logo/document-empty.png"}
            alt={item.title}
            width={120}
            shape="rounded"
            height={152}
            preview={false}
            mask={null}
            style={{
              ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style
            }}
          />
          <Typography
            pretendard="SB"
            size="sm"
            color="white-1"
            className="line-clamp-2 leading-tight"
          >
            {title}
          </Typography>
          <Typography size="xs" color="cool-gray-7">
            {formatTime(item.updated_at)}
          </Typography>
        </div>
      );
    }

    return (
      <div className={docsWorkspaceStyles.folderGridItem}>
        <Div color={`${setting.theme}-7`} className="hover-scale-6 shrink-0">
          <TbFolder
            size={58}
            style={{
              ...(isDarkMode ? newDropShadowDarkSm : newDropShadowLightSm).style
            }}
          />
        </Div>
        <div className="flex min-w-0 flex-col gap-1">
          <Typography
            pretendard="SB"
            size="sm"
            color="white-1"
            className="truncate leading-tight"
          >
            {title}
          </Typography>
          <Typography size="xs" color="cool-gray-7">
            폴더
          </Typography>
        </div>
      </div>
    );
  };

  const renderContentList = (items, type) => {
    const allItems = getAllItems();

    return (
      <div
        className={
          viewMode === "list"
            ? "flex w-full flex-col items-start gap-2"
            : type === "folders"
              ? "grid w-full grid-cols-[repeat(auto-fill,200px)] justify-start gap-4"
              : "grid w-full grid-cols-[repeat(auto-fill,130px)] justify-start gap-4"
        }
      >
        {items?.map((item) => {
          const isDragged = dragDrop.draggedItem?._id === item._id;
          const isDragOver = dragDrop.dragOverItem?._id === item._id;
          const isSelected = selection.isItemSelected(item._id);
          const title = item.title;

          return (
            <div
              key={item._id}
              data-item-id={item._id}
              draggable
              onDragStart={(e) => dragDrop.handleDragStart(e, item)}
              onDragEnd={dragDrop.handleDragEnd}
              onDragOver={(e) => dragDrop.handleDragOver(e, item)}
              onDragLeave={dragDrop.handleDragLeave}
              onDrop={(e) => dragDrop.handleDrop(e, item)}
              // 1. 터치 이벤트 추가
              onTouchStart={(e) => {
                if (layoutMode === "mobile") handleTouchStart(e, item);
              }}
              onTouchMove={handleTouchEndOrMove} // 스크롤 시 타이머 취소
              onTouchEnd={handleTouchEndOrMove} // 손 떼면 타이머 취소
              // 2. onClick 방어 로직 추가
              onClick={(e) => {
                // 롱프레스가 트리거되었다면 라우팅/선택 동작 무시
                if (isLongPressTriggered.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  isLongPressTriggered.current = false; // 플래그 초기화
                  return;
                }

                selection.handleItemClick(e, item, allItems);
                if (layoutMode === "mobile") {
                  if (type === "folders") {
                    handleOpenFolder(item._id);
                  } else {
                    router.push(`/docs/${item._id}`);
                  }
                }
              }}
              // 3. onContextMenu는 데스크톱에서만 작동하도록 방어
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();

                // 모바일 환경에서는 onTouchStart의 setTimeout이 이 역할을 대신함
                if (layoutMode === "mobile" || modalsOpen) return;

                if (!selection.isItemSelected(item._id)) {
                  selection.setSelectedItems([item]);
                }
                actions.setSelectedItem(item);
                setContextMenu({
                  visible: true,
                  x: e.clientX,
                  y: e.clientY
                });
              }}
              onDoubleClick={
                layoutMode !== "mobile"
                  ? () => {
                      if (type === "folders") {
                        handleOpenFolder(item._id);
                      } else {
                        router.push(`/docs/${item._id}`);
                      }
                    }
                  : undefined
              }
              className={`group cursor-pointer w-full rounded-lg transition-all duration-200 hover:-translate-y-1 ${
                type === "folders" ? "hover-shadow-4" : ""
              } ${isDragged ? "opacity-50" : ""}`}
              style={{
                outline: (() => {
                  const themeScale =
                    currentColors?.[setting?.theme] || currentColors.cerulean;
                  return isDragged
                    ? `2px solid ${themeScale[5]}`
                    : isSelected
                      ? `2px solid ${themeScale[6]}`
                      : isDragOver
                        ? `2px solid ${themeScale[4]}`
                        : "none";
                })(),
                outlineOffset: "2px",
                boxShadow: isSelected && isDarkMode
                  ? `0 0 16px color-mix(in srgb, ${currentColors?.[setting?.theme]?.[5] || currentColors.cerulean[5]} 40%, transparent)`
                  : "none",
                background: (() => {
                  const themeScale =
                    currentColors?.[setting?.theme] || currentColors.cerulean;

                  if (isDarkMode) {
                    return isDragged || isSelected
                      ? `color-mix(in srgb, ${themeScale[5]} 15%, transparent)`
                      : isDragOver
                        ? `color-mix(in srgb, ${themeScale[5]} 8%, transparent)`
                        : "transparent";
                  }

                  return isDragged
                    ? `${themeScale[2]}`
                    : isSelected
                      ? `${themeScale[2]}`
                      : isDragOver
                        ? `${themeScale[1]}`
                        : "transparent";
                })()
              }}
            >
              {viewMode === "list"
                ? renderList(item, type, title, isDragOver)
                : renderGrid(item, type, title, isDragOver)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={docsWorkspaceStyles.page}
      onContextMenu={handleContextMenu}
      onClick={handleClickOutside}
      onMouseDown={selection.handleSelectionStart}
      onMouseMove={selection.handleSelectionMove}
      onMouseUp={selection.handleSelectionEnd}
      onMouseLeave={selection.handleSelectionEnd}
      style={{
        minHeight: "100%",
        position: "relative",
        userSelect: selection.isSelecting ? "none" : "auto"
      }}
    >
      {/* Selection Box */}
      <div style={selection.getSelectionBoxStyle()} />
      <div
        className={cx(
          docsWorkspaceStyles.header,
          layoutMode === "mobile" && docsWorkspaceStyles.headerStack
        )}
      >
        <div className={docsWorkspaceStyles.headerPath}>
          {currentPath.length > 0 && (
            <Div
              onClick={handleGoBack}
              className={cx(
                docsWorkspaceStyles.breadcrumbItem,
                "cursor-pointer"
              )}
              color="cool-gray-8"
            >
              <TriangleLeft size={20} />
            </Div>
          )}
          <div className={docsWorkspaceStyles.breadcrumb}>
            <Div
              className={currentPath.length > 0 && "cursor-pointer"}
              onClick={
                currentPath.length > 0
                  ? () => handleBreadcrumbClick(-1)
                  : undefined
              }
            >
              <Typography
                color={currentPath.length > 0 ? "cool-gray-7" : "white-1"}
                pretendard={currentPath.length === 0 && "SB"}
              >
                홈
              </Typography>
            </Div>
            {currentPath.map((folder, index) => {
              const isCurrent = index === currentPath.length - 1;
              return (
                <div
                  key={folder.id}
                  className={docsWorkspaceStyles.breadcrumbItem}
                >
                  <Typography color="cool-gray-4">/</Typography>
                  <Div
                    className={!isCurrent && "cursor-pointer"}
                    onClick={
                      !isCurrent
                        ? () => handleBreadcrumbClick(index)
                        : undefined
                    }
                  >
                    <Typography
                      color={!isCurrent ? "cool-gray-7" : "white-1"}
                      pretendard={isCurrent && "SB"}
                    >
                      {folder.title}
                    </Typography>
                  </Div>
                </div>
              );
            })}
          </div>
        </div>
        <div className={docsWorkspaceStyles.toolbar}>
          <Button
            icon={<PiFilePlus size={16} />}
            size="sm"
            border={false}
            background={`${setting.theme}-7`}
            color={`${setting.theme}-1`}
            onClick={() => actions.handleCreateContent("documents")}
          >
            <Typography size="sm" pretendard="SB">
              새 문서
            </Typography>
          </Button>
          <Button
            icon={<PiFolderPlus size={16} />}
            size="sm"
            border={false}
            colorType="text"
            color={`${setting.theme}-7`}
            onClick={() => actions.handleCreateContent("folders")}
          >
            <Typography size="sm" pretendard="SB">
              새 폴더
            </Typography>
          </Button>
          <div className="inline-flex items-center">
            <Upload
              listType="none"
              onChange={(file) => actions.handleUploadFile(file, setContextMenu)}
              ext={uploadExtensions}
            >
              <Button
                icon={<PiUploadSimple size={16} />}
                size="sm"
                border={false}
                colorType="text"
                color={`${setting.theme}-7`}
              >
                <Typography size="sm" pretendard="SB">
                  가져오기
                </Typography>
              </Button>
            </Upload>
          </div>
        </div>
      </div>
      <ScrollReveal direction="top" delay={100}>
        {/* 콘텐츠 목록 */}
        {listLoading ? (
          <LoadingAnimation />
        ) : !hasWorkspaceItems ? (
          <WorkspaceStarter
            isFirstWorkspace={currentPath.length === 0}
            theme={setting.theme}
            uploadExtensions={uploadExtensions}
            onCreateDocument={() =>
              actions.handleCreateDocument(
                { title: "새 문서" },
                { openAfterCreate: true }
              )
            }
            onUploadFile={(file) =>
              actions.handleUploadFile(file, setContextMenu)
            }
          />
        ) : (
          <ScrollReveal direction="bottom" delay={50}>
            <div className={docsWorkspaceStyles.contentList}>
              {folders.length > 0 && (
                <section className={docsWorkspaceStyles.section}>
                  <div className={docsWorkspaceStyles.sectionHeader}>
                    <Typography pretendard="SB" color="white-1">
                      폴더 ({folders.length})
                    </Typography>
                  </div>
                  {renderContentList(folders, "folders")}
                </section>
              )}
              {documents.length > 0 && (
                <section className={docsWorkspaceStyles.section}>
                  <div className={docsWorkspaceStyles.sectionHeader}>
                    <Typography pretendard="SB" color="white-1">
                      문서 ({documents.length})
                    </Typography>
                  </div>
                  {renderContentList(documents, "documents")}
                </section>
              )}
            </div>
          </ScrollReveal>
        )}

        {/* 삭제 모달 */}
        <DeleteModal
          modalOpen={actions.deleteModalOpen}
          setModalOpen={actions.setDeleteModalOpen}
          deleteInput={actions.deleteInput}
          setDeleteInput={actions.setDeleteInput}
          handleDeleteContent={() => {
            if (actions.selectedItem) {
              actions.handleDelete(
                actions.selectedItem.content_type,
                actions.selectedItem._id,
                selection.clearSelection
              );
            }
          }}
          handleDeleteMultiple={() =>
            actions.handleDeleteMultiple(
              selection.selectedItems,
              selection.clearSelection
            )
          }
          selectedItem={actions.selectedItem}
          selectedItems={selection.selectedItems}
          onDelete={actions.onDelete}
          isDarkMode={isDarkMode}
        />

        {/* 이름 변경 모달 */}
        <RenameModal
          modalOpen={actions.renameModalOpen}
          setModalOpen={actions.setRenameModalOpen}
          selectedItem={actions.selectedItem}
          handleRenameContent={actions.handleRename}
          isDarkMode={isDarkMode}
        />

        {/* 폴더 이동 모달 */}
        <MoveModal
          modalOpen={actions.moveModalOpen}
          setModalOpen={actions.setMoveModalOpen}
          selectedItem={actions.selectedItem}
          selectedItems={selection.selectedItems}
          handleMoveContent={(type, contentId, newParentId) =>
            actions.handleMoveContent(
              type,
              contentId,
              newParentId,
              selection.clearSelection
            )
          }
          handleMoveMultiple={(newParentId) =>
            actions.handleMoveMultiple(
              selection.selectedItems,
              newParentId,
              selection.clearSelection
            )
          }
          folderTree={folderTree}
          isDarkMode={isDarkMode}
        />

        {/* 컨텍스트 메뉴 */}
        {contextMenu.visible && (
          <ContextMenu
            contextMenu={contextMenu}
            setContextMenu={setContextMenu}
            selectedItem={actions.selectedItem}
            selectedItems={selection.selectedItems}
            setRenameModalOpen={actions.setRenameModalOpen}
            setMoveModalOpen={actions.setMoveModalOpen}
            setDeleteModalOpen={actions.setDeleteModalOpen}
            handleCreateContent={actions.handleCreateContent}
            handleUploadFile={(file) =>
              actions.handleUploadFile(file, setContextMenu)
            }
            isDarkMode={isDarkMode}
            layoutMode={layoutMode}
          />
        )}
      </ScrollReveal>
      {actions.onUpload && (
        <div
          className="flex items-center justify-center w-full h-full z-[100] fixed top-0 left-0"
          style={{ background: "rgba(0, 0, 0, 0.4)" }}
        >
          <LoadingComponent />
        </div>
      )}
    </div>
  );
}
