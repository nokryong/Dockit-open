# Dockit Plugin SDK

English · [한국어](README.ko.md)

The browser API, package validation and ZIP packaging tool for Dockit plugins.

## Install

```sh
npm install --save-dev github:nokryong/dockit-plugin-sdk
```

## Packaging

Put your built HTML, JavaScript and CSS in one folder together with `manifest.json`.

```sh
npx dockit-plugin-pack ./dist ./my-plugin-0.1.0.zip
```

You can use the ZIP to check the package locally. To publish, put the built files and `manifest.json` in a `plugins/<name>/` folder of a public repository. In Dockit Open, open **Plugins → Install plugin**, enter the repository address and choose the plugin. The GitHub address of a single plugin folder also works.

## Browser API

Dockit provides `window.Dockit` when it opens a toolkit, so plugins do not need to include the bridge themselves.

```js
const theme = await Dockit.ready;
const count = await Dockit.storage.get('count');
await Dockit.storage.set('count', (count ?? 0) + 1);
```

See the [SDK guide](https://github.com/nokryong/dockit-plugin-sdk/blob/main/docs/SDK.md) for the full specification, and the [official plugins](https://github.com/nokryong/dockit-plugins) for working examples.
