/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import {
  DOCUMENT_NAVIGATION_ACCEPTED_EVENT,
  DOCUMENT_NAVIGATION_REQUEST_EVENT,
  requestDocumentNavigation
} from "../../app/LIB/utils/documentNavigationGuard.js";

describe("document navigation acceptance", () => {
  it("announces an accepted destination but not a blocked or same-page request", () => {
    const accepted = vi.fn();
    const block = (event) => event.preventDefault();
    window.addEventListener(DOCUMENT_NAVIGATION_ACCEPTED_EVENT, accepted);
    window.addEventListener(DOCUMENT_NAVIGATION_REQUEST_EVENT, block);

    expect(requestDocumentNavigation("/docs/blocked")).toBe(false);
    expect(accepted).not.toHaveBeenCalled();

    window.removeEventListener(DOCUMENT_NAVIGATION_REQUEST_EVENT, block);
    expect(requestDocumentNavigation(window.location.href)).toBe(true);
    expect(accepted).not.toHaveBeenCalled();

    expect(requestDocumentNavigation("/docs/accepted")).toBe(true);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(accepted.mock.calls[0][0].detail).toEqual({
      destination: "/docs/accepted"
    });

    window.removeEventListener(DOCUMENT_NAVIGATION_ACCEPTED_EVENT, accepted);
  });
});
