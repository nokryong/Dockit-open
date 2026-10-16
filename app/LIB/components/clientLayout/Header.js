import {
  GridFourDiaOutline,
  MenuHamburger,
  MoonOutline,
  SunOutline,
  UserOutline
} from "sud-icons";
import { Button, Div, Tooltip, Typography, toast } from "sud-ui";


import { usePathname, useRouter, useSearchParams } from "@/desktop/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdCircle,
  MdClose,
  MdCropSquare,
  MdFilterNone,
  MdMinimize
} from "react-icons/md";
import { LuLoaderCircle } from "react-icons/lu";
import TitleEditor from "../write/TitleEditor";
import { useDebounce } from "../../hook/useDebounce";
import WriteHeader from "./header/WriteHeader";
import { useSetting } from "../../context/SettingContext";
import { useDocument } from "../../context/DocumentContext";
import { useDrawer } from "../../context/DrawerContext";
import { useEditor } from "../../context/EditorContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { useInBook } from "../../context/InBookContext";
import { useLayout } from "../../context/LayoutContext";
import { DockitSymbol } from "../../constant/icons";
import { withOverlayShadow } from "../../constant/uiProps";
import { getElectronListenerCleanup } from "../../utils/electronListenerUtils";
import {
  buildDocsDocumentUrl,
  MAX_OPEN_DOCUMENT_TABS,
  normalizeOpenTabs,
  OPEN_DOCUMENT_TABS_STORAGE_KEY
} from "../../utils/openDocumentTabs";
import { requestDocumentNavigation } from "../../utils/documentNavigationGuard";

