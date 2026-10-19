export const VIEWPORT_PADDING = 16;
export const CARD_WIDTH = 280;
export const CARD_HEIGHT_ESTIMATE = 250;
export const IMAGE_HEIGHT = 148;

export const normalizePreviewUrl = ({
  href,
  locationHref,
  currentOrigin
}) => {
  try {
    const parsedUrl = new URL(href, locationHref);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return null;
    }

    if (parsedUrl.origin === currentOrigin) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
};

export const createPreviewPosition = ({
  rect,
  viewportWidth,
  viewportHeight
}) => {
  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    viewportWidth - CARD_WIDTH - VIEWPORT_PADDING
  );
  const nextLeft = Math.min(Math.max(rect.left, VIEWPORT_PADDING), maxLeft);

  const preferredTop = rect.bottom + 12;
  const fallbackTop = rect.top - CARD_HEIGHT_ESTIMATE - 12;
  const nextTop =
    preferredTop + CARD_HEIGHT_ESTIMATE + VIEWPORT_PADDING <= viewportHeight
      ? preferredTop
      : Math.max(VIEWPORT_PADDING, fallbackTop);

  return {
    left: nextLeft,
    top: nextTop
  };
};

export const createFallbackCardData = (preview) => ({
  title: preview.hostname,
  description: preview.href,
  image: null,
  siteName: preview.hostname,
  hostname: preview.hostname
});

export const createExternalLinkPreview = (
  anchorElement,
  {
    locationHref = window.location.href,
    currentOrigin = window.location.origin,
    viewportWidth = window.innerWidth,
    viewportHeight = window.innerHeight
  } = {}
) => {
  if (!anchorElement) {
    return null;
  }

  const href = anchorElement.getAttribute("href");
  const normalizedHref = href
    ? normalizePreviewUrl({
        href,
        locationHref,
        currentOrigin
      })
    : null;

  if (!href || !normalizedHref) {
    return null;
  }

  const rect = anchorElement.getBoundingClientRect();
  const hostname = (() => {
    try {
      return new URL(normalizedHref).hostname;
    } catch {
      return normalizedHref;
    }
  })();

  return {
    href: normalizedHref,
    hostname,
    ...createPreviewPosition({
      rect,
      viewportWidth,
      viewportHeight
    })
  };
};
