import { t as uiText, useI18n } from "../../i18n";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react";
import { createRoot } from "react-dom/client";
import { Menu } from "sud-ui";
import useContextMenuDismiss from "../../hook/useContextMenuDismiss";
import {
  contextMenuStyles,
  cx,
  floatingSurfaceStyle
} from "../../constant/uiStyles";

const NoteMenuLabel = ({ danger = false, title }) => { useI18n(); return ((
  <span className={contextMenuStyles.itemLabel}>
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
    </span>
  </span>
)); };

export const createNoteContextMenuItemModel = ({ kind, source }) => [
  {
    action: "convert",
    title: kind === "footnote" ? uiText("미주로 변환") : uiText("각주로 변환")
  },
  {
    action: "navigate",
    title: source === "reference" ? uiText("내용으로 이동") : uiText("참조로 이동")
  },
  {
    action: "delete",
    danger: true,
    title: kind === "footnote" ? uiText("각주 삭제") : uiText("미주 삭제")
  }
];

const NoteContextMenu = ({ kind, onAction, onClose, source, x, y }) => {
  useI18n();
  const surfaceRef = useRef(null);
  useContextMenuDismiss(true, onClose);
  const items = useMemo(
    () => createNoteContextMenuItemModel({ kind, source }).map((item) => ({
      key: item.action,
      label: <NoteMenuLabel danger={item.danger} title={item.title} />,
      onClick: () => {
        onAction(item.action);
        onClose();
      }
    })),
    [kind, onAction, onClose, source]
  );

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const edge = 8;
    surface.style.left = `${Math.max(edge, Math.min(x, window.innerWidth - rect.width - edge))}px`;
    surface.style.top = `${Math.max(edge, Math.min(y, window.innerHeight - rect.height - edge))}px`;
  }, [x, y]);

  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const isDarkMode = document.documentElement.classList.contains("dark");
  return (
    <div
      ref={surfaceRef}
      className={cx(contextMenuStyles.surface)}
      data-dockit-note-context-menu="true"
      style={{
        left: x,
        top: y,
        ...floatingSurfaceStyle(isDarkMode)
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Menu items={items} className="w-full" />
    </div>
  );
};

export const showNoteContextMenu = ({ kind, onAction, source, x, y }) => {
  const host = document.createElement("div");
  host.setAttribute("data-dockit-note-context-menu-host", "true");
  document.body.appendChild(host);
  const root = createRoot(host);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    queueMicrotask(() => {
      root.unmount();
      host.remove();
    });
  };
  root.render(
    <NoteContextMenu
      kind={kind}
      onAction={onAction}
      onClose={dispose}
      source={source}
      x={x}
      y={y}
    />
  );
  return dispose;
};

export default NoteContextMenu;
