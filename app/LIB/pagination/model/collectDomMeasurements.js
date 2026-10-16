import {
  getHorizontalOffsetsFromRects,
  isInjectedPaginationElement,
  parsePixelValue
} from "../../extensions/utils/paginationUtils";

const LIST_NODE_NAMES = new Set(["bulletList", "orderedList", "taskList"]);
const ORDERED_LIST_NODE_NAME = "orderedList";
const BULLET_LIST_NODE_NAME = "bulletList";
const TASK_LIST_NODE_NAME = "taskList";
const INLINE_TAG_SELECTOR = 'span[data-inline-tag="true"]';

const getRenderableChildren = (dom) =>
  Array.from(dom.children).filter(
    (child) =>
      child instanceof HTMLElement && !isInjectedPaginationElement(child)
  );

const isInsideInjectedPagination = (node) => {
  let currentElement =
    node instanceof HTMLElement ? node : node?.parentElement || null;

  while (currentElement instanceof HTMLElement) {
    if (
      currentElement.classList.contains("ProseMirror-widget") ||
      isInjectedPaginationElement(currentElement)
    ) {
      return true;
    }

    currentElement = currentElement.parentElement;
  }

  return false;
};

const getHorizontalOffsets = (view, dom, referenceRect) => {
  const rect = dom.getBoundingClientRect();
  const rootLayoutWidth =
    view.dom instanceof HTMLElement
      ? view.dom.offsetWidth || view.dom.clientWidth || 0
      : 0;

  return getHorizontalOffsetsFromRects({
    rect,
    referenceRect,
    rootLayoutWidth
  });
};

