# Dockit Plugin SDK v2

플러그인은 빌드된 HTML·JavaScript·CSS와 `manifest.json`을 담은 폴더입니다. 공개 GitHub 저장소에서 설치하며, 설치 시 Dockit을 다시 빌드하지 않습니다.

v1 플러그인은 계속 실행할 수 있습니다. 외부 API·API Key·이미지 기능을 사용하려면 `sdkVersion: 2`를 지정합니다.

## 패키지

```text
manifest.json
index.html
assets/
  main.js
  style.css
```

`manifest.json`은 플러그인 폴더 최상위에 둡니다.

```json
{
  "manifestVersion": 1,
  "sdkVersion": 1,
  "id": "dockit.dice",
  "name": "주사위",
  "publisher": "nokryong",
  "version": "0.1.0",
  "description": "주사위를 추가하고 눌러서 굴려보세요.",
  "icon": "react-icons/tb/TbDice",
  "permissions": ["storage"],
  "widgets": [
    { "id": "dice", "title": "주사위", "entry": "index.html" }
  ]
}
```

- 플러그인 ID: 소문자로 시작하는 점 구분 이름. 예: `publisher.toolkit`. 재설치 때도 같은 ID를 사용합니다.
- 버전: `1.2.3` 또는 `1.2.3-beta.1` 형식.
- `widgets`: 툴킷 1~20개. 각 ID는 소문자·숫자·하이픈, 시작 문자는 소문자입니다. 패키지 안에서 중복할 수 없습니다.
- `entry`: 패키지 안의 `.html` 파일. JavaScript, CSS와 이미지도 상대 경로로 참조합니다.
- `icon`: 플러그인 아이콘을 등록합니다. React Icons 이름 또는 패키지 안의 SVG 경로입니다. 툴킷의 `icon`을 생략하면 플러그인 아이콘을 사용합니다.
- `permissions`: v1은 `storage`, v2는 `storage`, `network`, `credentials`, `images`, `external`을 지원합니다. 필요한 권한만 선언합니다. 알 수 없는 권한과 SDK 버전은 설치하지 않습니다.
- `publisher`는 제작자가 기입한 표시 이름이며, 서명이나 제작자 인증을 뜻하지 않습니다.

React 등 사용하는 라이브러리는 플러그인 빌드에 포함합니다. Dockit 내부 컴포넌트나 React 인스턴스를 직접 가져오지 않습니다. Vite는 `base: './'`로 빌드하세요. 사용한 라이브러리의 고지 파일도 패키지에 포함합니다.

### 아이콘

React Icons는 `react-icons/<라이브러리>/<컴포넌트>` 형식으로 지정합니다. 예: `react-icons/tb/TbDice`, `react-icons/lu/LuMusic`. Dockit에 포함된 React Icons 버전의 아이콘을 사용하며 앱의 색상 테마를 따릅니다.

직접 만든 SVG는 `"icon": "assets/icon.svg"`처럼 등록하고 해당 파일을 플러그인 폴더에 포함합니다. 40×40 크기로 제작하고 `viewBox`와 `xmlns="http://www.w3.org/2000/svg"`를 지정하세요. SVG는 64 KiB 이하여야 하며 원본 색상을 유지합니다.

관리 목록에서는 아이콘을 40×40으로 정보 왼쪽에 표시합니다. 같은 아이콘을 툴킷 선택 목록과 열린 툴킷 제목에도 크기를 맞춰 사용합니다. 여러 툴킷의 아이콘을 다르게 하려면 각 `widgets` 항목에 같은 형식의 `icon`을 지정하세요.

아이콘이 없거나 이름·파일이 잘못되면 설치하지 않습니다. 기존 패키지의 `dice`, `calendar`, `music`, `puzzle` 이름은 계속 지원하며, 플러그인 아이콘이 없는 기존 패키지는 첫 툴킷의 등록 아이콘을 사용합니다.

## 실행과 UI

Dockit이 제목·아이콘·드래그·접기·닫기를 처리하며, 플러그인은 본문을 그립니다. 제목 버튼과 하단 텍스트는 아래 SDK로 설정합니다. iframe을 직접 만들 필요가 없습니다.

Dockit이 시작 HTML에 SDK를 주입합니다. SDK가 준비된 후 UI를 그리세요.

```js
const theme = await window.Dockit.ready;
console.log(theme.name, theme.isDarkMode);

const unsubscribe = Dockit.onThemeChange(theme => {
  // UI에 theme.name, theme.colors, theme.fontFamily를 반영합니다.
});
```

`Dockit.theme`은 현재 `{ name, isDarkMode, colors, fontFamily }`입니다. `colors`는 Dockit의 색상 팔레트입니다. `--dockit-font` CSS 변수와 `color-scheme`도 갱신합니다. 구독 함수는 해제 함수를 반환합니다.

