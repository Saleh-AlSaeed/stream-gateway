# cloudflare\cloudflared-quick.ps1
param(
  [string]$Target = "http://127.0.0.1:8090"
)

$ErrorActionPreference = "Stop"

# أوقف أي cloudflared قديم
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force

# شغّل التانل
$log = "$env:USERPROFILE\Desktop\cloudflared.log"
& "C:\cloudflared\cloudflared.exe" tunnel --url $Target --http-host-header localhost --no-autoupdate 2>&1 | Tee-Object -FilePath $log

# (إذا أردته بالخلفية بدل foreground استخدم Start-Process ثم استخرج الرابط من اللوج بعد 5 ثواني)

# استخرج المضيف العام عند الإنشاء
$cfHost = (Select-String -Path $log -Pattern 'https://.+trycloudflare\.com' | Select-Object -Last 1).Matches.Value
if ($cfHost) {
  # اكتب العنوان في ملف تقرأه الواجهة (ضمن مجلد web)
  $root = Split-Path -Parent $PSScriptRoot
  $tunnelFile = Join-Path $root "web\tunnel.txt"
  Set-Content -Path $tunnelFile -Value $cfHost -Encoding ASCII
  Write-Host "Public host written to $tunnelFile : $cfHost"
} else {
  Write-Warning "No trycloudflare host detected yet."
}