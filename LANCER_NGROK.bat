@echo off
echo.
echo ========================================
echo   DEMARRAGE DE NGROK
echo ========================================
echo.
echo Le tunnel va se creer...
echo Le lien public sera affiche ci-dessous.
echo.
echo PARTAGE CE LIEN A TES POTES !
echo.
echo ========================================
echo.

cd /d "%~dp0"
ngrok http 3000