export default function Header({
  user,
  isDarkMode,
  setIsDarkMode,
  isEditPage,
  currentDocument,
  isDesktop
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const docsFolderId = searchParams.get("folder");
  const headerRef = useRef(null);
  const leftControlsRef = useRef(null);
  const rightControlsRef = useRef(null);
  const [titleSideSpace, setTitleSideSpace] = useState(0);
  const hasRestoredTabsRef = useRef(false);
  const closingTabIdRef = useRef(null);
  const titleReadyDocumentIdRef = useRef(null);

  const { setting } = useSetting();
  const { currentColors } = useDarkMode();
  const { setHeaderHeight } = useLayout();
  const { title, setTitle, isSaving, saveDocument } = useDocument();
  const { editor } = useEditor();
  const { exitBook } = useInBook();
  const { setOpenTreeDrawer, setOpenWidgetDrawer, setOpenSettingsDrawer } =
    useDrawer();
  const [openTabs, setOpenTabs] = useState([]);

  const navigateWithDraftGuard = useCallback(
    (destination) => {
      if (!requestDocumentNavigation(destination)) return false;
      router.push(destination);
      return true;
    },
    [router]
  );

  useEffect(() => {
    if (!headerRef.current) return;

    const updateHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
        setTitleSideSpace(Math.max(
          leftControlsRef.current?.offsetWidth || 0,
          rightControlsRef.current?.offsetWidth || 0
        ) + 30);
      }
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(headerRef.current);
    if (leftControlsRef.current) observer.observe(leftControlsRef.current);
    if (rightControlsRef.current) observer.observe(rightControlsRef.current);

    return () => observer.disconnect();
  }, [setHeaderHeight, isEditPage, currentDocument, editor]);

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;

    const subscription = window.dockitLocal?.window.onMaximized((isMax) =>
      setIsMaximized(isMax)
    );
    window.dockitLocal?.window.isMaximized().then(setIsMaximized);

    return getElectronListenerCleanup(subscription);
  }, [isDesktop]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedTabs = window.sessionStorage.getItem(
        OPEN_DOCUMENT_TABS_STORAGE_KEY
      );
      if (!storedTabs) return;

      setOpenTabs(normalizeOpenTabs(JSON.parse(storedTabs)));
    } catch (error) {
      console.error("문서 탭 복원 실패:", error);
    } finally {
      hasRestoredTabsRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasRestoredTabsRef.current) return;

    window.sessionStorage.setItem(
      OPEN_DOCUMENT_TABS_STORAGE_KEY,
      JSON.stringify(openTabs)
    );
  }, [openTabs]);

  useEffect(() => {
    if (!closingTabIdRef.current) return;
    if (closingTabIdRef.current !== currentDocument?._id) {
      closingTabIdRef.current = null;
    }
  }, [currentDocument?._id]);

  const debouncedTitle = useDebounce(title, setting.autoSaveDelay);

  useEffect(() => {
    if (!currentDocument?._id) {
      titleReadyDocumentIdRef.current = null;
      return;
    }

    if (title === `${currentDocument.title || ""}`) {
      titleReadyDocumentIdRef.current = currentDocument._id;
    }
  }, [currentDocument?._id, currentDocument?.title, title]);

  useEffect(() => {
    if (!currentDocument?._id) return;
    if (!setting.autoSave || titleReadyDocumentIdRef.current !== currentDocument._id) return;

    const currentPersistedTitle = `${currentDocument.title || ""}`;

    if (
      debouncedTitle === title &&
      debouncedTitle !== currentPersistedTitle
    ) {
      saveDocument(currentDocument._id, { title: debouncedTitle });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, title, setting.autoSave]);

  useEffect(() => {
    if (!isEditPage || !currentDocument?._id) return;
    if (closingTabIdRef.current === currentDocument._id) return;

    const nextTab = {
      id: currentDocument._id,
      title: `${title || currentDocument.title || "제목 없는 문서"}`,
      parentId: currentDocument.parent_id ?? null
    };

    setOpenTabs((prev) => {
      const existingIndex = prev.findIndex((tab) => tab.id === nextTab.id);

      if (existingIndex === -1) {
        if (prev.length >= MAX_OPEN_DOCUMENT_TABS) {
          const closedTabTitle = prev[0]?.title || "이전 문서";
          toast.info(`열려있는 탭이 많아 가장 오래된 탭('${closedTabTitle}')을 닫고 새 탭을 엽니다.`);
        }
        return [...prev, nextTab].slice(-MAX_OPEN_DOCUMENT_TABS);
      }

      const nextTabs = [...prev];
      nextTabs[existingIndex] = nextTab;
      return nextTabs;
    });
  }, [
    currentDocument?._id,
    currentDocument?.parent_id,
    currentDocument?.title,
    isEditPage,
    title
  ]);

  const persistCurrentDocument = async () => {
    if (!currentDocument?._id || !editor || editor.isDestroyed) return;

    const currentTitle = `${title || currentDocument.title || "제목 없는 문서"}`;
    const currentContent = editor.getHTML();
    const currentPos = editor.state.selection.anchor;
    const hasTitleChanged = currentTitle !== `${currentDocument.title || ""}`;
    const hasContentChanged =
      currentContent !== `${currentDocument.content || ""}`;

    if (!hasTitleChanged && !hasContentChanged) return;

    await saveDocument(
      currentDocument._id,
      {
        ...(hasTitleChanged ? { title: currentTitle } : {}),
        ...(hasContentChanged ? { content: currentContent } : {}),
        focus: currentPos
      },
      true
    );
  };

  const handleTabOpen = async (tab) => {
    if (!tab?.id) return;
    if (tab.id === currentDocument?._id && isEditPage) return;

    const destination = buildDocsDocumentUrl(tab);
    if (!requestDocumentNavigation(destination)) return;
    await persistCurrentDocument();
    router.push(destination);
  };

  const handleTabClose = async (event, tabId) => {
    event.preventDefault();
    event.stopPropagation();

    const isClosingCurrentTab = tabId === currentDocument?._id;
    const nextTabs = openTabs.filter((tab) => tab.id !== tabId);
    const destination =
      nextTabs.length > 0
        ? buildDocsDocumentUrl(nextTabs[nextTabs.length - 1])
        : "/docs";

    if (
      isClosingCurrentTab &&
      !requestDocumentNavigation(destination)
    ) {
      return;
    }

    if (isClosingCurrentTab) {
      closingTabIdRef.current = tabId;
    }

    setOpenTabs(nextTabs);

    if (!isClosingCurrentTab) return;

    await persistCurrentDocument();
    router.push(destination);
  };

  const leftNavItems = useMemo(() => [{
    label: "내 문서", onClick: () => { if (navigateWithDraftGuard("/docs")) exitBook(); },
    active: pathname.startsWith("/docs"), disabled: pathname === "/docs" && !docsFolderId
  }], [pathname, docsFolderId, exitBook, navigateWithDraftGuard]);

  const rightIcons = useMemo(() => {
    const icons = [
      {
        tooltip: "테마 변경",
        onClick: () => setIsDarkMode(!isDarkMode),
        icon: isDarkMode ? SunOutline : MoonOutline
      }
    ];

    if (user) {
      icons.push(
        {
          tooltip: "메뉴",
          onClick: () => setOpenTreeDrawer(true),
          icon: MenuHamburger
        },
        {
          tooltip: "툴킷 설정",
          onClick: () => setOpenWidgetDrawer(true),
          icon: GridFourDiaOutline
        },
        {
          tooltip: "설정", onClick: () => setOpenSettingsDrawer(true), icon: UserOutline
        }
      );
    }

    if (isDesktop) {
      icons.push(
        {
          tooltip: null,
          onClick: () => {},
          icon: "",
          notBtn: true
        },
        {
          tooltip: null,
          label: "창 최소화",
          onClick: () => window.dockitLocal.window.minimize(),
          icon: MdMinimize
        },
        {
          tooltip: null,
          label: isMaximized ? "창 복원" : "창 최대화",
          onClick: () => window.dockitLocal.window.maximize(),
          icon: isMaximized ? MdFilterNone : MdCropSquare
        },
        {
          tooltip: null,
          label: "창 닫기",
          onClick: () => window.dockitLocal.window.close(),
          icon: MdClose
        }
      );
    }

    return icons;
  }, [
    user,
    isDarkMode,
    isDesktop,
    isMaximized,
    setIsDarkMode,
    setOpenTreeDrawer,
    setOpenSettingsDrawer,
    setOpenWidgetDrawer
  ]);

  const renderBtn = (data, left = false, index = 0, keyValue) => {
    const Icon = data.icon;
    let placement = "bottom";

    if (left) {
      if (index === 0) {
        placement = "bottom-right";
      }
    } else if (index === rightIcons.length - 1) {
      placement = "bottom-left";
    }

    if (data.notBtn) {
      return <Div key={keyValue} className="w-[15px]" />;
    }

    if (!data.tooltip) {
      return (
        <Button
          key={keyValue}
          ariaLabel={data.label}
          className="hover-scale-8"
          colorType="text"
          size="sm"
          onClick={data.disabled ? undefined : data.onClick}
          icon={Icon && <Icon size="16" />}
          color={`${setting.theme}-8`}
        />
      );
    }

    return (
      <Tooltip
        key={keyValue}
        content={<Typography size="xs">{data.tooltip}</Typography>}
        placement={placement}
        background={`${setting.theme}-7`}
        color={`${setting.theme}-1`}
        border={false}
        arrow={false}
        style={withOverlayShadow()}
      >
        <Button
          ariaLabel={data.tooltip}
          className="hover-scale-8"
          colorType="text"
          size="sm"
          onClick={data.disabled ? undefined : data.onClick}
          icon={Icon && <Icon size="16" />}
          color={`${setting.theme}-8`}
        />
      </Tooltip>
    );
  };

  const renderNavItem = (data) => {
    const color = data.active ? themeScale[8] : currentColors.white[7];

    return (
      <button
        key={data.label}
        type="button"
        onClick={data.disabled ? undefined : data.onClick}
        disabled={data.disabled}
        className="titlebar-logo flex h-9 items-center rounded-lg border-none bg-transparent px-3 transition-all duration-200 hover:translate-y-[-1px] disabled:cursor-default"
        style={{
          color,
          opacity: data.disabled && !data.active ? 0.48 : 1,
          WebkitAppRegion: "no-drag"
        }}
      >
        <Typography
          size="sm"
          pretendard={data.active ? "SB" : "R"}
          style={{ color, letterSpacing: 0 }}
        >
          {data.label}
        </Typography>
      </button>
    );
  };

  const shouldShowTabs =
    openTabs.length > 0 && pathname.split("/")[1] === "docs";
  const themeScale = currentColors[setting.theme];
  const tabActiveSurface = themeScale[1];
  const tabInactiveSurface = themeScale[2];
  const tabLineColor = themeScale[3];
  const activeTabLineColor = themeScale[4];
  const activeTabShadow = isDarkMode
    ? "2px -4px 18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
    : "2px -4px 18px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72)";

  return (
    <Div
      className="flex flex-col overflow-x-auto overflow-y-hidden electron-titlebar"
      ref={headerRef}
    >
      <Div className="relative flex items-center justify-between px-2.5">
        <div ref={leftControlsRef} className="flex shrink-0 items-center gap-0.5">
          <Div
            className="titlebar-logo flex cursor-pointer items-center px-2.5 pr-5"
            color="mint-6"
            role="button"
            tabIndex={0}
            onClick={() => {
              if (navigateWithDraftGuard("/")) exitBook();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (navigateWithDraftGuard("/")) exitBook();
              }
            }}
            onDoubleClick={() => {
              if (isDesktop) {
                window.dockitLocal.window.maximize();
              }
            }}
          >
            <DockitSymbol size={16} />
          </Div>


        </div>

        <div
          className="absolute left-1/2 min-w-0 -translate-x-1/2"
          style={{ maxWidth: `max(0px, calc(100% - ${titleSideSpace * 2}px))` }}
        >
          {isEditPage && currentDocument && (
            <div className="relative min-w-0 tiptap-title">
              <Typography as="h1" pretendard="B" size="lg" color="white-1" className="min-w-0 text-center">
                <TitleEditor
                  className="[&_.tiptap]:truncate [&_.tiptap_p]:inline"
                  truncateAt={8}
                  value={title}
                  onChange={(newTitle) => setTitle(newTitle)}
                />
              </Typography>
              <Div
                className={`absolute left-full top-1/2 ml-2 flex -translate-y-1/2 items-center shrinkAndBlink-animation ${isSaving && "rotation-animation"}`}
                color={isSaving ? "orange" : `${setting.theme}-7`}
                style={{ textShadow: "rgba(0,0,0,0.2)" }}
              >
                {isSaving ? (
                  <LuLoaderCircle size={10} />
                ) : (
                  <MdCircle size={8} />
                )}
              </Div>
            </div>
          )}
        </div>

        <div ref={rightControlsRef} className="flex shrink-0">
          {rightIcons.map((data, index) =>
            renderBtn(
              data,
              false,
              index,
              `right-${data.tooltip || data.icon?.displayName || data.icon?.name || "spacer"}-${index}`
            )
          )}
        </div>
      </Div>

      {shouldShowTabs && (
        <Div
          className="overflow-x-auto overflow-y-hidden"
          style={{
            position: "relative",
            WebkitAppRegion: "no-drag",
            paddingTop: "14px",
            marginTop: "-9px"
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0
            }}
          />
          <div
            className="flex items-end gap-2"
            style={{ WebkitAppRegion: "no-drag" }}
          >
            {openTabs.map((tab) => {
              const isActive = isEditPage && tab.id === currentDocument?._id;
              const tabSurface = isActive
                ? tabActiveSurface
                : tabInactiveSurface;
              const tabBorderColor = isActive
                ? activeTabLineColor
                : tabLineColor;

              return (
                <div
                  key={tab.id}
                  className="shrink-0"
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "14px",
                    paddingRight: "14px",
                    zIndex: isActive ? 3 : 1,
                    transition: "margin-bottom 0.2s ease, transform 0.2s ease"
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderTopLeftRadius: "14px",
                      borderTopRightRadius: "14px",
                      borderBottomLeftRadius: "0px",
                      borderBottomRightRadius: "0px",
                      background: tabSurface,
                      transformOrigin: "bottom center",
                      opacity: isActive ? 1 : 0.92,
                      boxShadow: isActive ? activeTabShadow : "none"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleTabOpen(tab)}
                    title={tab.title}
                    className="flex items-center gap-2 bg-transparent border-none cursor-pointer"
                    style={{
                      position: "relative",
                      height: "34px",
                      paddingLeft: "10px",
                      paddingRight: "4px",
                      WebkitAppRegion: "no-drag"
                    }}
                  >
                    <Div
                      className="shrink-0"
                      color={isActive ? `${setting.theme}-7` : "cool-gray-7"}
                    >
                      <MdCircle size={7} />
                    </Div>
                    <Typography
                      size="sm"
                      pretendard="SB"
                      color={isActive ? "white-1" : "cool-gray-7"}
                      style={{
                        maxWidth: "180px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {tab.title}
                    </Typography>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => handleTabClose(event, tab.id)}
                    title={`${tab.title} 닫기`}
                    className="flex items-center justify-center bg-transparent border-none cursor-pointer"
                    style={{
                      position: "relative",
                      width: "28px",
                      height: "28px",
                      marginRight: "6px",
                      borderRadius: "999px",
                      color: isActive ? themeScale[7] : currentColors.white[7],
                      opacity: isActive ? 1 : 0.8,
                      WebkitAppRegion: "no-drag"
                    }}
                  >
                    <MdClose size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </Div>
      )}
      {isEditPage && currentDocument && <WriteHeader />}
    </Div>
  );
}
