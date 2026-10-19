function allowDocumentPermission({ contents, permission, requestingOrigin, details, windows, devOrigin }) {
  // 기존 복사 버튼 동작 유지
  // (사용자 권한 검사 처리기를 넣기 전에는 Electron 기본 검사가 정리된 클립보드 쓰기를 허용했음)
  if (
    !['local-fonts', 'clipboard-sanitized-write'].includes(permission) ||
    !contents ||
    contents.isDestroyed() ||
    details?.isMainFrame !== true
  )
    return false;
  if (windows.get(contents.id)?.window.webContents !== contents) return false;
  const isAppUrl = value => {
    try {
      const url = new URL(value);
      if (url.username || url.password) return false;
      return devOrigin ? url.origin === devOrigin : url.protocol === 'dockit:' && url.hostname === 'app' && !url.port;
    } catch {
      return false;
    }
  };
  return (
    isAppUrl(contents.getURL()) &&
    isAppUrl(details.requestingUrl) &&
    (requestingOrigin === undefined || isAppUrl(requestingOrigin))
  );
}

module.exports = { allowDocumentPermission };
