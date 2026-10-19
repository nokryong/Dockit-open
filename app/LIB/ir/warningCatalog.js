const DEFAULT_WARNING_ENTRY = Object.freeze({
  "functionalArea": "기타 개체",
  "status": "생략·대체",
  "title": "DOCX 대체 처리",
  "description": "DOCX foundation에서 아직 세부적으로 분류하지 않은 항목을 안전한 대체 표현으로 내보냈습니다.",
  "fallback": "가능한 내용을 유지하고 DOCX foundation에서 안전한 대체 표현으로 내보냈습니다.",
  "visiblePlaceholder": false
});

export const WARNING_CATALOG = Object.freeze({
  "docx-import-note-part-invalid": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "DOCX 각주·미주 파트 오류",
    "description": "문서 관계 또는 각주·미주 파트를 안전하게 해석할 수 없습니다.",
    "fallback": "원본 DOCX에서 각주·미주 구조를 확인한 뒤 다시 가져오세요.",
    "visiblePlaceholder": false
  },
  "docx-import-note-numbering-unsupported": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "지원하지 않는 각주·미주 번호 체계",
    "description": "1부터 시작하는 연속 10진 번호 체계만 지원합니다.",
    "fallback": "Word에서 기본 연속 번호 체계로 바꾼 뒤 다시 가져오세요.",
    "visiblePlaceholder": false
  },
  "docx-import-note-pair-invalid": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "각주·미주 참조와 본문이 일치하지 않음",
    "description": "각주·미주 참조는 하나의 정상 본문과 정확히 연결되어야 합니다.",
    "fallback": "중복, 누락, 고아 본문 또는 사용자 지정 표식을 수정하세요.",
    "visiblePlaceholder": false
  },
  "docx-import-note-content-unsupported": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "지원하지 않는 각주·미주 내용",
    "description": "각주·미주 본문에서는 문단, 텍스트, 줄바꿈, 지원되는 서식만 보존합니다.",
    "fallback": "필드, 그림, 개체, 중첩 각주·미주를 제거하거나 단순 텍스트로 바꾸세요.",
    "visiblePlaceholder": false
  },
  "docx-import-note-hyperlink-unsupported": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "각주·미주 링크 오류",
    "description": "안전한 http, https, mailto 링크와 해당 파트의 관계만 지원합니다.",
    "fallback": "링크 대상과 각주·미주 파트 관계를 확인하세요.",
    "visiblePlaceholder": false
  },
  "docx-run-style-fallback": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "글자 서식 일부 단순화",
    "description": "DOCX foundation이 아직 일부 글자 서식을 Word 문서 구조로 그대로 옮기지 못했습니다.",
    "fallback": "텍스트는 유지하고 일부 글자 서식만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "docx-link-target-fallback": {
    "functionalArea": "링크",
    "status": "생략·대체",
    "title": "링크 대상 일부 생략",
    "description": "지원하지 않는 링크 주소 형식은 Word hyperlink relationship으로 만들지 않았습니다.",
    "fallback": "표시 텍스트는 유지하고 지원하지 않는 링크 대상은 생략했습니다.",
    "visiblePlaceholder": false
  },
  "docx-link-attribute-fallback": {
    "functionalArea": "링크",
    "status": "부분 유지",
    "title": "링크 부가 정보 생략",
    "description": "Word 문서로 옮길 때 새 창, 제목 같은 링크 부가 속성은 현재 지원하지 않습니다.",
    "fallback": "링크 주소는 유지하고 새 창/제목 같은 부가 속성은 생략했습니다.",
    "visiblePlaceholder": false
  },
  "docx-list-fallback": {
    "functionalArea": "목록",
    "status": "부분 유지",
    "title": "목록 일부 단순화",
    "description": "중첩 목록, 할 일 목록, 사용자 지정 목록 기호는 Word 기본 목록으로 그대로 옮기지 않고 일반 텍스트로 단순화했습니다. 목록 내용은 유지되며, 목록 모양만 달라질 수 있으니 문서 의미가 맞으면 무시하셔도 됩니다.",
    "fallback": "목록 내용은 유지하고 일부 목록 기호만 일반 텍스트로 내보냈습니다. 목록 모양 차이만 확인하면 되므로 의미가 맞으면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "docx-paragraph-style-fallback": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "문단 스타일 정보 일부 생략",
    "description": "문단 스타일 이름이나 연결 정보는 Word 기본 스타일 체계와 충돌하지 않도록 일부 생략했습니다. 문단 텍스트와 제목 수준은 유지되며, 스타일 이름 재사용이 중요하지 않으면 무시하셔도 됩니다.",
    "fallback": "문단 텍스트와 제목 수준은 유지하고 충돌하는 스타일 정보만 생략했습니다. 스타일 이름보다 내용 구조가 중요하면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "docx-image-relationship-fallback": {
    "functionalArea": "이미지·미디어",
    "status": "생략·대체",
    "title": "이미지 포함 실패",
    "description": "DOCX에 직접 포함할 수 없는 이미지 형식이나 주소는 실제 이미지 대신 자리표시자로 바뀝니다. 이미지 본문이 꼭 필요하면 원본 위치를 다시 확인해야 하며, 장식용 이미지라면 무시하셔도 됩니다.",
    "fallback": "이미지는 자리표시자로 내보냈습니다. 이미지 원본이 꼭 필요하지 않다면 무시하셔도 됩니다.",
    "visiblePlaceholder": true
  },
  "docx-object-placeholder": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "객체 자리표시자",
    "description": "현재 DOCX foundation이 지원하지 않는 객체는 실제 객체 대신 자리표시자 문구로 바뀝니다. 객체 내용이 중요하면 원본 문서를 확인해야 하며, 참고용 위치 표시만으로 충분하면 무시하셔도 됩니다.",
    "fallback": "객체 위치를 알 수 있도록 자리표시자 문구를 넣었습니다. 실제 객체 복원이 필요 없으면 무시하셔도 됩니다.",
    "visiblePlaceholder": true
  },
  "docx-table-style-fallback": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "표 세부 스타일 단순화",
    "description": "표 내용과 기본 구조는 유지하지만, Word에서 같은 방식으로 표현하기 어려운 세부 표 스타일은 단순화됩니다. 표 읽기에는 문제가 없으면 무시하셔도 됩니다.",
    "fallback": "표 내용과 기본 격자는 유지하고 세부 표 스타일만 단순화했습니다. 표 읽기 문제가 없으면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "docx-table-border-fallback": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "표 테두리 일부 생략",
    "description": "지원 범위를 벗어난 표 테두리 값은 Word에서 깨지지 않도록 일부 생략했습니다. 표 내용은 유지되므로 테두리 모양만 중요하지 않으면 무시하셔도 됩니다.",
    "fallback": "표 내용은 유지하고 일부 테두리 값만 생략했습니다. 테두리 모양 차이만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "docx-table-fill-fallback": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "셀 배경 일부 생략",
    "description": "지원하지 않는 셀 배경색 또는 채우기 값은 Word 문서에서 일부 생략했습니다. 셀 내용은 유지되므로 색 강조가 중요하지 않으면 무시하셔도 됩니다.",
    "fallback": "셀 내용은 유지하고 일부 배경색만 생략했습니다. 배경색 차이만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "docx-unsupported-block": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "지원하지 않는 블록",
    "description": "현재 DOCX foundation이 지원하지 않는 블록은 실제 기능 대신 텍스트만 남기거나 자리표시자로 바뀝니다. 해당 블록 자체가 중요하면 원본 문서를 확인해야 하며, 보조 정보라면 무시하셔도 됩니다.",
    "fallback": "원문 텍스트가 있으면 보존하고, 없으면 자리표시자를 넣었습니다. 원래 블록 기능이 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": true
  },
  "ir-extraction-warning": {
    "functionalArea": "기타 개체",
    "status": "부분 유지",
    "title": "문서 구조 변환 경고",
    "description": "DOCX로 내보내기 전 Dockit 문서를 공통 IR 구조로 바꾸는 중 일부 구조가 단순화됩니다. 문서 핵심 내용이 맞으면 무시하셔도 되지만, 특정 블록 모양이 중요하면 결과를 확인해야 합니다.",
    "fallback": "가능한 문서 내용은 유지한 뒤 DOCX foundation이 지원하는 범위로 내보냈습니다. 결과 문서가 읽히면 무시하셔도 됩니다.",
    "visiblePlaceholder": false,
    "variants": {
      "hwpxExport": {
        "title": "편집기 구조 변환 경고",
        "description": "편집기 문서를 HWPX용 중간 구조로 바꾸는 중 일부 구조는 단순화됩니다. 문서 핵심 내용은 유지되므로 출력 결과가 읽히면 무시하셔도 됩니다.",
        "fallback": "가능한 내용은 유지하고 HWPX v0에서 다룰 수 있는 구조로 바꿨습니다. 결과 문서가 읽히면 무시하셔도 됩니다.",
        "visiblePlaceholder": false
      }
    }
  },
  "run-style-fallback": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "글자 서식 일부 단순화",
    "description": "색상, 태그 같은 세부 글자 서식 일부는 HWPX v0에서 기본 텍스트로 단순화됩니다. 글자 내용은 유지되므로 세부 꾸밈이 중요하지 않으면 무시하셔도 됩니다.",
    "fallback": "텍스트는 유지하고 지원하지 않는 글자 서식만 단순화했습니다. 세부 꾸밈 차이만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "link-attribute-fallback": {
    "functionalArea": "링크",
    "status": "부분 유지",
    "title": "링크 속성 일부 단순화",
    "description": "링크 주소는 한/글 하이퍼링크로 유지하지만 새 창 대상이나 제목 같은 부가 속성은 생략됩니다. 링크 열기만 중요하면 무시하셔도 됩니다.",
    "fallback": "클릭 가능한 링크와 표시 텍스트는 유지하고 부가 속성만 생략했습니다. 링크 열기만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "link-target-fallback": {
    "functionalArea": "링크",
    "status": "생략·대체",
    "title": "링크 대상 일부 단순화",
    "description": "문서 내부 이동, 파일 경로, 안전하지 않거나 아직 지원하지 않는 링크 대상은 HWPX 하이퍼링크로 만들지 않습니다. 표시 텍스트만 필요하면 무시하셔도 되지만, 실제 이동이 필요하면 원본 링크를 확인해야 합니다.",
    "fallback": "표시 텍스트는 유지하고 링크 대상만 생략했습니다. 실제 이동이 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "list-marker-text-fallback": {
    "functionalArea": "목록",
    "status": "부분 유지",
    "title": "목록 기호 일부 텍스트 처리",
    "description": "일부 목록 단계는 한/글 기본 번호 매김 대신 문단 앞 텍스트로 바뀝니다. 목록 내용은 유지되므로 모양 차이만 괜찮으면 무시하셔도 됩니다.",
    "fallback": "목록 내용은 유지하고 번호/기호를 문단 앞 텍스트로 넣었습니다. 목록 모양 차이만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "task-list-fallback": {
    "functionalArea": "목록",
    "status": "부분 유지",
    "title": "체크 목록 단순화",
    "description": "체크박스 상태는 HWPX 기본 체크 목록으로 옮기지 않고 일반 텍스트 표시로 바뀝니다. 체크 여부만 읽히면 무시하셔도 됩니다.",
    "fallback": "체크 여부는 일반 텍스트 표시로 남겼습니다. 체크 상태만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "nested-list-fallback": {
    "functionalArea": "목록",
    "status": "부분 유지",
    "title": "중첩 목록 배치 단순화",
    "description": "깊게 들어간 목록의 들여쓰기와 재시작 규칙 일부는 단순화됩니다. 목록 내용은 유지되므로 정밀한 목록 배치가 중요하지 않으면 무시하셔도 됩니다.",
    "fallback": "목록 텍스트와 표시 기호는 유지하고 복잡한 들여쓰기만 줄였습니다. 배치 차이만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "table-border-metadata-only": {
    "functionalArea": "표",
    "status": "생략·대체",
    "title": "표 테두리 정보 일부 축약",
    "description": "예전 표 테두리 메타데이터 경로는 그대로 재현하지 않고 기본 표현으로 보정합니다. 표 내용은 유지되므로 테두리 모양이 중요하지 않으면 무시하셔도 됩니다.",
    "fallback": "표 내용은 유지하고 테두리는 기본 표현으로 보정했습니다. 테두리 모양 차이만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "table-border-style-fallback": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "표 테두리 스타일 보정",
    "description": "일부 표 테두리 값은 HWPX v0 지원 범위를 벗어나 가장 가까운 한/글 값으로 바뀝니다. 표 읽기에 문제가 없으면 무시하셔도 됩니다.",
    "fallback": "가장 가까운 한/글 테두리 값으로 보수적으로 바꿨습니다. 테두리 모양 차이만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "table-merge-layout-warning": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "병합 셀 배치 단순화",
    "description": "표 병합 정보는 유지하지만 복잡한 행·열 배치는 완전히 같지 않을 수 있습니다. 표 내용을 읽을 수 있으면 무시하셔도 되지만, 배치가 중요하면 확인이 필요합니다.",
    "fallback": "열림 안정성을 우선하고 병합 배치를 단순화했습니다. 배치 정확도가 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "paragraph-line-spacing-fallback": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "문단 줄 간격 일부 단순화",
    "description": "일부 DOCX 줄 간격 규칙은 HWPX 기본 줄 간격으로 그대로 내보내지 못해 지원되는 값이나 기본 간격으로 바뀝니다. 문단 내용이 맞으면 무시하셔도 되지만, 줄수와 페이지 길이가 중요하면 확인이 필요합니다.",
    "fallback": "문단 텍스트는 유지하고 지원하지 않는 줄 간격 규칙만 기본 또는 지원되는 간격으로 바꿨습니다. 페이지 배치가 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "paragraph-tabs-fallback": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "문단 탭 위치 단순화",
    "description": "DOCX 문단 탭 위치 정보는 보존하지만 HWPX v0 기본 탭 정지점으로는 내보내지 않습니다. 문단 내용만 중요하면 무시하셔도 되지만, 같은 정렬 위치가 필요하면 확인이 필요합니다.",
    "fallback": "문단 텍스트는 유지하고 탭 위치 의미만 경고로 표시했습니다. 탭 정렬이 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "paragraph-style-fallback": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "문단 스타일 정보 단순화",
    "description": "DOCX 문단 스타일 id/name 정보는 보존하지만 HWPX v0 기본 문단 스타일로는 내보내지 않습니다. 문단 내용과 제목 수준이 맞으면 무시하셔도 됩니다.",
    "fallback": "문단 텍스트와 지원되는 간격 정보는 유지하고 스타일 의미만 경고로 표시했습니다. 스타일 이름 재사용이 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "object-placeholder": {
    "functionalArea": "이미지·미디어",
    "status": "생략·대체",
    "title": "이미지/객체 자리표시자",
    "description": "이미지나 객체를 실제 HWPX 미디어로 넣지 못해 자리표시자 문구로 바뀝니다. 해당 미디어가 중요하면 원본을 확인해야 하며, 위치 표시만 필요하면 무시하셔도 됩니다.",
    "fallback": "문서 안에 자리표시자 문구를 넣어 빠진 위치를 알 수 있게 했습니다. 실제 미디어가 꼭 필요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": true
  },
  "semantic-block-fallback": {
    "functionalArea": "기타 개체",
    "status": "부분 유지",
    "title": "블록 의미 표현 단순화",
    "description": "코드 블록이나 인용문은 전용 블록으로 그대로 옮기지 않고 비슷한 문단 서식으로 표현합니다. 원문 내용은 유지되므로 의미 전달이 되면 무시하셔도 됩니다.",
    "fallback": "코드 블록은 고정폭 글꼴과 배경색으로, 인용문은 들여쓰기와 기울임으로 표현했습니다. 원문 의미만 확인하면 되므로 무시하셔도 됩니다.",
    "visiblePlaceholder": false
  },
  "unsupported-block": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "지원하지 않는 블록",
    "description": "현재 HWPX v0가 직접 표현하지 못하는 블록은 실제 기능 대신 텍스트나 자리표시자로 바뀝니다. 해당 블록 기능이 중요하면 원본을 확인해야 하며, 보조 정보라면 무시하셔도 됩니다.",
    "fallback": "원문 텍스트가 있으면 보존하고, 없으면 지원하지 않는 블록이라는 문구를 넣었습니다. 원래 블록 기능이 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": true
  },
  "unsupported-nested-block": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "목록/표 안의 지원하지 않는 블록",
    "description": "목록이나 표 안에서 직접 표현하기 어려운 블록은 짧은 텍스트나 자리표시자로 바뀝니다. 해당 내부 블록 기능이 중요하면 확인이 필요하며, 보조 정보라면 무시하셔도 됩니다.",
    "fallback": "가능한 텍스트는 유지하고, 표현할 수 없는 부분은 짧은 자리표시자로 남겼습니다. 내부 블록 기능이 중요하지 않으면 무시하셔도 됩니다.",
    "visiblePlaceholder": true
  },
  "docx-import-package-error": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "DOCX 패키지 열기 실패",
    "description": "올바른 DOCX 패키지로 열지 못해 가져오기를 진행하지 않았습니다.",
    "fallback": "DOCX 파일 구조를 읽지 못해 현재 문서는 바꾸지 않았습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-missing-entry": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "DOCX 필수 파일 누락",
    "description": "필수 문서 항목이 없어 현재 DOCX 파일은 그대로 가져올 수 없습니다.",
    "fallback": "필수 항목이 없는 부분은 해석하지 않고 현재 문서는 바꾸지 않았습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-xml-warning": {
    "functionalArea": "기타 개체",
    "status": "부분 유지",
    "title": "DOCX XML 일부 단순화",
    "description": "일부 XML 값은 최대한 읽었지만 같은 구조로 완전히 해석되지 않을 수 있습니다.",
    "fallback": "읽을 수 있는 내용은 유지하고 해석이 애매한 XML 값만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-xml-error": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "DOCX XML 해석 실패",
    "description": "문서 XML 일부를 해석하지 못해 안전한 범위만 가져오거나 적용을 막습니다.",
    "fallback": "해석하지 못한 XML 부분은 건너뛰고 안전한 범위만 유지했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-style-unsupported": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "DOCX 스타일 일부 미지원",
    "description": "스타일 정보는 최대한 보존하지만 같은 스타일 체계로 그대로 가져오지는 못할 수 있습니다.",
    "fallback": "문단 내용은 유지하고 지원하지 않는 스타일 정보만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-relationship-unsupported": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "DOCX 연결 정보 일부 생략",
    "description": "지원하지 않는 문서 연결 정보는 현재 가져오기 범위에서 제외했습니다.",
    "fallback": "문서 본문은 유지하고 지원하지 않는 연결 정보만 생략했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-media-metadata-only": {
    "functionalArea": "이미지·미디어",
    "status": "생략·대체",
    "title": "이미지 정보만 보존",
    "description": "이미지를 그대로 복원하지 못하면 이미지 정보만 남기고 경고합니다.",
    "fallback": "실제 이미지를 복원하지 못한 항목은 정보만 남겼습니다.",
    "visiblePlaceholder": true
  },
  "docx-import-table-partial": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "표 일부 단순화",
    "description": "복잡한 표 너비와 셀 배치는 최대한 보존하지만 완전히 같지 않을 수 있습니다.",
    "fallback": "표 내용은 유지하고 지원 범위를 벗어난 배치 정보만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-paragraph-partial": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "문단 서식 일부 단순화",
    "description": "줄 간격과 제목 구조 같은 문단 정보는 최대한 가져오지만 일부 세부 스타일은 달라질 수 있습니다.",
    "fallback": "문단 텍스트는 유지하고 일부 문단 서식만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-section-properties-partial": {
    "functionalArea": "페이지 설정",
    "status": "부분 유지",
    "title": "페이지 설정 일부 단순화",
    "description": "섹션과 페이지 설정은 기본 흐름만 가져오며 정확한 배치 차이는 남을 수 있습니다.",
    "fallback": "기본 페이지 설정만 유지하고 세부 배치 정보는 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-numbering-unsupported": {
    "functionalArea": "목록",
    "status": "생략·대체",
    "title": "목록 번호 규칙 일부 미지원",
    "description": "복잡한 번호 규칙은 현재 그대로 가져오지 않고 단순한 목록 의미만 남깁니다.",
    "fallback": "목록 내용은 유지하고 지원하지 않는 번호 규칙만 생략했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-hyperlink-relationship-unsupported": {
    "functionalArea": "링크",
    "status": "생략·대체",
    "title": "링크 대상 일부 복원 실패",
    "description": "웹 주소 링크는 유지하지만 내부 이동이나 지원하지 않는 링크 대상은 텍스트만 남길 수 있습니다.",
    "fallback": "표시 텍스트는 유지하고 복원하지 못한 링크 대상만 생략했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-run-unsupported": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "글자 서식 일부 미지원",
    "description": "자주 쓰는 글자 꾸밈은 가져오지만 문서 전용 글자 효과는 일부 빠질 수 있습니다.",
    "fallback": "텍스트는 유지하고 지원하지 않는 글자 꾸밈만 생략했습니다.",
    "visiblePlaceholder": false
  },
  "docx-import-unsupported-block": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "지원하지 않는 블록 생략",
    "description": "지원 범위를 벗어난 블록은 가능한 경우 텍스트만 남기고 경고합니다.",
    "fallback": "지원하지 않는 블록은 텍스트나 자리표시자로만 남겼습니다.",
    "visiblePlaceholder": true
  },
  "hwpx-import-package-error": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "HWPX 패키지 열기 실패",
    "description": "올바른 HWPX 패키지로 열지 못해 가져오기를 진행하지 않았습니다.",
    "fallback": "HWPX 파일 구조를 읽지 못해 현재 문서는 바꾸지 않았습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-package-partial": {
    "functionalArea": "기타 개체",
    "status": "부분 유지",
    "title": "HWPX 패키지 일부만 해석",
    "description": "패키지 일부 정보는 읽었지만 현재 지원 범위에서 해석하지 않는 항목이 있습니다.",
    "fallback": "읽을 수 있는 HWPX 내용만 유지하고 일부 패키지 정보는 생략했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-missing-entry": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "HWPX 필수 파일 누락",
    "description": "필수 문서 항목이 없어 현재 HWPX 파일은 그대로 가져올 수 없습니다.",
    "fallback": "필수 항목이 없는 부분은 해석하지 않고 현재 문서는 바꾸지 않았습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-note-structure-invalid": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "HWPX 각주·미주 구조 오류",
    "description": "각주·미주 참조와 본문 구조가 Dockit이 안전하게 복원할 수 있는 HWPX 구조가 아닙니다.",
    "fallback": "원본 HWPX와 현재 Dockit 문서를 그대로 유지하고 가져오기를 중단합니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-note-pair-invalid": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "HWPX 각주·미주 연결 오류",
    "description": "각주·미주 참조와 본문이 누락·중복되었거나 고유 식별자가 서로 맞지 않습니다.",
    "fallback": "불완전한 참조나 본문을 적용하지 않고 가져오기를 중단합니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-note-numbering-unsupported": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "HWPX 각주·미주 번호 정책 미지원",
    "description": "연속 10진 번호, 1 시작, 기본 각주·미주 배치 범위를 벗어난 번호 정책입니다.",
    "fallback": "번호나 배치를 바꾸지 않고 원본 문서를 유지합니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-note-content-unsupported": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "HWPX 각주·미주 본문 미지원",
    "description": "각주·미주 본문에 지원 범위를 벗어난 문단, 개체, 제어 문자 또는 서식이 있습니다.",
    "fallback": "일부 본문을 버리지 않고 각주·미주 전체 적용을 중단합니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-note-hyperlink-unsupported": {
    "functionalArea": "각주·미주",
    "status": "가져오기 중단",
    "title": "HWPX 각주·미주 링크 미지원",
    "description": "각주·미주 링크가 안전한 http, https, mailto 대상이 아니거나 연결 구조가 손상되었습니다.",
    "fallback": "링크를 평문으로 낮추지 않고 각주·미주 전체 적용을 중단합니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-unsupported-compression": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "지원하지 않는 압축 방식",
    "description": "현재 지원하지 않는 압축 방식이라 HWPX 일부를 안전하게 해석하지 못했습니다.",
    "fallback": "읽지 못한 압축 항목은 건너뛰고 안전한 범위만 유지했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-xml-warning": {
    "functionalArea": "기타 개체",
    "status": "부분 유지",
    "title": "HWPX XML 일부 단순화",
    "description": "일부 XML 값은 최대한 읽었지만 같은 구조로 완전히 해석되지 않을 수 있습니다.",
    "fallback": "읽을 수 있는 내용은 유지하고 해석이 애매한 XML 값만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-xml-error": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "HWPX XML 해석 실패",
    "description": "문서 XML 일부를 해석하지 못해 안전한 범위만 가져오거나 적용을 막습니다.",
    "fallback": "해석하지 못한 XML 부분은 건너뛰고 안전한 범위만 유지했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-xml-unknown": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "알 수 없는 HWPX XML 구조",
    "description": "현재 지원하지 않는 XML 구조는 해석하지 않고 가능한 내용만 남깁니다.",
    "fallback": "알 수 없는 XML 구조는 생략하고 읽을 수 있는 내용만 유지했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-style-partial": {
    "functionalArea": "텍스트·스타일",
    "status": "부분 유지",
    "title": "스타일 일부 단순화",
    "description": "스타일 정보는 최대한 보존하지만 같은 스타일 체계로 완전히 재현되지는 않을 수 있습니다.",
    "fallback": "문단 내용은 유지하고 일부 스타일 정보만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-style-loss": {
    "functionalArea": "텍스트·스타일",
    "status": "생략·대체",
    "title": "스타일 의미 일부 손실",
    "description": "지원 범위를 벗어난 스타일 의미는 현재 그대로 가져오지 않고 보이는 내용만 남깁니다.",
    "fallback": "텍스트는 유지하고 복원하지 못한 스타일 의미만 생략했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-list-partial": {
    "functionalArea": "목록",
    "status": "부분 유지",
    "title": "목록 일부 단순화",
    "description": "일반 목록은 유지하지만 여러 단계 목록이나 복잡한 번호 규칙은 단순화될 수 있습니다.",
    "fallback": "목록 내용은 유지하고 복잡한 목록 규칙만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-table-partial": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "표 일부 단순화",
    "description": "복잡한 표 너비와 셀 배치는 최대한 보존하지만 완전히 같지 않을 수 있습니다.",
    "fallback": "표 내용은 유지하고 지원 범위를 벗어난 배치 정보만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-table-style-partial": {
    "functionalArea": "표",
    "status": "부분 유지",
    "title": "표 스타일 일부 단순화",
    "description": "표 테두리와 배경 같은 세부 스타일은 최대한 보존하지만 완전히 같지 않을 수 있습니다.",
    "fallback": "표 내용은 유지하고 세부 표 스타일만 단순화했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-link-metadata-loss": {
    "functionalArea": "링크",
    "status": "생략·대체",
    "title": "링크 부가 정보 일부 손실",
    "description": "웹 링크는 유지하지만 내부 이동이나 부가 속성은 일반 텍스트로 바뀔 수 있습니다.",
    "fallback": "표시 텍스트와 기본 링크만 유지하고 부가 정보는 생략했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-control-unsupported": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "지원하지 않는 문서 개체",
    "description": "도형, 차트, 입력칸 같은 지원 범위 밖 개체는 가능한 경우 정보만 남기고 경고합니다.",
    "fallback": "지원하지 않는 개체는 정보나 자리표시자로만 남겼습니다.",
    "visiblePlaceholder": true
  },
  "hwpx-import-image-metadata-only": {
    "functionalArea": "이미지·미디어",
    "status": "생략·대체",
    "title": "이미지 정보만 보존",
    "description": "이미지를 그대로 복원하지 못하면 이미지 정보만 남기고 경고합니다.",
    "fallback": "실제 이미지를 복원하지 못한 항목은 정보만 남겼습니다.",
    "visiblePlaceholder": true
  },
  "hwpx-import-image-metadata-loss": {
    "functionalArea": "이미지·미디어",
    "status": "생략·대체",
    "title": "이미지 메타데이터 일부 손실",
    "description": "떠 있는 이미지나 그룹 이미지의 배치 정보는 일부 유지되지 않을 수 있습니다.",
    "fallback": "이미지 본문은 가능한 범위만 유지하고 복원하지 못한 배치 정보는 생략했습니다.",
    "visiblePlaceholder": true
  },
  "hwpx-import-unsupported-structure": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "지원하지 않는 문서 구조",
    "description": "지원 범위를 벗어난 구조는 가능한 경우 텍스트만 남기고 경고합니다.",
    "fallback": "지원하지 않는 구조는 텍스트나 자리표시자로만 남겼습니다.",
    "visiblePlaceholder": true
  },
  "hwpx-import-reference-missing": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "참조 정보 누락",
    "description": "연결된 스타일이나 리소스 참조가 없어 일부 항목을 그대로 복원하지 못했습니다.",
    "fallback": "누락된 참조를 건너뛰고 읽을 수 있는 내용만 유지했습니다.",
    "visiblePlaceholder": false
  },
  "hwpx-import-structure-clamped": {
    "functionalArea": "페이지 설정",
    "status": "부분 유지",
    "title": "배치 값 일부 보정",
    "description": "지원 범위를 벗어난 크기나 배치 값은 안전한 범위로 보정해 가져왔습니다.",
    "fallback": "문서 내용은 유지하고 과한 배치 값만 안전한 범위로 보정했습니다.",
    "visiblePlaceholder": false
  },
  "import-readiness-blocked": {
    "functionalArea": "기타 개체",
    "status": "생략·대체",
    "title": "적용 전 확인 필요",
    "description": "적용 전에 확인하거나 해결해야 하는 차단 항목이 있어 현재 문서는 아직 바꾸지 않습니다.",
    "fallback": "차단 항목을 확인하기 전까지는 현재 문서를 유지합니다.",
    "visiblePlaceholder": false
  }
});

export const getWarningCatalogEntry = (code, options = {}) => {
  const entry = WARNING_CATALOG[code];

  if (!entry) {
    return DEFAULT_WARNING_ENTRY;
  }

  const variant = options.surface ? entry.variants?.[options.surface] : null;

  return Object.freeze({
    ...entry,
    ...(variant ?? {}),
    "variants": undefined
  });
};

export const WARNING_CATALOG_DEFAULT_ENTRY = DEFAULT_WARNING_ENTRY;

export const pickWarningCatalogEntries = (codes, options = {}) =>
  Object.freeze(
    Object.fromEntries(codes.map((code) => [code, getWarningCatalogEntry(code, options)]))
  );
