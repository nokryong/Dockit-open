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
      // Capture clicks even when widgets stop propagation, but let menu actions run first.
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
