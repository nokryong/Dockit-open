"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentProvider, useDocument } from "../../../context/DocumentContext";
import { EditorProvider } from "../../../context/EditorContext";
import ContentEditor from "../../write/ContentEditor";
import {
  DEFAULT_REFERENCE_DOCUMENT_SETTINGS,
  mmToPx
} from "./referenceDocUtils";

function ReferenceDocumentBridge({ previewDocument, children }) {
  const {
    setDocument,
    setTitle,
    setContent,
    setDocSetting,
    setBulletStyle,
    setThumbnail,
    setViewPage,
    setPageNumber,
    setFocus
  } = useDocument();

  useEffect(() => {
    if (!previewDocument) {
      setDocument(null);
      setTitle("");
      setContent("");
      setDocSetting(null);
      setBulletStyle({});
      setThumbnail(null);
      setViewPage(false);
      setPageNumber("none");
      setFocus(null);
      return;
    }

    setDocument(previewDocument);
    setTitle(previewDocument.title || "");
    setContent(previewDocument.content || "");
    setDocSetting(
      previewDocument.docSetting || DEFAULT_REFERENCE_DOCUMENT_SETTINGS
    );
    setBulletStyle(previewDocument.bulletStyle || {});
    setThumbnail(previewDocument.thumbnail || null);
    setViewPage(previewDocument.viewPage ?? false);
    setPageNumber(previewDocument.pageNumber || "none");
    setFocus(previewDocument.focus || null);
  }, [
    previewDocument,
    setBulletStyle,
    setContent,
    setDocSetting,
    setDocument,
    setFocus,
    setPageNumber,
    setThumbnail,
    setTitle,
    setViewPage
  ]);

  return children;
}

export default function ReferencePreviewSurface({ previewDocument }) {
  const viewportRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    if (!viewportRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const updateViewportWidth = () => {
      setViewportWidth(viewportRef.current?.clientWidth || 0);
    };

    updateViewportWidth();

    const observer = new ResizeObserver(() => {
      updateViewportWidth();
    });

    observer.observe(viewportRef.current);

    return () => observer.disconnect();
  }, []);

  const pageMetrics = useMemo(() => {
    const docSetting = previewDocument?.docSetting;

    if (!docSetting) {
      return null;
    }

    return {
      width: mmToPx(docSetting.pageWidth),
      pageHeightPx: mmToPx(docSetting.pageHeight),
      padding: {
        top: mmToPx(docSetting.paddingTop),
        bottom: mmToPx(docSetting.paddingBottom),
        left: mmToPx(docSetting.paddingLeft),
        right: mmToPx(docSetting.paddingRight)
      },
      lineHeight: docSetting.lineHeight
    };
  }, [previewDocument?.docSetting]);

  const previewScale = useMemo(() => {
    if (!pageMetrics || viewportWidth <= 0) {
      return 0.38;
    }

    const availableWidth = Math.max(viewportWidth - 24, 220);
    return Math.min(
      1,
      Math.max(0.34, Number((availableWidth / pageMetrics.width).toFixed(2)))
    );
  }, [pageMetrics, viewportWidth]);

  if (!pageMetrics || !previewDocument) {
    return null;
  }

  return (
    <div
      ref={viewportRef}
      className="w-full overflow-auto rounded-xl"
      style={{
        maxHeight: "52vh",
        padding: "10px"
      }}
    >
      <div
        style={{
          minWidth: `${Math.max(pageMetrics.width * previewScale, 220)}px`
        }}
      >
        <div
          style={{
            width: `${pageMetrics.width}px`,
            zoom: previewScale,
            margin: "0 auto"
          }}
        >
          <DocumentProvider>
            <ReferenceDocumentBridge previewDocument={previewDocument}>
              <EditorProvider>
                <ContentEditor
                  value={previewDocument.content || ""}
                  onChange={() => {}}
                  bulletStyle={previewDocument.bulletStyle || {}}
                  pageMetrics={pageMetrics}
                  viewPage={previewDocument.viewPage ?? false}
                  pageNumber={previewDocument.pageNumber || "none"}
                  editable={false}
                  pagesId={`reference-pages-${previewDocument._id}`}
                />
              </EditorProvider>
            </ReferenceDocumentBridge>
          </DocumentProvider>
        </div>
      </div>
    </div>
  );
}
