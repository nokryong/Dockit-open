export const DEFAULT_REFERENCE_DOCUMENT_SETTINGS = {
  pageWidth: 210,
  pageHeight: 297,
  paddingTop: 25,
  paddingBottom: 25,
  paddingLeft: 25,
  paddingRight: 25,
  lineHeight: 1.5
};

export const mmToPx = (mm) => (mm * 96) / 25.4;

export const formatReferenceDocumentLabel = (document) => {
  if (!document) {
    return "";
  }

  const folderLabel = document.folderLabel || "홈";
  const title = document.title || "제목 없는 문서";

  return `${folderLabel}/${title}`;
};

export const filterReferenceDocuments = (documents, searchTerm) => {
  if (!Array.isArray(documents)) {
    return [];
  }

  const normalizedSearch = `${searchTerm ?? ""}`.trim().toLowerCase();

  if (!normalizedSearch) {
    return documents;
  }

  return documents.filter((item) => {
    const title = `${item.title ?? ""}`.toLowerCase();
    const pathLabel = `${item.pathLabel ?? ""}`.toLowerCase();
    const rowLabel = formatReferenceDocumentLabel(item).toLowerCase();

    return (
      title.includes(normalizedSearch) ||
      pathLabel.includes(normalizedSearch) ||
      rowLabel.includes(normalizedSearch)
    );
  });
};

export const getReferencePreviewEmptyText = ({
  documentCount,
  searchTerm,
  selectedDocId
}) => {
  if (documentCount === 0) {
    return "참고할 다른 문서가 없습니다.";
  }

  if (searchTerm?.trim() && !selectedDocId) {
    return "검색 결과에서 미리볼 문서를 선택하세요.";
  }

  return "미리볼 문서를 선택하세요.";
};

export const flattenReferenceDocuments = (items, parents = []) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((item) => {
    if (item?.content_type === "folders") {
      const nextParents = [...parents, item.title];
      return flattenReferenceDocuments(item.children || [], nextParents);
    }

    if (item?.content_type !== "documents") {
      return [];
    }

    return [
      {
        _id: item._id,
        title: item.title || "제목 없는 문서",
        parent_id: item.parent_id ?? null,
        updated_at: item.updated_at ?? null,
        pathLabel: parents.length > 0 ? parents.join(" / ") : "홈",
        folderLabel: parents.length > 0 ? parents[parents.length - 1] : "홈"
      }
    ];
  });
};

export const normalizeReferencePreviewDocument = async (docId) => {
  const { fetchData, fetchDocumentContent } = await import(
    "../../../utils/dataUtils"
  );
  const response = await fetchData("documents", docId);
  const baseDocument = response?.content;

  if (!baseDocument) {
    throw new Error("문서 정보를 찾을 수 없습니다.");
  }

  const {
    content: _inlineContent,
    contentURL: _legacyContentURL,
    contentStoragePath: _contentStoragePath,
    ...documentMetadata
  } = baseDocument;
  void _inlineContent;
  void _legacyContentURL;
  void _contentStoragePath;
  const nextContent = await fetchDocumentContent(docId);

  return {
    ...documentMetadata,
    content: nextContent,
    docSetting:
      documentMetadata.docSetting || DEFAULT_REFERENCE_DOCUMENT_SETTINGS,
    bulletStyle: documentMetadata.bulletStyle || {},
    viewPage: documentMetadata.viewPage ?? false,
    pageNumber: documentMetadata.pageNumber || "none"
  };
};
