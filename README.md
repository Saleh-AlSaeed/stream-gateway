# stream-gateway

بوابة بسيطة لتحويل أي مصدر (SRT/UDP/HLS) إلى HLS وتشغيله عبر Nginx، مع خيار Cloudflare Quick Tunnel للنشر السريع.

## التشغيل محلياً

```powershell
cd C:\Users\<USER>\Desktop\stream-gateway
docker compose up -d
# افتح: http://127.0.0.1:8090/
