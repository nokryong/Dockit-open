# Dockit Open

로그인 없이 로컬 문서를 편집하는 Electron 앱입니다.

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
- `.dockit/calendar/<id>.json`: 일정
- `.dockit/music/`: 추가한 음악의 복사본과 재생 목록
- `.dockit/backups/`: 문서의 직전 저장본
- `.dockit/document-index.json`: 열어 본 문서의 경로 캐시
- `.dockit/Documents/`: `.dkt` 문서와 하위 폴더
- `.dockit/ai/`: 설치 식별자, 암호화된 ChatGPT 연결 정보와 계정별 `chats/` 대화 기록

문서 폴더는 설정에서 변경할 수 있습니다. 경로를 바꿔도 기존 문서를 옮기거나 삭제하지 않습니다.

목록은 현재 폴더를 읽고, 하위 폴더는 열 때 불러옵니다.

## 현재 기능

기존 문서 편집기·페이지네이션, 로컬 문서 생성·저장·재열기·이름 변경·이동, 메모, 스타일, 특수문자 즐겨찾기, 달력 일정 추가·삭제, 로컬 음악 추가·재생·삭제를 제공합니다. 삭제는 OS 휴지통을 사용합니다. 음악 원본은 변경하지 않습니다.

지도 벡터, 온라인 공유·서비스 계정·외부 조회 기능과 서버 API 코드는 제거했습니다. 공휴일은 외부에서 조회하지 않습니다.

문서 템플릿과 글쓰기 AI 기능은 제거했습니다. AI 이미지 위젯은 CLI 로그인 후 사용할 수 있습니다.

## ChatGPT 연결

설정 맨 위의 **Continue with ChatGPT**를 누르고 기본 브라우저에서 로그인한 뒤 요금제 사용을 허용합니다. AI 채팅 위젯에서 계정에 허용된 모델을 선택해 대화할 수 있습니다. API 키나 별도 서버는 필요하지 않습니다.

AI 채팅은 연결한 ChatGPT 요금제 또는 크레딧을 사용합니다. **사용량 관리**에서 한도와 앱 접근을 관리할 수 있고, 설정에서 계정을 추가·전환하거나 연결을 해제할 수 있습니다. 문서 편집에는 로그인이 필요하지 않습니다.

대화는 로컬에 저장되며, 메시지를 보낼 때 현재 대화 내용이 OpenAI로 전송됩니다. 문서 파일을 자동으로 전송하지 않습니다. 인증 정보는 OS 암호화로 보호하고 `config.json`에는 저장하지 않습니다.

지원 범위와 계정 조건은 [OpenAI 공식 문서](https://developers.openai.com/siwc/token-sharing-open-source)를 따릅니다. 현재 이 연결 방식의 이미지 생성은 지원되지 않습니다.

## Codex CLI 연결

Codex CLI를 설치한 뒤(`npm install -g @openai/codex`), 설정의 **CLI로 로그인하기**를 누릅니다. 브라우저에서 별도로 로그인하면 AI 채팅의 연결 선택에서 **Codex CLI**를 사용할 수 있고, AI 이미지 위젯에서 이미지를 생성·복사·저장할 수 있습니다. 참고 이미지를 첨부해 수정을 요청할 수도 있습니다.

CLI 인증과 세션은 `.dockit/codex/`, 계정별 대화와 이미지는 `.dockit/ai/codex/`에 저장합니다. 기본 `~/.codex` 인증과 ChatGPT 직접 연결은 별개입니다. `.dockit/codex/auth.json`은 인증정보이므로 공유하지 마세요.

기존 Codex의 전역 `AGENTS.md`와 개인 스킬을 함께 사용합니다. `AGENTS.override.md`가 있으면 우선 적용하며, `CODEX_HOME`을 지정했다면 해당 폴더를 참조합니다. 전역 지침 변경은 다음 요청부터 반영됩니다.

설정과 AI 채팅 위젯에서 Codex 계정의 남은 사용량과 초기화 시간을 확인할 수 있습니다. 채팅과 이미지 생성에는 해당 계정의 Codex 사용 한도가 적용됩니다.

## 검증

```powershell
npm test
npm run test:local
npm run build
npm run test:desktop
npm run test:chatgpt
```

데스크톱 검사는 임시 사용자 폴더에서 실행합니다. 스크린샷은 `.cache/desktop-smoke/`에 저장합니다. 설치 파일 제작·서명과 macOS/Linux 실행 검증은 별도 단계입니다.

제3자 고지 자료는 `licenses/`에 있습니다.
