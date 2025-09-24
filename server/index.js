import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

// مجلدات
const WEB_DIR = path.join(__dirname, '..', 'web');
const HLS_DIR = path.join(__dirname, '..', 'hls');

// تجهيز
fs.mkdirSync(HLS_DIR, { recursive: true });

app.use(cors({ origin: '*', methods: 'GET,POST,OPTIONS', allowedHeaders: '*' }));
app.use(express.json({ limit: '1mb' }));

// واجهة المستخدم
app.use('/', express.static(WEB_DIR, { fallthrough: true }));

// خدمة ملفات HLS مباشرة من نفس السيرفر
app.use('/hls', express.static(HLS_DIR, {
  setHeaders: (res, filePath) => {
    // لا كاش، لأن المانيفست يتحدّث باستمرار
    res.setHeader('Cache-Control', 'no-cache');
    // دعم CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  }
}));

// نقطة فحص بسيطة
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// إنشاء تحويل HLS
app.post('/api/create', async (req, res) => {
  try {
    const { srcUrl, mode = 'copy' } = req.body || {};
    if (!srcUrl || typeof srcUrl !== 'string') {
      return res.status(400).json({ error: 'srcUrl مطلوب' });
    }

    const id      = randomUUID().replace(/-/g, '').slice(0, 10);
    const outDir  = path.join(HLS_DIR, id);
    fs.mkdirSync(outDir, { recursive: true });

    const listPath = path.join(outDir, 'index.m3u8');

    // بارامترات ffmpeg لـ HLS
    const ffArgs = [
      '-y',
      '-hide_banner', '-loglevel', 'warning',
      '-user_agent', 'Mozilla/5.0',
      '-i', srcUrl,
      ...(mode === 'copy' ? ['-c:v', 'copy', '-c:a', 'copy'] : ['-c:v', 'libx264', '-c:a', 'aac', '-preset', 'veryfast', '-crf', '22']),
      '-hls_time', '4',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list',
      '-f', 'hls',
      listPath
    ];

    const ff = spawn('ffmpeg', ffArgs, { cwd: outDir });

    ff.on('close', (code) => {
      console.log(`[FFMPEG ${id}] exited ${code}`);
    });

    ff.stderr.on('data', d => {
      console.log(`[FFMPEG ${id}] ${d.toString().trim()}`);
    });

    // رابط HLS من نفس السيرفر
    const url = `/hls/${id}/index.m3u8`;
    res.json({ id, url: url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// رد 404 أنيق
app.use((req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => {
  console.log(`API+UI on :${PORT}`);
});