본문 높이는 자동으로 호스트에 전달됩니다. 툴킷은 48~720px 높이로 표시하고, 긴 본문은 프레임 안에서 스크롤합니다. 높이가 반복해서 커지지 않도록 `body`에 `100vh`나 고정 최소 높이를 지정하지 마세요.

```js
await Dockit.setActions([
  { id: 'add', label: '주사위 추가', icon: 'plus', disabled: false }
]);
const unsubscribe = Dockit.onAction(id => {
  if (id === 'add') addDice();
});
await Dockit.setFooter('주사위 3개');
```

제목 버튼은 최대 5개입니다. `label`은 필수이며 `icon`은 `plus`, `minus`, `refresh`, `key`를 지원합니다. 아이콘을 생략하면 글자 버튼입니다. 제목 버튼은 호스트의 sud-ui로 그립니다. `setFooter('')`로 하단 내용을 지웁니다.

`Dockit.notify(message, type)`은 호스트의 sud-ui 토스트를 표시합니다. `type`은 `danger`(기본), `warning`, `info`입니다. 오류를 처리할 때 사용하고 불필요한 성공 알림은 표시하지 않습니다.

## API Key와 외부 서비스

v2 manifest에 서비스의 고정 HTTPS 엔드포인트와 API Key 전달 위치를 선언합니다.

```json
{
  "sdkVersion": 2,
  "permissions": ["storage", "network", "credentials", "images", "external"],
  "services": {
    "pixabay": {
      "label": "Pixabay",
      "url": "https://pixabay.com/api/",
      "credential": { "in": "query", "name": "key" }
    }
  },
  "imageOrigins": ["https://pixabay.com", "https://cdn.pixabay.com"],
  "externalOrigins": ["https://pixabay.com"]
}
```

```js
const status = await Dockit.credentials.status('pixabay');
// { id, label, url, configured, revision }
const updated = await Dockit.credentials.configure('pixabay');
const result = await Dockit.network.get('pixabay', { q: '고양이', per_page: 10 });
```

`configure`는 Dockit의 키 입력창을 엽니다. 사용자가 저장·삭제하거나 취소하면 현재 설정 상태를 반환합니다. 플러그인에는 키 원문을 전달하지 않습니다. 키가 바뀌면 `revision`도 바뀌므로 계정별 캐시를 구분할 수 있습니다.

키는 OS의 Electron `safeStorage`로 암호화하여 해당 플러그인의 `credentials.json`에 저장합니다. 안전한 암호화를 사용할 수 없는 환경에서는 키를 저장하지 않습니다. `storage` API로는 이 파일을 읽을 수 없습니다. 설치를 삭제할 때 데이터 보존 선택이 키에도 적용됩니다. 서비스 주소나 인증 방식이 바뀌면 이전 키를 사용하지 않습니다.

`network.get`은 등록된 서비스에 GET 요청만 보냅니다. 쿼리는 문자열·숫자·불리언 값으로 전달하고 인증 필드는 직접 지정하지 않습니다. 호스트가 키를 주입합니다. 헤더 방식은 `credential: { "in": "header", "name": "Authorization", "prefix": "Bearer " }`처럼 선언합니다. 인증이 없는 서비스는 `credential`과 `credentials` 권한을 생략합니다.

호스트는 공개 HTTPS 주소만 연결하며 사설 IP, 인증 요청의 리다이렉트, 2 MiB 초과 JSON 응답을 거부합니다. 서비스의 요청 한도와 캐시 정책은 플러그인이 준수해야 합니다.

## 이미지와 외부 링크

```js
const src = await Dockit.images.load(image.webformatURL);
// 반환된 data URL을 <img src>에 사용합니다.
await Dockit.images.preview({
  url: image.largeImageURL,
  alt: image.tags,
  caption: image.tags,
  author: image.user,
  authorImage: image.userImageURL,
  authorUrl: 'https://pixabay.com/users/example-123/',
  sourceUrl: image.pageURL,
  filename: 'pixabay-image',
  likes: image.likes
});
const saved = await Dockit.images.download(image.largeImageURL, 'pixabay-image');
await Dockit.openExternal('https://pixabay.com/');
```

이미지는 `images` 권한과 `imageOrigins`에 등록된 출처에서 호스트가 가져옵니다. JPEG·PNG·WebP·GIF, 파일당 32 MiB까지 지원합니다. `preview`는 Dockit의 큰 미리보기 창을 열고, `download`는 사용자가 저장 경로를 선택하면 저장합니다. 취소 시 `false`를 반환합니다.

외부 페이지와 작성자 프로필 링크는 `external` 권한과 `externalOrigins`에 등록된 출처만 기본 브라우저로 엽니다. API 서비스 주소·이미지 출처·외부 링크 출처의 권한은 각각 분리되어 있습니다.

