const { app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut, safeStorage, shell, clipboard } = require('electron');
const { autoUpdater } = require('electron-updater');
const fetch = require('node-fetch');
const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const AlpacaWS = require('ws');

let win = null, tvClient = null, autoTimer = null, smartTimer = null;
let streamData = { history: [], current: null }; // Last 60 data points (5 min at 5s intervals)
const SZ = { mini:{w:70,h:100}, normal:{w:520,h:780}, large:{w:720,h:960} };
const DATA_DIR = path.join(app.getPath('userData'), 'stockai');
const KEY_FILE = path.join(DATA_DIR, 'api-keys.json');
const WALLET_FILE = path.join(DATA_DIR, 'virtual-wallet.json');
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
app.whenReady().then(()=>{
  ensureDir(); app.setAsDefaultProtocolClient('stockai'); createWindow();
  globalShortcut.register('CommandOrControl+Shift+Space',()=>{if(!win)return;win.isVisible()?win.hide():showMainWindow();});
  setTimeout(connectTV,3000);
  // Auto-updater
  autoUpdater.autoDownload=true;
  autoUpdater.autoInstallOnAppQuit=true;
  setTimeout(()=>autoUpdater.checkForUpdates().catch(e=>console.log('update check:',e.message)),8000);
  autoUpdater.on('update-available',info=>send('update-available',{version:info.version}));
  autoUpdater.on('download-progress',p=>send('update-progress',{percent:Math.round(p.percent)}));
  autoUpdater.on('update-downloaded',info=>send('update-downloaded',{version:info.version}));
});
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
function encSecret(v){if(!v)return'';try{return safeStorage.encryptString(v).toString('base64');}catch(e){throw new Error('安全なAPIキー保存に失敗しました');}}
function decSecret(v){if(!v)return'';try{return safeStorage.decryptString(Buffer.from(v,'base64'));}catch(e){try{return Buffer.from(v,'base64').toString('utf8');}catch(_){return'';}}}
ipcMain.handle('save-api-key',(_,{provider,key,model})=>{try{const s=readKeyStore();s[provider]={key:encSecret(key||''),model:model||s[provider]?.model||''};writeKeyStore(s);return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('load-api-keys',()=>{try{const s=readKeyStore();const out={};['gemini','claude','openai','deepseek'].forEach(p=>{out[p]={key:decSecret(s[p]?.key),model:s[p]?.model||''};});return{ok:true,keys:out};}catch(e){return{ok:true,keys:{}};}});
ipcMain.handle('delete-api-key',(_,{provider})=>{try{const s=readKeyStore();delete s[provider];writeKeyStore(s);return{ok:true};}catch(e){return{error:e.message};}});
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

const FOMC_2026=['2026-01-28','2026-03-18','2026-04-29','2026-06-10','2026-07-29','2026-09-16','2026-10-28','2026-12-09'];
const CPI_2026=['2026-01-14','2026-02-11','2026-03-12','2026-04-10','2026-05-13','2026-06-11','2026-07-15','2026-08-12','2026-09-10','2026-10-09','2026-11-12','2026-12-10'];
function getUpcomingMacroEvents(days=14){const now=Date.now();const evts=[];[...FOMC_2026.map(d=>({date:d,label:'FOMC'})),...CPI_2026.map(d=>({date:d,label:'CPI'}))].forEach(e=>{const d=Math.round((new Date(e.date).getTime()-now)/86400000);if(d>=0&&d<=days)evts.push({...e,daysUntil:d});});return evts.sort((a,b)=>a.daysUntil-b.daysUntil);}

async function fetchMacro(){const macro={};await Promise.all([['DX-Y.NYB','dxy'],['%5ETNX','t10y'],['GC%3DF','gold'],['CL%3DF','oil']].map(async([sym,k])=>{try{const r=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`,{headers:UA});const m=r?.chart?.result?.[0]?.meta;if(m)macro[k]={price:m.regularMarketPrice,change:m.regularMarketPrice&&m.chartPreviousClose?((m.regularMarketPrice-m.chartPreviousClose)/m.chartPreviousClose*100).toFixed(2):null};}catch(e){}}));return macro;}

ipcMain.handle('market-data',async(_,{symbol})=>{
  const data={};
  try{const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`,{headers:UA});const meta=yf?.chart?.result?.[0]?.meta;const q=yf?.chart?.result?.[0]?.indicators?.quote?.[0];const ts=yf?.chart?.result?.[0]?.timestamp;if(meta){data.price=meta.regularMarketPrice;data.prevClose=meta.chartPreviousClose;data.change=(meta.regularMarketPrice&&meta.chartPreviousClose)?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null;data.week52High=meta.fiftyTwoWeekHigh;data.week52Low=meta.fiftyTwoWeekLow;data.exchange=meta.exchangeName;}if(q&&ts)data.ohlcv=ts.map((t,i)=>({d:new Date(t*1000).toISOString().slice(0,10),o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]})).filter(d=>d.c!=null).slice(-60);}catch(e){}
  if(!data.price){try{const q=await fetchR(`https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbol}`,{headers:UA});const r=q?.quoteResponse?.result?.[0];if(r){data.price=r.regularMarketPrice;data.prevClose=r.regularMarketPreviousClose;data.change=r.regularMarketChangePercent?.toFixed(2);data.week52High=r.fiftyTwoWeekHigh;data.week52Low=r.fiftyTwoWeekLow;data.trailingPE=r.trailingPE;data.marketCap=r.marketCap;}}catch(e){}}
  if(data.ohlcv?.length>20)data.tech=calcTech(data.ohlcv);
  try{const st=await fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,summaryDetail,financialData`,{headers:UA});const ks=st?.quoteSummary?.result?.[0]?.defaultKeyStatistics;const sd=st?.quoteSummary?.result?.[0]?.summaryDetail;const fd=st?.quoteSummary?.result?.[0]?.financialData;if(ks){data.beta=ks.beta?.raw;data.shortPercent=ks.shortPercentOfFloat?.raw;}if(sd&&!data.trailingPE){data.trailingPE=sd.trailingPE?.raw;data.forwardPE=sd.forwardPE?.raw;data.marketCap=data.marketCap||sd.marketCap?.raw;}if(fd){data.analystTarget=fd.targetMeanPrice?.raw;data.analystHigh=fd.targetHighPrice?.raw;data.analystLow=fd.targetLowPrice?.raw;data.analystCount=fd.numberOfAnalystOpinions?.raw;data.revenueGrowth=fd.revenueGrowth?.raw;data.grossMargins=fd.grossMargins?.raw;}}catch(e){}
  try{const fg=await fetchR('https://production.dataviz.cnn.io/index/fearandgreed/graphdata',{headers:{...UA,'Referer':'https://www.cnn.com/'}});data.fearGreed={score:Math.round(fg?.fear_and_greed?.score||0),rating:fg?.fear_and_greed?.rating||''};}catch(e){}
  try{const vf=await fetchR('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d',{headers:UA});data.vix=vf?.chart?.result?.[0]?.meta?.regularMarketPrice;}catch(e){}
  try{const sp=await fetchR('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d',{headers:UA});const m=sp?.chart?.result?.[0]?.meta;if(m)data.sp500Change=(m.regularMarketPrice&&m.chartPreviousClose)?((m.regularMarketPrice-m.chartPreviousClose)/m.chartPreviousClose*100).toFixed(2):null;}catch(e){}
  try{data.macro=await fetchMacro();}catch(e){}
  const [earR,insR,nwR]=await Promise.allSettled([
    fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=calendarEvents`,{headers:UA}),
    fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=insiderTransactions`,{headers:UA}),
    fetchR(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=15&quotesCount=0`,{headers:UA})
  ]);
  if(earR.status==='fulfilled'){const ts=earR.value?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;if(ts){const d=Math.round((ts*1000-Date.now())/86400000);if(d>=0&&d<=90)data.earningsDays=d;data.earningsDate=new Date(ts*1000).toISOString().slice(0,10);}}
  if(insR.status==='fulfilled'){const txns=insR.value?.quoteSummary?.result?.[0]?.insiderTransactions?.transactions;if(txns?.length)data.insiderTransactions=txns.slice(0,5).map(t=>({name:(t.filerName||'—').slice(0,20),relation:(t.filerRelation||'').replace('Chief Executive Officer','CEO').replace('Chief Financial Officer','CFO').replace('Chief Operating Officer','COO').replace('Chief Technology Officer','CTO'),shares:t.shares?.raw||0,value:t.value?.raw||0,date:t.startDate?.fmt||'',type:t.transactionText||''}));}
  if(nwR.status==='fulfilled'){const hl=(nwR.value?.news||[]).map(n=>n.title||'').filter(Boolean);if(hl.length){const pos=['beat','surge','rally','upgrade','strong','growth','record','profit','bullish','gain','rise','soar','jump','exceed','above','better','improve','breakthrough','partnership','deal'];const neg=['miss','drop','fall','downgrade','weak','loss','decline','bearish','cut','crash','warning','below','worse','concern','risk','trouble','layoff','lawsuit','recall','fraud','investigation'];let p=0,n2=0;hl.forEach(h=>{const l=h.toLowerCase();pos.forEach(w=>{if(l.includes(w))p++;});neg.forEach(w=>{if(l.includes(w))n2++;});});const tot=p+n2||1;data.newsSentiment={score:Math.round(p/tot*100),positive:p,negative:n2,total:hl.length};}}
  data.upcomingEvents=getUpcomingMacroEvents(14);
  if(!data.price)return{error:'データ取得失敗: '+symbol+' — ティッカーを確認してください'};
  return{ok:true,data};
});

function calcTech(ohlcv){const closes=ohlcv.map(d=>d.c),n=closes.length,last=closes[n-1];if(n<5)return null;const sma=p=>{const s=closes.slice(-Math.min(p,n));return s.reduce((a,b)=>a+b,0)/s.length;};const ema=p=>{const k=2/(p+1);let e=closes[0];for(let i=1;i<n;i++)e=closes[i]*k+e*(1-k);return e;};const sma20=sma(20),sma50=sma(50),sma200=sma(200);const ema12=ema(12),ema26=ema(26),macd=ema12-ema26;let g=0,l=0;for(let i=Math.max(1,n-14);i<n;i++){const d=closes[i]-closes[i-1];if(d>0)g+=d;else l-=d;}const rsi=l===0?100:100-100/(1+(g/l));const std=Math.sqrt(closes.slice(-Math.min(20,n)).reduce((a,c)=>a+Math.pow(c-sma20,2),0)/Math.min(20,n));const bbU=sma20+2*std,bbL=sma20-2*std;const rec20=ohlcv.slice(-20);const resist=Math.max(...rec20.map(d=>d.h)),supp=Math.min(...rec20.map(d=>d.l));const vols=ohlcv.slice(-20).map(d=>d.v).filter(v=>v>0);const avgVol=vols.length?vols.reduce((a,b)=>a+b,0)/vols.length:0;const volRatio=ohlcv[n-1]?.v&&avgVol?(ohlcv[n-1].v/avgVol).toFixed(2):'—';let atrSum=0;for(let i=Math.max(1,n-14);i<n;i++){const p=ohlcv[i-1],c=ohlcv[i];atrSum+=Math.max(c.h-c.l,Math.abs(c.h-p.c),Math.abs(c.l-p.c));}const atr=(atrSum/Math.min(14,n-1)).toFixed(2);const trend=last>sma20&&sma20>sma50?'上昇📈':last<sma20&&sma20<sma50?'下降📉':'レンジ↔';const rsiSig=rsi<30?'売られ過ぎ🟢':rsi>70?'買われ過ぎ🔴':'中立';const macdSig=macd>0?'強気':'弱気';const bbPct=bbU!==bbL?((last-bbL)/(bbU-bbL)*100).toFixed(0):'50';
  // EMA cross (9 vs 21) – golden / dead cross signal
  const ema9=ema(9),ema21=ema(21);
  const emaCross=ema9>ema21?'ゴールデン📈':'デッド📉';
  // Stochastic %K (14-period)
  const stOHLCV=ohlcv.slice(-Math.min(14,n));
  const stHH=Math.max(...stOHLCV.map(d=>d.h||d.c));
  const stLL=Math.min(...stOHLCV.map(d=>d.l||d.c));
  const stochK=stHH!==stLL?((last-stLL)/(stHH-stLL)*100).toFixed(1):'50';
  const stochSig=parseFloat(stochK)<20?'売られ過ぎ🟢':parseFloat(stochK)>80?'買われ過ぎ🔴':'中立';
  // OBV direction (6-bar trend)
  let obvAcc=0;for(let i=1;i<n;i++){if(closes[i]>closes[i-1])obvAcc+=(ohlcv[i].v||0);else if(closes[i]<closes[i-1])obvAcc-=(ohlcv[i].v||0);}
  const recentOBVDelta=ohlcv.slice(-Math.min(6,n)).reduce((acc,d,i,arr)=>{if(i===0)return 0;if(d.c>(arr[i-1].c||0))return acc+(d.v||0);if(d.c<(arr[i-1].c||0))return acc-(d.v||0);return acc;},0);
  const obvDir=recentOBVDelta>0?'上昇📈':recentOBVDelta<0?'下降📉':'横ばい';
  // Pivot points (previous session)
  const prevD=n>=2?ohlcv[n-2]:ohlcv[n-1];
  const pivot=prevD?((prevD.h+prevD.l+prevD.c)/3).toFixed(2):null;
  const r1=prevD&&pivot?(2*parseFloat(pivot)-prevD.l).toFixed(2):null;
  const s1=prevD&&pivot?(2*parseFloat(pivot)-prevD.h).toFixed(2):null;
  return{sma20:sma20.toFixed(2),sma50:sma50.toFixed(2),sma200:sma200.toFixed(2),ema9:ema9.toFixed(2),ema21:ema21.toFixed(2),emaCross,macd:macd.toFixed(3),macdSig,rsi:rsi.toFixed(1),rsiSig,stochK,stochSig,bbUpper:bbU.toFixed(2),bbMid:sma20.toFixed(2),bbLower:bbL.toFixed(2),bbPct,atr,trend,support:supp.toFixed(2),resistance:resist.toFixed(2),volRatio,obvDir,pivot,r1,s1};}