const normalizePseudoMarkerContent = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();

  if (
    !trimmedValue ||
    trimmedValue === "none" ||
    trimmedValue === "normal"
  ) {
    return "";
  }

  const unquotedValue = trimmedValue.replace(/^['"]|['"]$/g, "");

  return unquotedValue.replace(/\\a/gi, " ").trim();
};

const resolveListType = ({ listNode, listDom }) => {
  if (listNode?.type?.name === ORDERED_LIST_NODE_NAME) {
    return "ordered";
  }

  if (listNode?.type?.name === TASK_LIST_NODE_NAME) {
    return "task";
  }

  if (
    listDom instanceof HTMLElement &&
    listDom.getAttribute("data-type") === "taskList"
  ) {
    return "task";
  }

  if (listDom instanceof HTMLOListElement) {
    return "ordered";
  }

  return "bullet";
};

const resolveOrderedListStart = ({ listNode, listDom }) => {
  const nodeStart = Number(listNode?.attrs?.start);

  if (Number.isFinite(nodeStart) && nodeStart > 0) {
    return nodeStart;
  }

  if (listDom instanceof HTMLOListElement) {
    const domStart = Number(listDom.getAttribute("start") || listDom.start);

    if (Number.isFinite(domStart) && domStart > 0) {
      return domStart;
    }
  }

  return 1;
};

const resolveTaskListMarkerState = (listItemDom) =>
  listItemDom instanceof HTMLElement &&
  listItemDom.getAttribute("data-checked") === "true";

const resolveTaskMarkerGutterWidth = (listItemDom) => {
  if (!(listItemDom instanceof HTMLElement)) {
    return 18;
  }

  const labelElement = listItemDom.querySelector(":scope > label");

  if (!(labelElement instanceof HTMLElement)) {
    return 18;
  }

  const labelRect = labelElement.getBoundingClientRect();
  const labelStyles = window.getComputedStyle(labelElement);

  return Math.max(
    18,
    labelRect.width + parsePixelValue(labelStyles.marginRight)
  );
};

const resolveListMarkerText = ({
  listType,
  listItemDom,
  listItemOrdinal
}) => {
  if (listType === "task") {
    return resolveTaskListMarkerState(listItemDom) ? "☑" : "☐";
  }

  if (listItemDom instanceof HTMLElement) {
    const pseudoContent = normalizePseudoMarkerContent(
      window.getComputedStyle(listItemDom, "::before").content
    );

    if (pseudoContent) {
      return pseudoContent;
    }
  }

  if (listType === "ordered" && Number.isFinite(listItemOrdinal)) {
    return `${listItemOrdinal}.`;
  }

  return "•";
};

const pushMeasurement = (measurements, measurement) => {
  const { dom } = measurement;

  if (!(dom instanceof HTMLElement)) {
    return;
  }

  measurements.push({
    ...measurement,
    offsetHeight: measurement.offsetHeight ?? dom.offsetHeight,
    renderWidth:
      measurement.renderWidth ??
      dom.getBoundingClientRect?.().width ??
      dom.offsetWidth ??
      0
  });
};

const collectDefaultBlockMeasurement = ({
  measurements,
  view,
  blockContext,
  pos,
  dom,
  rootRect
}) => {
  if (!(dom instanceof HTMLElement)) {
    return;
  }

  const styles = window.getComputedStyle(dom);
  const { extraLeft, extraRight } = getHorizontalOffsets(view, dom, rootRect);

  pushMeasurement(measurements, {
    pos,
    blockPos: blockContext.pos,
    blockType: blockContext.type,
    dom,
    renderWidth: dom.getBoundingClientRect().width,
    marginTop: parsePixelValue(styles.marginTop),
    marginBottom: parsePixelValue(styles.marginBottom),
    extraLeft,
    extraRight,
    kind: "block"
  });
};

const getNestedListElements = (listItemDom) => {
  if (!(listItemDom instanceof HTMLElement)) {
    return [];
  }

  return Array.from(
    listItemDom.querySelectorAll(
      ":scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol"
    )
  ).filter(
    (child) =>
      child instanceof HTMLElement && !isInjectedPaginationElement(child)
  );
};

const isWithinExcludedSubtree = (node, excludedElements = []) =>
  excludedElements.some((element) => element?.contains(node));

export const mergeTextRectFragmentsIntoLines = (rectFragments = []) => {
  const lineFragments = [];

  rectFragments
    .slice()
    .sort((left, right) => left.top - right.top || left.left - right.left)
    .forEach((rect) => {
      const rectHeight = Math.max(0, rect.bottom - rect.top);
      const rectLineHeight = Math.max(rect.lineHeight || 0, rectHeight);
      const rectCenter = (rect.top + rect.bottom) / 2;
      const existingLine = lineFragments.find((line) => {
        const lineHeight = Math.max(
          line.lineHeight || 0,
          line.bottom - line.top,
          rectLineHeight
        );
        const lineCenter = (line.top + line.bottom) / 2;
        const centerGap = Math.abs(lineCenter - rectCenter);

        return centerGap <= lineHeight * 0.6;
      });

      if (existingLine) {
        existingLine.top = Math.min(existingLine.top, rect.top);
        existingLine.bottom = Math.max(existingLine.bottom, rect.bottom);
        existingLine.left = Math.min(existingLine.left, rect.left);
        existingLine.right = Math.max(existingLine.right, rect.right);
        existingLine.lineHeight = Math.max(
          existingLine.lineHeight || 0,
          rect.lineHeight || 0
        );
        existingLine.fontSize = Math.max(
          existingLine.fontSize || 0,
          rect.fontSize || 0
        );
        return;
      }

      lineFragments.push({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        lineHeight: rect.lineHeight || 0,
        fontSize: rect.fontSize || 0
      });
    });

  return lineFragments.sort((a, b) => a.top - b.top || a.left - b.left);
};

const resolveElementTextNodes = (rootElement, excludedElements = []) => {
  const textNodes = [];
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  let currentTextNode = walker.nextNode();

  while (currentTextNode) {
    const textNode = currentTextNode;

    if (!isWithinExcludedSubtree(textNode, excludedElements)) {
      textNodes.push(textNode);
    }

    currentTextNode = walker.nextNode();
  }

  return textNodes;
};

const resolveTextNodePmRange = (view, textNode) => {
  const textLength = textNode?.nodeValue?.length || 0;

  if (!textNode || textLength <= 0 || typeof view?.posAtDOM !== "function") {
    return null;
  }

  try {
    const from = view.posAtDOM(textNode, 0);
    const to = view.posAtDOM(textNode, textLength);

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return null;
    }

    return {
      from: Math.min(from, to),
      to: Math.max(from, to)
    };
  } catch {
    return null;
  }
};

