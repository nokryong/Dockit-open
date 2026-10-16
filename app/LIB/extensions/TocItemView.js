"use client";

import { NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocument } from "../context/DocumentContext";
import {
  collectHeadingEntries,
  getHeadingElementById,
  getPageNumberForHeadingId
} from "../utils/tocUtils";

const resolveHeadingTextStyle = (headingElement) => {
  if (!(headingElement instanceof Element)) {
    return null;
  }

  const target = headingElement.querySelector("span") || headingElement;
  const computedStyle = window.getComputedStyle(target);

  return {
    fontFamily: computedStyle.fontFamily,
    fontSize: computedStyle.fontSize,
    fontWeight: computedStyle.fontWeight,
    fontStyle: computedStyle.fontStyle,
    color: computedStyle.color
  };
};

export default function TocItemView({ editor, node }) {
  const { bulletStyle } = useDocument();
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
      collectHeadingEntries(editor.state.doc, bulletStyle).find(
        (headingEntry) => headingEntry.headingId === node.attrs.targetId
      ) || null
    );
  }, [bulletStyle, editor, node.attrs.targetId, revision]);

  const headingStyle = useMemo(() => {
    void revision;

    if (!editor || !node.attrs.targetId) {
      return null;
    }

    return resolveHeadingTextStyle(
      getHeadingElementById(editor, node.attrs.targetId)
    );
  }, [editor, node.attrs.targetId, revision]);

  const pageNumber = useMemo(() => {
    void revision;

    if (!editor || !node.attrs.targetId) {
      return 1;
    }

    return getPageNumberForHeadingId(editor, node.attrs.targetId);
  }, [editor, node.attrs.targetId, revision]);

  const handleMoveToHeading = useCallback(() => {
    if (!editor || !node.attrs.targetId) {
      return;
    }

    const target = getHeadingElementById(editor, node.attrs.targetId);

    if (target instanceof Element) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest"
      });
    }
  }, [editor, node.attrs.targetId]);

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
        onClick={handleMoveToHeading}
      >
        <span
          className="toc-item-title"
          style={{
            ...headingStyle,
            "--toc-item-indent": `${Math.max(0, entry.level - 1) * 14}px`
          }}
        >
          {entry.number}. {entry.text}
        </span>
        <span className="toc-item-leader" />
        <span className="toc-item-page">{pageNumber}p</span>
      </button>
    </NodeViewWrapper>
  );
}
