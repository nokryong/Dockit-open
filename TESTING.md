# 검증

Node.js 24 이상에서 의존성을 설치한 뒤 실행합니다.

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run test:local
npm run build
npm run test:desktop
npm run test:chatgpt
```

- 단위 검사: 편집기, 페이지네이션, 문서 변환, 저장 큐와 UI 동작.
- 로컬 검사: 폴더·파일 저장, 경로 제한, 변경 충돌, IPC.
- 데스크톱 검사: 임시 사용자 폴더에서 창 제어, 문서 저장·재열기, 위젯 저장, 종료 전 저장과 좁은 창 배치.
- 언어 검사: 빌드 후 `npm run test:i18n`으로 번역 누락과 치환값, 한국어·영어 전환, 재실행 후 언어 유지, 글꼴 표시와 문서 내용 보존을 확인합니다.
- ChatGPT 검사: 합성 OAuth/JWKS/API 응답으로 로그인·취소, 최초 사용 안내, OS 암호화 저장·재실행, 계정별 대화, 스트리밍·사용 한도 오류, 로그아웃·재연결을 확인합니다. 밝은·어두운 테마와 좁은 창 스크린샷은 `.cache/chatgpt-smoke/`에 저장합니다.
- CLI 검사: `npm run test:codex`로 별도 로그인·취소·로그아웃, ChatGPT·Codex 전환, 채팅 중지·기록, 사용량, 테마·좁은 창 배치를 검사합니다. 인증과 추론은 합성 응답이며 결과 화면은 `.cache/codex-smoke/`에 저장합니다. `npm run test:local`은 CLI가 설치되어 있으면 빈 임시 `CODEX_HOME`으로 실제 프로세스 초기화도 확인합니다.

문서 출력과 다이어그램의 브라우저 검사는 자체 Vite 테스트 화면으로 실행합니다.

```powershell
npx playwright install chromium
$env:DOCKIT_E2E_BROWSER_CHANNEL = "bundled"
npm run test:e2e
```

실제 계정이나 서버는 필요하지 않습니다. 데스크톱 스크린샷은 `.cache/desktop-smoke/`, 실패 기록은 `test-results/`에서 확인합니다.

실제 ChatGPT 연결 검증은 별도입니다. 설정에서 본인 계정으로 동의한 뒤 모델을 선택하고 짧은 메시지의 응답 완료까지 확인합니다. 로그인 성공이나 모델 목록만으로 실제 추론 성공을 판정하지 않습니다.

실제 CLI 연결은 설정의 **CLI로 로그인하기**에서 별도로 로그인한 뒤 채팅 응답, 이미지 생성·복사, 사용량을 확인합니다. 앱을 재실행해 연결과 기록이 유지되는지도 확인합니다. 자동 검사에서는 개인 계정의 인증정보를 사용하지 않습니다.

의존성 변경 뒤에는 제3자 고지와 보안 스냅샷도 갱신·확인합니다.

```powershell
npm run licenses:refresh-evidence
npm run licenses:check
npm run security:refresh-snapshot
npm run security:check
```

설치 파일과 macOS/Linux의 실제 동작 확인은 별도입니다.

## 플러그인

`npm run test:plugins`는 패키지·경로·저장 권한 검사를 실행하고, 주사위 ZIP을 만들어 별도 사용자 폴더의 Electron 앱에서 설치·실행·재시작·삭제를 확인합니다. 데이터 유지 후 재설치, 데이터 함께 삭제, 취소, 테마 변경과 좁은 창도 확인합니다. 사용자가 실행한 서버나 앱은 사용하지 않습니다. 화면은 `.cache/plugin-smoke/`에 저장합니다.
