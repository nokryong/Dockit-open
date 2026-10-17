export const DOCUMENT_NAVIGATION_REQUEST_EVENT =
  "dockit:document-navigation-request";
export const DOCUMENT_NAVIGATION_ACCEPTED_EVENT =
  "dockit:document-navigation-accepted";

export function requestDocumentNavigation(destination) {
  if (typeof window === "undefined") return true;
  if (window.dockitLocal?.documentWindows && /^\/docs(?:\/|\?|$)/.test(destination)) return true;

  if (typeof destination === "string") {
    try {
      const nextUrl = new URL(destination, window.location.href);
      if (
        nextUrl.origin === window.location.origin &&
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search === window.location.search
      ) {
        return true;
      }
    } catch {
      // Let the router validate malformed destinations after the guard request.
    }
  }

  const accepted = window.dispatchEvent(
    new CustomEvent(DOCUMENT_NAVIGATION_REQUEST_EVENT, {
      cancelable: true,
      detail: { destination }
    })
  );
  if (accepted) {
    window.dispatchEvent(
      new CustomEvent(DOCUMENT_NAVIGATION_ACCEPTED_EVENT, {
        detail: { destination }
      })
    );
  }
  return accepted;
}
