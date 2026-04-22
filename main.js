const { app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut, safeStorage } = require('electron');
const fetch = require('node-fetch');
const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

let win = null, tvClient = null, autoTimer = null, smartTimer = null;
let streamData = { history: [], current: null }; // Last 60 data points (5 min at 5s intervals)
const SZ = { mini:{w:70,h:100}, normal:{w:520,h:780}, large:{w:720,h:960} };
const DATA_DIR = path.join(app.getPath('userData'), 'stockai');
const KEY_FILE = path.join(DATA_DIR, 'api-keys.json');
function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e){} }
function showMainWindow(){if(!win)return;win.show();win.focus();}

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({ width: SZ.normal.w, height: SZ.normal.h, x: sw-SZ.normal.w-20, y: sh-SZ.normal.h-60, frame:false, transparent:true, alwaysOnTop:true, resizable:true, hasShadow:true, webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,webSecurity:true} });
  win.setAlwaysOnTop(true,'floating',1);
  win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  win.loadFile('ui.html');
}
const gotLock = app.requestSingleInstanceLock();
if(!gotLock)app.quit();
else app.on('second-instance',()=>showMainWindow());
app.on('open-url',(e)=>{e.preventDefault();showMainWindow();});
app.whenReady().then(()=>{ ensureDir(); app.setAsDefaultProtocolClient('stockai'); createWindow(); globalShortcut.register('CommandOrControl+Shift+Space',()=>{if(!win)return;win.isVisible()?win.hide():showMainWindow();}); setTimeout(connectTV,3000); });
app.on('will-quit',()=>{globalShortcut.unregisterAll();if(autoTimer)clearInterval(autoTimer);if(smartTimer)clearInterval(smartTimer);if(tvClient)tvClient.close().catch(()=>{});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

async function captureScreen(q=78){try{const s=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1920,height:1080}});return s.length?s[0].thumbnail.toJPEG(q).toString('base64'):null;}catch(e){return null;}}
async function connectTV(){try{const tabs=await fetch('http://localhost:9222/json').then(r=>r.json()).catch(()=>[]);const pg=tabs.find(t=>t.url?.includes('tradingview.com')&&t.type==='page');if(!pg){send('tv-status',{ok:false});return false;}if(tvClient)try{await tvClient.close();}catch(e){}tvClient=await CDP({target:pg.webSocketDebuggerUrl});await tvClient.Runtime.enable();send('tv-status',{ok:true});return true;}catch(e){send('tv-status',{ok:false});return false;}}
async function tvRun(s){if(!tvClient)throw new Error('TradingView未接続');const r=await tvClient.Runtime.evaluate({expression:s,returnByValue:true,awaitPromise:true,timeout:8000});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
function send(ch,data){if(win&&!win.isDestroyed())win.webContents.send(ch,data);}
function safe(v,d=2){return v!=null&&!isNaN(v)?Number(v).toFixed(d):'—';}

// Window IPC
ipcMain.handle('win-hide',()=>{if(win)win.hide();});
ipcMain.handle('win-quit',()=>app.quit());
ipcMain.handle('win-size',(_,m)=>{if(!win)return;const s=SZ[m]||SZ.normal;win.setResizable(m!=='mini');win.setSize(s.w,s.h,true);});
ipcMain.handle('capture',async(_,o)=>{try{return{ok:true,img:await captureScreen(o?.quality||75)};}catch(e){return{error:e.message};}});

// Encrypted API key storage. Keys are kept per user's local machine.
function readKeyStore(){try{return JSON.parse(fs.readFileSync(KEY_FILE,'utf8'));}catch(e){return{};}}
function writeKeyStore(data){ensureDir();fs.writeFileSync(KEY_FILE,JSON.stringify(data,null,2));}
function encSecret(v){if(!v)return'';try{return safeStorage.encryptString(v).toString('base64');}catch(e){return Buffer.from(v,'utf8').toString('base64');}}
function decSecret(v){if(!v)return'';try{return safeStorage.decryptString(Buffer.from(v,'base64'));}catch(e){try{return Buffer.from(v,'base64').toString('utf8');}catch(_){return'';}}}
ipcMain.handle('save-api-key',(_,{provider,key,model})=>{try{const s=readKeyStore();s[provider]={key:encSecret(key||''),model:model||s[provider]?.model||''};writeKeyStore(s);return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('load-api-keys',()=>{try{const s=readKeyStore();const out={};['gemini','claude','openai'].forEach(p=>{out[p]={key:decSecret(s[p]?.key),model:s[p]?.model||''};});return{ok:true,keys:out};}catch(e){return{ok:true,keys:{}};}});
ipcMain.handle('export-report',(_,{title,content})=>{try{ensureDir();const safeName=String(title||'stockai-report').replace(/[^a-z0-9._-]+/gi,'_').slice(0,80)||'stockai-report';const file=path.join(app.getPath('downloads'),`${safeName}-${new Date().toISOString().replace(/[:.]/g,'-')}.md`);fs.writeFileSync(file,String(content||''));return{ok:true,file};}catch(e){return{error:e.message};}});

// ═══ Market Data with retry + fallback + specific errors ═══
const UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'};
async function fetchR(url,opts,retries=2){
  for(let i=0;i<=retries;i++){
    try{const r=await fetch(url,{...opts,timeout:8000});if(r.ok)return await r.json();if(r.status===429){if(i<retries){await new Promise(r=>setTimeout(r,1000*(i+1)));continue;}throw new Error('レート制限(429)。しばらく待ってから再試行してください');}if(r.status===404)throw new Error('銘柄が見つかりません: '+url.match(/symbol=(\w+)|\/chart\/(\w+)/)?.[1]||'');throw new Error('サーバーエラー('+r.status+')');}
    catch(e){if(e.message.includes('429')||e.message.includes('見つかりません'))throw e;if(i===retries)throw new Error('接続失敗。ネットワークを確認してください');await new Promise(r=>setTimeout(r,500));}
  }
  return null;
}

ipcMain.handle('market-data',async(_,{symbol})=>{
  const data={};
  try{const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`,{headers:UA});const meta=yf?.chart?.result?.[0]?.meta;const q=yf?.chart?.result?.[0]?.indicators?.quote?.[0];const ts=yf?.chart?.result?.[0]?.timestamp;if(meta){data.price=meta.regularMarketPrice;data.prevClose=meta.chartPreviousClose;data.change=(meta.regularMarketPrice&&meta.chartPreviousClose)?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null;data.week52High=meta.fiftyTwoWeekHigh;data.week52Low=meta.fiftyTwoWeekLow;data.exchange=meta.exchangeName;}if(q&&ts)data.ohlcv=ts.map((t,i)=>({d:new Date(t*1000).toISOString().slice(0,10),o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]})).filter(d=>d.c!=null).slice(-60);}catch(e){}
  if(!data.price){try{const q=await fetchR(`https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbol}`,{headers:UA});const r=q?.quoteResponse?.result?.[0];if(r){data.price=r.regularMarketPrice;data.prevClose=r.regularMarketPreviousClose;data.change=r.regularMarketChangePercent?.toFixed(2);data.week52High=r.fiftyTwoWeekHigh;data.week52Low=r.fiftyTwoWeekLow;data.trailingPE=r.trailingPE;data.marketCap=r.marketCap;}}catch(e){}}
  if(data.ohlcv?.length>20)data.tech=calcTech(data.ohlcv);
  try{const st=await fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,summaryDetail,financialData`,{headers:UA});const ks=st?.quoteSummary?.result?.[0]?.defaultKeyStatistics;const sd=st?.quoteSummary?.result?.[0]?.summaryDetail;const fd=st?.quoteSummary?.result?.[0]?.financialData;if(ks){data.beta=ks.beta?.raw;data.shortPercent=ks.shortPercentOfFloat?.raw;}if(sd&&!data.trailingPE){data.trailingPE=sd.trailingPE?.raw;data.forwardPE=sd.forwardPE?.raw;data.marketCap=data.marketCap||sd.marketCap?.raw;}if(fd){data.analystTarget=fd.targetMeanPrice?.raw;data.analystHigh=fd.targetHighPrice?.raw;data.analystLow=fd.targetLowPrice?.raw;data.analystCount=fd.numberOfAnalystOpinions?.raw;data.revenueGrowth=fd.revenueGrowth?.raw;data.grossMargins=fd.grossMargins?.raw;}}catch(e){}
  try{const fg=await fetchR('https://production.dataviz.cnn.io/index/fearandgreed/graphdata',{headers:{...UA,'Referer':'https://www.cnn.com/'}});data.fearGreed={score:Math.round(fg?.fear_and_greed?.score||0),rating:fg?.fear_and_greed?.rating||''};}catch(e){}
  try{const vf=await fetchR('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d',{headers:UA});data.vix=vf?.chart?.result?.[0]?.meta?.regularMarketPrice;}catch(e){}
  try{const sp=await fetchR('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d',{headers:UA});const m=sp?.chart?.result?.[0]?.meta;if(m)data.sp500Change=(m.regularMarketPrice&&m.chartPreviousClose)?((m.regularMarketPrice-m.chartPreviousClose)/m.chartPreviousClose*100).toFixed(2):null;}catch(e){}
  if(!data.price)return{error:'データ取得失敗: '+symbol+' — ティッカーを確認してください'};
  return{ok:true,data};
});

function calcTech(ohlcv){const closes=ohlcv.map(d=>d.c),n=closes.length,last=closes[n-1];if(n<5)return null;const sma=p=>{const s=closes.slice(-Math.min(p,n));return s.reduce((a,b)=>a+b,0)/s.length;};const ema=p=>{const k=2/(p+1);let e=closes[0];for(let i=1;i<n;i++)e=closes[i]*k+e*(1-k);return e;};const sma20=sma(20),sma50=sma(50),sma200=sma(200);const ema12=ema(12),ema26=ema(26),macd=ema12-ema26;let g=0,l=0;for(let i=Math.max(1,n-14);i<n;i++){const d=closes[i]-closes[i-1];if(d>0)g+=d;else l-=d;}const rsi=l===0?100:100-100/(1+(g/l));const std=Math.sqrt(closes.slice(-Math.min(20,n)).reduce((a,c)=>a+Math.pow(c-sma20,2),0)/Math.min(20,n));const bbU=sma20+2*std,bbL=sma20-2*std;const rec20=ohlcv.slice(-20);const resist=Math.max(...rec20.map(d=>d.h)),supp=Math.min(...rec20.map(d=>d.l));const vols=ohlcv.slice(-20).map(d=>d.v).filter(v=>v>0);const avgVol=vols.length?vols.reduce((a,b)=>a+b,0)/vols.length:0;const volRatio=ohlcv[n-1]?.v&&avgVol?(ohlcv[n-1].v/avgVol).toFixed(2):'—';let atrSum=0;for(let i=Math.max(1,n-14);i<n;i++){const p=ohlcv[i-1],c=ohlcv[i];atrSum+=Math.max(c.h-c.l,Math.abs(c.h-p.c),Math.abs(c.l-p.c));}const atr=(atrSum/Math.min(14,n-1)).toFixed(2);const trend=last>sma20&&sma20>sma50?'上昇📈':last<sma20&&sma20<sma50?'下降📉':'レンジ↔';const rsiSig=rsi<30?'売られ過ぎ🟢':rsi>70?'買われ過ぎ🔴':'中立';const macdSig=macd>0?'強気':'弱気';const bbPct=bbU!==bbL?((last-bbL)/(bbU-bbL)*100).toFixed(0):'50';return{sma20:sma20.toFixed(2),sma50:sma50.toFixed(2),sma200:sma200.toFixed(2),macd:macd.toFixed(3),macdSig,rsi:rsi.toFixed(1),rsiSig,bbUpper:bbU.toFixed(2),bbMid:sma20.toFixed(2),bbLower:bbL.toFixed(2),bbPct,atr,trend,support:supp.toFixed(2),resistance:resist.toFixed(2),volRatio};}

// ═══ AI ═══
async function callAI(type,key,model,messages,search=false){
  if(type==='gemini'){let sys='';const msgs=[...messages];if(msgs[0]?.role==='system'){sys=msgs.shift().content;}const contents=msgs.map(m=>{const parts=[];if(Array.isArray(m.content))m.content.forEach(c=>{if(c.type==='text')parts.push({text:c.text});else if(c.type==='image')parts.push({inline_data:{mime_type:c.source.media_type,data:c.source.data}});});else parts.push({text:String(m.content||'')});return{role:m.role==='assistant'?'model':'user',parts};});const body={contents,generationConfig:{maxOutputTokens:4000}};if(sys)body.systemInstruction={parts:[{text:sys}]};if(search)body.tools=[{google_search:{}}];body.safetySettings=[{category:'HARM_CATEGORY_HARASSMENT',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_HATE_SPEECH',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_DANGEROUS_CONTENT',threshold:'BLOCK_NONE'}];const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok){const e=await r.json().catch(()=>({}));const msg=e.error?.message||'';if(r.status===400&&msg.includes('API_KEY'))throw new Error('Gemini APIキーが無効です。キーを確認してください');if(r.status===429)throw new Error('Gemini レート制限。しばらく待ってください');throw new Error('Gemini: '+msg||r.status);}const d=await r.json();if(d.promptFeedback?.blockReason)throw new Error('Gemini: コンテンツがブロックされました');return d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';}
  if(type==='claude'){let sys='';const msgs=[...messages];if(msgs[0]?.role==='system'){sys=msgs.shift().content;}const body={model:model||'claude-sonnet-4-20250514',max_tokens:4000,messages:msgs};if(sys)body.system=sys;if(search)body.tools=[{type:'web_search_20250305',name:'web_search'}];let cur=[...msgs];for(let i=0;i<8;i++){const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({...body,messages:cur})});if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401)throw new Error('Claude APIキーが無効です');if(r.status===429)throw new Error('Claude レート制限');throw new Error('Claude: '+(e.error?.message||r.status));}const d=await r.json();if(d.stop_reason==='tool_use'){cur.push({role:'assistant',content:d.content});cur.push({role:'user',content:d.content.filter(b=>b.type==='tool_use').map(b=>({type:'tool_result',tool_use_id:b.id,content:[{type:'text',text:'done'}]}))});}else return d.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');}throw new Error('Claude: 最大ループ回数超過');}
  if(type==='openai'){const msgs=messages.map(m=>({role:m.role,content:Array.isArray(m.content)?m.content.map(c=>c.type==='image'?{type:'image_url',image_url:{url:`data:${c.source.media_type};base64,${c.source.data}`}}:{type:'text',text:c.text||''}):m.content}));const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:model||'gpt-4o',messages:msgs,max_tokens:3000})});if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401)throw new Error('OpenAI APIキーが無効です');if(r.status===429)throw new Error('OpenAI レート制限');throw new Error('OpenAI: '+(e.error?.message||r.status));}return(await r.json()).choices[0].message.content;}
  throw new Error('不明なAIタイプ: '+type);
}

