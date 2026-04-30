#!/usr/bin/env node
/**
 * StockAI MCP Server
 *
 * Exposes stock analysis tools via Model Context Protocol so they can be
 * called from Claude Code, Cursor, or any other MCP-compatible client.
 *
 * Usage in Claude Code config (~/.claude.json):
 *   "mcpServers": {
 *     "stockai": { "command": "npx", "args": ["-y", "stockai-mcp"] }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// ─── HTTP helper ─────────────────────────────────────────────────────
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Accept: 'application/json',
};

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

const rawVal = (v) => (v?.raw !== undefined ? v.raw : v);
const fmtBig = (n) => {
  if (n == null || isNaN(n)) return null;
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toFixed(0);
};

// ─── Technical indicators ────────────────────────────────────────────
function ema(arr, period) {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}
function macd(closes) {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  if (e12 == null || e26 == null) return null;
  return e12 - e26;
}
function calcTechnicals(closes, highs, lows, volumes) {
  const last = closes[closes.length - 1];
  const r = rsi(closes);
  const m = macd(closes);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50);
  const recent = closes.slice(-30);
  const support = Math.min(...lows.slice(-30));
  const resistance = Math.max(...highs.slice(-30));
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volRatio = volumes[volumes.length - 1] / avgVol;
  return {
    price: last,
    rsi: r != null ? +r.toFixed(1) : null,
    macd: m != null ? +m.toFixed(3) : null,
    ema9: e9 != null ? +e9.toFixed(2) : null,
    ema21: e21 != null ? +e21.toFixed(2) : null,
    ema50: e50 != null ? +e50.toFixed(2) : null,
    emaCross: e9 && e21 ? (e9 > e21 ? 'bullish (9>21)' : 'bearish (9<21)') : null,
    trend: e21 && e50 ? (e21 > e50 ? 'uptrend' : 'downtrend') : null,
    support: +support.toFixed(2),
    resistance: +resistance.toFixed(2),
    volumeRatio: +volRatio.toFixed(2),
    rsiSignal: r > 70 ? 'overbought' : r < 30 ? 'oversold' : 'neutral',
  };
}

// ─── Tool implementations ────────────────────────────────────────────
async function getMarketData(symbol) {
  const sym = symbol.toUpperCase();
  const chart = await fetchJSON(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`
  );
  const result = chart?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${sym}`);
  const meta = result.meta;
  const q = result.indicators?.quote?.[0] || {};
  const closes = (q.close || []).filter((x) => x != null);
  const highs = (q.high || []).filter((x) => x != null);
  const lows = (q.low || []).filter((x) => x != null);
  const volumes = (q.volume || []).filter((x) => x != null);
  const tech = calcTechnicals(closes, highs, lows, volumes);
  const prevClose = meta.chartPreviousClose;
  const change = (((meta.regularMarketPrice - prevClose) / prevClose) * 100).toFixed(2);
  return {
    symbol: sym,
    price: meta.regularMarketPrice,
    change: +change,
    previousClose: prevClose,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    volume: meta.regularMarketVolume,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    technicals: tech,
    timestamp: new Date().toISOString(),
  };
}

async function getFundamentals(symbol) {
  const sym = symbol.toUpperCase();
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=assetProfile,financialData,defaultKeyStatistics,summaryDetail,calendarEvents,earningsTrend`
  );
  const r = data?.quoteSummary?.result?.[0] || {};
  const ap = r.assetProfile || {};
  const fd = r.financialData || {};
  const ks = r.defaultKeyStatistics || {};
  const sd = r.summaryDetail || {};
  const er = rawVal(r.calendarEvents?.earnings?.earningsDate?.[0]);
  return {
    symbol: sym,
    company: { name: ap.longName || sym, sector: ap.sector, industry: ap.industry, employees: ap.fullTimeEmployees, summary: ap.longBusinessSummary },
    valuation: {
      marketCap: fmtBig(rawVal(sd.marketCap)),
      trailingPE: rawVal(sd.trailingPE),
      forwardPE: rawVal(sd.forwardPE),
      priceToBook: rawVal(ks.priceToBook),
      beta: rawVal(ks.beta),
    },
    financials: {
      revenueGrowth: rawVal(fd.revenueGrowth),
      grossMargins: rawVal(fd.grossMargins),
      operatingMargins: rawVal(fd.operatingMargins),
      profitMargins: rawVal(fd.profitMargins),
      totalRevenue: fmtBig(rawVal(fd.totalRevenue)),
      freeCashflow: fmtBig(rawVal(fd.freeCashflow)),
      totalCash: fmtBig(rawVal(fd.totalCash)),
      totalDebt: fmtBig(rawVal(fd.totalDebt)),
    },
    nextEarnings: er ? new Date(er * 1000).toISOString().slice(0, 10) : null,
    analyst: {
      targetMean: rawVal(fd.targetMeanPrice),
      targetHigh: rawVal(fd.targetHighPrice),
      targetLow: rawVal(fd.targetLowPrice),
      recommendationMean: rawVal(fd.recommendationMean),
      numberOfAnalystOpinions: rawVal(fd.numberOfAnalystOpinions),
    },
  };
}

async function getNews(symbol, count = 6) {
  const sym = symbol.toUpperCase();
  const data = await fetchJSON(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=${count}&quotesCount=1`
  );
  return (data?.news || []).slice(0, count).map((n) => ({
    title: n.title,
    publisher: n.publisher,
    publishedAt: n.providerPublishTime
      ? new Date(n.providerPublishTime * 1000).toISOString()
      : null,
    link: n.link,
    summary: n.summary || null,
  }));
}

async function getMacro() {
  const symbols = [
    ['DX-Y.NYB', 'DXY (Dollar Index)'],
    ['%5ETNX', '10Y Treasury Yield'],
    ['GC%3DF', 'Gold Futures'],
    ['CL%3DF', 'Oil (WTI Crude)'],
    ['%5EVIX', 'VIX (Fear Index)'],
    ['%5EGSPC', 'S&P 500'],
  ];
  const results = await Promise.all(
    symbols.map(async ([s, label]) => {
      try {
        const d = await fetchJSON(
          `https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=5d`
        );
        const m = d?.chart?.result?.[0]?.meta;
        if (!m) return null;
        const change = (((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100).toFixed(2);
        return { label, price: m.regularMarketPrice, changePercent: +change };
      } catch (e) {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function getInsiderTrades(symbol) {
  const sym = symbol.toUpperCase();
  try {
    const data = await fetchJSON(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=insiderTransactions,netSharePurchaseActivity`
    );
    const r = data?.quoteSummary?.result?.[0] || {};
    const tx = (r.insiderTransactions?.transactions || []).slice(0, 10);
    const net = r.netSharePurchaseActivity || {};
    return {
      symbol: sym,
      recentTransactions: tx.map((t) => ({
        filerName: t.filerName,
        filerRelation: t.filerRelation,
        action: t.transactionText,
        shares: rawVal(t.shares),
        value: fmtBig(rawVal(t.value)),
        date: t.startDate?.fmt || null,
      })),
      sixMonthSummary: {
        netShares: fmtBig(rawVal(net.netInfoShares)),
        buyShares: fmtBig(rawVal(net.buyInfoShares)),
        sellShares: fmtBig(rawVal(net.sellInfoShares)),
      },
    };
  } catch (e) {
    return { symbol: sym, recentTransactions: [], error: e.message };
  }
}

async function getEarningsCalendar(days = 14) {
  // Major macro events (could be made dynamic, hardcoded for now)
  const FOMC_2026 = ['2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17', '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16'];
  const CPI_2026 = ['2026-01-14', '2026-02-11', '2026-03-12', '2026-04-10', '2026-05-13', '2026-06-11', '2026-07-15', '2026-08-12', '2026-09-11', '2026-10-15', '2026-11-13', '2026-12-10'];
  const today = new Date();
  const upcoming = [];
  const all = [
    ...FOMC_2026.map((d) => ({ date: d, event: 'FOMC Meeting', type: 'macro' })),
    ...CPI_2026.map((d) => ({ date: d, event: 'CPI Release', type: 'macro' })),
  ];
  for (const e of all) {
    const d = new Date(e.date);
    const diff = (d - today) / 86400000;
    if (diff >= 0 && diff <= days) upcoming.push({ ...e, daysAway: Math.round(diff) });
  }
  return upcoming.sort((a, b) => a.daysAway - b.daysAway);
}

async function comprehensiveAnalysis(symbol) {
  const sym = symbol.toUpperCase();
  const [market, fundamentals, news, macro, insiders] = await Promise.allSettled([
    getMarketData(sym),
    getFundamentals(sym),
    getNews(sym, 5),
    getMacro(),
    getInsiderTrades(sym),
  ]);
  return {
    symbol: sym,
    timestamp: new Date().toISOString(),
    market: market.status === 'fulfilled' ? market.value : { error: market.reason?.message },
    fundamentals: fundamentals.status === 'fulfilled' ? fundamentals.value : null,
    news: news.status === 'fulfilled' ? news.value : [],
    macro: macro.status === 'fulfilled' ? macro.value : [],
    insiders: insiders.status === 'fulfilled' ? insiders.value : null,
  };
}

// ─── MCP server setup ────────────────────────────────────────────────
const server = new Server(
  { name: 'stockai', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'analyze_stock',
    description: 'Comprehensive stock analysis: live price, technical indicators (RSI/MACD/EMA), fundamentals, news, macro context, and insider trades. Use this for full research on a ticker.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker (e.g., NVDA, AAPL, TSLA)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_market_data',
    description: 'Real-time price, volume, 52-week range, and technical indicators (RSI, MACD, EMA cross, support/resistance) for a stock.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_fundamentals',
    description: 'Company fundamentals: market cap, P/E ratios, margins, revenue growth, free cash flow, debt, analyst targets, and next earnings date.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_news',
    description: 'Latest news headlines for a stock with publish dates and links.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker' },
        count: { type: 'number', description: 'Number of articles (default 6, max 20)', default: 6 },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_macro_data',
    description: 'Current macroeconomic indicators: DXY (Dollar Index), 10Y Treasury Yield, Gold, Oil, VIX, S&P 500. Useful for market context.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_insider_trades',
    description: 'Recent insider buy/sell transactions for a stock and 6-month net activity summary.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_economic_calendar',
    description: 'Upcoming macro events (FOMC meetings, CPI releases) within the next N days.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days ahead to check (default 14)', default: 14 },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let result;
    switch (name) {
      case 'analyze_stock':
        result = await comprehensiveAnalysis(args.symbol);
        break;
      case 'get_market_data':
        result = await getMarketData(args.symbol);
        break;
      case 'get_fundamentals':
        result = await getFundamentals(args.symbol);
        break;
      case 'get_news':
        result = await getNews(args.symbol, Math.min(args.count || 6, 20));
        break;
      case 'get_macro_data':
        result = await getMacro();
        break;
      case 'get_insider_trades':
        result = await getInsiderTrades(args.symbol);
        break;
      case 'get_economic_calendar':
        result = await getEarningsCalendar(args.days || 14);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error: ${e.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[stockai-mcp] Server running on stdio');