const resolveInlineTagElements = (rootElement, excludedElements = []) => {
  if (!(rootElement instanceof HTMLElement)) {
    return [];
  }

  const tagElements = [
    ...(rootElement.matches(INLINE_TAG_SELECTOR) ? [rootElement] : []),
    ...Array.from(rootElement.querySelectorAll(INLINE_TAG_SELECTOR))
  ];

  return tagElements.filter(
    (element) =>
      element instanceof HTMLElement &&
      !isInjectedPaginationElement(element) &&
      !isWithinExcludedSubtree(element, excludedElements)
  );
};

const createInlineTagGroup = ({
  tagElement,
  tagIndex,
  blockPos,
  view,
  excludedElements = []
}) => {
  const textNodes = resolveElementTextNodes(tagElement, excludedElements);
  const pmRanges = textNodes
    .map((textNode) => resolveTextNodePmRange(view, textNode))
    .filter(Boolean);

  if (!pmRanges.length) {
    return null;
  }

  const range = document.createRange();
  range.selectNodeContents(tagElement);

  const styles = window.getComputedStyle(tagElement);
  const rectFragments = Array.from(range.getClientRects())
    .filter((rect) => rect.height > 0 && rect.width > 0)
    .map((rect) => {
      const fontSize = parsePixelValue(styles.fontSize);

      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        lineHeight: getEffectiveLineHeight({
          styles,
          fallbackHeight: Math.max(fontSize, rect.height)
        }),
        fontSize
      };
    });

  if (typeof range.detach === "function") {
    range.detach();
  }

  const lineFragments = mergeTextRectFragmentsIntoLines(rectFragments);

  if (!lineFragments.length) {
    return null;
  }

  const startPos = Math.min(...pmRanges.map((pmRange) => pmRange.from));
  const endPos = Math.max(...pmRanges.map((pmRange) => pmRange.to));

  return {
    id: `${blockPos}:${startPos}-${endPos}:${tagIndex}`,
    startPos,
    endPos,
    textLength: textNodes.reduce(
      (sum, textNode) => sum + (textNode.nodeValue?.length || 0),
      0
    ),
    lineFragments
  };
};

const collectInlineTagGroups = ({
  rootElement,
  view,
  blockPos,
  excludedElements = []
}) =>
  resolveInlineTagElements(rootElement, excludedElements)
    .map((tagElement, tagIndex) =>
      createInlineTagGroup({
        tagElement,
        tagIndex,
        blockPos,
        view,
        excludedElements
      })
    )
    .filter(Boolean);

const areLineFragmentsAligned = (line, tagLine) => {
  const lineCenter = (line.top + line.bottom) / 2;
  const tagLineCenter = (tagLine.top + tagLine.bottom) / 2;
  const lineHeight = Math.max(
    line.lineHeight || 0,
    tagLine.lineHeight || 0,
    line.bottom - line.top,
    tagLine.bottom - tagLine.top,
    1
  );
  const hasVerticalOverlap =
    Math.abs(lineCenter - tagLineCenter) <= lineHeight * 0.65;
  const hasHorizontalOverlap =
    Math.min(line.right, tagLine.right) - Math.max(line.left, tagLine.left) > 0;

  return hasVerticalOverlap && hasHorizontalOverlap;
};

const resolveInlineTagGroupsForLine = (line, inlineTagGroups = []) =>
  inlineTagGroups
    .map((group) => {
      const inlineTagLineIndex = group.lineFragments.findIndex((tagLine) =>
        areLineFragmentsAligned(line, tagLine)
      );

      if (inlineTagLineIndex < 0) {
        return null;
      }

      return {
        inlineTagId: group.id,
        inlineTagStartPos: group.startPos,
        inlineTagEndPos: group.endPos,
        inlineTagTextLength: group.textLength,
        inlineTagLineIndex,
        inlineTagLineCount: group.lineFragments.length,
        inlineTagIsFirstLine: inlineTagLineIndex === 0,
        inlineTagIsLastLine:
          inlineTagLineIndex === group.lineFragments.length - 1
      };
    })
    .filter(Boolean);

