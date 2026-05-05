const isElectron=!!window.stockai?.invoke;
const stockai=window.stockai||{
  invoke:async()=>({error:'页面预览版只能看界面，完整功能请用 Electron 版 StockAI 打开'}),
  on:()=>()=>{}
};
const ipcRenderer=stockai;
let key='',lang='zh',model='gemini-2.5-flash',keyClaude='',keyOpenAI='',keyDeepSeek='';
let wScr=true,wTV=true,wMkt=true,wSrch=true;
let busy=false,hist=[],tvData=null,mktData=null,lastHF=null;
let autoOn=false,lgMode=false,pineMode=false,portfolio=[],watchlist=[],dashData=null,portPrices={},virtualWallet=null;
let dashboardBriefMode='daily';
let theme=localStorage.getItem('sai_theme')||'dark';
let enterReady=false,smartOn=false,liveData=null,userTriggers=[];
let chats=[{id:0,name:'Chat 1',hist:[],msgs:[]}],activeChat=0,chatIdCounter=1;

const L={
  ja:{ph:'銘柄コードや質問を入力',li:'日本語で回答してください。',reason:'分析理由',result:'分析結果',summary:'まとめ',conclusion:'結論',buy:'強気 ▲',sell:'弱気 ▼',hold:'中立 ◆',wait:'観察 ◇',wlcTitle:'AI株式研究アシスタント',wlc:'銘柄コードやTradingViewチャートから、相場要約・リスク・注目材料・観察ポイントを整理します。',appTitle:'StockAI',appBadge:'AI RESEARCH',appSubtitle:'',navTools:'TOOLS',
    tb_capture:'スクリーン',tb_chart:'チャート分析',tb_quick:'クイック分析',tb_full:'詳細分析',tb_consensus:'AI合議',tb_monitor:'リアルタイム監視',
    btn_save:'保存',btn_fetch:'取得',btn_add:'+ 追加',btn_update:'更新',btn_analyze:'分析',
    lbl_lang:'言語',lbl_free:'無料',lbl_ticker:'ティッカーを入力',lbl_history:'分析履歴なし',lbl_symbol:'銘柄変更',lbl_newchat:'新規チャット',lbl_analyzing:'分析中...',lbl_briefing:'おはようございます',
    pnl_market:'マーケット',pnl_portfolio:'ポートフォリオ',pnl_history:'履歴',pnl_watchlist:'ウォッチリスト',wlcApi:'APIキー設定',wlcMarket:'銘柄を調べる',wlcWatch:'ウォッチ管理',wlcQuick:'クイック分析',wlcQuickDesc:'場中の方向感とリスクを素早く確認。',wlcDeep:'詳細分析',wlcDeepDesc:'複数エージェントで材料、リスク、観察条件を整理。',wlcLive:'リアルタイム監視',wlcLiveDesc:'価格、RSI、MACD、異常変動を検知。',wlcPort:'ポートフォリオ概況',wlcPortDesc:'保有・監視銘柄、決算、リスク温度を確認。',
    entry_now:'即エントリー可能',entry_wait:'条件待ち',entry_avoid:'回避推奨',dash_title:'今日の概況',why_matters:'あなたに関係する理由',time_horizon:'時間軸',risk_level:'リスク',
    bot_tab_dash:'ダッシュボード',bot_tab_hist:'取引履歴',bot_tab_cfg:'設定・ログ',
    bot_start:'▶ ボット起動',bot_stop:'■ 停止',bot_running:'ボット稼働中',bot_no_pos:'ポジションなし',bot_open_pos:'オープンポジション',
    bot_chart_title:'資産推移',bot_no_data:'データなし（ボット稼働後に記録されます）',
    bot_trades:'全取引履歴',bot_no_trades:'取引履歴なし',bot_loading:'読み込み中…',
    bot_total:'総取引回数',bot_buysell:'買 / 売',bot_vol:'総取引額',
    bot_cfg_title:'ボット設定',bot_cfg_save:'設定を保存',bot_log:'取引ログ',bot_log_empty:'ログなし',
    bot_watch:'ウォッチ対象',bot_maxpos:'最大ポジション($)',bot_intv:'間隔(分)',
    bot_buy_rsi:'買い RSI <',bot_sell_rsi:'売り RSI >',bot_sl:'ストップロス(%)',bot_tp:'利確(%)',
    bot_sell_btn:'売却',bot_connect:'接続して確認',bot_setup_desc:'Alpaca Paper Trading（無料仮想口座）でPaper練習を行います。',
    bot_lbl_portval:'総資産',bot_lbl_pnl:'本日損益',bot_lbl_bp:'余力',bot_lbl_pos:'ポジション数',
    bot_not_connected:'接続してください',bot_connecting:'接続中…',bot_enter_key:'キーを入力してください',
    bot_th_date:'日時',bot_th_sym:'銘柄',bot_th_side:'売買',bot_th_qty:'株数',bot_th_price:'約定価格',bot_th_total:'金額',
    bot_saved:'✓ 保存済み',bot_next_prefix:'次',bot_shares:'株',
    bot_scalp_label:'⚡ スキャルピングモード',bot_scalp_desc:'5分足・2分サイクルで何十回も取引。スコア3/5で自動エントリー。AIなし。',bot_scalp_sl:'スキャルプSL(%)',bot_scalp_tp:'スキャルプTP(%)',
    bot_run_once:'⚡ 即時実行',bot_running_cycle:'実行中…',bot_max_concurrent:'🔒 同時保有上限',bot_slip:'📐 指値スリッページ(%)',
    nav_today:'今日',nav_research:'研究',nav_paper:'練習',nav_bot:'ロボット',nav_more:'その他',
    coach_today_title:'📊 今日',coach_today_desc:'まずタスク、リスク、研究キューを確認。',coach_research_title:'研究',coach_research_desc:'クイック、詳細、複数モデル、決算、ニュースはここ。',coach_paper_title:'$ 練習',coach_paper_desc:'取引規律を練習。実資金口座には接続しません。',coach_bot_title:'🤖 ロボット',coach_bot_desc:'Paper口座ロボットの入口は上部にあります。'},
  en:{ph:'Ask about a ticker or chart',li:'Reply in English.',reason:'Reasoning',result:'Analysis',summary:'Summary',conclusion:'Conclusion',buy:'Bullish ▲',sell:'Bearish ▼',hold:'Neutral ◆',wait:'Watch ◇',wlcTitle:'AI Stock Research Assistant',wlc:'Enter a ticker or connect TradingView to understand market context, risks, catalysts, and observation points.',appTitle:'StockAI',appBadge:'AI RESEARCH',appSubtitle:'',navTools:'TOOLS',
    tb_capture:'Screen',tb_chart:'Chart Analysis',tb_quick:'Quick Analysis',tb_full:'Deep Analysis',tb_consensus:'AI Consensus',tb_monitor:'Live Monitor',
    btn_save:'Save',btn_fetch:'Fetch',btn_add:'+ Add',btn_update:'Refresh',btn_analyze:'Analyze',
    lbl_lang:'Language',lbl_free:'Free',lbl_ticker:'Enter ticker',lbl_history:'No history',lbl_symbol:'Change symbol',lbl_newchat:'New Chat',lbl_analyzing:'Analyzing...',lbl_briefing:'Good morning',
    pnl_market:'Market',pnl_portfolio:'Portfolio',pnl_history:'History',pnl_watchlist:'Watchlist',wlcApi:'Set API Key',wlcMarket:'Look Up Stock',wlcWatch:'Manage Watchlist',wlcQuick:'Quick Analysis',wlcQuickDesc:'Fast read on direction and risk during market hours.',wlcDeep:'Deep Analysis',wlcDeepDesc:'Multi-agent research on catalysts, risks, and observation conditions.',wlcLive:'Live Monitor',wlcLiveDesc:'Watch price, RSI, MACD, and abnormal moves.',wlcPort:'Portfolio Brief',wlcPortDesc:'Track holdings, watchlist, earnings, and risk temperature.',
    entry_now:'Ready to enter',entry_wait:'Conditional',entry_avoid:'Avoid',dash_title:'Today\'s Overview',why_matters:'Why it matters to you',time_horizon:'Time Horizon',risk_level:'Risk Level',
    bot_tab_dash:'Dashboard',bot_tab_hist:'Trade History',bot_tab_cfg:'Settings & Log',
    bot_start:'▶ Start Bot',bot_stop:'■ Stop',bot_running:'Bot Running',bot_no_pos:'No positions',bot_open_pos:'Open Positions',
    bot_chart_title:'Asset History',bot_no_data:'No data yet (recorded after bot runs)',
    bot_trades:'All Trades',bot_no_trades:'No trades yet',bot_loading:'Loading…',
    bot_total:'Total Trades',bot_buysell:'Buy / Sell',bot_vol:'Total Volume',
    bot_cfg_title:'Bot Settings',bot_cfg_save:'Save Settings',bot_log:'Trade Log',bot_log_empty:'No logs',
    bot_watch:'Watchlist',bot_maxpos:'Max Position ($)',bot_intv:'Interval (min)',
    bot_buy_rsi:'Buy RSI <',bot_sell_rsi:'Sell RSI >',bot_sl:'Stop Loss (%)',bot_tp:'Take Profit (%)',
    bot_sell_btn:'Sell',bot_connect:'Connect & Verify',bot_setup_desc:'Practice with Alpaca Paper Trading (free virtual account).',
    bot_lbl_portval:'Portfolio Value',bot_lbl_pnl:'Today P&L',bot_lbl_bp:'Buying Power',bot_lbl_pos:'Positions',
    bot_not_connected:'Please connect first',bot_connecting:'Connecting…',bot_enter_key:'Please enter API keys',
    bot_th_date:'Date/Time',bot_th_sym:'Symbol',bot_th_side:'Side',bot_th_qty:'Qty',bot_th_price:'Avg Price',bot_th_total:'Total',
    bot_saved:'✓ Saved',bot_next_prefix:'Next',bot_shares:'sh',
    bot_scalp_label:'⚡ Scalping Mode',bot_scalp_desc:'5m bars, 2-min cycles, dozens of trades/day. Entry on score 3/5. No AI (speed mode).',bot_scalp_sl:'Scalp SL (%)',bot_scalp_tp:'Scalp TP (%)',
    bot_run_once:'⚡ Run Now',bot_running_cycle:'Running…',bot_max_concurrent:'🔒 Max Concurrent Positions',bot_slip:'📐 Limit Slippage (%)',
    nav_today:'Today',nav_research:'Research',nav_paper:'Sim',nav_bot:'Bot',nav_more:'More',
    coach_today_title:'📊 Today',coach_today_desc:'Start with tasks, risk, and the research queue.',coach_research_title:'Research',coach_research_desc:'Quick, deep, multi-model, earnings, and news live here.',coach_paper_title:'$ Sim',coach_paper_desc:'Practice trading discipline without connecting real-money accounts.',coach_bot_title:'🤖 Bot',coach_bot_desc:'The Paper account bot entry is in the top bar.'},
  zh:{ph:'输入股票代码、图表问题或研究问题',li:'用中文回答。',reason:'分析理由',result:'分析结果',summary:'总结',conclusion:'结论',buy:'偏强 ▲',sell:'偏弱 ▼',hold:'中性 ◆',wait:'观察 ◇',wlcTitle:'AI 股票研究助手',wlc:'输入股票代码或连接 TradingView，快速看懂行情摘要、风险提示、催化因素和观察条件。',appTitle:'StockAI',appBadge:'AI RESEARCH',appSubtitle:'',navTools:'工具',
    tb_capture:'截屏',tb_chart:'图表分析',tb_quick:'快速分析',tb_full:'深度分析',tb_consensus:'多模型共识',tb_monitor:'实时监控',
    btn_save:'保存',btn_fetch:'获取',btn_add:'+ 添加',btn_update:'刷新',btn_analyze:'分析',
    lbl_lang:'语言',lbl_free:'免费',lbl_ticker:'输入代码',lbl_history:'无记录',lbl_symbol:'切换代码',lbl_newchat:'新对话',lbl_analyzing:'分析中...',lbl_briefing:'早上好',
    pnl_market:'市场',pnl_portfolio:'组合',pnl_history:'历史',pnl_watchlist:'自选股',wlcApi:'设置 API Key',wlcMarket:'查询股票',wlcWatch:'管理自选股',wlcQuick:'快速分析',wlcQuickDesc:'适合盘中快速判断方向和风险。',wlcDeep:'深度研究',wlcDeepDesc:'多代理整理催化因素、风险和观察条件。',wlcLive:'实时监控',wlcLiveDesc:'监听价格、RSI、MACD 和异常波动。',wlcPort:'组合概况',wlcPortDesc:'跟踪持仓、自选股、财报和风险温度。',
    entry_now:'可立即入场',entry_wait:'条件等待',entry_avoid:'建议回避',dash_title:'今日概况',why_matters:'与你的关系',time_horizon:'时间维度',risk_level:'风险等级',
    bot_tab_dash:'仪表盘',bot_tab_hist:'交易记录',bot_tab_cfg:'设置·日志',
    bot_start:'▶ 启动机器人',bot_stop:'■ 停止',bot_running:'机器人运行中',bot_no_pos:'无持仓',bot_open_pos:'当前持仓',
    bot_chart_title:'资产走势',bot_no_data:'暂无数据（机器人运行后开始记录）',
    bot_trades:'全部交易记录',bot_no_trades:'暂无交易记录',bot_loading:'加载中…',
    bot_total:'总交易次数',bot_buysell:'买 / 卖',bot_vol:'总交易额',
    bot_cfg_title:'机器人设置',bot_cfg_save:'保存设置',bot_log:'交易日志',bot_log_empty:'暂无日志',
    bot_watch:'监控标的',bot_maxpos:'最大仓位($)',bot_intv:'间隔(分钟)',
    bot_buy_rsi:'买入 RSI <',bot_sell_rsi:'卖出 RSI >',bot_sl:'止损(%)',bot_tp:'止盈(%)',
    bot_sell_btn:'卖出',bot_connect:'连接并验证',bot_setup_desc:'通过 Alpaca Paper Trading（免费虚拟账户）做模拟训练。',
    bot_lbl_portval:'总资产',bot_lbl_pnl:'今日盈亏',bot_lbl_bp:'可用资金',bot_lbl_pos:'持仓数',
    bot_not_connected:'请先连接',bot_connecting:'连接中…',bot_enter_key:'请输入 API 密钥',
    bot_th_date:'时间',bot_th_sym:'代码',bot_th_side:'方向',bot_th_qty:'数量',bot_th_price:'成交价',bot_th_total:'金额',
    bot_saved:'✓ 已保存',bot_next_prefix:'下次',bot_shares:'股',
    bot_scalp_label:'⚡ 高频刷单模式',bot_scalp_desc:'5分钟K线，2分钟循环，每日可交易数十次。评分3/5即入场，无需AI确认。',bot_scalp_sl:'刷单止损(%)',bot_scalp_tp:'刷单止盈(%)',
    bot_run_once:'⚡ 立即执行',bot_running_cycle:'执行中…',bot_max_concurrent:'🔒 同时持仓上限',bot_slip:'📐 指值滑点(%)',
    nav_today:'今日',nav_research:'研究',nav_paper:'模拟',nav_bot:'机器人',nav_more:'更多',
    coach_today_title:'📊 今日',coach_today_desc:'先看任务、风险和研究队列。',coach_research_title:'研究',coach_research_desc:'快速、深度、多模型、财报、新闻都在这里。',coach_paper_title:'$ 模拟',coach_paper_desc:'训练交易纪律，不连接真钱账户。',coach_bot_title:'🤖 机器人',coach_bot_desc:'Paper 账户机器人入口在顶部。'},
};

