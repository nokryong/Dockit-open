"use client";
import { createContext, useContext, useCallback, useMemo } from "react";
import { useDataManagement } from "../hook/useDataManagement";

const PanelContext = createContext(null);
const removedWidgetIds = new Set(["aiImage", "referenceDoc", "calendar", "dice", "musicPlayer"]);

const DEFAULT_PANELS = {
  panels: {
    left: [],
    right: [],
  },
};

export function PanelProvider({ children }) {
  const {
    data, // 변수명 명확화를 위해 data 그대로 사용 (실제로는 panels 전체 객체)
    setData: setPanelsData,
    saveData: savePanels, // 수동 저장
    loading,
    isSaving,
    error,
  } = useDataManagement("panels", DEFAULT_PANELS, "dockit.panels.v1", 1000);

  // 2. 기존 코드 호환성을 위한 setLeft 어댑터
  const setLeft = useCallback(
    (action) => {
      setPanelsData((prev) => {
        // prev.panels가 없는 경우를 대비해 안전장치 추가
        const currentPanels = prev.panels || { left: [], right: [] };

        const newLeft =
          typeof action === "function"
            ? action(currentPanels.left || [])
            : action;

        return {
          ...prev,
          panels: {
            ...currentPanels,
            left: newLeft,
          },
        };
      });
    },
    [setPanelsData]
  );

  // 3. 기존 코드 호환성을 위한 setRight 어댑터
  const setRight = useCallback(
    (action) => {
      setPanelsData((prev) => {
        const currentPanels = prev.panels || { left: [], right: [] };

        const newRight =
          typeof action === "function"
            ? action(currentPanels.right || [])
            : action;

        return {
          ...prev,
          panels: {
            ...currentPanels,
            right: newRight,
          },
        };
      });
    },
    [setPanelsData]
  );

  // 4. 유틸리티 함수들
  const exists = useCallback(
    (type) => {
      if (removedWidgetIds.has(type)) return false;
      const currentLeft = data?.panels?.left || [];
      const currentRight = data?.panels?.right || [];
      return currentLeft.includes(type) || currentRight.includes(type);
    },
    [data]
  );

  const remove = useCallback(
    (type) => {
      setPanelsData((prev) => {
        const currentPanels = prev.panels || { left: [], right: [] };
        return {
          ...prev,
          panels: {
            left: (currentPanels.left || []).filter((t) => t !== type),
            right: (currentPanels.right || []).filter((t) => t !== type),
          },
        };
      });
    },
    [setPanelsData]
  );

  const toggle = useCallback(
    (type) => {
      if (removedWidgetIds.has(type)) return;
      setPanelsData((prev) => {
        const currentPanels = prev.panels || { left: [], right: [] };
        const currentLeft = currentPanels.left || [];
        const currentRight = currentPanels.right || [];

        const isExist =
          currentLeft.includes(type) || currentRight.includes(type);

        if (isExist) {
          // 제거
          return {
            ...prev,
            panels: {
              left: currentLeft.filter((t) => t !== type),
              right: currentRight.filter((t) => t !== type),
            },
          };
        } else {
          // 추가 (기본 오른쪽)
          return {
            ...prev,
            panels: {
              ...currentPanels,
              right: [...currentRight, type],
            },
          };
        }
      });
    },
    [setPanelsData]
  );

  const value = useMemo(
    () => ({
      left: (data?.panels?.left || []).filter(id => !removedWidgetIds.has(id)),
      right: (data?.panels?.right || []).filter(id => !removedWidgetIds.has(id)),
      setLeft,
      setRight,
      toggle,
      remove,
      exists,
      savePanels,
      loading,
      isSaving,
      error,
    }),
    [
      data,
      setLeft,
      setRight,
      toggle,
      remove,
      exists,
      savePanels,
      loading,
      isSaving,
      error,
    ]
  );
  return (
    <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
  );
}

export function usePanels() {
  const context = useContext(PanelContext);
  if (!context) throw new Error("usePanels must be used within a PanelProvider");
  return context;
}
