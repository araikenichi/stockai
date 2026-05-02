const { contextBridge, ipcRenderer } = require('electron');

const allowedInvoke = new Set([
  'win-hide','win-quit','win-size','capture',
  'market-data','run-lite','run-agents','ai','multi-ai','agent-chat',
  'auto-start','auto-stop','save-history','load-history',
  'save-portfolio','load-portfolio','save-watchlist','load-watchlist',
  'batch-prices','earnings-data','portfolio-dashboard',
  'company-research','news-brief','trade-review','score-watchlist','watchlist-daily-brief',
  'tv-connect','tv-state','tv-symbol','tv-set-pine','tv-compile',
  'smart-monitor-start','smart-monitor-stop','get-stream-context','ai-with-context',
  'save-api-key','load-api-keys','delete-api-key','export-report','watchlist-analysis','debate-ai','load-symbol-history','check-signal-outcomes',
  'read-clipboard','open-external','detect-cli-auth','cli-ai',
  'alpaca-connect','alpaca-account','alpaca-load-keys','alpaca-delete-keys','alpaca-place-order','alpaca-close-position',
  'alpaca-filled-orders','bot-portfolio-history',
  'bot-start','bot-stop','bot-status','bot-save-config','bot-set-lang','bot-run-once'
]);

const allowedOn = new Set(['tv-status','auto-alert','agent-progress','stream-tick','smart-alert','bot-update']);

contextBridge.exposeInMainWorld('stockai', {
  invoke(channel, payload) {
    if (!allowedInvoke.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
    return ipcRenderer.invoke(channel, payload);
  },
  on(channel, listener) {
    if (!allowedOn.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
    const wrapped = (_event, data) => listener(null, data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
