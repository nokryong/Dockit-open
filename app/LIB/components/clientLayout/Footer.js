import { t as uiText, useI18n, getDateLocale } from "../../i18n";
import {
  CloudOutline,
  Cloudy,
  Rain,
  Search,
  Snow,
  SunOutline
} from "sud-icons";
import { Div, Divider, Typography } from "sud-ui";
import { usePathname } from "@/desktop/navigation";
import { useDocument } from "../../context/DocumentContext";
import { useEditor } from "../../context/EditorContext";
import { useCodex } from "../../context/CodexContext";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLayout } from "../../context/LayoutContext";
import { getEditorViewSafely } from "../../utils/editorViewUtils";
import { PRODUCT_HELP_COPY } from "../../constant/productHelpCopy";

const SAVE_STATUS_TONE_CLASS = {
  failed: "text-red-700",
  saved: "text-emerald-700",
  queued: "text-amber-700",
  saving: "text-slate-700"
};

export default function Footer({ scale, setScale, isMain }) {
  const uiLanguage = useI18n();
  const { setFooterHeight, layoutMode } = useLayout();
  const { editor, editorMounted } = useEditor();
  const pathname = usePathname();
  const { connection: codexConnection } = useCodex();
  const codexBuckets = codexConnection.usage?.buckets;
  const codexBucket =
    codexBuckets?.find((bucket) => bucket.id === "codex") ?? codexBuckets?.[0];
  const codexWindow = codexBucket?.primary ?? codexBucket?.secondary;
  const codexRemaining = Number.isFinite(codexWindow?.usedPercent)
    ? Math.round(100 - codexWindow.usedPercent)
    : null;

  const footerRef = useRef(null);

  useEffect(() => {
    if (!footerRef.current) return;

    const updateHeight = () => {
      if (footerRef.current) {
        setFooterHeight(footerRef.current.offsetHeight);
      }
    };

    // 초기 로드 시 실행
    updateHeight();

    // ResizeObserver를 사용하여 크기 변화 감지 (브라우저 리사이즈 or 내부 콘텐츠 변경 시)
    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(footerRef.current);

    return () => observer.disconnect();
  }, [setFooterHeight]);

  const zoomPercentage = Math.round(scale * 100);

  const { content, isSaving, hasQueuedSave, lastSaveResult } = useDocument();
  const [now, setNow] = useState(() => new Date());
  const [selectedLength, setSelectedLength] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPageCount, setTotalPageCount] = useState(1);

  const countCharacters = (text) => {
    if (!text) return 0;
    return text.replace(/\s+/g, "").length;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getStoryLength = (html) => {
    if (!html) return 0;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body.textContent || "";
    return countCharacters(text);
  };
  const currentLength = getStoryLength(content || "");
  const isDetailPage = /^\/docs\/[^/]+$/.test(
    pathname || ""
  );
  const visibleStats = isDetailPage
    ? [
        selectedLength > 0
          ? {
              key: "selected",
              label: uiText("선택 {0}자", selectedLength.toLocaleString(getDateLocale()))
            }
          : null,
        currentLength > 0
          ? {
              key: "current",
              label: uiText("전체 {0}자", currentLength.toLocaleString(getDateLocale()))
            }
          : null
      ].filter(Boolean)
    : [];
  const saveStatus = useMemo(() => {
    void uiLanguage;
    if (!isDetailPage) return null;

    if (hasQueuedSave) {
      return {
        tone: "queued",
        label: uiText("저장 대기 중")
      };
    }

    if (isSaving) {
      return {
        tone: "saving",
        label: uiText("저장 중")
      };
    }

    if (!lastSaveResult) {
      return null;
    }

    const completedAt = Number.isFinite(lastSaveResult.completedAt)
      ? new Date(lastSaveResult.completedAt).toLocaleTimeString(getDateLocale(), {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })
      : null;

    return {
      tone: lastSaveResult.ok ? "saved" : "failed",
      label: `${lastSaveResult.ok ? uiText("저장 완료") : uiText("저장 실패")}${
        completedAt ? ` (${completedAt})` : ""
      }`
    };
  }, [hasQueuedSave, isDetailPage, isSaving, lastSaveResult, uiLanguage]);

  const findScrollParent = useCallback((element) => {
    let current = element?.parentElement || null;

    while (current) {
      const overflowY = window.getComputedStyle(current).overflowY;

      if (overflowY === "auto" || overflowY === "scroll") {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }, []);

  const getPaginationElements = useCallback(() => {
    const editorView = getEditorViewSafely(editor);

    if (!editorView?.dom) {
      return {
        pageHeaders: [],
        pageFooters: [],
        scrollContainer: null
      };
    }

    const pageHeaders = Array.from(
      editorView.dom.querySelectorAll(".page-header-spacer")
    ).filter((element) => element instanceof HTMLElement);
    const pageFooters = Array.from(
      editorView.dom.querySelectorAll(".page-footer-spacer")
    ).filter((element) => element instanceof HTMLElement);
    const pagesRoot = document.getElementById("pages");

    return {
      pageHeaders,
      pageFooters,
      scrollContainer: findScrollParent(pagesRoot || editorView.dom)
    };
  }, [editor, findScrollParent]);

  const moveToPage = (targetPage) => {
    if (!isDetailPage) return;

    const { pageHeaders, scrollContainer } = getPaginationElements();

    if (!scrollContainer || pageHeaders.length === 0) return;

    const nextPage = Math.min(
      Math.max(targetPage, 1),
      Math.max(pageHeaders.length, totalPageCount, 1)
    );
    const header = pageHeaders[nextPage - 1];

    if (!(header instanceof HTMLElement)) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const nextScrollTop =
      scrollContainer.scrollTop + (headerRect.top - containerRect.top);

    scrollContainer.scrollTo({
      top: nextScrollTop,
      behavior: "smooth"
    });
    setCurrentPage(nextPage);
  };

  useEffect(() => {
    if (!editor) {
      setSelectedLength(0);
      return;
    }

    const updateSelectedLength = () => {
      const { selection, doc } = editor.state;

      if (!selection || selection.empty) {
        setSelectedLength(0);
        return;
      }

      if (selection.node) {
        setSelectedLength(countCharacters(selection.node.textContent || ""));
        return;
      }

      const selectedText = doc.textBetween(selection.from, selection.to, " ");
      setSelectedLength(countCharacters(selectedText));
    };

    updateSelectedLength();
    editor.on("selectionUpdate", updateSelectedLength);
    editor.on("transaction", updateSelectedLength);

    return () => {
      editor.off("selectionUpdate", updateSelectedLength);
      editor.off("transaction", updateSelectedLength);
    };
  }, [editor]);

  useEffect(() => {
    const editorView = getEditorViewSafely(editor);

    if (!editorMounted || !editorView?.dom || !isDetailPage) {
      setTotalPageCount(1);
      setCurrentPage(1);
      return;
    }

    let rafId = null;

    const updatePageState = () => {
      const { pageHeaders, pageFooters, scrollContainer } =
        getPaginationElements();
      const nextTotalPageCount = Math.max(
        pageHeaders.length,
        pageFooters.length,
        1
      );

      setTotalPageCount(nextTotalPageCount);

      if (!scrollContainer || pageHeaders.length === 0) {
        setCurrentPage(1);
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const focusLine = containerRect.top + containerRect.height / 2;

      let nextCurrentPage = 1;

      pageHeaders.forEach((header, index) => {
        if (header.getBoundingClientRect().top <= focusLine) {
          nextCurrentPage = index + 1;
        }
      });

      setCurrentPage(Math.min(nextCurrentPage, nextTotalPageCount));
    };

    const scheduleUpdate = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePageState();
      });
    };

    const { scrollContainer } = getPaginationElements();

    if (!scrollContainer) {
      updatePageState();
      return;
    }

    updatePageState();

    const updatePageCount = () => {
      scheduleUpdate();
    };

    const observer = new MutationObserver(() => {
      updatePageCount();
    });

    observer.observe(editorView.dom, {
      childList: true,
      subtree: true
    });

    scrollContainer.addEventListener("scroll", updatePageCount, {
      passive: true
    });
    window.addEventListener("resize", updatePageCount);

    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener("scroll", updatePageCount);
      window.removeEventListener("resize", updatePageCount);

      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [editor, editorMounted, content, getPaginationElements, isDetailPage, scale]);

  return (
    <Div ref={footerRef} className="relative flex flex-wrap justify-between px-2.5 items-center gap-y-1">
      {/* 현재 시간 */}
      {layoutMode !== "mobile" ? (
        <div className="flex items-center gap-1">
          <Typography
            as="div"
            className="flex items-center gap-1"
            pretendard="SB"
            size="sm"
            color="black-8"
            style={{ width: "180px" }}
          >
            {/* 날짜도 표시 */}
            {now.toLocaleDateString(getDateLocale())}
            {" | "}
            {now.toLocaleTimeString(getDateLocale())}
          </Typography>

          {/* {!loading && weather && (
          <>
            <Divider vertical style={{ height: "10px" }} />
            <Div color={`${setting.theme}-7`} className="hover-scale-6">
              {React.cloneElement(
                weatherConditionMapping[weather.weatherCondition],
                { size: 16 }
              )}
            </Div>
            <Typography size="sm" color="black-8">
              {weather.weatherCondition
                .replace("rain", "비")
                .replace("snow", "눈")
                .replace("shower", "소나기")
                .replace("partly cloudy", "구름 조금")
                .replace("clear sky", "맑음")
                .replace("mostly clear", "대체로 맑음")
                .replace("partly cloudy rain", "구름 조금 비")
                .replace("알 수 없음", "알 수 없음")
                .trim()}{" "}
              | 온도 {weather.temperature} | 습도 {weather.humidity} | 풍속{" "}
              {weather.windSpeed}
            </Typography>
          </>
        )} */}
        </div>
      ) : (
        <div />
      )}

      {codexConnection.connected && (
        <div
          className={layoutMode === "desktop"
            ? "absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
            : "order-last w-full text-center"}
        >
          <Typography pretendard="SB" size="sm" color="black-8" title={uiText("Codex 남은 사용량")}>
            Codex {codexRemaining === null ? "—" : `${codexRemaining}%`}
          </Typography>
        </div>
      )}

      {/* 글자 수 및 확대 축소 버튼 */}
      {!isMain && (
        <div className="flex items-center">
          {visibleStats.length > 0 && (
            <>
              <Typography
                as="div"
                className="flex items-center gap-1"
                pretendard="SB"
                size="sm"
                color="black-8"
              >
                {visibleStats.map((item, index) => (
                  <React.Fragment key={item.key}>
                    {index > 0 && <Divider vertical style={{ height: "10px" }} />}
                    {item.label}
                  </React.Fragment>
                ))}
              </Typography>
              <Divider vertical style={{ height: "10px" }} />
            </>
          )}
          <div className="flex gap-2 items-center">
            {isDetailPage && totalPageCount > 0 && (
              <div className="flex gap-2 items-center">
                {saveStatus && (
                  <>
                    <span className="sr-only" id="write-save-status-help">
                      {PRODUCT_HELP_COPY.save}
                    </span>
                    <span
                      aria-describedby="write-save-status-help"
                      aria-live="polite"
                      className={`text-sm font-semibold ${
                        SAVE_STATUS_TONE_CLASS[saveStatus.tone] ||
                        SAVE_STATUS_TONE_CLASS.saving
                      }`}
                      data-testid="write-save-status"
                      title={PRODUCT_HELP_COPY.save}
                    >
                      {saveStatus.label}
                    </span>
                    <Divider vertical style={{ height: "10px" }} />
                  </>
                )}
                <Typography
                  as="div"
                  className="flex items-center gap-1"
                  pretendard="SB"
                  size="sm"
                  color="black-8"
                >
                  {`${currentPage}/${totalPageCount}`}
                </Typography>
                <Typography
                  as="div"
                  className="flex items-center gap-1"
                  color="black-7"
                >
                  <span
                    onClick={() => moveToPage(currentPage - 1)}
                    style={{
                      cursor: currentPage > 1 ? "pointer" : "default",
                      userSelect: "none",
                      fontSize: 10,
                      opacity: currentPage > 1 ? 1 : 0.35
                    }}
                  >
                    ▲
                  </span>

                  <span
                    onClick={() => moveToPage(currentPage + 1)}
                    style={{
                      cursor:
                        currentPage < totalPageCount ? "pointer" : "default",
                      userSelect: "none",
                      fontSize: 10,
                      opacity: currentPage < totalPageCount ? 1 : 0.35
                    }}
                  >
                    ▼
                  </span>
                </Typography>
              </div>
            )}
            <Typography
              as="div"
              className="flex items-center gap-1"
              pretendard="SB"
              size="sm"
              color="black-8"
            >
              <Search size={14} />
              {zoomPercentage}%
            </Typography>
            <Typography
              as="div"
              className="flex items-center gap-1"
              color="black-7"
            >
              <span
                onClick={() =>
                  setScale((prev) =>
                    Math.max(0.2, Math.round((prev - 0.05) * 100) / 100)
                  )
                }
                style={{ cursor: "pointer", userSelect: "none", fontSize: 10 }}
              >
                ▼
              </span>

              <span
                onClick={() =>
                  setScale((prev) =>
                    Math.min(4, Math.round((prev + 0.05) * 100) / 100)
                  )
                }
                style={{ cursor: "pointer", userSelect: "none", fontSize: 10 }}
              >
                ▲
              </span>
            </Typography>
          </div>
        </div>
      )}
    </Div>
  );
}
