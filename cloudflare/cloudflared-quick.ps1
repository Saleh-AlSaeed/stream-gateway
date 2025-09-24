# Quick Tunnel loop (trycloudflare)
$ErrorActionPreference = 'SilentlyContinue'
$cf = "C:\cloudflared\cloudflared.exe"
$target = 'http://127.0.0.1:8090'
$log = "$env:USERPROFILE\Desktop\cloudflared.log"

Write-Host "Starting Quick Tunnel to $target (logs: $log)"
while ($true) {
  try {
    & $cf tunnel --url $target --http-host-header localhost --no-autoupdate 2>&1 `
      | Tee-Object -FilePath $log -Append
  } catch { Start-Sleep -Seconds 3 }
  Start-Sleep -Seconds 3
}
