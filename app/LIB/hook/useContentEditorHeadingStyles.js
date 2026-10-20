import { useCallback } from "react";
import { useThrottle } from "./useThrottle";
import { getEditorViewSafely } from "../utils/editorViewUtils";
import { getListMarkerStyles } from "../utils/listMarkerStyleUtils";

export default function useContentEditorHeadingStyles(editor) {
  const syncHeadingStyles = useCallback(() => {
    const editorView = getEditorViewSafely(editor);

    if (!editor || editor.isDestroyed || !editorView) {
      return;
    }

    const editorElement = editorView.dom;

    let styleElement = document.getElementById("dynamic-heading-styles");
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "dynamic-heading-styles";
      document.head.appendChild(styleElement);
    }

    let allStyles = getListMarkerStyles(editorElement);

    // 1. 헤딩 개별 처리
    ["h1", "h2", "h3", "h4", "h5", "h6"].forEach((tagName) => {
      const tagHeadings = editorElement.querySelectorAll(tagName);

      tagHeadings.forEach((heading, index) => {
        const span = heading.querySelector("span");
        if (span) {
          const computedStyle = window.getComputedStyle(span);

          allStyles += `
            .tiptap-container ${tagName}:nth-of-type(${index + 1})::before {
              font-family: ${computedStyle.fontFamily} !important;
              font-size: ${computedStyle.fontSize} !important;
              font-weight: ${computedStyle.fontWeight} !important;
              color: ${computedStyle.color} !important;
            }
          `;
        }
      });
    });

    styleElement.textContent = allStyles;
  }, [editor]);

  // throttle된 syncHeadingStyles
  const throttledSyncHeadingStyles = useThrottle(syncHeadingStyles, 200);

  return { syncHeadingStyles, throttledSyncHeadingStyles };
}
