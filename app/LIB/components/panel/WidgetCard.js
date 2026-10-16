import { Card, Div, Typography } from "sud-ui";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSetting } from "../../context/SettingContext";
import { usePanels } from "../../context/PanelContext";
import { newShadowDarkLg, newShadowLightLg } from "../../constant/uiProps";
import { useDarkMode } from "../../context/DarkModeContext";

export default function WidgetCard({
  icon,
  title,
  children,
  dragHandleProps,
  titleBtn,
  footer,
  widgetType,
}) {
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const { remove } = usePanels();
  const Icon = icon;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setIsCollapsed(!isCollapsed);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!contextMenu.visible) return;
    const close = () => setContextMenu({ visible: false, x: 0, y: 0 });
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu.visible]);

  return (
    <>
      {contextMenu.visible &&
        typeof window !== "undefined" &&
        createPortal(
          <Card
            className="fixed z-50"
            size="sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => {
                remove(widgetType);
                setContextMenu({ visible: false, x: 0, y: 0 });
              }}
            >
              닫기
            </div>
          </Card>,
          document.body,
        )}
      <Card
        // className="hover-shadow-6"
        size="sm"
        width={"100%"}
        border={false}
        // shadow="md"
        footer={footer}
        {...(isDarkMode ? newShadowDarkLg : newShadowLightLg)}
        background={"white-10"}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col w-full"
          data-widget-type={widgetType}
        >
          <div
            className="flex justify-between w-full items-center cursor-move"
            {...dragHandleProps}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
          >
            <Div
              className="flex gap-2 items-center w-full"
              color={`${setting.theme}-8`}
            >
              {icon && <Icon size={20} />}
              <Typography pretendard="SB">{title}</Typography>
            </Div>
            <div
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {titleBtn && titleBtn}
            </div>
          </div>
          <div
            className={`transition-all duration-400 ease-in-out w-full`}
            style={{
              marginTop: isCollapsed ? "0px" : "10px",
              opacity: isCollapsed ? "0" : "1",
              maxHeight: isCollapsed ? "0px" : "1000px",
            }}
          >
            {children}
          </div>
        </div>
      </Card>
    </>
  );
}
