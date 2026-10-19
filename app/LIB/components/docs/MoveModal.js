import { t as uiText, useI18n } from "../../i18n";
import { Card, Div, Menu, Typography } from "sud-ui";
import { useState, useEffect } from "react";
import { newShadowDarkSm, newShadowLightSm } from "../../constant/uiProps";
import { useSetting } from "../../context/SettingContext";
import { useFolderTree } from "../../context/FolderTreeContext";
import { TbFolder } from "react-icons/tb";
import {
  ModalActionButton,
  ModalFrame
} from "../common/modal/ModalPrimitives";

export default function MoveModal({
  modalOpen,
  setModalOpen,
  selectedItem,
  selectedItems = [],
  handleMoveContent,
  handleMoveMultiple,
  folderTree,
  isDarkMode
}) {
  useI18n();
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const { setting } = useSetting();
  const { fetchFolderTree } = useFolderTree();
  const isMultiple = selectedItems.length > 1;

  useEffect(() => {
    if (modalOpen) {
      setSelectedFolderId(null);
    }
  }, [modalOpen]);

  const handleSubmit = () => {
    if (isMultiple) {
      handleMoveMultiple(selectedFolderId);
      setModalOpen(false);
    } else if (selectedItem) {
      handleMoveContent(
        selectedItem.content_type,
        selectedItem._id,
        selectedFolderId // null이면 최상위로 이동
      );
      setModalOpen(false);
    }
  };

  const handleCancel = () => {
    setModalOpen(false);
    setSelectedFolderId(null);
  };

  const filterFolders = (items) =>
    items.filter((item) => item.content_type === "folders");

  const buildMenuItems = (items) => {
    const folders = filterFolders(items);
    return folders.map((folder) => {
      const childFolders = folder.children
        ? filterFolders(folder.children)
        : [];
      const title =
        folder.title.length > 15
          ? folder.title.slice(0, 15) + "..."
          : folder.title;

      return {
        key: folder._id,
        label: (
          <div className="flex items-center gap-2">
            <Div className={"hover-scale-6"} color={`apricot`}>
              <TbFolder size={25} />
            </Div>
            <Typography pretendard="SB" size="sm" color="white-1">
              {title}
            </Typography>
            {childFolders.length > 0 && (
              <Typography size="xs" color="cool-gray">
                ({childFolders.length})
              </Typography>
            )}
          </div>
        ),
        onClick: () => { setSelectedFolderId(folder._id); if (!folder.childrenLoaded) fetchFolderTree(folder._id); },
        ...(!folder.childrenLoaded
          ? { children: [{ key: `load-${folder._id}`, label: uiText("불러오는 중…") }] }
          : childFolders.length > 0
          ? { children: buildMenuItems(folder.children) }
          : {})
      };
    });
  };

  const menuItems = [
    {
      key: "home",
      label: (
        <Typography pretendard="SB" color="white-1">
          {uiText("홈")}</Typography>
      ),
      onClick: () => setSelectedFolderId(null)
    },
    ...buildMenuItems(folderTree || [])
  ];

  return (
    <ModalFrame
      open={modalOpen}
      onClose={handleCancel}
      isDarkMode={isDarkMode}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <Typography pretendard="SB" size="lg">
            {isMultiple ? uiText("{0}개 항목 이동", selectedItems.length) : uiText("폴더 이동")}
          </Typography>
          {isMultiple ? (
            <div>
              <Typography size="sm" color="cool-gray-6">
                {uiText("선택된 항목들을 이동할 폴더을 선택하세요.")}</Typography>
              <div
                className="mt-2"
                style={{ maxHeight: "60px", overflowY: "auto" }}
              >
                {selectedItems.map((item, index) => (
                  <Typography key={item._id} size="xs" color="cool-gray-7">
                    {index + 1}. {item.title}
                  </Typography>
                ))}
              </div>
            </div>
          ) : (
            <Typography size="sm" color="cool-gray-6">
              &quot;{selectedItem?.title}{uiText("\"을(를) 이동할 폴더를 선택하세요.")}</Typography>
          )}
        </div>
        <Card
          className="flex-1 overflow-y-auto"
          width={"100%"}
          shadow="none"
          border={false}
          size={"sm"}
          style={{
            ...(isDarkMode ? newShadowDarkSm : newShadowLightSm).style
          }}
        >
          <Menu
            items={menuItems}
            selectedKey={selectedFolderId === null ? "home" : selectedFolderId}
          />
        </Card>

        <div className="flex justify-end gap-2 mt-5">
          <ModalActionButton
            isDarkMode={isDarkMode}
            background={setting.theme}
            color={`${setting.theme}-1`}
            onClick={handleSubmit}
            disabled={selectedFolderId === undefined}
          >
            {uiText("이동")}</ModalActionButton>
          <ModalActionButton
            isDarkMode={isDarkMode}
            onClick={handleCancel}
            color="white-1"
            background="white-10"
          >
            {uiText("취소")}</ModalActionButton>
        </div>
      </div>
    </ModalFrame>
  );
}
