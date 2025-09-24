$ErrorActionPreference = 'Stop'
cd "$PSScriptRoot"

Write-Host "Starting Docker Compose..."
docker compose up -d

# انتظار nginx
for ($i=1; $i -le 30; $i++) {
  try {
    $code = curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8090/"
    if ($code -eq "200" -or $code -eq "304") { break }
  } catch {}
  Start-Sleep -Seconds 1
}
Write-Host "Compose is up. Visit: http://127.0.0.1:8090/"
