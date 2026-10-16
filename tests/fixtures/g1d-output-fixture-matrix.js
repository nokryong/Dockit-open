import {
  createAiReportD5cFinalRollbackHtml
} from "./ai-report-d5c-durability-fixture";

const COMMON_STYLE = `
  <style>
    .g1d-fixture {
      color: #172033;
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }
    .g1d-fixture h1 {
      margin: 0 0 18px;
      color: #173b68;
      font-size: 28px;
      break-after: avoid-page;
    }
    .g1d-fixture h2 {
      margin: 24px 0 10px;
      color: #24527f;
      font-size: 20px;
      break-after: avoid-page;
    }
    .g1d-fixture p,
    .g1d-fixture blockquote,
    .g1d-fixture li {
      widows: 3;
      orphans: 3;
    }
    .g1d-fixture table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .g1d-fixture th,
    .g1d-fixture td {
      padding: 7px 9px;
      border: 1px solid #8fa3b8;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    .g1d-fixture th {
      background: #eef4fb;
    }
    .g1d-fixture figure {
      max-width: 100%;
      margin: 18px 0;
      break-inside: avoid-page;
    }
    .g1d-fixture figcaption,
    .g1d-fixture [data-output-label] {
      font-size: 12px;
      line-height: 1.4;
    }
    .g1d-fixture svg,
    .g1d-fixture img {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .g1d-fixture a {
      color: #185fa8;
      text-decoration: underline;
    }
  </style>
`;

const wrapFixture = ({ id, kind, origin, body }) => `
  ${COMMON_STYLE}
  <article
    class="g1d-fixture g1d-fixture--${kind}"
    data-g1d-fixture="${id}"
    data-g1d-kind="${kind}"
    data-g1d-origin="${origin}"
  >
    ${body}
  </article>
`;

const tableRows = Array.from({ length: 24 }, (_, index) => {
  const rowNumber = index + 1;
  return `
    <tr>
      <td>${String(rowNumber).padStart(2, "0")}</td>
      <td>검증 항목 ${rowNumber}</td>
      <td>${rowNumber % 3 === 0 ? "검토 필요" : "정상"}</td>
      <td>G1D-TABLE-ROW-${String(rowNumber).padStart(2, "0")} 설명은 셀 너비 안에서 안전하게 줄바꿈됩니다.</td>
    </tr>
  `;
}).join("");

const importedImage = [
  "data:image/svg+xml;base64,",
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MjAiIGhlaWdodD0iMjIwIiB2aWV3Qm94PSIwIDAgNzIwIDIyMCI+PHJlY3Qgd2lkdGg9IjcyMCIgaGVpZ2h0PSIyMjAiIHJ4PSIxOCIgZmlsbD0iI2U4ZjFmYiIvPjxyZWN0IHg9IjU2IiB5PSI1NCIgd2lkdGg9IjE2MCIgaGVpZ2h0PSIxMTIiIHJ4PSIxMCIgZmlsbD0iIzJkNmZhOCIvPjxyZWN0IHg9IjI4MCIgeT0iODIiIHdpZHRoPSIzODQiIGhlaWdodD0iMTgiIHJ4PSI5IiBmaWxsPSIjN2FhN2NmIi8+PHJlY3QgeD0iMjgwIiB5PSIxMjAiIHdpZHRoPSIzMDAiIGhlaWdodD0iMTgiIHJ4PSI5IiBmaWxsPSIjOWJiYmQ4Ii8+PHRleHQgeD0iMTM2IiB5PSIxMjIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNiIgZmlsbD0id2hpdGUiPklNUE9SVDwvdGV4dD48L3N2Zz4="
].join("");

const reportHtml = `
  ${COMMON_STYLE}
  <section
    class="g1d-fixture g1d-fixture--report"
    data-g1d-fixture="report-ai-on"
    data-g1d-kind="report"
    data-g1d-origin="ai-on"
  >
    ${createAiReportD5cFinalRollbackHtml()}
  </section>
`;

