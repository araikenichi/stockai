const { app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut, safeStorage, shell, clipboard } = require('electron');
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