// ═══ AI ═══
function inferAIType(key,model){
  if(String(model||'').startsWith('deepseek'))return'deepseek';
  if(String(key||'').startsWith('AIza'))return'gemini';
  if(String(key||'').startsWith('sk-ant'))return'claude';
  return'openai';
}
function textOnlyMessages(messages){
  return messages.map(m=>({
    role:m.role,
    content:Array.isArray(m.content)
      ?m.content.map(c=>c.type==='image'?'[Screenshot attached, but this provider does not support image input in StockAI yet.]':(c.text||'')).join('\n')
      :String(m.content||'')
  }));
}
async function callAI(type,key,model,messages,search=false){
  // CLI auth sentinel: route Claude calls through Claude Code subprocess
  if(type==='claude'&&key==='__cli__'){
    let sys='';const msgs=[...messages];
    if(msgs[0]?.role==='system'){sys=msgs.shift().content;}
    // Flatten messages to a single text prompt (CLI mode is text-only)
    const flatten=m=>Array.isArray(m.content)
      ?m.content.filter(c=>c.type==='text').map(c=>c.text).join('\n')
      :String(m.content||'');
    const prompt=msgs.map(m=>(m.role==='user'?'':'[Assistant]\n')+flatten(m)).join('\n\n');
    const hasImg=msgs.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='image'));
    if(hasImg)throw new Error('Claude Code CLI モードは現在テキスト専用です。画像分析には API キーが必要です。');
    const cliModel=model&&model.includes('opus')?'opus':'sonnet';
    return await callClaudeCLI({prompt,systemPrompt:sys,model:cliModel});
  }
  if(type==='gemini'){let sys='';const msgs=[...messages];if(msgs[0]?.role==='system'){sys=msgs.shift().content;}const contents=msgs.map(m=>{const parts=[];if(Array.isArray(m.content))m.content.forEach(c=>{if(c.type==='text')parts.push({text:c.text});else if(c.type==='image')parts.push({inline_data:{mime_type:c.source.media_type,data:c.source.data}});});else parts.push({text:String(m.content||'')});return{role:m.role==='assistant'?'model':'user',parts};});const body={contents,generationConfig:{maxOutputTokens:4000}};if(sys)body.systemInstruction={parts:[{text:sys}]};if(search)body.tools=[{google_search:{}}];body.safetySettings=[{category:'HARM_CATEGORY_HARASSMENT',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_HATE_SPEECH',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_DANGEROUS_CONTENT',threshold:'BLOCK_NONE'}];const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok){const e=await r.json().catch(()=>({}));const msg=e.error?.message||'';if(r.status===400&&msg.includes('API_KEY'))throw new Error('Gemini APIキーが無効です。キーを確認してください');if(r.status===429)throw new Error('Gemini レート制限。しばらく待ってください');throw new Error('Gemini: '+msg||r.status);}const d=await r.json();if(d.promptFeedback?.blockReason)throw new Error('Gemini: コンテンツがブロックされました');return d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';}
  if(type==='claude'){let sys='';const msgs=[...messages];if(msgs[0]?.role==='system'){sys=msgs.shift().content;}const body={model:model||'claude-sonnet-4-20250514',max_tokens:4000,messages:msgs};if(sys)body.system=sys;if(search)body.tools=[{type:'web_search_20250305',name:'web_search'}];let cur=[...msgs];for(let i=0;i<8;i++){const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({...body,messages:cur})});if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401)throw new Error('Claude APIキーが無効です');if(r.status===429)throw new Error('Claude レート制限');throw new Error('Claude: '+(e.error?.message||r.status));}const d=await r.json();if(d.stop_reason==='tool_use'){cur.push({role:'assistant',content:d.content});cur.push({role:'user',content:d.content.filter(b=>b.type==='tool_use').map(b=>({type:'tool_result',tool_use_id:b.id,content:[{type:'text',text:'done'}]}))});}else return d.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');}throw new Error('Claude: 最大ループ回数超過');}
  if(type==='openai'){const msgs=messages.map(m=>({role:m.role,content:Array.isArray(m.content)?m.content.map(c=>c.type==='image'?{type:'image_url',image_url:{url:`data:${c.source.media_type};base64,${c.source.data}`}}:{type:'text',text:c.text||''}):m.content}));const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:model||'gpt-4o',messages:msgs,max_tokens:3000})});if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401)throw new Error('OpenAI APIキーが無効です');if(r.status===429)throw new Error('OpenAI レート制限');throw new Error('OpenAI: '+(e.error?.message||r.status));}return(await r.json()).choices[0].message.content;}
  if(type==='deepseek'){const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:model||'deepseek-chat',messages:textOnlyMessages(messages),max_tokens:3000})});if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401)throw new Error('DeepSeek APIキーが無効です');if(r.status===429)throw new Error('DeepSeek レート制限');throw new Error('DeepSeek: '+(e.error?.message||r.status));}return(await r.json()).choices?.[0]?.message?.content||'';}
  throw new Error('不明なAIタイプ: '+type);
}

// ═══ Build context helper ═══
function buildCtx(symbol,marketData,tvState,portfolio,userInstruction,symbolHistory){
  const md=marketData||{},tech=md.tech||{};
  const dataCtx=md.price?`[${symbol}] $${safe(md.price)} ${md.change||'—'}% | RSI:${tech.rsi||'—'}(${tech.rsiSig||''}) Stoch:${tech.stochK||'—'}%(${tech.stochSig||''}) | MACD:${tech.macd||'—'}(${tech.macdSig||''}) EMA9x21:${tech.emaCross||'—'} | Trend:${tech.trend||'—'} OBV:${tech.obvDir||'—'} | BB%:${tech.bbPct||'—'} ATR:${tech.atr||'—'} | Supp:$${tech.support||'—'} Res:$${tech.resistance||'—'} Pivot:$${tech.pivot||'—'} R1:$${tech.r1||'—'} S1:$${tech.s1||'—'} | PE:${safe(md.trailingPE,1)} Beta:${safe(md.beta)} | F&G:${md.fearGreed?.score||'—'} VIX:${safe(md.vix,1)} S&P:${md.sp500Change||'—'}% | Target:$${safe(md.analystTarget)}(${md.analystCount||'—'}人) Vol:${tech.volRatio||'—'}x`:'';
  const macroCtx=md.macro?` | DXY:${safe(md.macro.dxy?.price,1)} 10Y:${safe(md.macro.t10y?.price,2)}% Gold:$${safe(md.macro.gold?.price,0)} Oil:$${safe(md.macro.oil?.price,1)}`:'';
  const tvCtx=tvState?.sym?` [TV]${tvState.sym} ${tvState.price||''} TF:${tvState.tf||''}`:'';
  const portCtx=portfolio?.length?`\n[保有]${portfolio.map(p=>p.symbol+' '+p.shares+'株@$'+p.avgCost).join(', ')}`:'';
  const histCtx=symbolHistory?.length?`\n[前回分析]${symbolHistory.map(h=>`${new Date(h.timestamp).toLocaleDateString()}:${h.signal||'HOLD'}@$${h.price||'?'} Score:${h.score||'?'}/10 "${(h.summary||'').slice(0,80)}"`).join(' | ')}`:'';
  const earCtx=md.earningsDays!=null?` | 決算:${md.earningsDays}日後(${md.earningsDate||''})`:''  ;
  const evtCtx=md.upcomingEvents?.length?` | ${md.upcomingEvents.map(e=>`${e.label}:${e.daysUntil}日後`).join(' ')}`:''  ;
  const sentCtx=md.newsSentiment?` | ニュース感情:${md.newsSentiment.score}点(+${md.newsSentiment.positive}/-${md.newsSentiment.negative}/${md.newsSentiment.total}件)`:''  ;
  const insCtx=md.insiderTransactions?.length?`\n[インサイダー]${md.insiderTransactions.slice(0,3).map(t=>`${t.relation||t.name}:${t.shares>0?'買':'売'}${Math.abs(t.shares).toLocaleString()}株@${t.date}`).join(', ')}`:''  ;
  const userCmd=userInstruction?`\n[指示]${userInstruction}`:'';
  return dataCtx+macroCtx+earCtx+evtCtx+sentCtx+tvCtx+portCtx+histCtx+insCtx+userCmd;
}

// ═══ Lite Mode: A → D → E (3 steps, ~15 sec) ═══
ipcMain.handle('run-lite', async(_,{keys,symbol,marketData,tvState,screenshot,lang,userInstruction,portfolio})=>{
  const li=lang==='ja'?'日本語で回答。':lang==='zh'?'中文回答。':'English.';
  const activeKey=keys.gemini||keys.claude||keys.openai||keys.deepseek;
  if(!activeKey)return{error:'APIキーが設定されていません。⚙設定からAPIキーを入力してください'};
  const type=keys.gemini?'gemini':keys.claude?'claude':keys.openai?'openai':'deepseek';
  const mdl=keys.gemini?(keys.geminiModel||'gemini-2.5-flash'):keys.claude?'claude-sonnet-4-20250514':keys.openai?'gpt-4o':(keys.deepseekModel||'deepseek-chat');
  let symHist=[];try{const hf=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'history.json'),'utf8'));symHist=hf.filter(e=>e.symbol?.toUpperCase()===symbol?.toUpperCase()).slice(0,3);}catch(e){}
  const ctx=buildCtx(symbol,marketData,tvState,portfolio,userInstruction,symHist);
  const results={},rawTexts={};
  const progress=(agent,status)=>send('agent-progress',{agent,status});
  try{
    // A: Quant
    progress('A','running');
    const aC=[];if(screenshot)aC.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});
    aC.push({type:'text',text:`${symbol}分析。${ctx}`});
    rawTexts.A=await callAI(type,activeKey,mdl,[{role:'system',content:`エリート・クオンツアナリスト。${li}スクリーンショット・テクニカル・ファンダメンタルを統合分析。研究メモとして出力（個人向け売買指示禁止）。\n【必須分析】①価格とSMA20/50/200・EMA9/21の位置関係 ②RSIとStochの乖離・方向 ③MACD勢いとヒストグラム ④BB%とボラティリティ状態 ⑤OBVで出来高確認 ⑥チャートパターン認識（ダブルトップ/カップ/三角保ち合い等） ⑦ピボットポイントとS1/R1との距離 ⑧ファンダ・バリュエーション\nJSON:{"score":N(1-10),"signal":"BULLISH/BEARISH/NEUTRAL/WATCH","confidence":N(0-100),"analysis":"...詳細テクニカル分析","patterns":["...チャートパターン"],"volAnalysis":"...出来高・OBV分析","maConfluence":"...MA整列状態","risks":["..."],"catalysts":["..."]}`},{role:'user',content:aC}],true);
    results.A=parseJSON(rawTexts.A);progress('A','done');

    // D: Risk (parallel-safe, depends only on A)
    progress('D','running');
    rawTexts.D=await callAI(type,activeKey,mdl,[{role:'system',content:`リスクMgr。${li}GO/NO-GO判定。具体的な数値根拠を示す。JSON:{"decision":"GO/NO-GO/CONDITIONAL","maxLoss":"$X","killSwitch":["具体的な撤退条件..."],"warnings":["..."],"riskScore":N(1-10),"eventRisks":["..."],"stopLevel":"$X"}`},{role:'user',content:`A:${JSON.stringify(results.A)}\n${ctx}`}],false);
    results.D=parseJSON(rawTexts.D);progress('D','done');

    // E: CEO with entry conditions
    progress('E','running');
    const eC=[];if(screenshot)eC.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});
    eC.push({type:'text',text:`A:${JSON.stringify(results.A)}\nD:${JSON.stringify(results.D)}\n${ctx}`});
    rawTexts.E=await callAI(type,activeKey,mdl,[{role:'system',content:`CEO秘書・研究統合AI。${li}クオンツ・リスク分析を統合して研究レポートを作成。個人向け売買指示・断定的な価格予測・必ず儲かる表現は禁止。\n\n【必須項目】\n1. 観察条件：具体的な価格水準や指標値を使った条件（例:「RSI 60超＋BB上抜けで強気継続」）\n2. 回避イベント：「決算前はボラティリティに注意」等\n3. 予測：断定せず「注目ポイント」形式で短中長期\n\nJSON:{"finalVerdict":"BULLISH/BEARISH/NEUTRAL/WATCH","confidence":N(0-100),"score":N(1-10),"summary":"...2-3文の核心まとめ","keyReasons":["具体的根拠3-5件..."],"actionPlan":"次に確認すべき情報・観察ポイント","entryCondition":"具体的な価格・指標条件（例:$XXX以上かつRSI50超）","avoidEvents":["..."],"riskWarning":"...","timeHorizon":"SHORT|MEDIUM|LONG|NEUTRAL","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","whyMattersToUser":"持ち株・ウォッチとの関連性（1-2文）","prediction":{"shortTerm":"1-2週間の注目点（具体的水準を含む）","midTerm":"1-3ヶ月の注目点（触媒を含む）","longTerm":"6-12ヶ月の注目点（テーマを含む）"}}`},{role:'user',content:eC}],false);
    results.E=parseJSON(rawTexts.E);progress('E','done');
    return{ok:true,results,rawTexts,mode:'lite'};
  }catch(e){return{error:e.message,partialResults:results,rawTexts};}
});

