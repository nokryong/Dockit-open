import { Div } from "sud-ui";
import { useLayout } from "../../context/LayoutContext";
import PanelContainer from "./PanelContainer";
import { useDocument } from "../../context/DocumentContext";
import { usePathname } from "@/desktop/navigation";
import { useSetting } from "../../context/SettingContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { ConfigProvider, Splitter } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInBook } from "../../context/InBookContext";
import {
  clampDocumentPanelSizes,
  clampWorkspacePanelRight,
  getWorkspacePanelBounds
} from "../../utils/panelSizeUtils";

import {
  AiOutlineCaretLeft,
  AiOutlineCaretRight,
  AiOutlineColumnWidth
} from "react-icons/ai";

const useStyles = createStyles(({ token }, { theme, currentColors }) => ({
  dragger: {
    "&::before": {
      backgroundColor: "transparent !important",
      border: `transparent`
    },
    "&:hover::before": {
      border: `1px solid ${currentColors[theme][1]}`
    }
  },
  draggerActive: {
    "&::before": {
      border: `1px solid ${currentColors[theme][1]}`
    }
  },
  draggerIcon: {
    "&:hover": {
      color: currentColors[theme][7]
    }
  },
  collapsibleIcon: {
    fontSize: 16,
    color: token.colorTextDescription,

    "&:hover": {
      color: currentColors[theme][7]
    }
  }
}));

const DEFAULT_WORKSPACE_PANEL_RIGHT = 320;