const researchNoteHtml = wrapFixture({
  id: "research-note-manual",
  kind: "research-note",
  origin: "ai-off-manual",
  body: `
    <h1>지역 기록 보존을 위한 연구 노트</h1>
    <p><strong>G1D-RESEARCH-MARKER</strong> 이 문서는 AI 없이 작성한 조사 메모의 출력 내구성을 검증합니다.</p>
    <h2>연구 질문</h2>
    <p>공공 기록을 장기간 보존할 때 원문, 해석, 출처를 어떤 순서로 제시해야 하는가?</p>
    <blockquote style="margin: 18px 0; padding: 12px 16px; border-left: 4px solid #2d6fa8; background: #f4f8fc;">
      원문과 작성자의 해석을 분리하면 독자가 근거를 다시 확인하기 쉽습니다.
    </blockquote>
    <h2>관찰 기록</h2>
    <ol>
      <li>원자료의 작성 시점과 수집 경로를 먼저 기록합니다.</li>
      <li>요약 문단에는 확인된 사실과 추론을 구분합니다.</li>
      <li>후속 검토자가 접근할 수 있는 영구 링크를 남깁니다.</li>
    </ol>
    <h2>참고 문헌</h2>
    <p data-output-label="true">[1] 국가기록원, 기록관리 지침. [2] 지역사 아카이브 운영 보고서.</p>
    <p><a href="https://example.com/research-archive">연구 자료 보관 위치</a></p>
  `
});

const tableHeavyHtml = wrapFixture({
  id: "table-heavy-manual",
  kind: "table-heavy",
  origin: "ai-off-manual",
  body: `
    <h1>운영 점검표</h1>
    <p><strong>G1D-TABLE-MARKER</strong> 반복 행과 긴 셀 문장이 페이지 경계에서 잘리지 않는지 확인합니다.</p>
    <table data-g1d-primary-table="true">
      <thead>
        <tr><th style="width: 10%">번호</th><th style="width: 22%">항목</th><th style="width: 16%">상태</th><th>설명</th></tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p data-output-label="true">표 1. 24개 운영 점검 항목</p>
  `
});

const chartHeavyHtml = wrapFixture({
  id: "chart-heavy-ai-on",
  kind: "chart-heavy",
  origin: "ai-on",
  body: `
    <h1>분기별 성과 분석</h1>
    <p><strong>G1D-CHART-MARKER</strong> AI 보조 분석 뒤에도 축·범례·값 label이 읽을 수 있어야 합니다.</p>
    <figure data-chart-block="bar">
      <figcaption data-output-label="true">그림 1. 분기별 완료 과제 수</figcaption>
      <svg viewBox="0 0 720 300" role="img" aria-label="분기별 완료 과제 막대 차트">
        <line x1="72" y1="250" x2="680" y2="250" stroke="#5d7287" stroke-width="2"/>
        <line x1="72" y1="30" x2="72" y2="250" stroke="#5d7287" stroke-width="2"/>
        <g fill="#2f6fed">
          <rect x="130" y="150" width="90" height="100"/>
          <rect x="270" y="105" width="90" height="145"/>
          <rect x="410" y="72" width="90" height="178"/>
          <rect x="550" y="48" width="90" height="202"/>
        </g>
        <g font-family="Arial" font-size="16" text-anchor="middle" fill="#172033" data-output-label="true">
          <text x="175" y="278">1분기</text><text x="315" y="278">2분기</text>
          <text x="455" y="278">3분기</text><text x="595" y="278">4분기</text>
          <text x="175" y="140">42</text><text x="315" y="95">61</text>
          <text x="455" y="62">75</text><text x="595" y="38">84</text>
        </g>
      </svg>
    </figure>
    <figure data-chart-block="line">
      <figcaption data-output-label="true">그림 2. 월별 검토 소요 시간</figcaption>
      <svg viewBox="0 0 720 260" role="img" aria-label="월별 검토 소요 시간 선 차트">
        <polyline points="80,190 190,160 300,174 410,118 520,95 630,62" fill="none" stroke="#d35f32" stroke-width="6"/>
        <g fill="#d35f32"><circle cx="80" cy="190" r="8"/><circle cx="190" cy="160" r="8"/><circle cx="300" cy="174" r="8"/><circle cx="410" cy="118" r="8"/><circle cx="520" cy="95" r="8"/><circle cx="630" cy="62" r="8"/></g>
        <g font-family="Arial" font-size="15" text-anchor="middle" fill="#172033" data-output-label="true">
          <text x="80" y="225">1월</text><text x="190" y="225">2월</text><text x="300" y="225">3월</text>
          <text x="410" y="225">4월</text><text x="520" y="225">5월</text><text x="630" y="225">6월</text>
        </g>
      </svg>
    </figure>
  `
});