// ═══ Full 6-Agent ═══
ipcMain.handle('run-agents',async(_,{keys,symbol,marketData,tvState,screenshot,lang,userInstruction,portfolio})=>{
  const li=lang==='ja'?'日本語で回答。':lang==='zh'?'中文回答。':'English.';
  const activeKey=keys.gemini||keys.claude||keys.openai||keys.deepseek;
  if(!activeKey)return{error:'APIキーが設定されていません。⚙設定からAPIキーを入力してください'};
  const type=keys.gemini?'gemini':keys.claude?'claude':keys.openai?'openai':'deepseek';
  const mdl=keys.gemini?(keys.geminiModel||'gemini-2.5-flash'):keys.claude?'claude-sonnet-4-20250514':keys.openai?'gpt-4o':(keys.deepseekModel||'deepseek-chat');
  let symHist=[];try{const hf=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'history.json'),'utf8'));symHist=hf.filter(e=>e.symbol?.toUpperCase()===symbol?.toUpperCase()).slice(0,3);}catch(e){}
  const ctx=buildCtx(symbol,marketData,tvState,portfolio,userInstruction,symHist);
  const results={},rawTexts={};
  const progress=(agent,status)=>send('agent-progress',{agent,status});
  try{
    progress('A','running');
    const aC=[];if(screenshot)aC.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});aC.push({type:'text',text:`${symbol}分析。${ctx}`});
    rawTexts.A=await callAI(type,activeKey,mdl,[{role:'system',content:`エリート・クオンツアナリスト。${li}スクリーンショット・テクニカル・ファンダメンタルを統合分析。研究メモとして出力（個人向け売買指示禁止）。\n【必須分析】①価格とSMA20/50/200・EMA9/21の位置関係 ②RSIとStochの乖離・方向 ③MACD勢いとヒストグラム ④BB%とボラティリティ状態 ⑤OBVで出来高確認 ⑥チャートパターン認識（ダブルトップ/カップ/三角保ち合い等） ⑦ピボットポイントとS1/R1との距離 ⑧ファンダ・バリュエーション\nJSON:{"score":N(1-10),"signal":"BULLISH/BEARISH/NEUTRAL/WATCH","confidence":N(0-100),"analysis":"...詳細テクニカル分析","patterns":["...チャートパターン"],"volAnalysis":"...出来高・OBV分析","maConfluence":"...MA整列状態","risks":["..."],"catalysts":["..."]}`},{role:'user',content:aC}],true);
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
    rawTexts.E=await callAI(type,activeKey,mdl,[{role:'system',content:`CEO秘書・研究統合AI。${li} 個人向け売買指示、断定的な価格予測、必ず儲かる表現は禁止。\n【重要】以下を必ず含めること：\n1. 観察条件：「この材料が確認できれば強気継続」「この水準を割るとリスク上昇」等\n2. 回避イベント：「決算前はボラティリティに注意」等\n\nJSON:{"finalVerdict":"BULLISH/BEARISH/NEUTRAL/WATCH","confidence":N,"score":N,"summary":"...詳細","keyReasons":["..."],"actionPlan":"次に確認すべき情報・観察ポイント","entryCondition":"具体的な観察条件","avoidEvents":["..."],"riskWarning":"...","timeHorizon":"SHORT|MEDIUM|LONG|NEUTRAL","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","whyMattersToUser":"持ち株・ウォッチとの関連性（1-2文）","prediction":{"shortTerm":"1-2週間の注目点:...","midTerm":"1-3ヶ月の注目点:...","longTerm":"6-12ヶ月の注目点:..."}}`},{role:'user',content:eC}],false);
    results.E=parseJSON(rawTexts.E);progress('E','done');

    progress('F','running');
    rawTexts.F=await callAI(type,activeKey,mdl,[{role:'system',content:`品質評価AI。${li}JSON:{"scores":{"A":N,"B":N,"C":N,"D":N,"E":N},"overallGrade":"A/B/C/D/F","feedback":"...","improvements":["..."],"blindSpots":["..."]}`},{role:'user',content:`全:\nA:${JSON.stringify(results.A)}\nB:${JSON.stringify(results.B)}\nC:${JSON.stringify(results.C)}\nD:${JSON.stringify(results.D)}\nE:${JSON.stringify(results.E)}`}],false);
    results.F=parseJSON(rawTexts.F);progress('F','done');
    return{ok:true,results,rawTexts,mode:'full'};
  }catch(e){return{error:e.message,partialResults:results,rawTexts};}
});

function parseJSON(raw){if(!raw)return{parseError:true,raw:''};try{let depth=0,start=-1;for(let i=0;i<raw.length;i++){if(raw[i]==='{'){if(depth===0)start=i;depth++;}else if(raw[i]==='}'){depth--;if(depth===0&&start>=0)return JSON.parse(raw.substring(start,i+1));}}return{parseError:true,raw};}catch(e){return{parseError:true,raw};}}

