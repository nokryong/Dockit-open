# Dockit Plugin SDK v2

English · [한국어](SDK.ko.md)

A plugin is a folder containing built HTML, JavaScript and CSS together with `manifest.json`. Plugins are installed from public GitHub repositories, and installing one does not rebuild Dockit.

v1 plugins keep working. To use external APIs, API keys or image features, set `sdkVersion: 2`.

## Package

```text
manifest.json
index.html
assets/
  main.js
  style.css
```

Put `manifest.json` at the top level of the plugin folder.

```json
{
  "manifestVersion": 1,
  "sdkVersion": 1,
  "id": "dockit.dice",
  "name": "Dice",
  "publisher": "nokryong",
  "version": "0.1.0",
  "description": "Add dice and click them to roll.",
  "icon": "react-icons/tb/TbDice",
  "permissions": ["storage"],
  "widgets": [
    { "id": "dice", "title": "Dice", "entry": "index.html" }
  ]
}
```

- Plugin ID: a dot-separated name that starts with a lowercase letter, for example `publisher.toolkit`. Keep the same ID when reinstalling.
- Version: `1.2.3` or `1.2.3-beta.1`.
- `widgets`: 1 to 20 toolkits. Each ID uses lowercase letters, digits and hyphens, and starts with a lowercase letter. IDs must be unique within a package.
- `entry`: an `.html` file inside the package. Reference JavaScript, CSS and images with relative paths.
- `icon`: the plugin icon, either a React Icons name or the path of an SVG inside the package. A toolkit without its own `icon` uses the plugin icon.
- `permissions`: v1 supports `storage`; v2 supports `storage`, `network`, `credentials`, `images` and `external`. Declare only what you need. Packages with an unknown permission or SDK version are not installed.
- `publisher` is a display name entered by the author. It is not a signature and does not verify the author.

Bundle React and any other libraries you use into the plugin build. Do not import Dockit's internal components or its React instance. Build with Vite using `base: './'`. Include the notice files of the libraries you use in the package.

### Icons

Specify React Icons as `react-icons/<library>/<component>`, for example `react-icons/tb/TbDice` or `react-icons/lu/LuMusic`. Icons come from the React Icons version bundled with Dockit and follow the app's color theme.

Register your own SVG as `"icon": "assets/icon.svg"` and include the file in the plugin folder. Design it at 40×40 and set `viewBox` and `xmlns="http://www.w3.org/2000/svg"`. The SVG must be 64 KiB or smaller and keeps its original colors.

The plugin manager shows the icon at 40×40 to the left of the plugin details. The same icon is used, resized, in the toolkit picker and in the title of an open toolkit. To give toolkits different icons, set an `icon` in the same format on each `widgets` entry.

A package with a missing icon, or an invalid icon name or file, is not installed. The legacy names `dice`, `calendar`, `music` and `puzzle` are still supported, and legacy packages without a plugin icon use the icon registered for their first toolkit.

## Runtime and UI

Dockit handles the title, icon, dragging, collapsing and closing; the plugin draws the body. Set title buttons and footer text with the SDK below. You do not need to create an iframe.

Dockit injects the SDK into the entry HTML. Draw your UI after the SDK is ready.

```js
const theme = await window.Dockit.ready;
console.log(theme.name, theme.isDarkMode);

const unsubscribe = Dockit.onThemeChange(theme => {
  // Apply theme.name, theme.colors and theme.fontFamily to the UI.
});
```

`Dockit.theme` is the current `{ name, isDarkMode, colors, fontFamily }`. `colors` is Dockit's color palette. The SDK also updates the `--dockit-font` CSS variable and `color-scheme`. Subscriptions return an unsubscribe function.

### Language

After `await Dockit.ready`, read the app language (`ko` or `en`) from `Dockit.language` and subscribe to changes with `Dockit.onLanguageChange(language => ...)`. Changing the language does not reopen the plugin, and `document.documentElement.lang` is updated too. The subscription returns an unsubscribe function. On older hosts, use `Dockit.language ?? 'ko'`.

The install list and toolkit titles are translated with the optional `locales` field in the manifest. Missing strings fall back to `name`, `description` and `widgets[].title`. Widgets are keyed by `widgets[].id`; IDs, permissions and storage keys do not change.

```json
"locales": {
  "en": {
    "name": "Calendar",
    "description": "Save and manage events by date.",
    "widgets": { "calendar": "Calendar" }
  }
}
```

Translate interface text and date formats, but do not translate or re-save content the user entered, such as events, documents, search results or file names.

The body height is reported to the host automatically. Toolkits are shown between 48 and 720 px tall, and longer content scrolls inside the frame. Do not set `100vh` or a fixed minimum height on `body`, or the height can keep growing.

```js
await Dockit.setActions([
  { id: 'add', label: 'Add dice', icon: 'plus', disabled: false }
]);
const unsubscribe = Dockit.onAction(id => {
  if (id === 'add') addDice();
});
await Dockit.setFooter('3 dice');
```

You can add up to 5 title buttons. `label` is required, and `icon` supports `plus`, `minus`, `refresh` and `key`. Without an icon the button shows its label. Title buttons are drawn with the host's sud-ui. Call `setFooter('')` to clear the footer.

`Dockit.notify(message, type)` shows a sud-ui toast from the host. `type` is `danger` (the default), `warning` or `info`. Use it for errors, and do not show unnecessary success messages.

## API keys and external services

