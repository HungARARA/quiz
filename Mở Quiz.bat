@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Quiz On Tap Y Khoa

echo.
echo  ============================================
echo     Quiz On Tap Y Khoa - Ung dung trac nghiem
echo  ============================================
echo.

rem --- 1) Kiem tra Node.js co san khong -----------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Khong tim thay Node.js tren may nay.
  echo      Vui long cai Node.js tai https://nodejs.org roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

rem --- 2) Neu port 3000 da co server dang chay -> mo trinh duyet luon
set "PORT_BUSY="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:"TCP.*:3000 .*LISTENING"') do set "PORT_BUSY=%%P"

if defined PORT_BUSY (
  echo  Server co ve da dang chay ^(PID %PORT_BUSY%^). Dang mo trinh duyet...
  start http://localhost:3000
  echo.
  echo  Neu trang khong hien len, hay dong cua so nay, tat tien trinh node.exe
  echo  cu trong Task Manager, roi chay lai file "Mo Quiz.bat".
  echo.
  pause
  exit /b 0
)

rem --- 3) Kiem tra thu muc / file can thiet --------------------------
if not exist "%~dp0quiz-app\server.js" (
  echo  [!] Khong tim thay "quiz-app\server.js".
  echo      Hay chac chan file nay nam cung thu muc voi "Mo Quiz.bat".
  echo.
  pause
  exit /b 1
)

cd /d "%~dp0quiz-app"

rem --- 4) Cai dependencies neu chua co ------------------------------
if not exist "node_modules" (
  echo  Dang cai dat cac thu vien can thiet ^(chi lam 1 lan^)...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo  [!] Cai dat thu vien khong thanh cong. Vui long kiem tra ket noi mang.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo  Dang khoi dong server...
echo.

start /b "" node server.js

echo  Dang cho server khoi dong...
timeout /t 3 /nobreak >nul
echo  Server da san sang! Dang mo trinh duyet...
start http://localhost:3000
echo.
echo  Dia chi : http://localhost:3000
echo  Dung tat cua so nay khi dang lam bai!
echo  Dong cua so nay se tu dong dung server.
echo.

:wait
timeout /t 86400 /nobreak >nul
goto wait
