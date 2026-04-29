const ipcRenderer=window.stockai;
let key='',lang='zh',model='gemini-2.5-flash',keyClaude='',keyOpenAI='',keyDeepSeek='';
let wScr=true,wTV=true,wMkt=true,wSrch=true;
let busy=false,hist=[],tvData=null,mktData=null,lastHF=null;
let autoOn=false,lgMode=false,pineMode=false,portfolio=[],watchlist=[],dashData=null,portPrices={};
let theme=localStorage.getItem('sai_theme')||'dark';
let enterReady=false,smartOn=false,liveData=null,userTriggers=[];
let chats=[{id:0,name:'Chat 1',hist:[],msgs:[]}],activeChat=0,chatIdCounter=1;

const L={
  ja:{ph:'銘柄コードや質問を入力',li:'日本語で回答してください。',reason:'分析理由',result:'分析結果',summary:'まとめ',conclusion:'結論',buy:'強気 ▲',sell:'弱気 ▼',hold:'中立 ◆',wait:'観察 ◇',wlcTitle:'AI株式研究アシスタント',wlc:'銘柄コードやTradingViewチャートから、相場要約・リスク・注目材料・観察ポイントを整理します。',appTitle:'StockAI',appBadge:'AI RESEARCH',appSubtitle:'',navTools:'TOOLS',
    tb_capture:'スクリーン',tb_chart:'チャート分析',tb_quick:'クイック分析',tb_full:'詳細分析',tb_consensus:'AI合議',tb_monitor:'リアルタイム監視',
    btn_save:'保存',btn_fetch:'取得',btn_add:'+ 追加',btn_update:'更新',btn_analyze:'分析',
    lbl_lang:'言語',lbl_free:'無料',lbl_ticker:'ティッカーを入力',lbl_history:'分析履歴なし',lbl_symbol:'銘柄変更',lbl_newchat:'新規チャット',lbl_analyzing:'分析中...',lbl_briefing:'おはようございます',
    pnl_market:'マーケット',pnl_portfolio:'ポートフォリオ',pnl_history:'履歴',pnl_watchlist:'ウォッチリスト',wlcApi:'APIキー設定',wlcMarket:'銘柄を調べる',wlcWatch:'ウォッチ管理',wlcQuick:'クイック分析',wlcQuickDesc:'場中の方向感とリスクを素早く確認。',wlcDeep:'詳細分析',wlcDeepDesc:'複数エージェントで材料、リスク、観察条件を整理。',wlcLive:'リアルタイム監視',wlcLiveDesc:'価格、RSI、MACD、異常変動を検知。',wlcPort:'ポートフォリオ概況',wlcPortDesc:'保有・監視銘柄、決算、リスク温度を確認。',
    entry_now:'即エントリー可能',entry_wait:'条件待ち',entry_avoid:'回避推奨',dash_title:'今日の概況',why_matters:'あなたに関係する理由',time_horizon:'時間軸',risk_level:'リスク'},
  en:{ph:'Ask about a ticker or chart',li:'Reply in English.',reason:'Reasoning',result:'Analysis',summary:'Summary',conclusion:'Conclusion',buy:'Bullish ▲',sell:'Bearish ▼',hold:'Neutral ◆',wait:'Watch ◇',wlcTitle:'AI Stock Research Assistant',wlc:'Enter a ticker or connect TradingView to understand market context, risks, catalysts, and observation points.',appTitle:'StockAI',appBadge:'AI RESEARCH',appSubtitle:'',navTools:'TOOLS',
    tb_capture:'Screen',tb_chart:'Chart Analysis',tb_quick:'Quick Analysis',tb_full:'Deep Analysis',tb_consensus:'AI Consensus',tb_monitor:'Live Monitor',
    btn_save:'Save',btn_fetch:'Fetch',btn_add:'+ Add',btn_update:'Refresh',btn_analyze:'Analyze',
    lbl_lang:'Language',lbl_free:'Free',lbl_ticker:'Enter ticker',lbl_history:'No history',lbl_symbol:'Change symbol',lbl_newchat:'New Chat',lbl_analyzing:'Analyzing...',lbl_briefing:'Good morning',
    pnl_market:'Market',pnl_portfolio:'Portfolio',pnl_history:'History',pnl_watchlist:'Watchlist',wlcApi:'Set API Key',wlcMarket:'Look Up Stock',wlcWatch:'Manage Watchlist',wlcQuick:'Quick Analysis',wlcQuickDesc:'Fast read on direction and risk during market hours.',wlcDeep:'Deep Analysis',wlcDeepDesc:'Multi-agent research on catalysts, risks, and observation conditions.',wlcLive:'Live Monitor',wlcLiveDesc:'Watch price, RSI, MACD, and abnormal moves.',wlcPort:'Portfolio Brief',wlcPortDesc:'Track holdings, watchlist, earnings, and risk temperature.',
    entry_now:'Ready to enter',entry_wait:'Conditional',entry_avoid:'Avoid',dash_title:'Today\'s Overview',why_matters:'Why it matters to you',time_horizon:'Time Horizon',risk_level:'Risk Level'},
  zh:{ph:'输入股票代码、图表问题或研究问题',li:'用中文回答。',reason:'分析理由',result:'分析结果',summary:'总结',conclusion:'结论',buy:'偏强 ▲',sell:'偏弱 ▼',hold:'中性 ◆',wait:'观察 ◇',wlcTitle:'AI 股票研究助手',wlc:'输入股票代码或连接 TradingView，快速看懂行情摘要、风险提示、催化因素和观察条件。',appTitle:'StockAI',appBadge:'AI RESEARCH',appSubtitle:'',navTools:'工具',
    tb_capture:'截屏',tb_chart:'图表分析',tb_quick:'快速分析',tb_full:'深度分析',tb_consensus:'多模型共识',tb_monitor:'实时监控',
    btn_save:'保存',btn_fetch:'获取',btn_add:'+ 添加',btn_update:'刷新',btn_analyze:'分析',
    lbl_lang:'语言',lbl_free:'免费',lbl_ticker:'输入代码',lbl_history:'无记录',lbl_symbol:'切换代码',lbl_newchat:'新对话',lbl_analyzing:'分析中...',lbl_briefing:'早上好',
    pnl_market:'市场',pnl_portfolio:'组合',pnl_history:'历史',pnl_watchlist:'自选股',wlcApi:'设置 API Key',wlcMarket:'查询股票',wlcWatch:'管理自选股',wlcQuick:'快速分析',wlcQuickDesc:'适合盘中快速判断方向和风险。',wlcDeep:'深度研究',wlcDeepDesc:'多代理整理催化因素、风险和观察条件。',wlcLive:'实时监控',wlcLiveDesc:'监听价格、RSI、MACD 和异常波动。',wlcPort:'组合概况',wlcPortDesc:'跟踪持仓、自选股、财报和风险温度。',
    entry_now:'可立即入场',entry_wait:'条件等待',entry_avoid:'建议回避',dash_title:'今日概况',why_matters:'与你的关系',time_horizon:'时间维度',risk_level:'风险等级'},
};

// ═══ Init ═══
window.onload=async()=>{
  key='';lang=ls('sai_lang')||'zh';model=ls('sai_model')||'gemini-2.5-flash';
  keyClaude='';keyOpenAI='';keyDeepSeek='';
  document.body.className=theme;setThemeIcon();
  await loadSecureKeys();
  if(Q('model-gemini'))Q('model-gemini').value=model;Q('lang-sel').value=lang;applyLang();
  const pr=await ipcRenderer.invoke('load-portfolio');if(pr.ok&&pr.portfolio?.length){portfolio=pr.portfolio;renderPort();}
  const wl=await ipcRenderer.invoke('load-watchlist');if(wl.ok&&wl.watchlist?.length){watchlist=wl.watchlist;renderWL();}
  loadHistory();renderChatTabs();
  Q('inp').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!Q('inp').value.trim())return;if(!enterReady){enterReady=true;Q('sndb').classList.add('ready');Q('ibx').classList.add('ready');}else{enterReady=false;Q('sndb').classList.remove('ready');Q('ibx').classList.remove('ready');doSend();}}else if(e.key!=='Enter'&&enterReady){enterReady=false;Q('sndb').classList.remove('ready');Q('ibx').classList.remove('ready');}});
  Q('inp').addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';});
  setTimeout(()=>{togP('dashboard');if(activeAPIKey())initDashboard();else showOnboarding();},300);
};