// ═══ Build context helper ═══
function buildCtx(symbol,marketData,tvState,portfolio,userInstruction){
  const md=marketData||{},tech=md.tech||{};
  const dataCtx=md.price?`[${symbol}] $${safe(md.price)} ${md.change||'—'}% RSI:${tech.rsi||'—'}(${tech.rsiSig||''}) MACD:${tech.macd||'—'}(${tech.macdSig||''}) Trend:${tech.trend||'—'} Supp:$${tech.support||'—'} Res:$${tech.resistance||'—'} BB%:${tech.bbPct||'—'} ATR:${tech.atr||'—'} PE:${safe(md.trailingPE,1)} Beta:${safe(md.beta)} F&G:${md.fearGreed?.score||'—'} VIX:${safe(md.vix,1)} S&P:${md.sp500Change||'—'}% Target:$${safe(md.analystTarget)}(${md.analystCount||'—'}人) Vol:${tech.volRatio||'—'}x`:'';
  const tvCtx=tvState?.sym?` [TV]${tvState.sym} ${tvState.price||''} TF:${tvState.tf||''}`:'';
  const portCtx=portfolio?.length?`\n[保有]${portfolio.map(p=>p.symbol+' '+p.shares+'株@$'+p.avgCost).join(', ')}`:'';
  const userCmd=userInstruction?`\n[指示]${userInstruction}`:'';
  return dataCtx+tvCtx+portCtx+userCmd;
}

