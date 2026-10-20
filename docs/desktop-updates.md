# App updates

English · [한국어](desktop-updates.ko.md)

The released app checks `nokryong/Dockit-open` for a new release 3 seconds after starting and every 6 hours after that. When a new version is available, a sud-ui modal asks whether to install it. A version the user dismisses is not offered again during that run.

On Windows and Linux, choosing Install shows the download progress. When the download finishes, the app waits for any AI work in progress, saves open documents and local settings, then installs and restarts. If saving fails or times out, it does not install and offers a retry. Automatic installation on a normal quit is turned off.

macOS builds are distributed without a signing certificate, so the **Download** button in the update notice opens the GitHub release page. The user replaces the app manually; this button neither saves documents nor quits the app.

## Previewing the UI

In an app started with `npm run dev`, press `Ctrl+Shift+U` (macOS: `Cmd+Shift+U`) to preview the same modal. Choosing Install plays the progress → saving → restart steps and then closes. On macOS, the download preview closes when you press the button. The preview never saves files, downloads, installs or quits the app. Press the shortcut again to start over.

Modal: `app/LIB/components/updates/AppUpdateModal.js`

## Preparing a release

`npm run package:desktop` creates the installer and update metadata for the current OS in `release/`. It uses `--publish never`, so nothing is uploaded. Windows uses NSIS, macOS uses DMG and ZIP, and Linux uses AppImage. The files to include are listed in `electron-builder.yml` so that the full source and personal data never end up in the package.

For a real release, upload the installers, blockmaps and `latest*.yml` for each OS and architecture to a public GitHub release. Bump the version in `package.json`. Releases are not code-signed, so Windows and macOS may show security warnings during installation or launch. Automatic installation on macOS will be enabled separately once code signing is in place. No token for the update repository is included in the app.

Patch versions run from `0` to `9`. When the patch is `9`, the next release bumps the minor version and resets the patch to `0`, as in `0.1.9 → 0.2.0` and `0.2.9 → 0.3.0`. When the minor version is also `9`, bump the major version, as in `0.9.9 → 1.0.0`. Keep the app version in `package-lock.json` in sync.

Before a release, check on Windows and Linux that an installed app saves a document and then updates and restarts, and on macOS that you can download the new version, replace the app and relaunch it.

## Checking the installed app

```sh
npm run package:desktop
npm run test:packaged
```

`test:packaged` checks, in a temporary user folder, that the built app opens, saves and reopens documents and accepts `.dkt` launch arguments. It never uses your documents or a running app.

On Windows, `npm run test:update-download` downloads the generated installer from a local HTTP server and checks the progress, checksum verification, the order of saving before handing off to the installer, and the restart arguments. It also checks that a corrupted download is blocked. The installer process itself is replaced, so this is separate from verifying a real OS installation and restart.

In CI, `update-install-smoke.cjs` installs the real NSIS installer on a temporary Windows VM and updates from an installation set to an older version. It checks saving the open document, replacing the installed files, the automatic restart and reopening the document. It changes file associations and the registry, so it runs only on GitHub's disposable Windows runners.

Running the **Desktop package check** in GitHub Actions manually, or pushing to a `codex/release-check-*` branch, packages and checks the installed app on Windows, macOS and Linux and keeps the results as Actions artifacts. It does not publish a release. Until a signing certificate is connected, these results do not replace signature verification for distribution.