// ═══ Utils ═══
function Q(id){return document.getElementById(id);}
function ls(k){return localStorage.getItem(k)||'';}
function esc(t){return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sf(v,d=2){return v!=null&&!isNaN(v)?Number(v).toFixed(d):'—';}
function trn(s,n=300){return(s||'').slice(0,n);}
function ico(id,cls=''){return '<svg class="ico '+cls+'"><use href="#i-'+id+'"/></svg>';}
function setBtn(id,icon,text,title){const el=Q(id);if(!el)return;el.innerHTML=ico(icon)+'<span>'+esc(text)+'</span>';if(title)el.title=title;}
function setThemeIcon(){const b=Q('thb');if(b)b.innerHTML=ico(theme==='dark'?'sun':'moon','sm');}
function reportMeta(sym){return {time:new Date().toLocaleString(),symbol:sym||tvData?.sym||mktData?.sym||'—'};}
function disclaimerHTML(sym){const m=reportMeta(sym);return '<div class="why-box" style="margin:10px 12px 12px"><div class="why-lbl">免责声明 / DATA</div><div class="why-txt">生成时间: '+esc(m.time)+' · 标的: '+esc(m.symbol)+' · 数据来自公开行情/TradingView/AI 推理，可能延迟或出错。内容仅供研究参考，不构成投资建议，请自行核实并承担交易风险。</div></div>';}
function activeAPIKey(){return key||keyClaude||keyOpenAI||keyDeepSeek;}
function activeModel(){
  if(key)return model;
  if(keyClaude)return Q('model-claude')?.value||'claude-sonnet-4-20250514';
  if(keyOpenAI)return Q('model-openai')?.value||'gpt-4o';
  if(keyDeepSeek)return Q('model-deepseek')?.value||'deepseek-chat';
  return model;
}
function keysPayload(){return{gemini:key||null,geminiModel:model,claude:keyClaude||null,openai:keyOpenAI||null,openaiModel:Q('model-openai')?.value||'gpt-5.5',deepseek:keyDeepSeek||null,deepseekModel:Q('model-deepseek')?.value||'deepseek-chat'};}
function providerKey(p){return p==='gemini'?key:p==='claude'?keyClaude:p==='openai'?keyOpenAI:keyDeepSeek;}
function setProviderKey(p,v){if(p==='gemini'){key=v;return;}if(p==='claude'){keyClaude=v;return;}if(p==='openai'){keyOpenAI=v;return;}if(p==='deepseek')keyDeepSeek=v;}

// ═══ Theme / Lang ═══
function togTheme(){theme=theme==='dark'?'light':'dark';document.body.className=theme;localStorage.setItem('sai_theme',theme);setThemeIcon();}
function setLang(l){lang=l;localStorage.setItem('sai_lang',l);applyLang();}
function applyLang(){
  const t=L[lang];Q('inp').placeholder=t.ph;Q('lang-sel').value=lang;
  const title=Q('app-title');if(title)title.textContent=t.appTitle;
  const badge=Q('app-badge');if(badge)badge.textContent=t.appBadge;
  const subtitle=Q('app-subtitle');if(subtitle)subtitle.textContent=t.appSubtitle;
  const nav=Q('nav-tools');if(nav)nav.textContent=t.navTools;
  const wt=Q('wlc-title');if(wt)wt.textContent=t.wlcTitle;
  const d=Q('wlc-desc');if(d)d.textContent=t.wlc;
  const w=Q('wlc');if(w)w.outerHTML=welcomeHTML();
  // Toolbar
  setBtn('tb-capture','camera',t.tb_capture,t.tb_capture);
  setBtn('tb-chart','chart',t.tb_chart,t.tb_chart);
  setBtn('tb-quick','zap',t.tb_quick,t.tb_quick);
  setBtn('tb-full','layers',t.tb_full,t.tb_full);
  setBtn('tb-consensus','users',t.tb_consensus,t.tb_consensus);
  setBtn('auto-btn','radio',t.tb_monitor,t.tb_monitor);
  setThemeIcon();
  // Panel elements
  const els={'mkt-title':t.pnl_market,'port-title':t.pnl_portfolio,'hist-title':t.pnl_history,'wl-title':t.pnl_watchlist,'dash-title':t.dash_title,'mkt-btn':t.btn_fetch,'port-add-btn':t.btn_add,'tv-ref-btn':t.btn_update,'tv-ana-btn':t.btn_analyze,'lang-label':t.lbl_lang,'free-tag':t.lbl_free};
  Object.entries(els).forEach(([id,txt])=>{const el=Q(id);if(el)el.textContent=txt;});
  document.querySelectorAll('.asv').forEach(b=>b.textContent=t.btn_save);
  const si=Q('sym-tv');if(si)si.placeholder=t.lbl_symbol+': NVDA...';
  const mp=Q('mkt-placeholder');if(mp)mp.textContent=t.lbl_ticker;
  const he=Q('hist-empty');if(he)he.textContent=t.lbl_history;
}

function welcomeHTML(){
  const t=L[lang];
  return '<div class="wlc" id="wlc"><h2 id="wlc-title">'+esc(t.wlcTitle)+'</h2><p id="wlc-desc">'+esc(t.wlc)+'</p><div class="wcg"><div class="wcc"><div class="wci">'+ico('zap')+'</div><div class="wct">'+esc(t.wlcQuick)+'</div><div class="wcd">'+esc(t.wlcQuickDesc)+'</div></div><div class="wcc"><div class="wci">'+ico('layers')+'</div><div class="wct">'+esc(t.wlcDeep)+'</div><div class="wcd">'+esc(t.wlcDeepDesc)+'</div></div><div class="wcc"><div class="wci">'+ico('radio')+'</div><div class="wct">'+esc(t.wlcLive)+'</div><div class="wcd">'+esc(t.wlcLiveDesc)+'</div></div><div class="wcc"><div class="wci">'+ico('briefcase')+'</div><div class="wct">'+esc(t.wlcPort)+'</div><div class="wcd">'+esc(t.wlcPortDesc)+'</div></div></div></div>';
}

// ═══ API ═══
function togAPI(p){Q('api-'+p).classList.toggle('show');}
async function loadSecureKeys(){
  const old={gemini:ls('sai_key_gemini')||ls('sai_key'),claude:ls('sai_key_claude'),openai:ls('sai_key_openai'),deepseek:ls('sai_key_deepseek')};
  const r=await ipcRenderer.invoke('load-api-keys');
  const stored=r.ok?r.keys||{}:{};
  for(const p of ['gemini','claude','openai','deepseek']){
    const oldKey=old[p], storedKey=stored[p]?.key||'', m=stored[p]?.model||ls('sai_model_'+p)||'';
    const finalKey=storedKey||oldKey||'';
    if(oldKey&&!storedKey)await ipcRenderer.invoke('save-api-key',{provider:p,key:oldKey,model:m});
    if(finalKey){setProviderKey(p,finalKey);if(Q('dot-'+p))Q('dot-'+p).classList.add('on');if(Q('key-'+p))Q('key-'+p).placeholder='已安全保存，输入新 Key 可替换';}
    if(m&&Q('model-'+p))Q('model-'+p).value=m;
  }
  if(stored.gemini?.model)model=stored.gemini.model;
  ['sai_key','sai_key_gemini','sai_key_claude','sai_key_openai','sai_key_deepseek'].forEach(k=>localStorage.removeItem(k));
}
async function saveKey(p){const k=Q('key-'+p)?.value.trim()||'',m=Q('model-'+p)?.value||'';if(m)localStorage.setItem('sai_model_'+p,m);if(k){const r=await ipcRenderer.invoke('save-api-key',{provider:p,key:k,model:m});if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}setProviderKey(p,k);if(p==='gemini')model=m||model;Q('key-'+p).value='';Q('key-'+p).placeholder='已安全保存，输入新 Key 可替换';}else if(m){const r=await ipcRenderer.invoke('save-api-key',{provider:p,key:providerKey(p),model:m});if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}if(p==='gemini')model=m;}if(Q('dot-'+p))Q('dot-'+p).classList.toggle('on',!!providerKey(p));if(m&&p==='gemini'){model=m;localStorage.setItem('sai_model',m);}Q('api-'+p).classList.remove('show');if(activeAPIKey())setTimeout(()=>Q('pnl-settings').classList.remove('open'),300);}
function saveMdl(m){model=m;localStorage.setItem('sai_model',m);}
async function clearKey(p){const r=await ipcRenderer.invoke('delete-api-key',{provider:p});if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}setProviderKey(p,'');if(Q('dot-'+p))Q('dot-'+p).classList.remove('on');if(Q('key-'+p)){Q('key-'+p).value='';Q('key-'+p).placeholder=p==='gemini'?'AIza...':'sk-...';}addMsg('ai','<div style="color:var(--tx2);font-size:11px">'+esc(p)+' のキーを削除しました</div>',1);}

// ═══ Onboarding ═══
let obProvider='',obClipTimer=null;
const OB_URLS={gemini:'https://aistudio.google.com/app/apikey',claude:'https://console.anthropic.com/settings/keys',openai:'https://platform.openai.com/api-keys',deepseek:'https://platform.deepseek.com/api_keys'};
const OB_PREFIX={gemini:'AIza',claude:'sk-ant-',openai:'sk-',deepseek:'sk-'};
function showOnboarding(){const o=Q('onboarding');if(o)o.style.display='block';}
function hideOnboarding(){const o=Q('onboarding');if(o)o.style.display='none';stopObClip();}
function obSelect(p){
  obProvider=p;
  document.querySelectorAll('.ob-card').forEach(c=>c.classList.toggle('sel',c.dataset.p===p));
  const step=Q('ob-step');step.classList.add('show');
  Q('ob-dot2').classList.add('act');
  const names={gemini:'Gemini',claude:'Claude',openai:'GPT-4o',deepseek:'DeepSeek'};
  Q('ob-step-lbl').textContent='获取 '+names[p]+' API Key';
  Q('ob-key-in').value='';Q('ob-key-in').placeholder='粘贴 '+(OB_PREFIX[p]||'')+'... Key';
  Q('ob-key-err').style.display='none';Q('ob-save-btn').disabled=true;
  startObClip();
}
async function obOpenKeyPage(){if(!obProvider)return;await ipcRenderer.invoke('open-external',OB_URLS[obProvider]);}
function startObClip(){
  stopObClip();
  Q('ob-clip-dot').className='ob-clip-dot';Q('ob-clip-lbl').textContent='复制 Key 后将自动识别并填入…';
  obClipTimer=setInterval(async()=>{
    try{
      const t=(await ipcRenderer.invoke('read-clipboard')||'').trim();
      if(t&&obProvider&&t.startsWith(OB_PREFIX[obProvider])&&t.length>20){
        Q('ob-key-in').value=t;Q('ob-clip-dot').className='ob-clip-dot found';
        Q('ob-clip-lbl').textContent='✓ 已识别 Key，点击确认保存';
        Q('ob-save-btn').disabled=false;stopObClip();
      }
    }catch(e){}
  },800);
}
function stopObClip(){if(obClipTimer){clearInterval(obClipTimer);obClipTimer=null;}}
function obCheckInput(){const v=(Q('ob-key-in').value||'').trim();Q('ob-save-btn').disabled=v.length<10;}
async function obSave(){
  const v=(Q('ob-key-in').value||'').trim();if(!v||!obProvider)return;
  if(v.length<10){Q('ob-key-err').style.display='block';return;}
  Q('ob-key-err').style.display='none';
  const inp=Q('key-'+obProvider);if(inp)inp.value=v;
  await saveKey(obProvider);
  hideOnboarding();togP('dashboard');initDashboard();
}
function obSkip(){hideOnboarding();togP('settings');}

// ═══ Multi-Chat ═══
function newChat(){chats[activeChat].msgs=Q('msgs').innerHTML;chats[activeChat].hist=[...hist];const id=chatIdCounter++;chats.push({id,name:'Chat '+(id+1),hist:[],msgs:''});activeChat=chats.length-1;hist=[];lastHF=null;Q('msgs').innerHTML=welcomeHTML();renderChatTabs();}
function switchChat(idx){if(idx===activeChat||busy)return;chats[activeChat].msgs=Q('msgs').innerHTML;chats[activeChat].hist=[...hist];activeChat=idx;hist=chats[idx].hist?[...chats[idx].hist]:[];lastHF=null;Q('msgs').innerHTML=chats[idx].msgs||welcomeHTML();renderChatTabs();}
function deleteChat(idx){if(chats.length<=1)return;chats.splice(idx,1);if(activeChat>=chats.length)activeChat=chats.length-1;hist=chats[activeChat].hist?[...chats[activeChat].hist]:[];Q('msgs').innerHTML=chats[activeChat].msgs||welcomeHTML();renderChatTabs();}
function renderChatTabs(){const bar=Q('chat-tabs');if(!bar)return;bar.innerHTML=chats.map((c,i)=>'<button class="chat-tab'+(i===activeChat?' active':'')+'" onclick="switchChat('+i+')">'+esc(c.name)+(chats.length>1?'<span class="chat-tab-x" onclick="event.stopPropagation();deleteChat('+i+')">×</span>':'')+'</button>').join('')+'<button class="chat-tab chat-tab-new" onclick="newChat()" title="'+L[lang].lbl_newchat+'">+</button>';}

// ═══ Window / Panels ═══
function goClose(){ipcRenderer.invoke('win-hide');}function goMini(){ipcRenderer.invoke('win-size','mini');Q('app').style.display='none';Q('mini').style.display='flex';}function goExpand(){ipcRenderer.invoke('win-size','normal');Q('mini').style.display='none';Q('app').style.display='flex';}function goLg(){lgMode=!lgMode;ipcRenderer.invoke('win-size',lgMode?'large':'normal');}
function togP(name){['dashboard','research','settings','market','tv','portfolio','history','watchlist','review'].forEach(n=>{const p=Q('pnl-'+n);if(p&&n!==name)p.classList.remove('open');});const t=Q('pnl-'+name);if(t)t.classList.toggle('open');if(name==='tv'&&t.classList.contains('open'))tvConn();if(name==='history')loadHistory();}
function togF(t){const m={scr:()=>wScr=!wScr,tv:()=>wTV=!wTV,mkt:()=>wMkt=!wMkt,srch:()=>wSrch=!wSrch};const g={scr:()=>wScr,tv:()=>wTV,mkt:()=>wMkt,srch:()=>wSrch};if(m[t]){m[t]();Q('t-'+t).classList.toggle('on',g[t]());}}

// ═══ IPC ═══
ipcRenderer.on('tv-status',(_,d)=>{if(d.ok){Q('mp').style.display='block';tvRef();}});
ipcRenderer.on('auto-alert',(_,d)=>{addMsg('ai','<div class="alrt"><div class="alrtt">🚨 '+d.time+'</div><div class="prose">'+md(d.text)+'</div></div>',1);});
ipcRenderer.on('agent-progress',(_,d)=>{const el=Q('ag-'+d.agent);if(el)el.className='agcp '+d.status;});
// Smart monitor live data
ipcRenderer.on('stream-tick',(_,d)=>{
  liveData=d;
  const ticker=Q('live-ticker');
  if(ticker&&d.price){
    const rsiStr=d.inds?.rsi!=null?' R:'+d.inds.rsi.toFixed(0):'';
    const macdStr=d.inds?.macd!=null?' M:'+(d.inds.macd>0?'+':'')+d.inds.macd.toFixed(2):'';
    const modeIcon=d.mode==='chartAPI'?'●':'○';
    ticker.innerHTML='<span style="color:var(--ac);font-family:IBM Plex Mono,monospace;font-size:10px">'+modeIcon+' '+esc(d.sym)+' $'+d.price.toFixed(2)+rsiStr+macdStr+'</span>';
    ticker.style.display='flex';
  }
});
ipcRenderer.on('smart-alert',(_,d)=>{
  let h='<div class="alrt" style="border-color:var(--rd);background:var(--rd2)">';
  h+='<div class="alrtt" style="color:var(--rd)">🔴 LIVE ALERT '+d.time+'</div>';
  h+='<div style="margin-bottom:6px">'+d.alerts.map(a=>'<div style="font-size:11px;font-weight:600;color:var(--tx);margin:2px 0">⚡ '+esc(a.msg)+'</div>').join('')+'</div>';
  if(d.img)h+='<div class="scr"><img src="data:image/jpeg;base64,'+d.img+'"/><div class="scrb"><span>📸 AUTO</span><span>'+d.time+'</span></div></div>';
  h+='<div class="prose" style="margin-top:6px">'+md(d.analysis||'')+'</div></div>';
  addMsg('ai',h,1);
  // Flash window to get attention
  if(Q('app'))Q('app').style.borderColor='var(--rd)';
  setTimeout(()=>{if(Q('app'))Q('app').style.borderColor='';},3000);
});

