# StockAI

StockAI is a desktop AI stock-analysis assistant built with Electron. It is designed for people who want a small floating assistant while reviewing charts, TradingView, portfolios, and watchlists.

## Features

- Screenshot-based chart analysis
- TradingView local connection support
- Floating compact window
- Real-time monitoring
- Watchlist batch analysis
- Portfolio dashboard
- Copyable AI output
- Markdown report export
- Local encrypted API key storage

## Important

StockAI is not financial advice. Outputs may be wrong, delayed, incomplete, or unsuitable for your situation. Always verify market data and make your own trading decisions.

## Install From GitHub Releases

1. Open the latest GitHub Release.
2. Download `StockAI-<version>-arm64.dmg` for Apple Silicon Macs, or `StockAI-<version>-x64.dmg` for Intel Macs.
3. Open the DMG and drag StockAI into Applications.
4. Launch StockAI.
5. Enter your own Gemini, Claude, or OpenAI API key in Settings.

## macOS Screen Recording Permission

Screenshot and real-time screen analysis require macOS Screen Recording permission.

Open:

```text
System Settings -> Privacy & Security -> Screen Recording
```

Enable StockAI, then restart the app.

## TradingView Connection

The TradingView integration expects a local Chrome debugging session on port `9222`. This is an advanced local feature and may require launching Chrome with remote debugging enabled.

## Development

```bash
npm install
npm start
```

## Build macOS DMG

```bash
npm run dist
```

Build output will be created in `dist/`.

## API Key Safety

StockAI does not include the author's API keys. Each user enters their own key. Keys are stored locally on the user's machine using Electron `safeStorage`.

## Documents

- [Disclaimer](DISCLAIMER.md)
- [Privacy](PRIVACY.md)
- [Security](SECURITY.md)

## License

MIT
