# Dockit Open

로그인 없이 로컬 문서를 편집하는 Electron 앱입니다.

배포 파일은 유료 코드 서명 없이 제공합니다. Windows·macOS에서는 설치 또는 실행 시 보안 경고가 표시될 수 있습니다. Windows·Linux는 앱 내 업데이트를, macOS는 새 버전 알림에서 다운로드 후 직접 설치하는 방식을 사용합니다.

## 실행

Node.js 24 이상에서 프로젝트 폴더를 열고 실행합니다.

```powershell
npm install
npm run dev
```

`npm run dev`는 개발 서버와 앱을 함께 실행하며, UI 코드를 저장하면 화면에 자동 반영됩니다. Electron 메인 프로세스 코드를 수정한 경우에는 다시 실행하세요. `npm start`는 빌드된 앱을 실행합니다. 별도 DB나 환경 변수 설정은 필요하지 않습니다.

## 저장 위치

- 사용자 홈의 `.dockit/config.json`: 기본 설정, 문서 경로, 테마, 패널 배치
- `.dockit/memos/default.json`: 메모
- `.dockit/characters/default.json`: 특수문자 즐겨찾기
- `.dockit/styles/default.json`: 사용자 스타일
- `.dockit/backups/`: 문서의 직전 저장본
- `.dockit/document-index.json`: 열어 본 문서의 경로 캐시
- `.dockit/Documents/`: `.dkt` 문서와 하위 폴더
- `.dockit/ai/`: 설치 식별자, 암호화된 ChatGPT 연결 정보와 계정별 `chats/` 대화 기록

`.dockit/calendar/`와 `.dockit/music/`은 이전 버전의 일정·음악 데이터 폴더입니다. 현재 앱은 이 데이터를 사용하지 않으며, 기존 파일을 지우지도 않습니다.

문서 폴더는 설정에서 변경할 수 있습니다. 경로를 바꿔도 기존 문서를 옮기거나 삭제하지 않습니다.

목록은 현재 폴더를 읽고, 하위 폴더는 열 때 불러옵니다.

## 현재 기능

문서 편집기·페이지네이션과 로컬 문서 생성·저장·재열기·이름 변경·이동을 제공합니다. 문서 변환 형식은 HWPX와 DOCX를 지원합니다. 삭제는 OS 휴지통을 사용합니다.

위젯으로 ChatGPT, 특수문자, 한자, LaTeX, 목차, 스타일, 단축키, 차트, 편집기, 시트, 메모장, 계산기, 타이머를 쓸 수 있습니다.

지도 벡터, 온라인 공유·서비스 계정·외부 조회 기능과 서버 API 코드는 제거했습니다.

문서 템플릿과 글쓰기 AI 기능은 제거했습니다. 달력, 음악 플레이어, AI 이미지, 참고 문서, 주사위 위젯도 제거했습니다.

## ChatGPT 연결

설정 맨 위의 **Continue with ChatGPT**를 누르고 기본 브라우저에서 로그인한 뒤 요금제 사용을 허용합니다. ChatGPT 위젯에서 계정에 허용된 모델을 선택해 대화할 수 있습니다. API 키나 별도 서버는 필요하지 않습니다.

ChatGPT 위젯의 대화는 연결한 ChatGPT 요금제 또는 크레딧을 사용합니다. **사용량 관리**에서 한도와 앱 접근을 관리할 수 있고, 설정에서 계정을 추가·전환하거나 연결을 해제할 수 있습니다. 문서 편집에는 로그인이 필요하지 않습니다.

대화는 로컬에 저장되며, 메시지를 보낼 때 현재 대화 내용이 OpenAI로 전송됩니다. 문서 파일을 자동으로 전송하지 않습니다. 인증 정보는 OS 암호화로 보호하고 `config.json`에는 저장하지 않습니다.

지원 범위와 계정 조건은 [OpenAI 공식 문서](https://developers.openai.com/siwc/token-sharing-open-source)를 따릅니다. 현재 이 연결 방식의 이미지 생성은 지원되지 않습니다.

## Codex CLI 연결

Codex CLI를 설치한 뒤(`npm install -g @openai/codex`), 설정의 **CLI로 로그인하기**를 누릅니다. 브라우저에서 별도로 로그인하면 ChatGPT 위젯 오른쪽 위의 **Chat/Codex** 스위치로 Codex CLI 대화로 전환할 수 있습니다.

CLI 인증과 세션은 `.dockit/codex/`, 계정별 대화는 `.dockit/ai/codex/`에 저장합니다. 기본 `~/.codex` 인증과 ChatGPT 직접 연결은 별개입니다. `.dockit/codex/auth.json`은 인증정보이므로 공유하지 마세요.

기존 Codex의 전역 `AGENTS.md`와 개인 스킬을 함께 사용합니다. `AGENTS.override.md`가 있으면 우선 적용하며, `CODEX_HOME`을 지정했다면 해당 폴더를 참조합니다. 전역 지침 변경은 다음 요청부터 반영됩니다.

설정과 ChatGPT 위젯에서 Codex 계정의 남은 사용량과 초기화 시간을 확인할 수 있습니다. 대화에는 해당 계정의 Codex 사용 한도가 적용됩니다.

## 플러그인

상단의 **플러그인 → 플러그인 설치**에서 GitHub 저장소 또는 플러그인 폴더 주소를 입력합니다. 저장소에 여러 플러그인이 있으면 설치할 항목을 선택합니다. 설치한 항목은 **툴킷 → 플러그인**에서 열 수 있습니다. 앱을 다시 켜도 설치와 배치가 유지됩니다.

설치 파일은 `.dockit/plugins/<플러그인 ID>/`, 설정과 데이터는 `.dockit/plugin-data/<플러그인 ID>/`에 저장합니다. 플러그인 관리에서 삭제하면 **데이터 남기기 / 함께 삭제**를 선택합니다. 툴킷의 **닫기**는 창만 닫습니다.

플러그인 창을 열면 새 버전을 확인합니다. 새 버전이 있으면 **삭제** 옆에 **업데이트** 버튼이 나타나며, 기존 데이터와 API Key를 유지한 채 업데이트합니다.

[공식 플러그인](https://github.com/nokryong/dockit-plugins)에서 주사위를 설치할 수 있습니다. 제작 규격은 [Plugin SDK v1](docs/plugins/SDK.md), 공통 도구는 [dockit-plugin-sdk](https://github.com/nokryong/dockit-plugin-sdk)를 참고하세요.

## 검증

```powershell
npm test
npm run test:local
npm run build
npm run test:desktop
npm run test:chatgpt
npm run test:codex
```

데스크톱 검사는 임시 사용자 폴더에서 실행합니다. 스크린샷은 `.cache/desktop-smoke/`에 저장합니다. OS별 패키징과 업데이트 검사 방법은 [앱 업데이트](docs/desktop-updates.md)를 참고하세요.

## 라이선스

Dockit Open은 [GNU AGPL v3.0](LICENSE)으로 배포합니다. 소스 코드는 [nokryong/Dockit-open](https://github.com/nokryong/Dockit-open)에서 제공합니다.

제3자 구성요소에는 각각의 라이선스가 적용됩니다. 고지와 라이선스 전문은 [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt)에 있습니다.
