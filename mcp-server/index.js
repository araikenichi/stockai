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
function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mean + mult * sd, lower = mean - mult * sd;
  const last = closes[closes.length - 1];
  const pctB = ((last - lower) / (upper - lower)) * 100;
  return {
    middle: +mean.toFixed(2),
    upper: +upper.toFixed(2),
    lower: +lower.toFixed(2),
    bandwidth: +((upper - lower) / mean * 100).toFixed(2),
    percentB: +pctB.toFixed(1),
    signal: pctB > 95 ? 'near upper band (overbought)' : pctB < 5 ? 'near lower band (oversold)' : 'middle',
  };
}
function stochastic(closes, highs, lows, period = 14) {
  if (closes.length < period) return null;
  const recentClose = closes[closes.length - 1];
  const periodHigh = Math.max(...highs.slice(-period));
  const periodLow = Math.min(...lows.slice(-period));
  if (periodHigh === periodLow) return null;
  const k = ((recentClose - periodLow) / (periodHigh - periodLow)) * 100;
  return { k: +k.toFixed(1), signal: k > 80 ? 'overbought' : k < 20 ? 'oversold' : 'neutral' };
}
function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trs.push(tr);
  }
  const v = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  return +v.toFixed(3);
}
function williamsR(closes, highs, lows, period = 14) {
  if (closes.length < period) return null;
  const high = Math.max(...highs.slice(-period));
  const low = Math.min(...lows.slice(-period));
  if (high === low) return null;
  const wr = ((high - closes[closes.length - 1]) / (high - low)) * -100;
  return +wr.toFixed(1);
}
function ichimoku(closes, highs, lows) {
  if (closes.length < 52) return null;
  const tenkan = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
  const kijun = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = (Math.max(...highs.slice(-52)) + Math.min(...lows.slice(-52))) / 2;
  const last = closes[closes.length - 1];
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  return {
    tenkanSen: +tenkan.toFixed(2),
    kijunSen: +kijun.toFixed(2),
    senkouSpanA: +senkouA.toFixed(2),
    senkouSpanB: +senkouB.toFixed(2),
    signal: last > cloudTop ? 'above cloud (bullish)' : last < cloudBottom ? 'below cloud (bearish)' : 'inside cloud (neutral)',
    cross: tenkan > kijun ? 'tenkan>kijun (bullish)' : 'tenkan<kijun (bearish)',
  };
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

// ─── New tools ───────────────────────────────────────────────────────
async function getAdvancedTechnicals(symbol) {
  const sym = symbol.toUpperCase();
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=6mo`
  );
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error(`No data for ${sym}`);
  const q = r.indicators?.quote?.[0] || {};
  const closes = (q.close || []).filter((x) => x != null);
  const highs = (q.high || []).filter((x) => x != null);
  const lows = (q.low || []).filter((x) => x != null);
  return {
    symbol: sym,
    price: closes[closes.length - 1],
    bollingerBands: bollinger(closes),
    stochastic: stochastic(closes, highs, lows),
    williamsR: williamsR(closes, highs, lows),
    atr14: atr(highs, lows, closes),
    ichimokuCloud: ichimoku(closes, highs, lows),
    standardTechnicals: calcTechnicals(closes, highs, lows, q.volume || []),
  };
}

async function getMultiTimeframe(symbol) {
  const sym = symbol.toUpperCase();
  const tfs = [
    { name: '5m', interval: '5m', range: '1d' },
    { name: '1h', interval: '1h', range: '5d' },
    { name: '1d', interval: '1d', range: '1mo' },
    { name: '1wk', interval: '1wk', range: '6mo' },
  ];
  const results = await Promise.all(
    tfs.map(async (tf) => {
      try {
        const d = await fetchJSON(
          `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${tf.interval}&range=${tf.range}`
        );
        const r = d?.chart?.result?.[0];
        if (!r) return null;
        const closes = (r.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
        if (!closes.length) return null;
        const first = closes[0], last = closes[closes.length - 1];
        const e21 = ema(closes, 21);
        const r14 = rsi(closes);
        return {
          timeframe: tf.name,
          latest: +last.toFixed(2),
          startOfPeriod: +first.toFixed(2),
          changePercent: +(((last - first) / first) * 100).toFixed(2),
          high: +Math.max(...closes).toFixed(2),
          low: +Math.min(...closes).toFixed(2),
          rsi: r14 != null ? +r14.toFixed(1) : null,
          ema21: e21 != null ? +e21.toFixed(2) : null,
          trendVsEMA21: e21 != null ? (last > e21 ? 'above' : 'below') : null,
        };
      } catch (e) {
        return { timeframe: tf.name, error: e.message };
      }
    })
  );
  return { symbol: sym, timeframes: results.filter(Boolean) };
}

async function getOptionsData(symbol) {
  const sym = symbol.toUpperCase();
  const data = await fetchJSON(`https://query2.finance.yahoo.com/v7/finance/options/${sym}`);
  const result = data?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${sym}`);
  const expirations = (result.expirationDates || [])
    .slice(0, 8)
    .map((t) => new Date(t * 1000).toISOString().slice(0, 10));
  const quote = result.quote || {};
  const opt = result.options?.[0] || {};
  const calls = opt.calls || [], puts = opt.puts || [];
  const callVol = calls.reduce((s, c) => s + (rawVal(c.volume) || 0), 0);
  const putVol = puts.reduce((s, p) => s + (rawVal(p.volume) || 0), 0);
  const callOI = calls.reduce((s, c) => s + (rawVal(c.openInterest) || 0), 0);
  const putOI = puts.reduce((s, p) => s + (rawVal(p.openInterest) || 0), 0);
  const price = quote.regularMarketPrice;
  // Find ATM call (closest strike to current price)
  let atmCall = null;
  let minDiff = Infinity;
  for (const c of calls) {
    const k = rawVal(c.strike);
    if (k != null && Math.abs(k - price) < minDiff) {
      minDiff = Math.abs(k - price);
      atmCall = c;
    }
  }
  return {
    symbol: sym,
    underlyingPrice: price,
    nearestExpiration: expirations[0] || null,
    upcomingExpirations: expirations,
    atmStrike: atmCall ? rawVal(atmCall.strike) : null,
    atmImpliedVolatility: atmCall && rawVal(atmCall.impliedVolatility) != null
      ? +(rawVal(atmCall.impliedVolatility) * 100).toFixed(1)
      : null,
    putCallVolumeRatio: callVol ? +(putVol / callVol).toFixed(2) : null,
    putCallOIRatio: callOI ? +(putOI / callOI).toFixed(2) : null,
    totalCallVolume: callVol,
    totalPutVolume: putVol,
    totalCallOpenInterest: callOI,
    totalPutOpenInterest: putOI,
    sentiment:
      callVol && putVol
        ? putVol / callVol > 1.2
          ? 'bearish (heavy put activity)'
          : putVol / callVol < 0.7
            ? 'bullish (heavy call activity)'
            : 'neutral'
        : null,
  };
}

async function getShortInterest(symbol) {
  const sym = symbol.toUpperCase();
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=defaultKeyStatistics`
  );
  const ks = data?.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
  const shortPct = rawVal(ks.shortPercentOfFloat);
  return {
    symbol: sym,
    sharesShort: fmtBig(rawVal(ks.sharesShort)),
    sharesShortPriorMonth: fmtBig(rawVal(ks.sharesShortPriorMonth)),
    shortPercentOfFloat: shortPct != null ? +(shortPct * 100).toFixed(2) : null,
    daysToCover: rawVal(ks.shortRatio),
    floatShares: fmtBig(rawVal(ks.floatShares)),
    sharesOutstanding: fmtBig(rawVal(ks.sharesOutstanding)),
    interpretation:
      shortPct > 0.2
        ? 'high short interest — squeeze potential'
        : shortPct > 0.1
          ? 'elevated short interest'
          : shortPct != null
            ? 'normal short interest'
            : 'data not available',
  };
}

