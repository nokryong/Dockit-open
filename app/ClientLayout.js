"use client";

import { usePathname } from "@/desktop/navigation";
import { useEffect, useState } from "react";
import { ChatGPTProvider } from "./LIB/context/ChatGPTContext";
import { CodexProvider } from "./LIB/context/CodexContext";
// dnd-kit
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
// sud-ui
import { Div, SoonUIDesign } from "sud-ui";
import "sud-ui/dist/index.css";
// theme
import { darkTheme } from "./LIB/config/darkTheme";
// context
import { PanelProvider, usePanels } from "./LIB/context/PanelContext";
import { PluginProvider } from "./LIB/context/PluginContext";
import WidgetRenderer from "./LIB/components/panel/WidgetRenderer";
import { DarkModeProvider, useDarkMode } from "./LIB/context/DarkModeContext";
import { LayoutProvider } from "./LIB/context/LayoutContext";
import { UserProvider, useUser } from "./LIB/context/UserContext";
import { DocumentProvider } from "./LIB/context/DocumentContext";
import { SettingProvider, useSetting } from "./LIB/context/SettingContext";
import { EditorProvider } from "./LIB/context/EditorContext";
import { MemoProvider } from "./LIB/context/MemoContext";
import { DrawerProvider } from "./LIB/context/DrawerContext";
import { CharProvider } from "./LIB/context/CharContext";
import { LastFolderProvider } from "./LIB/context/LastFolderContext";
import { FolderTreeProvider } from "./LIB/context/FolderTreeContext";
import { InBookProvider } from "./LIB/context/InBookContext";
import { ContentProvider } from "./LIB/context/ContentContext";
import { StylePresetProvider } from "./LIB/context/StylePresetContext";
// components
import Header from "./LIB/components/clientLayout/Header";
import Content from "./LIB/components/clientLayout/Content";
import Drawers from "./LIB/components/clientLayout/Drawers";
import Footer from "./LIB/components/clientLayout/Footer";
import AppUpdateModal from "./LIB/components/updates/AppUpdateModal";


// 커스텀 훅들
import { useZoom } from "./LIB/hook/useZoom";
import { useDocumentManager } from "./LIB/hook/useDocumentManager";
import { useDragState } from "./LIB/hook/useDragState";
// constant

import { newShadowDarkSm, newShadowLightSm } from "./LIB/constant/uiProps";


function LayoutContent({ children }) {
  const isMain = usePathname() === "/";
  // 커스텀 훅들 사용
  const { document: currentDocument, isEditPage } = useDocumentManager();
  const { user, userLoading } = useUser();
  const { isDarkMode, setIsDarkMode } = useDarkMode();
  const { left, right, setLeft, setRight } = usePanels();
  const { containerRef, scale, setScale } = useZoom();
  const { setting, setSetting, settingLoading } = useSetting();

  const [isDesktop, setIsDesktop] = useState(false);

  // 드래그 상태 관리
  const {
    activeId,
    overContainerId,
    handleDragStart,
    handleDragEnd,
    handleDragOver
  } = useDragState();

  //■■■■■■■■■■■■ dnd-kit 센서 설정 ■■■■■■■■■■■■■■■■■■
  //  (PointerSensor 사용, 8px 이동 시 드래그 시작)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );
  useEffect(() => {
    if (setting?.fontFamily) {
      window.document.documentElement.style.setProperty(
        "--dockit-font",
        setting.fontFamily
      );
    }
  }, [setting.fontFamily]);

  useEffect(() => {
    const isDesktopApp =
      typeof window !== "undefined" && Boolean(window.dockitLocal?.window);
    if (isDesktopApp) {
      setIsDesktop(true);
    } else {
      setIsDesktop(false);
    }
  }, []);

  return (
    <SoonUIDesign isDarkMode={isDarkMode} darkTheme={darkTheme}>
      <Div
        className="flex flex-col w-screen overflow-hidden h-dvh"
        background={"white-10"}
        id="main-layout"
      >
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={(event) =>
            handleDragEnd(event, left, right, setLeft, setRight)
          }
          onDragOver={(event) => handleDragOver(event, left, right)}
        >
          <Div
            className={`z-10 rounded-t-none rounded-b-2xl`}
            background={isMain ? "white-10" : `${setting.theme}-1`}
            // shadow={!isMain && "sm"}
            id="header"
            {...(!isMain && (isDarkMode ? newShadowDarkSm : newShadowLightSm))}
          >
            <Header
              user={user}
              userLoading={userLoading}
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
              isEditPage={isEditPage}
              currentDocument={currentDocument}
              isDesktop={isDesktop}
            />
          </Div>
          {/*■■■■■ 본문 ■■■■■*/}
          <main className="relative z-0 flex-grow overflow-auto">
            <Content
              left={left}
              right={right}
              overContainerId={overContainerId}
              containerRef={containerRef}
              scale={scale}
              isMain={isMain}
            >
              {children}
            </Content>
          </main>
          {/* ■■■■■ 푸터 ■■■■■ */}
          {!isMain && (
            <Div
              className="app-layout-footer z-10 shadow-sm"
              background={`${setting.theme}-1`}
              border={true}
              borderColor={`${setting.theme}-2`}
            >
              <Footer scale={scale} setScale={setScale} isMain={isMain} />
            </Div>
          )}
          {/*■■■■■ 드래그 오버레이 ■■■■■*/}
          <DragOverlay>
            {activeId ? (
              <div
                className="w-full"
                style={{ width: `${setting.panelWidth}px` }}
              >
                <WidgetRenderer id={activeId} preview width={setting.panelWidth} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {/*■■■■■ 드로어 ■■■■■*/}
        <Drawers />
        <AppUpdateModal />
      </Div>
    </SoonUIDesign>
  );
}

export default function ClientLayout({ children }) {
  return (
    <UserProvider>
      <>
        <LayoutProvider>
          <SettingProvider><DarkModeProvider>
            <LastFolderProvider>
              <FolderTreeProvider>
                <ContentProvider>
                  <InBookProvider>
                    <PanelProvider>
                      <PluginProvider>
                      <DocumentProvider>
                        <>
                          <EditorProvider>
                            <MemoProvider>
                              <CharProvider>
                                <StylePresetProvider>
                                  <DrawerProvider>
                                    <>
                                      <ChatGPTProvider><CodexProvider>
                                        <LayoutContent>{children}</LayoutContent>
                                      </CodexProvider></ChatGPTProvider>
                                    </>
                                  </DrawerProvider>
                                </StylePresetProvider>
                              </CharProvider>
                            </MemoProvider>
                          </EditorProvider>
                        </>
                      </DocumentProvider>
                      </PluginProvider>
                    </PanelProvider>
                  </InBookProvider>
                </ContentProvider>
              </FolderTreeProvider>
            </LastFolderProvider>
          </DarkModeProvider></SettingProvider>
        </LayoutProvider>
      </>
    </UserProvider>
  );
}