// ═══ Watchlist ═══
function renderWL(){const list=Q('wl-list');if(!list)return;list.innerHTML=watchlist.map((w,i)=>'<div class="wl-row" onclick="loadMkt(\''+esc(w.symbol)+'\')"><span class="wl-sym">'+esc(w.symbol)+'</span><span class="wl-price">'+(w.price?'$'+sf(w.price):'—')+'</span><span class="wl-chg" style="color:'+(parseFloat(w.change)>0?'var(--ac)':parseFloat(w.change)<0?'var(--rd)':'var(--tx3)')+'">'+(w.change?(parseFloat(w.change)>0?'+':'')+w.change+'%':'—')+'</span><button class="wl-del" onclick="event.stopPropagation();delWL('+i+')">×</button></div>').join('');}
async function addWL(){const inp=Q('wl-add-input');const sym=inp?.value.trim().toUpperCase();if(!sym)return;if(watchlist.find(w=>w.symbol===sym))return;watchlist.push({symbol:sym,price:null,change:null});inp.value='';renderWL();await ipcRenderer.invoke('save-watchlist',{watchlist});refreshWL();}
async function delWL(i){watchlist.splice(i,1);renderWL();await ipcRenderer.invoke('save-watchlist',{watchlist});}
async function refreshWL(){if(!watchlist.length)return;const syms=watchlist.map(w=>w.symbol);const r=await ipcRenderer.invoke('batch-prices',{symbols:syms});if(r.ok){r.results.forEach(res=>{const w=watchlist.find(x=>x.symbol===res.symbol);if(w&&!res.error){w.price=res.price;w.change=res.change;}});renderWL();await ipcRenderer.invoke('save-watchlist',{watchlist});}}
async function analyzeWatchlist(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  if(!watchlist.length){addMsg('ai','<div class="errc">请先添加自选股</div>',1);return;}
  const thk=showThk('正在批量分析自选股...');
  const r=await ipcRenderer.invoke('watchlist-analysis',{key:ak,model:activeModel(),lang,watchlist});
  thk.remove();
  if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}
  const d=r.data||{};let h='<div class="rpt"><div class="rpth"><span class="rptt">自选股批量分析</span><span class="sig sh">'+(watchlist.length)+' symbols</span></div><div class="rpt-hero"><div class="rpt-hero-verdict">'+esc(d.summary||'今日自选股概况')+'</div></div>';
  (d.top||[]).forEach((x,i)=>{h+='<div class="asec"><div class="asech"><span class="asecb ba">'+(i+1)+'</span><span class="asecr">'+esc(x.symbol||'')+'</span><span class="sig sh" style="margin-left:auto">'+esc(x.action||'WATCH')+'</span></div><div class="asecbd"><strong>理由:</strong> '+esc(x.reason||'')+'<br><strong>风险:</strong> '+esc(x.risk||'')+'<br><strong>触发条件:</strong> '+esc(x.trigger||'')+'</div></div>';});
  if(d.skip?.length)h+='<div class="asec collapsed"><div class="asech" onclick="this.parentElement.classList.toggle(\'collapsed\')"><span class="asecb bf">SKIP</span><span class="asecr">暂时忽略</span><span class="asecar">▼</span></div><div class="asecbd">'+esc(d.skip.join(' · '))+'</div></div>';
  h+=disclaimerHTML('WATCHLIST')+'</div>';addMsg('ai',h,1);
}

async function scoreWatchlist(){
  if(!watchlist.length){addMsg('ai','<div class="errc">请先添加自选股</div>',1);return;}
  const box=Q('wl-score');if(box)box.innerHTML='<div style="font-size:11px;color:var(--tx3);padding:8px">评分中...</div>';
  const r=await ipcRenderer.invoke('score-watchlist',{symbols:watchlist.map(w=>w.symbol)});
  if(!r.ok){if(box)box.innerHTML='<div class="errc">'+esc(r.error||'评分失败')+'</div>';return;}
  const rows=(r.rows||[]).filter(x=>!x.error).sort((a,b)=>(b.score?.overall||0)-(a.score?.overall||0));
  const html='<div style="margin-bottom:8px">'+rows.map(x=>{const s=x.score||{},clr=s.overall>=70?'var(--ac)':s.overall>=50?'var(--am)':'var(--rd)';return'<div class="wl-row" onclick="loadMkt(\''+esc(x.symbol)+'\')"><span class="wl-sym">'+esc(x.symbol)+'</span><span class="wl-price" style="color:'+clr+'">研究分 '+(s.overall||'—')+'</span><span class="wl-chg">基'+(s.fundamental||'—')+' 技'+(s.technical||'—')+' 情'+(s.sentiment||'—')+' 风'+(s.risk||'—')+'</span></div>';}).join('')+'</div>';
  if(box)box.innerHTML=html;
  let h='<div class="rpt"><div class="rpth"><span class="rptt">自选股研究评分</span><span class="sig sw">'+rows.length+' symbols</span></div><div class="asecbd prose">'+md('评分由基本面、技术面、估值、事件、情绪、风险六个维度合成，用于排序研究优先级，不是买卖建议。')+'</div>';
  rows.slice(0,8).forEach(x=>{const s=x.score||{};h+='<div class="asec"><div class="asech"><span class="asecb ba">'+esc(x.symbol)+'</span><span class="asecr">Score '+(s.overall||'—')+'/100</span></div><div class="asecbd">基本面 '+(s.fundamental||'—')+' · 估值 '+(s.valuation||'—')+' · 技术 '+(s.technical||'—')+' · 事件 '+(s.event||'—')+' · 情绪 '+(s.sentiment||'—')+' · 风险 '+(s.risk||'—')+'<br>Price $'+sf(x.price)+' · Change '+(x.change||'—')+'% · RSI '+(x.rsi||'—')+' · '+esc(x.trend||'')+'</div></div>';});
  h+=disclaimerHTML('SCORE')+'</div>';addMsg('ai',h,1);
}

async function runCompanyResearch(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  const sym=(Q('sym-research')?.value||mktData?.sym||tvData?.sym||'').trim().toUpperCase();
  if(!sym){addMsg('ai','<div class="errc">请输入股票代码</div>',1);return;}
  if(!mktData||mktData.sym!==sym){try{await loadMkt(sym);}catch(e){}}
  const thk=showThk('正在生成财报/公司研究报告...');
  const r=await ipcRenderer.invoke('company-research',{key:ak,model:activeModel(),lang,symbol:sym,marketData:mktData?.sym===sym?mktData:null});
  thk.remove();
  if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}
  addMsg('ai','<div class="rpt"><div class="rpth"><span class="rptt">研究报告 '+esc(sym)+'</span><span class="sig sw">FUNDAMENTAL</span></div><div class="asecbd prose">'+md(r.text)+'</div>'+disclaimerHTML(sym)+'</div>',1);
}

async function runNewsBrief(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  const sym=(Q('sym-research')?.value||mktData?.sym||tvData?.sym||'').trim().toUpperCase();
  if(!sym){addMsg('ai','<div class="errc">请输入股票代码</div>',1);return;}
  const thk=showThk('正在解释新闻影响...');
  const r=await ipcRenderer.invoke('news-brief',{key:ak,model:activeModel(),lang,symbol:sym});
  thk.remove();
  if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}
  let links='';if(r.news?.length)links='<div class="asec collapsed"><div class="asech" onclick="this.parentElement.classList.toggle(\'collapsed\')"><span class="asecb bf">NEWS</span><span class="asecr">来源</span><span class="asecar">▼</span></div><div class="asecbd">'+r.news.map(n=>'<div style="margin-bottom:5px"><strong>'+esc(n.title||'')+'</strong><br><span style="color:var(--tx3);font-size:10px">'+esc(n.publisher||'')+' · '+esc((n.providerPublishTime||'').slice(0,10))+'</span></div>').join('')+'</div></div>';
  addMsg('ai','<div class="rpt"><div class="rpth"><span class="rptt">新闻解释 '+esc(sym)+'</span><span class="sig sh">NEWS</span></div><div class="asecbd prose">'+md(r.text)+'</div>'+links+disclaimerHTML(sym)+'</div>',1);
}

async function runTradeReview(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  const tradeText=(Q('review-text')?.value||'').trim();
  let img=null;if(wScr){const cr=await ipcRenderer.invoke('capture',{quality:70});if(cr.ok)img=cr.img;}
  const thk=showThk('正在复盘这笔交易...');
  const r=await ipcRenderer.invoke('trade-review',{key:ak,model:activeModel(),lang,tradeText,screenshot:img});
  thk.remove();
  if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}
  let h='';if(img)h+=scrTag(img);h+='<div class="rpt"><div class="rpth"><span class="rptt">交易复盘</span><span class="sig sh">REVIEW</span></div><div class="asecbd prose">'+md(r.text)+'</div>'+disclaimerHTML('TRADE REVIEW')+'</div>';
  addMsg('ai',h,1);
}

