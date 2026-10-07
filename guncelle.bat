@echo off
title Depo Destek Asistani - Otomatik Guncelleme
color 0B
cls

echo ========================================================
echo        DEPO DESTEK ASISTANI - GUNCELLEME SISTEMI
echo ========================================================
echo.

:: 1. Git Kontrolu
where git >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Sistemde Git kurulu bulunamadi!
    echo Lutfen Git'i https://git-scm.com adresinden kurup tekrar deneyiniz.
    echo.
    pause
    exit /b
)

:: 2. Node.js Kontrolu
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Sistemde Node.js kurulu bulunamadi!
    echo Lutfen Node.js'i https://nodejs.org adresinden kurup tekrar deneyiniz.
    echo.
    pause
    exit /b
)

:: 3. Uzak Depo Dogrulama
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [AYAR] Uzak depo adresi baglaniyor...
    git remote add origin https://github.com/ilkkandemir-ops/raf-yeri-takip.git
)

:: EXCEL GUVENLIK KALKANI (Guncelleme oncesi otomatik yerel koruma)
if exist "Raf Yerleri.xlsx" (
    copy /y "Raf Yerleri.xlsx" "Raf Yerleri_GUNCELLEME_KORUMASI.xlsx" >nul 2>nul
)

echo [1/3] Git sunucusundan en guncel kodlar cekiliyor...
git fetch origin main >nul 2>nul
git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [BILGI] Yerel degisiklikler saklanarak guncelleniyor...
    git stash
    git pull origin main
    git stash pop >nul 2>nul
)

:: EXCEL KORUMA KONTROLU (Git silmeye calissa bile aninda geri getir)
if not exist "Raf Yerleri.xlsx" (
    if exist "Raf Yerleri_GUNCELLEME_KORUMASI.xlsx" (
        copy /y "Raf Yerleri_GUNCELLEME_KORUMASI.xlsx" "Raf Yerleri.xlsx" >nul 2>nul
        echo [KORUMA] Excel stok veritabaniniz guvenle korundu.
    )
)

echo.
echo [2/3] Paket bagimliliklari kontrol ediliyor...
call npm install --no-audit --no-fund

echo.
echo [3/3] Guncelleme basariyla tamamlandi!
echo ========================================================
color 0A
echo.
echo Program en guncel surume yukseltildi.
echo Web Kontrol Paneli: http://localhost:3000
echo.

set START_NOW=E
set /p START_NOW="Uygulamayi simdi baslatmak istiyor musunuz? [E/H, Varsayilan: E]: "
if /i "%START_NOW%"=="H" goto :kapat

echo.
echo Uygulama baslatiliyor...
start "" "baslat.bat"
exit /b

:kapat
echo Guncelleme tamamlandi. Pencere kapatiliyor.
timeout /t 3 >nul
exit /b