import { t as uiText, translateMessage } from "../i18n";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { toast } from "sud-ui";
import {
  getSelectionTableRowOverflowState,
  getTableRowOverflowReports
} from "./utils/tableRowOverflowGuardUtils";

const tableRowOverflowGuardKey = new PluginKey("tableRowOverflowGuard");

const GROWTH_INPUT_TYPES = new Set([
  "insertText",
  "insertCompositionText",
  "insertParagraph",
  "insertLineBreak",
  "insertFromPaste",
  "insertFromDrop",
  "insertReplacementText",
  "insertFromYank"
]);

const shouldGuardBeforeInput = (event) =>
  !event?.isComposing && GROWTH_INPUT_TYPES.has(event?.inputType);

const shouldGuardKeyDown = (event) =>
  !event?.isComposing && (event?.key === "Enter" || event?.key === "Tab");

const createOverflowMessage = (state) => {
  if (state?.kind === "group") {
    return uiText("병합된 표 행 묶음이 한 페이지보다 커질 수 없어 입력을 취소했습니다.");
  }

  return uiText("표 행이 한 페이지보다 커질 수 없어 입력을 취소했습니다.");
};

const restorePreviousDocument = (view, previousState) => {
  if (!previousState?.doc || previousState.doc.eq(view.state.doc)) {
    return false;
  }

  let tr = view.state.tr
    .replaceWith(0, view.state.doc.content.size, previousState.doc.content)
    .setMeta(tableRowOverflowGuardKey, { rollback: true })
    .setMeta("addToHistory", false);

  try {
    const selectionPos = Math.min(
      previousState.selection.from,
      tr.doc.content.size
    );

    tr = tr.setSelection(Selection.near(tr.doc.resolve(selectionPos)));
  } catch {
    // 선택 복원은 가능한 만큼만 (문서 되돌리기가 핵심)
  }

  view.dispatch(tr);
  return true;
};

const getChangedRange = (previousDoc, nextDoc) => {
  const from = previousDoc.content.findDiffStart(nextDoc.content);

  if (from == null) {
    return null;
  }

  const end = previousDoc.content.findDiffEnd(nextDoc.content);

  return {
    from,
    to: Math.max(from, end?.b ?? from)
  };
};

const doesReportOverlapRange = (report, range) => {
  if (!range || !Number.isFinite(report?.from) || !Number.isFinite(report?.to)) {
    return true;
  }

  return report.from <= range.to && report.to >= range.from;
};

const TableRowOverflowGuard = Extension.create({
  name: "tableRowOverflowGuard",

  addOptions() {
    return {
      enabled: true,
      pageMetrics: null,
      tolerancePx: 1,
      notify: true
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: tableRowOverflowGuardKey,
        view(view) {
          let acceptedOverflowKeys = new Set();
          let hasBaseline = false;
          let rafId = null;
          let isRollingBack = false;
          let lastNotifyAt = 0;

          const getOptions = () => ({
            pageMetrics: extension.options.pageMetrics,
            tolerancePx: extension.options.tolerancePx
          });

          const notify = (message) => {
            if (!extension.options.notify) {
              return;
            }

            const now = Date.now();

            if (now - lastNotifyAt < 1200) {
              return;
            }

            lastNotifyAt = now;
            toast.info(translateMessage(message));
          };

          const measureOverflowKeys = () =>
            new Set(
              getTableRowOverflowReports(view, getOptions()).map(
                (report) => report.key
              )
            );

          const refreshBaseline = () => {
            if (!extension.options.enabled) {
              return;
            }

            acceptedOverflowKeys = measureOverflowKeys();
            hasBaseline = true;
          };

          const schedule = (callback) => {
            if (rafId) {
              cancelAnimationFrame(rafId);
            }

            rafId = requestAnimationFrame(() => {
              rafId = null;
              callback();
            });
          };

          schedule(refreshBaseline);

          return {
            update(currentView, previousState) {
              if (!extension.options.enabled) {
                return;
              }

              if (isRollingBack) {
                isRollingBack = false;
                schedule(refreshBaseline);
                return;
              }

              if (previousState.doc.eq(currentView.state.doc)) {
                return;
              }

              schedule(() => {
                const changedRange = getChangedRange(
                  previousState.doc,
                  currentView.state.doc
                );
                const reports = getTableRowOverflowReports(
                  currentView,
                  getOptions()
                );
                const overflowKeys = new Set(
                  reports.map((report) => report.key)
                );

                if (!hasBaseline) {
                  acceptedOverflowKeys = overflowKeys;
                  hasBaseline = true;
                  return;
                }

                const newReports = reports.filter(
                  (report) =>
                    !acceptedOverflowKeys.has(report.key) &&
                    doesReportOverlapRange(report, changedRange)
                );

                if (!newReports.length) {
                  acceptedOverflowKeys = overflowKeys;
                  return;
                }

                isRollingBack = true;

                if (restorePreviousDocument(currentView, previousState)) {
                  notify(createOverflowMessage(newReports[0]));
                  return;
                }

                acceptedOverflowKeys = overflowKeys;
              });
            },
            destroy() {
              if (rafId) {
                cancelAnimationFrame(rafId);
              }
            }
          };
        },
        props: {
          handleDOMEvents: {
            beforeinput(view, event) {
              if (
                !extension.options.enabled ||
                !shouldGuardBeforeInput(event)
              ) {
                return false;
              }

              const overflowState = getSelectionTableRowOverflowState(view, {
                pageMetrics: extension.options.pageMetrics,
                tolerancePx: extension.options.tolerancePx
              });

              if (!overflowState?.isAtLimit) {
                return false;
              }

              event.preventDefault();
              toast.info(translateMessage(createOverflowMessage(overflowState)));
              return true;
            },
            keydown(view, event) {
              if (!extension.options.enabled || !shouldGuardKeyDown(event)) {
                return false;
              }

              const overflowState = getSelectionTableRowOverflowState(view, {
                pageMetrics: extension.options.pageMetrics,
                tolerancePx: extension.options.tolerancePx
              });

              if (!overflowState?.isAtLimit) {
                return false;
              }

              event.preventDefault();
              toast.info(translateMessage(createOverflowMessage(overflowState)));
              return true;
            }
          },
          handlePaste(view) {
            if (!extension.options.enabled) {
              return false;
            }

            const overflowState = getSelectionTableRowOverflowState(view, {
              pageMetrics: extension.options.pageMetrics,
              tolerancePx: extension.options.tolerancePx
            });

            if (!overflowState?.isAtLimit) {
              return false;
            }

            toast.info(translateMessage(createOverflowMessage(overflowState)));
            return true;
          }
        }
      })
    ];
  }
});

export default TableRowOverflowGuard;
