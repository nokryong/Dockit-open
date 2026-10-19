# 기여 안내

Dockit Open에 관심을 가져 주셔서 고맙습니다. 버그 제보, 기능 제안, 문서 수정, 코드 기여 모두 환영합니다.

[English summary](#english)

## 이슈

- **버그**: [버그 제보](https://github.com/nokryong/Dockit-open/issues/new?template=bug_report.yml) 양식으로 남겨 주세요. 운영체제, 앱 버전, 재현 순서가 있으면 빨리 고칠 수 있습니다.
- **제안**: [기능 제안](https://github.com/nokryong/Dockit-open/issues/new?template=feature_request.yml) 양식을 사용해 주세요.
- **보안 문제**는 공개 이슈로 올리지 말고 [보안 정책](SECURITY.md)을 따라 주세요.
- 문서 내용이 들어간 파일을 첨부할 때는 개인 정보를 지운 예시 파일을 사용해 주세요.

## 개발 환경

Node.js 24 이상이 필요합니다.

```sh
npm install
npm run dev
```

## Pull Request

1. 저장소를 포크하고 작업 브랜치를 만듭니다.
2. 변경은 한 가지 목적에 집중합니다. 큰 변경은 먼저 이슈로 방향을 맞추면 좋습니다.
3. 제출 전에 다음을 실행합니다.

   ```sh
   npm run lint
   npx tsc --noEmit
   npm test
   npm run test:local
   npm run build
   ```

   화면이나 Electron 동작을 바꿨다면 `npm run test:desktop`도 실행합니다. 검사 종류는 [TESTING.md](TESTING.md)에 있습니다.
4. 의존성을 추가하거나 바꿨다면 제3자 고지와 보안 스냅샷을 갱신합니다.

   ```sh
   npm run licenses:refresh-evidence
   npm run security:refresh-snapshot
   ```

5. PR 설명에 무엇을, 왜 바꿨는지와 확인한 방법을 적습니다. UI 변경은 스크린샷을 붙여 주세요.

## 코드 작성 원칙

- 주변 코드의 스타일과 이름 규칙을 따릅니다.
- 문서는 사용자 컴퓨터에만 저장합니다. 문서 내용이나 개인 정보를 외부로 보내는 기능은 사용자가 명확히 선택한 경우에만 동작해야 합니다.
- 인증 정보는 OS 암호화 저장소로 보호하고, 설정 파일이나 로그에 남기지 않습니다.
- 사용자에게 보이는 문구는 한국어로 작성합니다.

## 플러그인

플러그인 기여는 이 저장소가 아니라 [dockit-plugins](https://github.com/nokryong/dockit-plugins)에서 받습니다. 플러그인 API는 [Plugin SDK](docs/plugins/SDK.md)를 참고하세요.

## 라이선스

이 저장소는 [GNU AGPL v3.0](LICENSE)으로 배포됩니다. PR을 보내면 기여한 내용이 같은 라이선스로 배포되는 데 동의한 것으로 봅니다.

---

## English

Thanks for helping with Dockit Open. Issues and pull requests in English are welcome.

- Report bugs and ideas with the issue templates. Report security issues privately as described in [SECURITY.md](SECURITY.md).
- Development requires Node.js 24 or later: `npm install`, then `npm run dev`.
- Before opening a pull request, run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:local`, and `npm run build` (plus `npm run test:desktop` for UI or Electron changes). After dependency changes, run `npm run licenses:refresh-evidence` and `npm run security:refresh-snapshot`.
- Keep each pull request focused, explain what changed and why, and attach screenshots for UI changes. User-facing text in the app is Korean.
- Plugins are contributed to [dockit-plugins](https://github.com/nokryong/dockit-plugins), not here.
- By contributing, you agree that your contribution is licensed under the [GNU AGPL v3.0](LICENSE).
