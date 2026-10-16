const DEFAULT_NAVIGATION_TIMEOUT_MS = 10000;
const DEFAULT_NAVIGATION_POLL_INTERVAL_MS = 50;

export const navigateToCreatedDocument = ({
  documentId,
  push,
  getCurrentPathname = () => window.location.hash.slice(1).split('?')[0],
  timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_NAVIGATION_POLL_INTERVAL_MS
}) => {
  const normalizedDocumentId = `${documentId ?? ""}`.trim();
  if (!normalizedDocumentId) {
    return Promise.reject(
      new Error("생성된 문서 ID를 확인할 수 없습니다.")
    );
  }
  if (typeof push !== "function") {
    return Promise.reject(new Error("문서 이동 callback이 없습니다."));
  }

  const targetPath = `/docs/${encodeURIComponent(normalizedDocumentId)}`;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const confirmNavigation = () => {
      if (getCurrentPathname() === targetPath) {
        resolve(targetPath);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("문서 화면 이동을 확인하지 못했습니다."));
        return;
      }

      setTimeout(confirmNavigation, pollIntervalMs);
    };

    try {
      push(targetPath);
    } catch (error) {
      reject(error);
      return;
    }

    confirmNavigation();
  });
};