// ═══ Auto Briefing ═══
async function showBriefing(){
  if(!watchlist.length)return;
  await refreshWL();
  const t=L[lang];
  let h='<div class="briefing"><div class="briefing-title">☀️ '+t.lbl_briefing+'</div><div class="briefing-grid">';
  watchlist.forEach(w=>{const chg=parseFloat(w.change)||0;h+='<div class="briefing-item" onclick="loadMkt(\''+esc(w.symbol)+'\')"><span class="briefing-sym">'+esc(w.symbol)+'</span><span class="briefing-price">$'+sf(w.price)+'</span><span class="briefing-chg" style="color:'+(chg>0?'var(--ac)':chg<0?'var(--rd)':'var(--tx3)')+'">'+(chg>0?'+':'')+sf(chg,2)+'%</span></div>';});
  h+='</div></div>';
  // Check portfolio stop losses
  if(portfolio.length){
    const warns=[];
    for(const p of portfolio.filter(p=>p.symbol&&p.avgCost)){
      const w=watchlist.find(x=>x.symbol===p.symbol.toUpperCase());
      if(w&&w.price){const loss=((w.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100);if(loss<-5)warns.push(p.symbol+' '+sf(loss,1)+'%');}}
    if(warns.length)h+='<div style="margin-top:6px;padding:8px;background:var(--rd2);border:1px solid var(--rdb);border-radius:8px;font-size:11px;color:var(--rd)">⚠️ 損失警告: '+warns.join(', ')+'</div>';
  }
  rmW();addMsg('ai',h,1);
}

async function runDailyBrief(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  if(!watchlist.length){addMsg('ai','<div class="errc">请先添加自选股</div>',1);return;}
  const body=Q('dash-brief-body');if(body)body.innerHTML='<div style="font-size:11px;color:var(--tx3);padding:8px">正在生成自选股日报...</div>';
  const thk=showThk('正在生成自选股日报...');
  const r=await ipcRenderer.invoke('watchlist-daily-brief',{key:ak,model:activeModel(),lang,watchlist});
  thk.remove();
  if(r.error){if(body)body.innerHTML='<div class="errc">'+esc(r.error)+'</div>';addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}
  const d=r.data||{},rows=r.rows||[];
  const items=d.items?.length?d.items:rows.map(x=>({symbol:x.symbol,oneLine:(x.change?x.change+'% ':'')+(x.trend||'数据更新'),risk:x.earningsDays!=null&&x.earningsDays<=7?'财报临近，波动可能上升':'等待更多新闻/财报确认',next:x.earningsDate?'关注财报 '+x.earningsDate:'关注新闻和成交量变化',tone:'WATCH',urgency:2}));
  const html='<div class="dash-verdict"><div class="dash-verdict-lbl">每日自选股简报</div><div class="dash-verdict-txt">'+esc(d.marketMood||'今日自选股状态已更新')+'</div></div>'
    +items.map(it=>{const tone=(it.tone||'WATCH').toLowerCase();const cls=tone.includes('bull')?'short':tone.includes('bear')?'short':tone.includes('neutral')?'neutral':'medium';return'<div class="ev-item" onclick="loadMkt(\''+esc(it.symbol||'')+'\')"><div class="ev-hd"><span class="ev-sym">'+esc(it.symbol||'')+'</span><span class="ev-hz '+cls+'">'+esc(it.tone||'WATCH')+'</span>'+(it.urgency?'<span class="ev-urg">'+'▮'.repeat(Math.min(5,it.urgency))+'</span>':'')+'</div><div class="ev-desc">'+esc(it.oneLine||'')+'</div><div class="ev-why">风险：'+esc(it.risk||'')+'</div><div class="ev-why">关注：'+esc(it.next||'')+'</div></div>';}).join('')
    +(d.warnings?.length?'<div class="why-box"><div class="why-lbl">风险提醒</div><div class="why-txt">'+esc(d.warnings.join(' · '))+'</div></div>':'');
  if(body)body.innerHTML=html;
  addMsg('ai','<div class="rpt"><div class="rpth"><span class="rptt">自选股日报</span><span class="sig sw">'+items.length+' symbols</span></div><div class="asecbd">'+html+'</div>'+disclaimerHTML('DAILY BRIEF')+'</div>',1);
}

// ═══ Home Dashboard ═══
async function initDashboard(){
  await refreshDashboard();
}

async function refreshDashboard(){
  const body=Q('dash-body');if(!body)return;
  if(!portfolio.length&&!watchlist.length){body.innerHTML='<div class="dash-verdict"><div class="dash-verdict-lbl">AI 股票研究首页</div><div class="dash-verdict-txt">添加自选股后，这里会显示每日摘要、风险温度、财报提醒、异动股票和 AI 研究重点。</div></div><div class="dash-grid"><div class="dash-card"><div class="dc-title">下一步</div><div style="font-size:11px;color:var(--tx2)">先到自选股面板添加 NVDA、TSLA、AAPL 或日股代码。</div></div><div class="dash-card"><div class="dc-title">研究模块</div><div style="font-size:11px;color:var(--tx2)">可用财报解读、新闻解释、交易复盘和评分系统。</div></div></div>';return;}
  body.innerHTML='<div style="text-align:center;color:var(--tx3);padding:12px;font-size:11px">データ取得中...</div>';
  const portSyms=portfolio.filter(p=>p.symbol).map(p=>p.symbol.toUpperCase());
  const wlSyms=watchlist.map(w=>w.symbol);
  const allSyms=[...new Set([...portSyms,...wlSyms])];
  if(!allSyms.length){body.innerHTML='<div style="text-align:center;color:var(--tx3);padding:20px;font-size:11px">銘柄を登録してください</div>';return;}
  const pr=await ipcRenderer.invoke('batch-prices',{symbols:allSyms});
  const priceMap={};
  if(pr.ok){pr.results.forEach(r=>{if(!r.error)priceMap[r.symbol]=r;const w=watchlist.find(x=>x.symbol===r.symbol);if(w&&!r.error){w.price=r.price;w.change=r.change;}});}
  // Fetch earnings for portfolio symbols
  const er=portSyms.length?await ipcRenderer.invoke('earnings-data',{symbols:portSyms.slice(0,10)}):{ok:false};
  const earningsMap={};if(er.ok)er.results.forEach(e=>{earningsMap[e.symbol]=e.earningsDate;});
  dashData={priceMap,earningsMap,portSyms,wlSyms};
  renderDashboard(dashData);
}

function renderDashboard(data){
  const {priceMap,earningsMap,portSyms}=data;
  const body=Q('dash-body');if(!body)return;
  // Risk temperature from P&L
  const portWithP=portfolio.filter(p=>p.symbol&&p.avgCost&&priceMap[p.symbol.toUpperCase()]);
  let riskScore=4;
  if(portWithP.length){
    let totLoss=0,lossCnt=0;
    portWithP.forEach(p=>{const cur=priceMap[p.symbol.toUpperCase()];if(cur?.price){const pnl=(cur.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100;if(pnl<0){totLoss+=Math.abs(pnl);lossCnt++;}}});
    const avgL=lossCnt?totLoss/lossCnt:0;const lossR=lossCnt/portWithP.length;
    riskScore=Math.min(10,Math.max(1,Math.round(1+avgL*0.4+lossR*5)));
  }
  const riskLabel=riskScore<=3?'LOW':riskScore<=5?'MEDIUM':riskScore<=7?'HIGH':'CRITICAL';
  const riskClr=riskLabel==='LOW'?'var(--ac)':riskLabel==='MEDIUM'?'var(--am)':'var(--rd)';
  // Earnings within 14 days
  const now=Date.now();
  const earningsSoon=Object.entries(earningsMap).map(([sym,d])=>{if(!d)return null;const dt=new Date(d);const days=Math.round((dt-now)/86400000);return{symbol:sym,date:dt,days};}).filter(e=>e&&e.days>=0&&e.days<=14).sort((a,b)=>a.days-b.days);
  // Abnormal movers >2%
  const movers=Object.entries(priceMap).map(([sym,d])=>({symbol:sym,change:parseFloat(d.change)||0,isPort:portSyms.includes(sym)})).filter(m=>Math.abs(m.change)>=2).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
  // Stop-loss warnings
  const warns=portWithP.filter(p=>{const cur=priceMap[p.symbol.toUpperCase()];return cur?.price&&(cur.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100<-5;});

  let h='';
  // Risk + Earnings row
  h+='<div class="dash-grid">';
  h+='<div class="dash-card"><div class="dc-title">🌡 リスク温度</div><div style="font-size:18px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;color:'+riskClr+'">'+riskLabel+'</div><div class="rtemp"><div class="rtemp-bar"><div class="rtemp-fill" style="width:'+(riskScore*10)+'%;background:'+riskClr+'"></div></div><span style="font-size:10px;font-family:\'IBM Plex Mono\',monospace;color:'+riskClr+'">'+riskScore+'/10</span></div></div>';
  h+='<div class="dash-card"><div class="dc-title">📅 財報カレンダー</div>';
  if(!earningsSoon.length)h+='<div style="font-size:11px;color:var(--tx3)">2週間内なし</div>';
  else h+=earningsSoon.slice(0,4).map(e=>'<div class="earn-row'+(e.days===0?' today':e.days<=3?' soon':'')+'"><span class="earn-sym">'+esc(e.symbol)+'</span><span class="earn-days">'+(e.days===0?'⚠️ 今日':e.days===1?'明日':e.days+'日後')+'</span></div>').join('');
  h+='</div></div>';
  // Stop-loss warnings
  if(warns.length)h+='<div style="background:var(--rd2);border:1px solid var(--rdb);border-radius:var(--r);padding:8px 10px;margin-bottom:6px"><div style="font-size:9px;font-weight:700;color:var(--rd);margin-bottom:4px;font-family:IBM Plex Mono,monospace">⛔ 損失警告 (>-5%)</div>'+warns.map(p=>{const cur=priceMap[p.symbol.toUpperCase()];const pnl=((cur.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100).toFixed(1);return'<div style="font-size:11px;color:var(--rd)">'+esc(p.symbol)+' '+pnl+'%</div>';}).join('')+'</div>';
  // Abnormal movers
  if(movers.length){h+='<div style="margin-bottom:8px"><div class="dc-title">⚡ 異常変動</div>';h+=movers.slice(0,5).map(m=>{const clr=m.change>0?'var(--ac)':'var(--rd)';const ptag=m.isPort?'<span style="background:var(--pu2);color:var(--pu);font-size:8px;font-family:IBM Plex Mono,monospace;padding:1px 4px;border-radius:4px">持株</span>':'';return'<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--bg3);border-radius:5px;margin-bottom:2px"><span style="font-weight:700;font-family:IBM Plex Mono,monospace;font-size:11px;min-width:46px">'+esc(m.symbol)+'</span>'+ptag+'<span style="color:'+clr+';font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:600;margin-left:auto">'+(m.change>0?'+':'')+sf(m.change,2)+'%</span></div>';}).join('');h+='</div>';}
  // Watchlist daily research surface
  h+='<div style="margin-bottom:8px"><div class="dc-title">📌 自选股日报</div><div id="dash-brief-body">'+watchlist.slice(0,8).map(w=>{const ch=parseFloat(w.change)||0;return'<div class="ev-item" onclick="loadMkt(\''+esc(w.symbol)+'\')"><div class="ev-hd"><span class="ev-sym">'+esc(w.symbol)+'</span><span class="ev-urg" style="color:'+(ch>0?'var(--ac)':ch<0?'var(--rd)':'var(--tx3)')+'">'+(ch>0?'+':'')+sf(ch,2)+'%</span></div><div class="ev-desc">等待 AI 生成：今天为什么涨/跌、最大风险、下一步关注。</div></div>';}).join('')+'</div></div>';
  // AI analysis buttons
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><button class="mbn" onclick="runDailyBrief()" style="width:100%;background:var(--bl2);color:var(--bl);border-color:var(--blb);margin-top:2px">每日自选股简报</button><button class="mbn" onclick="runAIDashboard()" style="width:100%;background:var(--pu2);color:var(--pu);border-color:var(--pub);margin-top:2px">组合重点分析</button></div>';
  body.innerHTML=h;
}

async function runAIDashboard(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  const aiBtn=Q('dash-ai-btn');if(aiBtn){aiBtn.disabled=true;aiBtn.textContent='分析中...';}
  const thk=showThk('🤖 今日のポートフォリオ状況を分析中...');
  const r=await ipcRenderer.invoke('portfolio-dashboard',{key:ak,model:activeModel(),lang,portfolio:portfolio.filter(p=>p.symbol),watchlist,earningsData:dashData?.earningsMap||{}});
  thk.remove();
  if(aiBtn){aiBtn.disabled=false;aiBtn.textContent='🤖 AI分析';}
  if(!r.ok){addMsg('ai','<div class="errc">'+esc(r.error||'')+'</div>',1);return;}
  const d=r.data;
  const body=Q('dash-body');
  if(body){
    let h='';
    // Daily verdict
    if(d.dailyVerdict)h+='<div class="dash-verdict"><div class="dash-verdict-lbl">📋 今日のまとめ</div><div class="dash-verdict-txt">'+esc(d.dailyVerdict)+'</div></div>';
    // Risk + Earnings
    const riskClr=d.riskLabel==='LOW'?'var(--ac)':d.riskLabel==='MEDIUM'?'var(--am)':'var(--rd)';
    const riskPct=(d.riskTemperature||5)*10;
    h+='<div class="dash-grid">';
    h+='<div class="dash-card"><div class="dc-title">🌡 リスク温度</div><div style="font-size:18px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;color:'+riskClr+'">'+(d.riskLabel||'MEDIUM')+'</div><div class="rtemp"><div class="rtemp-bar"><div class="rtemp-fill" style="width:'+riskPct+'%;background:'+riskClr+'"></div></div><span style="font-size:10px;font-family:\'IBM Plex Mono\',monospace;color:'+riskClr+'">'+(d.riskTemperature||5)+'/10</span></div></div>';
    const earnTonight=d.earningsTonight||[];
    h+='<div class="dash-card"><div class="dc-title">📅 財報</div>'+(earnTonight.length?earnTonight.map(sym=>'<div class="earn-row today"><span class="earn-sym">'+esc(sym)+'</span><span class="earn-days" style="color:var(--am)">⚠️ 今日</span></div>').join(''):'<div style="font-size:11px;color:var(--tx3)">今日なし</div>')+'</div>';
    h+='</div>';
    // Top events
    if(d.topEvents?.length){
      h+='<div style="margin-bottom:8px"><div class="dc-title">🎯 今日注目すべき'+d.topEvents.length+'件</div>';
      h+=d.topEvents.map(ev=>{const hz=(ev.timeHorizon||'NEUTRAL').toLowerCase();const hzL=hz==='short'?'短期':hz==='medium'?'中期':hz==='long'?'長期':'様子見';return'<div class="ev-item" onclick="loadMkt(\''+esc(ev.symbol||'')+'\')"><div class="ev-hd"><span class="ev-sym">'+esc(ev.symbol||'')+'</span><span class="ev-hz '+hz+'">'+hzL+'</span>'+(ev.urgency?'<span class="ev-urg">'+'▮'.repeat(Math.min(5,ev.urgency))+'</span>':'')+'</div><div class="ev-desc">'+esc(ev.event||'')+'</div>'+(ev.whyMatters?'<div class="ev-why">→ '+esc(ev.whyMatters)+'</div>':'')+'</div>';}).join('');
      h+='</div>';
    }
    // Abnormal movers
    if(d.abnormalMovers?.length){h+='<div style="margin-bottom:8px"><div class="dc-title">⚡ 異常変動</div>';h+=d.abnormalMovers.map(m=>'<div style="display:flex;gap:6px;align-items:center;padding:4px 6px;background:var(--bg3);border-radius:5px;margin-bottom:2px;font-size:11px"><span style="font-weight:700;font-family:IBM Plex Mono,monospace">'+esc(m.symbol)+'</span><span style="color:'+(parseFloat(m.change)>0?'var(--ac)':'var(--rd)')+';font-family:IBM Plex Mono,monospace;font-weight:600">'+esc(m.change)+'</span><span style="color:var(--tx3);flex:1;font-size:10px">'+esc(m.reason||'')+'</span></div>').join('');h+='</div>';}
    // Noise
    if(d.noise?.length)h+='<div><div class="dc-title" style="color:var(--tx3)">🔇 無視してよい</div><div class="noise-list">'+d.noise.map(n=>'<span class="noise-item">'+esc(n)+'</span>').join('')+'</div></div>';
    h+='<div style="text-align:center;margin-top:8px"><button class="mbn" onclick="refreshDashboard()" style="font-size:10px;padding:3px 10px">↻ リセット</button></div>';
    body.innerHTML=h;
  }
  // Also post a compact summary to chat
  let chatH='<div class="briefing"><div class="briefing-title">📋 今日のポートフォリオ概況</div>';
  if(d.dailyVerdict)chatH+='<div style="font-size:12px;color:var(--tx2);margin-bottom:8px;padding:6px 8px;background:var(--bg3);border-radius:6px">'+esc(d.dailyVerdict)+'</div>';
  if(d.topEvents?.length)chatH+=d.topEvents.map(ev=>'<div class="briefing-item" onclick="loadMkt(\''+esc(ev.symbol||'')+'\')"><span class="briefing-sym">'+esc(ev.symbol||'')+'</span><span style="font-size:10px;color:var(--tx2)">'+esc((ev.event||'').slice(0,70))+'</span></div>').join('');
  chatH+='</div>';
  addMsg('ai',chatH,1);
}

// ═══ Portfolio ═══
function renderPort(){const list=Q('port-list');if(!list)return;let totalCost=0,totalVal=0;const rows=portfolio.map((p,i)=>{const cur=portPrices[p.symbol?.toUpperCase()];const hasPnl=cur?.price&&p.avgCost&&p.shares;let pnlHtml='';if(hasPnl){const pnl=(cur.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100;totalCost+=parseFloat(p.avgCost)*parseFloat(p.shares);totalVal+=cur.price*parseFloat(p.shares);pnlHtml='<span class="port-pnl '+(pnl>=0?'du':'dd')+'">'+(pnl>=0?'+':'')+pnl.toFixed(1)+'%</span>';}return'<div class="port-row"><input class="port-in" value="'+esc(p.symbol||'')+'" onchange="updPort('+i+',\'symbol\',this.value)" placeholder="AAPL"/><input class="port-in" value="'+(p.shares||'')+'" onchange="updPort('+i+',\'shares\',this.value)" placeholder="株数" style="width:50px"/><input class="port-in" value="'+(p.avgCost||'')+'" onchange="updPort('+i+',\'avgCost\',this.value)" placeholder="$" style="width:60px"/>'+pnlHtml+'<button class="port-del" onclick="delPort('+i+')">×</button></div>';});const totalPnl=totalCost>0?((totalVal-totalCost)/totalCost*100).toFixed(1):null;const totalHtml=totalPnl!=null?'<div class="port-total"><span>合计盈亏 <b style="color:'+(parseFloat(totalPnl)>=0?'var(--ac)':'var(--rd)')+'">'+(parseFloat(totalPnl)>=0?'+':'')+totalPnl+'%</b></span><span style="color:var(--tx2);font-size:10px">$'+totalVal.toFixed(0)+'</span></div>':'';list.innerHTML=rows.join('')+totalHtml;}
async function refreshPortPrices(){const syms=portfolio.filter(p=>p.symbol).map(p=>p.symbol.toUpperCase());if(!syms.length)return;const r=await ipcRenderer.invoke('batch-prices',{symbols:syms});if(r.ok){r.results.forEach(res=>{if(!res.error)portPrices[res.symbol]={price:res.price,change:res.change};});renderPort();}}
function addPortRow(){portfolio.push({symbol:'',shares:'',avgCost:''});renderPort();savePort();}
function updPort(i,k,v){portfolio[i][k]=v;savePort();}
function delPort(i){portfolio.splice(i,1);renderPort();savePort();}
async function savePort(){await ipcRenderer.invoke('save-portfolio',{portfolio});}
function calcSignalStats(history){const withO=history.filter(h=>h.outcome7d&&h.price);if(!withO.length)return null;const results=withO.map(h=>{const sig=(h.signal||'').toUpperCase();const chg=h.outcome7d.change;const bull=sig.includes('BUY')||sig.includes('BULL');const bear=sig.includes('SELL')||sig.includes('BEAR');const hit=bull?chg>0:bear?chg<0:Math.abs(chg)<3;return{hit,chg:bull||!bear?chg:-chg};});const wins=results.filter(r=>r.hit).length;const avg=results.reduce((a,r)=>a+r.chg,0)/results.length;return{total:results.length,wins,winRate:Math.round(wins/results.length*100),avg:avg.toFixed(1)};}
async function loadHistory(){
  const list=Q('hist-list');if(!list)return;
  list.innerHTML='<div style="text-align:center;color:var(--tx3);padding:8px;font-size:11px">確認中...</div>';
  const r=await ipcRenderer.invoke('check-signal-outcomes');
  if(!r.ok||!r.history?.length){list.innerHTML='<div style="text-align:center;color:var(--tx3);padding:8px;font-size:11px" id="hist-empty">'+L[lang].lbl_history+'</div>';return;}
  const stats=calcSignalStats(r.history);
  let html='';
  if(stats){const sc=stats.winRate>=60?'var(--ac)':stats.winRate>=45?'var(--am)':'var(--rd)';html+='<div class="sig-stats"><span>AI予測精度</span><span style="color:'+sc+';font-weight:700">勝率 '+stats.winRate+'%</span><span style="color:var(--tx2)">'+stats.wins+'/'+stats.total+'件</span><span style="color:'+(parseFloat(stats.avg)>=0?'var(--ac)':'var(--rd)')+'">平均 '+(parseFloat(stats.avg)>=0?'+':'')+stats.avg+'%</span></div>';}
  html+=r.history.slice(0,40).map(h=>{
    const sc=(h.signal==='BUY'||h.signal==='BULLISH')?'sb':(h.signal==='SELL'||h.signal==='BEARISH')?'ss':'sh';
    const sig=(h.signal||'').toUpperCase();const bull=sig.includes('BUY')||sig.includes('BULL');const bear=sig.includes('SELL')||sig.includes('BEAR');
    let outHtml='';
    if(h.outcome7d){const c=h.outcome7d.change;const hit=bull?c>0:bear?c<0:Math.abs(c)<3;outHtml='<span class="out-badge '+(hit?'out-hit':'out-miss')+'">'+(hit?'✓':'✗')+' '+(c>=0?'+':'')+c+'%</span>';}
    else if(h.price){const age=(Date.now()-h.timestamp)/86400000;outHtml='<span class="out-badge out-pend">'+(age<7?Math.ceil(7-age)+'日後':'確認中')+'</span>';}
    return'<div class="hist-item"><span class="hist-sym">'+esc(h.symbol)+'</span><span class="sig '+sc+'" style="font-size:9px;padding:2px 6px">'+(h.signal||'—')+'</span>'+(h.price?'<span style="font-size:10px;color:var(--tx2)">$'+sf(h.price)+'</span>':'')+outHtml+'<span class="hist-date">'+new Date(h.timestamp).toLocaleDateString()+'</span></div>';
  }).join('');
  list.innerHTML=html;
}
async function saveHistory(symbol,signal,score,summary,price){await ipcRenderer.invoke('save-history',{entry:{symbol,signal,score,summary:summary?.slice(0,200),price:price||null}});}


// ═══ Market Data ═══
async function loadMkt(sym){if(!sym?.trim())return;sym=sym.trim().toUpperCase();Q('mkt-body').innerHTML='<div style="text-align:center;color:var(--tx2);padding:12px;font-size:11px">...</div>';const r=await ipcRenderer.invoke('market-data',{symbol:sym});if(r.error){Q('mkt-body').innerHTML='<div class="errc">'+esc(r.error)+'</div>';return;}const d=r.data;mktData={sym,...d};const chg=parseFloat(d.change)||0;let h='<div class="dg">'+dc('Price','$'+sf(d.price),chg>0?'du':chg<0?'dd':'')+dc('Chg',(chg>0?'+':'')+sf(chg,2)+'%',chg>0?'du':chg<0?'dd':'')+dc('P/E',sf(d.trailingPE,1),'')+dc('52H','$'+sf(d.week52High),'du')+dc('52L','$'+sf(d.week52Low),'dd')+dc('Beta',sf(d.beta),'')+'</div>';if(d.tech){const t=d.tech;h+='<div class="tgg">'+tc('RSI',t.rsi+' '+t.rsiSig,parseFloat(t.rsi)>70?'var(--rd)':parseFloat(t.rsi)<30?'var(--ac)':'')+tc('Stoch',t.stochK+'% '+(t.stochSig||''),parseFloat(t.stochK)>80?'var(--rd)':parseFloat(t.stochK)<20?'var(--ac)':'')+tc('MACD',t.macd+' '+t.macdSig,parseFloat(t.macd)>0?'var(--ac)':'var(--rd)')+tc('EMA9×21',t.emaCross||'—',t.emaCross?.includes('ゴールデン')?'var(--ac)':'var(--rd)')+tc('OBV',t.obvDir||'—',t.obvDir?.includes('上昇')?'var(--ac)':t.obvDir?.includes('下降')?'var(--rd)':'')+tc('Trend',t.trend,'')+tc('Supp','$'+t.support,'var(--ac)')+tc('Res','$'+t.resistance,'var(--rd)')+'</div>';if(t.pivot)h+='<div class="tgg">'+tc('Pivot','$'+t.pivot,'var(--tx2)')+tc('R1','$'+(t.r1||'—'),'var(--rd)')+tc('S1','$'+(t.s1||'—'),'var(--ac)')+'</div>';}h+='<div class="snr">';if(d.fearGreed){const s=d.fearGreed.score;h+='<div class="snc"><div class="snl">F&G</div><div class="snv" style="color:'+(s<30?'var(--rd)':s>70?'var(--ac)':'var(--am)')+'">'+s+'</div></div>';}if(d.vix!=null)h+='<div class="snc"><div class="snl">VIX</div><div class="snv" style="color:'+(d.vix>30?'var(--rd)':d.vix>20?'var(--am)':'var(--ac)')+'">'+sf(d.vix,1)+'</div></div>';if(d.sp500Change)h+='<div class="snc"><div class="snl">S&P</div><div class="snv" style="color:'+(parseFloat(d.sp500Change)>0?'var(--ac)':'var(--rd)')+'">'+(parseFloat(d.sp500Change)>0?'+':'')+d.sp500Change+'%</div></div>';h+='</div>';
if(d.macro){const mx=d.macro;h+='<div class="tgg macro-row">';if(mx.dxy?.price)h+=tc('DXY',sf(mx.dxy.price,1)+(parseFloat(mx.dxy.change||0)>=0?' ▲':' ▼'),parseFloat(mx.dxy.change||0)>=0?'var(--rd)':'var(--ac)');if(mx.t10y?.price)h+=tc('10Y',sf(mx.t10y.price,2)+'%','var(--am)');if(mx.gold?.price)h+=tc('Gold','$'+sf(mx.gold.price,0),'var(--am)');if(mx.oil?.price)h+=tc('Oil','$'+sf(mx.oil.price,1),'var(--tx2)');h+='</div>';}
const hasEvt=d.earningsDays!=null||d.upcomingEvents?.length;if(hasEvt){h+='<div class="evt-row">';if(d.earningsDays!=null){const uc=d.earningsDays<=3?'var(--rd)':d.earningsDays<=7?'var(--am)':'var(--tx2)';h+='<span class="evt-badge" style="color:'+uc+';border-color:'+uc+'">📅 決算 '+d.earningsDays+'日後</span>';}(d.upcomingEvents||[]).forEach(e=>{const uc=e.daysUntil<=3?'var(--rd)':e.daysUntil<=7?'var(--am)':'var(--tx2)';h+='<span class="evt-badge" style="color:'+uc+';border-color:'+uc+'">🏛 '+esc(e.label)+' '+e.daysUntil+'日後</span>';});h+='</div>';}
if(d.newsSentiment){const {score,positive,negative,total}=d.newsSentiment;const sc=score>=60?'var(--ac)':score<=40?'var(--rd)':'var(--am)';h+='<div class="sent-wrap"><div class="sent-lbl">ニュース感情 <b style="color:'+sc+'">'+score+'点</b> <span style="color:var(--tx3);font-size:9px">+'+positive+' / -'+negative+' ('+total+'件)</span></div><div class="sent-bar"><div class="sent-fill" style="width:'+score+'%;background:'+sc+'"></div></div></div>';}
if(d.insiderTransactions?.length){h+='<div class="ins-title">インサイダー取引</div><div class="ins-list">';d.insiderTransactions.forEach(t=>{const buy=t.shares>0;h+='<div class="ins-row"><span class="ins-rel">'+esc(t.relation||t.name)+'</span><span class="ins-act '+(buy?'du':'dd')+'">'+(buy?'買':'売')+'</span><span class="ins-sh">'+sf(Math.abs(t.shares)/1000,1)+'K</span><span class="ins-dt">'+esc(t.date)+'</span></div>';});h+='</div>';}if(d.analystTarget&&d.analystCount){const cur=d.price||1,tgt=d.analystTarget,up=((tgt-cur)/cur*100).toFixed(1);const pct=d.analystHigh&&d.analystLow&&d.analystHigh!==d.analystLow?Math.min(100,Math.max(0,((cur-d.analystLow)/(d.analystHigh-d.analystLow))*100)):50;h+='<div class="anb"><div class="ani">'+d.analystCount+'人 → <b>$'+sf(tgt)+'</b> <b style="color:'+(up>0?'var(--ac)':'var(--rd)')+'">'+(up>0?'+':'')+up+'%</b></div><div class="ant"><div class="anf" style="width:'+pct+'%"></div></div><div class="anr"><span>$'+sf(d.analystLow,0)+'</span><span>$'+sf(tgt,0)+'</span><span>$'+sf(d.analystHigh,0)+'</span></div></div>';}if(!Q('pnl-market').classList.contains('open'))togP('market');Q('mkt-body').innerHTML=h;}
function dc(l,v,c){return'<div class="dc"><div class="dl">'+l+'</div><div class="dv '+c+'">'+v+'</div></div>';}
function tc(l,v,c){return'<div class="tc"><span class="tcl">'+l+'</span><span class="tcv"'+(c?' style="color:'+c+'"':'')+'>'+v+'</span></div>';}

// ═══ TradingView ═══
async function tvConn(){const r=await ipcRenderer.invoke('tv-connect');if(!r.ok)addMsg('ai','⚠️ TradingView未接続');}
async function tvRef(){const r=await ipcRenderer.invoke('tv-state');if(r.ok&&r.data){tvData=r.data;Q('tv-sym').textContent=r.data.sym||'—';Q('tv-price').textContent=r.data.price||'—';Q('tv-tf').textContent=r.data.tf||'—';if(r.data.inds?.length){Q('tv-inds').style.display='block';Q('tv-inds').textContent=r.data.inds.map(i=>i.n+(i.v?' '+i.v:'')).join(' · ');}}}
async function tvSet(s){if(!s.trim())return;await ipcRenderer.invoke('tv-symbol',s.trim().toUpperCase());Q('sym-tv').value='';setTimeout(tvRef,1200);}
async function tvAnalyze(){await tvRef();Q('inp').value=lang==='ja'?'チャートを分析して':lang==='zh'?'分析图表':'Analyze chart';doSend();}
async function doCapture(){const r=await ipcRenderer.invoke('capture',{quality:80});if(r.ok){rmW();addMsg('ai','<div class="scr"><img src="data:image/jpeg;base64,'+r.img+'"/><div class="scrb"><span>📸</span><span>'+new Date().toLocaleTimeString()+'</span></div></div>',1);}else addMsg('ai','❌ '+esc(r.error||''));}
// ═══ Smart Monitor (CDP real-time) ═══
async function togAuto(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  if(smartOn){stopSmart();return;}
  // Start smart monitor
  smartOn=true;
  Q('autobar').style.display='flex';Q('auto-btn').classList.add('tba');
  const iv=parseInt(Q('auto-intv').value)||5;
  Q('auto-lbl').textContent='LIVE '+iv+'s';
  await ipcRenderer.invoke('smart-monitor-start',{key:ak,model:activeModel(),lang,triggers:userTriggers,interval:iv});
  addMsg('ai','<div class="prose">'+md('🔴 **スマート監視ON** ('+iv+'秒)\n\nTradingView Chart API経由でリアルタイムデータ取得中\n\n**自動検出トリガー:**\n- 価格スパイク（5秒で1%以上変動）\n- RSI 30以下/70以上ゾーン突入\n- 1分間で2%以上のモメンタム\n- MACDゴールデン/デッドクロス\n- ボリンジャーバンド上限/下限ブレイク\n\n● = Chart API接続 ○ = DOMフォールバック')+'</div>',1);
}
async function stopSmart(){smartOn=false;Q('autobar').style.display='none';Q('auto-btn').classList.remove('tba');await ipcRenderer.invoke('smart-monitor-stop');const ticker=Q('live-ticker');if(ticker)ticker.style.display='none';addMsg('ai','<div class="prose">'+md('⏹ スマート監視OFF')+'</div>',1);}
async function stopAuto(){stopSmart();}
async function chgIntv(){if(!smartOn)return;const ak=activeAPIKey();if(!ak)return;await ipcRenderer.invoke('smart-monitor-stop');const iv=parseInt(Q('auto-intv').value)||5;await ipcRenderer.invoke('smart-monitor-start',{key:ak,model:activeModel(),lang,triggers:userTriggers,interval:iv});Q('auto-lbl').textContent='LIVE '+iv+'s';}

// ═══ Lite Mode: Quick Analysis (A→D→E) ═══
async function runLite(userInstr){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}if(busy)return;
  busy=true;Q('sndb').disabled=true;Q('stpb').style.display='flex';
  const sym=tvData?.sym||mktData?.sym||'';
  if(!sym){addMsg('ai','⚠️ 📊で銘柄データを取得してください');endB();return;}
  if(wTV)await tvRef();let img=null;if(wScr){const r=await ipcRenderer.invoke('capture',{quality:70});if(r.ok)img=r.img;}
  Q('agbar').style.display='block';['A','B','C','D','E','F'].forEach(a=>Q('ag-'+a).className='agcp');
  const thk=showThk('⚡ '+L[lang].tb_quick+'...');
  const r=await ipcRenderer.invoke('run-lite',{keys:keysPayload(),symbol:sym,marketData:mktData,tvState:tvData,screenshot:img,lang,userInstruction:userInstr,portfolio:portfolio.filter(p=>p.symbol)});
  thk.remove();Q('agbar').style.display='none';
  if(r.error&&!r.partialResults){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);}
  else{const res=r.results||r.partialResults||{};lastHF=res;let h='';if(img)h+=scrTag(img);h+=buildRpt(res,sym,'lite');addMsg('ai',h,1);const e=res.E||{};saveHistory(sym,e.finalVerdict||'HOLD',e.score||5,e.summary||'',mktData?.price);}
  endB();
}

// ═══ Full 6-Agent ═══
async function runHF(userInstr){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}if(busy)return;
  busy=true;Q('sndb').disabled=true;Q('stpb').style.display='flex';
  const sym=tvData?.sym||mktData?.sym||'';
  if(!sym){addMsg('ai','⚠️ 📊で銘柄データを取得してください');endB();return;}
  if(wTV)await tvRef();let img=null;if(wScr){const r=await ipcRenderer.invoke('capture',{quality:70});if(r.ok)img=r.img;}
  Q('agbar').style.display='block';['A','B','C','D','E','F'].forEach(a=>Q('ag-'+a).className='agcp');
  const thk=showThk('🏛 '+L[lang].tb_full+'...');
  const r=await ipcRenderer.invoke('run-agents',{keys:keysPayload(),symbol:sym,marketData:mktData,tvState:tvData,screenshot:img,lang,userInstruction:userInstr,portfolio:portfolio.filter(p=>p.symbol)});
  thk.remove();Q('agbar').style.display='none';
  if(r.error&&!r.partialResults){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);}
  else{const res=r.results||r.partialResults||{};lastHF=res;let h='';if(img)h+=scrTag(img);h+=buildRpt(res,sym,'full');addMsg('ai',h,1);const e=res.E||{};saveHistory(sym,e.finalVerdict||'HOLD',e.score||5,e.summary||'',mktData?.price);}
  endB();
}

// ═══ Conclusion-First Report ═══
function buildRpt(res,sym,mode){
  const e=res.E||{};const v=(e.finalVerdict||'HOLD').toUpperCase();
  const sc=e.score||e.confidence||5;const stars=s2s(Math.round(sc/2));
  const sigC=(v.includes('BUY')||v.includes('BULLISH'))?'sb':(v.includes('SELL')||v.includes('BEARISH'))?'ss':(v.includes('WAIT')||v.includes('WATCH'))?'sw':'sh';
  const sigT=v.includes('BULLISH')?L[lang].buy:v.includes('BEARISH')?L[lang].sell:v.includes('NEUTRAL')?L[lang].hold:v.includes('WATCH')?L[lang].wait:(L[lang][v.toLowerCase()]||v);

  let h='<div class="rpt"><div class="rpth"><span class="rptt">'+(mode==='lite'?'⚡':'🏛')+' '+sym+'</span><div class="rptm"><span class="rpts">'+stars+'</span><span class="sig '+sigC+'">'+sigT+' '+sc+'/10</span></div></div>';

  // HERO: Conclusion first with entry condition
  h+='<div class="rpt-hero"><div class="rpt-hero-verdict" style="color:'+((v.includes('BUY')||v.includes('BULLISH'))?'var(--ac)':(v.includes('SELL')||v.includes('BEARISH'))?'var(--rd)':'var(--am)')+'">'+(e.summary?esc(e.summary).slice(0,150)+'...':sigT)+'</div>';
  if(e.entryCondition)h+='<div class="rpt-hero-entry"><strong>📍 '+L[lang].entry_wait+':</strong> '+esc(e.entryCondition)+'</div>';
  if(e.avoidEvents?.length)h+='<div class="rpt-hero-avoid">🚫 '+esc(e.avoidEvents.join(' · '))+'</div>';
  // Time horizon + risk level badges
  const hz=(e.timeHorizon||'').toLowerCase();const rl=(e.riskLevel||'').toLowerCase();
  if(hz||rl)h+='<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">'+(hz?'<span class="hz-badge '+hz+'">'+(hz==='short'?'📅 '+L[lang].time_horizon+': 短期':hz==='medium'?'📆 '+L[lang].time_horizon+': 中期':hz==='long'?'🗓 '+L[lang].time_horizon+': 長期':'⏸ 様子見')+'</span>':'')+(rl?'<span class="rl-badge rl-'+rl+'">⚡ '+L[lang].risk_level+': '+(rl==='low'?'LOW':rl==='medium'?'MEDIUM':rl==='high'?'HIGH':'CRITICAL')+'</span>':'')+'</div>';
  // Why it matters to you
  if(e.whyMattersToUser)h+='<div class="why-box"><div class="why-lbl">💡 '+L[lang].why_matters+'</div><div class="why-txt">'+esc(e.whyMattersToUser)+'</div></div>';
  // Price tags from B if available
  const b=res.B||{};if(b.entry||b.target||b.stopLoss)h+='<div class="ptgs" style="margin-top:8px">'+(b.entry?'<span class="ptg pte">Entry $'+b.entry+'</span>':'')+(b.target?'<span class="ptg ptt">Target $'+b.target+'</span>':'')+(b.stopLoss?'<span class="ptg ptst">Stop $'+b.stopLoss+'</span>':'')+'</div>';
  if(e.prediction)h+='<div class="pdg"><div class="pdc"><div class="pdl">短期 1-2w</div><div class="pdv">'+(e.prediction.shortTerm||'—')+'</div></div><div class="pdc"><div class="pdl">中期 1-3m</div><div class="pdv">'+(e.prediction.midTerm||'—')+'</div></div><div class="pdc"><div class="pdl">長期 6-12m</div><div class="pdv">'+(e.prediction.longTerm||'—')+'</div></div></div>';
  // Confidence bar
  const confRaw=e.confidence||e.score*10||50;const confPct=confRaw>10?Math.min(100,Math.round(confRaw)):Math.min(100,Math.round(confRaw*10));
  const confClr=(v.includes('BUY')||v.includes('BULLISH'))?'var(--ac)':(v.includes('SELL')||v.includes('BEARISH'))?'var(--rd)':'var(--am)';
  h+='<div class="conf-row"><span style="font-size:9px;color:var(--tx3);font-family:IBM Plex Mono,monospace;flex-shrink:0">CONF</span><div class="conf-bar"><div class="conf-fill" style="width:'+confPct+'%;background:'+confClr+'"></div></div><span class="conf-pct">'+confPct+'%</span></div>';
  h+='</div>';

  // Detail sections (all collapsed by default)
  const agents=[];
  agents.push({k:'A',cls:'ba',role:'QUANT',fn:a=>{if(a.parseError)return md(trn(a.raw));let t=md('**'+(a.signal||'—')+'** '+sf(a.score,0)+'/10 · 信頼度'+(a.confidence||'—')+'%\n'+(a.analysis||''));if(a.patterns?.length)t+='<div style="margin-top:5px"><span style="font-size:9px;font-family:IBM Plex Mono,monospace;color:var(--bl)">📈 PATTERN</span> <span style="font-size:11px">'+esc(a.patterns.join(' · '))+'</span></div>';if(a.maConfluence)t+='<div style="font-size:11px;color:var(--tx2);margin-top:3px">📊 MA: '+esc(a.maConfluence)+'</div>';if(a.volAnalysis)t+='<div style="font-size:11px;color:var(--tx2);margin-top:3px">📦 Vol: '+esc(a.volAnalysis)+'</div>';if(a.risks?.length)t+='<div style="margin-top:5px;font-size:11px;color:var(--rd)">⚠️ '+esc(a.risks.join(' · '))+'</div>';if(a.catalysts?.length)t+='<div style="font-size:11px;color:var(--ac)">🚀 '+esc(a.catalysts.join(' · '))+'</div>';return t;}});
  agents.push({k:'D',cls:'bd',role:'RISK',fn:d=>{const rs=d.riskScore||5;let t='<strong style="color:'+(d.decision==='GO'?'var(--ac)':d.decision==='NO-GO'?'var(--rd)':'var(--am)')+'">'+( d.decision||'—')+'</strong> Risk:'+rs+'/10';t+='<div class="rkb">'+Array.from({length:10},(_,i)=>'<div class="rks '+(i<rs?(rs<=3?'rkl':rs<=6?'rkm':'rkh'):'')+'"></div>').join('')+'</div>';if(d.warnings?.length)t+='⚠️ '+esc(d.warnings.join(' · '))+'<br>';if(d.killSwitch?.length)t+='🛑 '+esc(d.killSwitch.join(' · '))+'<br>';if(d.eventRisks?.length)t+='📅 '+esc(d.eventRisks.join(' · '));return t;}});
  if(mode==='full'){
    agents.push({k:'B',cls:'bb',role:'PORTFOLIO',fn:b2=>{let t=b2.parseError?md(trn(b2.raw)):md('**'+(b2.positionSize||'—')+'** ケリー:'+(b2.kellyFraction||'—')+' R:R='+(b2.riskReward||'—')+'\n'+(b2.strategy||''));return t;}});
    agents.push({k:'C',cls:'bc',role:'EXECUTION',fn:c=>c.parseError?md(trn(c.raw)):md('**'+(c.orderType||'—')+'** '+(c.urgency||'')+'\n'+(c.executionPlan||''))});
  }
  agents.push({k:'E',cls:'be',role:'CEO',fn:e2=>{let t=e2.parseError?md(trn(e2.raw,500)):md(e2.summary||'');if(e2.keyReasons?.length)t+=e2.keyReasons.map((r,i)=>'<div class="li"><span class="lin">'+(i+1)+'</span><span>'+esc(r)+'</span></div>').join('');if(e2.actionPlan)t+='<div style="margin-top:6px"><strong>Action:</strong> '+esc(e2.actionPlan)+'</div>';return t;}});
  if(mode==='full'){agents.push({k:'F',cls:'bf',role:'LEARN',fn:f=>(!f||f.parseError||!f.overallGrade)?null:'<strong>Grade: '+f.overallGrade+'</strong> A:'+sf(f.scores?.A,0)+' B:'+sf(f.scores?.B,0)+' C:'+sf(f.scores?.C,0)+' D:'+sf(f.scores?.D,0)+' E:'+sf(f.scores?.E,0)+(f.feedback?'<br>'+esc(f.feedback):'')+(f.blindSpots?.length?'<br>🔍 '+esc(f.blindSpots.join(', ')):'')});}

  agents.forEach(ag=>{const data=res[ag.k]||{};const body=ag.fn(data);if(body===null)return;h+='<div class="asec collapsed"><div class="asech" onclick="this.parentElement.classList.toggle(\'collapsed\')"><span class="asecb '+ag.cls+'">'+ag.k+'</span><span class="asecr">'+ag.role+'</span><span class="asecar">▼</span></div><div class="asecbd">'+body+'</div></div>';});
  h+=disclaimerHTML(sym)+'</div>';return h;
}

// ═══ Multi-AI ═══
async function doMulti(){
  const gk=key,ck=keyClaude,ok=keyOpenAI,dk=keyDeepSeek;
  const availKeys=[{k:gk,p:'gemini',ai:'Gemini',m:model},{k:ck,p:'claude',ai:'Claude',m:Q('model-claude')?.value||'claude-sonnet-4-20250514'},{k:ok,p:'openai',ai:'GPT-4o',m:Q('model-openai')?.value||'gpt-4o'},{k:dk,p:'deepseek',ai:'DeepSeek',m:Q('model-deepseek')?.value||'deepseek-chat'}].filter(x=>x.k);
  if(!availKeys.length){togP('settings');return;}
  if(availKeys.length<2){addMsg('ai','<div class="prose">'+md('⚠️ **AI辩论需要 2 个以上 API Key**')+'</div>',1);return;}
  if(busy)return;busy=true;Q('sndb').disabled=true;
  const sym=tvData?.sym||mktData?.sym||'';
  const li=L[lang].li;
  const ctx=mktData?.tech?`${sym} $${sf(mktData.price)} RSI:${mktData.tech.rsi} Stoch:${mktData.tech.stochK}% MACD:${mktData.tech.macd}(${mktData.tech.macdSig}) EMA:${mktData.tech.emaCross} OBV:${mktData.tech.obvDir} Trend:${mktData.tech.trend} BB%:${mktData.tech.bbPct} Supp:$${mktData.tech.support} Res:$${mktData.tech.resistance}${mktData.tech.pivot?' Pivot:$'+mktData.tech.pivot:''}`:`${sym}`;
  let img=null;if(wScr){const r=await ipcRenderer.invoke('capture',{quality:70});if(r.ok)img=r.img;}
  // Assign roles: Bull → Bear → Judge, cycle if fewer models
  const roles=['bull','bear','judge'];
  const roleLabels={bull:{label:'🐂 BULL',cls:'debate-bull',color:'var(--ac)'},bear:{label:'🐻 BEAR',cls:'debate-bear',color:'var(--rd)'},judge:{label:'⚖️ JUDGE',cls:'debate-judge',color:'var(--pu)'}};
  const rolePrompts={
    bull:`${li}あなたは強気論者（Bull）。${sym}に対して強気になれる根拠だけを3-5点挙げよ。弱気論は無視。研究メモとして出力。データ:${ctx}`,
    bear:`${li}あなたは弱気論者（Bear）。${sym}に対して弱気になれるリスクだけを3-5点挙げよ。強気論は無視。研究メモとして出力。データ:${ctx}`,
    judge:`${li}あなたは中立の裁判官（Judge）。Bull論とBear論を踏まえて総合評価せよ。スコア(1-10)・信頼度(0-100%)・結論・次に確認すべき条件を示す。研究メモとして出力。データ:${ctx}`
  };
  const debates=availKeys.slice(0,3).map((kObj,i)=>{
    const role=roles[i]||roles[roles.length-1];
    const content=[];
    if(img&&i===0)content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}});
    content.push({type:'text',text:rolePrompts[role]});
    return{key:kObj.k,model:kObj.m,ai:kObj.ai,role,messages:[{role:'user',content}]};
  });
  // If only 2 keys, skip judge and use multi-ai consensus fallback
  const thk=showThk('⚔️ AI 辩论中... Bull vs Bear vs Judge');
  const r=await ipcRenderer.invoke('debate-ai',{debates});
  thk.remove();
  if(!r.ok){addMsg('ai','❌ '+(r.error||''));endB();return;}
  const results=r.results||[];
  let h='<div class="cns"><div class="cnsh"><span class="cnst">⚔️ '+esc(sym||'AI 辩论')+'</span><span class="sig sh">DEBATE</span></div>';
  let judgeResult=null;
  results.forEach(x=>{
    if(x.error){h+='<div class="aisec"><div class="aish"><span class="aisn">'+esc(x.ai)+'</span></div><div style="color:var(--rd);font-size:11px">'+esc(x.error)+'</div></div>';return;}
    const rl=roleLabels[x.role]||roleLabels.judge;
    if(x.role==='judge')judgeResult=x;
    h+='<div class="debate-card"><div class="debate-hd '+rl.cls+'" style="color:'+rl.color+'">'+rl.label+' <span style="opacity:.6;font-size:9px">via '+esc(x.ai)+'</span></div><div class="debate-body">'+md(x.text||'')+'</div></div>';
  });
  // If only 2 results (no judge), compute simple consensus
  if(!judgeResult&&results.length>=2){
    const bullTxt=(results.find(x=>x.role==='bull')?.text||'').toUpperCase();
    const bearTxt=(results.find(x=>x.role==='bear')?.text||'').toUpperCase();
    const bScore=bullTxt.match(/SCORE[：:\s]*(\d+)/i)?parseInt(bullTxt.match(/SCORE[：:\s]*(\d+)/i)[1]):5;
    const con=bScore>=6?'LEAN BULLISH':bScore<=4?'LEAN BEARISH':'MIXED';
    h+='<div class="debate-verdict"><span style="font-size:11px;color:var(--tx3)">⚖️ 判定:</span><span class="sig sh">'+con+'</span><span style="font-size:11px;color:var(--tx2)">Bull: '+bScore+'/10</span></div>';
  }
  h+=disclaimerHTML(sym)+'</div>';
  addMsg('ai',h,1);endB();
}

