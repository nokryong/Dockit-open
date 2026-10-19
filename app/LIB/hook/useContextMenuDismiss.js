import { useEffect, useRef } from "react";

export default function useContextMenuDismiss(open, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    let timer;
    const close = () => closeRef.current();
    const onClick = (event) => {
      if (event.button !== 0) return;
      // 위젯이 전파를 막아도 클릭을 잡되, 메뉴 동작이 먼저 실행되도록 처리
      clearTimeout(timer);
      timer = setTimeout(close, 0);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("contextmenu", close, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", close);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", close);
    };
  }, [open]);
}
