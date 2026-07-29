@echo off
echo.
echo ========================================
echo   ENVOYER LE CODE SUR GITHUB
echo ========================================
echo.

REM Initialiser Git si pas encore fait
if not exist .git (
    echo Initialisation de Git...
    git init
    git config user.email "pablodaniel002@gmail.com"
    git config user.name "pablodaniel002-gpu"
)

REM Configurer le remote
git remote remove origin 2>nul
git remote add origin https://github.com/pablodaniel002-gpu/texas-holdem-poker.git

echo.
echo Ajout de tous les fichiers...
git add .

echo.
echo Creation du commit...
git commit -m "Code complet - site + bot + poker"

echo.
echo Envoi sur GitHub...
git branch -M main
git push -u origin main --force

echo.
echo ========================================
echo   TERMINE !
echo ========================================
echo.
echo Ton code est sur GitHub !
echo Maintenant va sur Railway pour deployer.
echo.
pause