const resolveLineFragmentsFromTextNodes = (textNodes = []) => {
  const rectFragments = [];

  textNodes.forEach((textNode) => {
    const textValue = textNode?.nodeValue || "";

    if (textValue.length === 0 || isInsideInjectedPagination(textNode)) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const textParent =
      textNode.parentElement instanceof HTMLElement
        ? textNode.parentElement
        : null;
    const textParentStyles = textParent
      ? window.getComputedStyle(textParent)
      : null;
    const fontSize = parsePixelValue(textParentStyles?.fontSize);
    const effectiveLineHeight = getEffectiveLineHeight({
      styles: textParentStyles,
      fallbackHeight: fontSize
    });

    Array.from(range.getClientRects())
      .filter((rect) => rect.height > 0)
      .forEach((rect) => {
        rectFragments.push({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          lineHeight: effectiveLineHeight,
          fontSize
        });
      });
  });

  return mergeTextRectFragmentsIntoLines(rectFragments);
};

const resolveTextNodes = ({ rootElement, excludedElements = [] }) => {
  const textNodes = [];
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  let currentTextNode = walker.nextNode();

  while (currentTextNode) {
    const textNode = currentTextNode;

    if (!isWithinExcludedSubtree(textNode, excludedElements)) {
      textNodes.push(textNode);
    }

    currentTextNode = walker.nextNode();
  }

  return textNodes;
};

const getEffectiveLineHeight = ({ styles, fallbackHeight = 0 }) => {
  const computedLineHeight = parsePixelValue(styles?.lineHeight);

  if (computedLineHeight > 0) {
    return computedLineHeight;
  }

  const computedFontSize = parsePixelValue(styles?.fontSize);

  if (computedFontSize > 0) {
    return Math.max(fallbackHeight, computedFontSize * 1.5);
  }

  return Math.max(fallbackHeight, 0);
};

export const resolveMeasuredLineSlots = ({
  rawLineFragments = [],
  containerRect = null,
  lineHeight = 0
}) => {
  if (!rawLineFragments.length) {
    return [];
  }

  const sortedLineFragments = rawLineFragments
    .slice()
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const desiredLineHeights = sortedLineFragments.map((line) =>
    Math.max(lineHeight, line.lineHeight || 0, Math.max(0, line.bottom - line.top))
  );
  const lineCenters = sortedLineFragments.map(
    (line) => (line.top + line.bottom) / 2
  );

  return sortedLineFragments.map((line, index) => {
    const center = lineCenters[index];
    const previousCenter = lineCenters[index - 1] ?? null;
    const nextCenter = lineCenters[index + 1] ?? null;
    const currentDesiredHeight = desiredLineHeights[index];
    const previousDesiredHeight = desiredLineHeights[index - 1] ?? currentDesiredHeight;
    const nextDesiredHeight = desiredLineHeights[index + 1] ?? currentDesiredHeight;
    const previousGap =
      previousCenter === null ? null : Math.abs(center - previousCenter);
    const nextGap =
      nextCenter === null ? null : Math.abs(nextCenter - center);
    const previousGapThreshold =
      Math.max(previousDesiredHeight, currentDesiredHeight) * 1.75;
    const nextGapThreshold =
      Math.max(nextDesiredHeight, currentDesiredHeight) * 1.75;
    const fallbackSlotTop = center - currentDesiredHeight / 2;
    const fallbackSlotBottom = center + currentDesiredHeight / 2;
    let slotTop =
      previousCenter === null || previousGap > previousGapThreshold
        ? fallbackSlotTop
        : (previousCenter + center) / 2;
    let slotBottom =
      nextCenter === null || nextGap > nextGapThreshold
        ? fallbackSlotBottom
        : (center + nextCenter) / 2;
    const minimumHeight = Math.max(
      currentDesiredHeight,
      line.bottom - line.top
    );

    if (!Number.isFinite(slotTop) || !Number.isFinite(slotBottom)) {
      slotTop = center - minimumHeight / 2;
      slotBottom = center + minimumHeight / 2;
    }

    if (slotBottom - slotTop < minimumHeight) {
      slotTop = center - minimumHeight / 2;
      slotBottom = center + minimumHeight / 2;
    }

    if (
      containerRect &&
      Number.isFinite(containerRect.top) &&
      Number.isFinite(containerRect.bottom)
    ) {
      // Ignore oversized container bounds created by injected pagination gaps,
      // but allow normal single-block bounds to trim minor overflow.
      slotTop = Math.max(slotTop, containerRect.top);
      slotBottom = Math.min(slotBottom, containerRect.bottom);

      if (slotBottom - slotTop < minimumHeight) {
        slotTop = center - minimumHeight / 2;
        slotBottom = center + minimumHeight / 2;
      }
    }

    return {
      ...line,
      top: slotTop,
      bottom: slotBottom
    };
  });
};

