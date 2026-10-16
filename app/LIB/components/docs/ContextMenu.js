import { Menu, Upload } from "sud-ui";
import { createPortal } from "react-dom";
import { newShadowDarkMd, newShadowLightMd } from "../../constant/uiProps";
import { useState, useEffect } from "react";
import {
  contextMenuStyles,
  cx,
  floatingSurfaceStyle
} from "../../constant/uiStyles";
import {
  PiCheckSquare,
  PiFilePlus,
  PiFolderOpen,
  PiFolderPlus,
  PiPencilSimpleLine,
  PiTrash,
  PiUploadSimple
} from "react-icons/pi";

function ContextMenuLabel({ icon, title, description, danger = false }) {
  return (
    <span className={contextMenuStyles.itemLabel}>
      <span
        className={
          danger
            ? contextMenuStyles.itemIconDanger
            : contextMenuStyles.itemIcon
        }
      >
        {icon}
      </span>
      <span className={contextMenuStyles.itemText}>
        <span
          className={
            danger
              ? contextMenuStyles.itemTitleDanger
              : contextMenuStyles.itemTitle
          }
        >
          {title}
        </span>
        {description && (
          <span className={contextMenuStyles.itemDescription}>
            {description}
          </span>
        )}
      </span>
    </span>
  );
}

export default function ContextMenu({
  contextMenu,
  setContextMenu,
  selectedItem,
  selectedItems = [],
  setRenameModalOpen,
  setMoveModalOpen,
  setDeleteModalOpen,
  handleCreateContent,
  handleUploadFile,
  isDarkMode,
  layoutMode
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const multipleSelected = selectedItems.length > 1;
  const closeMenu = () => setContextMenu({ visible: false, x: 0, y: 0 });

  const selectedItemsMenu = [
    ...(multipleSelected
      ? [
          {
            key: "count",
            label: (
              <ContextMenuLabel
                icon={<PiCheckSquare size={18} />}
                title={`${selectedItems.length}개 선택됨`}
                description="선택 항목 작업"
              />
            ),
            disabled: true
          }
        ]
      : [
          {
            key: "rename",
            label: (
              <ContextMenuLabel
                icon={<PiPencilSimpleLine size={18} />}
                title="이름 변경"
                description="문서 또는 폴더 이름 수정"
              />
            ),
            onClick: () => {
              setRenameModalOpen(true);
              closeMenu();
            }
          }
        ]),
    {
      key: "move",
      label: (
        <ContextMenuLabel
          icon={<PiFolderOpen size={18} />}
          title={multipleSelected ? `${selectedItems.length}개 이동` : "폴더로 이동"}
          description="다른 폴더로 정리"
        />
      ),
      onClick: () => {
        setMoveModalOpen(true);
        closeMenu();
      }
    },
    {
      key: "delete",
      label: (
        <ContextMenuLabel
          icon={<PiTrash size={18} />}
          title={multipleSelected ? `${selectedItems.length}개 삭제` : "삭제"}
          description="선택 항목 제거"
          danger
        />
      ),
      onClick: () => {
        setDeleteModalOpen(true);
        closeMenu();
      }
    }
  ];

  const emptySpaceMenu = [
    {
      key: "new-doc",
      label: (
        <ContextMenuLabel
          icon={<PiFilePlus size={18} />}
          title="새 문서 만들기"
          description="빈 문서로 시작"
        />
      ),
      onClick: () => {
        handleCreateContent("documents");
        closeMenu();
      }
    },
    {
      key: "upload",
      label: (
        <Upload
          listType="none"
          onChange={(file) => {
            handleUploadFile(file);
          }}
          ext={["dkt", "html", "htm", "docx", "hwpx", "md", "txt"]}
        >
          <ContextMenuLabel
            icon={<PiUploadSimple size={18} />}
            title="파일 불러오기"
            description="dkt, docx, hwpx, md, txt"
          />
        </Upload>
      )
    },
    {
      key: "new-folder",
      label: (
        <ContextMenuLabel
          icon={<PiFolderPlus size={18} />}
          title="새 폴더 만들기"
          description="작업 공간 정리"
        />
      ),
      onClick: () => {
        handleCreateContent("folders");
        closeMenu();
      }
    }
  ];

  const items =
    selectedItem || multipleSelected ? selectedItemsMenu : emptySpaceMenu;

  if (layoutMode === "mobile") {
    return createPortal(
      <>
        {/* 뒷배경 딤 레이어 */}
        <div
          className={contextMenuStyles.mobileBackdrop}
          onClick={closeMenu}
        />
        {/* 바텀 시트 본체 */}
        <div
          className={contextMenuStyles.mobileSurface}
          style={floatingSurfaceStyle(isDarkMode, {
            boxShadow:
              "0 -10px 25px -5px rgba(0, 0, 0, 0.1), 0 -8px 10px -6px rgba(0, 0, 0, 0.1)"
          })}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 바텀 시트 상단 드래그 바 지시선 */}
          <div className={contextMenuStyles.mobileHandle} />

          <Menu items={items} className="w-full" />
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <div
      className={cx(contextMenuStyles.surface)}
      style={{
        left: contextMenu.x,
        top: contextMenu.y,
        ...floatingSurfaceStyle(isDarkMode),
        ...(isDarkMode ? newShadowDarkMd : newShadowLightMd).style
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Menu items={items} className="w-full" />
    </div>,
    document.body
  );
}
