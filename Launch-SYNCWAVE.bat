@echo off
title SYNCWAVE Launcher
cd /d "%~dp0"
echo Starting SYNCWAVE Desktop App...
start "" "node_modules\electron\dist\electron.exe" .
exit