const collectParagraphMeasurements = ({
  measurements,
  view,
  blockContext,
  node,
  pos,
  dom,
  rootRect
}) => {
  if (!(dom instanceof HTMLElement)) {
    return;
  }

  const styles = window.getComputedStyle(dom);
  const { extraLeft, extraRight } = getHorizontalOffsets(view, dom, rootRect);
  const inlineTagGroups = collectInlineTagGroups({
    rootElement: dom,
    view,
    blockPos: blockContext.pos
  });
  const rawLineFragments = resolveLineFragmentsFromTextNodes(
    resolveTextNodes({ rootElement: dom })
  );
  const lineFragments = resolveMeasuredLineSlots({
    rawLineFragments,
    containerRect: dom.getBoundingClientRect(),
    lineHeight: getEffectiveLineHeight({
      styles,
      fallbackHeight: rawLineFragments[0]?.bottom
        ? rawLineFragments[0].bottom - rawLineFragments[0].top
        : 0
    })
  });

  if (!lineFragments.length) {
    collectDefaultBlockMeasurement({
      measurements,
      view,
      blockContext,
      pos,
      dom,
      rootRect
    });
    return;
  }

  const nodeStart = pos + 1;
  const nodeEnd = pos + node.nodeSize - 1;
  let minimumPos = nodeStart;

  lineFragments
    .forEach((line, index) => {
      const lineInlineTagGroups = resolveInlineTagGroupsForLine(
        line,
        inlineTagGroups
      );
      const resolvedPos = view.posAtCoords({
        left: Math.max(rootRect.left + 1, line.left + 1),
        top: line.top + Math.max(1, (line.bottom - line.top) / 2)
      })?.pos;

      const linePos = Math.max(
        minimumPos,
        Math.min(nodeEnd, resolvedPos ?? minimumPos)
      );

      pushMeasurement(measurements, {
        pos: linePos,
        blockPos: blockContext.pos,
        blockType: blockContext.type,
        dom,
        offsetHeight: Math.max(1, line.bottom - line.top),
        renderWidth: Math.max(1, line.right - line.left),
        marginTop: index === 0 ? parsePixelValue(styles.marginTop) : 0,
        marginBottom:
          index === lineFragments.length - 1
            ? parsePixelValue(styles.marginBottom)
            : 0,
        extraLeft,
        extraRight,
        kind: "textLine",
        lineIndex: index,
        lineCount: lineFragments.length,
        ...(lineInlineTagGroups.length
          ? { inlineTagGroups: lineInlineTagGroups }
          : {})
      });

      minimumPos = Math.min(nodeEnd, linePos + 1);
    });
};

