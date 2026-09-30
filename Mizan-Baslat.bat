@echo off
chcp 65001 >nul
title Mizan
cd /d "%~dp0"
if not exist node_modules (
  echo Paketler kuruluyor, bu ilk seferde birkac dakika surebilir...
  call npm install
)
echo.
echo Mizan baslatiliyor. Tarayici otomatik acilacak.
echo Kapatmak icin bu pencereyi kapatin.
echo.
call npm run dev -- --open
