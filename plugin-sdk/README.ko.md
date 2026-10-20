# Dockit Plugin SDK

[English](README.md) · 한국어

Dockit 플러그인의 브라우저 API, 패키지 규격 검사와 ZIP 생성 도구입니다.

## 설치

```sh
npm install --save-dev github:nokryong/dockit-plugin-sdk
```

## 패키징

빌드된 HTML·JavaScript·CSS와 `manifest.json`을 같은 폴더에 넣습니다.

```sh
npx dockit-plugin-pack ./dist ./my-plugin-0.1.0.zip
```

ZIP은 로컬 패키지 검사에 사용할 수 있습니다. 배포할 때는 빌드된 파일과 `manifest.json`을 공개 저장소의 `plugins/<이름>/` 폴더에 넣습니다. Dockit Open의 **플러그인 → 플러그인 설치**에서 저장소 주소를 입력하고 플러그인을 선택합니다. 개별 폴더의 GitHub 주소도 사용할 수 있습니다.

## 브라우저 API

Dockit이 툴킷을 열 때 `window.Dockit`을 제공합니다. 플러그인에서 브리지를 직접 삽입할 필요가 없습니다.

```js
const theme = await Dockit.ready;
const count = await Dockit.storage.get('count');
await Dockit.storage.set('count', (count ?? 0) + 1);
```

자세한 규격은 [SDK 가이드](https://github.com/nokryong/dockit-plugin-sdk/blob/main/docs/SDK.ko.md), 실행 예제는 [공식 플러그인](https://github.com/nokryong/dockit-plugins)을 참고하세요.
