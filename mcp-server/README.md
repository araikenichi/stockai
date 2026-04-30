# StockAI MCP Server

Stock analysis tools for **Claude Code**, **Cursor**, and any other MCP-compatible client.

Use your existing Claude Code subscription to do AI-powered stock research from your terminal — no API keys, no separate app, no extra cost.

## Features

15 tools exposed via MCP:

| Tool | Description |
|---|---|
| `analyze_stock` | Comprehensive analysis (price + technicals + fundamentals + news + macro + insiders) |
| `get_market_data` | Real-time price, RSI, MACD, EMA cross, support/resistance |
| `get_fundamentals` | P/E, margins, FCF, analyst targets, earnings date |
| `get_news` | Latest headlines with publish dates |
| `get_macro_data` | DXY, 10Y, Gold, Oil, VIX, S&P 500 |
| `get_insider_trades` | Executive buys/sells + 6-month net |
| `get_economic_calendar` | Upcoming FOMC, CPI events |
| `get_advanced_technicals` | Bollinger Bands, Stochastic %K, ATR, Williams %R, Ichimoku Cloud |
| `get_multi_timeframe` | RSI + EMA + trend across 5m / 1h / 1d / 1wk timeframes |
| `get_options_data` | Implied volatility, put/call ratio, ATM strike, expiration dates |
| `get_short_interest` | Short % of float, days-to-cover, squeeze potential |
| `compare_stocks` | Side-by-side: price, RSI, PE, margins, analyst target for 2–6 tickers |
| `get_sector_performance` | All 11 S&P 500 sectors day/week/month returns |
| `get_earnings_history` | Last 8 quarters actual vs estimate, beat rate, forward estimates |
| `get_volume_profile` | 3-month volume histogram + Point of Control price level |

## Install

### Claude Code

```bash
claude mcp add stockai --scope user npx -y stockai-mcp
```

Or manually edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "stockai": {
      "command": "npx",
      "args": ["-y", "stockai-mcp"]
    }
  }
}
```

### Cursor

Edit `~/.cursor/mcp.json` (or via Settings → MCP):

```json
{
  "mcpServers": {
    "stockai": {
      "command": "npx",
      "args": ["-y", "stockai-mcp"]
    }
  }
}
```

### From source (development)

```bash
git clone https://github.com/araikenichi/stockai.git
cd stockai/mcp-server
npm install
claude mcp add stockai --scope user node $(pwd)/index.js
```

## Usage

In Claude Code (or Cursor), just ask naturally:

- *"Analyze NVDA — full picture, recent news, and macro context"*
- *"What are TSLA's fundamentals? Is the valuation reasonable?"*
- *"Show me upcoming FOMC events and what tickers might be impacted"*
- *"Which insiders are buying AAPL recently?"*

The model will automatically pick the right tool(s) and combine results.

## Why MCP over a standalone app?

- **No API keys** — uses your existing Claude Code session
- **No extra subscription** — included in Claude Code
- **Vision support** — Claude Code can analyze chart screenshots you paste
- **Streaming** — real-time response
- **Composable** — combine with other MCP tools (filesystem, git, etc.)

## License

MIT