// ═══ Signal Outcome Tracker ═══
ipcMain.handle('check-signal-outcomes',async()=>{
  try{
    const file=path.join(DATA_DIR,'history.json');
    let h=[];try{h=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){return{ok:true,history:[]};}
    const now=Date.now();
    const need7=h.filter(e=>e.price&&!e.outcome7d&&(now-e.timestamp)>=7*86400000&&(now-e.timestamp)<180*86400000);
    const need30=h.filter(e=>e.price&&!e.outcome30d&&(now-e.timestamp)>=30*86400000&&(now-e.timestamp)<365*86400000);
    const syms=[...new Set([...need7,...need30].map(e=>e.symbol?.toUpperCase()).filter(Boolean))];
    if(!syms.length)return{ok:true,history:h};
    const prices={};
    await Promise.all(syms.map(async sym=>{try{const r=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`,{headers:UA});const p=r?.chart?.result?.[0]?.meta?.regularMarketPrice;if(p)prices[sym]=p;}catch(e){}}));
    let changed=false;
    h=h.map(entry=>{
      const sym=entry.symbol?.toUpperCase();const cur=prices[sym];if(!cur||!entry.price)return entry;
      const age=(now-entry.timestamp)/86400000;const chg=parseFloat(((cur-entry.price)/entry.price*100).toFixed(2));
      let e={...entry};
      if(age>=7&&!e.outcome7d){e.outcome7d={price:cur,change:chg,checkedAt:now};changed=true;}
      if(age>=30&&!e.outcome30d){e.outcome30d={price:cur,change:chg,checkedAt:now};changed=true;}
      return e;
    });
    if(changed)fs.writeFileSync(file,JSON.stringify(h,null,2));
    return{ok:true,history:h};
  }catch(e){return{ok:true,history:[]};}
});

// ═══ Single AI / Multi-AI / Agent Chat ═══
ipcMain.handle('ai',async(_,{key,model,messages,search})=>{try{if(!key)return{error:'APIキーが設定されていません'};return{ok:true,text:await callAI(inferAIType(key,model),key,model,messages,search)};}catch(e){return{error:e.message};}});
ipcMain.handle('multi-ai',async(_,{keys,messages})=>{const calls=[];if(keys.gemini)calls.push(callAI('gemini',keys.gemini,keys.geminiModel||'gemini-2.5-flash',messages,true).then(t=>({ai:'Gemini',text:t})).catch(e=>({ai:'Gemini',error:e.message})));if(keys.claude)calls.push(callAI('claude',keys.claude,'claude-sonnet-4-20250514',messages,true).then(t=>({ai:'Claude',text:t})).catch(e=>({ai:'Claude',error:e.message})));if(keys.openai)calls.push(callAI('openai',keys.openai,'gpt-4o',messages,false).then(t=>({ai:'GPT-4o',text:t})).catch(e=>({ai:'GPT-4o',error:e.message})));if(keys.deepseek)calls.push(callAI('deepseek',keys.deepseek,keys.deepseekModel||'deepseek-chat',messages,false).then(t=>({ai:'DeepSeek',text:t})).catch(e=>({ai:'DeepSeek',error:e.message})));return{ok:true,results:await Promise.all(calls)};});
// ═══ Debate AI: Bull vs Bear vs Judge ═══
ipcMain.handle('debate-ai',async(_,{debates})=>{
  if(!debates?.length)return{error:'No debate calls'};
  const calls=debates.map(d=>{
    const type=inferAIType(d.key,d.model);
    return callAI(type,d.key,d.model,d.messages,false)
      .then(t=>({role:d.role,ai:d.ai,text:t}))
      .catch(e=>({role:d.role,ai:d.ai,error:e.message}));
  });
  return{ok:true,results:await Promise.all(calls)};
});

ipcMain.handle('agent-chat',async(_,{key,model,message,agentResults,marketData,lang})=>{try{const li=lang==='ja'?'日本語で詳細に。':lang==='zh'?'详细中文。':'Detailed English.';return{ok:true,text:await callAI(inferAIType(key,model),key,model,[{role:'system',content:`CEO秘書AI。${li}分析結果を踏まえて具体的数値で回答。\n分析:${JSON.stringify(agentResults||{})}`},{role:'user',content:message}],false)};}catch(e){return{error:e.message};}});

// ═══ Auto Monitor ═══
ipcMain.handle('auto-start',async(_,{key,interval,lang,model,rules})=>{if(autoTimer)clearInterval(autoTimer);let lastHash='';const ruleText=rules?.length?`\n条件: ${rules.map(r=>r.condition+'→'+r.action).join('; ')}`:'';autoTimer=setInterval(async()=>{try{const img=await captureScreen(55);if(!img)return;const hash=img.slice(50,250);if(hash===lastHash)return;lastHash=hash;const li=lang==='ja'?'日本語。':lang==='zh'?'中文。':'English.';const text=await callAI('gemini',key,model||'gemini-2.5-flash',[{role:'system',content:`Stock monitor. ${li} ONLY if important. Otherwise "OK".${ruleText}`},{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}},{type:'text',text:'Monitor.'}]}],false);if(text&&!text.trim().startsWith('OK'))send('auto-alert',{text,img,time:new Date().toLocaleTimeString()});}catch(e){}},(interval||15)*1000);return{ok:true};});
ipcMain.handle('auto-stop',()=>{if(autoTimer){clearInterval(autoTimer);autoTimer=null;}return{ok:true};});

// ═══ Data persistence ═══
ipcMain.handle('save-history',(_,{entry})=>{try{const file=path.join(DATA_DIR,'history.json');let h=[];try{h=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){}h.unshift({...entry,timestamp:Date.now()});if(h.length>100)h=h.slice(0,100);fs.writeFileSync(file,JSON.stringify(h,null,2));return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('load-history',()=>{try{return{ok:true,history:JSON.parse(fs.readFileSync(path.join(DATA_DIR,'history.json'),'utf8'))};}catch(e){return{ok:true,history:[]};}});
ipcMain.handle('load-symbol-history',(_,{symbol})=>{try{const h=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'history.json'),'utf8'));return{ok:true,history:h.filter(e=>e.symbol?.toUpperCase()===symbol?.toUpperCase()).slice(0,3)};}catch(e){return{ok:true,history:[]};}});
ipcMain.handle('save-portfolio',(_,{portfolio})=>{try{fs.writeFileSync(path.join(DATA_DIR,'portfolio.json'),JSON.stringify(portfolio,null,2));return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('load-portfolio',()=>{try{return{ok:true,portfolio:JSON.parse(fs.readFileSync(path.join(DATA_DIR,'portfolio.json'),'utf8'))};}catch(e){return{ok:true,portfolio:[]};}});

function defaultVirtualWallet(){return{cash:100000,initialCash:100000,positions:{},trades:[],snapshots:[],updatedAt:Date.now()};}
function readVirtualWallet(){try{return{...defaultVirtualWallet(),...JSON.parse(fs.readFileSync(WALLET_FILE,'utf8'))};}catch(e){return defaultVirtualWallet();}}
function writeVirtualWallet(w){ensureDir();fs.writeFileSync(WALLET_FILE,JSON.stringify(w,null,2));}
async function fetchQuotePrice(symbol){
  const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`,{headers:UA});
  const meta=yf?.chart?.result?.[0]?.meta;
  if(!meta?.regularMarketPrice)throw new Error(`${symbol} price unavailable`);
  return{price:meta.regularMarketPrice,change:meta.chartPreviousClose?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null};
}
async function enrichVirtualWallet(wallet){
  const out={...wallet,positions:{...(wallet.positions||{})}};
  const symbols=Object.keys(out.positions).filter(sym=>out.positions[sym]?.qty>0);
  let marketValue=0,totalCost=0,unrealized=0;
  for(const sym of symbols){
    const p=out.positions[sym];
    try{
      const q=await fetchQuotePrice(sym);
      p.lastPrice=q.price;p.change=q.change;
    }catch(e){}
    const last=parseFloat(p.lastPrice||p.avgCost||0);
    const qty=parseFloat(p.qty||0),avg=parseFloat(p.avgCost||0);
    p.marketValue=last*qty;
    p.unrealized=(last-avg)*qty;
    p.unrealizedPct=avg?((last-avg)/avg*100):0;
    marketValue+=p.marketValue;
    totalCost+=avg*qty;
    unrealized+=p.unrealized;
  }
  out.marketValue=marketValue;
  out.totalEquity=(parseFloat(out.cash)||0)+marketValue;
  out.totalReturn=out.totalEquity-(parseFloat(out.initialCash)||100000);
  out.totalReturnPct=out.initialCash?out.totalReturn/out.initialCash*100:0;
  out.unrealized=unrealized;
  out.costBasis=totalCost;
  return out;
}
function scoreTradeDiscipline({wallet, action, sym, amount, fill, note, positionBefore}){
  const equity=Math.max(1,parseFloat(wallet.initialCash)||100000);
  const tradePct=fill*amount/equity*100;
  const text=String(note||'').trim();
  let score=100;
  const flags=[];
  if(!text){score-=22;flags.push('没有记录交易理由');}
  else if(text.length<12){score-=10;flags.push('理由太短，复盘价值偏低');}
  if(tradePct>20){score-=24;flags.push('单笔仓位超过 20%');}
  else if(tradePct>10){score-=12;flags.push('单笔仓位偏大');}
  if(action==='buy'&&positionBefore?.qty>0){score-=8;flags.push('已有持仓上继续加仓');}
  if(action==='sell'&&positionBefore?.qty&&amount<positionBefore.qty&&tradePct<2){score-=4;flags.push('减仓幅度较小，注意是否只是情绪动作');}
  if(!/止损|风险|计划|观察|财报|突破|回踩|support|risk|stop|plan|earnings|breakout/i.test(text)){score-=12;flags.push('没有写清风险或观察条件');}
  score=Math.max(1,Math.min(100,Math.round(score)));
  const label=score>=82?'A':score>=68?'B':score>=52?'C':'D';
  return{score,label,flags:flags.slice(0,3),tradePct:parseFloat(tradePct.toFixed(2))};
}

ipcMain.handle('virtual-wallet-load',async()=>{
  try{return{ok:true,wallet:await enrichVirtualWallet(readVirtualWallet())};}
  catch(e){return{error:e.message};}
});
ipcMain.handle('virtual-wallet-reset',async(_,{cash})=>{
  try{
    const start=Math.max(1000,parseFloat(cash)||100000);
    const wallet={...defaultVirtualWallet(),cash:start,initialCash:start,updatedAt:Date.now()};
    writeVirtualWallet(wallet);
    return{ok:true,wallet:await enrichVirtualWallet(wallet)};
  }catch(e){return{error:e.message};}
});
ipcMain.handle('virtual-trade',async(_,{symbol,side,qty,price,note})=>{
  try{
    const sym=String(symbol||'').trim().toUpperCase();
    const action=String(side||'buy').toLowerCase()==='sell'?'sell':'buy';
    const amount=parseFloat(qty);
    if(!sym||!amount||amount<=0)return{error:'请输入有效的股票代码和数量'};
    const wallet=readVirtualWallet();
    const quote=price?{price:parseFloat(price),change:null}:await fetchQuotePrice(sym);
    const fill=parseFloat(quote.price);
    if(!fill||fill<=0)return{error:'价格无效'};
    const cost=fill*amount;
    const pos=wallet.positions[sym]||{symbol:sym,qty:0,avgCost:0,lastPrice:fill,realized:0};
    const positionBefore={...pos};
    const discipline=scoreTradeDiscipline({wallet,action,sym,amount,fill,note,positionBefore});
    if(action==='buy'){
      if(wallet.cash<cost)return{error:'虚拟现金不足'};
      const newQty=parseFloat(pos.qty||0)+amount;
      pos.avgCost=((parseFloat(pos.avgCost||0)*parseFloat(pos.qty||0))+cost)/newQty;
      pos.qty=newQty;pos.lastPrice=fill;
      wallet.positions[sym]=pos;
      wallet.cash-=cost;
    }else{
      if((parseFloat(pos.qty)||0)<amount)return{error:'虚拟持仓不足'};
      const realized=(fill-parseFloat(pos.avgCost||0))*amount;
      pos.qty=parseFloat(pos.qty)-amount;
      pos.realized=(parseFloat(pos.realized)||0)+realized;
      pos.lastPrice=fill;
      wallet.cash+=cost;
      if(pos.qty<=0.000001)delete wallet.positions[sym];
      else wallet.positions[sym]=pos;
    }
    wallet.trades=[{id:Date.now(),time:Date.now(),symbol:sym,side:action,qty:amount,price:fill,total:cost,note:String(note||'').slice(0,120),discipline},...(wallet.trades||[])].slice(0,300);
    wallet.updatedAt=Date.now();
    const enriched=await enrichVirtualWallet(wallet);
    wallet.snapshots=[{time:Date.now(),value:enriched.totalEquity},...(wallet.snapshots||[])].slice(0,300);
    writeVirtualWallet(wallet);
    return{ok:true,wallet:await enrichVirtualWallet(wallet)};
  }catch(e){return{error:e.message};}
});
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
    const type=inferAIType(key,model);
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
    const type=inferAIType(key,model);
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
        if(prevDiff<0&&curDiff>0)alerts.push({type:'MACD_CROSS_UP',msg:`${data.sym} MACDゴールデンクロス（強気転換の観察ポイント）`});
        if(prevDiff>0&&curDiff<0)alerts.push({type:'MACD_CROSS_DN',msg:`${data.sym} MACDデッドクロス（弱気転換の観察ポイント）`});
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
          const type=inferAIType(key,model);
          const priceHist=streamData.history.slice(-12).map(d=>'$'+d.price?.toFixed(2)).join('→');
          const ohlcvCtx=data.ohlcv?.length?`\n直近ローソク: ${data.ohlcv.slice(-5).map(b=>`O:${b.o?.toFixed(2)} H:${b.h?.toFixed(2)} L:${b.l?.toFixed(2)} C:${b.c?.toFixed(2)}`).join(' | ')}`:'';
          const fullInds=Object.entries(data.inds||{}).filter(([k,v])=>v!=null).map(([k,v])=>`${k}:${typeof v==='number'?v.toFixed(2):v}`).join(' ');
          const img=await captureScreen(60);
          const content=[];
          if(img)content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}});
          content.push({type:'text',text:`【リアルタイムアラート】\n${alerts.map(a=>a.msg).join('\n')}\n\n現在: ${data.sym} $${data.price?.toFixed(2)} ${fullInds}\n直近推移: ${priceHist}${ohlcvCtx}\nデータ取得方式: ${data.mode||'unknown'}\n\n何が変化したか、リスクは何か、次に観察すべき条件は何かを整理してください。`});
          
          const analysis=await callAI(type,key,model||'gemini-2.5-flash',[
            {role:'system',content:`リアルタイム株式研究アシスタント。${li}トリガーが発動しました。売買指示ではなく、簡潔に：1)何が起きたか 2)リスク 3)次に観察する条件。`},
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
    const type=inferAIType(key,model);
    // Inject real-time context into system prompt
    if(streamContext&&messages[0]?.role==='system'){
      const ctx=`\n\n【リアルタイムデータ（自動更新）】\n銘柄: ${streamContext.sym} 価格: $${streamContext.price?.toFixed(2)} RSI: ${streamContext.inds?.rsi?.toFixed(1)||'?'} MACD: ${streamContext.inds?.macd?.toFixed(3)||'?'}\n直近推移: ${(streamContext.recentPrices||[]).map(p=>'$'+(p.p?.toFixed(2)||'?')).join('→')}`;
      messages[0].content+=ctx;
    }
    return{ok:true,text:await callAI(type,key,model,messages,search)};
  }catch(e){return{error:e.message};}
});

// ═══ Research Workbench: fundamentals, news, review, scoring ═══
function rawVal(v){return v?.raw??v??null;}
function fmtBig(n){if(n==null||isNaN(n))return null;const a=Math.abs(Number(n));if(a>=1e12)return(n/1e12).toFixed(2)+'T';if(a>=1e9)return(n/1e9).toFixed(2)+'B';if(a>=1e6)return(n/1e6).toFixed(2)+'M';return String(n);}
function calcResearchScore(row){
  let fundamental=50,valuation=50,technical=50,event=50,sentiment=50,risk=50;
  if(row.revenueGrowth!=null)fundamental+=Math.max(-25,Math.min(25,row.revenueGrowth*100));
  if(row.grossMargins!=null)fundamental+=Math.max(-10,Math.min(15,(row.grossMargins-.35)*40));
  if(row.trailingPE!=null){valuation=row.trailingPE<0?30:row.trailingPE<18?72:row.trailingPE<35?58:row.trailingPE<60?42:28;}
  if(row.rsi!=null){technical=row.trend?.includes('上')?68:row.trend?.includes('下')?35:52;if(row.rsi>72)technical-=12;if(row.rsi<30)technical+=6;}
  if(row.earningsDays!=null){event=row.earningsDays>=0&&row.earningsDays<=7?72:row.earningsDays<=21?62:48;if(row.earningsDays<=3)risk+=12;}
  if(row.newsCount!=null){sentiment+=Math.min(18,row.newsCount*3);event+=Math.min(12,row.newsCount*2);}
  if(row.change!=null&&parseFloat(row.change)>2)sentiment+=8;
  if(row.change!=null&&parseFloat(row.change)<-2)sentiment-=8;
  if(row.change!=null){const ch=Math.abs(parseFloat(row.change));if(ch>5)risk+=18;else if(ch>2)risk+=8;}
  if(row.beta!=null&&row.beta>1.5)risk+=12;
  const clamp=n=>Math.max(1,Math.min(100,Math.round(n)));
  const overall=clamp(fundamental*.24+valuation*.16+technical*.20+event*.12+sentiment*.10+(100-risk)*.18);
  return{overall,fundamental:clamp(fundamental),valuation:clamp(valuation),technical:clamp(technical),event:clamp(event),sentiment:clamp(sentiment),risk:clamp(risk)};
}

ipcMain.handle('company-research',async(_,{key,model,lang,symbol,marketData})=>{
  try{
    if(!key)return{error:'APIキー未設定'};
    if(!symbol)return{error:'銘柄コードを入力してください'};
    const type=inferAIType(key,model),li=lang==='zh'?'中文回答。':lang==='ja'?'日本語で回答。':'Reply in English.';
    const data={symbol,marketData:marketData||{}};
    try{
      const qs=await fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=assetProfile,financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistoryQuarterly,cashflowStatementHistoryQuarterly,calendarEvents,earningsTrend`,{headers:UA});
      const r=qs?.quoteSummary?.result?.[0]||{};
      const ap=r.assetProfile||{},fd=r.financialData||{},ks=r.defaultKeyStatistics||{},sd=r.summaryDetail||{};
      data.profile={name:ap.longBusinessSummary?null:symbol,sector:ap.sector,industry:ap.industry,employees:ap.fullTimeEmployees,summary:ap.longBusinessSummary};
      data.metrics={price:marketData?.price,revenueGrowth:rawVal(fd.revenueGrowth),grossMargins:rawVal(fd.grossMargins),operatingMargins:rawVal(fd.operatingMargins),profitMargins:rawVal(fd.profitMargins),totalRevenue:rawVal(fd.totalRevenue),freeCashflow:rawVal(fd.freeCashflow),totalCash:rawVal(fd.totalCash),totalDebt:rawVal(fd.totalDebt),trailingPE:rawVal(sd.trailingPE)||rawVal(ks.trailingPE),forwardPE:rawVal(sd.forwardPE)||rawVal(ks.forwardPE),marketCap:rawVal(sd.marketCap),beta:rawVal(ks.beta)};
      data.earningsDate=rawVal(r.calendarEvents?.earnings?.earningsDate?.[0])?new Date(rawVal(r.calendarEvents.earnings.earningsDate[0])*1000).toISOString().slice(0,10):null;
      data.quarterlyIncome=(r.incomeStatementHistoryQuarterly?.incomeStatementHistory||[]).slice(0,4).map(q=>({end:q.endDate?.fmt,revenue:fmtBig(rawVal(q.totalRevenue)),grossProfit:fmtBig(rawVal(q.grossProfit)),netIncome:fmtBig(rawVal(q.netIncome))}));
      data.quarterlyCashflow=(r.cashflowStatementHistoryQuarterly?.cashflowStatements||[]).slice(0,4).map(q=>({end:q.endDate?.fmt,operatingCashflow:fmtBig(rawVal(q.totalCashFromOperatingActivities)),capex:fmtBig(rawVal(q.capitalExpenditures))}));
    }catch(e){data.fetchWarning=e.message;}
    const prompt=`${li}你是股票研究助手，不提供买卖建议。请把下面数据整理成普通投资者能看懂的研究报告，必须包含：公司做什么、最新财务表现、收入/利润/毛利率/现金流变化、估值观察、市场关注点、未来3个机会、未来3个风险、下一季度重点看什么、适合长期跟踪还是短线事件观察。最后加一句“不构成投资建议”。\n\n数据:\n${JSON.stringify(data)}`;
    const text=await callAI(type,key,model||'gemini-2.5-flash',[{role:'user',content:prompt}],true);
    return{ok:true,text,data};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('news-brief',async(_,{key,model,lang,symbol})=>{
  try{
    if(!key)return{error:'APIキー未設定'};
    const type=inferAIType(key,model),li=lang==='zh'?'中文回答。':lang==='ja'?'日本語で回答。':'Reply in English.';
    const s=await fetchR(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=1`,{headers:UA});
    const news=(s?.news||[]).slice(0,8).map(n=>({title:n.title,publisher:n.publisher,providerPublishTime:n.providerPublishTime?new Date(n.providerPublishTime*1000).toISOString():null,link:n.link}));
    const prompt=`${li}请解释这些新闻可能如何影响 ${symbol}。不要给买卖建议。输出：今日最重要的3条、为什么影响股价、是短期噪音还是长期变量、需要继续关注什么、风险提醒。\n\n新闻:\n${JSON.stringify(news)}`;
    const text=await callAI(type,key,model||'gemini-2.5-flash',[{role:'user',content:prompt}],true);
    return{ok:true,text,news};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('trade-review',async(_,{key,model,lang,tradeText,screenshot})=>{
  try{
    if(!key)return{error:'APIキー未設定'};
    if(!tradeText&&!screenshot)return{error:'请输入交易记录或上传截图'};
    const type=inferAIType(key,model),li=lang==='zh'?'中文回答。':lang==='ja'?'日本語で回答。':'Reply in English.';
    const content=[];if(screenshot)content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});content.push({type:'text',text:tradeText||''});
    const text=await callAI(type,key,model||'gemini-2.5-flash',[
      {role:'system',content:`交易复盘教练。${li}不评价用户人格，不给下一笔具体买卖建议。聚焦纪律、计划、情绪、风险管理、复盘清单。`},
      {role:'user',content}
    ],false);
    return{ok:true,text};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('score-watchlist',async(_,{symbols})=>{
  const rows=[];
  for(const sym of (symbols||[]).slice(0,20)){
    try{
      const md={};
      const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`,{headers:UA});
      const res=yf?.chart?.result?.[0],meta=res?.meta,q=res?.indicators?.quote?.[0],ts=res?.timestamp;
      const ohlcv=ts&&q?ts.map((t,i)=>({d:new Date(t*1000).toISOString().slice(0,10),h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]})).filter(d=>d.c!=null).slice(-60):[];
      const tech=ohlcv.length>20?calcTech(ohlcv):{};
      md.price=meta?.regularMarketPrice;md.change=meta?.regularMarketPrice&&meta?.chartPreviousClose?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null;md.rsi=tech?.rsi?parseFloat(tech.rsi):null;md.trend=tech?.trend;
      try{const qs=await fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=financialData,summaryDetail,defaultKeyStatistics,calendarEvents`,{headers:UA});const r=qs?.quoteSummary?.result?.[0]||{};md.revenueGrowth=rawVal(r.financialData?.revenueGrowth);md.grossMargins=rawVal(r.financialData?.grossMargins);md.trailingPE=rawVal(r.summaryDetail?.trailingPE)||rawVal(r.defaultKeyStatistics?.trailingPE);md.beta=rawVal(r.defaultKeyStatistics?.beta);const er=rawVal(r.calendarEvents?.earnings?.earningsDate?.[0]);if(er)md.earningsDays=Math.round((er*1000-Date.now())/86400000);}catch(e){}
      try{const ns=await fetchR(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=5&quotesCount=0`,{headers:UA});md.newsCount=(ns?.news||[]).length;}catch(e){}
      rows.push({symbol:sym,...md,score:calcResearchScore(md)});
    }catch(e){rows.push({symbol:sym,error:e.message});}
  }
  return{ok:true,rows};
});

ipcMain.handle('watchlist-daily-brief',async(_,{key,model,lang,watchlist})=>{
  try{
    if(!key)return{error:'APIキー未設定'};
    const symbols=(watchlist||[]).map(w=>String(w.symbol||'').toUpperCase()).filter(Boolean).slice(0,15);
    if(!symbols.length)return{error:'自选股为空'};
    const rows=[];
    for(const sym of symbols){
      const row={symbol:sym};
      try{
        const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`,{headers:UA});
        const res=yf?.chart?.result?.[0],meta=res?.meta,q=res?.indicators?.quote?.[0],ts=res?.timestamp;
        const ohlcv=ts&&q?ts.map((t,i)=>({d:new Date(t*1000).toISOString().slice(0,10),h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]})).filter(d=>d.c!=null).slice(-60):[];
        const tech=ohlcv.length>20?calcTech(ohlcv):{};
        row.price=meta?.regularMarketPrice;row.change=meta?.regularMarketPrice&&meta?.chartPreviousClose?((meta.regularMarketPrice-meta.chartPreviousClose)/meta.chartPreviousClose*100).toFixed(2):null;row.rsi=tech?.rsi;row.trend=tech?.trend;row.support=tech?.support;row.resistance=tech?.resistance;
      }catch(e){row.priceError=e.message;}
      try{
        const q=await fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents,financialData,summaryDetail`,{headers:UA});
        const r=q?.quoteSummary?.result?.[0]||{},er=rawVal(r.calendarEvents?.earnings?.earningsDate?.[0]);
        if(er){row.earningsDate=new Date(er*1000).toISOString().slice(0,10);row.earningsDays=Math.round((er*1000-Date.now())/86400000);}
        row.revenueGrowth=rawVal(r.financialData?.revenueGrowth);row.grossMargins=rawVal(r.financialData?.grossMargins);row.trailingPE=rawVal(r.summaryDetail?.trailingPE);
      }catch(e){}
      try{
        const ns=await fetchR(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=4&quotesCount=0`,{headers:UA});
        row.news=(ns?.news||[]).slice(0,4).map(n=>({title:n.title,publisher:n.publisher,time:n.providerPublishTime?new Date(n.providerPublishTime*1000).toISOString().slice(0,10):null}));
        row.newsCount=row.news.length;
      }catch(e){row.news=[];}
      row.score=calcResearchScore(row);
      rows.push(row);
    }
    const type=inferAIType(key,model),li=lang==='zh'?'中文回答。':lang==='ja'?'日本語で回答。':'Reply in English.';
    const prompt=`${li}你是股票研究助手。请基于下面自选股数据生成“每日研究首页”。不要给买卖建议。只返回 JSON：
{"marketMood":"一句话市场/组合情绪","topFocus":["今天最值得关注的3只股票代码"],"items":[{"symbol":"","oneLine":"今天为什么涨/跌或为什么值得关注","risk":"当前最大风险","next":"下一件需要关注的事","tone":"BULLISH|BEARISH|NEUTRAL|WATCH","urgency":1}],"warnings":["组合层面的风险提醒"]}

数据:
${JSON.stringify(rows)}`;
    const raw=await callAI(type,key,model||'gemini-2.5-flash',[{role:'user',content:prompt}],true);
    let parsed=null;try{parsed=parseJSON(raw);if(parsed.parseError)parsed=null;}catch(e){}
    return{ok:true,data:parsed||{marketMood:raw,items:[],warnings:[]},rows};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('read-clipboard',()=>clipboard.readText());
ipcMain.handle('open-external',(_,url)=>shell.openExternal(url));
ipcMain.handle('install-update',()=>autoUpdater.quitAndInstall());

// ═══ CLI Auth Detection (Claude Code / Codex) ═══
function findBin(name){
  const paths=[
    path.join(os.homedir(),'.local/bin',name),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    path.join(os.homedir(),'.cargo/bin',name),
    path.join(os.homedir(),'.npm-global/bin',name)
  ];
  for(const p of paths){if(fs.existsSync(p))return p;}
  // Try PATH-based which
  try{
    const r=require('child_process').execSync(`which ${name}`,{encoding:'utf8',timeout:1500}).trim();
    if(r&&fs.existsSync(r))return r;
  }catch(e){}
  return null;
}

function readCodexAuth(){
  const f=path.join(os.homedir(),'.codex/auth.json');
  if(!fs.existsSync(f))return null;
  try{
    const j=JSON.parse(fs.readFileSync(f,'utf8'));
    return j.OPENAI_API_KEY||j.openai_api_key||j.api_key||j.tokens?.access_token||null;
  }catch(e){return null;}
}

ipcMain.handle('detect-cli-auth',()=>{
  const claudeBin=findBin('claude');
  const codexBin=findBin('codex');
  const codexKey=readCodexAuth();
  return{
    claude:{available:!!claudeBin,path:claudeBin},
    codex:{available:!!codexBin||!!codexKey,path:codexBin,hasAuth:!!codexKey}
  };
});

// Run Claude Code as subprocess for text-only AI calls
async function callClaudeCLI({prompt,systemPrompt,model='sonnet'}){
  return new Promise((resolve,reject)=>{
    const claudeBin=findBin('claude');
    if(!claudeBin)return reject(new Error('Claude Code CLI が見つかりません'));
    const args=['--print','--output-format','text','--model',model];
    if(systemPrompt)args.push('--append-system-prompt',systemPrompt);
    args.push(prompt);
    const proc=spawn(claudeBin,args,{env:{...process.env},timeout:120000});
    let out='',err='';
    proc.stdout.on('data',d=>out+=d.toString());
    proc.stderr.on('data',d=>err+=d.toString());
    proc.on('close',code=>{
      if(code===0)resolve(out.trim());
      else reject(new Error(err.trim()||`claude CLI exit ${code}`));
    });
    proc.on('error',e=>reject(e));
  });
}

ipcMain.handle('cli-ai',async(_,{provider,prompt,systemPrompt,model})=>{
  try{
    if(provider==='claude-cli'){
      const text=await callClaudeCLI({prompt,systemPrompt,model:model||'sonnet'});
      return{ok:true,text};
    }
    if(provider==='codex-cli'){
      const key=readCodexAuth();
      if(!key)return{error:'Codex auth.json が見つかりません'};
      return{ok:true,key,model:model||'gpt-4.1'};
    }
    return{error:'Unknown provider'};
  }catch(e){return{error:e.message};}
});

// ═══════════════════════════════════════════════════════════
// ALPACA PAPER TRADING BOT
// ═══════════════════════════════════════════════════════════
const ALPACA_PAPER='https://paper-api.alpaca.markets';
const BOT_CFG_FILE=path.join(DATA_DIR,'bot-config.json');
const BOT_PORTFOLIO_FILE=path.join(DATA_DIR,'bot-portfolio-history.json');
let botTimer=null,botRunning=false,botLogs=[];
let alpacaWs=null,alpacaWsReady=false,scalpBarCache={};
let botLang='zh'; // UI言語と同期（bot-set-lang IPCで更新）
const BL=(zh,ja,en)=>botLang==='ja'?ja:botLang==='en'?(en||zh):zh;
const ALPACA_STREAM='wss://stream.data.alpaca.markets/v2/iex';
const ALPACA_DATA='https://data.alpaca.markets';

function loadPortfolioHistory(){try{return JSON.parse(fs.readFileSync(BOT_PORTFOLIO_FILE,'utf8'));}catch(e){return[];}}
function savePortfolioSnapshot(value){
  ensureDir();
  const history=loadPortfolioHistory();
  history.push({time:new Date().toISOString(),value:parseFloat(value)});
  // Keep last 2000 snapshots (≈ 2000 cycles)
  if(history.length>2000)history.splice(0,history.length-2000);
  fs.writeFileSync(BOT_PORTFOLIO_FILE,JSON.stringify(history));
}

function loadBotConfig(){
  try{
    const cfg=JSON.parse(fs.readFileSync(BOT_CFG_FILE,'utf8'));
    // 旧設定への後方互換（新フィールドのデフォルト値を補完）
    if(cfg.maxConcurrentPositions==null)cfg.maxConcurrentPositions=3;
    if(cfg.limitSlippagePct==null)cfg.limitSlippagePct=0.1;
    if(cfg.useBracketOrders==null)cfg.useBracketOrders=true;
    return cfg;
  }catch(e){return{watchlist:['NVDA','AAPL','MSFT','TSLA','AMZN'],maxPositionUSD:500,stopLossPercent:3,takeProfitPercent:8,intervalMinutes:15,buyRSI:35,sellRSI:65,scalpMode:false,scalpStopPct:0.5,scalpProfitPct:1.5,maxConcurrentPositions:3,limitSlippagePct:0.1,useBracketOrders:true};}
}
function saveBotConfig(cfg){ensureDir();fs.writeFileSync(BOT_CFG_FILE,JSON.stringify(cfg,null,2));}

function botLog(msg,type='info'){
  const entry={time:new Date().toISOString(),msg,type};
  botLogs.unshift(entry);
  if(botLogs.length>150)botLogs=botLogs.slice(0,150);
  send('bot-update',{type:'log',entry});
}

// ─── Bracket（OCO）注文ヘルパー: 指値買い + サーバー側 SL/TP 自動設置 ───
async function placeBracketBuy(keyId,secret,sym,qty,currentPrice,slPct,tpPct,slippageBufferPct=0.1){
  const buf=slippageBufferPct/100;
  // 指値: 現在価格 + バッファ（スリッページ吸収）
  const limitPx=+(currentPrice*(1+buf)).toFixed(2);
  // TP: 約定想定価格より +tpPct%
  const tpPx=+(limitPx*(1+tpPct/100)).toFixed(2);
  // SL: 約定想定価格より -slPct%
  const slPx=+(limitPx*(1-slPct/100)).toFixed(2);
  const body={
    symbol:sym,qty:String(qty),side:'buy',type:'limit',
    limit_price:String(limitPx),time_in_force:'day',
    order_class:'bracket',
    take_profit:{limit_price:String(tpPx)},
    stop_loss:{stop_price:String(slPx)}
  };
  return await alpacaFetch(keyId,secret,'POST','/v2/orders',body);
}

// ─── ポジション安全クローズ: 子注文（SL/TP）を全部キャンセルしてから決済 ───
async function closePositionSafely(keyId,secret,sym){
  try{
    const orders=await alpacaFetch(keyId,secret,'GET',`/v2/orders?status=open&symbols=${sym}&limit=50`);
    for(const o of (Array.isArray(orders)?orders:[])){
      try{await alpacaFetch(keyId,secret,'DELETE',`/v2/orders/${o.id}`);}catch(e){}
    }
  }catch(e){}
  // 50ms待ってからクローズ（キャンセル処理が反映されるまで）
  await new Promise(r=>setTimeout(r,80));
  return await alpacaFetch(keyId,secret,'DELETE',`/v2/positions/${sym}`);
}

async function alpacaFetch(keyId,secret,method,endpoint,body=null){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),14000);
  const opts={method,headers:{'APCA-API-KEY-ID':keyId,'APCA-API-SECRET-KEY':secret,'Content-Type':'application/json'},signal:ctrl.signal};
  if(body)opts.body=JSON.stringify(body);
  try{
    const r=await fetch(`${ALPACA_PAPER}${endpoint}`,opts);
    clearTimeout(timer);
    const text=await r.text();
    if(!r.ok){let msg=text;try{msg=JSON.parse(text).message||text;}catch(e){}throw new Error(`Alpaca ${r.status}: ${msg}`);}
    return JSON.parse(text);
  }catch(e){clearTimeout(timer);if(e.name==='AbortError')throw new Error('接続タイムアウト (14s)');throw e;}
}

function isMarketOpen(){
  const est=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  if(est.getDay()===0||est.getDay()===6)return false;
  const t=est.getHours()*60+est.getMinutes();
  return t>=570&&t<960; // 9:30-16:00 EST
}

// ── 高精度テクニカル指標（ボット専用） ──
function calcBotTech(ohlcv){
  const closes=ohlcv.map(d=>d.c);
  const n=closes.length;
  const ema=(arr,p)=>{const k=2/(p+1);let e=arr[0];for(let i=1;i<arr.length;i++)e=arr[i]*k+e*(1-k);return e;};
  const calcRSI=arr=>{let g=0,l=0;for(let i=Math.max(1,arr.length-14);i<arr.length;i++){const d=arr[i]-arr[i-1];if(d>0)g+=d;else l-=d;}return l===0?100:100-100/(1+(g/l));};
  // RSI today vs yesterday → 反発確認
  const rsiToday=calcRSI(closes);
  const rsiYest=calcRSI(closes.slice(0,-1));
  const rsiRising=rsiToday>rsiYest;
  // MACD series + signal line でゴールデンクロス検出
  const macdSeries=[];
  for(let i=Math.max(27,n-12);i<=n;i++){
    const sl=closes.slice(0,i);
    macdSeries.push(ema(sl,12)-ema(sl,26));
  }
  const sigSeries=[];
  for(let i=8;i<macdSeries.length;i++)sigSeries.push(ema(macdSeries.slice(0,i+1),9));
  const mLen=macdSeries.length,sLen=sigSeries.length;
  const macdNow=macdSeries[mLen-1]||0,macdPrev=macdSeries[mLen-2]||0;
  const sigNow=sigSeries[sLen-1]||0,sigPrev=sigSeries[sLen-2]||sigNow;
  // ゴールデンクロス：今日または直近2日以内にMACD>Signal
  const macdCross=(macdNow>sigNow)&&(macdPrev<=sigPrev||macdSeries[mLen-3]<=(sigSeries[sLen-3]||sigPrev));
  const macdAboveSignal=macdNow>sigNow;
  return{rsiToday,rsiYest,rsiRising,macdCross,macdAboveSignal,macdNow,sigNow};
}

// 決算日チェック（7日以内なら true）
async function isEarningsSoon(sym){
  try{
    const r=await fetchR(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents`,{headers:UA});
    const dates=r?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate||[];
    if(!dates.length)return false;
    const next=new Date(dates[0].raw*1000);
    const diffDays=(next-Date.now())/(1000*60*60*24);
    return diffDays>=0&&diffDays<=7;
  }catch(e){return false;}
}

// ── Alpaca WebSocket リアルタイムバーストリーム ──

// 初回起動時: Alpaca REST で過去100本の1分足を取得してキャッシュに詰める
async function prefillBarCache(keyId,secret,symbols){
  try{
    botLog(BL('📦 正在获取初始Bar数据…','📦 Alpaca REST で初期バーデータ取得中…','📦 Fetching initial bar data…'),'info');
    const syms=symbols.join(','); // コンマをエンコードしない（APIの仕様）
    const url=`${ALPACA_DATA}/v2/stocks/bars?symbols=${syms}&timeframe=1Min&limit=100&feed=iex&sort=asc`;
    const r=await fetch(url,{headers:{'APCA-API-KEY-ID':keyId,'APCA-API-SECRET-KEY':secret},timeout:15000});
    if(!r.ok){
      const txt=await r.text().catch(()=>'');
      botLog(`⚠ ${BL("Bar初始化失败","バー初期化失敗","Bar init failed")} HTTP ${r.status}: ${txt.slice(0,80)}`,'warn');return;
    }
    const data=await r.json();
    if(data.bars&&Object.keys(data.bars).length){
      for(const [sym,bars] of Object.entries(data.bars)){
        scalpBarCache[sym]=(bars||[]).map(b=>({t:b.t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v}));
      }
      const counts=Object.entries(scalpBarCache).map(([s,b])=>`${s}:${b.length}本`).join(' ');
      botLog(`✅ ${BL("Bar缓存初始化完成","バーキャッシュ初期化完了","Bar cache ready")} — ${counts}`,'info');
    }else{
      botLog(BL('⚠ 暂无Bar数据（可能在休市时段 — WS连接后开始积累）','⚠ バーデータなし（市場時間外の可能性あり）','⚠ No bar data (market may be closed — will accumulate after WS connects)'),'warn');
    }
  }catch(e){botLog(BL('⚠ Bar缓存初始化失败: ','⚠ バーキャッシュ初期化失敗: ','⚠ Bar cache init failed: ')+e.message,'warn');}
}

// WebSocket 接続・認証・購読
function connectAlpacaStream(keyId,secret,symbols){
  if(alpacaWs){try{alpacaWs.terminate();}catch(e){}alpacaWs=null;}
  alpacaWsReady=false;
  botLog(BL('🔌 正在连接 Alpaca WebSocket…','🔌 Alpaca WebSocket 接続中…','🔌 Connecting to Alpaca WebSocket…'),'info');
  try{
    const ws=new AlpacaWS(ALPACA_STREAM);
    alpacaWs=ws;
    ws.on('open',()=>{
      // 接続直後に認証送信（1回のみ）
      ws.send(JSON.stringify({action:'auth',key:keyId,secret}));
    });
    ws.on('message',(raw)=>{
      try{
        const msgs=JSON.parse(raw.toString());
        for(const m of (Array.isArray(msgs)?msgs:[msgs])){
          // 'connected' は無視（authはopen時に送信済み）
          if(m.T==='success'&&m.msg==='authenticated'){
            botLog(BL('🔑 Alpaca WS 认证成功 — 开始订阅1分钟Bar','🔑 Alpaca WS 認証成功 — 1分足バー購読開始','🔑 Alpaca WS authenticated — subscribing to 1-min bars'),'info');
            ws.send(JSON.stringify({action:'subscribe',bars:symbols}));
          }else if(m.T==='subscription'){
            alpacaWsReady=true;
            const subs=m.bars||[];
            botLog(`📡 ${BL("实时接收Bar数据","リアルタイムバー受信中","Receiving real-time bars")}: [${subs.join(', ')}]`,'info');
            send('bot-update',{type:'ws-status',connected:true,symbols:subs});
          }else if(m.T==='b'){
            // 1分足バー受信 → キャッシュに追記
            const sym=m.S;
            if(!scalpBarCache[sym])scalpBarCache[sym]=[];
            scalpBarCache[sym].push({t:m.t,o:m.o,h:m.h,l:m.l,c:m.c,v:m.v});
            if(scalpBarCache[sym].length>300)scalpBarCache[sym]=scalpBarCache[sym].slice(-300);
          }else if(m.T==='error'){
            botLog(`⚠ Alpaca WS ${BL("错误","エラー","error")} [${m.code}]: ${m.msg}`,'warn');
            send('bot-update',{type:'ws-status',connected:false});
          }
        }
      }catch(e){}
    });
    ws.on('error',(e)=>{
      alpacaWsReady=false;
      botLog(BL('❌ Alpaca WS 错误: ','❌ Alpaca WS エラー: ','❌ Alpaca WS error: ')+e.message,'error');
      send('bot-update',{type:'ws-status',connected:false});
    });
    ws.on('close',()=>{
      alpacaWsReady=false;
      send('bot-update',{type:'ws-status',connected:false});
      if(botRunning&&loadBotConfig().scalpMode){
        botLog(BL('🔄 Alpaca WS 断开 — 8秒后自动重连…','🔄 Alpaca WS 切断 — 8秒後に自動再接続…','🔄 Alpaca WS disconnected — reconnecting in 8s…'),'warn');
        setTimeout(()=>{if(botRunning&&loadBotConfig().scalpMode)connectAlpacaStream(keyId,secret,symbols);},8000);
      }
    });
  }catch(e){botLog(BL('❌ Alpaca WS 连接失败: ','❌ Alpaca WS 接続失敗: ','❌ Alpaca WS connection failed: ')+e.message,'error');}
}

function disconnectAlpacaStream(){
  if(alpacaWs){try{alpacaWs.terminate();}catch(e){}alpacaWs=null;}
  alpacaWsReady=false;
  scalpBarCache={};
}

// ── スキャルピングモード（1分足リアルタイム、高頻度）──
async function runScalpCycle(keyId,secret,cfg){
  botLog(BL('⚡ 开始高频刷单周期','⚡ スキャルプサイクル開始','⚡ Scalp cycle started'),'info');
  send('bot-update',{type:'cycle-start'});

  // アカウント&ポジション取得
  let account,positions;
  try{
    [account,positions]=await Promise.all([
      alpacaFetch(keyId,secret,'GET','/v2/account'),
      alpacaFetch(keyId,secret,'GET','/v2/positions'),
    ]);
  }catch(e){botLog(BL('❌ Alpaca连接失败: ','❌ Alpaca接続エラー: ','❌ Alpaca error: ')+e.message,'error');send('bot-update',{type:'cycle-end'});return;}
  let buyingPower=parseFloat(account.buying_power);
  const posMap={};for(const p of positions)posMap[p.symbol]=p;
  send('bot-update',{type:'account',account,positions});
  try{savePortfolioSnapshot(account.portfolio_value||account.equity||0);}catch(e){}

  // 市場ヘルスチェック（Alpaca REST で S&P500 スナップショット）
  let spOk=true;
  try{
    const spSnap=await fetch(`${ALPACA_DATA}/v2/stocks/bars?symbols=SPY&timeframe=1Min&limit=10&feed=iex&sort=asc`,
      {headers:{'APCA-API-KEY-ID':keyId,'APCA-API-SECRET-KEY':secret},timeout:8000});
    const spData=await spSnap.json();
    const spBars=(spData?.bars?.SPY||[]).map(b=>b.c).filter(c=>c!=null);
    if(spBars.length>=5){
      const last=spBars[spBars.length-1];
      const avg5=spBars.slice(-6,-1).reduce((a,b)=>a+b,0)/5;
      spOk=last>=avg5*0.997;
      botLog(`📊 SPY 1m: $${last?.toFixed(2)} vs avg $${avg5?.toFixed(2)} — ${spOk?'OK ✓':'${BL("急跌⚠","急落⚠","drop⚠")}'}`,'info');
    }
  }catch(e){botLog(BL('⚠ SPY获取失败，继续','⚠ SPY取得失敗、継続','⚠ SPY fetch failed, continuing'),'warn');}

  // ── 出口判断（スキャルプSL/TP）バーキャッシュの最新終値を優先使用 ──
  for(const sym of cfg.watchlist){
    const pos=posMap[sym];if(!pos)continue;
    const avgCost=parseFloat(pos.avg_entry_price)||0;
    // Alpacaポジションの current_price はリアルタイム。バーキャッシュの最新終値でさらに精度UP
    const barPrice=scalpBarCache[sym]?.length?scalpBarCache[sym][scalpBarCache[sym].length-1].c:null;
    const curPrice=barPrice||parseFloat(pos.current_price)||parseFloat(pos.lastday_price)||avgCost;
    if(!avgCost)continue;
    const pnlPct=((curPrice-avgCost)/avgCost)*100;
    const sl=-(cfg.scalpStopPct||0.5);
    const tp=cfg.scalpProfitPct||1.5;
    if(pnlPct<=sl){
      botLog(`🛑 ${sym} ${BL('刷单止损','スキャルプSL','Scalp SL')} ${pnlPct.toFixed(2)}% → ${BL('卖出','売却','sell')}`,'sell');
      try{await closePositionSafely(keyId,secret,sym);}catch(e){botLog(`❌ ${sym} ${BL('止损卖出失败','SL売却失敗','SL sell failed')}: ${e.message}`,'error');}
    }else if(pnlPct>=tp){
      botLog(`💰 ${sym} ${BL('刷单止盈','スキャルプTP','Scalp TP')} +${pnlPct.toFixed(2)}% → ${BL('平仓','利確','close')}`,'sell');
      try{await closePositionSafely(keyId,secret,sym);}catch(e){botLog(`❌ ${sym} ${BL('止盈平仓失败','TP売却失敗','TP close failed')}: ${e.message}`,'error');}
    }else{
      botLog(`✋ ${sym} HOLD P&L:${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}% (SL:${sl}% / TP:+${tp}%)`,'hold');
    }
  }

  if(!spOk){
    botLog(BL('⚠ 标普500急跌 — 停止新建仓位','⚠ S&P500急落中 — 新規エントリー停止','⚠ S&P500 dropping — halting new entries'),'warn');
    botLog(BL('✅ 高频周期完成','✅ スキャルプサイクル完了','✅ Scalp cycle complete'),'info');send('bot-update',{type:'cycle-end'});return;
  }
  if(buyingPower<50){
    botLog(BL('⚠ 可用资金不足（$50以下）— 跳过','⚠ 購入力不足 ($50未満) — スキップ','⚠ Insufficient buying power (<$50) — skipping'),'warn');
    botLog(BL('✅ 高频周期完成','✅ スキャルプサイクル完了','✅ Scalp cycle complete'),'info');send('bot-update',{type:'cycle-end'});return;
  }
  // ── 同時保有制限チェック ──
  let openCount=positions.length;
  const maxPos=cfg.maxConcurrentPositions||3;
  if(openCount>=maxPos){
    botLog(`⚠ ${BL('持仓已达上限','ポジション上限','Max positions reached')} (${openCount}/${maxPos}) — ${BL('停止新建仓','新規停止','no new entries')}`,'warn');
    botLog(BL('✅ 高频周期完成','✅ スキャルプサイクル完了','✅ Scalp cycle complete'),'info');send('bot-update',{type:'cycle-end'});return;
  }

  // ── エントリースコアリング（全銘柄、Alpaca 1分足リアルタイム）──
  const ema=(arr,p)=>{const k=2/(p+1);let e=arr[0];for(let i=1;i<arr.length;i++)e=arr[i]*k+e*(1-k);return e;};

  // WSキャッシュが薄い銘柄はAlpaca RESTで補充
  for(const sym of cfg.watchlist){
    if(!scalpBarCache[sym]||scalpBarCache[sym].length<20){
      try{
        const r=await fetch(`${ALPACA_DATA}/v2/stocks/bars?symbols=${sym}&timeframe=1Min&limit=100&feed=iex&sort=asc`,
          {headers:{'APCA-API-KEY-ID':keyId,'APCA-API-SECRET-KEY':secret},timeout:10000});
        const d=await r.json();
        const b=d?.bars?.[sym]||[];
        if(b.length){scalpBarCache[sym]=b.map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v}));
          botLog(`📦 ${sym} ${BL('REST补充','REST補充','REST filled')} ${b.length}${BL('根','本','bars')}`,'info');}
      }catch(e){botLog(`⚠ ${sym} ${BL('REST补充失败','REST補充失敗','REST fill failed')}: ${e.message}`,'warn');}
      await new Promise(r=>setTimeout(r,200));
    }
  }

  for(const sym of cfg.watchlist){
    try{
      const bars=scalpBarCache[sym];
      if(!bars||bars.length<20){botLog(`⏳ ${sym} ${BL('数据积累中','バーデータ蓄積中','accumulating bars')} (${(bars||[]).length}/20)`,'info');continue;}
      const price=bars[bars.length-1].c; // 最新1分足終値
      if(!price)continue;
      const closes=bars.map(b=>b.c);
      const vols=bars.map(b=>b.v||0);
      const n=closes.length;

      // RSI (14期間、5分足)
      let g=0,l=0;
      for(let i=Math.max(1,n-14);i<n;i++){const d=closes[i]-closes[i-1];if(d>0)g+=d;else l-=d;}
      const rsi5m=l===0?100:100-100/(1+(g/l));

      // MACD (12/26/9、5分足)
      const macd5m=ema(closes,12)-ema(closes,26);

      // 出来高比率（直近1本 vs 20本平均）
      const avgVol20=vols.slice(-21,-1).reduce((a,b)=>a+b,0)/20||1;
      const volRatio=vols[n-1]/avgVol20;

      // ボリンジャーバンド% (20期間)
      const sma20=closes.slice(-20).reduce((a,b)=>a+b,0)/20;
      const std20=Math.sqrt(closes.slice(-20).map(c=>(c-sma20)**2).reduce((a,b)=>a+b,0)/20);
      const bbU=sma20+2*std20,bbL=sma20-2*std20;
      const bbPct5m=std20>0?((price-bbL)/(bbU-bbL))*100:50;

      // モメンタム（直近3本が上昇）
      const momentum=n>=3&&closes[n-1]>closes[n-2]&&closes[n-2]>closes[n-3];

      // ── 5指標スコアリング（3/5以上でエントリー）──
      let score=0;const reasons=[];
      if(rsi5m<45){score++;reasons.push(`RSI${rsi5m.toFixed(0)}`);}         // ①RSI売られすぎ
      if(macd5m>0){score++;reasons.push('MACD+');}                           // ②MACD強気
      if(volRatio>=1.2){score++;reasons.push(`Vol${volRatio.toFixed(1)}x`);} // ③出来高急増
      if(bbPct5m<45){score++;reasons.push(`BB${bbPct5m.toFixed(0)}%`);}      // ④BB下限付近
      if(momentum){score++;reasons.push('MOM↑');}                            // ⑤モメンタム上昇

      botLog(`⚡ ${sym} ${score}/5 [${reasons.join(' ')}] RSI:${rsi5m.toFixed(1)} $${price.toFixed(2)}`,'info');

      if(score>=3){
        // 同時保有制限チェック（毎エントリー前）
        if(openCount>=maxPos){
          botLog(`⚠ ${BL('持仓已达上限','ポジション上限','Max positions')} (${openCount}/${maxPos}) — ${BL('跳过','スキップ','skip')} ${sym}`,'warn');
          break;
        }
        // 既保有の銘柄は再エントリーしない（同銘柄ナンピン回避）
        if(posMap[sym]){continue;}
        // 購入力の最大30%ずつ分散投資
        const orderAmt=Math.min(cfg.maxPositionUSD,Math.max(0,buyingPower*0.3));
        const qty=Math.floor(orderAmt/price);
        if(qty<1){botLog(`⚠ ${sym} ${BL('资金不足','購入力不足','insufficient funds')} ($${price.toFixed(0)}×${qty})`,'warn');continue;}
        const slPct=cfg.scalpStopPct||0.5,tpPct=cfg.scalpProfitPct||1.5;
        const slipBuf=cfg.limitSlippagePct||0.1;
        botLog(`📈 ${sym} ${BL('高频买入','スキャルプBUY','SCALP BUY')} ${qty}${BL('股','株','sh')} ${BL('指值','指値','limit')}@$${(price*(1+slipBuf/100)).toFixed(2)} ${BL('评分','スコア','score')}${score}/5 — 🛡 SL:-${slPct}% TP:+${tpPct}% (OCO)`,'buy');
        try{
          await placeBracketBuy(keyId,secret,sym,qty,price,slPct,tpPct,slipBuf);
          buyingPower=Math.max(0,buyingPower-qty*price);
          openCount++;
        }catch(e){botLog(`❌ ${sym} ${BL("下单失败","注文失敗","order failed")}: ${e.message}`,'error');}
      }
    }catch(e){botLog(`❌ ${sym} ${BL('高频分析失败','スキャルプ分析失敗','scalp analysis failed')}: ${e.message}`,'error');}
  }

  botLog(BL('✅ 高频周期完成','✅ スキャルプサイクル完了','✅ Scalp cycle complete'),'info');
  send('bot-update',{type:'cycle-end'});
}

async function runBotCycle(keyId,secret){
  const cfg=loadBotConfig();
  if(!isMarketOpen()){botLog(BL('市场休市中 — 等待下个周期','市場クローズ中 — 次のサイクルまで待機','Market closed — waiting for next cycle'),'info');return;}
  if(cfg.scalpMode) return runScalpCycle(keyId,secret,cfg);
  botLog(BL('🔄 开始波段分析周期','🔄 スイング分析サイクル開始','🔄 Swing analysis cycle started'),'info');
  send('bot-update',{type:'cycle-start'});

  // ── Alpaca account & positions ──
  let account,positions;
  try{
    [account,positions]=await Promise.all([
      alpacaFetch(keyId,secret,'GET','/v2/account'),
      alpacaFetch(keyId,secret,'GET','/v2/positions'),
    ]);
  }catch(e){botLog(BL('❌ Alpaca连接失败: ','❌ Alpaca接続エラー: ','❌ Alpaca error: ')+e.message,'error');return;}
  const buyingPower=parseFloat(account.buying_power);
  const posMap={};for(const p of positions)posMap[p.symbol]=p;
  send('bot-update',{type:'account',account,positions});
  try{savePortfolioSnapshot(account.portfolio_value||account.equity||0);}catch(e){}

  // ── STEP 1: 市場フィルター（VIX + S&P500トレンド）──
  let marketOk=true,vixVal=0,spTrend='flat';
  try{
    const [spData,vixData]=await Promise.all([
      fetchR('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=10d',{headers:UA}),
      fetchR('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d',{headers:UA}),
    ]);
    const spC=spData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c=>c!=null)||[];
    if(spC.length>=5){const avg5=spC.slice(-5).reduce((a,b)=>a+b,0)/5;spTrend=spC[spC.length-1]>avg5?'up':'down';}
    vixVal=vixData?.chart?.result?.[0]?.meta?.regularMarketPrice||0;
    if(vixVal>40){marketOk=false;botLog(`⚠ VIX ${vixVal.toFixed(1)} > 40 — ${BL('极度恐慌，停止所有买入','極度の恐怖、全買い停止','extreme fear, halting all buys')}`,'warn');}
    else if(vixVal>30&&spTrend==='down'){marketOk=false;botLog(`⚠ S&P500↓ + VIX ${vixVal.toFixed(1)} — ${BL('市场恶化，停止买入','市場悪化、買い停止','market deteriorating, halting buys')}`,'warn');}
    else botLog(`📊 ${BL('市场过滤器OK','市場フィルターOK','Market filter OK')} — S&P500:${spTrend==='up'?'↑':'↓'} VIX:${vixVal.toFixed(1)}`,'info');
  }catch(e){botLog(BL('⚠ 市场过滤器获取失败，继续处理','⚠ 市場フィルター取得失敗、処理継続','⚠ Market filter fetch failed, continuing'),'warn');}

  // ── STEP 2: 各銘柄データ取得 ──
  const stockData={};
  for(const sym of cfg.watchlist){
    try{
      await new Promise(r=>setTimeout(r,500));
      const yf=await fetchR(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`,{headers:UA});
      const result=yf?.chart?.result?.[0];if(!result)continue;
      const q=result.indicators?.quote?.[0],ts=result.timestamp;
      const ohlcv=ts&&q?ts.map((t,i)=>({d:new Date(t*1000).toISOString().slice(0,10),h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]})).filter(d=>d.c!=null):[];
      if(ohlcv.length<20)continue;
      const tech=calcTech(ohlcv);
      const price=result.meta?.regularMarketPrice;
      if(!price||!tech)continue;
      stockData[sym]={price,tech,ohlcv};
    }catch(e){botLog(`❌ ${sym} ${BL('数据获取失败','データ取得失敗','data fetch failed')}: ${e.message}`,'error');}
  }

  // ── STEP 3: 保有ポジション 出口判断 ──
  for(const sym of cfg.watchlist){
    const pos=posMap[sym];if(!pos)continue;
    const d=stockData[sym];if(!d)continue;
    const {price,tech}=d;
    const rsi=parseFloat(tech.rsi),macdVal=parseFloat(tech.macd);
    const avgCost=parseFloat(pos.avg_entry_price);
    const pnlPct=((price-avgCost)/avgCost)*100;
    if(pnlPct<=-cfg.stopLossPercent){
      botLog(`🛑 ${sym} ${BL('止损','ストップロス','SL')} ${pnlPct.toFixed(1)}% → ${BL('全部卖出','全売却','close all')}`,'sell');
      try{await closePositionSafely(keyId,secret,sym);}catch(e){botLog(`❌ ${sym} ${BL('卖出失败','売却失敗','sell failed')}: ${e.message}`,'error');}
    }else if(pnlPct>=cfg.takeProfitPercent){
      botLog(`💰 ${sym} ${BL('止盈','利確','TP')} +${pnlPct.toFixed(1)}% → ${BL('全部卖出','全売却','close all')}`,'sell');
      try{await closePositionSafely(keyId,secret,sym);}catch(e){botLog(`❌ ${sym} ${BL("卖出失败","売却失敗","sell failed")}: ${e.message}`,'error');}
    }else if(rsi>cfg.sellRSI){
      botLog(`📉 ${sym} RSI${BL('卖出信号','売り','sell')} ${rsi.toFixed(1)} P&L:${pnlPct>=0?'+':''}${pnlPct.toFixed(1)}% → ${BL('卖出','売却','sell')}`,'sell');
      try{await closePositionSafely(keyId,secret,sym);}catch(e){botLog(`❌ ${sym} 卖出失败: ${e.message}`,'error');}
    }else{
      botLog(`✋ ${sym} HOLD RSI:${rsi.toFixed(1)} MACD:${macdVal.toFixed(3)} P&L:${pnlPct>=0?'+':''}${pnlPct.toFixed(1)}%`,'hold');
    }
  }

  // ── STEP 4: 買い候補 6指標スコアリング ──
  const swingMaxPos=cfg.maxConcurrentPositions||3;
  if(!marketOk){
    botLog(BL('📊 市场条件不佳 — 停止所有新建仓位','📊 市場条件不良 — 新規買い全停止','📊 Market conditions poor — halting all new buys'),'warn');
  }else if(positions.length>=swingMaxPos){
    botLog(`⚠ ${BL('持仓已达上限','ポジション上限','Max positions reached')} (${positions.length}/${swingMaxPos}) — ${BL('停止新建仓','新規停止','no new entries')}`,'warn');
  }else if(buyingPower<100){
    botLog(BL('⚠ 可用资金不足 — 跳过新建仓位','⚠ 購入力不足 — 新規買いスキップ','⚠ Insufficient buying power — skipping new buys'),'warn');
  }else{
    const candidates=[];
    for(const sym of cfg.watchlist){
      if(posMap[sym])continue; // 既保有
      const d=stockData[sym];if(!d)continue;
      const {price,tech,ohlcv}=d;
      const rsi=parseFloat(tech.rsi),macdVal=parseFloat(tech.macd);
      const bbPct=parseFloat(tech.bbPct)||50;
      const volRatio=parseFloat(tech.volRatio)||1;
      const closes=ohlcv.map(x=>x.c);
      const sma50=closes.length>=50?closes.slice(-50).reduce((a,b)=>a+b,0)/50:closes.slice(-20).reduce((a,b)=>a+b,0)/20;

      // ── 高精度テクニカル計算 ──
      const bt=calcBotTech(ohlcv);

      // ── 決算リスクチェック ──
      const earningsSoon=await isEarningsSoon(sym);
      await new Promise(r=>setTimeout(r,300));

      // ── 7指標スコアリング（85%+精度設計） ──
      let score=0;const reasons=[];
      // ①MACDゴールデンクロス（最重要シグナル）
      if(bt.macdCross){score++;reasons.push('MACD✕GC🔥');}
      // ②MACD > シグナルライン（強気継続）
      if(bt.macdAboveSignal){score++;reasons.push('MACD>SIG✓');}
      // ③RSI上昇（昨日より高い = 底打ち確認）
      if(bt.rsiRising){score++;reasons.push(`RSI↑(${bt.rsiYest.toFixed(0)}→${bt.rsiToday.toFixed(0)})`);}
      // ④出来高急増（1.5倍以上 = 機関投資家の買い）
      if(volRatio>=1.5){score++;reasons.push(`Vol${volRatio}x📊`);}
      // ⑤ボリンジャー深い下限（BB%<25 = 強い売られすぎ）
      if(bbPct<25){score++;reasons.push(`BB${bbPct}%🎯`);}
      // ⑥S&P500上昇トレンド（市場追い風）
      if(spTrend==='up'){score++;reasons.push('SP500↑✓');}
      // ⑦決算リスクなし（7日以内の決算を除外）
      if(!earningsSoon){score++;reasons.push('決算OK✓');}else{reasons.push('⚠決算近い');}

      botLog(`📊 ${sym} ${BL("评分","スコア","score")}${score}/7 [${reasons.join(' ')}] RSI:${rsi.toFixed(1)}`,'info');

      // RSI必須（< buyRSI）+ スコア5/7以上のみ候補（超厳選）
      if(rsi<cfg.buyRSI&&score>=5&&!earningsSoon){
        candidates.push({sym,score,rsi,macdVal,price,volRatio,bbPct,bt,reasons});
      }
    }

    if(!candidates.length){
      botLog(BL('⏳ 无买入信号 — 等待下个周期','⏳ 買いシグナルなし — 次サイクル待機','⏳ No buy signal — waiting for next cycle'),'wait');
    }else{
      // スコア高い順→RSI低い順でソート、上位1銘柄のみ
      candidates.sort((a,b)=>b.score-a.score||a.rsi-b.rsi);
      const best=candidates[0];
      botLog(`🎯 ${BL('最佳候选','最優秀候補','Best candidate')}: ${best.sym} ${BL('评分','スコア','score')}${best.score}/7 RSI:${best.rsi.toFixed(1)}`,'info');

      // ── STEP 5: AI最終確認（APIキーがあれば） ──
      let aiApproved=true;
      try{
        const ks=readKeyStore();
        const aiKey=decSecret(ks.gemini?.key)||decSecret(ks.claude?.key)||decSecret(ks.openai?.key)||'';
        const aiType=ks.gemini?.key?'gemini':ks.claude?.key?'claude':ks.openai?.key?'openai':null;
        const aiModel=aiType==='gemini'?(ks.gemini?.model||'gemini-2.5-flash'):aiType==='claude'?'claude-sonnet-4-20250514':'gpt-4o';
        if(aiKey&&aiType){
          botLog(`🤖 ${BL('AI 最终判断中','AI最終判断中','AI final check')}: ${best.sym} (${BL('评分','スコア','score')}${best.score}/7)...`,'info');
          const prompt=`【厳格な株式トレード判断】\n銘柄: ${best.sym} | 現在価格: $${best.price.toFixed(2)}\n\n【テクニカル指標】\nRSI: ${best.rsi.toFixed(1)} (売られすぎ, ${best.bt.rsiYest.toFixed(1)}→${best.bt.rsiToday.toFixed(1)} 上昇中)\nMACD: ${best.macdVal.toFixed(4)} | シグナル: ${best.bt.sigNow.toFixed(4)} | GCross: ${best.bt.macdCross}\nBB%: ${best.bbPct}% (下限付近) | 出来高比: ${best.volRatio}x\n総合スコア: ${best.score}/7 [${best.reasons.join(', ')}]\n\n【市場環境】\nS&P500: ${spTrend==='up'?'上昇':'下落'}トレンド | VIX: ${vixVal.toFixed(1)}\n\n【質問】この銘柄を今買うべきか？勝率85%以上の確信がある場合のみBUYを返してください。\n\nJSON形式のみで回答: {"decision":"BUY"または"SKIP","confidence":0から100の整数,"reason":"25文字以内の理由"}`;
          const aiResp=await callAI(aiType,aiKey,aiModel,[
            {role:'system',content:'あなたは機関投資家レベルの株式リスク管理AIです。勝率85%以上の確信がある場合のみBUYを返します。少しでも不確実性があればSKIPです。JSONのみ返答。'},
            {role:'user',content:prompt}
          ]);
          try{
            const json=JSON.parse(aiResp.match(/\{[\s\S]*?\}/)?.[0]||'{}');
            const conf=parseInt(json.confidence)||0;
            if(json.decision==='SKIP'||conf<72){
              aiApproved=false;
              botLog(`🤖 AI: ${BL('跳过','SKIP','SKIP')} (${BL('置信度','確信度','confidence')}${conf}%/72%) — ${json.reason||''}`,'warn');
            }else{
              botLog(`🤖 AI: ✅${BL('买入通过','BUY承認','BUY approved')} (${BL('置信度','確信度','confidence')}${conf}%) — ${json.reason||''}`,'info');
            }
          }catch(e){botLog(BL('🤖 AI回应解析失败 — 继续规则判断','🤖 AI応答解析失敗 — ルールベースで継続','🤖 AI response parse failed — continuing rule-based'),'warn');}
        }
      }catch(e){botLog(BL('🤖 AI判断跳过: ','🤖 AI判断スキップ: ','🤖 AI check skipped: ')+e.message,'warn');}

      // ── STEP 6: 注文実行（指値 + OCOブラケット）──
      if(aiApproved){
        const orderAmt=Math.min(cfg.maxPositionUSD,buyingPower*0.9);
        const qty=Math.floor(orderAmt/best.price);
        if(qty<1){
          botLog(`⚠ ${best.sym} ${BL('资金不足','購入力不足','insufficient funds')} ($${best.price.toFixed(0)} / $${buyingPower.toFixed(0)})`,'warn');
        }else{
          const slPct=cfg.stopLossPercent||3,tpPct=cfg.takeProfitPercent||8;
          const slipBuf=cfg.limitSlippagePct||0.1;
          botLog(`📈 ${best.sym} ${BL('执行买入','買い注文実行','BUY order')} ${BL('评分','スコア','score')}:${best.score}/7 → ${qty}${BL('股','株','sh')} ${BL('指值','指値','limit')}@$${(best.price*(1+slipBuf/100)).toFixed(2)} — 🛡 SL:-${slPct}% TP:+${tpPct}% (OCO)`,'buy');
          try{await placeBracketBuy(keyId,secret,best.sym,qty,best.price,slPct,tpPct,slipBuf);}
          catch(e){botLog(`❌ ${best.sym} ${BL('下单失败','注文失敗','order failed')}: ${e.message}`,'error');}
        }
      }
    }
  }

  botLog(BL('✅ 周期完成','✅ サイクル完了','✅ Cycle complete'),'info');
  send('bot-update',{type:'cycle-end'});
}

