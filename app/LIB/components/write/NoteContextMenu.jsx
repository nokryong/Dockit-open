import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react";
import { createRoot } from "react-dom/client";
import { Menu } from "sud-ui";
import {
  contextMenuStyles,
  cx,
  floatingSurfaceStyle
} from "../../constant/uiStyles";

const NoteMenuLabel = ({ danger = false, title }) => (
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
);

export const createNoteContextMenuItemModel = ({ kind, source }) => [
  {
    action: "convert",
    title: kind === "footnote" ? "미주로 변환" : "각주로 변환"
  },
  {
    action: "navigate",
    title: source === "reference" ? "내용으로 이동" : "참조로 이동"
  },
  {
    action: "delete",
    danger: true,
    title: kind === "footnote" ? "각주 삭제" : "미주 삭제"
  }
];

const NoteContextMenu = ({ kind, onAction, onClose, source, x, y }) => {
  const surfaceRef = useRef(null);
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
    const closeOnPointer = (event) => {
      if (!surfaceRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    document.addEventListener("pointerdown", closeOnPointer, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("pointerdown", closeOnPointer, true);
      document.removeEventListener("keydown", closeOnEscape, true);
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
