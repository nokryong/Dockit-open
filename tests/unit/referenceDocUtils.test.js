import { describe, expect, it, vi } from "vitest";
import {
  filterReferenceDocuments,
  flattenReferenceDocuments,
  formatReferenceDocumentLabel,
  getReferencePreviewEmptyText,
  normalizeReferencePreviewDocument
} from "../../app/LIB/components/panel/referenceDoc/referenceDocUtils";

const mocks = vi.hoisted(() => ({
  fetchData: vi.fn(),
  fetchDocumentContent: vi.fn()
}));

vi.mock("../../app/LIB/utils/dataUtils", () => ({
  fetchData: mocks.fetchData,
  fetchDocumentContent: mocks.fetchDocumentContent
}));

describe("referenceDocUtils", () => {
  it("flattens nested folders into reference document rows", () => {
    expect(
      flattenReferenceDocuments([
        {
          content_type: "folders",
          title: "프로젝트",
          children: [
            {
              content_type: "folders",
              title: "보고서",
              children: [
                {
                  content_type: "documents",
                  _id: "doc-1",
                  title: "중간 점검"
                }
              ]
            }
          ]
        }
      ])
    ).toEqual([
      {
        _id: "doc-1",
        title: "중간 점검",
        parent_id: null,
        updated_at: null,
        pathLabel: "프로젝트 / 보고서",
        folderLabel: "보고서"
      }
    ]);
  });

  it("formats and filters reference document labels", () => {
    const documents = [
      {
        _id: "doc-1",
        title: "정책 보고서",
        pathLabel: "홈 / 정책",
        folderLabel: "정책"
      },
      {
        _id: "doc-2",
        title: "회의록",
        pathLabel: "홈 / 회의",
        folderLabel: "회의"
      }
    ];

    expect(formatReferenceDocumentLabel(documents[0])).toBe("정책/정책 보고서");
    expect(filterReferenceDocuments(documents, "회의")).toEqual([
      documents[1]
    ]);
    expect(filterReferenceDocuments(documents, "홈 / 정책")).toEqual([
      documents[0]
    ]);
  });

  it("builds preview empty text by panel state", () => {
    expect(
      getReferencePreviewEmptyText({
        documentCount: 0,
        searchTerm: "",
        selectedDocId: null
      })
    ).toBe("참고할 다른 문서가 없습니다.");

    expect(
      getReferencePreviewEmptyText({
        documentCount: 2,
        searchTerm: "정책",
        selectedDocId: null
      })
    ).toBe("검색 결과에서 미리볼 문서를 선택하세요.");

    expect(
      getReferencePreviewEmptyText({
        documentCount: 2,
        searchTerm: "",
        selectedDocId: null
      })
    ).toBe("미리볼 문서를 선택하세요.");
  });

  it("loads reference HTML only through the authenticated content route", async () => {
    mocks.fetchData.mockResolvedValueOnce({
      content: {
        _id: "doc-1",
        title: "참고 문서",
        revision: "revision-1"
      }
    });
    mocks.fetchDocumentContent.mockResolvedValueOnce("<p>safe content</p>");

    await expect(normalizeReferencePreviewDocument("doc-1")).resolves.toMatchObject({
      _id: "doc-1",
      content: "<p>safe content</p>",
      revision: "revision-1"
    });
    expect(mocks.fetchData).toHaveBeenCalledWith("documents", "doc-1");
    expect(mocks.fetchDocumentContent).toHaveBeenCalledWith("doc-1");
  });
});
