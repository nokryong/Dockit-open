import { t as uiText, useI18n } from "../../i18n";
import { Input, Typography } from "sud-ui";
import { useState, useEffect } from "react";
import LoadingComponent from "../panel/commonComponent/LoadingComponent";
import { inputProps } from "../../constant/uiProps";
import { useSetting } from "../../context/SettingContext";
import {
  ModalActionButton,
  ModalFrame
} from "../common/modal/ModalPrimitives";

export default function DeleteModal({
  modalOpen,
  setModalOpen,
  deleteInput,
  setDeleteInput,
  handleDeleteContent,
  handleDeleteMultiple,
  selectedItem,
  selectedItems = [],
  onDelete,
  isDarkMode
}) {
  useI18n();
  const { setting } = useSetting();
  // 모달이 열릴 때 상태를 캡처해서 저장
  const [capturedItems, setCapturedItems] = useState([]);
  const [capturedItem, setCapturedItem] = useState(null);

  useEffect(() => {
    if (modalOpen) {
      setCapturedItems([...selectedItems]);
      setCapturedItem(selectedItem);
    }
  }, [modalOpen, selectedItems, selectedItem]);

  const isMultiple = capturedItems.length > 1;
  const confirmText = isMultiple ? uiText("삭제") : capturedItem?.title;

  return (
    <ModalFrame
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      isDarkMode={isDarkMode}
    >
      {!onDelete ? (
        <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
          <Typography pretendard="B" size="lg">
            {isMultiple
              ? uiText("{0}개 항목을 삭제하시겠습니까?", capturedItems.length)
              : uiText("정말 삭제하시겠습니까?")}
          </Typography>
          <br />
          <div className="flex flex-col">
            <Typography color={"volcano"} size="sm" pretendard="SB">
              {uiText("※ 삭제된 컨텐츠는 복구가 불가능합니다.")}{" "}
            </Typography>
            {isMultiple ? (
              <>
                <Typography size="sm" className="mt-2">
                  {uiText("선택된 항목:")}</Typography>
                <div
                  className="mt-2"
                  style={{ maxHeight: "100px", overflowY: "auto" }}
                >
                  {capturedItems.map((item, index) => (
                    <Typography key={item._id} size="xs" color="cool-gray-7">
                      {index + 1}. {item.title}
                    </Typography>
                  ))}
                </div>
                <Typography size="sm" className="mt-2.5">
                  {uiText("삭제하려면 ")}<b>{uiText("삭제")}</b>{uiText("를 입력해주세요.")}</Typography>
              </>
            ) : (
              <Typography size="sm">
                {uiText("삭제하려면 ")}<b>{capturedItem?.title}</b>{uiText("를 입력해주세요.")}</Typography>
            )}
          </div>
          <Input
            placeholder={confirmText}
            shadow="none"
            size="sm"
            style={{ width: "100%" }}
            className="mt-2.5"
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            background={`${setting.theme}-1`}
            autoFocus
            {...inputProps}
          />
          <div className="flex justify-end gap-2 mt-5">
            <ModalActionButton
              isDarkMode={isDarkMode}
              background="volcano"
              color="volcano-1"
              onClick={() => {
                if (isMultiple) {
                  handleDeleteMultiple();
                } else if (capturedItem) {
                  handleDeleteContent(
                    capturedItem.content_type,
                    capturedItem._id
                  );
                }
              }}
              disabled={deleteInput !== confirmText}
            >
              {uiText("삭제")}</ModalActionButton>
            <ModalActionButton
              isDarkMode={isDarkMode}
              onClick={() => {
                setModalOpen(false);
                setDeleteInput("");
              }}
              color="white-1"
              background="white-10"
            >
              {uiText("취소")}</ModalActionButton>
          </div>
        </div>
      ) : (
        <div>
          <LoadingComponent />
        </div>
      )}
    </ModalFrame>
  );
}
