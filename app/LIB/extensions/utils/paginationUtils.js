export const PAGINATION_INJECTED_CLASSNAMES = [
  "tiptap-page-break-structure",
  "tiptap-page-container",
  "tiptap-list-page-break-item",
  "tiptap-table-page-break-row",
  "tiptap-final-page-filler",
  "page-content-filler",
  "page-footer-spacer",
  "page-break-boundary",
  "page-break-boundary--terminal",
  "page-gap",
  "page-header-spacer"
];

export const parsePixelValue = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isInjectedPaginationElement = (element) => {
  if (!element?.classList || typeof element.classList.contains !== "function") {
    return false;
  }

  return PAGINATION_INJECTED_CLASSNAMES.some((className) =>
    element.classList.contains(className)
  );
};

export const getHorizontalOffsetsFromRects = ({
  rect,
  referenceRect,
  rootLayoutWidth
}) => {
  const scaleX =
    rootLayoutWidth > 0 ? referenceRect.width / rootLayoutWidth : 1;
  const normalizedScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;

  return {
    extraLeft: Math.max(0, (rect.left - referenceRect.left) / normalizedScaleX),
    extraRight: Math.max(
      0,
      (referenceRect.right - rect.right) / normalizedScaleX
    )
  };
};

export const getContentAreaHeight = (pageMetrics) =>
  (pageMetrics?.pageHeightPx || 0) -
  (pageMetrics?.padding?.top || 0) -
  (pageMetrics?.padding?.bottom || 0);

export const getPageNumberJustify = (pageNumber) => {
  const alignMap = {
    left: "flex-start",
    center: "center",
    right: "flex-end"
  };

  return alignMap[pageNumber] || "center";
};

export const getPageNumberBottomOffset = (pageMetrics) =>
  Math.round((pageMetrics?.padding?.bottom || 0) / 2 - 6);

export const calculateCollapsedNodeHeight = ({
  offsetHeight,
  marginTop,
  marginBottom,
  previousMarginBottom
}) => {
  const collapsedMargin = Math.max(previousMarginBottom, marginTop);

  return offsetHeight + (collapsedMargin - previousMarginBottom) + marginBottom;
};

export const calculatePaginationLayout = (
  blockMeasurements,
  contentAreaHeight
) => {
  const pageBreaks = [];
  let currentAccumulatedHeight = 0;
  let currentPageNumber = 1;
  let previousMarginBottom = 0;

  for (const measurement of blockMeasurements) {
    const {
      pos,
      offsetHeight,
      marginTop,
      marginBottom,
      extraLeft,
      extraRight,
      kind,
      tableColSpan
    } = measurement;

    const nodeHeight = calculateCollapsedNodeHeight({
      offsetHeight,
      marginTop,
      marginBottom,
      previousMarginBottom
    });

    if (
      currentAccumulatedHeight > 0 &&
      currentAccumulatedHeight + nodeHeight > contentAreaHeight
    ) {
      const remainingSpace = contentAreaHeight - currentAccumulatedHeight;

      pageBreaks.push({
        pos,
        fillerHeight: Math.max(0, remainingSpace),
        marginLeft: -extraLeft,
        marginRight: -extraRight,
        kind,
        tableColSpan,
        footerPageNumber: currentPageNumber
      });

      currentPageNumber += 1;
      currentAccumulatedHeight = offsetHeight + marginTop + marginBottom;
    } else {
      currentAccumulatedHeight += nodeHeight;
    }

    previousMarginBottom = marginBottom;
  }

  const finalRemainingSpace = contentAreaHeight - currentAccumulatedHeight;

  return {
    pageBreaks,
    finalFillerHeight: Math.max(0, finalRemainingSpace),
    totalPages: currentPageNumber
  };
};
