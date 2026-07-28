# ═══════════════════════════════════════════════════════════════
# Générateur de JWT_SECRET sécurisé
# ═══════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Génération d'un JWT_SECRET sécurisé                   ║" -ForegroundColor Yellow
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$secret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | % {[char]$_})

Write-Host "✅ Secret généré avec succès !" -ForegroundColor Green
Write-Host ""
Write-Host "Copie ce secret et colle-le dans Railway :" -ForegroundColor White
Write-Host ""
Write-Host $secret -ForegroundColor Yellow -BackgroundColor Black
Write-Host ""
Write-Host "➡️  Va sur Railway > ton projet > Variables" -ForegroundColor Cyan
Write-Host "➡️  Ajoute : JWT_SECRET = $secret" -ForegroundColor Cyan
Write-Host ""

# Copier automatiquement dans le presse-papier
$secret | Set-Clipboard
Write-Host "✅ Secret copié dans le presse-papier !" -ForegroundColor Green
Write-Host "   Tu peux le coller directement avec Ctrl+V" -ForegroundColor White
Write-Host ""

Read-Host "Appuie sur Entrée pour fermer"
