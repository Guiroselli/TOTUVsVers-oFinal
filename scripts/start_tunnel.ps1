# Script PowerShell para inicializar o túnel Cloudflare do Proton Flow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Iniciando Cloudflare Tunnel - Proton Flow" -ForegroundColor Cyan
Write-Host "  Expondo Frontend (http://localhost:5173) e API (/api)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
cloudflared tunnel --url http://localhost:5173