// ═══ Lite Mode: A → D → E (3 steps, ~15 sec) ═══
ipcMain.handle('run-lite', async(_,{keys,symbol,marketData,tvState,screenshot,lang,userInstruction,portfolio})=>{
  const li=lang==='ja'?'日本語で回答。':lang==='zh'?'中文回答。':'English.';
  const activeKey=keys.gemini||keys.claude||keys.openai;
  if(!activeKey)return{error:'APIキーが設定されていません。⚙設定からAPIキーを入力してください'};
  const type=keys.gemini?'gemini':keys.claude?'claude':'openai';
  const mdl=keys.gemini?(keys.geminiModel||'gemini-2.5-flash'):keys.claude?'claude-sonnet-4-20250514':'gpt-4o';
  const ctx=buildCtx(symbol,marketData,tvState,portfolio,userInstruction);
  const results={},rawTexts={};
  const progress=(agent,status)=>send('agent-progress',{agent,status});
  try{
    // A: Quant
    progress('A','running');
    const aC=[];if(screenshot)aC.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});
    aC.push({type:'text',text:`${symbol}分析。${ctx}`});
    rawTexts.A=await callAI(type,activeKey,mdl,[{role:'system',content:`クオンツ・アナリスト。${li}テクニカル+ファンダメンタル分析。JSON:{"score":N,"signal":"BUY/SELL/HOLD","confidence":N,"analysis":"...詳細","risks":["..."],"catalysts":["..."]}`},{role:'user',content:aC}],true);
    results.A=parseJSON(rawTexts.A);progress('A','done');

    // D: Risk (parallel-safe, depends only on A)
    progress('D','running');
    rawTexts.D=await callAI(type,activeKey,mdl,[{role:'system',content:`リスクMgr。${li}GO/NO-GO。JSON:{"decision":"GO/NO-GO/CONDITIONAL","maxLoss":"$X","killSwitch":["..."],"warnings":["..."],"riskScore":N,"eventRisks":["..."]}`},{role:'user',content:`A:${JSON.stringify(results.A)}\n${ctx}`}],false);
    results.D=parseJSON(rawTexts.D);progress('D','done');

    // E: CEO with entry conditions
    progress('E','running');
    const eC=[];if(screenshot)eC.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});
    eC.push({type:'text',text:`A:${JSON.stringify(results.A)}\nD:${JSON.stringify(results.D)}\n${ctx}`});
    rawTexts.E=await callAI(type,activeKey,mdl,[{role:'system',content:`CEO秘書・最終判断AI。${li}クオンツとリスク分析を統合して最終レポート。\n\n【重要】以下を必ず含めること：\n1. エントリー条件：「現在は〇〇のため待機。$X以下になったらBUY」「即座にBUY可能。理由：〇〇」のように具体的な条件\n2. 回避すべきイベント：「決算発表(X月X日)前はポジションを取らない」等\n\nJSON:{"finalVerdict":"BUY/SELL/HOLD/WAIT","confidence":N,"score":N,"summary":"...","keyReasons":["..."],"actionPlan":"...","entryCondition":"具体的なエントリー条件","avoidEvents":["..."],"riskWarning":"...","timeHorizon":"SHORT|MEDIUM|LONG|NEUTRAL","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","whyMattersToUser":"持ち株・ウォッチとの関連性（1-2文）","prediction":{"shortTerm":"1-2週間:...","midTerm":"1-3ヶ月:...","longTerm":"6-12ヶ月:..."}}`},{role:'user',content:eC}],false);
    results.E=parseJSON(rawTexts.E);progress('E','done');
    return{ok:true,results,rawTexts,mode:'lite'};
  }catch(e){return{error:e.message,partialResults:results,rawTexts};}
});