const collectListItemLineMeasurements = ({
  measurements,
  view,
  blockContext,
  listNode,
  listDom,
  listDepth = 0,
  listItemNode,
  listItemPos,
  listItemIndex,
  listItemDom,
  rootRect
}) => {
  if (!(listItemDom instanceof HTMLElement)) {
    return false;
  }

  const nestedListElements = getNestedListElements(listItemDom);
  const listTextHost =
    Array.from(listItemDom.children).find(
      (child) =>
        child instanceof HTMLElement &&
        !nestedListElements.includes(child) &&
        !isInjectedPaginationElement(child)
    ) || listItemDom;
  const listType = resolveListType({
    listNode,
    listDom
  });
  const listItemOrdinal =
    listType === "ordered"
      ? resolveOrderedListStart({
          listNode,
          listDom
        }) + listItemIndex
      : null;
  const listMarkerText = resolveListMarkerText({
    listType,
    listItemDom,
    listItemOrdinal
  });
  const listItemRect = listItemDom.getBoundingClientRect();
  const textHostRect = listTextHost.getBoundingClientRect();
  const listMarkerGutterWidth =
    listType === "task"
      ? resolveTaskMarkerGutterWidth(listItemDom)
      : Math.max(18, textHostRect.left - listItemRect.left);
  const directTextNodes = resolveTextNodes({
    rootElement: listTextHost,
    excludedElements: nestedListElements
  });
  const inlineTagGroups = collectInlineTagGroups({
    rootElement: listTextHost,
    view,
    blockPos: blockContext.pos,
    excludedElements: nestedListElements
  });
  const rawLineFragments = resolveLineFragmentsFromTextNodes(directTextNodes);

  if (!rawLineFragments.length) {
    return false;
  }

  const listStyles = window.getComputedStyle(listItemDom.parentElement || listItemDom);
  const listMarginTop = parsePixelValue(listStyles.marginTop);
  const listMarginBottom = parsePixelValue(listStyles.marginBottom);
  const listOffsets = getHorizontalOffsets(view, listItemDom.parentElement || listItemDom, rootRect);
  const textHostStyles = window.getComputedStyle(listTextHost);
  const lineFragments = resolveMeasuredLineSlots({
    rawLineFragments,
    containerRect: listTextHost.getBoundingClientRect(),
    lineHeight: getEffectiveLineHeight({
      styles: textHostStyles,
      fallbackHeight: rawLineFragments[0]?.bottom
        ? rawLineFragments[0].bottom - rawLineFragments[0].top
        : 0
    })
  });
  const nodeStart = listItemPos + 1;
  const nodeEnd = listItemPos + listItemNode.nodeSize - 1;
  let minimumPos = nodeStart;

  lineFragments.forEach((line, lineIndex) => {
    const lineInlineTagGroups = resolveInlineTagGroupsForLine(
      line,
      inlineTagGroups
    );
    const resolvedPos = view.posAtCoords({
      left: Math.max(rootRect.left + 1, line.left + 1),
      top: line.top + Math.max(1, (line.bottom - line.top) / 2)
    })?.pos;
    const linePos = Math.max(
      minimumPos,
      Math.min(nodeEnd, resolvedPos ?? minimumPos)
    );

    pushMeasurement(measurements, {
      pos: linePos,
      blockPos: blockContext.pos,
      blockType: blockContext.type,
      dom: listItemDom,
      offsetHeight: Math.max(1, line.bottom - line.top),
      renderWidth: Math.max(1, line.right - line.left),
      marginTop:
        listItemIndex === 0 && lineIndex === 0 ? listMarginTop : 0,
      marginBottom:
        listItemIndex === listNode.childCount - 1 &&
        lineIndex === lineFragments.length - 1
          ? listMarginBottom
          : 0,
      extraLeft: listOffsets.extraLeft,
      extraRight: listOffsets.extraRight,
      kind: "listLine",
      listType,
      listDepth,
      listItemOrdinal,
      listMarkerText,
      listMarkerKind: listType,
      listMarkerGutterWidth,
      listItemChecked:
        listType === "task"
          ? resolveTaskListMarkerState(listItemDom)
          : null,
      listItemPos,
      listItemIndex,
      listLineIndex: lineIndex,
      listLineCount: lineFragments.length,
      listLineIsFirstOfItem: lineIndex === 0,
      listLineIsContinuation: lineIndex > 0,
      ...(lineInlineTagGroups.length
        ? { inlineTagGroups: lineInlineTagGroups }
        : {})
    });

    minimumPos = Math.min(nodeEnd, linePos + 1);
  });

  return true;
};

const createRepeatedTableHeaderMarkup = (rowElements) => {
  const headerRows = [];

  for (const rowElement of rowElements) {
    const headerCells = Array.from(rowElement.cells).filter(
      (cell) => cell.tagName === "TH"
    );

    if (!headerCells.length || headerCells.length !== rowElement.cells.length) {
      break;
    }

    headerRows.push(rowElement);
  }

  if (!headerRows.length) {
    return {
      repeatHeaderHtml: "",
      repeatHeaderHeight: 0,
      tableHeaderRowCount: 0
    };
  }

  return {
    repeatHeaderHtml: `<table class="tiptap-table-header-repeat-table"><tbody>${headerRows
      .map((row) => row.outerHTML)
      .join("")}</tbody></table>`,
    repeatHeaderHeight: headerRows.reduce(
      (sum, row) => sum + row.offsetHeight,
      0
    ),
    tableHeaderRowCount: headerRows.length
  };
};

