@echo off
echo ========================================================
echo   Iniciando Cloudflare Tunnel - Proton Flow
echo   Expondo Frontend (http://localhost:5173) e API (/api)
echo ========================================================
cloudflared tunnel --url http://localhost:5173
pause
