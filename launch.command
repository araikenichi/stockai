#!/bin/bash
cd "$(dirname "$0")"
clear
echo "╔═══════════════════════════════════════╗"
echo "║  🏛 StockAI v2.0 Hedge Fund System    ║"
echo "║  6-Agent Analysis Engine              ║"
echo "╚═══════════════════════════════════════╝"
if [ ! -d "node_modules" ]; then
  echo "▶ 初回インストール中..."
  npm install
fi
echo "▶ 起動中..."
npm start
