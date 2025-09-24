param(
  [ValidateSet('start-all','stop-all','restart-all','status','docker-start','docker-stop','docker-restart','tunnel-start','tunnel-stop','tunnel-restart','tunnel-host')]
  [string]$Cmd = 'status'
)

$composeDir = 'C:\Users\sale7\Desktop\stream-gateway'
$cfExe      = 'C:\cloudflared\cloudflared.exe'
$quickPs1   = 'C:\Users\sale7\Desktop\stream-gateway\cloudflare\cloudflared-quick.ps1'
$cfTaskName = 'StreamGateway Tunnel'
$dkTaskName = 'StreamGateway Docker'
$log        = "$env:USERPROFILE\Desktop\cloudflared.log"

function Docker-Start  { Push-Location $composeDir; docker compose up -d; Pop-Location }
function Docker-Stop   { Push-Location $composeDir; docker compose down; Pop-Location }
function Docker-Restart{ Push-Location $composeDir; docker compose down; docker compose up -d; Pop-Location }
function Docker-Status { Push-Location $composeDir; docker compose ps; Pop-Location }

function Tunnel-Start {
  # لو في مهمة مجدولة شغّلها، وإلا شغّل السكربت اليدوي
  try { schtasks /Run /TN "$cfTaskName" | Out-Null; return } catch {}
  if (Test-Path $quickPs1) {
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$quickPs1`"" -WindowStyle Hidden
  } else {
    Start-Process powershell -ArgumentList "-NoExit -Command `"$cfExe`" tunnel --url http://127.0.0.1:8090 --http-host-header localhost --no-autoupdate"
  }
}

function Tunnel-Stop {
  # أوقف المهمة المجدولة إن وجدت
  try { schtasks /End /TN "$cfTaskName" | Out-Null } catch {}
  # أوقف أي cloudflared شغّال
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
}

function Tunnel-Restart { Tunnel-Stop; Start-Sleep -Seconds 2; Tunnel-Start }

function Tunnel-Host {
  if (Test-Path $log) {
    $m = (Get-Content $log -Tail 400 | Select-String -Pattern 'https://[a-z0-9\-]+\.trycloudflare\.com' -AllMatches).Matches
    if ($m.Count -gt 0) { $m[-1].Value } else { 'لم يتم العثور على مضيف في اللوج.' }
  } else { 'لا يوجد ملف لوج cloudflared بعد.' }
}

switch ($Cmd) {
  'docker-start'   { Docker-Start }
  'docker-stop'    { Docker-Stop }
  'docker-restart' { Docker-Restart }
  'status'         { Docker-Status; return }
  'tunnel-start'   { Tunnel-Start }
  'tunnel-stop'    { Tunnel-Stop }
  'tunnel-restart' { Tunnel-Restart }
  'tunnel-host'    { Tunnel-Host; return }
  'start-all'      { Docker-Start; Tunnel-Start }
  'stop-all'       { Tunnel-Stop; Docker-Stop }
  'restart-all'    { Tunnel-Stop; Docker-Restart; Tunnel-Start }
  default          { Write-Host "Unknown command"; exit 1 }
}