// ═══ Init ═══
window.onload=async()=>{
  key='';lang=ls('sai_lang')||'zh';model=ls('sai_model')||'gemini-2.5-flash';
  keyClaude='';keyOpenAI='';keyDeepSeek='';
  document.body.className=theme;setThemeIcon();
  await loadSecureKeys();
  updateRuntimeBanner();
  updateCoachBar();
  stockai.invoke('bot-set-lang',lang).catch(()=>{}); // main.jsのbotLangと同期
  if(Q('model-gemini'))Q('model-gemini').value=model;Q('lang-sel').value=lang;applyLang();
  const pr=await ipcRenderer.invoke('load-portfolio');if(pr.ok&&pr.portfolio?.length){portfolio=pr.portfolio;renderPort();}
  const wl=await ipcRenderer.invoke('load-watchlist');if(wl.ok&&wl.watchlist?.length){watchlist=wl.watchlist;renderWL();}
  await loadVirtualWallet();
  loadHistory();renderChatTabs();
  Q('inp').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!Q('inp').value.trim())return;if(!enterReady){enterReady=true;Q('sndb').classList.add('ready');Q('ibx').classList.add('ready');}else{enterReady=false;Q('sndb').classList.remove('ready');Q('ibx').classList.remove('ready');doSend();}}else if(e.key!=='Enter'&&enterReady){enterReady=false;Q('sndb').classList.remove('ready');Q('ibx').classList.remove('ready');}});
  Q('inp').addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';});
  setTimeout(()=>{togP('dashboard');if(activeAPIKey())initDashboard();else showOnboarding();},300);
  initUpdateHandler();
};

function initUpdateHandler(){
  stockai.on('update-available',(_,info)=>{
    const b=Q('update-banner'),t=Q('update-text');
    if(b){b.style.display='flex';} if(t)t.textContent=`v${info.version} をダウンロード中...`;
  });
  stockai.on('update-progress',(_,info)=>{
    const p=Q('update-pct');if(p){p.style.display='';p.textContent=info.percent+'%';}
  });
  stockai.on('update-downloaded',(_,info)=>{
    const b=Q('update-banner'),t=Q('update-text'),btn=Q('update-install-btn'),p=Q('update-pct');
    if(b)b.style.display='flex';
    if(t)t.textContent=`v${info.version} の準備ができました`;
    if(btn)btn.style.display='block';
    if(p)p.style.display='none';
  });
}

async function installUpdate(){
  await stockai.invoke('install-update');
}

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
function activeProvider(){if(key)return'Gemini';if(keyClaude)return'Claude';if(keyOpenAI)return'OpenAI';if(keyDeepSeek)return'DeepSeek';return'Unknown';}
function updateRuntimeBanner(){
  const b=Q('runtime-banner');if(!b)return;
  b.className='runtime-banner '+(isElectron?'ok':'warn');
  b.innerHTML=isElectron?'<strong>正式 Electron 版</strong><span>功能完整：行情、保存、虚拟训练中心、Paper Trading 都可用。</span>':'<strong>页面预览版</strong><span>这里只能看界面；连接 Paper Trading、行情评分、保存数据需要用 Electron 版。</span>';
}
function updateCoachBar(){
  const b=Q('coachbar');if(!b)return;
  const on=localStorage.getItem('sai_coach')!=='0';
  b.style.display=on?'grid':'none';
}
function toggleCoach(){
  const on=localStorage.getItem('sai_coach')!=='0';
  localStorage.setItem('sai_coach',on?'0':'1');
  updateCoachBar();
}

// ═══ Theme / Lang ═══
function togTheme(){theme=theme==='dark'?'light':'dark';document.body.className=theme;localStorage.setItem('sai_theme',theme);setThemeIcon();}
function setLang(l){lang=l;localStorage.setItem('sai_lang',l);applyLang();stockai.invoke('bot-set-lang',l).catch(()=>{});}
function applyLang(){
  const t=L[lang];Q('inp').placeholder=t.ph;Q('lang-sel').value=lang;
  const title=Q('app-title');if(title)title.textContent=t.appTitle;
  const badge=Q('app-badge');if(badge)badge.textContent=t.appBadge;
  const subtitle=Q('app-subtitle');if(subtitle)subtitle.textContent=t.appSubtitle;
  const nav=Q('nav-tools');if(nav)nav.textContent=t.navTools;
  const wt=Q('wlc-title');if(wt)wt.textContent=t.wlcTitle;
  const d=Q('wlc-desc');if(d)d.textContent=t.wlc;
  const w=Q('wlc');if(w)w.outerHTML=welcomeHTML();
  const navEls={'nav-today':t.nav_today,'nav-research-main':t.nav_research,'nav-paper':t.nav_paper,'nav-bot':t.nav_bot,'nav-more-main':t.nav_more,
    'coach-today-title':t.coach_today_title,'coach-today-desc':t.coach_today_desc,'coach-research-title':t.coach_research_title,'coach-research-desc':t.coach_research_desc,
    'coach-paper-title':t.coach_paper_title,'coach-paper-desc':t.coach_paper_desc,'coach-bot-title':t.coach_bot_title,'coach-bot-desc':t.coach_bot_desc};
  Object.entries(navEls).forEach(([id,txt])=>{const el=Q(id);if(el&&txt)el.textContent=txt;});
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
  applyBotLang();
  applyObLang();
  updateRuntimeBanner();
  updateCoachBar();
}

function applyBotLang(){
  const t=L[lang];
  const ids={
    'bot-tab-dash':t.bot_tab_dash,'bot-tab-hist':t.bot_tab_hist,'bot-tab-cfg':t.bot_tab_cfg,
    'bot-start-btn':t.bot_start,'bot-stop-btn':t.bot_stop,
    'bot-chart-empty':t.bot_no_data,
    'bot-setup-desc':t.bot_setup_desc,'bot-connect-btn':t.bot_connect,
    'bot-chart-title':t.bot_chart_title,'bot-running-text':t.bot_running,
    'bot-trades-title':t.bot_trades,
    'bot-cfg-title':t.bot_cfg_title,'bot-cfg-save-btn':t.bot_cfg_save,
    'bot-watch-label':t.bot_watch,
    'bot-maxpos-label':t.bot_maxpos,'bot-intv-label':t.bot_intv,
    'bot-buy-rsi-label':t.bot_buy_rsi,'bot-sell-rsi-label':t.bot_sell_rsi,
    'bot-sl-label':t.bot_sl,'bot-tp-label':t.bot_tp,
    'bot-maxpos-cnt-label':t.bot_max_concurrent,'bot-slip-label':t.bot_slip,
    'bot-run-once-btn':t.bot_run_once,
    'bot-scalp-label':t.bot_scalp_label,'bot-scalp-desc':t.bot_scalp_desc,
    'bot-scalp-sl-label':t.bot_scalp_sl,'bot-scalp-tp-label':t.bot_scalp_tp,
    'bot-log-title':t.bot_log,
    'bot-lbl-portval':t.bot_lbl_portval,'bot-lbl-pnl':t.bot_lbl_pnl,
    'bot-lbl-bp':t.bot_lbl_bp,'bot-lbl-pos':t.bot_lbl_pos,
  };
  Object.entries(ids).forEach(([id,txt])=>{const el=Q(id);if(el&&txt)el.textContent=txt;});
  // Log empty state
  const logEl=Q('bot-log');if(logEl){const emp=logEl.querySelector('.bot-log-empty');if(emp)emp.textContent=t.bot_log_empty;}
  // Re-render positions with current language
  if(window._botPositions)renderBotPositions(window._botPositions);
  // Re-render trade history tab if open
  if(botCurrentTab==='hist')loadBotTradeHistory();
}

