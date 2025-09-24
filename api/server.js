// server.js — Express API مع حد أقصى للوظائف + إنقاص تلقائي عند انتهاء FFmpeg
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// إعدادات
const HLS_DIR = process.env.HLS_DIR || '/data/hls';
const PORT    = Number(process.env.PORT || 3000);
const MAX_JOBS = Number(process.env.MAX_JOBS || 12); // عدّلها من docker-compose عبر environment

// حفظ العمليات النشطة
const jobs = new Map(); // id -> {proc, startedAt}
let activeJobs = 0;

// تأكد من وجود مجلد HLS
fs.mkdirSync(HLS_DIR, { recursive: true });

// أدوات مساعدة
const randId = (n=10) => crypto.randomBytes(n).toString('base64url').slice(0, n);
function decActive(id){
  if (jobs.has(id)) jobs.delete(id);
  if (activeJobs > 0) activeJobs--;
}

// صحة
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), activeJobs, maxJobs: MAX_JOBS, running: [...jobs.keys()] });
});

// إنشاء مهمة
app.post('/api/create', async (req, res) => {
  try{
    const srcUrl = (req.body?.srcUrl || '').trim();
    const mode   = (req.body?.mode || 'copy').trim();
    if(!srcUrl) return res.status(400).json({ error: 'srcUrl required' });

    // تحقق من الحد الأعلى
    if(activeJobs >= MAX_JOBS){
      res.setHeader('Retry-After', '10');
      return res.status(429).json({ message: 'الخادم مشغول الآن. أعد المحاولة لاحقًا.' });
    }

    const id = randId(10);
    const outDir = path.join(HLS_DIR, id);
    fs.mkdirSync(outDir, { recursive: true });

    const outManifest = path.join(outDir, 'index.m3u8');
    const outSegments = path.join(outDir, 'index%03d.ts');

    // معاملات FFmpeg
    const baseArgs = ['-hide_banner', '-loglevel', 'warning', '-y', '-i', srcUrl, '-map', '0:v:0?', '-map', '0:a:0?'];
    const copyArgs = ['-c:v', 'copy', '-c:a', 'copy'];
    const transArgs = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'];

    const hlsArgs = [
      '-f', 'hls',
      '-hls_time', '10',
      '-hls_list_size', '12',
      '-hls_flags', 'delete_segments+append_list+omit_endlist',
      '-hls_segment_filename', outSegments,
      outManifest
    ];

    const args = [...baseArgs, ...(mode === 'transcode' ? transArgs : copyArgs), ...hlsArgs];

    // ابدأ العملية
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeJobs++;
    jobs.set(id, { proc, startedAt: Date.now(), mode });

    proc.stdout.on('data', d => { /* يمكن كتابة لوج إن أردت */ });
    proc.stderr.on('data', d => { /* نفس الشيء */ });

    const onExit = (code, signal) => { decActive(id); };
    proc.on('close', onExit);
    proc.on('exit', onExit);
    proc.on('error', () => { decActive(id); });

    // أعد الرابط النسبي — Nginx سيخدم /hls
    return res.json({ id, url: `/hls/${id}/index.m3u8` });

  }catch(e){
    console.error(e);
    return res.status(500).json({ error: 'internal', detail: String(e?.message||e) });
  }
});

app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
});
