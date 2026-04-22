# Privacy

StockAI is a local desktop app.

## API Keys

Users enter their own Gemini, Claude, or OpenAI API keys. Keys are stored locally on the user's device using Electron `safeStorage`. The project does not include the author's API keys.

## Data Sent To AI Providers

When a user requests analysis, StockAI may send the following data to the selected AI provider:

- User prompts
- Stock symbols
- Market data
- Portfolio/watchlist context entered in the app
- Screenshots when screenshot analysis is enabled
- TradingView context when connected

AI providers process this data according to their own terms and privacy policies.

## Local Data

StockAI may store local app data such as watchlists, portfolio entries, analysis history, preferences, and encrypted API keys in the app data directory on the user's machine.

## No Central Server

The desktop app does not require a central StockAI server for core usage.
