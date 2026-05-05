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

### Automatic release from GitHub

The repository now includes `.github/workflows/release.yml`.

Use either of these two ways:

1. Push a tag such as `v2.0.6`
2. Or run the `Build And Release` workflow manually from GitHub Actions

After that, GitHub Actions will:

1. install dependencies
2. run `npm run check`
3. build macOS `dmg` and `zip`
4. upload them to the GitHub Release page automatically

### Manual release

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
