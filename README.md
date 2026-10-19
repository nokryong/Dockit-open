<p align="center">
  <img src="public/logo/wordmark-wide.png" alt="Dockit Open" width="360">
</p>

<p align="center">
  로그인 없이 내 컴퓨터에서 쓰는 문서 편집기
</p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="https://github.com/nokryong/Dockit-open/releases">다운로드</a> ·
  <a href="https://github.com/nokryong/dockit-plugins">플러그인</a>
</p>

![문서 편집 화면: 왼쪽 목차, 가운데 문서, 오른쪽 ChatGPT](docs/images/overview.png)

Dockit Open은 Windows·macOS·Linux에서 동작하는 오픈소스 문서 편집기입니다. 계정이나 서버 없이 문서를 내 컴퓨터에 저장하고, 필요할 때 ChatGPT나 Codex CLI를 연결해 문서 작업을 도울 수 있습니다.

## 주요 기능

- **페이지 단위 문서 편집**: 표, 수식(LaTeX), 이미지, 차트, Mermaid 도식, 각주·미주, 목차를 지원합니다.
- **한글·워드 파일**: HWPX와 DOCX를 가져오고 내보냅니다.
- **로컬 저장**: 문서는 `.dkt` 파일로 내 컴퓨터에 저장됩니다. 삭제한 문서는 OS 휴지통으로 갑니다.
- **툴킷**: ChatGPT, 특수문자, 한자, LaTeX, 목차, 스타일, 단축키, 차트, 편집기, 시트, 메모장, 계산기, 타이머를 문서 옆에 띄워 씁니다.
- **AI 연결(선택)**: ChatGPT 계정이나 Codex CLI를 연결해 대화하고 문서 작업을 맡깁니다. API 키나 별도 서버가 필요 없습니다.
- **플러그인**: GitHub 주소로 플러그인을 설치하고 업데이트합니다.

![툴킷 선택 창](docs/images/toolkits.png)

표를 선택하면 차트 툴킷에서 바로 차트를 만들어 문서에 넣을 수 있습니다.

![표를 선택해 차트 툴킷으로 만든 차트](docs/images/charts.png)

## 다운로드와 설치

