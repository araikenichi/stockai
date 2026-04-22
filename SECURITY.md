# Security

## Supported Versions

The latest release is the supported version.

## API Key Handling

StockAI stores API keys locally with Electron `safeStorage`. Do not commit personal API keys, `.env` files, certificates, or local app data.

## Reporting Security Issues

If you find a security issue, please open a private report or contact the maintainer directly. Avoid posting exploitable details publicly before a fix is available.

## Release Safety Checklist

- Verify no API keys are committed.
- Confirm `nodeIntegration` is disabled.
- Confirm `contextIsolation` is enabled.
- Confirm IPC channels are allowlisted in `preload.js`.
- Build from a clean dependency install.
- Prefer signed and notarized macOS releases for public distribution.
