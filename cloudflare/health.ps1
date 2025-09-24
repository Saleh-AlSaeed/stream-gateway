Write-Host "Nginx:" -ForegroundColor Cyan
try {
  $h = curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8090/"
  "  / -> $h"
} catch { "  / -> ERROR" }

Write-Host "API:" -ForegroundColor Cyan
try {
  $api = curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:3000/api/health"
  "  /api/health -> $api"
} catch { "  /api/health -> ERROR" }
