"use client";
import { t as uiText, useI18n } from "../../i18n";

import { useEffect } from "react";
import { Typography } from "sud-ui";
import { useDarkMode } from "../../context/DarkModeContext";
import { ModalActionButton, ModalFrame } from "../common/modal/ModalPrimitives";

export default function EditorBlockDeleteModal({
  open,
  targetLabel,
  onConfirm,
  onClose
}) {
  useI18n();
  const { isDarkMode } = useDarkMode();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm?.();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, onConfirm, open]);

  return (
    <ModalFrame open={open} onClose={onClose} isDarkMode={isDarkMode}>
      <div
        className="flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <Typography size="lg">{targetLabel || uiText("블록")}{uiText("을 삭제할까요?")}</Typography>
        <div className="flex justify-end gap-2 mt-5">
          <ModalActionButton
            isDarkMode={isDarkMode}
            background="volcano"
            color="volcano-1"
            onClick={onConfirm}
            autoFocus
          >
            {uiText("삭제")}</ModalActionButton>
          <ModalActionButton
            isDarkMode={isDarkMode}
            onClick={onClose}
            color="white-1"
            background="white-10"
          >
            {uiText("취소")}</ModalActionButton>
        </div>
      </div>
    </ModalFrame>
  );
}