const getTableColumnSpan = (tableElement) => {
  const rows = Array.from(
    tableElement.querySelectorAll(":scope > tbody > tr")
  ).filter((row) => !row.classList.contains("tiptap-table-page-break-row"));

  return (
    rows.reduce((maxSpan, row) => {
      const rowSpan = Array.from(row.cells).reduce(
        (sum, cell) => sum + (cell.colSpan || 1),
        0
      );

      return Math.max(maxSpan, rowSpan);
    }, 0) || 1
  );
};

const collectTableMeasurements = ({
  measurements,
  view,
  blockContext,
  node,
  pos,
  dom,
  rootRect
}) => {
  if (!(dom instanceof HTMLElement)) {
    return;
  }

  const tableElement =
    dom instanceof HTMLTableElement ? dom : dom.querySelector("table");

  if (!(tableElement instanceof HTMLTableElement)) {
    collectDefaultBlockMeasurement({
      measurements,
      view,
      blockContext,
      pos,
      dom,
      rootRect
    });
    return;
  }

  const tableStyles = window.getComputedStyle(dom);
  const tableMarginTop = parsePixelValue(tableStyles.marginTop);
  const tableMarginBottom = parsePixelValue(tableStyles.marginBottom);
  const { extraLeft, extraRight } = getHorizontalOffsets(view, dom, rootRect);
  const rowElements = Array.from(
    tableElement.querySelectorAll(":scope > tbody > tr")
  ).filter((row) => !row.classList.contains("tiptap-table-page-break-row"));
  const tableColSpan = getTableColumnSpan(tableElement);
  const repeatedHeader = createRepeatedTableHeaderMarkup(rowElements);

  blockContext.tableColSpan = tableColSpan;
  blockContext.repeatHeaderHtml = repeatedHeader.repeatHeaderHtml;
  blockContext.repeatHeaderHeight = repeatedHeader.repeatHeaderHeight;
  blockContext.tableHeaderRowCount = repeatedHeader.tableHeaderRowCount;

  let rowPos = pos + 1;
  let rowIndex = 0;

  node.forEach((rowNode) => {
    const rowDom = view.nodeDOM(rowPos) || rowElements[rowIndex];

    if (rowDom instanceof HTMLElement) {
      pushMeasurement(measurements, {
        pos: rowPos,
        blockPos: blockContext.pos,
        blockType: blockContext.type,
        dom: rowDom,
        renderWidth: rowDom.getBoundingClientRect().width,
        marginTop: rowIndex === 0 ? tableMarginTop : 0,
        marginBottom: rowIndex === node.childCount - 1 ? tableMarginBottom : 0,
        extraLeft,
        extraRight,
        kind: "tableRow",
        tableColSpan,
        tableRowIndex: rowIndex,
        tableHeaderRowCount: repeatedHeader.tableHeaderRowCount,
        repeatHeaderHtml: repeatedHeader.repeatHeaderHtml,
        repeatHeaderHeight: repeatedHeader.repeatHeaderHeight
      });
    }

    rowPos += rowNode.nodeSize;
    rowIndex += 1;
  });
};