[Releases](https://github.com/nokryong/Dockit-open/releases)에서 운영체제에 맞는 파일을 받습니다.

| 운영체제 | 파일 |
|---|---|
| Windows | `.exe` 설치 파일 |
| macOS | `.dmg` |
| Linux | `.AppImage` |

설치 파일은 유료 코드 서명 없이 배포합니다. 처음 실행할 때 보안 경고가 나오면 다음과 같이 엽니다.

- **Windows**: "Windows의 PC 보호" 창에서 **추가 정보 → 실행**을 누릅니다.
- **macOS**: 앱을 처음 열 때 차단되면 **시스템 설정 → 개인정보 보호 및 보안**에서 **그래도 열기**를 누릅니다.
- **Linux**: 파일에 실행 권한을 준 뒤(`chmod +x Dockit*.AppImage`) 실행합니다.

### 업데이트

앱은 시작할 때와 이후 6시간마다 새 버전을 확인합니다.

- **Windows·Linux**: 새 버전 안내에서 **설치**를 누르면 내려받은 뒤, 열린 문서를 저장하고 다시 시작합니다.
- **macOS**: 서명이 없어 자동 설치를 지원하지 않습니다. 새 버전 안내의 **다운로드**로 릴리즈 페이지를 열어 직접 교체합니다.

## 문서와 데이터 저장 위치

![홈 화면: 폴더와 문서 목록](docs/images/home.png)

모든 데이터는 사용자 홈의 `.dockit` 폴더에 저장됩니다.

| 위치 | 내용 |
|---|---|
| `.dockit/Documents/` | `.dkt` 문서와 폴더 (설정에서 다른 폴더로 바꿀 수 있습니다) |
| `.dockit/backups/` | 문서의 직전 저장본 |
| `.dockit/config.json` | 설정, 테마, 패널 배치 |
| `.dockit/memos/`, `.dockit/characters/`, `.dockit/styles/` | 메모, 특수문자 즐겨찾기, 사용자 스타일 |
| `.dockit/plugins/`, `.dockit/plugin-data/` | 설치한 플러그인과 플러그인 데이터 |
| `.dockit/ai/`, `.dockit/codex/` | 암호화된 AI 연결 정보와 대화 기록 |

문서 폴더 경로를 바꿔도 기존 문서를 옮기거나 지우지 않습니다.

## AI 연결

AI 연결은 선택 사항입니다. 연결하지 않아도 모든 편집 기능을 쓸 수 있습니다.

![ChatGPT 툴킷으로 문서와 도식을 작성하는 화면](docs/images/chatgpt.png)

### ChatGPT

설정 맨 위의 **Continue with ChatGPT**를 누르고, 기본 브라우저에서 로그인한 뒤 요금제 사용을 허용합니다. ChatGPT 툴킷에서 계정에 허용된 모델을 골라 대화합니다.

- 대화에는 연결한 ChatGPT 요금제 또는 크레딧이 쓰입니다. 한도는 **사용량 관리**에서 확인합니다.
- 대화 기록은 내 컴퓨터에 저장됩니다. 메시지를 보낼 때 현재 대화 내용만 OpenAI로 전송하며, 문서 파일을 자동으로 보내지 않습니다.
- 인증 정보는 OS 암호화로 보호합니다.
- 지원 범위와 계정 조건은 [OpenAI 공식 문서](https://developers.openai.com/siwc/token-sharing-open-source)를 따릅니다. 이 연결 방식에서는 이미지 생성은 지원되지 않습니다.

### Codex CLI

Codex CLI를 설치한 뒤(`npm install -g @openai/codex`) 설정에서 **CLI로 로그인하기**를 누릅니다. 로그인하면 ChatGPT 툴킷 오른쪽 위의 **Chat/Codex** 스위치로 Codex 대화로 바꿀 수 있습니다.

![설정 화면: ChatGPT·Codex CLI 연결과 테마](docs/images/settings.png)

- Codex는 사용자가 지시하면 열린 문서를 직접 고칠 수 있습니다. 작업하는 동안에는 문서 편집이 잠깁니다.
- Codex의 전역 `AGENTS.md`와 개인 스킬을 함께 사용합니다.
- CLI 인증은 `.dockit/codex/`에 따로 저장하며, 기본 `~/.codex` 로그인과는 별개입니다. `.dockit/codex/auth.json`은 공유하지 마세요.

## 플러그인

상단의 **플러그인 → 플러그인 설치**에 GitHub 저장소나 플러그인 폴더 주소를 입력합니다. 설치한 플러그인은 **툴킷 → 플러그인**에서 엽니다. 새 버전이 나오면 플러그인 관리에서 **업데이트**를 누르며, 저장한 데이터와 API Key는 유지됩니다.

![플러그인 관리 창](docs/images/plugins.png)

[공식 플러그인 저장소](https://github.com/nokryong/dockit-plugins) 주소를 넣으면 다음 플러그인을 골라 설치할 수 있습니다.

| 플러그인 | 설명 |
|---|---|
| 주사위 | 주사위를 추가하고 굴립니다. |
| 이미지 검색 | Pixabay 이미지를 검색하고 내려받습니다. (본인의 Pixabay API Key 필요) |
| 우리말 사전 | 우리말샘에서 단어와 뜻을 찾습니다. |
| 달력 | 날짜별 일정을 저장합니다. |
| 음악 플레이어 | 내 음악 폴더를 골라 그 안의 곡을 재생합니다. |

플러그인은 격리된 화면에서 실행되며, 문서 파일이나 로그인 정보에 접근할 수 없습니다. 직접 만들려면 [Plugin SDK v2](docs/plugins/SDK.md)와 [dockit-plugin-sdk](https://github.com/nokryong/dockit-plugin-sdk)를 참고하세요. 공식 저장소에 등록하려면 [기여 안내](https://github.com/nokryong/dockit-plugins/blob/main/CONTRIBUTING.md)를 따라 PR을 보냅니다. 다른 공개 GitHub 저장소의 플러그인도 설치할 수 있지만, 공식 저장소의 검토를 거치지 않았다는 점에 유의하세요.

## 직접 빌드하기

Node.js 24 이상이 필요합니다. 별도 데이터베이스나 환경 변수는 필요하지 않습니다.

```sh
npm install
npm run dev
```

`npm run dev`는 개발 서버와 앱을 함께 실행하며, UI 코드를 저장하면 바로 반영됩니다. Electron 메인 프로세스 코드를 고쳤다면 다시 실행합니다.

```sh
npm run build            # 화면 빌드
npm start                # 빌드한 앱 실행
npm run package:desktop  # 현재 OS용 설치 파일을 release/에 생성 (업로드하지 않음)
```

검사 방법은 [TESTING.md](TESTING.md), 설치 파일과 업데이트 운영은 [앱 업데이트](docs/desktop-updates.md)를 참고하세요.

## 기여

버그 제보, 제안, PR을 환영합니다. [기여 안내](CONTRIBUTING.md)를 먼저 읽어 주세요. 보안 문제는 공개 이슈 대신 [보안 정책](SECURITY.md)에 따라 알려 주세요.

## 라이선스

Dockit Open은 [GNU AGPL v3.0](LICENSE)으로 배포합니다. 제3자 구성요소의 고지와 라이선스 전문은 [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt)에 있습니다. 코드 블록 글꼴 Intel One Mono는 [SIL Open Font License 1.1](public/fonts/IntelOneMono-OFL.txt)을 따릅니다.
