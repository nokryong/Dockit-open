# 앱 업데이트

배포 앱은 시작 3초 후와 이후 6시간마다 `nokryong/Dockit-open`의 새 릴리즈를 확인합니다. 새 버전이 있으면 sud-ui Modal에서 설치 여부를 선택합니다. 취소한 버전은 해당 실행 중 다시 안내하지 않습니다.

Windows와 Linux에서는 설치를 누르면 다운로드 진행률을 표시합니다. 다운로드가 끝나면 진행 중인 AI 작업을 기다린 후 열린 문서와 로컬 설정을 저장하고 설치·재시작합니다. 저장 실패나 응답 시간 초과 시 설치하지 않고 재시도를 제공합니다. 일반 종료 시 자동 설치는 꺼져 있습니다.

macOS는 배포 인증서 없이 제공하므로 새 버전 알림의 **다운로드** 버튼으로 GitHub 릴리즈 페이지를 엽니다. 다운로드한 앱은 직접 교체하며, 이 버튼으로 문서를 저장하거나 앱을 종료하지 않습니다.

## UI 확인

`npm run dev`로 실행한 앱에서 `Ctrl+Shift+U` (macOS: `Cmd+Shift+U`)를 누르면 같은 모달을 미리 볼 수 있습니다. 설치를 누르면 진행률 → 저장 → 재시작 안내를 재현하고 닫힙니다. macOS의 다운로드 미리보기는 버튼을 누르면 닫힙니다. 이 미리보기는 파일 저장, 다운로드, 설치, 앱 종료를 실행하지 않습니다. 단축키를 다시 누르면 처음부터 볼 수 있습니다.

모달: `app/LIB/components/updates/AppUpdateModal.js`

## 배포 준비

`npm run package:desktop`은 현재 OS의 설치 파일과 업데이트 메타데이터를 `release/`에 만듭니다. `--publish never`로 업로드하지 않습니다. Windows는 NSIS, macOS는 DMG와 ZIP, Linux는 AppImage입니다. 소스·개인 데이터 전체를 패키지에 넣지 않도록 포함할 파일을 `electron-builder.yml`에 지정했습니다.

실제 배포 시에는 공개 GitHub 릴리즈에 해당 OS/아키텍처의 설치 파일, 블록맵과 `latest*.yml`을 함께 올려야 합니다. 버전은 `package.json`에서 올립니다. 유료 배포 서명 없이 배포하며 Windows·macOS에서 설치 또는 실행 시 보안 경고가 표시될 수 있습니다. macOS 자동 설치는 배포 서명을 도입한 뒤 별도로 활성화합니다. 업데이트 저장소용 토큰을 앱에 넣지 않습니다.

배포 전 Windows·Linux에서는 설치한 앱으로 문서 저장 후 업데이트·재시작까지, macOS에서는 새 버전 다운로드와 앱 교체 후 재실행을 확인합니다.

## 설치본 검사

```sh
npm run package:desktop
npm run test:packaged
```

`test:packaged`는 임시 사용자 폴더에서 빌드된 앱의 문서 열기·저장·재열기와 `.dkt` 실행 인자를 확인합니다. 사용자 문서나 실행 중인 앱을 사용하지 않습니다.

Windows에서는 `npm run test:update-download`로 생성된 설치 파일을 로컬 HTTP 서버에서 내려받아 진행률과 체크섬 검증, 저장 후 설치 전달 순서, 재시작 인자를 확인합니다. 손상된 다운로드도 차단하는지 검사합니다. 설치 프로세스 실행은 대체하므로 실제 OS 설치·재시작 검증과는 별개입니다.

CI의 `update-install-smoke.cjs`는 임시 Windows VM에 실제 NSIS 설치본을 설치하고, 이전 버전으로 설정한 설치본에서 업데이트합니다. 열린 문서 저장, 설치 파일 교체, 자동 재시작, 문서 재열기를 확인합니다. 파일 연결과 레지스트리가 변경되므로 GitHub에서 제공하는 일회용 Windows 실행기에서만 실행할 수 있습니다.

GitHub Actions의 **Desktop package check**를 수동 실행하거나 `codex/release-check-*` 검증 브랜치에 푸시하면 Windows·macOS·Linux에서 패키징과 설치본 검사를 수행하고 결과를 Actions 아티팩트로 보관합니다. 릴리즈를 발행하지 않습니다. 서명 인증서를 연결하기 전 결과는 배포용 서명 검증을 대신하지 않습니다.