const diagramHeavyHtml = wrapFixture({
  id: "diagram-heavy-manual",
  kind: "diagram-heavy",
  origin: "ai-off-manual",
  body: `
    <h1>문서 검토 흐름도</h1>
    <p><strong>G1D-DIAGRAM-MARKER</strong> 수동으로 만든 연결선과 노드 label이 출력에서도 겹치지 않아야 합니다.</p>
    <figure data-diagram-block="workflow">
      <figcaption data-output-label="true">그림 1. 문서 검토와 승인 흐름</figcaption>
      <svg viewBox="0 0 760 520" role="img" aria-label="문서 검토와 승인 흐름도">
        <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#536b80"/></marker></defs>
        <g fill="none" stroke="#536b80" stroke-width="4" marker-end="url(#arrow)">
          <path d="M210 90 H330"/><path d="M540 90 C650 90 650 230 540 230"/>
          <path d="M330 230 H210"/><path d="M210 300 H330"/><path d="M540 300 H650"/>
        </g>
        <g stroke="#2b5f8d" stroke-width="3">
          <rect x="30" y="40" width="180" height="100" rx="16" fill="#e8f1fb"/>
          <rect x="330" y="40" width="210" height="100" rx="16" fill="#e7f6ef"/>
          <rect x="330" y="180" width="210" height="100" rx="16" fill="#fff3df"/>
          <rect x="30" y="180" width="180" height="100" rx="16" fill="#f7eafa"/>
          <rect x="330" y="320" width="210" height="100" rx="16" fill="#e9efff"/>
          <rect x="650" y="250" width="90" height="100" rx="16" fill="#e6f4f1"/>
        </g>
        <g font-family="Arial" font-size="18" text-anchor="middle" fill="#172033" data-output-label="true">
          <text x="120" y="84"><tspan x="120" dy="0">초안</tspan><tspan x="120" dy="26">작성</tspan></text>
          <text x="435" y="84"><tspan x="435" dy="0">근거</tspan><tspan x="435" dy="26">확인</tspan></text>
          <text x="435" y="224"><tspan x="435" dy="0">범위</tspan><tspan x="435" dy="26">검토</tspan></text>
          <text x="120" y="224"><tspan x="120" dy="0">수정</tspan><tspan x="120" dy="26">반영</tspan></text>
          <text x="435" y="364"><tspan x="435" dy="0">최종</tspan><tspan x="435" dy="26">승인</tspan></text>
          <text x="695" y="294"><tspan x="695" dy="0">PDF</tspan><tspan x="695" dy="26">출력</tspan></text>
        </g>
      </svg>
    </figure>
  `
});