export default function Content({
  left,
  right,
  children,
  overContainerId,
  containerRef,
  isMain,
  scale
}) {
  const { layoutMode } = useLayout();
  const { isInBook } = useInBook();
  const { setting, setSetting } = useSetting();
  const { currentColors } = useDarkMode();
  const { document } = useDocument();

  const pathname = usePathname();
  const isDocsRoute = pathname.includes("docs");
  const pathSegments = pathname.split("/").filter(Boolean);
  const isDocsWorkspaceRoute =
    pathSegments[0] === "docs" && pathSegments.length === 1;
  const usesDocumentCanvasSizing =
    isDocsRoute && !isDocsWorkspaceRoute;
  const layoutRef = useRef(null);
  const [layoutWidth, setLayoutWidth] = useState(0);

  const [panelSizes, setPanelSizes] = useState({
    left: setting.panelLeft,
    right: setting.panelRight
  });

  // 2분할(docs 목록 워크스페이스) 레이아웃 전용 우측 패널 크기 (DB 연동 안함, 기본 320px)
  const [workspacePanelRight, setWorkspacePanelRight] = useState(
    DEFAULT_WORKSPACE_PANEL_RIGHT
  );

  const effectivePanelSizes = useMemo(
    () =>
      clampDocumentPanelSizes(
        panelSizes,
        {
          left: setting.panelLeft,
          right: setting.panelRight
        },
        layoutWidth
      ),
    [layoutWidth, panelSizes, setting.panelLeft, setting.panelRight]
  );
  const effectiveWorkspacePanelRight = useMemo(
    () =>
      clampWorkspacePanelRight(
        workspacePanelRight,
        DEFAULT_WORKSPACE_PANEL_RIGHT,
        layoutWidth
      ),
    [layoutWidth, workspacePanelRight]
  );
  const workspacePanelBounds = useMemo(
    () => getWorkspacePanelBounds(layoutWidth),
    [layoutWidth]
  );

  const leftPanelCollapsed = Math.abs(effectivePanelSizes.left) < 1;
  const rightPanelCollapsed = Math.abs(effectivePanelSizes.right) < 1;

  const { styles } = useStyles({ theme: setting.theme, currentColors });

  const [leftPanel, setLeftPanel] = useState(left);
  const [rightPanel, setRightPanel] = useState(right);

  useEffect(() => {
    if (isDocsWorkspaceRoute) {
      setLeftPanel([]);
      setRightPanel(["searchDoc"]);
    } else if (isDocsRoute) {
      if (document) {
        setLeftPanel(left);
        setRightPanel(right);
      } else if (isInBook) {
        setLeftPanel([""]);
        setRightPanel([""]);
      } else {
        setLeftPanel([]);
        setRightPanel(["searchDoc"]);
      }
    } else {
      setLeftPanel([]);
      setRightPanel([]);
    }
  }, [
    left,
    right,
    isDocsRoute,
    isDocsWorkspaceRoute,
    isInBook,
    document
  ]);

  useEffect(() => {
    setPanelSizes((prev) => {
      if (
        prev.left === setting.panelLeft &&
        prev.right === setting.panelRight
      ) {
        return prev;
      }

      return {
        left: setting.panelLeft,
        right: setting.panelRight
      };
    });
  }, [setting.panelLeft, setting.panelRight]);

  useEffect(() => {
    const element = layoutRef.current;
    if (!element) {
      setLayoutWidth(0);
      return;
    }

    const updateLayoutWidth = () => {
      setLayoutWidth(element.getBoundingClientRect().width || 0);
    };

    updateLayoutWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLayoutWidth);
      return () => window.removeEventListener("resize", updateLayoutWidth);
    }

    const observer = new ResizeObserver(updateLayoutWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, [isDocsWorkspaceRoute, layoutMode]);

  const syncPanelSizes = (sizes) => {
    const nextLeft = parseFloat(sizes?.[0]);
    const nextRight = parseFloat(sizes?.[2]);
    const nextSizes = clampDocumentPanelSizes(
      {
        left: Number.isFinite(nextLeft) ? nextLeft : setting.panelLeft,
        right: Number.isFinite(nextRight) ? nextRight : setting.panelRight
      },
      {
        left: setting.panelLeft,
        right: setting.panelRight
      },
      layoutWidth
    );

    setPanelSizes((prev) => {
      if (prev.left === nextSizes.left && prev.right === nextSizes.right) {
        return prev;
      }

      return nextSizes;
    });

    return nextSizes;
  };

  const syncWorkspacePanelSizes = (sizes) => {
    const nextRight = parseFloat(sizes?.[1]);
    const parsed = clampWorkspacePanelRight(
      Number.isFinite(nextRight) ? nextRight : DEFAULT_WORKSPACE_PANEL_RIGHT,
      DEFAULT_WORKSPACE_PANEL_RIGHT,
      layoutWidth
    );
    setWorkspacePanelRight(parsed);
    return parsed;
  };

  if (isMain) {
    return children;
  }

  if (layoutMode === "mobile") {
    return (
      <div
        ref={containerRef}
        className="overflow-x-scroll overflow-y-scroll h-full w-full"
      >
        <div
          className="zoom-container"
          style={{
            transform: usesDocumentCanvasSizing
              ? `scale(${scale})`
              : undefined,
            transformOrigin: "top center",
            width: usesDocumentCanvasSizing ? "max-content" : "100%",
            minWidth: "100%",
            height: "100%",
            minHeight: "100%"
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (isDocsWorkspaceRoute) {
    return (
      <Div ref={layoutRef} className="flex w-full h-full" background={`white-10`}>
        <ConfigProvider
          theme={{
            components: {
              Splitter: { splitBarSize: 1, splitTriggerSize: 16 }
            }
          }}
        >
          <Splitter
            onResize={(sizes) => {
              syncWorkspacePanelSizes(sizes);
            }}
            onResizeEnd={(sizes) => {
              syncWorkspacePanelSizes(sizes);
            }}
            classNames={{
              dragger: {
                default: styles.dragger,
                active: styles.draggerActive
              }
            }}
            style={{ width: "100%" }}
            draggerIcon={
              <AiOutlineColumnWidth className={styles.draggerIcon} />
            }
            collapsibleIcon={{
              start: <AiOutlineCaretLeft className={styles.collapsibleIcon} />,
              end: <AiOutlineCaretRight className={styles.collapsibleIcon} />
            }}
            onCollapse={(_, sizes) => {
              syncWorkspacePanelSizes(sizes);
            }}
          >
            <Splitter.Panel min="55%" style={{ overflow: "auto" }}>
              <div
                ref={containerRef}
                className="overflow-x-scroll overflow-y-scroll h-full w-full"
              >
                <div
                  className="zoom-container"
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top center",
                    width: "100%",
                    height: "100%",
                    minHeight: "100%"
                  }}
                >
                  {children}
                </div>
              </div>
            </Splitter.Panel>

            <Splitter.Panel
              collapsible={{
                start: true,
                end: true,
                showCollapsibleIcon: "auto"
              }}
              size={effectiveWorkspacePanelRight}
              min={workspacePanelBounds.min}
              max={workspacePanelBounds.max}
              style={{ overflowX: "hidden" }}
              className="dockit-panel"
            >
              <PanelContainer
                side="right"
                widgets={rightPanel}
                layoutMode={layoutMode}
                isDropTarget={overContainerId === "right"}
                variant="workspace-sidebar"
              />
            </Splitter.Panel>
          </Splitter>
        </ConfigProvider>
      </Div>
    );
  }

  return (
    <Div ref={layoutRef} className="flex w-full h-full" background={`white-9`}>
      <ConfigProvider
        theme={{
          components: {
            Splitter: { splitBarSize: 1, splitTriggerSize: 16 }
          }
        }}
      >
        <Splitter
          onResize={(sizes) => {
            syncPanelSizes(sizes);
          }}
          onResizeEnd={(sizes) => {
            const nextSizes = syncPanelSizes(sizes);
            setSetting((prev) => ({
              ...prev,
              panelLeft: nextSizes.left,
              panelRight: nextSizes.right
            }));
          }}
          classNames={{
            dragger: {
              default: styles.dragger,
              active: styles.draggerActive
            }
          }}
          style={{ width: "100%" }}
          draggerIcon={<AiOutlineColumnWidth className={styles.draggerIcon} />}
          collapsibleIcon={{
            start: <AiOutlineCaretLeft className={styles.collapsibleIcon} />,
            end: <AiOutlineCaretRight className={styles.collapsibleIcon} />
          }}
          onCollapse={(_, sizes) => {
            const nextSizes = syncPanelSizes(sizes);
            setSetting((prev) => ({
              ...prev,
              panelLeft: nextSizes.left,
              panelRight: nextSizes.right
            }));
          }}
        >
          <Splitter.Panel
            collapsible={{
              start: true,
              end: true,
              showCollapsibleIcon: "auto"
            }}
            size={effectivePanelSizes.left}
            max={rightPanelCollapsed ? "50%" : "25%"}
            style={{ overflowX: "hidden" }}
            className="dockit-panel"
          >
            <PanelContainer
              side="left"
              widgets={leftPanel}
              layoutMode={layoutMode}
              isDropTarget={overContainerId === "left"}
            />
          </Splitter.Panel>

          <Splitter.Panel
            collapsible={{
              start: true,
              end: true,
              showCollapsibleIcon: "auto"
            }}
            min="50%"
            style={{ overflow: "auto" }}
          >
            <div
              ref={containerRef}
              className="overflow-x-scroll overflow-y-scroll h-full w-full"
            >
              <div
                className="zoom-container"
                style={{
                  transform: isDocsRoute ? `scale(${scale})` : undefined,
                  transformOrigin: "top center",
                  width: "100%",
                  height: "100%",
                  minHeight: "100%"
                }}
              >
                {children}
              </div>
            </div>
          </Splitter.Panel>

          <Splitter.Panel
            collapsible={{
              start: true,
              end: true,
              showCollapsibleIcon: "auto"
            }}
            size={effectivePanelSizes.right}
            max={leftPanelCollapsed ? "50%" : "25%"}
            style={{ overflowX: "hidden" }}
            className="dockit-panel"
          >
            <PanelContainer
              side="right"
              widgets={rightPanel}
              layoutMode={layoutMode}
              isDropTarget={overContainerId === "right"}
            />
          </Splitter.Panel>
        </Splitter>
      </ConfigProvider>
    </Div>
  );
}
