import { describe, expect, it } from "vitest";
import {
  DOCX_V0_EXPORT_ERROR_MESSAGE,
  DOCX_V0_MIME_TYPE,
  buildDOCXV0ExportNotice,
  createDOCXV0WarningDetails,
  createDOCXV0DownloadFileName,
  finishDOCXV0Export,
  isDOCXV0PackageBytes,
  startDOCXV0Export,
  summarizeDOCXV0Warnings
} from "../../app/LIB/utils/docxExportButtonUtils";

describe("DOCX export button v0 utilities", () => {
  it("파일명에 쓸 수 없는 문자를 정리하고 docx 확장자를 붙인다", () => {
    expect(createDOCXV0DownloadFileName(' 회의록:초안/검토? ')).toBe(
      "회의록_초안_검토_.docx"
    );
    expect(createDOCXV0DownloadFileName("보고서.docx")).toBe("보고서.docx");
    expect(createDOCXV0DownloadFileName("CON")).toBe("문서.docx");
    expect(createDOCXV0DownloadFileName("CON.docx")).toBe("문서.docx");
    expect(createDOCXV0DownloadFileName("마감본...")).toBe("마감본.docx");
    expect(createDOCXV0DownloadFileName("")).toBe("문서.docx");
    expect(DOCX_V0_MIME_TYPE).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(DOCX_V0_EXPORT_ERROR_MESSAGE).toContain("다시 시도");
  });

  it("DOCX package bytes signature를 확인한다", () => {
    expect(isDOCXV0PackageBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(
      true
    );
    expect(isDOCXV0PackageBytes(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(
      false
    );
    expect(isDOCXV0PackageBytes(new Uint8Array())).toBe(false);
    expect(isDOCXV0PackageBytes([0x50, 0x4b, 0x03, 0x04])).toBe(false);
  });

  it("DOCX warning을 code별 summary로 축약한다", () => {
    const summary = summarizeDOCXV0Warnings([
      {
        code: "docx-run-style-fallback",
        severity: "warning",
        message: "unsupported run style"
      },
      {
        code: "docx-run-style-fallback",
        severity: "warning",
        message: "another unsupported run style"
      },
      {
        code: "docx-unsupported-block",
        severity: "blocked",
        message: "unsupported block"
      }
    ]);

    expect(summary).toMatchObject({
      total: 3,
      warningCount: 2,
      blockedCount: 1
    });
    expect(summary.items.map((item) => item.code)).toEqual([
      "docx-unsupported-block",
      "docx-run-style-fallback"
    ]);
    expect(summary.items[0]).toMatchObject({
      count: 1,
      visiblePlaceholder: true
    });
    expect(summary.items[1]).toMatchObject({
      count: 2,
      visiblePlaceholder: false
    });
  });

  it("warning summary를 사용자 표시용 toast 문구로 축약한다", () => {
    expect(buildDOCXV0ExportNotice()).toEqual({
      toastType: "success",
      message: "DOCX 파일을 다운로드했습니다."
    });

    expect(
      buildDOCXV0ExportNotice({
        warningSummary: summarizeDOCXV0Warnings([
          {
            code: "docx-unsupported-block",
            severity: "blocked",
            message: "unsupported block"
          }
        ]),
        irWarningCount: 1
      })
    ).toEqual({
      toastType: "warning",
      message:
        "DOCX 파일을 다운로드했습니다. 일부 내용은 자리표시자나 단순화된 형태로 보일 수 있습니다. (2개 항목)"
    });

    expect(
      buildDOCXV0ExportNotice({
        warningSummary: summarizeDOCXV0Warnings([
          {
            code: "docx-run-style-fallback",
            severity: "warning",
            message: "run style fallback"
          }
        ])
      })
    ).toEqual({
      toastType: "info",
      message:
        "DOCX 파일을 다운로드했습니다. 일부 서식은 Word에서 단순화되어 보일 수 있습니다. (1개 항목)"
    });
  });

  it("DOCX warning detail을 사용자 확인 가능한 group으로 만든다", () => {
    const warnings = [
      {
        code: "docx-image-relationship-fallback",
        severity: "blocked",
        blockId: "image-1",
        blockType: "object",
        path: "blocks[2]",
        message: "external image source"
      },
      {
        code: "docx-run-style-fallback",
        severity: "warning",
        blockId: "p-1",
        blockType: "paragraph",
        message: "unsupported run style"
      }
    ];
    const details = createDOCXV0WarningDetails({
      docxWarnings: warnings,
      docxWarningSummary: summarizeDOCXV0Warnings(warnings),
      irWarnings: [
        {
          code: "ir-unknown-mark",
          blockId: "p-1",
          blockType: "paragraph",
          message: "unknown mark"
        }
      ]
    });

    expect(details).toMatchObject({
      hasWarnings: true,
      total: 3
    });
    expect(details.groups[0].code).toBe("docx-image-relationship-fallback");
    expect(details.groups.map((group) => group.code)).toEqual(
      expect.arrayContaining([
        "docx-image-relationship-fallback",
        "ir-extraction-warning",
        "docx-run-style-fallback"
      ])
    );
    expect(details.groups[0]).toMatchObject({
      severity: "blocked",
      severityLabel: "제한됨",
      title: "이미지 포함 실패",
      fallback:
        "이미지는 자리표시자로 내보냈습니다. 이미지 원본이 꼭 필요하지 않다면 무시하셔도 됩니다."
    });
    expect(details.groups[0].affectedBlocks[0]).toMatchObject({
      label: "블록 image-1",
      blockTypeLabel: "객체",
      path: "blocks[2]"
    });
    const irGroup = details.groups.find(
      (group) => group.code === "ir-extraction-warning"
    );
    expect(irGroup.affectedBlocks[0]).toMatchObject({
      label: "블록 p-1",
      blockTypeLabel: "문단",
      message: "unknown mark"
    });
  });

  it("warning summary만 있어도 detail fallback group을 만든다", () => {
    const details = createDOCXV0WarningDetails({
      docxWarningSummary: summarizeDOCXV0Warnings([
        {
          code: "docx-object-placeholder",
          severity: "warning",
          message: "object placeholder"
        }
      ])
    });

    expect(details).toMatchObject({
      hasWarnings: true,
      total: 1
    });
    expect(details.groups[0]).toMatchObject({
      code: "docx-object-placeholder",
      title: "객체 자리표시자",
      count: 1,
      affectedBlocks: []
    });
  });

  it("duplicate export guard를 ref 기반으로 처리한다", () => {
    const ref = { current: false };

    expect(startDOCXV0Export(ref)).toBe(true);
    expect(ref.current).toBe(true);
    expect(startDOCXV0Export(ref)).toBe(false);

    finishDOCXV0Export(ref);

    expect(ref.current).toBe(false);
    expect(startDOCXV0Export(ref)).toBe(true);
    expect(startDOCXV0Export(null)).toBe(false);
  });
});