const importedDocumentHtml = wrapFixture({
  id: "imported-document-manual",
  kind: "imported-document",
  origin: "ai-off-manual",
  body: `
    <h1>가져온 사업 계획 문서</h1>
    <p><strong>G1D-IMPORTED-MARKER</strong> DOCX/HWPX에서 가져온 혼합 구조를 대표하는 결정적 HTML입니다.</p>
    <img src="${importedImage}" alt="가져온 문서의 요약 배너" width="720" height="220" />
    <h2>추진 목표</h2>
    <ul><li>문서 구조를 보존합니다.</li><li>이미지와 표의 읽기 순서를 유지합니다.</li><li>외부 링크를 안전하게 표시합니다.</li></ul>
    <table data-g1d-imported-table="true">
      <thead><tr><th>단계</th><th>기간</th><th>산출물</th></tr></thead>
      <tbody>
        <tr><td>준비</td><td>1주</td><td>범위 정의서</td></tr>
        <tr><td>실행</td><td>3주</td><td>검토 가능한 초안</td></tr>
        <tr><td>마감</td><td>1주</td><td>최종 PDF와 원본 패키지</td></tr>
      </tbody>
    </table>
    <p data-output-label="true">표 1. 가져온 문서의 단계별 산출물</p>
    <p><a href="https://example.com/import-source">원본 문서 출처</a></p>
  `
});

export const G1D_OUTPUT_FIXTURE_MATRIX = Object.freeze([
  Object.freeze({
    id: "report-ai-on",
    kind: "report",
    origin: "ai-on",
    html: reportHtml,
    marker: "D5C-HUMAN-10: approved human edit",
    requiredSelectors: [".d5c-report", "table", "[data-d5c-chart]"],
    expectedImageCount: 0,
    expectedLabelCountMin: 1,
    expectedPages: Object.freeze({ min: 8, max: 12 })
  }),
  Object.freeze({
    id: "research-note-manual",
    kind: "research-note",
    origin: "ai-off-manual",
    html: researchNoteHtml,
    marker: "G1D-RESEARCH-MARKER",
    requiredSelectors: ["blockquote", "ol", "a[href]"],
    expectedImageCount: 0,
    expectedLabelCountMin: 1,
    expectedPages: Object.freeze({ min: 1, max: 2 })
  }),
  Object.freeze({
    id: "table-heavy-manual",
    kind: "table-heavy",
    origin: "ai-off-manual",
    html: tableHeavyHtml,
    marker: "G1D-TABLE-MARKER",
    requiredSelectors: ["[data-g1d-primary-table]", "tbody tr:nth-child(24)"],
    expectedImageCount: 0,
    expectedLabelCountMin: 1,
    expectedPages: Object.freeze({ min: 2, max: 2 })
  }),
  Object.freeze({
    id: "chart-heavy-ai-on",
    kind: "chart-heavy",
    origin: "ai-on",
    html: chartHeavyHtml,
    marker: "G1D-CHART-MARKER",
    requiredSelectors: ["[data-chart-block='bar']", "[data-chart-block='line']"],
    expectedImageCount: 0,
    expectedLabelCountMin: 10,
    expectedPages: Object.freeze({ min: 1, max: 2 })
  }),
  Object.freeze({
    id: "diagram-heavy-manual",
    kind: "diagram-heavy",
    origin: "ai-off-manual",
    html: diagramHeavyHtml,
    marker: "G1D-DIAGRAM-MARKER",
    requiredSelectors: ["[data-diagram-block]", "marker#arrow"],
    expectedImageCount: 0,
    expectedLabelCountMin: 7,
    expectedPages: Object.freeze({ min: 1, max: 2 })
  }),
  Object.freeze({
    id: "imported-document-manual",
    kind: "imported-document",
    origin: "ai-off-manual",
    html: importedDocumentHtml,
    marker: "G1D-IMPORTED-MARKER",
    requiredSelectors: ["img", "[data-g1d-imported-table]", "a[href]"],
    expectedImageCount: 1,
    expectedLabelCountMin: 1,
    expectedPages: Object.freeze({ min: 1, max: 2 })
  })
]);