In a v2 manifest, declare each service's fixed HTTPS endpoint and where its API key goes.

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
const result = await Dockit.network.get('pixabay', { q: 'cat', per_page: 10 });
```

`configure` opens Dockit's key input dialog. When the user saves, deletes or cancels, it returns the current configuration status. The plugin never receives the key itself. `revision` changes whenever the key changes, so you can keep caches separate per account.

Keys are encrypted with Electron's OS-backed `safeStorage` and saved in that plugin's `credentials.json`. If secure encryption is not available, the key is not saved. The `storage` API cannot read this file. When the plugin is uninstalled, the choice to keep or delete data applies to keys as well. If the service address or authentication method changes, the old key is no longer used.

`network.get` sends only GET requests to registered services. Pass query values as strings, numbers or booleans, and do not set the authentication field yourself; the host injects the key. For header authentication, declare it like `credential: { "in": "header", "name": "Authorization", "prefix": "Bearer " }`. For services without authentication, omit `credential` and the `credentials` permission.

The host connects only to public HTTPS addresses and rejects private IPs, redirects of authenticated requests, and JSON responses over 2 MiB. Plugins must follow each service's rate limits and caching policy.

## Images and external links

```js
const src = await Dockit.images.load(image.webformatURL);
// Use the returned data URL as <img src>.
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

With the `images` permission, the host fetches images from origins registered in `imageOrigins`. JPEG, PNG, WebP and GIF are supported, up to 32 MiB per file. `preview` opens Dockit's large preview window, and `download` saves the image once the user chooses a location. It returns `false` if the user cancels.

External pages and author profile links open in the default browser only with the `external` permission and only for origins registered in `externalOrigins`. Permissions for API service addresses, image origins and external link origins are kept separate.

## Data

Only plugins with the `storage` permission can use this API.

```js
await Dockit.storage.set('count', 3);
const count = await Dockit.storage.get('count'); // null for a missing key
await Dockit.storage.remove('count');
```

Values are JSON. Keys start with a letter or digit and may contain letters, digits, dots, underscores and hyphens, up to 64 characters. Each plugin can store up to 8 MiB in total. Multiple save requests are written atomically, in order.

```text
.dockit/
├─ plugins/<plugin-id>/             # Installed code and resources
└─ plugin-data/<plugin-id>/
   ├─ storage.json                  # Settings and user data
   └─ credentials.json              # API keys encrypted by the OS (v2)
```

Installed files and data are kept when a window closes or the app quits. Only when uninstalling a plugin, the user chooses one of these:

- **Keep data:** removes the installed files. Reinstalling with the same ID reuses the data.
- **Delete data too:** removes the installed files and that plugin's data. Other plugins' data is not affected.

Deleted files go to the OS trash. If an error occurs during removal, the installed files and data are restored. A plugin is not installed if one with the same ID is already installed. New versions replace the old one through **Update** in the plugin manager, and saved data and API keys are kept.

### Dockit Web

The web version uses the same `storage` API. For signed-in users, plugin data and the install list sync to their account and carry over to other browsers; without signing in, they are saved only in the current browser. Because the web version also keeps a copy in browser storage, the space actually available can be smaller than 8 MiB. API keys are not synced to the account; they are encrypted and saved in the current browser. The web host sends external requests from the browser, so the declared services and image origins must allow CORS.

## Sandbox and package limits

Plugins run in a `sandbox="allow-scripts"` frame. They cannot access Node.js, Electron IPC, the parent page's DOM, sign-in data or document files directly. The host handles SDK requests with a per-frame session identifier, and plugins cannot choose which plugin ID their data is stored under. Session identifiers are discarded when the plugin is closed, removed or restarted.

Direct external requests from the frame, nested frames, popups, form submission and arbitrary navigation are not allowed. Use only the host APIs above for external APIs and images. Font resources follow the app's existing web font allowlist. Document access is not part of this specification.

ZIP packages may be up to 32 MiB compressed and 128 MiB uncompressed, 16 MiB per file, and 4,096 files and folders in total. Path traversal, Windows reserved names, paths that differ only in letter case, and the reserved `__dockit/` path are rejected.

## Publishing on GitHub

Official plugins keep their source code, `manifest.json` and built files together in `plugins/<name>/` folders of `nokryong/dockit-plugins`. New plugins and updates are submitted as pull requests and merged after the maintainer reviews the source, permissions, built files and behavior.

Users open **Plugins → Install plugin**, enter `https://github.com/nokryong/dockit-plugins` and choose an entry. A single folder address such as `https://github.com/nokryong/dockit-plugins/tree/main/plugins/dice` also works. A repository with only one plugin can keep `manifest.json` at its top level.

To publish a new version, increase `version` in `manifest.json`. When the plugin window opens, the app checks the repository, branch and folder the plugin was installed from for a new version, and shows an **Update** button next to **Remove**. Updating replaces only code and resources and keeps saved data and API keys. The ID and publisher must match the previous version.

The version is pinned to the commit at the time the install list was checked. Only the files in the chosen folder are downloaded, and their Git blob hashes are verified, so files from different versions are never mixed even if the repository changes during installation. Installs from an external repository address entered directly do not go through the official repository's pull request review.

## Example and local package check

```powershell
npm run plugin:example
```

This builds `examples/plugins/dice/` in the Dockit Open repository and creates `.cache/example-plugin/dockit.dice-0.1.0.zip`. The package format is checked while the ZIP is created. Users install plugins from a GitHub folder address.

To package another plugin you have already built:

```powershell
node scripts/package-plugin.cjs <built-plugin-folder> <output.zip>
```

Run the checks with `npm run test:plugins`.