## 데이터

`storage` 권한이 있는 플러그인만 사용할 수 있습니다.

```js
await Dockit.storage.set('count', 3);
const count = await Dockit.storage.get('count'); // 없는 키는 null
await Dockit.storage.remove('count');
```

값은 JSON 형식입니다. 키는 영문·숫자로 시작하며 영문·숫자·점·밑줄·하이픈을 포함한 최대 64자입니다. 플러그인 전체 데이터는 8 MiB까지 저장할 수 있습니다. 여러 저장 요청은 순서대로 원자적으로 기록합니다.

```text
.dockit/
├─ plugins/<plugin-id>/             # 설치한 코드와 리소스
└─ plugin-data/<plugin-id>/
   ├─ storage.json                  # 설정과 사용자 데이터
   └─ credentials.json              # OS로 암호화한 API Key (v2)
```

창을 닫거나 앱을 종료해도 설치 파일과 데이터를 유지합니다. 플러그인을 삭제할 때만 다음 중 하나를 선택합니다.

- **데이터 남기기:** 설치 파일을 제거합니다. 같은 ID로 재설치하면 데이터를 다시 사용합니다.
- **함께 삭제:** 설치 파일과 해당 플러그인의 데이터를 함께 제거합니다. 다른 플러그인의 데이터에는 영향을 주지 않습니다.

삭제 파일은 OS 휴지통으로 보냅니다. 삭제 중 오류가 나면 설치 파일과 데이터를 복구합니다. 현재 동일 ID가 설치되어 있으면 덮어쓰지 않습니다. 버전을 교체하려면 데이터를 남기고 삭제한 다음 같은 GitHub 주소로 다시 설치합니다.

## 실행 범위와 패키지 제한

플러그인은 `sandbox="allow-scripts"` 프레임에서 실행합니다. Node.js, Electron IPC, 부모 화면 DOM, 로그인 정보, 문서 파일에 직접 접근할 수 없습니다. 호스트는 프레임별 실행 식별자로 SDK 요청을 처리하며, 저장 대상 플러그인 ID를 플러그인이 지정할 수 없습니다. 닫기·삭제·재시작 시 실행 식별자를 폐기합니다.

프레임에서 직접 보내는 외부 요청, 중첩 프레임, 팝업, 폼 제출, 임의 페이지 이동은 허용하지 않습니다. 외부 API와 이미지는 위의 호스트 API만 사용합니다. 글꼴 리소스는 앱에 이미 설정된 웹폰트 허용 목록을 따릅니다. 문서 접근 권한은 이 규격에 포함하지 않습니다.

ZIP은 압축 상태 32 MiB, 해제 후 128 MiB, 파일당 16 MiB, 파일·폴더 합계 4,096개까지 허용합니다. 경로 이탈, Windows 예약 이름, 대소문자 중복 경로와 `__dockit/` 예약 경로는 거부합니다.

## GitHub 배포와 등록

공식 플러그인은 `nokryong/dockit-plugins`의 `plugins/<이름>/` 폴더에 소스코드, `manifest.json`, 빌드된 실행 파일을 함께 관리합니다. 새 플러그인과 업데이트는 PR로 제출하고, 관리자가 소스·권한·실행 파일·동작을 검토한 뒤 병합합니다.

사용자는 **플러그인 → 플러그인 설치**에서 `https://github.com/nokryong/dockit-plugins`를 입력하고 항목을 선택합니다. `https://github.com/nokryong/dockit-plugins/tree/main/plugins/dice`처럼 개별 폴더 주소도 사용할 수 있습니다. 한 플러그인만 있는 저장소는 최상위에 `manifest.json`을 둘 수 있습니다.

설치 목록을 확인한 시점의 커밋으로 버전을 고정하고, 선택한 폴더의 파일만 다운로드하여 Git blob 해시를 대조합니다. 설치 중 저장소가 바뀌어도 서로 다른 버전의 파일이 섞이지 않습니다. 외부 저장소 주소를 직접 입력한 설치에는 공식 저장소의 PR 검수가 적용되지 않습니다.

## 예제와 로컬 패키지 검사

```powershell
npm run plugin:example
```

Dockit Open 저장소의 `examples/plugins/dice/`를 빌드하여 `.cache/example-plugin/dockit.dice-0.1.0.zip`을 만듭니다. ZIP 생성 과정에서 패키지 규격을 검사합니다. 사용자 설치는 GitHub 폴더 주소를 이용합니다.

이미 빌드한 다른 플러그인은 다음 명령으로 묶습니다.

```powershell
node scripts/package-plugin.cjs <빌드된-플러그인-폴더> <결과.zip>
```

검사는 `npm run test:plugins`로 실행합니다.
