"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LayoutContext = createContext(null);

export function LayoutProvider({ children }) {
  // 1. 상태 변수를 더 명확하게 변경
  const [layoutMode, setLayoutMode] = useState("desktop"); // 'desktop', 'tablet', 'mobile'
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const handleResize = () => {
      const width = window.innerWidth;
      if (width > 1200) {
        setLayoutMode("desktop");
      } else if (width > 768) {
        setLayoutMode("tablet");
      } else {
        setLayoutMode("mobile");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 2. 패널을 보여줄지 최종적으로 결정하는 로직
  // 데스크톱일 때만 왼쪽 패널을 보여줌
  const showLeftPanel = layoutMode === "desktop" && isLeftPanelOpen;
  // 데스크톱 또는 태블릿일 때 오른쪽 패널을 보여줌
  const showRightPanel =
    (layoutMode === "desktop" || layoutMode === "tablet") && isRightPanelOpen;

  // 3. 외부에서 패널을 제어할 함수들
  const toggleLeftPanel = () => setIsLeftPanelOpen((prev) => !prev);
  const toggleRightPanel = () => setIsRightPanelOpen((prev) => !prev);

  const value = useMemo(
    () => ({
      layoutMode,
      showLeftPanel,
      showRightPanel,
      toggleLeftPanel,
      toggleRightPanel,
      headerHeight,
      setHeaderHeight,
      footerHeight,
      setFooterHeight,
      panelHeight,
      setPanelHeight
    }),
    [
      layoutMode,
      showLeftPanel,
      showRightPanel,
      headerHeight,
      footerHeight,
      panelHeight
    ]
  );

  // Hydration 오류 방지
  if (!mounted) {
    return null;
  }

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}

// 4. Custom Hook 이름 변경
export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
