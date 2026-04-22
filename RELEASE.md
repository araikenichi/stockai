# Release Guide

## 1. Prepare

```bash
npm install
npm run check
```

## 2. Build

```bash
npm run dist
```

The generated DMG and ZIP files will appear in `dist/`.

## 3. GitHub Release

1. Create a new GitHub Release.
2. Use a tag such as `v2.0.0`.
3. Upload the generated DMG files.
4. Mention that users must enter their own API key.
5. Mention that screenshot analysis requires macOS Screen Recording permission.

## 4. Optional Production Hardening

- Apple Developer ID signing
- macOS notarization
- Auto update
- Dedicated app icon
- Public website with a download button