ipcMain.handle('alpaca-connect',async(_,{keyId,secret})=>{
  try{
    const [account,clock]=await Promise.all([
      alpacaFetch(keyId,secret,'GET','/v2/account'),
      alpacaFetch(keyId,secret,'GET','/v2/clock'),
    ]);
    const s=readKeyStore();s['alpaca']={keyId:encSecret(keyId),secret:encSecret(secret)};writeKeyStore(s);
    return{ok:true,account,clock};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('alpaca-account',async(_,{keyId,secret})=>{
  try{
    const [account,positions,orders,clock]=await Promise.all([
      alpacaFetch(keyId,secret,'GET','/v2/account'),
      alpacaFetch(keyId,secret,'GET','/v2/positions'),
      alpacaFetch(keyId,secret,'GET','/v2/orders?status=all&limit=30'),
      alpacaFetch(keyId,secret,'GET','/v2/clock'),
    ]);
    return{ok:true,account,positions,orders,clock};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('alpaca-load-keys',()=>{
  try{const s=readKeyStore();const a=s['alpaca'];if(!a)return{ok:true,keyId:'',secret:''};return{ok:true,keyId:decSecret(a.keyId),secret:decSecret(a.secret)};}
  catch(e){return{ok:true,keyId:'',secret:''};}
});
ipcMain.handle('alpaca-delete-keys',()=>{
  try{const s=readKeyStore();delete s['alpaca'];writeKeyStore(s);return{ok:true};}
  catch(e){return{error:e.message};}
});

ipcMain.handle('alpaca-place-order',async(_,{keyId,secret,symbol,side,qty})=>{
  try{
    const order=await alpacaFetch(keyId,secret,'POST','/v2/orders',{symbol,qty:String(qty),side,type:'market',time_in_force:'day'});
    botLog(`📋 ${BL("手动下单","手動注文","manual order")}: ${side.toUpperCase()} ${qty}${BL("股","株","sh")} ${symbol}`,'info');
    return{ok:true,order};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('alpaca-close-position',async(_,{keyId,secret,symbol})=>{
  try{
    await closePositionSafely(keyId,secret,symbol);
    botLog(`📋 ${BL("手动平仓","手動クローズ","manual close")}: ${symbol}`,'info');
    return{ok:true};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('bot-start',async(_,{keyId,secret,config})=>{
  try{
    if(botTimer){clearInterval(botTimer);botTimer=null;}
    disconnectAlpacaStream();
    if(config)saveBotConfig(config);
    const cfg=loadBotConfig();
    botRunning=true;botLogs=[];
    botLog(BL('🚀 机器人启动 — 监控标的: ','🚀 ボット起動 — ウォッチ対象: ','🚀 Bot started — watching: ')+cfg.watchlist.join(', '),'info');
    if(cfg.scalpMode){
      botLog(BL('⚡ 高频刷单模式 — 使用 Alpaca WebSocket 实时数据','⚡ スキャルピングモード — Alpaca WebSocket リアルタイムデータ使用','⚡ Scalping mode — using Alpaca WebSocket real-time data'),'info');
      await prefillBarCache(keyId,secret,cfg.watchlist);
      connectAlpacaStream(keyId,secret,cfg.watchlist);
    }
    runBotCycle(keyId,secret);
    botTimer=setInterval(()=>runBotCycle(keyId,secret),cfg.intervalMinutes*60*1000);
    send('bot-update',{type:'status',running:true});
    return{ok:true};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('bot-stop',async()=>{
  if(botTimer){clearInterval(botTimer);botTimer=null;}
  botRunning=false;
  disconnectAlpacaStream();
  botLog(BL('⏹ 机器人停止','⏹ ボット停止','⏹ Bot stopped'),'info');
  send('bot-update',{type:'status',running:false});
  return{ok:true};
});

ipcMain.handle('bot-status',()=>({ok:true,running:botRunning,config:loadBotConfig(),logs:botLogs.slice(0,80)}));
ipcMain.handle('bot-save-config',(_,config)=>{try{saveBotConfig(config);return{ok:true};}catch(e){return{error:e.message};}});
ipcMain.handle('bot-set-lang',(_,l)=>{if(l)botLang=l;return{ok:true};});

// 手動で1サイクル即時実行（テスト・デバッグ用）
ipcMain.handle('bot-run-once',async(_,{keyId,secret})=>{
  try{
    if(!keyId||!secret)return{error:'No Alpaca credentials'};
    botLog(`▶ ${BL('手动触发分析周期','手動サイクル実行','Manual cycle triggered')}`,'info');
    const cfg=loadBotConfig();
    // スキャルプモード時はWS未接続なら一時的にprefill
    if(cfg.scalpMode&&Object.keys(scalpBarCache).length===0){
      await prefillBarCache(keyId,secret,cfg.watchlist);
    }
    runBotCycle(keyId,secret); // バックグラウンドで実行
    return{ok:true};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('alpaca-filled-orders',async(_,{keyId,secret})=>{
  try{
    const orders=await alpacaFetch(keyId,secret,'GET','/v2/orders?status=all&limit=200&direction=desc');
    const filled=orders.filter(o=>o.status==='filled'||o.status==='partially_filled');
    return{ok:true,orders:filled};
  }catch(e){return{error:e.message};}
});

ipcMain.handle('bot-portfolio-history',()=>{
  try{return{ok:true,history:loadPortfolioHistory()};}
  catch(e){return{ok:true,history:[]};}
});
