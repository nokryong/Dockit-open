export const OPEN_DOCUMENT_TABS_STORAGE_KEY = "DOCKIT_OPEN_DOCUMENT_TABS";
export const MAX_OPEN_DOCUMENT_TABS = 10;

export const normalizeOpenTabs = (tabs) => {
  if (!Array.isArray(tabs)) return [];

  return tabs
    .filter((tab) => tab?.id)
    .map((tab) => ({
      id: tab.id,
      title: `${tab.title || "제목 없는 문서"}`,
      parentId: tab.parentId ?? null
    }))
    .slice(-MAX_OPEN_DOCUMENT_TABS);
};

export const buildDocsDocumentUrl = (tab) => {
  const folderQuery = tab?.parentId
    ? `?folder=${encodeURIComponent(tab.parentId)}`
    : "";
  return `/docs/${tab.id}${folderQuery}`;
};

export const getOpenDocumentTabs = () => {
  if (typeof window === "undefined") return [];

  try {
    const storedTabs = window.sessionStorage.getItem(
      OPEN_DOCUMENT_TABS_STORAGE_KEY
    );
    if (!storedTabs) return [];

    return normalizeOpenTabs(JSON.parse(storedTabs));
  } catch (error) {
    console.error("문서 탭 복원 실패:", error);
    return [];
  }
};
