# Security policy

English · [한국어](SECURITY.ko.md)

## Supported versions

Security fixes ship in the [latest release](https://github.com/nokryong/Dockit-open/releases/latest). If you use an older version, please update to the latest one.

## Reporting a vulnerability

**Please do not report security issues in public issues.** Report them privately through **Security → Report a vulnerability** in this repository.

Including the following helps us confirm the issue faster:

- Affected version and operating system
- Steps to reproduce or a sample file (without personal information)
- Expected impact (for example, exposure of document content or credentials, arbitrary code execution, or escaping the plugin sandbox)

We will reply once we have confirmed the report, and keep the details private until a fix is released. After the fix, we can credit you in the release notes if you wish.

## Scope

We are especially interested in:

- Reading or writing files outside the documents folder
- Exposure of ChatGPT or Codex credentials, or of plugin API keys
- Plugins escaping their isolated frame to access the app or documents
- Bypassing verification of update files

For the behavior of a plugin installed from outside the official repository, please contact that plugin's author.
