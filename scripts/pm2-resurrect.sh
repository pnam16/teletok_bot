#!/usr/bin/env bash
# Start PM2 and resurrect saved processes (for use at login, e.g. via Windows Startup).
# Start this app from ecosystem so script path is src/index.js; then save dump.
cd "$(dirname "$0")/.." && pm2 resurrect 2>/dev/null; pm2 start ecosystem.config.cjs --update-env && pm2 save
