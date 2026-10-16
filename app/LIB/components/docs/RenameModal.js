import { Input, Typography } from "sud-ui";
import { useState, useEffect } from "react";
import { inputProps } from "../../constant/uiProps";
import { useSetting } from "../../context/SettingContext";
import {
  ModalActionButton,
  ModalFrame
} from "../common/modal/ModalPrimitives";

export default function RenameModal({
  modalOpen,
  setModalOpen,
  selectedItem,
  handleRenameContent,
  isDarkMode
}) {
  const { setting } = useSetting();
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (selectedItem && modalOpen) {
      setNewName(selectedItem.title || "");
    }
  }, [selectedItem, modalOpen]);

  const handleSubmit = () => {
    if (newName.trim() && selectedItem) {
      handleRenameContent(
        selectedItem.content_type,
        selectedItem._id,
        newName.trim(),
        selectedItem.revision ?? null
      );
      setModalOpen(false);
      setNewName("");
    }
  };

  const handleCancel = () => {
    setModalOpen(false);
    setNewName("");
  };

  return (
    <ModalFrame
      open={modalOpen}
      onClose={handleCancel}
      isDarkMode={isDarkMode}
    >
      <div className="flex flex-col">
        <Typography pretendard="SB" size="lg">
          이름 변경
        </Typography>
        <Typography size="sm" color="cool-gray-6" className="mt-2">
          새로운 이름을 입력해주세요.
        </Typography>
        <Input
          placeholder="이름을 입력하세요"
          shadow="none"
          size="sm"
          style={{ width: "100%" }}
          className="mt-2.5"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            }
          }}
          autoFocus
          {...inputProps}
          background={`${setting.theme}-1`}
        />
        <div className="flex justify-end gap-2 mt-5">
          <ModalActionButton
            isDarkMode={isDarkMode}
            background={setting.theme}
            color={`${setting.theme}-1`}
            onClick={handleSubmit}
            disabled={!newName.trim()}
          >
            변경
          </ModalActionButton>
          <ModalActionButton
            isDarkMode={isDarkMode}
            onClick={handleCancel}
            color="white-1"
            background="white-10"
          >
            취소
          </ModalActionButton>
        </div>
      </div>
    </ModalFrame>
  );
}
