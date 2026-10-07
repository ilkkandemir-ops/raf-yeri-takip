@echo off
title Depo Destek Asistani
color 0A
cls

echo ========================================================
echo        DEPO DESTEK ASISTANI - STOK VE RAF YERI BOTU
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Sistemde Node.js kurulu bulunamadi!
    echo Lutfen https://nodejs.org adresinden kurunuz.
    echo.
    pause
    exit /b
)

echo Sunucu baslatiliyor...
echo Web Kontrol Paneli: http://localhost:3000
echo.

node src/server.js
echo.
echo [BILGI] Program sonlandi.
pause