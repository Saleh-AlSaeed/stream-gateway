$ErrorActionPreference = 'SilentlyContinue'
# Kill cloudflared
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
# Stop docker
cd "$PSScriptRoot\.."
docker compose down
