import { useEffect, useState } from "react";
import { usePathname } from "@/desktop/navigation";
import { useDocument } from "../context/DocumentContext";



/**
 * 문서 관리 커스텀 훅
 * 경로에 따른 문서 로드/클리어 로직을 관리
 */
export function useDocumentManager() {
  const { document, loadDocument, clearDocument } = useDocument();
  const pathname = usePathname();


  // 현재 경로 분석
  const isEditPage = pathname.split("/")[1] === "docs";
  const documentId = pathname.split("/")[2];


  // 문서 로드/클리어 로직
  useEffect(() => {
    if (isEditPage && documentId) {
      if (document?._id === documentId) return;
      loadDocument(documentId);
    } else {
      clearDocument();
    }
  }, [isEditPage, documentId, loadDocument, clearDocument, document]);

  return {
    document,
    isEditPage,
    documentId,
  };
}