function welcomeHTML(){
  const t=L[lang];
  const hidden=ls('sai_wlc_hidden')==='1';
  return '<div class="wlc" id="wlc">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'+
    '<h2 id="wlc-title" style="margin-bottom:0;flex:1">'+esc(t.wlcTitle)+'</h2>'+
    '<button onclick="togWlcCards()" title="カードを隠す/表示" style="background:none;border:none;color:var(--tx3);cursor:pointer;padding:5px;border-radius:7px;display:flex;align-items:center;transition:color .15s,background .15s" onmouseover="this.style.color=\'var(--tx)\'" onmouseout="this.style.color=\'var(--tx3)\'">'+ico('eye','sm')+'</button>'+
    '</div>'+
    '<p id="wlc-desc">'+esc(t.wlc)+'</p>'+
    '<div class="wcg" id="wlc-cards"'+(hidden?' style="display:none"':'')+'>'+
    '<div class="wcc"><div class="wci">'+ico('zap')+'</div><div><div class="wct">'+esc(t.wlcQuick)+'</div><div class="wcd">'+esc(t.wlcQuickDesc)+'</div></div></div>'+
    '<div class="wcc"><div class="wci">'+ico('layers')+'</div><div><div class="wct">'+esc(t.wlcDeep)+'</div><div class="wcd">'+esc(t.wlcDeepDesc)+'</div></div></div>'+
    '<div class="wcc"><div class="wci">'+ico('radio')+'</div><div><div class="wct">'+esc(t.wlcLive)+'</div><div class="wcd">'+esc(t.wlcLiveDesc)+'</div></div></div>'+
    '<div class="wcc"><div class="wci">'+ico('briefcase')+'</div><div><div class="wct">'+esc(t.wlcPort)+'</div><div class="wcd">'+esc(t.wlcPortDesc)+'</div></div></div>'+
    '</div>'+
    '</div>';
}
function togWlcCards(){
  const g=Q('wlc-cards');if(!g)return;
  const isHidden=g.style.display==='none';
  g.style.display=isHidden?'':'none';
  localStorage.setItem('sai_wlc_hidden',isHidden?'0':'1');
}

// ═══ API ═══
function togAPI(p){Q('api-'+p).classList.toggle('show');}
async function loadSecureKeys(){
  const old={gemini:ls('sai_key_gemini')||ls('sai_key'),claude:ls('sai_key_claude'),openai:ls('sai_key_openai'),deepseek:ls('sai_key_deepseek')};
  if(!isElectron){
    for(const p of ['gemini','claude','openai','deepseek']){const oldKey=old[p];if(oldKey){setProviderKey(p,oldKey);if(Q('dot-'+p))Q('dot-'+p).classList.add('on');}}
    return;
  }
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
  // Restore CLI auth selections
  if(localStorage.getItem('sai_use_claude_cli')==='1'){
    keyClaude='__cli__';
    if(Q('dot-claude'))Q('dot-claude').classList.add('on');
    if(Q('claude-cli-banner'))Q('claude-cli-banner').style.display='block';
    if(Q('claude-tag')){Q('claude-tag').textContent='CLI';Q('claude-tag').style.background='var(--ac2)';Q('claude-tag').style.color='var(--ac)';}
  }
  if(localStorage.getItem('sai_use_codex_cli')==='1'&&!keyOpenAI){
    try{const r=await ipcRenderer.invoke('cli-ai',{provider:'codex-cli'});
      if(r.ok&&r.key){
        keyOpenAI=r.key;
        if(Q('dot-openai'))Q('dot-openai').classList.add('on');
        if(Q('codex-cli-banner'))Q('codex-cli-banner').style.display='block';
        if(Q('openai-tag')){Q('openai-tag').textContent='CLI';Q('openai-tag').style.background='var(--ac2)';Q('openai-tag').style.color='var(--ac)';}
      }
    }catch(e){}
  }
}
async function saveKey(p){const k=Q('key-'+p)?.value.trim()||'',m=Q('model-'+p)?.value||'';if(m)localStorage.setItem('sai_model_'+p,m);if(k){const r=await ipcRenderer.invoke('save-api-key',{provider:p,key:k,model:m});if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}setProviderKey(p,k);if(p==='gemini')model=m||model;Q('key-'+p).value='';Q('key-'+p).placeholder='已安全保存，输入新 Key 可替换';}else if(m){const r=await ipcRenderer.invoke('save-api-key',{provider:p,key:providerKey(p),model:m});if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}if(p==='gemini')model=m;}if(Q('dot-'+p))Q('dot-'+p).classList.toggle('on',!!providerKey(p));if(m&&p==='gemini'){model=m;localStorage.setItem('sai_model',m);}Q('api-'+p).classList.remove('show');if(activeAPIKey())setTimeout(()=>Q('pnl-settings').classList.remove('open'),300);}
function saveMdl(m){model=m;localStorage.setItem('sai_model',m);}
async function clearKey(p){
  // Clear CLI flag if applicable
  if(p==='claude')localStorage.removeItem('sai_use_claude_cli');
  if(p==='openai')localStorage.removeItem('sai_use_codex_cli');
  const r=await ipcRenderer.invoke('delete-api-key',{provider:p});if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}setProviderKey(p,'');if(Q('dot-'+p))Q('dot-'+p).classList.remove('on');if(Q('key-'+p)){Q('key-'+p).value='';Q('key-'+p).placeholder=p==='gemini'?'AIza...':'sk-...';}addMsg('ai','<div style="color:var(--tx2);font-size:11px">'+esc(p)+' のキーを削除しました</div>',1);
}

