function allowDocumentPermission({ contents, permission, requestingOrigin, details, windows, devOrigin }) {
  // Preserve the existing Copy buttons: Electron's default permission check
  // granted sanitized clipboard writes before a custom check handler was added.
  if (!['local-fonts', 'clipboard-sanitized-write'].includes(permission) || !contents || contents.isDestroyed() || details?.isMainFrame !== true) return false;
  if (windows.get(contents.id)?.window.webContents !== contents) return false;
  const isAppUrl = value => {
    try {
      const url = new URL(value);
      if (url.username || url.password) return false;
      return devOrigin ? url.origin === devOrigin : url.protocol === 'dockit:' && url.hostname === 'app' && !url.port;
    } catch { return false; }
  };
  return isAppUrl(contents.getURL()) && isAppUrl(details.requestingUrl)
    && (requestingOrigin === undefined || isAppUrl(requestingOrigin));
}

module.exports = { allowDocumentPermission };
