import { describe, expect, it } from "vitest";
import {
  HWPX_V0_MIME_TYPE,
  HWPX_V0_EXPORT_ERROR_MESSAGE,
  buildHWPXV0ExportNotice,
  createHWPXV0DownloadFileName,
  createHWPXV0PageSettingsFromDocSetting,
  createHWPXV0WarningDetails,
  isHWPXV0PackageBytes
} from "../../app/LIB/utils/hwpxExportButtonUtils";

describe("HWPX export button v0 utilities", () => {
  it("Dockit docSetting을 IR pageSettings로 변환한다", () => {
    expect(
      createHWPXV0PageSettingsFromDocSetting({
        pageWidth: 210,
        pageHeight: 297,
        paddingTop: 20,
        paddingBottom: 21,
        paddingLeft: 22,
        paddingRight: 23,
        lineHeight: 1.6
      })
    ).toEqual({
      widthMm: 210,
      heightMm: 297,
      paddingTopMm: 20,
      paddingBottomMm: 21,
      paddingLeftMm: 22,
      paddingRightMm: 23,
      lineHeight: 1.6
    });
  });

  it("여백 0은 유지하고 잘못된 page size는 기본값으로 보정한다", () => {
    expect(
      createHWPXV0PageSettingsFromDocSetting({
        pageWidth: -1,
        pageHeight: "bad",
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        lineHeight: 0
      })
    ).toEqual({
      widthMm: 210,
      heightMm: 297,
      paddingTopMm: 0,
      paddingBottomMm: 0,
      paddingLeftMm: 0,
      paddingRightMm: 0,
      lineHeight: 1.5
    });
  });

  it("파일명에 쓸 수 없는 문자를 정리하고 hwpx 확장자를 붙인다", () => {
    expect(createHWPXV0DownloadFileName(' 회의록:초안/검토? ')).toBe(
      "회의록_초안_검토_.hwpx"
    );
    expect(createHWPXV0DownloadFileName("보고서.hwpx")).toBe("보고서.hwpx");
    expect(createHWPXV0DownloadFileName("CON")).toBe("문서.hwpx");
    expect(createHWPXV0DownloadFileName("CON.hwpx")).toBe("문서.hwpx");
    expect(createHWPXV0DownloadFileName("마감본...")).toBe("마감본.hwpx");
    expect(createHWPXV0DownloadFileName("")).toBe("문서.hwpx");
    expect(HWPX_V0_MIME_TYPE).toBe("application/hwp+zip");
    expect(HWPX_V0_EXPORT_ERROR_MESSAGE).toContain("다시 시도");
  });

  it("HWPX package bytes signature를 확인한다", () => {
    expect(isHWPXV0PackageBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(
      true
    );
    expect(isHWPXV0PackageBytes(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(
      false
    );
  });

  it("warning summary를 사용자 표시용 toast 문구로 축약한다", () => {
    expect(buildHWPXV0ExportNotice()).toEqual({
      toastType: "success",
      message: "HWPX v0 파일을 다운로드했습니다."
    });

    expect(
      buildHWPXV0ExportNotice({
        hwpxWarningSummary: {
          total: 2,
          warningCount: 1,
          blockedCount: 1,
          items: [
            {
              code: "unsupported-block",
              severity: "blocked",
              count: 1,
              fallback: "placeholder",
              visiblePlaceholder: true,
              firstMessage: "Unsupported block"
            }
          ]
        },
        irWarningCount: 1
      })
    ).toEqual({
      toastType: "warning",
      message:
        "HWPX v0 파일을 다운로드했습니다. 일부 내용은 자리표시자로 보일 수 있습니다. (3개 항목)"
    });

    expect(
      buildHWPXV0ExportNotice({
        hwpxWarningSummary: {
          total: 1,
          warningCount: 1,
          blockedCount: 0,
          items: [
            {
              code: "run-style-fallback",
              severity: "warning",
              count: 1,
              fallback: "style fallback",
              visiblePlaceholder: false,
              firstMessage: "Run style fallback"
            }
          ]
        }
      })
    ).toEqual({
      toastType: "info",
      message:
        "HWPX v0 파일을 다운로드했습니다. 일부 서식은 단순화될 수 있습니다. (1개 항목)"
    });
  });

  it("HWPX warning을 상세 UX용 그룹으로 변환한다", () => {
    const details = createHWPXV0WarningDetails({
      hwpxWarnings: [
        {
          code: "object-placeholder",
          severity: "warning",
          message: "Object media parts are not emitted.",
          sectionIndex: 0,
          blockIndex: 2,
          blockType: "object",
          path: "sections[0].blocks[2]"
        },
        {
          code: "unsupported-block",
          severity: "blocked",
          message: "Unsupported IR block 'codeBlock'.",
          sectionIndex: 0,
          blockIndex: 3,
          blockType: "unsupported",
          path: "sections[0].blocks[3]"
        }
      ],
      hwpxWarningSummary: {
        total: 2,
        warningCount: 1,
        blockedCount: 1,
        items: [
          {
            code: "object-placeholder",
            severity: "warning",
            count: 1,
            fallback: "placeholder",
            visiblePlaceholder: true,
            firstMessage: "Object media parts are not emitted."
          },
          {
            code: "unsupported-block",
            severity: "blocked",
            count: 1,
            fallback: "raw text",
            visiblePlaceholder: true,
            firstMessage: "Unsupported IR block 'codeBlock'."
          }
        ]
      },
      irWarnings: ["지원하지 않는 block node: codeBlock"]
    });

    expect(details.hasWarnings).toBe(true);
    expect(details.total).toBe(3);
    expect(details.groups[0].code).toBe("unsupported-block");
    expect(details.groups.map((group) => group.code)).toEqual(
      expect.arrayContaining([
        "unsupported-block",
        "ir-extraction-warning",
        "object-placeholder"
      ])
    );
    expect(details.groups[0]).toMatchObject({
      title: "지원하지 않는 블록",
      severity: "blocked",
      severityLabel: "제한됨",
      count: 1
    });
    expect(details.groups[0].fallback).toContain("원문 텍스트");
    expect(details.groups[0].affectedBlocks[0]).toMatchObject({
      label: "1번째 섹션 · 4번째 블록",
      blockTypeLabel: "지원하지 않는 블록",
      path: "sections[0].blocks[3]"
    });
    expect(
      details.groups.find((group) => group.code === "ir-extraction-warning")
    ).toMatchObject({
      code: "ir-extraction-warning",
      title: "편집기 구조 변환 경고",
      count: 1
    });
    expect(
      details.groups.find((group) => group.code === "object-placeholder")
    ).toMatchObject({
      code: "object-placeholder",
      title: "이미지/객체 자리표시자",
      severityLabel: "확인 필요"
    });
  });

  it("summary만 있어도 warning 상세 그룹을 만들 수 있다", () => {
    const details = createHWPXV0WarningDetails({
      hwpxWarningSummary: {
        total: 1,
        warningCount: 1,
        blockedCount: 0,
        items: [
          {
            code: "run-style-fallback",
            severity: "warning",
            count: 2,
            fallback: "style fallback",
            visiblePlaceholder: false,
            firstMessage: "Run style fallback"
          }
        ]
      }
    });

    expect(details).toMatchObject({
      hasWarnings: true,
      total: 2
    });
    expect(details.groups[0]).toMatchObject({
      code: "run-style-fallback",
      title: "글자 서식 일부 단순화",
      count: 2,
      affectedBlocks: []
    });
  });

  it("DOCX paragraph tab/style HWPX fallback warning copy를 제공한다", () => {
    const details = createHWPXV0WarningDetails({
      hwpxWarnings: [
        {
          code: "paragraph-tabs-fallback",
          severity: "warning",
          message: "DOCX paragraph tab-stop metadata was not emitted.",
          sectionIndex: 0,
          blockIndex: 0,
          blockType: "paragraph",
          path: "sections[0].blocks[0]"
        },
        {
          code: "paragraph-style-fallback",
          severity: "warning",
          message: "DOCX paragraph style metadata was not emitted.",
          sectionIndex: 0,
          blockIndex: 1,
          blockType: "heading",
          path: "sections[0].blocks[1]"
        }
      ]
    });

    expect(details.groups.map((group) => group.code)).toEqual(
      expect.arrayContaining(["paragraph-tabs-fallback", "paragraph-style-fallback"])
    );
    expect(
      details.groups.find((group) => group.code === "paragraph-tabs-fallback")
    ).toMatchObject({
      title: "문단 탭 위치 단순화",
      fallback:
        "문단 텍스트는 유지하고 탭 위치 의미만 경고로 표시했습니다. 탭 정렬이 중요하지 않으면 무시하셔도 됩니다."
    });
    expect(
      details.groups.find((group) => group.code === "paragraph-style-fallback")
    ).toMatchObject({
      title: "문단 스타일 정보 단순화",
      fallback:
        "문단 텍스트와 지원되는 간격 정보는 유지하고 스타일 의미만 경고로 표시했습니다. 스타일 이름 재사용이 중요하지 않으면 무시하셔도 됩니다."
    });
  });
});