// ═══ Chat ═══
async function doSend(){if(busy)return;const inp=Q('inp');const text=inp.value.trim();if(!text)return;const ak=activeAPIKey();if(!ak){togP('settings');return;}const mdl=activeModel();inp.value='';inp.style.height='auto';inp.focus();enterReady=false;Q('sndb').classList.remove('ready');Q('ibx').classList.remove('ready');busy=true;Q('sndb').disabled=true;Q('stpb').style.display='flex';addMsg('user',text);
  if(/6.?agent|ヘッジ|hedge|全エージェント|フル分析|全分析|詳細分析/i.test(text)){runHF(text);return;}
  if(/クイック|quick|快速|⚡/i.test(text)){runLite(text);return;}
  if(lastHF&&/ポジション|リスク|承認|詳しく|もっと|半分|倍|position|risk|approve|detail|仓位|风险/i.test(text)){const thk=showThk('👔 ...');const r=await ipcRenderer.invoke('agent-chat',{key:ak,model:mdl,message:text,agentResults:lastHF,marketData:mktData,lang});thk.remove();addMsg('ai','<div class="prose">'+md(r.ok?r.text:'❌ '+esc(r.error))+'</div>',1);endB();return;}
  if(wTV)await tvRef();let img=null;if(wScr){const r=await ipcRenderer.invoke('capture',{quality:75});if(r.ok)img=r.img;}
  const isPine=pineMode||/pine|script|指標|インジケーター|戦略|strategy|indicator/i.test(text);const sym=tvData?.sym||mktData?.sym||'';const li=L[lang].li;let ctx='';if(wMkt&&mktData)ctx+='\n['+mktData.sym+'] $'+sf(mktData.price)+' '+sf(mktData.change,2)+'% RSI:'+(mktData.tech?.rsi||'')+' MACD:'+(mktData.tech?.macd||'')+' Trend:'+(mktData.tech?.trend||'')+' F&G:'+(mktData.fearGreed?.score||'')+' VIX:'+sf(mktData.vix,1);if(wTV&&tvData)ctx+='\n[TV] '+(tvData.sym||'')+' '+(tvData.price||'')+' TF:'+(tvData.tf||'');
  const portCtx=portfolio.filter(p=>p.symbol).length?'\n[保有] '+portfolio.filter(p=>p.symbol).map(p=>p.symbol+' '+p.shares+'株@$'+p.avgCost).join(', '):'';
  const sys=isPine?'Expert Pine Script v5. '+li+' Write ```pinescript```':'あなたは20年以上の経験を持つエリートアナリストです。'+li+'\n'+ctx+portCtx+'\n\n【ルール】具体的数値必須。テクニカル・ファンダ・マクロ詳細分析。\n## '+L[lang].reason+'\n## '+L[lang].result+'\n## '+L[lang].summary+'\nRating: X/10 | Entry: $X | Target: $X (+X%) | Stop: $X (-X%)\n## '+L[lang].conclusion+'\n質問に対する明確な回答と判断理由を簡潔に。';
  const content=[];if(img)content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}});content.push({type:'text',text:text});
  const thk=showThk(L[lang].lbl_analyzing);
  // Use context-aware AI if smart monitor has live data
  let streamContext=null;
  if(smartOn&&liveData){
    const sc=await ipcRenderer.invoke('get-stream-context');
    if(sc.ok)streamContext={...sc.current,recentPrices:sc.recentPrices};
  }
  const r=await ipcRenderer.invoke(streamContext?'ai-with-context':'ai',{key:ak,model:mdl,messages:[{role:'system',content:sys},...hist.slice(-8),{role:'user',content}],search:wSrch,streamContext});thk.remove();
  if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);}else{const pm=r.text.match(/```(?:pine(?:script)?)\n([\s\S]*?)```/i);if(pm){const code=pm[1].trim();const expl=r.text.replace(/```[\s\S]*?```/g,'').trim();let h='';if(img)h+=scrTag(img);if(expl)h+='<div class="prose">'+md(expl)+'</div>';h+=buildPine(code);addMsg('ai',h,1);}else if(r.text.match(/BUY|SELL|HOLD|買|売|Rating:/i)){let h='';if(img)h+=scrTag(img);h+=buildCard(r.text,sym);addMsg('ai',h,1);}else{let h='';if(img)h+=scrTag(img);h+='<div class="prose">'+md(r.text)+'</div>';addMsg('ai',h,1);}hist.push({role:'user',content:text},{role:'assistant',content:r.text});if(hist.length>16)hist=hist.slice(-16);}endB();}

