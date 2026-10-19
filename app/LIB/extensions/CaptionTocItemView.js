"use client";

import { NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collectCaptionEntries,
  getCaptionElementByTargetId
} from "../utils/captionUtils";
import { getPageNumberForElement } from "../utils/tocUtils";

const resolveCaptionTextStyle = (captionElement) => {
  if (!(captionElement instanceof Element)) {
    return null;
  }

  const target =
    captionElement.querySelector(".caption-block-content p span") ||
    captionElement.querySelector(".caption-block-content p") ||
    captionElement.querySelector("p") ||
    captionElement;
  const computedStyle = window.getComputedStyle(target);

  return {
    fontFamily: computedStyle.fontFamily,
    fontSize: computedStyle.fontSize,
    fontWeight: computedStyle.fontWeight,
    fontStyle: computedStyle.fontStyle,
    color: computedStyle.color
  };
};

export default function CaptionTocItemView({ editor, node }) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    const handleTransaction = () => {
      setRevision((value) => value + 1);
    };

    const handleResize = () => {
      setRevision((value) => value + 1);
    };

    editor.on("transaction", handleTransaction);
    window.addEventListener("resize", handleResize);

    return () => {
      editor.off("transaction", handleTransaction);
      window.removeEventListener("resize", handleResize);
    };
  }, [editor]);

  const entry = useMemo(() => {
    void revision;

    if (!editor || !node.attrs.targetId) {
      return null;
    }

    return (
      collectCaptionEntries(editor.state.doc).find(
        (captionEntry) => captionEntry.targetId === node.attrs.targetId
      ) || null
    );
  }, [editor, node.attrs.targetId, revision]);

  const captionElement = useMemo(() => {
    void revision;

    if (!editor || !node.attrs.targetId) {
      return null;
    }

    return getCaptionElementByTargetId(editor, node.attrs.targetId);
  }, [editor, node.attrs.targetId, revision]);

  const captionStyle = useMemo(() => {
    void revision;

    return resolveCaptionTextStyle(captionElement);
  }, [captionElement, revision]);

  const pageNumber = useMemo(() => {
    void revision;

    if (!captionElement) {
      return 1;
    }

    return getPageNumberForElement(captionElement);
  }, [captionElement, revision]);

  const handleMoveToCaption = useCallback(() => {
    if (!(captionElement instanceof Element)) {
      return;
    }

    captionElement.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest"
    });
  }, [captionElement]);

  if (!entry) {
    return (
      <NodeViewWrapper className="toc-item" contentEditable={false}>
        <div className="toc-item-row" />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="toc-item" contentEditable={false}>
      <button
        type="button"
        className="toc-item-row"
        onClick={handleMoveToCaption}
      >
        <span className="toc-item-title" style={captionStyle || undefined}>
          {[entry.numberText, entry.text].filter(Boolean).join(" ")}
        </span>
        <span className="toc-item-leader" />
        <span className="toc-item-page">{pageNumber}p</span>
      </button>
    </NodeViewWrapper>
  );
}
