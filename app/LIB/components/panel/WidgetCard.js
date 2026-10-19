import { t as uiText, useI18n } from "../../i18n";
import { Card, Div, Menu, Typography } from "sud-ui";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useSetting } from "../../context/SettingContext";
import { usePanels } from "../../context/PanelContext";
import { newShadowDarkLg, newShadowLightLg } from "../../constant/uiProps";
import { useDarkMode } from "../../context/DarkModeContext";
import { floatingSurfaceStyle } from "../../constant/uiStyles";
import useContextMenuDismiss from "../../hook/useContextMenuDismiss";

export default function WidgetCard({
  icon,
  title,
  children,
  dragHandleProps,
  titleBtn,
  footer,
  widgetType,
}) {
  useI18n();
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
    setContextMenu({
      visible: true,
      x: Math.max(8, Math.min(e.clientX, window.innerWidth - 120)),
      y: Math.max(8, Math.min(e.clientY, window.innerHeight - 52)),
    });
  };

  useContextMenuDismiss(contextMenu.visible, () =>
    setContextMenu({ visible: false, x: 0, y: 0 }),
  );

  return (
    <>
      {contextMenu.visible &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 w-28 rounded-xl border p-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y, ...floatingSurfaceStyle(isDarkMode) }}
            onClick={(e) => e.stopPropagation()}
          >
            <Menu
              aria-label={uiText("툴킷 메뉴")}
              expandType="popover"
              className="w-full [&_button]:w-full [&_button]:px-3! [&_button]:py-1.5! [&_button]:text-sm!"
              items={[{
                key: "close",
                label: uiText("닫기"),
                onClick: () => {
                  remove(widgetType);
                  setContextMenu({ visible: false, x: 0, y: 0 });
                },
              }]}
            />
          </div>,
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
