# Script PowerShell para inicializar o túnel Cloudflare do Proton Flow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Iniciando Cloudflare Tunnel - protonflow.com.br" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
cloudflared tunnel run --token eyJhIjoiYzZkNTUxNTg4MzhlNjQ5OGQwOGQ3YmY4N2E5N2UwZjUiLCJ0IjoiMGFiYjdhMWUtMWZhNS00MzAwLWE0YWYtOTA4OWU5YWExZGQ1IiwicyI6Ik5qQTJOakV6TVRrdE1qZzRPUzAwWW1FekxXRTBNekV0TkdGbE56VXlOalJtWm1JeSJ9
