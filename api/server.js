// api/server.js
// خادم بسيط لإنشاء HLS من رابط (copy أو transcode) مع إدارة حد أعلى للمهام

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

// إعدادات
const PORT = parseInt(process.env.PORT || '3000', 10);
const HLS_DIR = process.env.HLS_DIR || '/data/hls';
const MAX_JOBS = parseInt(process.env.MAX_JOBS || '12', 10);
const OVERFLOW_POLICY = (process.env.OVERFLOW_POLICY || 'evict_oldest').toLowerCase(); // queue | evict_oldest | reject
const JOB_TTL_MIN = parseInt(process.env.JOB_TTL_MIN || '600', 10);

// تأكد من وجود مجلد الإخراج
fs.mkdirSync(HLS_DIR, { recursive: true });

// إدارة المهام
/** @type {Map<string, {id:string,proc:import('child_process').ChildProcess,dir:string,createdAt:number,mode:string,srcUrl:string,finished:boolean}>} */
const jobs = new Map();
/** @type {Array<{srcUrl:string,mode:string,resolve:Function,reject:Function}>>} */
const queue = [];

// أدوات مساعدة
const now = () => Date.now();
const newId = () => crypto.randomBytes(6).toString('base64url'); // 8-10 حروف
function listJobs() {
  return [...jobs.values()].map(j => ({
    id: j.id,
    mode: j.mode,
    srcUrl: j.srcUrl,
    dir: j.dir,
    createdAt: j.createdAt,
    finished: j.finished
  }));
}
function evictOldest() {
  let oldest = null;
  for (const j of jobs.values()) {
    if (!oldest || j.createdAt < oldest.createdAt) oldest = j;
  }
  if (oldest) {
    try { oldest.proc.kill('SIGTERM'); } catch {}
    // سنحذف من الـ Map عند close
    return oldest.id;
  }
  return null;
}
function reapFinishedAndOld() {
  const cutoff = now() - JOB_TTL_MIN * 600_000;
  for (const j of jobs.values()) {
    const done = j.finished || j.createdAt < cutoff;
    if (done) {
      try { j.proc.kill('SIGTERM'); } catch {}
    }
  }
  // تنظيف المجلدات القديمة على القرص
  try {
    for (const name of fs.readdirSync(HLS_DIR)) {
      const p = path.join(HLS_DIR, name);
      const st = fs.statSync(p);
      if (st.isDirectory() && st.mtimeMs < cutoff) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  } catch {}
}
// مجدول تنظيف
setInterval(reapFinishedAndOld, 600_000);

// تشغيل مهمة FFmpeg
function startJob({ srcUrl, mode }) {
  const id = newId();
  const dir = path.join(HLS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  // إعدادات HLS
  const manifest = path.join(dir, 'index.m3u8');
  const segmentPattern = path.join(dir, 'index%03d.ts');

  // بناء باراميترات FFmpeg
  const common = [
    '-y',
    '-i', srcUrl,
    '-f', 'hls',
    '-hls_time', '10',
    '-hls_list_size', '12',
    '-hls_flags', 'delete_segments+program_date_time',
    '-hls_segment_filename', segmentPattern,
    manifest
  ];

  let args;
  if (mode === 'transcode') {
    args = [
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
      '-hide_banner', '-loglevel', 'warning',
      '-i', srcUrl,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      ...common.slice(2) // من -f hls وما بعدها
    ];
  } else {
    // copy (الافتراضي)
    args = [
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
      '-hide_banner', '-loglevel', 'warning',
      '-i', srcUrl,
      '-c', 'copy',
      ...common.slice(2)
    ];
  }

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `FFMPEG ${id}`;
  proc.stdout.on('data', d => process.stdout.write(`[${tag}] ${d}`));
  proc.stderr.on('data', d => process.stdout.write(`[${tag}] ${d}`));

  const job = { id, proc, dir, createdAt: now(), mode, srcUrl, finished: false };
  jobs.set(id, job);

  proc.on('close', (code, signal) => {
    job.finished = true;
    console.log(`[${tag}] exited ${code} ${signal}`);
    jobs.delete(id);
    // لا نحذف المجلد فورًا—يُمكن للعميل أن يُكمل التحميل من الكاش ثوانٍ بسيطة
  });

  return { id, relUrl: `/hls/${id}/index.m3u8` };
}

// مساعدة: بدء مهمة مع احترام الحد الأعلى والسياسة
async function startJobWithPolicy(reqBody) {
  // جرّب تنظيف السريع أولًا
  reapFinishedAndOld();

  if (jobs.size >= MAX_JOBS) {
    if (OVERFLOW_POLICY === 'evict_oldest') {
      const kicked = evictOldest();
      console.log(`[JOBS] evicted oldest: ${kicked}`);
    } else if (OVERFLOW_POLICY === 'reject') {
      const err = new Error(`Max concurrent jobs (${MAX_JOBS}) reached`);
      err.status = 429;
      throw err;
    } else if (OVERFLOW_POLICY === 'queue') {
      // طابور بسيط: ننتظر حتى تتفرغ خانة
      await new Promise(resolve => {
        queue.push({ ...reqBody, resolve });
      });
    }
  }
  return startJob(reqBody);
}

// عندما تُفرغ خانة (عند إغلاق أي عملية) جرّب سحب طلب من الطابور
function tryDrainQueue() {
  if (queue.length && jobs.size < MAX_JOBS) {
    const item = queue.shift();
    const res = startJob({ srcUrl: item.srcUrl, mode: item.mode });
    item.resolve(res);
  }
}
setInterval(tryDrainQueue, 1000);

// مسارات API
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/api/jobs', (_req, res) => {
  res.json({ size: jobs.size, max: MAX_JOBS, policy: OVERFLOW_POLICY, jobs: listJobs() });
});

app.post('/api/stop/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'not found' });
  try { j.proc.kill('SIGTERM'); } catch {}
  res.json({ stopped: req.params.id });
});

app.post('/api/create', async (req, res) => {
  try {
    const { srcUrl, mode } = req.body || {};
    if (!srcUrl || typeof srcUrl !== 'string') {
      return res.status(400).json({ error: 'srcUrl مطلوب' });
    }
    const m = (mode === 'transcode') ? 'transcode' : 'copy';
    const { id, relUrl } = await startJobWithPolicy({ srcUrl, mode: m });
    // أعدنا مسارًا نسبيًا—الـ Nginx سيخدمه
    res.json({ id, url: relUrl });
  } catch (e) {
    console.error(e);
    const status = e.status || 500;
    res.status(status).json({ error: e.message || 'internal error' });
  }
});

app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
});
