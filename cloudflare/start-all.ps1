$ErrorActionPreference = 'Continue'
cd "$PSScriptRoot\.."

# Start docker
docker compose up -d

# Start tunnel in a new window
Start-Process powershell -ArgumentList @(
  '-NoExit','-ExecutionPolicy','Bypass',
  '-File',"$PSScriptRoot\cloudflared-quick.ps1"
)
