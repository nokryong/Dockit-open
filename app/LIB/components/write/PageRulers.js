import { useEffect, useRef } from "react";

const PX_PER_MM = 96 / 25.4;
const RULER_GUTTER = 34;

const clampPositive = (value) => Math.max(0, Number(value) || 0);

const buildRulerTicks = (sizePx) => {
  const sizeMm = Math.max(0, Math.round(clampPositive(sizePx) / PX_PER_MM));

  return Array.from({ length: sizeMm + 1 }, (_, mm) => {
    const isMajor = mm % 10 === 0;
    const isMiddle = !isMajor && mm % 5 === 0;

    return {
      key: mm,
      offset: mm * PX_PER_MM,
      type: isMajor ? "major" : isMiddle ? "middle" : "minor",
      label: isMajor ? String(mm / 10) : null
    };
  });
};

const getActivePage = ({ activePageNumber, pageMetrics, paginationModel }) => {
  const pages = paginationModel?.pages || [];
  const matchedPage = pages.find((page) => page.pageNumber === activePageNumber);

  if (matchedPage) {
    return matchedPage;
  }

  return {
    pageNumber: 1,
    top: 0,
    width: pageMetrics.width,
    height: pageMetrics.pageHeightPx
  };
};

export default function PageRulers({
  activePageNumber = 1,
  pageMetrics,
  paginationModel
}) {
  const horizontalLayerRef = useRef(null);
  const hasPageMetrics = Boolean(pageMetrics?.width && pageMetrics?.pageHeightPx);

  useEffect(() => {
    const layer = horizontalLayerRef.current;
    if (!layer) return;

    const editor = layer.parentElement;
    const ruler = layer.firstElementChild;
    let scrollport = editor.parentElement;
    while (scrollport && !/(auto|scroll|overlay)/.test(getComputedStyle(scrollport).overflowY)) {
      scrollport = scrollport.parentElement;
    }
    if (!scrollport) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      // Sticky offsets are calculated before the canvas's zoom transform.
      // Convert the visible scrollport position back into document coordinates.
      const scale = ruler.getBoundingClientRect().height / ruler.offsetHeight;
      if (!scale) return;
      const top = scrollport.getBoundingClientRect().top + scrollport.clientTop;
      const offset = Math.max(0, (top + 4 - editor.getBoundingClientRect().top) / scale - ruler.offsetTop);
      layer.style.transform = `translateY(${offset}px)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(editor);
    resizeObserver.observe(scrollport);
    const zoom = editor.closest(".zoom-container");
    const zoomObserver = new MutationObserver(schedule);
    if (zoom) zoomObserver.observe(zoom, { attributes: true, attributeFilter: ["style"] });
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    update();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      zoomObserver.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [hasPageMetrics]);

  if (!pageMetrics?.width || !pageMetrics?.pageHeightPx) {
    return null;
  }

  const activePage = getActivePage({
    activePageNumber,
    pageMetrics,
    paginationModel
  });
  const horizontalTicks = buildRulerTicks(pageMetrics.width);
  const verticalTicks = buildRulerTicks(pageMetrics.pageHeightPx);
  const pageWidth = clampPositive(pageMetrics.width);
  const pageHeight = clampPositive(pageMetrics.pageHeightPx);
  const padding = {
    top: clampPositive(pageMetrics.padding?.top),
    right: clampPositive(pageMetrics.padding?.right),
    bottom: clampPositive(pageMetrics.padding?.bottom),
    left: clampPositive(pageMetrics.padding?.left)
  };

  return (
    <>
      <div ref={horizontalLayerRef} className="dockit-ruler-horizontal-layer" aria-hidden="true">
        <div
          className="dockit-ruler dockit-ruler--horizontal"
          style={{
            width: `${pageWidth}px`,
            left: `calc(50% - ${pageWidth / 2}px)`
          }}
        >
          <div
            className="dockit-ruler-margin dockit-ruler-margin--horizontal-start"
            style={{ left: 0, width: `${padding.left}px` }}
          />
          <div
            className="dockit-ruler-margin dockit-ruler-margin--horizontal-end"
            style={{
              left: `${Math.max(0, pageWidth - padding.right)}px`,
              width: `${padding.right}px`
            }}
          />
          <div
            className="dockit-ruler-content-band dockit-ruler-content-band--horizontal"
            style={{
              left: `${padding.left}px`,
              right: `${padding.right}px`
            }}
          />
          {horizontalTicks.map((tick) => (
            <span
              key={tick.key}
              className={`dockit-ruler-tick dockit-ruler-tick--horizontal dockit-ruler-tick--${tick.type}`}
              style={{ left: `${tick.offset}px` }}
            >
              {tick.label && (
                <span className="dockit-ruler-label dockit-ruler-label--horizontal">
                  {tick.label}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="dockit-ruler-vertical-layer" aria-hidden="true">
        <div
          className="dockit-ruler dockit-ruler--vertical"
          data-active-page={activePage.pageNumber}
          style={{
            top: `${activePage.top || 0}px`,
            left: `calc(50% - ${pageWidth / 2}px - ${RULER_GUTTER}px)`,
            height: `${pageHeight}px`
          }}
        >
          <div
            className="dockit-ruler-margin dockit-ruler-margin--vertical-start"
            style={{ top: 0, height: `${padding.top}px` }}
          />
          <div
            className="dockit-ruler-margin dockit-ruler-margin--vertical-end"
            style={{
              top: `${Math.max(0, pageHeight - padding.bottom)}px`,
              height: `${padding.bottom}px`
            }}
          />
          <div
            className="dockit-ruler-content-band dockit-ruler-content-band--vertical"
            style={{
              top: `${padding.top}px`,
              bottom: `${padding.bottom}px`
            }}
          />
          {verticalTicks.map((tick) => (
            <span
              key={tick.key}
              className={`dockit-ruler-tick dockit-ruler-tick--vertical dockit-ruler-tick--${tick.type}`}
              style={{ top: `${tick.offset}px` }}
            >
              {tick.label && (
                <span className="dockit-ruler-label dockit-ruler-label--vertical">
                  {tick.label}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

