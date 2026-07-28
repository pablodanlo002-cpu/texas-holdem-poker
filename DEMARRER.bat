@echo off
echo.
echo ========================================
echo   DEMARRAGE LOCAL (DEV)
echo ========================================
echo.

REM Tuer les anciens processus
taskkill /F /IM node.exe 2>nul
timeout /t 2 >nul

REM Supprimer le cache
if exist .next rmdir /s /q .next
echo Cache supprime

echo.
echo Demarrage en mode developpement...
npm run dev:all