// ═══ Full 6-Agent ═══
ipcMain.handle('run-agents',async(_,{keys,symbol,marketData,tvState,screenshot,lang,userInstruction,portfolio})=>{
  const li=lang==='ja'?'日本語で回答。':lang==='zh'?'中文回答。':'English.';
  const activeKey=keys.gemini||keys.claude||keys.openai;
  if(!activeKey)return{error:'APIキーが設定されていません。⚙設定からAPIキーを入力してください'};
  const type=keys.gemini?'gemini':keys.claude?'claude':'openai';
  const mdl=keys.gemini?(keys.geminiModel||'gemini-2.5-flash'):keys.claude?'claude-sonnet-4-20250514':'gpt-4o';
  const ctx=buildCtx(symbol,marketData,tvState,portfolio,userInstruction);
  const results={},rawTexts={};
  const progress=(agent,status)=>send('agent-progress',{agent,status});
  try{
    progress('A','running');
    const aC=[];if(screenshot)aC.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});aC.push({type:'text',text:`${symbol}分析。${ctx}`});
    rawTexts.A=await callAI(type,activeKey,mdl,[{role:'system',content:`クオンツ・アナリスト。${li}詳細テクニカル+ファンダメンタル。JSON:{"score":N,"signal":"BUY/SELL/HOLD","confidence":N,"analysis":"...詳細","risks":["..."],"catalysts":["..."]}`},{role:'user',content:aC}],true);
    results.A=parseJSON(rawTexts.A);progress('A','done');

    progress('B','running');progress('D','running');
    const[bRaw,dRaw]=await Promise.all([
      callAI(type,activeKey,mdl,[{role:'system',content:`ポートフォリオMgr。${li}ケリー基準。JSON:{"positionSize":"X%","entry":"X","target":"X","stopLoss":"X","riskReward":"X:X","strategy":"...詳細","kellyFraction":"X%"}`},{role:'user',content:`A:${JSON.stringify(results.A)}\n${ctx}`}],false),
      callAI(type,activeKey,mdl,[{role:'system',content:`リスクMgr。${li}GO/NO-GO。JSON:{"decision":"GO/NO-GO/CONDITIONAL","maxLoss":"$X","killSwitch":["..."],"warnings":["..."],"riskScore":N,"eventRisks":["..."]}`},{role:'user',content:`A:${JSON.stringify(results.A)}\n${ctx}`}],false)
    ]);
    rawTexts.B=bRaw;results.B=parseJSON(bRaw);progress('B','done');
    rawTexts.D=dRaw;results.D=parseJSON(dRaw);progress('D','done');

    progress('C','running');
    rawTexts.C=await callAI(type,activeKey,mdl,[{role:'system',content:`執行トレーダー。${li}VWAP/TWAP。JSON:{"executionPlan":"...","orderType":"...","timing":"...","splits":["..."],"urgency":"HIGH/MEDIUM/LOW"}`},{role:'user',content:`B:${JSON.stringify(results.B)}\nA:${JSON.stringify(results.A)}`}],false);
    results.C=parseJSON(rawTexts.C);progress('C','done');

    progress('E','running');
    const eC=[];if(screenshot)eC.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});
    eC.push({type:'text',text:`統合:\nA:${JSON.stringify(results.A)}\nB:${JSON.stringify(results.B)}\nC:${JSON.stringify(results.C)}\nD:${JSON.stringify(results.D)}\n${ctx}`});
    rawTexts.E=await callAI(type,activeKey,mdl,[{role:'system',content:`CEO秘書・最終判断AI。${li}\n【重要】以下を必ず含めること：\n1. エントリー条件：「$X以下でBUY」「即BUY可能」等の具体条件\n2. 回避イベント：「決算前は回避」等\n\nJSON:{"finalVerdict":"BUY/SELL/HOLD/WAIT","confidence":N,"score":N,"summary":"...詳細","keyReasons":["..."],"actionPlan":"...","entryCondition":"具体的条件","avoidEvents":["..."],"riskWarning":"...","timeHorizon":"SHORT|MEDIUM|LONG|NEUTRAL","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","whyMattersToUser":"持ち株・ウォッチとの関連性（1-2文）","prediction":{"shortTerm":"1-2週間:...","midTerm":"1-3ヶ月:...","longTerm":"6-12ヶ月:..."}}`},{role:'user',content:eC}],false);
    results.E=parseJSON(rawTexts.E);progress('E','done');

    progress('F','running');
    rawTexts.F=await callAI(type,activeKey,mdl,[{role:'system',content:`品質評価AI。${li}JSON:{"scores":{"A":N,"B":N,"C":N,"D":N,"E":N},"overallGrade":"A/B/C/D/F","feedback":"...","improvements":["..."],"blindSpots":["..."]}`},{role:'user',content:`全:\nA:${JSON.stringify(results.A)}\nB:${JSON.stringify(results.B)}\nC:${JSON.stringify(results.C)}\nD:${JSON.stringify(results.D)}\nE:${JSON.stringify(results.E)}`}],false);
    results.F=parseJSON(rawTexts.F);progress('F','done');
    return{ok:true,results,rawTexts,mode:'full'};
  }catch(e){return{error:e.message,partialResults:results,rawTexts};}
});

function parseJSON(raw){if(!raw)return{parseError:true,raw:''};try{let depth=0,start=-1;for(let i=0;i<raw.length;i++){if(raw[i]==='{'){if(depth===0)start=i;depth++;}else if(raw[i]==='}'){depth--;if(depth===0&&start>=0)return JSON.parse(raw.substring(start,i+1));}}return{parseError:true,raw};}catch(e){return{parseError:true,raw};}}

