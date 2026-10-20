# Contributing

English · [한국어](CONTRIBUTING.ko.md)

Thanks for your interest in Dockit Open. Bug reports, feature ideas, documentation fixes and code contributions are all welcome. Issues and pull requests in English or Korean are fine.

## Issues

- **Bugs**: use the [bug report](https://github.com/nokryong/Dockit-open/issues/new?template=bug_report.yml) form. Your OS, app version and steps to reproduce help us fix it faster.
- **Ideas**: use the [feature request](https://github.com/nokryong/Dockit-open/issues/new?template=feature_request.yml) form.
- **Security issues** must not be reported as public issues. Follow the [security policy](SECURITY.md) instead.
- When attaching a file that contains document content, use a sample file with personal information removed.

## Development setup

Node.js 24 or later is required.

```sh
npm install
npm run dev
```

## Pull requests

1. Fork the repository and create a working branch.
2. Keep each change focused on one purpose. For larger changes, it helps to agree on the direction in an issue first.
3. Run the following before submitting:

   ```sh
   npm run lint
   npx tsc --noEmit
   npm test
   npm run test:local
   npm run build
   ```

   If you changed the interface or Electron behavior, also run `npm run test:desktop`. The kinds of checks are described in [TESTING.md](TESTING.md).
4. If you added or changed dependencies, refresh the third-party notices and the security snapshot.

   ```sh
   npm run licenses:refresh-evidence
   npm run security:refresh-snapshot
   ```

5. In the pull request description, explain what changed, why, and how you verified it. Attach screenshots for interface changes.

## Coding guidelines

- Follow the style and naming of the surrounding code.
- Documents are stored only on the user's computer. Any feature that sends document content or personal information elsewhere must run only when the user clearly chooses it.
- Protect credentials with the OS-encrypted store, and never write them to settings files or logs.
- Write user-facing text as the Korean source string wrapped in `uiText`, and add its English translation to `desktop/locales/en.json`. Do not translate document content or names the user saved.

## Plugins

Plugin contributions go to [dockit-plugins](https://github.com/nokryong/dockit-plugins), not this repository. For the plugin API, see the [Plugin SDK](docs/plugins/SDK.md).

## License

This repository is distributed under the [GNU AGPL v3.0](LICENSE). By opening a pull request, you agree that your contribution is distributed under the same license.