const collectListMeasurements = ({
  measurements,
  view,
  blockContext,
  node,
  pos,
  dom,
  rootRect,
  listDepth = 0
}) => {
  if (!(dom instanceof HTMLElement)) {
    return;
  }

  const listStyles = window.getComputedStyle(dom);
  const listMarginTop = parsePixelValue(listStyles.marginTop);
  const listMarginBottom = parsePixelValue(listStyles.marginBottom);
  const listOffsets = getHorizontalOffsets(view, dom, rootRect);
  const childNodes = getRenderableChildren(dom).filter(
    (child) => child instanceof HTMLElement && child.tagName === "LI"
  );

  let childPos = pos + 1;
  let childIndex = 0;

  node.forEach((child) => {
    const childDom = view.nodeDOM(childPos) || childNodes[childIndex];

    if (childDom instanceof HTMLElement) {
      const collectedListLines = collectListItemLineMeasurements({
        measurements,
        view,
        blockContext,
        listNode: node,
        listDom: dom,
        listDepth,
        listItemNode: child,
        listItemPos: childPos,
        listItemIndex: childIndex,
        listItemDom: childDom,
        rootRect
      });
      const nestedListElements = getNestedListElements(childDom);
      const nestedListsHeight = nestedListElements.reduce(
        (sum, nestedListElement) => sum + nestedListElement.offsetHeight,
        0
      );

      if (!collectedListLines) {
        pushMeasurement(measurements, {
          pos: childPos,
          blockPos: blockContext.pos,
          blockType: blockContext.type,
          dom: childDom,
          offsetHeight: Math.max(0, childDom.offsetHeight - nestedListsHeight),
          marginTop: childIndex === 0 ? listMarginTop : 0,
          marginBottom:
            childIndex === node.childCount - 1 ? listMarginBottom : 0,
          extraLeft: listOffsets.extraLeft,
          extraRight: listOffsets.extraRight,
          kind: "listItem"
        });
      }

      let nestedListChildIndex = 0;
      let innerPos = childPos + 1;

      child.forEach((grandChild) => {
        if (!LIST_NODE_NAMES.has(grandChild.type.name)) {
          innerPos += grandChild.nodeSize;
          return;
        }

        const nestedListDom =
          nestedListElements[nestedListChildIndex] || view.nodeDOM(innerPos);

        collectMeasurementsForNode({
          measurements,
          view,
          blockContext,
          node: grandChild,
          pos: innerPos,
          dom: nestedListDom,
          rootRect,
          listDepth: listDepth + 1
        });

        nestedListChildIndex += 1;
        innerPos += grandChild.nodeSize;
      });
    }

    childPos += child.nodeSize;
    childIndex += 1;
  });
};

const collectMeasurementsForNode = ({
  measurements,
  view,
  blockContext,
  node,
  pos,
  dom,
  rootRect,
  listDepth = 0
}) => {
  if (!node?.isBlock || !(dom instanceof HTMLElement)) {
    return;
  }

  if (LIST_NODE_NAMES.has(node.type.name)) {
    collectListMeasurements({
      measurements,
      view,
      blockContext,
      node,
      pos,
      dom,
      rootRect,
      listDepth
    });
    return;
  }

  if (node.type.name === "table") {
    collectTableMeasurements({
      measurements,
      view,
      blockContext,
      node,
      pos,
      dom,
      rootRect
    });
    return;
  }

  if (node.type.name === "paragraph") {
    collectParagraphMeasurements({
      measurements,
      view,
      blockContext,
      node,
      pos,
      dom,
      rootRect
    });
    return;
  }

  collectDefaultBlockMeasurement({
    measurements,
    view,
    blockContext,
    pos,
    dom,
    rootRect
  });
};

const resolveCandidateExcludedFootnoteBodyPositions = (options) => {
  const candidate = options?.footnoteCandidate;
  const positions = candidate?.excludedBodyPositions;

  if (candidate?.status !== "ok" || !Array.isArray(positions)) {
    return new Set();
  }

  return new Set(positions.filter((pos) => Number.isSafeInteger(pos) && pos >= 0));
};

const isCandidateExcludedFootnoteBody = (node, pos, excludedPositions) =>
  excludedPositions.has(pos) &&
  node?.type?.name === "noteBody" &&
  node?.attrs?.kind === "footnote";

export const collectPaginationDomModel = (view, options = undefined) => {
  const measurements = [];
  const blocks = [];
  const rootRect = view.dom.getBoundingClientRect();
  const excludedFootnoteBodyPositions =
    resolveCandidateExcludedFootnoteBodyPositions(options);

  view.state.doc.forEach((node, pos) => {
    if (
      isCandidateExcludedFootnoteBody(
        node,
        pos,
        excludedFootnoteBodyPositions
      )
    ) {
      return;
    }

    const dom = view.nodeDOM(pos);
    const blockContext = {
      pos,
      type: node.type.name
    };

    if (dom instanceof HTMLElement) {
      collectMeasurementsForNode({
        measurements,
        view,
        blockContext,
        node,
        pos,
        dom,
        rootRect
      });
    }

    blocks.push(blockContext);
  });

  return {
    measurements,
    blocks
  };
};