// ═══ Single AI / Multi-AI / Agent Chat ═══
ipcMain.handle('ai',async(_,{key,model,messages,search})=>{try{if(!key)return{error:'APIキーが設定されていません'};const type=key.startsWith('AIza')?'gemini':key.startsWith('sk-ant')?'claude':'openai';return{ok:true,text:await callAI(type,key,model,messages,search)};}catch(e){return{error:e.message};}});
ipcMain.handle('multi-ai',async(_,{keys,messages})=>{const calls=[];if(keys.gemini)calls.push(callAI('gemini',keys.gemini,keys.geminiModel||'gemini-2.5-flash',messages,true).then(t=>({ai:'Gemini',text:t})).catch(e=>({ai:'Gemini',error:e.message})));if(keys.claude)calls.push(callAI('claude',keys.claude,'claude-sonnet-4-20250514',messages,true).then(t=>({ai:'Claude',text:t})).catch(e=>({ai:'Claude',error:e.message})));if(keys.openai)calls.push(callAI('openai',keys.openai,'gpt-4o',messages,false).then(t=>({ai:'GPT-4o',text:t})).catch(e=>({ai:'GPT-4o',error:e.message})));return{ok:true,results:await Promise.all(calls)};});
ipcMain.handle('agent-chat',async(_,{key,model,message,agentResults,marketData,lang})=>{try{const li=lang==='ja'?'日本語で詳細に。':lang==='zh'?'详细中文。':'Detailed English.';const type=key.startsWith('AIza')?'gemini':key.startsWith('sk-ant')?'claude':'openai';return{ok:true,text:await callAI(type,key,model,[{role:'system',content:`CEO秘書AI。${li}分析結果を踏まえて具体的数値で回答。\n分析:${JSON.stringify(agentResults||{})}`},{role:'user',content:message}],false)};}catch(e){return{error:e.message};}});

// ═══ Auto Monitor ═══
ipcMain.handle('auto-start',async(_,{key,interval,lang,model,rules})=>{if(autoTimer)clearInterval(autoTimer);let lastHash='';const ruleText=rules?.length?`\n条件: ${rules.map(r=>r.condition+'→'+r.action).join('; ')}`:'';autoTimer=setInterval(async()=>{try{const img=await captureScreen(55);if(!img)return;const hash=img.slice(50,250);if(hash===lastHash)return;lastHash=hash;const li=lang==='ja'?'日本語。':lang==='zh'?'中文。':'English.';const text=await callAI('gemini',key,model||'gemini-2.5-flash',[{role:'system',content:`Stock monitor. ${li} ONLY if important. Otherwise "OK".${ruleText}`},{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}},{type:'text',text:'Monitor.'}]}],false);if(text&&!text.trim().startsWith('OK'))send('auto-alert',{text,img,time:new Date().toLocaleTimeString()});}catch(e){}},(interval||15)*1000);return{ok:true};});
ipcMain.handle('auto-stop',()=>{if(autoTimer){clearInterval(autoTimer);autoTimer=null;}return{ok:true};});

