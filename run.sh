#!/bin/bash
cd "$(dirname "$0")"
echo "🏒 Hockey Pool 2026 — Starting on http://localhost:5050"
echo "    Player data will be fetched from the NHL API on first load."
echo ""
python app.py
