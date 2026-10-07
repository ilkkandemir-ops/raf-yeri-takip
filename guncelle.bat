@echo off
chcp 65001 > nul
title Depo Destek Asistanı - Otomatik Güncelleme
color 0B

echo ========================================================
echo        DEPO DESTEK ASİSTANI - GÜNCELLEME SİSTEMİ
echo ========================================================
echo.

:: 1. Git Kontrolü
where git >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Sistemde Git kurulu bulunamadı!
    echo Lütfen Git'i (https://git-scm.com) kurup tekrar deneyiniz.
    echo.
    pause
    exit /b
)

:: 2. Node.js Kontrolü
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Sistemde Node.js kurulu bulunamadı!
    echo.
    pause
    exit /b
)

:: 3. Uzak Depo (Remote Origin) Doğrulama
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [AYAR] Uzak depo adresi bağlanıyor...
    git remote add origin https://github.com/ilkkandemir-ops/raf-yeri-takip.git
)

echo [1/3] Git sunucusundan en güncel kodlar çekiliyor (raf-yeri-takip)...
git fetch origin main >nul 2>nul
git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [UYARI] Doğrudan git pull tamamlanamadı.
    echo Yerel değişiklikler korunarak tekrar deneniyor...
    git stash
    git pull origin main
    git stash pop >nul 2>nul
)

echo.
echo [2/3] Yeni paket bağımlılıkları kontrol ediliyor ve yükleniyor...
call npm install --no-audit --no-fund

echo.
echo [3/3] Güncelleme başarıyla tamamlandı!
echo ========================================================
color 0A
echo.
echo Program en güncel sürüme yükseltildi.
echo Web Kontrol Paneli: http://localhost:3000
echo.

set /p START_NOW="Uygulamayı şimdi başlatmak istiyor musunuz? (E/H) [Varsayılan: E]: "
if /i "%START_NOW%"=="H" (
    echo Güncelleme sihirbazı kapatılıyor.
    timeout /t 3 >nul
    exit /b
)

echo Uygulama başlatılıyor...
start "" "baslat.bat"
exit