// ═══ Data persistence ═══
ipcMain.handle('save-history',(_,{entry})=>{try{const file=path.join(DATA_DIR,'history.json');let h=[];try{h=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){}h.unshift({...entry,timestamp:Date.now()});if(h.length>50)h=h.slice(0,50);fs.writeFileSync(file,JSON.stringify(h,null,2));return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('load-history',()=>{try{return{ok:true,history:JSON.parse(fs.readFileSync(path.join(DATA_DIR,'history.json'),'utf8'))};}catch(e){return{ok:true,history:[]};}});
ipcMain.handle('save-portfolio',(_,{portfolio})=>{try{fs.writeFileSync(path.join(DATA_DIR,'portfolio.json'),JSON.stringify(portfolio,null,2));return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('load-portfolio',()=>{try{return{ok:true,portfolio:JSON.parse(fs.readFileSync(path.join(DATA_DIR,'portfolio.json'),'utf8'))};}catch(e){return{ok:true,portfolio:[]};}});
// Watchlist
ipcMain.handle('save-watchlist',(_,{watchlist})=>{try{fs.writeFileSync(path.join(DATA_DIR,'watchlist.json'),JSON.stringify(watchlist,null,2));return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('load-watchlist',()=>{try{return{ok:true,watchlist:JSON.parse(fs.readFileSync(path.join(DATA_DIR,'watchlist.json'),'utf8'))};}catch(e){return{ok:true,watchlist:[]};}});
// Batch price fetch for watchlist briefing
ipcMain.handle('batch-prices',async(_,{symbols})=>{
  const results=[];
  for(const sym of symbols.slice(0,10)){
    try{const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`,{headers:UA});const meta=yf?.chart?.result?.[0]?.meta;if(meta)results.push({symbol:sym,price:meta.regularMarketPrice,change:meta.regularMarketPrice&&meta.chartPreviousClose?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null});}
    catch(e){results.push({symbol:sym,error:true});}
  }
  return{ok:true,results};
});

// ═══ Earnings Dates ═══
ipcMain.handle('earnings-data',async(_,{symbols})=>{
  const results=[];
  for(const sym of symbols.slice(0,15)){
    try{
      const d=await fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents`,{headers:UA});
      const cal=d?.quoteSummary?.result?.[0]?.calendarEvents;
      const raw=cal?.earnings?.earningsDate?.[0]?.raw;
      results.push({symbol:sym,earningsDate:raw?new Date(raw*1000).toISOString():null});
    }catch(e){results.push({symbol:sym,earningsDate:null});}
  }
  return{ok:true,results};
});

// ═══ AI Portfolio Dashboard Briefing ═══
ipcMain.handle('portfolio-dashboard',async(_,{key,model,lang,portfolio,watchlist,earningsData})=>{
  try{
    if(!key)return{error:'APIキー未設定'};
    const type=key.startsWith('AIza')?'gemini':key.startsWith('sk-ant')?'claude':'openai';
    const li=lang==='ja'?'日本語で回答。':lang==='zh'?'中文回答。':'Reply in English.';
    // Fetch current prices for all portfolio + watchlist symbols
    const portSyms=portfolio.map(p=>p.symbol).filter(Boolean);
    const wlSyms=watchlist.map(w=>w.symbol).filter(Boolean);
    const allSyms=[...new Set([...portSyms,...wlSyms])].slice(0,20);
    const priceMap={};
    for(const sym of allSyms){
      try{const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`,{headers:UA});const meta=yf?.chart?.result?.[0]?.meta;if(meta)priceMap[sym]={price:meta.regularMarketPrice,change:meta.regularMarketPrice&&meta.chartPreviousClose?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null};}
      catch(e){}
    }
    const portStr=portfolio.filter(p=>p.symbol&&p.avgCost).map(p=>{const cur=priceMap[p.symbol];const pnl=cur?.price&&p.avgCost?((cur.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100).toFixed(1):null;return`${p.symbol} ${p.shares}株 @$${p.avgCost} 現在$${cur?.price?.toFixed(2)||'?'} (${cur?.change||'?'}% PnL:${pnl||'?'}%)`;}).join('\n');
    const wlStr=watchlist.map(w=>{const cur=priceMap[w.symbol];return`${w.symbol} $${cur?.price?.toFixed(2)||'?'} (${cur?.change||'?'}%)`;}).join(', ');
    const today=new Date().toISOString().slice(0,10);
    const earningsStr=Object.entries(earningsData||{}).filter(([,d])=>d).map(([sym,d])=>{const days=Math.round((new Date(d)-Date.now())/86400000);return`${sym}: ${days===0?'今日':days===1?'明日':days+'日後'}(${d.slice(0,10)})`;}).join('\n');
    const prompt=`今日(${today})のポートフォリオ状況を分析してください。${li}

【持ち株】
${portStr||'なし'}

【ウォッチリスト】
${wlStr||'なし'}

【財報予定】
${earningsStr||'なし'}

以下のJSON形式で返してください（JSONのみ、説明不要）:
{
  "riskTemperature": 1-10の整数,
  "riskLabel": "LOW|MEDIUM|HIGH|CRITICAL",
  "dailyVerdict": "今日一言でまとめると（1-2文）",
  "topEvents": [
    {
      "symbol": "ティッカー",
      "event": "何が起きているか/起きそうか（1文）",
      "whyMatters": "あなたの持ち株/ウォッチに関係する理由（1文）",
      "timeHorizon": "SHORT|MEDIUM|LONG|NEUTRAL",
      "urgency": 1-5の整数
    }
  ],
  "earningsTonight": ["今夜財報の銘柄ティッカー配列"],
  "abnormalMovers": [{"symbol":"","change":"+X%","reason":"理由"}],
  "noise": ["今日は無視してよい懸念事項（短く）"]
}

topEventsは最重要3-4件のみ。riskTemperatureは持ち株の損益・ボラティリティ・財報リスクを総合して判断。`;
    const raw=await callAI(type,key,model||'gemini-2.5-flash',[{role:'user',content:prompt}],true);
    let parsed={};try{let depth=0,start=-1;for(let i=0;i<raw.length;i++){if(raw[i]==='{'){if(depth===0)start=i;depth++;}else if(raw[i]==='}'){depth--;if(depth===0&&start>=0){parsed=JSON.parse(raw.substring(start,i+1));break;}}}parsed._prices=priceMap;}catch(e){return{ok:false,error:'JSON parse error: '+e.message};}
    return{ok:true,data:parsed};
  }catch(e){return{ok:false,error:e.message};}
});

ipcMain.handle('watchlist-analysis',async(_,{key,model,lang,watchlist})=>{
  try{
    if(!key)return{error:'API Key 未设置'};
    const symbols=(watchlist||[]).map(w=>String(w.symbol||'').toUpperCase()).filter(Boolean).slice(0,15);
    if(!symbols.length)return{error:'自选股为空'};
    const rows=[];
    for(const sym of symbols){
      try{
        const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`,{headers:UA});
        const result=yf?.chart?.result?.[0],meta=result?.meta,q=result?.indicators?.quote?.[0],ts=result?.timestamp;
        const ohlcv=ts&&q?ts.map((t,i)=>({d:new Date(t*1000).toISOString().slice(0,10),h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]})).filter(d=>d.c!=null).slice(-60):[];
        const tech=ohlcv.length>20?calcTech(ohlcv):{};
        rows.push({symbol:sym,price:meta?.regularMarketPrice,change:meta?.regularMarketPrice&&meta?.chartPreviousClose?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null,rsi:tech?.rsi,trend:tech?.trend,support:tech?.support,resistance:tech?.resistance,volRatio:tech?.volRatio});
      }catch(e){rows.push({symbol:sym,error:true});}
    }
    const type=key.startsWith('AIza')?'gemini':key.startsWith('sk-ant')?'claude':'openai';
    const li=lang==='zh'?'中文回答。':lang==='ja'?'日本語で回答。':'Reply in English.';
    const prompt=`${li}请分析下面自选股，挑出今天最值得关注的3只，并给出简洁理由、风险、行动建议。仅返回JSON:
{"summary":"一句话总览","top":[{"symbol":"","action":"WATCH|BUY_ZONE|AVOID|HOLD","reason":"","risk":"","trigger":""}],"skip":["可以暂时忽略的代码和原因"]}

数据:
${JSON.stringify(rows)}`;
    const raw=await callAI(type,key,model||'gemini-2.5-flash',[{role:'user',content:prompt}],true);
    let parsed={};try{let depth=0,start=-1;for(let i=0;i<raw.length;i++){if(raw[i]==='{'){if(depth===0)start=i;depth++;}else if(raw[i]==='}'){depth--;if(depth===0&&start>=0){parsed=JSON.parse(raw.substring(start,i+1));break;}}}}catch(e){}
    return{ok:true,data:parsed?.top?parsed:{summary:raw,top:[],skip:[]},prices:rows};
  }catch(e){return{error:e.message};}
});

// ═══ TradingView — Chart API Direct Access ═══
// Uses TradingView.activeChart() internal API instead of DOM scraping
// More stable, faster, and can access data not visible on screen

const TV_CHART_API_SCRIPT = `JSON.stringify((function(){try{
  // Try Chart API first (faster, more reliable)
  const w=window;
  let chart=null;
  try{ chart=w.TradingView&&w.TradingView.activeChart?w.TradingView.activeChart():null; }catch(e){}
  if(!chart){
    // Fallback: try accessing through widget
    try{
      const frames=document.querySelectorAll('iframe');
      for(const f of frames){try{chart=f.contentWindow?.TradingView?.activeChart?.();if(chart)break;}catch(e){}}
    }catch(e){}
  }
  
  if(chart){
    // === CHART API MODE ===
    const info=chart.symbolInfo()||{};
    const sym=info.name||info.ticker||info.full_name||document.title.split(' ')[0]||'';
    const price=info.last_price||0;
    
    // Get OHLCV from chart series
    let ohlcv=[];
    try{
      const series=chart.mainSeries?.();
      if(series&&series.data){
        const bars=series.data.bars?.();
        if(bars){ohlcv=bars.slice(-20).map(b=>({t:b.time,o:b.open,h:b.high,l:b.low,c:b.close,v:b.volume}));}
      }
    }catch(e){}
    // Alternative: try exportData
    if(!ohlcv.length){
      try{
        const d=chart.exportData?.({includeTime:true,from:Math.floor(Date.now()/1000)-86400});
        if(d&&d.data)ohlcv=d.data.slice(-20).map(r=>({t:r[0],o:r[1],h:r[2],l:r[3],c:r[4],v:r[5]}));
      }catch(e){}
    }
    
    // Get indicators from studies
    const inds={};
    try{
      const studies=chart.getAllStudies?.();
      if(studies){
        studies.forEach(s=>{
          try{
            const name=(s.name||'').toLowerCase();
            const vals=chart.getStudyValues?.(s.id);
            if(!vals)return;
            if(name.includes('rsi'))inds.rsi=vals[0]||null;
            else if(name.includes('macd')){inds.macd=vals[0]||null;inds.macdSignal=vals[1]||null;inds.macdHist=vals[2]||null;}
            else if(name.includes('volume'))inds.volume=vals[0]||null;
            else if(name.includes('ema'))inds['ema']=vals[0]||null;
            else if(name.includes('sma'))inds['sma']=vals[0]||null;
            else if(name.includes('bb')||name.includes('bollinger')){inds.bbUpper=vals[0]||null;inds.bbMiddle=vals[1]||null;inds.bbLower=vals[2]||null;}
          }catch(e){}
        });
      }
    }catch(e){}
    
    // Get timeframe
    const tf=chart.resolution?.()||'';
    
    return{sym,price,tf,inds,ohlcv,mode:'chartAPI',exchange:info.exchange||'',currency:info.currency_code||'',ts:Date.now()};
  }
  
  // === FALLBACK: DOM MODE (if Chart API unavailable) ===
  const t=document.title,sym=t.split(' ')[0]||'';
  const priceEl=document.querySelector('[class*="priceScaleLastValue"],[class*="lastValueWrapper"]');
  const price=parseFloat((priceEl?.textContent||'0').replace(/[^0-9.-]/g,''));
  const inds={};
  document.querySelectorAll('[class*="sourceName"],[class*="legendSourceTitle"]').forEach(e=>{
    const n=e.textContent.trim().toLowerCase();
    const v=e.closest('[class*="legendItem"],[class*="sourceItem"]')?.querySelector('[class*="value"],[class*="legendValue"]')?.textContent?.trim()||'';
    const num=parseFloat(v.replace(/[^0-9.-]/g,''));
    if(n.includes('rsi'))inds.rsi=num||null;
    else if(n.includes('macd')&&!n.includes('signal'))inds.macd=num||null;
    else if(n.includes('vol'))inds.volume=num||null;
  });
  const tf=document.querySelector('[class*="isActive"][class*="interval"],[class*="selectedInterval"]')?.textContent?.trim()||'';
  return{sym,price,tf,inds,ohlcv:[],mode:'DOM',ts:Date.now()};
}catch(e){return{error:e.message};}})())`;

ipcMain.handle('tv-connect',async()=>({ok:await connectTV()}));
ipcMain.handle('tv-state',async()=>{
  try{
    const raw=await tvRun(TV_CHART_API_SCRIPT);
    const data=JSON.parse(raw);
    // Convert for backward compatibility with UI
    const indsArr=[];
    if(data.inds){Object.entries(data.inds).forEach(([k,v])=>{if(v!=null)indsArr.push({n:k.toUpperCase(),v:String(v)});});}
    return{ok:true,data:{...data,inds:indsArr}};
  }catch(e){return{error:e.message};}
});
ipcMain.handle('tv-symbol',async(_,sym)=>{try{await tvRun(`(function(){const b=document.querySelector('[id="header-toolbar-symbol-search"]');if(b){b.click();setTimeout(()=>{const i=document.querySelector('input[placeholder*="earch"],[class*="search-"] input');if(i){const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,'${sym.replace(/'/g,"\\'")}');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}},400);}})()`) ;return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('tv-set-pine',async(_,code)=>{try{await tvClient.Runtime.evaluate({expression:`window.__pine__=${JSON.stringify(code)}`});const r=await tvRun(`(function(){const m=window.monaco?.editor?.getModels?.();if(m&&m.length){m[0].setValue(window.__pine__);return 'ok';}return 'no editor';})()`);return{ok:true,result:r};}catch(e){return{error:e.message};}});
ipcMain.handle('tv-compile',async()=>{try{const r=await tvRun(`(function(){const b=document.querySelector('[data-name="add-script-to-chart"]')||document.querySelector('button[class*="addToChart"]');if(b){b.click();return 'ok';}return 'not found';})()`);return{ok:true,result:r};}catch(e){return{error:e.message};}});

// ═══ FEATURE 1: CDP Real-time Price Stream via Chart API ═══
// Uses TradingView.activeChart() for direct numerical data access
// 10x faster and more accurate than DOM scraping

ipcMain.handle('smart-monitor-start',async(_,{key,model,lang,triggers,interval})=>{
  if(smartTimer)clearInterval(smartTimer);
  streamData={history:[],current:null};
  let analyzing=false;
  const intv=(interval||5)*1000;
  
  smartTimer=setInterval(async()=>{
    if(!tvClient||analyzing)return;
    try{
      const raw=await tvRun(TV_CHART_API_SCRIPT);
      const data=JSON.parse(raw);
      if(data.error||!data.price)return;
      
      // Store in rolling buffer (60 points = 5 min at 5s)
      streamData.current=data;
      streamData.history.push(data);
      if(streamData.history.length>60)streamData.history.shift();
      
      // Send live data to frontend
      send('stream-tick',data);
      
      // ═══ FEATURE 2: Smart Trigger Engine ═══
      if(streamData.history.length<3)return;
      const prev=streamData.history[streamData.history.length-2];
      const alerts=[];
      
      // Built-in triggers (always active)
      // 1. Price spike: >1% move in 5 seconds
      if(prev.price&&data.price){
        const pctMove=((data.price-prev.price)/prev.price*100);
        if(Math.abs(pctMove)>1)alerts.push({type:'PRICE_SPIKE',msg:`${data.sym} ${pctMove>0?'急騰':'急落'} ${pctMove.toFixed(2)}% ($${prev.price.toFixed(2)}→$${data.price.toFixed(2)})`});
      }
      
      // 2. RSI extremes
      if(data.inds.rsi){
        if(data.inds.rsi<30&&(!prev.inds?.rsi||prev.inds.rsi>=30))alerts.push({type:'RSI_OVERSOLD',msg:`${data.sym} RSI ${data.inds.rsi.toFixed(1)} 売られ過ぎゾーン突入`});
        if(data.inds.rsi>70&&(!prev.inds?.rsi||prev.inds.rsi<=70))alerts.push({type:'RSI_OVERBOUGHT',msg:`${data.sym} RSI ${data.inds.rsi.toFixed(1)} 買われ過ぎゾーン突入`});
      }
      
      // 3. 5-minute price change (if enough history)
      if(streamData.history.length>=12){
        const old=streamData.history[streamData.history.length-12]; // ~60s ago
        if(old.price&&data.price){
          const minMove=((data.price-old.price)/old.price*100);
          if(Math.abs(minMove)>2)alerts.push({type:'MOMENTUM',msg:`${data.sym} ${minMove>0?'上昇':'下降'}モメンタム ${minMove.toFixed(2)}% (1分間)`});
        }
      }
      
      // 4. MACD crossover (Chart API provides signal line)
      if(data.inds.macd!=null&&data.inds.macdSignal!=null&&prev.inds?.macd!=null&&prev.inds?.macdSignal!=null){
        const prevDiff=prev.inds.macd-prev.inds.macdSignal;
        const curDiff=data.inds.macd-data.inds.macdSignal;
        if(prevDiff<0&&curDiff>0)alerts.push({type:'MACD_CROSS_UP',msg:`${data.sym} MACDゴールデンクロス（買いシグナル）`});
        if(prevDiff>0&&curDiff<0)alerts.push({type:'MACD_CROSS_DN',msg:`${data.sym} MACDデッドクロス（売りシグナル）`});
      }
      
      // 5. Bollinger Band breakout (Chart API provides BB values)
      if(data.inds.bbUpper&&data.inds.bbLower&&data.price){
        if(data.price>data.inds.bbUpper)alerts.push({type:'BB_UPPER',msg:`${data.sym} ボリンジャー上限ブレイク $${data.price.toFixed(2)} > $${data.inds.bbUpper.toFixed(2)}`});
        if(data.price<data.inds.bbLower)alerts.push({type:'BB_LOWER',msg:`${data.sym} ボリンジャー下限ブレイク $${data.price.toFixed(2)} < $${data.inds.bbLower.toFixed(2)}`});
      }
      
      // User-defined triggers
      if(triggers?.length){
        triggers.forEach(tr=>{
          try{
            if(tr.type==='rsi_below'&&data.inds.rsi&&data.inds.rsi<tr.value)alerts.push({type:'USER_RULE',msg:`ルール発動: RSI ${data.inds.rsi.toFixed(1)} < ${tr.value}`});
            if(tr.type==='rsi_above'&&data.inds.rsi&&data.inds.rsi>tr.value)alerts.push({type:'USER_RULE',msg:`ルール発動: RSI ${data.inds.rsi.toFixed(1)} > ${tr.value}`});
            if(tr.type==='price_below'&&data.price<tr.value)alerts.push({type:'USER_RULE',msg:`ルール発動: $${data.price.toFixed(2)} < $${tr.value}`});
            if(tr.type==='price_above'&&data.price>tr.value)alerts.push({type:'USER_RULE',msg:`ルール発動: $${data.price.toFixed(2)} > $${tr.value}`});
          }catch(e){}
        });
      }
      
      // If alerts triggered, run AI analysis
      if(alerts.length&&!analyzing){
        analyzing=true;
        try{
          const li=lang==='ja'?'日本語で。':lang==='zh'?'中文。':'English.';
          const type=key.startsWith('AIza')?'gemini':key.startsWith('sk-ant')?'claude':'openai';
          const priceHist=streamData.history.slice(-12).map(d=>'$'+d.price?.toFixed(2)).join('→');
          const ohlcvCtx=data.ohlcv?.length?`\n直近ローソク: ${data.ohlcv.slice(-5).map(b=>`O:${b.o?.toFixed(2)} H:${b.h?.toFixed(2)} L:${b.l?.toFixed(2)} C:${b.c?.toFixed(2)}`).join(' | ')}`:'';
          const fullInds=Object.entries(data.inds||{}).filter(([k,v])=>v!=null).map(([k,v])=>`${k}:${typeof v==='number'?v.toFixed(2):v}`).join(' ');
          const img=await captureScreen(60);
          const content=[];
          if(img)content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}});
          content.push({type:'text',text:`【リアルタイムアラート】\n${alerts.map(a=>a.msg).join('\n')}\n\n現在: ${data.sym} $${data.price?.toFixed(2)} ${fullInds}\n直近推移: ${priceHist}${ohlcvCtx}\nデータ取得方式: ${data.mode||'unknown'}\n\n今すぐ行動すべきか？具体的なアドバイスを。`});
          
          const analysis=await callAI(type,key,model||'gemini-2.5-flash',[
            {role:'system',content:`リアルタイム株式アドバイザー。${li}トリガーが発動しました。簡潔に：1)今すぐ行動すべきか 2)推奨アクション 3)注意点。`},
            {role:'user',content}
          ],false);
          
          send('smart-alert',{alerts,analysis,data,img,time:new Date().toLocaleTimeString()});
        }catch(e){}
        analyzing=false;
      }
    }catch(e){} // CDP disconnected etc
  },intv);
  
  return{ok:true};
});

ipcMain.handle('smart-monitor-stop',()=>{
  if(smartTimer){clearInterval(smartTimer);smartTimer=null;}
  streamData={history:[],current:null};
  return{ok:true};
});

// Get current stream data for context-aware chat
ipcMain.handle('get-stream-context',()=>{
  if(!streamData.current)return{ok:false};
  const cur=streamData.current;
  const hist5=streamData.history.slice(-12).map(d=>({p:d.price,rsi:d.inds?.rsi,t:d.ts}));
  return{ok:true,current:cur,recentPrices:hist5};
});

// ═══ FEATURE 3: Context-Aware Chat ═══
ipcMain.handle('ai-with-context',async(_,{key,model,messages,search,streamContext})=>{
  try{
    if(!key)return{error:'APIキーが設定されていません'};
    const type=key.startsWith('AIza')?'gemini':key.startsWith('sk-ant')?'claude':'openai';
    // Inject real-time context into system prompt
    if(streamContext&&messages[0]?.role==='system'){
      const ctx=`\n\n【リアルタイムデータ（自動更新）】\n銘柄: ${streamContext.sym} 価格: $${streamContext.price?.toFixed(2)} RSI: ${streamContext.inds?.rsi?.toFixed(1)||'?'} MACD: ${streamContext.inds?.macd?.toFixed(3)||'?'}\n直近推移: ${(streamContext.recentPrices||[]).map(p=>'$'+(p.p?.toFixed(2)||'?')).join('→')}`;
      messages[0].content+=ctx;
    }
    return{ok:true,text:await callAI(type,key,model,messages,search)};
  }catch(e){return{error:e.message};}
});
