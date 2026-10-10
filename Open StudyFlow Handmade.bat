@echo off
title StudyFlow Handmade - keep this window open while you use the app
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  StudyFlow needs a free program called Node.js to run.
  echo  Download it from https://nodejs.org ^(the "LTS" version^), install it,
  echo  and then double-click "Open StudyFlow" again.
  echo.
  pause
  exit /b
)

echo.
echo  StudyFlow is starting...
echo  Your browser will open in a moment at http://127.0.0.1:4174
echo.
echo  KEEP THIS BLACK WINDOW OPEN while you use StudyFlow.
echo  When you are done, just close this window.
echo.

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://127.0.0.1:4174'"
node scripts\serve.mjs

echo.
echo  If you see "address already in use" above, another StudyFlow server is using this address.
echo  Close that server and open this file again to use this folder.
echo.
pause
