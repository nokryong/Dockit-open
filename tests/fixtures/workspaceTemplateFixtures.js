const CONVERSION_SAMPLE_CONTENT =
  "<h1>변환 확인 샘플</h1><p>이 문서는 Dockit의 현재 가져오기와 내보내기 경계를 확인하기 위한 예시입니다.</p><p><strong>지원 범위 확인:</strong> <code>docs/CONVERSION_SUPPORT_SCOPE.md</code>의 현재 지원·부분 지원·미지원 항목과 경고를 함께 확인하세요. 이 샘플은 완전한 모양이나 배치 일치를 보장하지 않습니다.</p><h2>제목과 본문</h2><p>일반 문단과 <strong>강조 텍스트</strong>를 포함합니다.</p><h2>목록</h2><ul><li><p>첫 번째 항목</p></li><li><p>두 번째 항목</p></li></ul><h2>표</h2><table><tbody><tr><th><p>항목</p></th><th><p>확인</p></th></tr><tr><td><p>본문</p></td><td><p>완료</p></td></tr></tbody></table>";

export const CONVERSION_SAMPLE_TEMPLATE_FIXTURE = Object.freeze({
  id: "conversion-sample",
  title: "변환 확인 샘플",
  purpose: "가져오기와 내보내기 회귀를 검증합니다.",
  outline: Object.freeze(["제목과 본문", "목록", "표"]),
  content: CONVERSION_SAMPLE_CONTENT
});

export const createConversionSampleDocumentFixture = () => ({
  title: CONVERSION_SAMPLE_TEMPLATE_FIXTURE.title,
  content: CONVERSION_SAMPLE_TEMPLATE_FIXTURE.content,
  docSetting: {
    pageWidth: 210,
    pageHeight: 297,
    paddingTop: 25,
    paddingBottom: 25,
    paddingLeft: 25,
    paddingRight: 25,
    lineHeight: 1.5
  },
  bulletStyle: {},
  viewPage: true,
  pageNumber: "center",
  focus: 0
});