function endB(){busy=false;Q('sndb').disabled=false;Q('stpb').style.display='none';}
function doStop(){endB();document.querySelectorAll('.thk-row').forEach(e=>e.remove());}
function scrTag(img){return'<div class="scr"><img src="data:image/jpeg;base64,'+img+'"/><div class="scrb"><span>📸</span><span>'+new Date().toLocaleTimeString()+'</span></div></div>';}

function buildCard(raw,sym){const t=raw.toUpperCase();const sig=t.includes('BUY')||t.includes('買')?'BUY':t.includes('SELL')||t.includes('売')?'SELL':'HOLD';const sigC=sig==='BUY'?'sb':sig==='SELL'?'ss':'sh';const sm=raw.match(/(\d+(?:\.\d+)?)\/10/);const score=sm?parseFloat(sm[1]):5;const entry=(raw.match(/Entry[：:\s]*\$?([\d,.]+)/i)||[])[1];const target=(raw.match(/Target[：:\s]*\$?([\d,.]+)/i)||[])[1];const stop=(raw.match(/Stop[：:\s]*\$?([\d,.]+)/i)||[])[1];const sec=splitSec(raw);let h='<div class="rpt"><div class="rpth"><span class="rptt">📊 '+(sym||'')+'</span><div class="rptm"><span class="rpts">'+s2s(Math.round(score/2))+'</span><span class="sig '+sigC+'">'+(L[lang][sig.toLowerCase()]||sig)+' '+score+'/10</span></div></div>';if(sec.conclusion)h+='<div class="rpt-hero" style="border-left:3px solid var(--ac)"><div class="rpt-hero-verdict" style="color:var(--ac)">🎯 '+md(sec.conclusion)+'</div></div>';if(sec.reason)h+='<div class="asec collapsed"><div class="asech" onclick="this.parentElement.classList.toggle(\'collapsed\')"><span class="asecb ba">📋</span><span class="asecr">'+L[lang].reason+'</span><span class="asecar">▼</span></div><div class="asecbd prose">'+md(sec.reason)+'</div></div>';if(sec.result)h+='<div class="asec collapsed"><div class="asech" onclick="this.parentElement.classList.toggle(\'collapsed\')"><span class="asecb bb">📊</span><span class="asecr">'+L[lang].result+'</span><span class="asecar">▼</span></div><div class="asecbd prose">'+md(sec.result)+'</div></div>';const sb=sec.summary||((!sec.reason&&!sec.result&&!sec.conclusion)?raw:'');if(sb)h+='<div class="asec"><div class="asech" onclick="this.parentElement.classList.toggle(\'collapsed\')"><span class="asecb be">⭐</span><span class="asecr">'+L[lang].summary+'</span><span class="asecar">▼</span></div><div class="asecbd prose">'+md(sb)+((entry||target||stop)?'<div class="ptgs">'+(entry?'<span class="ptg pte">Entry $'+entry+'</span>':'')+(target?'<span class="ptg ptt">Target $'+target+'</span>':'')+(stop?'<span class="ptg ptst">Stop $'+stop+'</span>':'')+'</div>':'')+'</div></div>';h+=disclaimerHTML(sym)+'</div>';return h;}
function splitSec(t){const o={};const a=t.match(/^##\s+(?:📋\s*)?(?:分析理由|Reasoning|理由)[^\n]*\n([\s\S]*?)(?=^##\s|$)/im);if(a)o.reason=a[1].trim();const b=t.match(/^##\s+(?:📊\s*)?(?:分析結果|分析结果|Analysis)[^\n]*\n([\s\S]*?)(?=^##\s|$)/im);if(b)o.result=b[1].trim();const c=t.match(/^##\s+(?:⭐\s*)?(?:まとめ|总结|Summary)[^\n]*\n([\s\S]*?)(?=^##\s|$)/im);if(c)o.summary=c[1].trim();const d=t.match(/^##\s+(?:🎯\s*)?(?:結論|结论|Conclusion)[^\n]*\n([\s\S]*?)(?=^##\s|$)/im);if(d)o.conclusion=d[1].trim();return o;}
function s2s(n){return'⭐'.repeat(Math.max(0,Math.min(5,n||0)))+'☆'.repeat(5-Math.max(0,Math.min(5,n||0)));}
function buildPine(code){const id='p'+Date.now();return'<div class="pnc"><div class="pnh"><span class="pnt">🟣 Pine Script v5</span><span class="pnl2">'+code.split('\n').length+' lines</span></div><div class="pncd" id="'+id+'">'+esc(code)+'</div><div class="pnf"><button class="pnbn pnj" onclick="doPine('+JSON.stringify(code)+')">▶ INJECT</button><button class="pnbn pncp" onclick="cpCode(\''+id+'\')">📋 COPY</button></div></div>';}
async function doPine(code){const thk=showThk('...');const r=await ipcRenderer.invoke('tv-set-pine',code);thk.remove();if(r.ok)setTimeout(async()=>{const c=await ipcRenderer.invoke('tv-compile');addMsg('ai',c.ok?'✅':'✅ 注入済み');},500);else addMsg('ai','❌ '+esc(r.error||''));}
function cpCode(id){const el=document.getElementById(id);if(el)navigator.clipboard.writeText(el.innerText);}
function rmW(){const w=Q('wlc');if(w)w.remove();}
function copyMsg(btn){const b=btn.closest('.mbb');if(!b)return;const c=b.cloneNode(true);c.querySelectorAll('.msg-actions,.copy-btn,.export-btn').forEach(x=>x.remove());const text=(c.innerText||'').replace(/\n{3,}/g,'\n\n').trim();navigator.clipboard.writeText(text).then(()=>{btn.classList.add('copied');btn.innerHTML='✓';setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML=ico('clipboard','sm');},1200);}).catch(()=>{});}
async function exportMsg(btn){const b=btn.closest('.mbb');if(!b)return;const c=b.cloneNode(true);c.querySelectorAll('.msg-actions,.copy-btn,.export-btn').forEach(x=>x.remove());const content=(c.innerText||'').replace(/\n{3,}/g,'\n\n').trim();const r=await ipcRenderer.invoke('export-report',{title:'stockai-report',content:'# StockAI Report\n\n'+content+'\n'});btn.classList.add('copied');btn.innerHTML=r.ok?'✓':'!';setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML=ico('download','sm');},1200);}
function addCopyBtn(bub){const box=document.createElement('div');box.className='msg-actions';const copy=document.createElement('button');copy.className='copy-btn';copy.title='复制这条内容';copy.innerHTML=ico('clipboard','sm');copy.onclick=e=>{e.stopPropagation();copyMsg(copy);};const exp=document.createElement('button');exp.className='export-btn';exp.title='导出 Markdown 报告';exp.innerHTML=ico('download','sm');exp.onclick=e=>{e.stopPropagation();exportMsg(exp);};box.append(copy,exp);bub.appendChild(box);}
function addMsg(role,content,isH){rmW();const m=Q('msgs'),row=document.createElement('div');row.className='mr'+(role==='user'?' user':'');const av=document.createElement('div');av.className='mav '+(role==='user'?'user':'ai');av.textContent=role==='user'?'U':'AI';const bub=document.createElement('div');bub.className='mbb';if(isH)bub.innerHTML=content;else bub.textContent=content;addCopyBtn(bub);row.appendChild(av);row.appendChild(bub);m.appendChild(row);m.scrollTop=m.scrollHeight;return bub;}
function showThk(txt){rmW();const m=Q('msgs'),row=document.createElement('div');row.className='mr thk-row';row.innerHTML='<div class="mav ai">AI</div><div class="thk"><div class="dtl"><span></span><span></span><span></span></div>'+txt+'</div>';m.appendChild(row);m.scrollTop=m.scrollHeight;return row;}
function md(t){if(!t)return'';const cb=[];t=t.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,l,c)=>{cb.push(c.trim());return'%%C'+(cb.length-1)+'%%';});t=esc(t).replace(/^####\s+(.+)$/gm,'<h4>$1</h4>').replace(/^###\s+(.+)$/gm,'<h3>$1</h3>').replace(/^##\s+(.+)$/gm,'<h2>$1</h2>').replace(/^#\s+(.+)$/gm,'<h2>$1</h2>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/^[-•·]\s+(.+)$/gm,'<div class="li"><span class="lid">•</span><span>$1</span></div>').replace(/^(\d+)\.\s+(.+)$/gm,'<div class="li"><span class="lin">$1.</span><span>$2</span></div>').replace(/^---+$/gm,'<hr>').replace(/^&gt;\s*(.+)$/gm,'<blockquote>$1</blockquote>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\n\n+/g,'<div style="margin:6px 0"></div>').replace(/\n/g,'<br>');cb.forEach((c,i)=>{t=t.replace('%%C'+i+'%%','<pre>'+esc(c)+'</pre>');});return t;}