async function compareStocks(symbols) {
  const list = symbols.slice(0, 6);
  const results = await Promise.all(
    list.map(async (sym) => {
      try {
        const [m, f] = await Promise.all([getMarketData(sym), getFundamentals(sym)]);
        return {
          symbol: sym.toUpperCase(),
          price: m.price,
          changePercent: m.change,
          rsi: m.technicals.rsi,
          marketCap: f.valuation.marketCap,
          trailingPE: f.valuation.trailingPE,
          forwardPE: f.valuation.forwardPE,
          revenueGrowth: f.financials.revenueGrowth,
          grossMargins: f.financials.grossMargins,
          operatingMargins: f.financials.operatingMargins,
          analystTarget: f.analyst.targetMean,
          upsideToTarget:
            f.analyst.targetMean && m.price
              ? +(((f.analyst.targetMean - m.price) / m.price) * 100).toFixed(1)
              : null,
        };
      } catch (e) {
        return { symbol: sym.toUpperCase(), error: e.message };
      }
    })
  );
  return results;
}

async function getSectorPerformance() {
  const sectors = [
    ['XLK', 'Technology'],
    ['XLF', 'Financials'],
    ['XLE', 'Energy'],
    ['XLV', 'Healthcare'],
    ['XLI', 'Industrials'],
    ['XLY', 'Consumer Discretionary'],
    ['XLP', 'Consumer Staples'],
    ['XLB', 'Materials'],
    ['XLU', 'Utilities'],
    ['XLRE', 'Real Estate'],
    ['XLC', 'Communication Services'],
  ];
  const results = await Promise.all(
    sectors.map(async ([sym, name]) => {
      try {
        const d = await fetchJSON(
          `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1mo`
        );
        const r = d?.chart?.result?.[0];
        const m = r?.meta;
        const closes = (r?.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
        if (!m || !closes.length) return null;
        const last = closes[closes.length - 1];
        const dayChange = +(((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100).toFixed(2);
        const wkChange = closes.length >= 6
          ? +(((last - closes[closes.length - 6]) / closes[closes.length - 6]) * 100).toFixed(2)
          : null;
        const moChange = +(((last - closes[0]) / closes[0]) * 100).toFixed(2);
        return {
          sector: name,
          etf: sym,
          price: m.regularMarketPrice,
          dayChangePercent: dayChange,
          weekChangePercent: wkChange,
          monthChangePercent: moChange,
        };
      } catch (e) {
        return null;
      }
    })
  );
  return results.filter(Boolean).sort((a, b) => b.dayChangePercent - a.dayChangePercent);
}

async function getEarningsHistory(symbol) {
  const sym = symbol.toUpperCase();
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=earningsHistory,earningsTrend`
  );
  const r = data?.quoteSummary?.result?.[0] || {};
  const history = (r.earningsHistory?.history || []).slice(0, 8).map((q) => ({
    quarter: q.quarter?.fmt,
    period: q.period,
    epsActual: rawVal(q.epsActual),
    epsEstimate: rawVal(q.epsEstimate),
    surprisePercent: rawVal(q.surprisePercent) != null ? +(rawVal(q.surprisePercent) * 100).toFixed(2) : null,
    beat: rawVal(q.epsActual) > rawVal(q.epsEstimate),
  }));
  const trend = (r.earningsTrend?.trend || []).slice(0, 4).map((t) => ({
    period: t.period,
    growthPercent: rawVal(t.growth) != null ? +(rawVal(t.growth) * 100).toFixed(2) : null,
    epsEstimateAvg: rawVal(t.earningsEstimate?.avg),
    epsEstimateLow: rawVal(t.earningsEstimate?.low),
    epsEstimateHigh: rawVal(t.earningsEstimate?.high),
    revenueEstimate: fmtBig(rawVal(t.revenueEstimate?.avg)),
    numberOfAnalysts: rawVal(t.earningsEstimate?.numberOfAnalysts),
  }));
  const beats = history.filter((h) => h.beat).length;
  return {
    symbol: sym,
    history,
    futureEstimates: trend,
    beatRate: history.length ? `${beats}/${history.length} (${Math.round((beats / history.length) * 100)}%)` : null,
  };
}

async function getVolumeProfile(symbol) {
  const sym = symbol.toUpperCase();
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`
  );
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error(`No data for ${sym}`);
  const q = r.indicators?.quote?.[0] || {};
  const closes = q.close || [];
  const volumes = q.volume || [];
  const validPairs = [];
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] != null && volumes[i] != null) validPairs.push([closes[i], volumes[i]]);
  }
  if (!validPairs.length) throw new Error('No valid data');
  const prices = validPairs.map(([p]) => p);
  const min = Math.min(...prices), max = Math.max(...prices);
  const numBuckets = 15;
  const bucketSize = (max - min) / numBuckets;
  const buckets = Array(numBuckets).fill(0).map((_, i) => ({
    priceLow: +(min + i * bucketSize).toFixed(2),
    priceHigh: +(min + (i + 1) * bucketSize).toFixed(2),
    volume: 0,
  }));
  for (const [price, vol] of validPairs) {
    const idx = Math.min(Math.floor((price - min) / bucketSize), numBuckets - 1);
    buckets[idx].volume += vol;
  }
  const totalVol = buckets.reduce((s, b) => s + b.volume, 0);
  const poc = buckets.reduce((m, b) => (b.volume > m.volume ? b : m), buckets[0]);
  return {
    symbol: sym,
    currentPrice: closes[closes.length - 1],
    priceRange: { low: +min.toFixed(2), high: +max.toFixed(2) },
    pointOfControl: {
      priceRange: `${poc.priceLow}–${poc.priceHigh}`,
      midPrice: +((poc.priceLow + poc.priceHigh) / 2).toFixed(2),
      volume: fmtBig(poc.volume),
      pctOfTotal: +((poc.volume / totalVol) * 100).toFixed(1),
    },
    profile: buckets.map((b) => ({
      priceRange: `${b.priceLow}–${b.priceHigh}`,
      volume: fmtBig(b.volume),
      pctOfTotal: +((b.volume / totalVol) * 100).toFixed(1),
    })),
  };
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
  {
    name: 'get_advanced_technicals',
    description: 'Advanced technical indicators for a stock: Bollinger Bands, Stochastic %K, ATR (volatility), Williams %R, and Ichimoku Cloud. Best for detailed chart analysis.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_multi_timeframe',
    description: 'Multi-timeframe analysis: shows RSI, EMA21, trend direction, and price change for 5-minute, 1-hour, daily, and weekly timeframes. Useful for confirming signal alignment across timeframes.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_options_data',
    description: 'Options market data: implied volatility, put/call volume ratio, put/call open interest ratio, ATM strike, and upcoming expiration dates. Useful for gauging options-market sentiment.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_short_interest',
    description: 'Short interest data: shares short, short % of float, days-to-cover (short ratio), float size. High short interest (>20%) may indicate squeeze potential.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'compare_stocks',
    description: 'Side-by-side comparison of up to 6 stocks: price, daily change, RSI, market cap, P/E ratios, revenue growth, margins, analyst target, and upside. Great for screening or sector comparisons.',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of stock tickers to compare (2–6 tickers, e.g. ["NVDA","AMD","INTC"])',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_sector_performance',
    description: 'Performance of all 11 S&P 500 sectors (via SPDR ETFs): day, week, and month returns sorted by daily performance. Useful for sector rotation analysis.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_earnings_history',
    description: 'Historical earnings results (EPS actual vs estimate, surprise %, beat/miss) for the last 8 quarters, plus analyst forward estimates. Includes beat rate summary.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_volume_profile',
    description: 'Volume profile (price histogram) over 3 months: identifies the Point of Control (price level with highest traded volume) and shows volume distribution across price buckets.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker' } },
      required: ['symbol'],
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
      case 'get_advanced_technicals':
        result = await getAdvancedTechnicals(args.symbol);
        break;
      case 'get_multi_timeframe':
        result = await getMultiTimeframe(args.symbol);
        break;
      case 'get_options_data':
        result = await getOptionsData(args.symbol);
        break;
      case 'get_short_interest':
        result = await getShortInterest(args.symbol);
        break;
      case 'compare_stocks':
        if (!Array.isArray(args.symbols) || args.symbols.length < 2) {
          throw new Error('symbols must be an array of 2–6 tickers');
        }
        result = await compareStocks(args.symbols);
        break;
      case 'get_sector_performance':
        result = await getSectorPerformance();
        break;
      case 'get_earnings_history':
        result = await getEarningsHistory(args.symbol);
        break;
      case 'get_volume_profile':
        result = await getVolumeProfile(args.symbol);
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
