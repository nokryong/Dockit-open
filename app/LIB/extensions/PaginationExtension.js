import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { collectPaginationDomModel } from "../pagination/model/collectDomMeasurements";
import { buildPaginationInput } from "../pagination/model/buildPaginationInput";
import { calculatePaginationPlan } from "../pagination/layout/calculatePaginationPlan";
import { createPaginationDecorations } from "../pagination/render/createPaginationDecorations";

const paginationPluginKey = new PluginKey("pagination");
const FOOTNOTE_BODY_SELECTOR =
  '[data-dockit-note-body="true"][data-dockit-note-kind="footnote"]';

export const PaginationExtension = Extension.create({
  name: "pagination",

  addOptions() {
    return {
      pageMetrics: null,
      pageNumber: "none",
      gapHeight: 50,
      footnoteMaxAreaRatio: 0.35,
      footnoteChromeHeight: 18,
      onPaginationUpdate: null
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: paginationPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, set) {
            return (
              tr.getMeta(paginationPluginKey) || set.map(tr.mapping, tr.doc)
            );
          }
        },
        props: {
          decorations(state) {
            return paginationPluginKey.getState(state);
          }
        },
        view(view) {
          let rafId = null;
          let isDestroyed = false;
          let resizeObserver = null;
          let lastLayoutSignature = null;
          let isPrintMode = false;
          let printMediaQuery = null;
          let fontSet = null;
          let projectionHost = null;
          let footnoteRuntime = null;
          let footnoteRuntimePromise = null;
          let lastCompleteFootnoteProjection = null;
          let projectionSignatureRafId = null;
          let isProjectionSettling = false;

          const cancelProjectionSignatureCapture = () => {
            if (projectionSignatureRafId) {
              cancelAnimationFrame(projectionSignatureRafId);
              projectionSignatureRafId = null;
            }
            isProjectionSettling = false;
          };

          const captureSettledProjectionSignature = () => {
            if (projectionSignatureRafId) {
              cancelAnimationFrame(projectionSignatureRafId);
            }
            isProjectionSettling = true;
            projectionSignatureRafId = requestAnimationFrame(() => {
              projectionSignatureRafId = null;
              if (!isDestroyed && !isPrintEnvironment()) {
                lastLayoutSignature = getLayoutSignature();
              }
              isProjectionSettling = false;
            });
          };

          const restoreCanonicalBodies = () => {
            cancelProjectionSignatureCapture();
            footnoteRuntime?.restoreCanonicalFootnoteBodies?.(view.dom);
            projectionHost?.removeAttribute(
              "data-dockit-footnote-projection-active"
            );
            projectionHost = null;
          };

          const setPrintReadiness = (status) => {
            const host = view.dom.parentElement;
            if (host) host.setAttribute("data-dockit-footnote-print-state", status);
          };

          const publishBlockedFootnoteState = () => {
            lastCompleteFootnoteProjection = null;
            restoreCanonicalBodies();
            setPrintReadiness("blocked");
            if (view.dom.querySelector(".dockit-footnote-print-blocking-error")) {
              return;
            }

            const error = document.createElement("div");
            error.className = "dockit-footnote-print-blocking-error";
            error.setAttribute("role", "alert");
            error.textContent =
              "각주 페이지 레이아웃을 준비하지 못했습니다. 인쇄를 중단하고 다시 시도하세요.";
            const decorations = DecorationSet.create(view.state.doc, [
              Decoration.widget(view.state.doc.content.size, error, { side: 100 })
            ]);

            if (typeof extension.options.onPaginationUpdate === "function") {
              queueMicrotask(() => {
                if (!isDestroyed) extension.options.onPaginationUpdate(null);
              });
            }
            view.dispatch(
              view.state.tr
                .setMeta(paginationPluginKey, decorations)
                .setMeta("addToHistory", false)
            );
          };

          const getLayoutSignature = () => {
            const rootElement = view.dom;
            const computedStyle =
              rootElement instanceof HTMLElement
                ? window.getComputedStyle(rootElement)
                : null;

            return JSON.stringify({
              width:
                rootElement instanceof HTMLElement
                  ? rootElement.clientWidth
                  : 0,
              height:
                rootElement instanceof HTMLElement
                  ? rootElement.scrollHeight
                  : 0,
              lineHeight: computedStyle?.lineHeight || "",
              fontSize: computedStyle?.fontSize || "",
              fontFamily: computedStyle?.fontFamily || "",
              fontWeight: computedStyle?.fontWeight || "",
              letterSpacing: computedStyle?.letterSpacing || "",
              paddingTop: computedStyle?.paddingTop || "",
              paddingBottom: computedStyle?.paddingBottom || "",
              devicePixelRatio: window.devicePixelRatio || 1
            });
          };

          const isPrintEnvironment = () =>
            isPrintMode || Boolean(printMediaQuery?.matches);

          const scheduleCalculation = () => {
            if (isDestroyed) {
              return;
            }

            // 인쇄 CSS 자체가 보이는 위치·크기를 바꿈
            // (인쇄 단계에서는 새 화면 측정 대신 마지막으로 완성된 화면 투영을 그대로 재사용)
            if (isPrintEnvironment()) {
              return;
            }

            // 캐시한 투영은 그 투영을 만든 화면 배치에서만 유효
            // (화면 재측정이 예약되면 무효화해서, 인쇄가 오래된 문서·글꼴·크기 정보를 쓰지 않도록 처리)
            if (!isPrintMode) {
              lastCompleteFootnoteProjection = null;
              setPrintReadiness(
                view.dom.querySelector(FOOTNOTE_BODY_SELECTOR)
                  ? "blocked"
                  : "not-required"
              );
            }

            if (rafId) {
              cancelAnimationFrame(rafId);
            }

            rafId = requestAnimationFrame(() => {
              rafId = requestAnimationFrame(() => {
                rafId = null;
                runCalculation();
              });
            });
          };

          const requestFootnoteRuntime = () => {
            if (footnoteRuntimePromise) return;
            footnoteRuntimePromise = import(
              "../pagination/notes/footnoteScreenPaginationRuntime"
            )
              .then((runtime) => {
                footnoteRuntime = runtime;
                if (!isDestroyed) scheduleCalculation();
                return runtime;
              })
              .catch(() => null);
          };

          const runCalculation = () => {
            const {
              pageMetrics,
              pageNumber,
              gapHeight,
              footnoteMaxAreaRatio,
              footnoteChromeHeight,
              onPaginationUpdate
            } = extension.options;

            if (!pageMetrics || !pageMetrics.pageHeightPx) {
              return;
            }

            const printHasFootnoteBody = Boolean(
              view.dom.querySelector(FOOTNOTE_BODY_SELECTOR)
            );
            if (isPrintEnvironment() && printHasFootnoteBody) {
              restoreCanonicalBodies();
              // 안정된 화면 DecorationSet에 숨겨진 인쇄 투영이 이미 들어 있음
              // (인쇄 진입 때 같은 위젯 DOM을 다시 보내면 ProseMirror에 위젯이 중복으로 남을 수 있음)
              if (lastCompleteFootnoteProjection) {
                setPrintReadiness("ready");
              } else {
                publishBlockedFootnoteState();
              }
              return;
            }

            const hasFootnoteBody = Boolean(
              view.dom.querySelector(FOOTNOTE_BODY_SELECTOR)
            );
            if (hasFootnoteBody && !footnoteRuntime) {
              requestFootnoteRuntime();
            }
            let measuredFootnoteAttempt = null;
            if (!isPrintMode && hasFootnoteBody && footnoteRuntime) {
              try {
                measuredFootnoteAttempt =
                  footnoteRuntime.prepareFootnoteScreenPagination({
                    view,
                    pageMetrics,
                    footnoteMaxAreaRatio,
                    footnoteChromeHeight
                  });
              } catch {
                measuredFootnoteAttempt = null;
              }
            }
            const footnoteAttempt = measuredFootnoteAttempt;
            const footnoteCandidate = footnoteAttempt?.candidate || null;
            const footnotePaginationInput =
              footnoteAttempt?.paginationInput || null;
            const footnoteIntegration = footnoteAttempt?.integration || null;
            const footnoteProjection = footnoteAttempt?.projection || null;
            // 본문 제외 입력은 완성된 투영만 사용
            // (나머지 결과는 기존 레거시 경로 그대로)
            const activatedProjection =
              footnoteProjection &&
              (projectionHost = footnoteRuntime.activateCanonicalBodyProjection({
                view,
                candidate: footnoteCandidate,
                projection: footnoteProjection
              }))
                ? footnoteProjection
                : null;
            if (activatedProjection) {
              lastCompleteFootnoteProjection = measuredFootnoteAttempt;
            }
            // 완성 후보는 현재 투영을 둔 채 숨긴 복제본으로 측정
            // (실제 레거시 대체 때만 원본 본문을 되돌려서 화면이 떨어졌다 붙는 프레임 방지)
            let legacyPaginationInput = null;
            if (!activatedProjection) {
              restoreCanonicalBodies();
              try {
                const legacyDomModel = collectPaginationDomModel(view);
                legacyPaginationInput = buildPaginationInput({
                  editorState: view.state,
                  pageMetrics,
                  domModel: legacyDomModel
                });
              } catch (error) {
                if (!hasFootnoteBody) throw error;
                publishBlockedFootnoteState();
                return;
              }
            }
            const paginationOutcome = footnoteRuntime
              ? footnoteRuntime.selectFootnotePaginationOutcome({
                legacyPaginationInput,
                footnotePaginationInput,
                footnoteIntegration,
                footnoteProjection: activatedProjection
              })
              : {
                active: false,
                input: legacyPaginationInput,
                plan: calculatePaginationPlan(legacyPaginationInput)
              };
            const hasActiveProjection = paginationOutcome.active;
            const paginationInput = paginationOutcome.input;
            const paginationPlan = paginationOutcome.plan;
            const footnotePrintStatus =
              footnoteRuntime?.resolveFootnotePrintReadiness({
                hasFootnoteBody,
                activeProjection: hasActiveProjection
              }) || (hasFootnoteBody ? "blocked" : "not-required");
            const footnotePrintProjectionAdapter =
              footnoteRuntime?.createFootnotePrintProjectionAdapter({
                projection: hasActiveProjection ? activatedProjection : null,
                chromeHeight: footnoteChromeHeight
              }) || null;
            setPrintReadiness(footnotePrintStatus);
            const decorations = createPaginationDecorations({
              doc: view.state.doc,
              plan: paginationPlan,
              pageMetrics: paginationInput.pageMetrics,
              pageNumberPosition: pageNumber,
              gapHeight,
              footnotePrintProjectionAdapter,
              footnotePrintStatus
            });
            const decoSet = DecorationSet.create(view.state.doc, decorations);

            // Spike 디버그용: 브라우저 콘솔에서 마지막 pagination 입력/결과를 확인할 수 있습니다.
            const debugPayload = {
              input: paginationInput,
              plan: paginationPlan,
              pageMap: paginationPlan.pageMap,
              pageMetrics: paginationInput.pageMetrics,
              gapHeight
            };
            if (hasActiveProjection) {
              debugPayload.footnoteCandidateStatus = footnoteCandidate.status;
              debugPayload.footnoteIntegrationStatus = footnoteIntegration.status;
            }
            view.dom.__dockitPaginationSpike = debugPayload;

            if (typeof onPaginationUpdate === "function") {
              if (hasActiveProjection) isProjectionSettling = true;
              queueMicrotask(() => {
                if (isDestroyed) {
                  return;
                }

                const updatePayload = {
                  input: paginationInput,
                  plan: paginationPlan,
                  pageMap: paginationPlan.pageMap,
                  pageMetrics: paginationInput.pageMetrics,
                  gapHeight,
                  pageNumber
                };
                if (hasActiveProjection) {
                  updatePayload.footnoteProjection = activatedProjection;
                  updatePayload.footnoteStatus = "stable";
                }
                onPaginationUpdate(updatePayload);
                if (hasActiveProjection) {
                  captureSettledProjectionSignature();
                }
              });
            }

            lastLayoutSignature = getLayoutSignature();

            view.dispatch(
              view.state.tr
                .setMeta(paginationPluginKey, decoSet)
                .setMeta("addToHistory", false)
            );
          };

          setPrintReadiness(
            view.dom.querySelector(FOOTNOTE_BODY_SELECTOR)
              ? "blocked"
              : "not-required"
          );
          scheduleCalculation();

          lastLayoutSignature = getLayoutSignature();

          fontSet = document.fonts || null;
          const handleFontLoadingDone = () => {
            scheduleCalculation();
          };
          if (fontSet?.ready) {
            fontSet.ready.then(() => {
              if (!isDestroyed) {
                scheduleCalculation();
              }
            });
          }
          fontSet?.addEventListener?.("loadingdone", handleFontLoadingDone);

          const handleBeforePrint = () => {
            isPrintMode = true;
            runCalculation();
          };
          const handleAfterPrint = () => {
            isPrintMode = false;
            scheduleCalculation();
          };
          const handlePrintMediaChange = (event) => {
            isPrintMode = Boolean(event.matches);
            if (isPrintMode) {
              runCalculation();
            } else {
              scheduleCalculation();
            }
          };
          window.addEventListener("beforeprint", handleBeforePrint);
          window.addEventListener("afterprint", handleAfterPrint);
          if (typeof window.matchMedia === "function") {
            printMediaQuery = window.matchMedia("print");
            isPrintMode = printMediaQuery.matches;
            printMediaQuery.addEventListener?.("change", handlePrintMediaChange);
          }

          if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
              if (isPrintEnvironment() || isProjectionSettling) return;
              if (getLayoutSignature() !== lastLayoutSignature) scheduleCalculation();
            });
            resizeObserver.observe(view.dom);
          }

          return {
            update(nextView, prevState) {
              const nextLayoutSignature = getLayoutSignature();
              const layoutChanged = nextLayoutSignature !== lastLayoutSignature;

              if (!prevState.doc.eq(nextView.state.doc) || layoutChanged) {
                lastLayoutSignature = nextLayoutSignature;
                scheduleCalculation();
              }
            },
            destroy() {
              isDestroyed = true;

              if (rafId) {
                cancelAnimationFrame(rafId);
              }
              cancelProjectionSignatureCapture();

              resizeObserver?.disconnect();
              fontSet?.removeEventListener?.("loadingdone", handleFontLoadingDone);
              window.removeEventListener("beforeprint", handleBeforePrint);
              window.removeEventListener("afterprint", handleAfterPrint);
              printMediaQuery?.removeEventListener?.("change", handlePrintMediaChange);
              restoreCanonicalBodies();
              lastCompleteFootnoteProjection = null;
              view.dom.parentElement?.removeAttribute("data-dockit-footnote-print-state");

              if (typeof extension.options.onPaginationUpdate === "function") {
                extension.options.onPaginationUpdate(null);
              }

            }
          };
        }
      })
    ];
  }
});