// ═══ Onboarding ═══
let obProvider='',obClipTimer=null;
const OB_URLS={gemini:'https://aistudio.google.com/app/apikey',claude:'https://console.anthropic.com/settings/keys',openai:'https://platform.openai.com/api-keys',deepseek:'https://platform.deepseek.com/api_keys'};
const OB_PREFIX={gemini:'AIza',claude:'sk-ant-',openai:'sk-',deepseek:'sk-'};
const OB_TXT={
  zh:{title:'欢迎使用 StockAI',sub:'只需 1 分钟配置，即可开始 AI 股票分析<br>选择 AI 提供商 → 一键获取 Key → 开始研究',cliTitle:'⚡ 一键连接（使用已有认证）',cliTag:'✓ 已认证',cliClaude:'复用已有 Claude Code<br>认证',cliCodex:'复用已有 Codex CLI<br>认证',manual:'— 或手动设置 API Key —',geminiTag:'免费',gemini:'Google 出品，免费额度充足<br>推荐新手首选',claude:'分析深度最强<br>适合复杂研究报告',openai:'支持 GPT-5.5、5.4、4.1 等模型<br>生态成熟稳定',deepseekTag:'R1 推理',deepseek:'深度推理能力强<br>价格极低',step:'获取 {name} API Key',open:'🔑 &nbsp;在浏览器中获取 API Key',clip:'复制 Key 后将自动识别并填入…',clipFound:'✓ 已识别 Key，点击确认保存',hint:'复制 Key → 切回 StockAI → 自动填写',paste:'粘贴 {prefix}... Key',save:'确认',err:'Key 格式不符，请重新粘贴',skip:'已有配置，跳过此步骤'},
  ja:{title:'StockAI へようこそ',sub:'1分で設定して、AI株式分析を開始できます<br>AIプロバイダーを選択 → Keyを取得 → 研究開始',cliTitle:'⚡ ワンクリック接続（既存の認証を使用）',cliTag:'✓ 認証済み',cliClaude:'既存の Claude Code<br>認証を再利用',cliCodex:'既存の Codex CLI<br>認証を再利用',manual:'— または手動で API Key を設定 —',geminiTag:'無料',gemini:'Google 提供、無料枠が十分<br>初心者におすすめ',claude:'深い分析が得意<br>複雑な研究レポート向け',openai:'GPT-5.5、5.4、4.1 などに対応<br>安定したエコシステム',deepseekTag:'R1 推論',deepseek:'深い推論が得意<br>低コスト',step:'{name} API Key を取得',open:'🔑 &nbsp;ブラウザで API Key を取得',clip:'Key をコピーすると自動で入力します…',clipFound:'✓ Key を検出しました。確認を押してください',hint:'Key をコピー → StockAI に戻る → 自動入力',paste:'{prefix}... Key を貼り付け',save:'確認',err:'Key 形式が正しくありません。もう一度貼り付けてください',skip:'設定済みなのでスキップ'},
  en:{title:'Welcome to StockAI',sub:'Set up in 1 minute and start AI stock research<br>Choose an AI provider → Get a Key → Start researching',cliTitle:'⚡ One-click connect using existing auth',cliTag:'✓ Connected',cliClaude:'Reuse your existing<br>Claude Code auth',cliCodex:'Reuse your existing<br>Codex CLI auth',manual:'— Or set an API Key manually —',geminiTag:'Free',gemini:'From Google, generous free quota<br>Best first choice for beginners',claude:'Strongest for deep analysis<br>Great for complex research reports',openai:'Supports GPT-5.5, 5.4, 4.1 and other GPT models<br>Mature and stable ecosystem',deepseekTag:'R1 Reasoning',deepseek:'Strong reasoning ability<br>Very low cost',step:'Get {name} API Key',open:'🔑 &nbsp;Get API Key in browser',clip:'Copy a Key and StockAI will fill it automatically…',clipFound:'✓ Key detected. Click confirm to save',hint:'Copy Key → return to StockAI → auto fill',paste:'Paste {prefix}... Key',save:'Confirm',err:'Invalid Key format. Please paste again',skip:'Already configured, skip this step'}
};
function obT(){return OB_TXT[lang]||OB_TXT.zh;}
function toggleObLangMenu(){Q('ob-lang-menu')?.classList.toggle('open');}
function setObLang(l){lang=l;localStorage.setItem('sai_lang',l);Q('ob-lang-menu')?.classList.remove('open');applyLang();applyObLang();}
function obSet(id,html){const el=Q(id);if(el)el.innerHTML=html;}
function applyObLang(){
  const t=obT();
  const labels={zh:'中文',ja:'日本語',en:'English'};
  obSet('ob-lang-current',(labels[lang]||labels.zh)+' ▾');
  ['zh','ja','en'].forEach(l=>Q('ob-lang-'+l)?.classList.toggle('on',lang===l));
  obSet('ob-title',t.title);obSet('ob-sub',t.sub);obSet('ob-cli-title',t.cliTitle);
  obSet('ob-cli-claude-tag',t.cliTag);obSet('ob-cli-codex-tag',t.cliTag);
  obSet('ob-cli-claude-desc',t.cliClaude);obSet('ob-cli-codex-desc',t.cliCodex);obSet('ob-manual-sep',t.manual);
  obSet('ob-gemini-tag',t.geminiTag);obSet('ob-gemini-desc',t.gemini);obSet('ob-claude-desc',t.claude);obSet('ob-openai-desc',t.openai);
  obSet('ob-deepseek-tag',t.deepseekTag);obSet('ob-deepseek-desc',t.deepseek);
  obSet('ob-open-btn',t.open);obSet('ob-clip-hint',t.hint);obSet('ob-save-btn',t.save);obSet('ob-key-err',t.err);obSet('ob-skip',t.skip);
  if(obProvider){
    const names={gemini:'Gemini',claude:'Claude',openai:'ChatGPT',deepseek:'DeepSeek'};
    obSet('ob-step-lbl',t.step.replace('{name}',names[obProvider]||''));
    const inp=Q('ob-key-in');if(inp)inp.placeholder=t.paste.replace('{prefix}',OB_PREFIX[obProvider]||'');
  }else{
    obSet('ob-step-lbl',t.step.replace('{name}',''));
    const inp=Q('ob-key-in');if(inp)inp.placeholder=lang==='en'?'Or paste Key directly':lang==='ja'?'または Key を直接貼り付け':'或直接粘贴 Key';
  }
  const clip=Q('ob-clip-lbl');
  if(clip)clip.textContent=Q('ob-clip-dot')?.classList.contains('found')?t.clipFound:t.clip;
}
async function detectCLIAuth(){
  try{
    const r=await ipcRenderer.invoke('detect-cli-auth');
    let any=false;
    if(r.claude?.available){Q('ob-cli-claude').style.display='block';any=true;}
    if(r.codex?.available||r.codex?.hasAuth){Q('ob-cli-codex').style.display='block';any=true;}
    if(any)Q('ob-cli-section').style.display='block';
    return r;
  }catch(e){return null;}
}
async function obSelectCLI(p){
  // p is 'claude-cli' or 'codex-cli'
  if(p==='claude-cli'){
    keyClaude='__cli__'; // Sentinel value indicating CLI mode
    localStorage.setItem('sai_use_claude_cli','1');
    if(Q('dot-claude'))Q('dot-claude').classList.add('on');
  }else if(p==='codex-cli'){
    const r=await ipcRenderer.invoke('cli-ai',{provider:'codex-cli'});
    if(r.error){addMsg('ai','<div class="errc">'+esc(r.error)+'</div>',1);return;}
    keyOpenAI=r.key;
    localStorage.setItem('sai_use_codex_cli','1');
    if(Q('dot-openai'))Q('dot-openai').classList.add('on');
  }
  hideOnboarding();togP('dashboard');initDashboard();
}
function showOnboarding(){const o=Q('onboarding');if(o){applyObLang();o.style.display='block';detectCLIAuth();}}
function hideOnboarding(){const o=Q('onboarding');if(o)o.style.display='none';stopObClip();}
function obSelect(p){
  obProvider=p;
  document.querySelectorAll('.ob-card').forEach(c=>c.classList.toggle('sel',c.dataset.p===p));
  const step=Q('ob-step');step.classList.add('show');
  Q('ob-dot2').classList.add('act');
  const names={gemini:'Gemini',claude:'Claude',openai:'ChatGPT',deepseek:'DeepSeek'};
  Q('ob-step-lbl').textContent=obT().step.replace('{name}',names[p]);
  Q('ob-key-in').value='';Q('ob-key-in').placeholder=obT().paste.replace('{prefix}',OB_PREFIX[p]||'');
  Q('ob-key-err').style.display='none';Q('ob-save-btn').disabled=true;
  applyObLang();
  startObClip();
}
async function obOpenKeyPage(){if(!obProvider)return;await ipcRenderer.invoke('open-external',OB_URLS[obProvider]);}
function startObClip(){
  stopObClip();
  Q('ob-clip-dot').className='ob-clip-dot';Q('ob-clip-lbl').textContent=obT().clip;
  obClipTimer=setInterval(async()=>{
    try{
      const t=(await ipcRenderer.invoke('read-clipboard')||'').trim();
      if(t&&obProvider&&t.startsWith(OB_PREFIX[obProvider])&&t.length>20){
        Q('ob-key-in').value=t;Q('ob-clip-dot').className='ob-clip-dot found';
        Q('ob-clip-lbl').textContent=obT().clipFound;
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
const ALL_PANELS=['dashboard','research','settings','market','tv','portfolio','paper','history','watchlist','review','bot','help'];
function togP(name){
  ALL_PANELS.forEach(n=>{const p=Q('pnl-'+n);if(p&&n!==name)p.classList.remove('open');});
  const t=Q('pnl-'+name);if(!t)return;
  t.classList.toggle('open');
  const anyOpen=ALL_PANELS.some(n=>Q('pnl-'+n)?.classList.contains('open'));
  Q('app').classList.toggle('panel-open',anyOpen);
  if(name==='tv'&&t.classList.contains('open'))tvConn();
  if(name==='history')loadHistory();
  if(name==='paper')loadVirtualWallet();
}
function goHome(){
  ALL_PANELS.forEach(n=>Q('pnl-'+n)?.classList.remove('open'));
  Q('app').classList.remove('panel-open');
}
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
function queueBucket(row){
  const s=row.score||{},chg=Math.abs(parseFloat(row.change)||0),risk=s.risk||0,overall=s.overall||0,event=s.event||0,technical=s.technical||0;
  if(risk>=70||parseFloat(row.change)<-3)return'risk';
  if(overall>=72||chg>=3||event>=68)return'must';
  if(overall>=52||technical>=58)return'observe';
  return'skip';
}
function queueCard(row){
  const s=row.score||{},chg=parseFloat(row.change)||0,clr=s.overall>=70?'var(--ac)':s.overall>=50?'var(--am)':'var(--rd)';
  return'<div class="rq-card" onclick="loadMkt(\''+esc(row.symbol)+'\')"><div class="rq-head"><span class="rq-sym">'+esc(row.symbol)+'</span><span class="rq-score" style="color:'+clr+'">'+(s.overall||'—')+'</span></div><div class="rq-meta"><span>'+(chg>0?'+':'')+sf(chg,2)+'%</span><span>RSI '+(row.rsi||'—')+'</span><span>风险 '+(s.risk||'—')+'</span></div><div class="rq-reason">'+esc(row.trend||'等待更多行情确认')+'</div><div class="rq-actions"><button onclick="event.stopPropagation();loadMkt(\''+esc(row.symbol)+'\')">行情</button><button onclick="event.stopPropagation();Q(\'sym-research\').value=\''+esc(row.symbol)+'\';togP(\'research\')">研究</button></div></div>';
}
async function buildResearchQueue(){
  const box=Q('wl-score');
  if(!box)return;
  if(!watchlist.length){
    box.innerHTML='<div class="rq-wrap"><div class="rq-hero"><div><div class="rq-kicker">Research Queue</div><div class="rq-main">先添加几只自选股</div></div></div><div class="rq-empty">在下面输入框添加股票代码，例如 NVDA、TSLA、AAPL，然后再点“研究队列”。</div></div>';
    return;
  }
  if(!ipcRenderer?.invoke){
    box.innerHTML='<div class="errc">当前是在普通 file 页面里预览，研究队列需要从 StockAI Electron 应用里打开才可以读取行情和评分。</div>';
    return;
  }
  box.innerHTML='<div style="font-size:11px;color:var(--tx3);padding:8px">正在生成研究队列...</div>';
  let r;
  try{r=await ipcRenderer.invoke('score-watchlist',{symbols:watchlist.map(w=>w.symbol)});}
  catch(e){box.innerHTML='<div class="errc">生成失败：'+esc(e.message||e)+'</div>';return;}
  if(!r.ok){box.innerHTML='<div class="errc">'+esc(r.error||'生成失败')+'</div>';return;}
  const groups={must:[],observe:[],risk:[],skip:[]};
  (r.rows||[]).filter(x=>!x.error).forEach(row=>groups[queueBucket(row)].push(row));
  Object.values(groups).forEach(arr=>arr.sort((a,b)=>(b.score?.overall||0)-(a.score?.overall||0)));
  const section=(key,title,hint)=>'<div class="rq-section rq-'+key+'"><div class="rq-title">'+title+'<span>'+groups[key].length+'</span></div><div class="rq-hint">'+hint+'</div>'+(groups[key].length?groups[key].map(queueCard).join(''):'<div class="rq-empty">暂无</div>')+'</div>';
  const html='<div class="rq-wrap"><div class="rq-hero"><div><div class="rq-kicker">Research Queue</div><div class="rq-main">今天先看哪里，一眼就知道</div></div><button onclick="buildResearchQueue()">刷新</button></div>'+section('must','今天必看','高分、异动或事件驱动，优先研究原因和触发条件。')+section('risk','风险升高','波动、下跌或风险分偏高，适合先看风险。')+section('observe','继续观察','条件还没完全成熟，适合加入观察清单。')+section('skip','暂时忽略','优先级较低，今天不用花太多时间。')+'</div>';
  if(box)box.innerHTML=html;
}
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
  if(!virtualWallet)await loadVirtualWallet();
  if(!portfolio.length&&!watchlist.length){
    const vw=virtualWallet,ret=parseFloat(vw?.totalReturnPct||0);
    body.innerHTML='<div class="dash-verdict"><div class="dash-verdict-lbl">AI 股票研究首页</div><div class="dash-verdict-txt">添加自选股后，这里会显示每日摘要、风险温度、财报提醒、异动股票和 AI 研究重点。你也可以先用虚拟训练中心做模拟交易。</div></div><div class="dash-grid"><div class="dash-card" onclick="togP(\'paper\')" style="cursor:pointer"><div class="dc-title">虚拟训练中心</div><div style="font-size:18px;font-weight:800;font-family:\'IBM Plex Mono\',monospace">$'+sf(vw?.totalEquity||100000,0)+'</div><div style="font-size:10px;color:'+(ret>=0?'var(--ac)':'var(--rd)')+';font-family:\'IBM Plex Mono\',monospace">'+(ret>=0?'+':'')+sf(ret,2)+'%</div></div><div class="dash-card"><div class="dc-title">下一步</div><div style="font-size:11px;color:var(--tx2)">添加自选股，或在虚拟训练中心买入一笔模拟仓位。</div></div></div>';return;}
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
  const hr=await ipcRenderer.invoke('check-signal-outcomes');
  const signalStats=hr.ok?{d7:calcSignalStats(hr.history,'outcome7d'),d30:calcSignalStats(hr.history,'outcome30d')}:null;
  if(!virtualWallet)await loadVirtualWallet();
  dashData={priceMap,earningsMap,portSyms,wlSyms,signalStats,virtualWallet};
  renderDashboard(dashData);
}

function renderTodayTasks({riskLabel,riskScore,earningsSoon,movers,warns,signalStats}){
  const tasks=[];
  if(warns.length)tasks.push({k:'风险',t:'检查亏损持仓',d:warns.map(p=>p.symbol).join(', ')+' 跌幅超过 5%，先看是否需要降低风险。',c:'var(--rd)'});
  if(earningsSoon.length)tasks.push({k:'财报',t:'确认财报日程',d:earningsSoon.slice(0,3).map(e=>e.symbol+' '+(e.days===0?'今天':e.days+'天后')).join(' · '),c:'var(--am)'});
  if(movers.length)tasks.push({k:'异动',t:'解释异常波动',d:movers.slice(0,3).map(m=>m.symbol+' '+(m.change>0?'+':'')+sf(m.change,2)+'%').join(' · '),c:'var(--bl)'});
  if(signalStats?.d7)tasks.push({k:'复盘',t:'查看 AI 判断表现',d:'7日命中率 '+signalStats.d7.winRate+'%，平均 '+(parseFloat(signalStats.d7.avg)>=0?'+':'')+signalStats.d7.avg+'%。',c:signalStats.d7.winRate>=60?'var(--ac)':'var(--am)'});
  if(riskScore>=7)tasks.push({k:'组合',t:'今日风险温度偏高',d:'当前 '+riskLabel+'，优先看风险，不急着增加新仓位。',c:'var(--rd)'});
  if(!tasks.length)tasks.push({k:'开始',t:'生成今日研究队列',d:'到自选股里点“研究队列”，先确定今天最值得看的股票。',c:'var(--ac)'});
  return'<div class="task-board"><div class="task-head"><span>今日任务清单</span><button onclick="togP(\'watchlist\')">去自选</button></div>'+tasks.slice(0,5).map(x=>'<div class="task-row"><span class="task-key" style="color:'+x.c+';border-color:'+x.c+'">'+esc(x.k)+'</span><div><div class="task-title">'+esc(x.t)+'</div><div class="task-desc">'+esc(x.d)+'</div></div></div>').join('')+'</div>';
}

function renderDashboard(data){
  const {priceMap,earningsMap,portSyms,signalStats}=data;
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
  h+=renderTodayTasks({riskLabel,riskScore,earningsSoon,movers,warns,signalStats});
  // Risk + Earnings row
  h+='<div class="dash-grid">';
  h+='<div class="dash-card"><div class="dc-title">🌡 リスク温度</div><div style="font-size:18px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;color:'+riskClr+'">'+riskLabel+'</div><div class="rtemp"><div class="rtemp-bar"><div class="rtemp-fill" style="width:'+(riskScore*10)+'%;background:'+riskClr+'"></div></div><span style="font-size:10px;font-family:\'IBM Plex Mono\',monospace;color:'+riskClr+'">'+riskScore+'/10</span></div></div>';
  h+='<div class="dash-card"><div class="dc-title">📅 財報カレンダー</div>';
  if(!earningsSoon.length)h+='<div style="font-size:11px;color:var(--tx3)">2週間内なし</div>';
  else h+=earningsSoon.slice(0,4).map(e=>'<div class="earn-row'+(e.days===0?' today':e.days<=3?' soon':'')+'"><span class="earn-sym">'+esc(e.symbol)+'</span><span class="earn-days">'+(e.days===0?'⚠️ 今日':e.days===1?'明日':e.days+'日後')+'</span></div>').join('');
  h+='</div></div>';
  const vw=data.virtualWallet||virtualWallet;
  if(vw){
    const ret=parseFloat(vw.totalReturnPct||0);
    const retClr=ret>=0?'var(--ac)':'var(--rd)';
    h+='<div class="dash-grid">';
    h+='<div class="dash-card" onclick="togP(\'paper\')" style="cursor:pointer"><div class="dc-title">虚拟训练中心</div><div style="font-size:18px;font-weight:800;font-family:\'IBM Plex Mono\',monospace">$'+sf(vw.totalEquity,0)+'</div><div style="font-size:10px;color:'+retClr+';font-family:\'IBM Plex Mono\',monospace">'+(ret>=0?'+':'')+sf(ret,2)+'% · Cash $'+sf(vw.cash,0)+'</div></div>';
    const s7=signalStats?.d7;
    h+='<div class="dash-card" onclick="togP(\'history\')" style="cursor:pointer"><div class="dc-title">AI 判断复盘</div>'+(s7?'<div style="font-size:18px;font-weight:800;font-family:\'IBM Plex Mono\',monospace;color:'+(s7.winRate>=60?'var(--ac)':s7.winRate>=45?'var(--am)':'var(--rd)')+'">'+s7.winRate+'%</div><div style="font-size:10px;color:var(--tx2)">7日命中 '+s7.wins+'/'+s7.total+' · 平均 '+(parseFloat(s7.avg)>=0?'+':'')+s7.avg+'%</div>'+(signalStats?.d30?'<div style="font-size:10px;color:var(--tx3)">30日 '+signalStats.d30.winRate+'% · '+signalStats.d30.wins+'/'+signalStats.d30.total+'</div>':''):'<div style="font-size:11px;color:var(--tx3)">等待 7 日结果</div>')+'</div>';
    h+='</div>';
  }
  // Stop-loss warnings
  if(warns.length)h+='<div style="background:var(--rd2);border:1px solid var(--rdb);border-radius:var(--r);padding:8px 10px;margin-bottom:6px"><div style="font-size:9px;font-weight:700;color:var(--rd);margin-bottom:4px;font-family:IBM Plex Mono,monospace">⛔ 損失警告 (>-5%)</div>'+warns.map(p=>{const cur=priceMap[p.symbol.toUpperCase()];const pnl=((cur.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100).toFixed(1);return'<div style="font-size:11px;color:var(--rd)">'+esc(p.symbol)+' '+pnl+'%</div>';}).join('')+'</div>';
  // Abnormal movers
  if(movers.length){h+='<div style="margin-bottom:8px"><div class="dc-title">⚡ 異常変動</div>';h+=movers.slice(0,5).map(m=>{const clr=m.change>0?'var(--ac)':'var(--rd)';const ptag=m.isPort?'<span style="background:var(--pu2);color:var(--pu);font-size:8px;font-family:IBM Plex Mono,monospace;padding:1px 4px;border-radius:4px">持株</span>':'';return'<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--bg3);border-radius:5px;margin-bottom:2px"><span style="font-weight:700;font-family:IBM Plex Mono,monospace;font-size:11px;min-width:46px">'+esc(m.symbol)+'</span>'+ptag+'<span style="color:'+clr+';font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:600;margin-left:auto">'+(m.change>0?'+':'')+sf(m.change,2)+'%</span></div>';}).join('');h+='</div>';}
  // Watchlist daily research surface
  h+='<div style="margin-bottom:8px"><div class="dc-title">📌 自选股日报</div><div id="dash-brief-body">'+watchlist.slice(0,8).map(w=>{const ch=parseFloat(w.change)||0;return'<div class="ev-item" onclick="loadMkt(\''+esc(w.symbol)+'\')"><div class="ev-hd"><span class="ev-sym">'+esc(w.symbol)+'</span><span class="ev-urg" style="color:'+(ch>0?'var(--ac)':ch<0?'var(--rd)':'var(--tx3)')+'">'+(ch>0?'+':'')+sf(ch,2)+'%</span></div><div class="ev-desc">等待 AI 生成：今天为什么涨/跌、最大风险、下一步关注。</div></div>';}).join('')+'</div></div>';
  // AI analysis buttons
  h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><button class="mbn" onclick="runSessionBrief(\'open\')" style="width:100%;background:var(--ac2);color:var(--ac);border-color:var(--acb);margin-top:2px">开盘前日报</button><button class="mbn" onclick="runSessionBrief(\'close\')" style="width:100%;background:var(--am2);color:var(--am);border-color:var(--amb);margin-top:2px">收盘后复盘</button><button class="mbn" onclick="runDailyBrief()" style="width:100%;background:var(--bl2);color:var(--bl);border-color:var(--blb);margin-top:2px">自选股日报</button></div>';
  body.innerHTML=h;
}

async function runAIDashboard(){
  const ak=activeAPIKey();if(!ak){togP('settings');return;}
  const aiBtn=Q('dash-ai-btn');if(aiBtn){aiBtn.disabled=true;aiBtn.textContent='分析中...';}
  const modeLabel=dashboardBriefMode==='open'?'开盘前日报':dashboardBriefMode==='close'?'收盘后复盘':'今日概况';
  const thk=showThk('🤖 正在生成'+modeLabel+'...');
  const r=await ipcRenderer.invoke('portfolio-dashboard',{key:ak,model:activeModel(),lang,portfolio:portfolio.filter(p=>p.symbol),watchlist,earningsData:dashData?.earningsMap||{}});
  thk.remove();
  if(aiBtn){aiBtn.disabled=false;aiBtn.textContent='🤖 AI分析';}
  if(!r.ok){addMsg('ai','<div class="errc">'+esc(r.error||'')+'</div>',1);return;}
  const d=r.data;
  const body=Q('dash-body');
  if(body){
    let h='';
    // Daily verdict
    if(d.dailyVerdict)h+='<div class="dash-verdict"><div class="dash-verdict-lbl">'+esc(modeLabel)+'</div><div class="dash-verdict-txt">'+esc(d.dailyVerdict)+'</div></div>';
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
  let chatH='<div class="briefing"><div class="briefing-title">📋 '+esc(modeLabel)+'</div>';
  if(d.dailyVerdict)chatH+='<div style="font-size:12px;color:var(--tx2);margin-bottom:8px;padding:6px 8px;background:var(--bg3);border-radius:6px">'+esc(d.dailyVerdict)+'</div>';
  if(d.topEvents?.length)chatH+=d.topEvents.map(ev=>'<div class="briefing-item" onclick="loadMkt(\''+esc(ev.symbol||'')+'\')"><span class="briefing-sym">'+esc(ev.symbol||'')+'</span><span style="font-size:10px;color:var(--tx2)">'+esc((ev.event||'').slice(0,70))+'</span></div>').join('');
  chatH+='</div>';
  addMsg('ai',chatH,1);
  dashboardBriefMode='daily';
}
async function runSessionBrief(mode){dashboardBriefMode=mode;await refreshDashboard();await runAIDashboard();}

// ═══ Virtual Wallet / Paper Simulator ═══
async function loadVirtualWallet(){
  const r=await ipcRenderer.invoke('virtual-wallet-load');
  if(r.ok){virtualWallet=r.wallet;renderVirtualWallet();}
}
function renderVirtualWallet(){
  const w=virtualWallet;if(!w)return;
  const equity=Q('vw-equity'),cash=Q('vw-cash'),ret=Q('vw-return'),pos=Q('vw-positions'),tr=Q('vw-trades');
  if(equity)equity.textContent='$'+sf(w.totalEquity,2);
  if(cash)cash.textContent='$'+sf(w.cash,2);
  if(ret){const pct=parseFloat(w.totalReturnPct||0);ret.textContent=(pct>=0?'+':'')+sf(pct,2)+'%';ret.style.color=pct>=0?'var(--ac)':'var(--rd)';}
  if(pos){
    const rows=Object.values(w.positions||{}).filter(p=>p.qty>0);
    pos.innerHTML=rows.length?rows.map(p=>'<div class="vw-row" onclick="loadMkt(\''+esc(p.symbol)+'\')"><span class="vw-sym">'+esc(p.symbol)+'</span><span>'+sf(p.qty,2)+' 股</span><span>$'+sf(p.lastPrice||p.avgCost,2)+'</span><span style="margin-left:auto;color:'+(p.unrealized>=0?'var(--ac)':'var(--rd)')+'">'+(p.unrealized>=0?'+':'')+'$'+sf(p.unrealized,2)+' ('+(p.unrealizedPct>=0?'+':'')+sf(p.unrealizedPct,2)+'%)</span></div>').join(''):'<div class="vw-empty">暂无虚拟持仓。买入一笔后，这里会显示成本、现价和浮动盈亏。</div>';
  }
  if(tr){
    const trades=w.trades||[];
    tr.innerHTML=trades.length?trades.slice(0,20).map(o=>{const d=o.discipline||{},dc=d.score>=82?'var(--ac)':d.score>=68?'var(--am)':'var(--rd)';return'<div class="vw-trade"><span class="vw-side '+o.side+'">'+o.side.toUpperCase()+'</span><span class="vw-sym">'+esc(o.symbol)+'</span><span>'+sf(o.qty,2)+' @ $'+sf(o.price,2)+'</span>'+(d.score?'<span class="disc-badge" style="color:'+dc+';border-color:'+dc+'">纪律 '+d.label+' '+d.score+'</span>':'')+'<span style="margin-left:auto;color:var(--tx3)">'+new Date(o.time).toLocaleDateString()+'</span></div>'+(d.flags?.length?'<div class="disc-note">'+esc(d.flags.join(' · '))+'</div>':'');}).join(''):'<div class="vw-empty">暂无模拟交易记录。</div>';
  }
}
async function submitVirtualTrade(side){
  const symbol=(Q('vw-symbol')?.value||mktData?.sym||tvData?.sym||'').trim().toUpperCase();
  const qty=parseFloat(Q('vw-qty')?.value||'');
  const note=(Q('vw-note')?.value||'').trim();
  if(!symbol||!qty){alert('请输入股票代码和数量');return;}
  const r=await ipcRenderer.invoke('virtual-trade',{symbol,side,qty,note});
  if(r.error){alert(r.error);return;}
  virtualWallet=r.wallet;renderVirtualWallet();
  if(Q('vw-note'))Q('vw-note').value='';
  const latest=virtualWallet.trades?.[0],disc=latest?.discipline;
  addMsg('ai','<div class="briefing"><div class="briefing-title">虚拟交易已记录</div><div class="briefing-item"><span class="briefing-sym">'+esc(symbol)+'</span><span>'+side.toUpperCase()+' '+sf(qty,2)+' 股</span><span style="margin-left:auto">权益 $'+sf(virtualWallet.totalEquity,2)+'</span></div>'+(disc?'<div class="why-box"><div class="why-lbl">交易纪律评分</div><div class="why-txt">Grade '+esc(disc.label)+' · '+disc.score+'/100'+(disc.flags?.length?' · '+esc(disc.flags.join(' · ')):'')+'</div></div>':'')+'</div>',1);
  if(Q('pnl-dashboard')?.classList.contains('open'))refreshDashboard();
}
async function resetVirtualWallet(){
  const cash=parseFloat(prompt('设置新的虚拟本金',virtualWallet?.initialCash||100000));
  if(!cash)return;
  const r=await ipcRenderer.invoke('virtual-wallet-reset',{cash});
  if(r.ok){virtualWallet=r.wallet;renderVirtualWallet();if(Q('pnl-dashboard')?.classList.contains('open'))refreshDashboard();}
}

// ═══ Portfolio ═══
function renderPort(){const list=Q('port-list');if(!list)return;let totalCost=0,totalVal=0;const rows=portfolio.map((p,i)=>{const cur=portPrices[p.symbol?.toUpperCase()];const hasPnl=cur?.price&&p.avgCost&&p.shares;let pnlHtml='';if(hasPnl){const pnl=(cur.price-parseFloat(p.avgCost))/parseFloat(p.avgCost)*100;totalCost+=parseFloat(p.avgCost)*parseFloat(p.shares);totalVal+=cur.price*parseFloat(p.shares);pnlHtml='<span class="port-pnl '+(pnl>=0?'du':'dd')+'">'+(pnl>=0?'+':'')+pnl.toFixed(1)+'%</span>';}return'<div class="port-row"><input class="port-in" value="'+esc(p.symbol||'')+'" onchange="updPort('+i+',\'symbol\',this.value)" placeholder="AAPL"/><input class="port-in" value="'+(p.shares||'')+'" onchange="updPort('+i+',\'shares\',this.value)" placeholder="株数" style="width:50px"/><input class="port-in" value="'+(p.avgCost||'')+'" onchange="updPort('+i+',\'avgCost\',this.value)" placeholder="$" style="width:60px"/>'+pnlHtml+'<button class="port-del" onclick="delPort('+i+')">×</button></div>';});const totalPnl=totalCost>0?((totalVal-totalCost)/totalCost*100).toFixed(1):null;const totalHtml=totalPnl!=null?'<div class="port-total"><span>合计盈亏 <b style="color:'+(parseFloat(totalPnl)>=0?'var(--ac)':'var(--rd)')+'">'+(parseFloat(totalPnl)>=0?'+':'')+totalPnl+'%</b></span><span style="color:var(--tx2);font-size:10px">$'+totalVal.toFixed(0)+'</span></div>':'';list.innerHTML=rows.join('')+totalHtml;}
async function refreshPortPrices(){const syms=portfolio.filter(p=>p.symbol).map(p=>p.symbol.toUpperCase());if(!syms.length)return;const r=await ipcRenderer.invoke('batch-prices',{symbols:syms});if(r.ok){r.results.forEach(res=>{if(!res.error)portPrices[res.symbol]={price:res.price,change:res.change};});renderPort();}}
function addPortRow(){portfolio.push({symbol:'',shares:'',avgCost:''});renderPort();savePort();}
function updPort(i,k,v){portfolio[i][k]=v;savePort();}
function delPort(i){portfolio.splice(i,1);renderPort();savePort();}
async function savePort(){await ipcRenderer.invoke('save-portfolio',{portfolio});}
function calcSignalStats(history,outcomeKey='outcome7d'){const withO=history.filter(h=>h[outcomeKey]&&h.price);if(!withO.length)return null;const results=withO.map(h=>{const sig=(h.signal||'').toUpperCase();const chg=h[outcomeKey].change;const bull=sig.includes('BUY')||sig.includes('BULL');const bear=sig.includes('SELL')||sig.includes('BEAR');const hit=bull?chg>0:bear?chg<0:Math.abs(chg)<3;return{hit,chg:bull||!bear?chg:-chg};});const wins=results.filter(r=>r.hit).length;const avg=results.reduce((a,r)=>a+r.chg,0)/results.length;return{total:results.length,wins,winRate:Math.round(wins/results.length*100),avg:avg.toFixed(1)};}
function calcModelStats(history,outcomeKey='outcome7d'){
  const groups={};
  history.filter(h=>h[outcomeKey]&&h.price).forEach(h=>{
    const provider=h.provider||'Unknown',modelName=h.model||'默认模型',key=provider+' · '+modelName;
    const sig=(h.signal||'').toUpperCase(),chg=h[outcomeKey].change;
    const bull=sig.includes('BUY')||sig.includes('BULL'),bear=sig.includes('SELL')||sig.includes('BEAR');
    const hit=bull?chg>0:bear?chg<0:Math.abs(chg)<3;
    if(!groups[key])groups[key]={provider,model:modelName,total:0,wins:0,avg:0};
    groups[key].total++;groups[key].wins+=hit?1:0;groups[key].avg+=bull||!bear?chg:-chg;
  });
  return Object.values(groups).map(g=>({...g,winRate:Math.round(g.wins/g.total*100),avg:(g.avg/g.total).toFixed(1)})).sort((a,b)=>b.winRate-a.winRate||b.total-a.total).slice(0,5);
}
async function loadHistory(){
  const list=Q('hist-list');if(!list)return;
  list.innerHTML='<div style="text-align:center;color:var(--tx3);padding:8px;font-size:11px">確認中...</div>';
  const r=await ipcRenderer.invoke('check-signal-outcomes');
  if(!r.ok||!r.history?.length){list.innerHTML='<div style="text-align:center;color:var(--tx3);padding:8px;font-size:11px" id="hist-empty">'+L[lang].lbl_history+'</div>';return;}
  const stats=calcSignalStats(r.history,'outcome7d'),stats30=calcSignalStats(r.history,'outcome30d'),modelStats=calcModelStats(r.history,'outcome7d');
  let html='';
  if(stats){const sc=stats.winRate>=60?'var(--ac)':stats.winRate>=45?'var(--am)':'var(--rd)';html+='<div class="sig-stats"><span>AI 7日判断复盘</span><span style="color:'+sc+';font-weight:700">胜率 '+stats.winRate+'%</span><span style="color:var(--tx2)">'+stats.wins+'/'+stats.total+'件</span><span style="color:'+(parseFloat(stats.avg)>=0?'var(--ac)':'var(--rd)')+'">平均 '+(parseFloat(stats.avg)>=0?'+':'')+stats.avg+'%</span>'+(stats30?'<span style="color:var(--tx3)">30日 '+stats30.winRate+'% · '+stats30.wins+'/'+stats30.total+'</span>':'')+'</div>';}
  if(modelStats.length){
    html+='<div class="sig-stats" style="display:block"><div style="font-weight:800;margin-bottom:6px;color:var(--tx)">模型表现排行榜</div>'+modelStats.map((m,i)=>{const c=m.winRate>=60?'var(--ac)':m.winRate>=45?'var(--am)':'var(--rd)';return'<div style="display:flex;align-items:center;gap:7px;margin:4px 0"><span style="width:18px;color:var(--tx3);font-family:IBM Plex Mono,monospace">#'+(i+1)+'</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(m.provider)+' · '+esc(m.model)+'</span><span style="color:'+c+';font-weight:800">'+m.winRate+'%</span><span style="color:var(--tx3);font-size:10px">'+m.wins+'/'+m.total+'</span><span style="color:'+(parseFloat(m.avg)>=0?'var(--ac)':'var(--rd)')+';font-size:10px">'+(parseFloat(m.avg)>=0?'+':'')+m.avg+'%</span></div>';}).join('')+'</div>';
  }
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
async function saveHistory(symbol,signal,score,summary,price){await ipcRenderer.invoke('save-history',{entry:{symbol,signal,score,summary:summary?.slice(0,200),price:price||null,provider:activeProvider(),model:activeModel()}});}


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



// ═══════════════════════════════════════════════════════════
// ALPACA PAPER TRADING BOT
// ═══════════════════════════════════════════════════════════
let botKeyId='',botSecret='',botIsRunning=false,botCycleTimer=null,botNextCycleDate=null;
let botPortfolioHistory=[],botChartRange=9999,botCurrentTab='dash',botChartExpanded=false;

function botKeyDisplayUpdate(keyId){
  const el=Q('bot-key-id-new');
  if(el&&keyId)el.value=keyId;
}
function togCfgSecret(){
  const inp=Q('bot-key-secret-new');if(!inp)return;
  inp.type=inp.type==='password'?'text':'password';
}
async function saveBotKeys(){
  const keyId=(Q('bot-key-id-new')?.value||'').trim();
  const secret=(Q('bot-key-secret-new')?.value||'').trim();
  const msg=Q('bot-key-cfg-msg');
  if(!keyId||!secret){if(msg){msg.style.color='var(--rd)';msg.textContent='请填写两个字段';}return;}
  if(msg){msg.style.color='var(--tx3)';msg.textContent='连接中…';}
  const r=await stockai.invoke('alpaca-connect',{keyId,secret});
  if(r.error){if(msg){msg.style.color='var(--rd)';msg.textContent='❌ '+r.error;}return;}
  botKeyId=keyId;botSecret=secret;
  Q('bot-key-id').value=keyId;Q('bot-key-secret').value=secret;
  botKeyDisplayUpdate(keyId);
  togBotKeyEdit();
  if(msg){msg.style.color='var(--ac)';msg.textContent='✓ 已保存并连接';}
  setTimeout(()=>{if(Q('bot-key-cfg-msg'))Q('bot-key-cfg-msg').textContent='';},3000);
  renderBotAccount(r.account,[],r.clock);
  Q('bot-setup').style.display='none';Q('bot-account').classList.add('visible');Q('bot-account').style.display='flex';
}
async function resetBotKeysFromCfg(){
  await stockai.invoke('alpaca-delete-keys');
  botKeyId='';botSecret='';
  Q('bot-key-id').value='';Q('bot-key-secret').value='';
  botKeyDisplayUpdate('');
  const banner=Q('bot-saved-banner');if(banner)banner.style.display='none';
  Q('bot-account').classList.remove('visible');Q('bot-account').style.display='none';Q('bot-setup').style.display='block';
  const msg=Q('bot-key-cfg-msg');
  if(msg){msg.style.color='var(--tx3)';msg.textContent='🗑 已重置，请重新连接';}
}
async function resetBotKeys(){
  await stockai.invoke('alpaca-delete-keys');
  botKeyId='';botSecret='';
  Q('bot-key-id').value='';Q('bot-key-secret').value='';
  const banner=Q('bot-saved-banner');if(banner)banner.style.display='none';
  const msg=Q('bot-connect-msg');if(msg){msg.style.color='var(--tx3)';msg.textContent='🗑 キーを削除しました';}
  setTimeout(()=>{if(Q('bot-connect-msg'))Q('bot-connect-msg').textContent='';},2500);
}
async function initBotPanel(){
  const r=await stockai.invoke('alpaca-load-keys');
  if(r.keyId){
    botKeyId=r.keyId;botSecret=r.secret;
    Q('bot-key-id').value=r.keyId;Q('bot-key-secret').value=r.secret;
    const banner=Q('bot-saved-banner');if(banner)banner.style.display='flex';
    botKeyDisplayUpdate(r.keyId);
  }
  const st=await stockai.invoke('bot-status');
  if(st.ok){
    botIsRunning=st.running;
    if(st.config){
      Q('bot-watchlist').value=st.config.watchlist.join(',');
      Q('bot-max-pos').value=st.config.maxPositionUSD;
      Q('bot-interval').value=st.config.intervalMinutes;
      Q('bot-buy-rsi').value=st.config.buyRSI;
      Q('bot-sell-rsi').value=st.config.sellRSI;
      Q('bot-sl').value=st.config.stopLossPercent;
      Q('bot-tp').value=st.config.takeProfitPercent;
      if(st.config.scalpMode!=null){Q('bot-scalp-mode').checked=!!st.config.scalpMode;botToggleScalpUI();}
      if(st.config.scalpStopPct!=null)Q('bot-scalp-sl').value=st.config.scalpStopPct;
      if(st.config.scalpProfitPct!=null)Q('bot-scalp-tp').value=st.config.scalpProfitPct;
      if(st.config.maxConcurrentPositions!=null&&Q('bot-max-concurrent'))Q('bot-max-concurrent').value=st.config.maxConcurrentPositions;
      if(st.config.limitSlippagePct!=null&&Q('bot-slip'))Q('bot-slip').value=st.config.limitSlippagePct;
    }
    if(st.logs.length)renderBotLogs(st.logs);
    if(r.keyId&&r.secret){Q('bot-setup').style.display='none';Q('bot-account').classList.add('visible');Q('bot-account').style.display='flex';botRefresh();}
    updateBotRunningUI(botIsRunning);
    if(botIsRunning)startBotNextCycleTimer(st.config?.intervalMinutes||15);
  }
  updateBotMarketStatus();
  setInterval(updateBotMarketStatus,60000);
  applyBotLang();
}

function switchBotTab(tab){
  botCurrentTab=tab;
  ['dash','hist','cfg'].forEach(t=>{
    const p=Q('bot-panel-'+t);const btn=Q('bot-tab-'+t);
    if(t===tab){
      if(t==='cfg'){p.style.display='flex';p.style.flex='1';}
      else{p.style.display='block';p.style.flex='1';p.style.overflowY='auto';p.style.minHeight='0';}
    }else{
      p.style.display='none';p.style.flex='';p.style.overflowY='';p.style.minHeight='';
    }
    btn.style.borderBottomColor=t===tab?'var(--ac)':'transparent';
    btn.style.color=t===tab?'var(--ac)':'var(--tx3)';
  });
  if(tab==='hist')loadBotTradeHistory();
  if(tab==='dash')drawBotChart();
}

function togBotSecret(){
  const inp=Q('bot-key-secret');if(!inp)return;
  const show=inp.type==='password';
  inp.type=show?'text':'password';
  const eye=Q('bot-secret-eye');
  if(eye)eye.style.opacity=show?'0.5':'1';
}
async function botConnect(){
  const keyId=Q('bot-key-id').value.trim(),secret=Q('bot-key-secret').value.trim();
  const msg=Q('bot-connect-msg');
  if(!isElectron){msg.style.color='var(--rd)';msg.textContent='❌ 当前是页面预览版，只能看界面。请用 Electron 版 StockAI 打开后再连接 Paper Trading。';return;}
  if(!keyId||!secret){msg.style.color='var(--rd)';msg.textContent=L[lang].bot_enter_key;return;}
  msg.style.color='var(--tx3)';msg.textContent=L[lang].bot_connecting;
  let r;
  try{r=await stockai.invoke('alpaca-connect',{keyId,secret});}
  catch(e){msg.style.color='var(--rd)';msg.textContent='❌ '+e.message;return;}
  if(!r||r.error){msg.style.color='var(--rd)';msg.textContent='❌ '+(r?.error||'接続失敗');return;}
  botKeyId=keyId;botSecret=secret;msg.textContent='';
  const banner=Q('bot-saved-banner');if(banner)banner.style.display='flex';
  botKeyDisplayUpdate(keyId);
  Q('bot-setup').style.display='none';Q('bot-account').classList.add('visible');Q('bot-account').style.display='flex';
  applyBotLang();
  renderBotAccount(r.account,[],r.clock);
}

async function botRefresh(){
  if(!botKeyId||!botSecret)return;
  const r=await stockai.invoke('alpaca-account',{keyId:botKeyId,secret:botSecret});
  if(r.error)return;
  renderBotAccount(r.account,r.positions,r.clock);
  // Load portfolio history for chart
  const ph=await stockai.invoke('bot-portfolio-history');
  if(ph.ok){botPortfolioHistory=ph.history;drawBotChart();}
}

function renderBotAccount(acct,positions,clock){
  const pv=parseFloat(acct.portfolio_value||0);
  const bp=parseFloat(acct.buying_power||0);
  const pnl=parseFloat(acct.equity||pv)-parseFloat(acct.last_equity||pv);
  Q('bot-portfolio-val').textContent='$'+pv.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  Q('bot-buying-power').textContent='$'+bp.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pnlEl=Q('bot-pnl');pnlEl.textContent=(pnl>=0?'+':'')+pnl.toFixed(2);pnlEl.style.color=pnl>=0?'var(--ac)':'var(--rd)';
  Q('bot-pos-count').textContent=positions.length;
  renderBotPositions(positions);
  if(clock)Q('bot-market-status').textContent=clock.is_open?'🟢 OPEN':'🔴 CLOSED';
}

function renderBotPositions(positions){
  window._botPositions=positions;
  const t=L[lang];
  const el=Q('bot-positions');
  if(!positions.length){el.innerHTML=`<div style="font-size:10px;color:var(--tx3);padding:4px 0 8px">${t.bot_no_pos}</div>`;return;}
  let h=`<div style="font-size:9px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">${t.bot_open_pos}</div>`;
  for(const p of positions){
    const pnl=parseFloat(p.unrealized_plpc||0)*100;
    const col=pnl>=0?'var(--ac)':'var(--rd)';
    const upl=parseFloat(p.unrealized_pl||0);
    h+=`<div style="background:var(--bg3);border:1px solid var(--brd);border-radius:8px;padding:7px 10px;margin-bottom:5px;display:flex;align-items:center;gap:8px">
      <div style="font-weight:700;font-size:12px;min-width:48px">${p.symbol}</div>
      <div style="font-size:10px;color:var(--tx2);flex:1">${p.qty}${t.bot_shares} @$${parseFloat(p.avg_entry_price).toFixed(2)}</div>
      <div style="font-size:11px;font-weight:700;font-family:monospace;color:${col}">${pnl>=0?'+':''}${pnl.toFixed(2)}% (${upl>=0?'+':''}$${upl.toFixed(0)})</div>
      <button onclick="botClosePos('${p.symbol}')" class="mbn" style="padding:2px 7px;font-size:10px;background:var(--rd2);color:var(--rd);border-color:var(--rdb)">${t.bot_sell_btn}</button>
    </div>`;
  }
  el.innerHTML=h;
}

async function loadBotTradeHistory(){
  const t=L[lang];
  const el=Q('bot-trade-list');
  el.innerHTML=`<div style="color:var(--tx3);text-align:center;padding:16px;font-size:10px">${t.bot_loading}</div>`;
  if(!botKeyId||!botSecret){el.innerHTML=`<div style="color:var(--tx3);text-align:center;padding:16px;font-size:10px">${t.bot_not_connected}</div>`;return;}
  const r=await stockai.invoke('alpaca-filled-orders',{keyId:botKeyId,secret:botSecret});
  if(r.error){el.innerHTML='<div style="color:var(--rd);padding:10px;font-size:10px">❌ '+r.error+'</div>';return;}
  const orders=r.orders||[];
  renderTradeStats(orders);
  if(!orders.length){el.innerHTML=`<div style="color:var(--tx3);text-align:center;padding:20px;font-size:10px">${t.bot_no_trades}</div>`;return;}
  const dtLocale=lang==='zh'?'zh-CN':lang==='ja'?'ja-JP':'en-US';
  let h=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px">
    <thead><tr style="color:var(--tx3);border-bottom:1px solid var(--brd)">
      <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px">${t.bot_th_date}</th>
      <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px">${t.bot_th_sym}</th>
      <th style="text-align:center;padding:5px 6px;font-weight:700;font-size:9px">${t.bot_th_side}</th>
      <th style="text-align:right;padding:5px 6px;font-weight:700;font-size:9px">${t.bot_th_qty}</th>
      <th style="text-align:right;padding:5px 6px;font-weight:700;font-size:9px">${t.bot_th_price}</th>
      <th style="text-align:right;padding:5px 6px;font-weight:700;font-size:9px">${t.bot_th_total}</th>
    </tr></thead><tbody>`;
  for(const o of orders){
    const dt=new Date(o.filled_at||o.created_at);
    const dateStr=dt.toLocaleDateString(dtLocale,{month:'2-digit',day:'2-digit'});
    const timeStr=dt.toLocaleTimeString(dtLocale,{hour:'2-digit',minute:'2-digit'});
    const isBuy=o.side==='buy';
    const qty=parseFloat(o.filled_qty||o.qty||0);
    const price=parseFloat(o.filled_avg_price||0);
    const total=qty*price;
    h+=`<tr style="border-bottom:1px solid var(--brd);transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <td style="padding:5px 6px;color:var(--tx3);white-space:nowrap">${dateStr}<br><span style="font-size:8px">${timeStr}</span></td>
      <td style="padding:5px 6px;font-weight:700">${o.symbol}</td>
      <td style="padding:5px 6px;text-align:center"><span style="background:${isBuy?'rgba(16,185,129,.15)':'rgba(239,68,68,.12)'};color:${isBuy?'var(--ac)':'var(--rd)'};border-radius:4px;padding:2px 6px;font-size:9px;font-weight:700">${isBuy?'BUY':'SELL'}</span></td>
      <td style="padding:5px 6px;text-align:right;font-family:monospace">${qty}</td>
      <td style="padding:5px 6px;text-align:right;font-family:monospace">$${price.toFixed(2)}</td>
      <td style="padding:5px 6px;text-align:right;font-family:monospace;font-weight:700">$${total.toFixed(0)}</td>
    </tr>`;
  }
  h+='</tbody></table></div>';
  el.innerHTML=h;
}

function renderTradeStats(orders){
  const el=Q('bot-trade-stats');
  const buys=orders.filter(o=>o.side==='buy').length;
  const sells=orders.filter(o=>o.side==='sell').length;
  const total=orders.length;
  const totalVol=orders.reduce((s,o)=>s+parseFloat(o.filled_qty||0)*parseFloat(o.filled_avg_price||0),0);
  const t=L[lang];
  el.innerHTML=`
    <div style="background:var(--bg3);border:1px solid var(--brd);border-radius:8px;padding:8px 10px;text-align:center">
      <div style="font-size:8px;color:var(--tx3);margin-bottom:3px">${t.bot_total}</div>
      <div style="font-size:18px;font-weight:800;font-family:monospace">${total}</div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--brd);border-radius:8px;padding:8px 10px;text-align:center">
      <div style="font-size:8px;color:var(--tx3);margin-bottom:3px">${t.bot_buysell}</div>
      <div style="font-size:14px;font-weight:800;font-family:monospace"><span style="color:var(--ac)">${buys}</span> / <span style="color:var(--rd)">${sells}</span></div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--brd);border-radius:8px;padding:8px 10px;text-align:center">
      <div style="font-size:8px;color:var(--tx3);margin-bottom:3px">${t.bot_vol}</div>
      <div style="font-size:13px;font-weight:800;font-family:monospace">$${(totalVol/1000).toFixed(1)}K</div>
    </div>`;
}

function setBotChartRange(days){
  botChartRange=days;
  [['1d',1],['7d',7],['1m',30],['all',9999]].forEach(([k,v])=>{
    const btn=Q('bcr-'+k);if(!btn)return;
    const on=days===v;
    btn.style.background=on?'var(--ac2)':'';btn.style.color=on?'var(--ac)':'';btn.style.borderColor=on?'var(--acb)':'';
  });
  drawBotChart();
  const wrap=Q('bot-chart-wrap');
  if(wrap){wrap.classList.remove('chart-anim');requestAnimationFrame(()=>wrap.classList.add('chart-anim'));}
}

function toggleBotChartExpand(){
  botChartExpanded=!botChartExpanded;
  const wrap=Q('bot-chart-wrap'),btn=Q('bcr-expand');
  if(wrap)wrap.style.height=botChartExpanded?'230px':'130px';
  if(btn)btn.textContent=botChartExpanded?'⤡':'⤢';
  setTimeout(drawBotChart,370);
}

function drawBotChart(){
  const canvas=Q('bot-chart');const emptyEl=Q('bot-chart-empty');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const w=canvas.offsetWidth||460,h=canvas.offsetHeight||130;
  canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);

  let data=botPortfolioHistory;
  if(!data||data.length<2){canvas.style.display='none';emptyEl.style.display='flex';return;}
  canvas.style.display='block';emptyEl.style.display='none';

  // Filter by range
  if(botChartRange<9999){
    const cutoff=Date.now()-botChartRange*24*60*60*1000;
    data=data.filter(d=>new Date(d.time).getTime()>=cutoff);
  }
  if(data.length<2){canvas.style.display='none';emptyEl.style.display='flex';return;}

  const values=data.map(d=>d.value);
  const minV=Math.min(...values),maxV=Math.max(...values);
  const range=maxV-minV||1;
  const pad={t:10,b:22,l:8,r:8};
  const cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;

  const isDark=document.body.classList.contains('dark')||!document.body.classList.contains('light');
  const gridColor=isDark?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)';
  const textColor=isDark?'rgba(255,255,255,.35)':'rgba(0,0,0,.35)';
  const isProfit=values[values.length-1]>=values[0];
  const lineColor=isProfit?'#10b981':'#ef4444';
  const fillColor=isProfit?'rgba(16,185,129,.12)':'rgba(239,68,68,.1)';

  ctx.clearRect(0,0,w,h);

  // Grid lines
  ctx.strokeStyle=gridColor;ctx.lineWidth=1;
  [0,.25,.5,.75,1].forEach(t=>{
    const y=pad.t+ch*(1-t);
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();
  });

  // Plot points
  const pts=data.map((d,i)=>({
    x:pad.l+cw*(i/(data.length-1)),
    y:pad.t+ch*(1-(d.value-minV)/range)
  }));

  // Fill area
  ctx.beginPath();ctx.moveTo(pts[0].x,pad.t+ch);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x,pad.t+ch);ctx.closePath();
  ctx.fillStyle=fillColor;ctx.fill();

  // Line
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.strokeStyle=lineColor;ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.stroke();

  // Labels: min/max/current
  ctx.fillStyle=textColor;ctx.font='9px monospace';ctx.textAlign='left';
  ctx.fillText('$'+minV.toLocaleString('en-US',{maximumFractionDigits:0}),pad.l+2,pad.t+ch-2);
  ctx.fillText('$'+maxV.toLocaleString('en-US',{maximumFractionDigits:0}),pad.l+2,pad.t+10);

  // X-axis dates
  const first=new Date(data[0].time),last=new Date(data[data.length-1].time);
  const fmt=d=>d.toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'});
  ctx.textAlign='left';ctx.fillText(fmt(first),pad.l,h-4);
  ctx.textAlign='right';ctx.fillText(fmt(last),w-pad.r,h-4);

  // Current value dot
  const lp=pts[pts.length-1];
  ctx.beginPath();ctx.arc(lp.x,lp.y,3,0,Math.PI*2);ctx.fillStyle=lineColor;ctx.fill();

  // % change label
  const pct=((values[values.length-1]-values[0])/values[0]*100);
  ctx.textAlign='right';ctx.fillStyle=lineColor;ctx.font='bold 10px monospace';
  ctx.fillText((pct>=0?'+':'')+pct.toFixed(2)+'%',w-pad.r,pad.t+10);
}

function renderBotLogs(logs){
  const el=Q('bot-log');
  if(!logs.length){el.innerHTML=`<div class="bot-log-empty" style="color:var(--tx3)">${L[lang].bot_log_empty}</div>`;return;}
  const colors={buy:'#10b981',sell:'#ef4444',hold:'#71717a',wait:'#52525b',info:'#a1a1aa',warn:'#f59e0b',error:'#ef4444'};
  const dtLocale=lang==='zh'?'zh-CN':lang==='ja'?'ja-JP':'en-US';
  el.innerHTML=logs.slice(0,80).map(e=>{
    const ts=new Date(e.time).toLocaleTimeString(dtLocale);
    return`<div style="color:${colors[e.type]||'#a1a1aa'}">[${ts}] ${e.msg}</div>`;
  }).join('');
  el.scrollTop=0;
}

async function botStart(){
  if(!botKeyId||!botSecret){alert(L[lang].bot_not_connected);return;}
  const config={
    watchlist:Q('bot-watchlist').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean),
    maxPositionUSD:parseFloat(Q('bot-max-pos').value)||500,
    stopLossPercent:parseFloat(Q('bot-sl').value)||3,
    takeProfitPercent:parseFloat(Q('bot-tp').value)||8,
    intervalMinutes:parseFloat(Q('bot-interval').value)||15,
    buyRSI:parseFloat(Q('bot-buy-rsi').value)||35,
    sellRSI:parseFloat(Q('bot-sell-rsi').value)||65,
    scalpMode:Q('bot-scalp-mode').checked,
    scalpStopPct:parseFloat(Q('bot-scalp-sl').value)||0.5,
    scalpProfitPct:parseFloat(Q('bot-scalp-tp').value)||1.5,
    maxConcurrentPositions:parseInt(Q('bot-max-concurrent')?.value)||3,
    limitSlippagePct:parseFloat(Q('bot-slip')?.value)||0.1,
    useBracketOrders:true,
  };
  const r=await stockai.invoke('bot-start',{keyId:botKeyId,secret:botSecret,config});
  if(r.error){alert(r.error);return;}
  botIsRunning=true;updateBotRunningUI(true);startBotNextCycleTimer(config.intervalMinutes);
}

async function botStop(){
  await stockai.invoke('bot-stop');
  botIsRunning=false;updateBotRunningUI(false);
  if(botCycleTimer){clearInterval(botCycleTimer);botCycleTimer=null;}
}

// 手動で1サイクル即時実行（テスト用）
async function botRunOnce(btn){
  if(!botKeyId||!botSecret){alert(L[lang].bot_not_connected);return;}
  const orig=btn.textContent,origBg=btn.style.background;
  btn.disabled=true;btn.textContent='⏳ '+L[lang].bot_running_cycle;btn.style.background='var(--ac2)';btn.style.color='var(--ac)';
  try{
    const r=await stockai.invoke('bot-run-once',{keyId:botKeyId,secret:botSecret});
    if(r.error){alert(r.error);}
  }catch(e){alert(e.message);}
  setTimeout(()=>{btn.disabled=false;btn.textContent=orig;btn.style.background=origBg;btn.style.color='var(--tx2)';},3000);
}

function botToggleScalpUI(toggle){
  const cb=Q('bot-scalp-mode');
  if(toggle===true)cb.checked=!cb.checked; // カード全体クリック時に状態反転
  const on=cb.checked;
  const slider=Q('bot-scalp-slider');
  const knob=Q('bot-scalp-knob');
  const inputs=Q('bot-scalp-inputs');
  const badgeOn=Q('bot-scalp-badge');
  const badgeOff=Q('bot-scalp-badge-off');
  const card=Q('bot-scalp-card');
  // 大型カード全体に視覚フィードバック
  if(card){
    card.style.background=on?'linear-gradient(135deg,#10b98115 0%,#f59e0b15 100%)':'var(--bg2)';
    card.style.borderColor=on?'#10b981':'var(--brd)';
    card.style.boxShadow=on?'0 0 0 3px #10b98120':'none';
  }
  // スイッチ
  if(slider)slider.style.background=on?'#10b981':'#9ca3af';
  if(knob)knob.style.left=on?'25px':'3px';
  // バッジ切替
  if(badgeOn)badgeOn.style.display=on?'inline-block':'none';
  if(badgeOff)badgeOff.style.display=on?'none':'inline-block';
  // 詳細入力欄
  if(inputs)inputs.style.display=on?'grid':'none';
  // スキャルプ有効時は間隔を自動的に2分に変更
  const intvEl=Q('bot-interval');
  if(on&&intvEl&&parseFloat(intvEl.value)>2)intvEl.value='2';
  else if(!on&&intvEl&&parseFloat(intvEl.value)<5)intvEl.value='15';
}

async function botClosePos(symbol){
  const msg=lang==='zh'?`确定卖出全部 ${symbol} 仓位？`:lang==='en'?`Close all ${symbol} positions?`:`${symbol}のポジションを全て売却しますか？`;
  if(!confirm(msg))return;
  const r=await stockai.invoke('alpaca-close-position',{keyId:botKeyId,secret:botSecret,symbol});
  if(r.error){alert(r.error);return;}
  setTimeout(botRefresh,1500);
}

async function botSaveCfg(){
  const config={
    watchlist:Q('bot-watchlist').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean),
    maxPositionUSD:parseFloat(Q('bot-max-pos').value)||500,
    stopLossPercent:parseFloat(Q('bot-sl').value)||3,
    takeProfitPercent:parseFloat(Q('bot-tp').value)||8,
    intervalMinutes:parseFloat(Q('bot-interval').value)||15,
    buyRSI:parseFloat(Q('bot-buy-rsi').value)||35,
    sellRSI:parseFloat(Q('bot-sell-rsi').value)||65,
    scalpMode:Q('bot-scalp-mode').checked,
    scalpStopPct:parseFloat(Q('bot-scalp-sl').value)||0.5,
    scalpProfitPct:parseFloat(Q('bot-scalp-tp').value)||1.5,
    maxConcurrentPositions:parseInt(Q('bot-max-concurrent')?.value)||3,
    limitSlippagePct:parseFloat(Q('bot-slip')?.value)||0.1,
    useBracketOrders:true,
  };
  const btn=Q('bot-cfg-save-btn');
  btn.disabled=true;
  await stockai.invoke('bot-save-config',config);
  btn.style.background='var(--ac)';btn.style.color='#04130d';btn.style.transform='scale(0.97)';
  btn.textContent='✓ 保存完了！';
  setTimeout(()=>btn.style.transform='',120);
  setTimeout(()=>{btn.style.background='var(--ac2)';btn.style.color='var(--ac)';btn.textContent=L[lang]?.bot_cfg_save||'保存设置';btn.disabled=false;},1800);
}

function updateBotRunningUI(running){
  const s=Q('bot-start-btn'),p=Q('bot-stop-btn'),b=Q('bot-running-banner');
  if(running){s.style.display='none';p.style.display='block';b.style.display='flex';}
  else{s.style.display='block';p.style.display='none';b.style.display='none';}
}

function startBotNextCycleTimer(minutes){
  if(botCycleTimer)clearInterval(botCycleTimer);
  botNextCycleDate=new Date(Date.now()+minutes*60*1000);
  botCycleTimer=setInterval(()=>{
    if(!botIsRunning){clearInterval(botCycleTimer);return;}
    const rem=Math.max(0,Math.round((botNextCycleDate-Date.now())/1000));
    const m=Math.floor(rem/60),s=rem%60;
    const el=Q('bot-next-cycle');if(el)el.textContent=`${L[lang].bot_next_prefix} ${m}:${String(s).padStart(2,'0')}`;
    if(rem<=0){botNextCycleDate=new Date(Date.now()+minutes*60*1000);botRefresh();}
  },1000);
}

function updateBotMarketStatus(){
  const el=Q('bot-market-status');if(!el)return;
  const est=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  const open=est.getDay()>0&&est.getDay()<6&&(est.getHours()*60+est.getMinutes())>=570&&(est.getHours()*60+est.getMinutes())<960;
  el.textContent=open?'🟢 OPEN':'🔴 CLOSED';
}

// Live updates from main process
stockai.on('bot-update',(err,data)=>{
  if(data.type==='log'){
    const logEl=Q('bot-log');if(!logEl)return;
    const colors={buy:'#10b981',sell:'#ef4444',hold:'#71717a',wait:'#52525b',info:'#a1a1aa',warn:'#f59e0b',error:'#ef4444'};
    const e=data.entry;const dtLocale=lang==='zh'?'zh-CN':lang==='ja'?'ja-JP':'en-US';
    const ts=new Date(e.time).toLocaleTimeString(dtLocale);
    const div=document.createElement('div');div.style.color=colors[e.type]||'#a1a1aa';div.textContent=`[${ts}] ${e.msg}`;
    if(logEl.querySelector('.bot-log-empty'))logEl.innerHTML='';
    logEl.insertBefore(div,logEl.firstChild);
    if(logEl.children.length>80)logEl.removeChild(logEl.lastChild);
  }
  if(data.type==='account'){renderBotAccount(data.account,data.positions,null);}
  if(data.type==='status'){botIsRunning=data.running;updateBotRunningUI(data.running);}
  if(data.type==='ws-status'){
    const badge=Q('bot-ws-badge');if(!badge)return;
    if(data.connected){
      badge.style.display='inline';
      badge.style.background='#10b98122';badge.style.color='#10b981';badge.style.borderColor='#10b98144';
      badge.textContent='📡 RT LIVE';
    }else{
      badge.style.background='#f59e0b22';badge.style.color='#f59e0b';badge.style.borderColor='#f59e0b44';
      badge.textContent='⏳ 再接続中';
    }
  }
  if(data.type==='cycle-end'){
    setTimeout(async()=>{
      botRefresh();
      if(botCurrentTab==='hist')loadBotTradeHistory();
    },2000);
  }
});

// ═══ Button ripple animation ═══
document.addEventListener('pointerdown',e=>{
  const btn=e.target.closest('.tbb,.mbn,.asv,.snb,.ob-open-btn,.ob-save-btn,.wl-add-btn,.port-add,.mbn,.tvab,.bot-tab,.tbs');
  if(!btn||btn.disabled)return;
  const r=document.createElement('span');
  const rect=btn.getBoundingClientRect();
  const sz=Math.max(rect.width,rect.height)*2;
  r.style.cssText=`position:absolute;border-radius:50%;pointer-events:none;`+
    `width:${sz}px;height:${sz}px;`+
    `left:${e.clientX-rect.left-sz/2}px;top:${e.clientY-rect.top-sz/2}px;`+
    `background:rgba(255,255,255,0.18);transform:scale(0);animation:_rpl .45s ease-out forwards;z-index:9;`;
  btn.appendChild(r);
  setTimeout(()=>r.remove(),500);
});
