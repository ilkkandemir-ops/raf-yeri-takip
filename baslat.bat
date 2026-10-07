@echo off
chcp 65001 > nul
title Depo Destek Asistani
color 0A
cls
echo ========================================================
echo        DEPO DESTEK ASISTANI - STOK VE RAF YERI BOTU
echo ========================================================
echo.
echo Sunucu baslatiliyor...
echo Web Kontrol Paneli: http://localhost:3000
echo.

node src/server.js
pause
