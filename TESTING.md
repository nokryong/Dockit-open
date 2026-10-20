# Testing

English · [한국어](TESTING.ko.md)

Install dependencies with Node.js 24 or later, then run:

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run test:local
npm run build
npm run test:desktop
npm run test:chatgpt
```

- Unit tests: the editor, pagination, document conversion, the save queue and UI behavior.
- Local tests: folder and file storage, path restrictions, change conflicts and IPC.
- Desktop tests: in a temporary user folder, window controls, saving and reopening documents, widget storage, saving before quit, and the narrow-window layout.
- Language tests: after building, `npm run test:i18n` checks for missing translations and placeholders, switching between Korean and English, following the system language, keeping the language after a restart, font display, and that document content is preserved.
- ChatGPT tests: with synthetic OAuth, JWKS and API responses, they check sign-in and cancel, the first-use notice, OS-encrypted storage across restarts, per-account conversations, streaming and usage-limit errors, and sign-out and reconnect. Screenshots of the light and dark themes and the narrow window are saved to `.cache/chatgpt-smoke/`.
- CLI tests: `npm run test:codex` checks separate sign-in, cancel and sign-out, switching between ChatGPT and Codex, stopping chats and chat history, usage, and the theme and narrow-window layouts. Authentication and responses are synthetic, and result screens are saved to `.cache/codex-smoke/`. If the CLI is installed, `npm run test:local` also starts a real process with an empty temporary `CODEX_HOME`.

Browser tests for document output and diagrams run against their own Vite test pages.

```powershell
npx playwright install chromium
$env:DOCKIT_E2E_BROWSER_CHANNEL = "bundled"
npm run test:e2e
```

No real account or server is needed. Desktop screenshots are in `.cache/desktop-smoke/`, and failure records are in `test-results/`.

Verifying a real ChatGPT connection is separate. In Settings, give consent with your own account, choose a model, and confirm that a short message gets a complete reply. A successful sign-in or a model list alone does not prove that responses work.

For a real CLI connection, sign in separately with **Sign in with CLI** in Settings, then check chat replies, image generation and copying, and usage. Restart the app to confirm that the connection and history are kept. Automated tests never use personal account credentials.

After dependency changes, refresh and check the third-party notices and the security snapshot.

```powershell
npm run licenses:refresh-evidence
npm run licenses:check
npm run security:refresh-snapshot
npm run security:check
```

Checking the installers and real behavior on macOS and Linux is separate.

## Plugins

`npm run test:plugins` runs the package, path and storage permission checks, then builds the dice ZIP and installs, runs, restarts and removes it in an Electron app with its own user folder. It also checks reinstalling with kept data, removing data together with the plugin, canceling, theme changes and the narrow window. It never uses a server or app you started yourself. Screens are saved to `.cache/plugin-smoke/`.
