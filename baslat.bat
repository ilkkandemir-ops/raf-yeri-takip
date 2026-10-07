@echo off
chcp 65001 > nul
title Depo Destek Asistanı
color 0A
echo ========================================================
echo        DEPO DESTEK ASİSTANI - STOK & RAF YERİ BOTU
echo ========================================================
echo.
echo Sunucu baslatiliyor...
echo Web Kontrol Paneli: http://localhost:3000
echo.

node src/server.js
pause
