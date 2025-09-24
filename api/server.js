import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { customAlphabet } from 'nanoid';

const app = express();
const PORT = process.env.PORT || 3000;
const HLS_DIR = process.env.HLS_DIR || '/data/hls';
const UA = process.env.FFMPEG_USER_AGENT || 'Mozilla/5.0';
const TLS_VERIFY = String(process.env.FFMPEG_TLS_VERIFY || '0');

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_', 10);

app.use(cors());
app.use(bodyParser.json({ limit: '256kb' }));

function buildFfmpegArgs({ srcUrl, outDir, mode }) {
  const outM3U = path.join(outDir, 'index.m3u8');
  const segTpl = path.join(outDir, 'index%03d.ts');

  const common = [
    '-hide_banner', '-loglevel', 'error',
    '-user_agent', UA,
    '-tls_verify', TLS_VERIFY,
    '-i', srcUrl,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+program_date_time',
    '-hls_segment_filename', segTpl
  ];

  if (mode === 'transcode') {
    return [
      ...common,
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', '128k',
      outM3U
    ];
  }

  // copy (default)
  return [
    ...common,
    '-c:v', 'copy',
    '-c:a', 'copy',
    outM3U
  ];
}

function startFfmpeg(id, srcUrl, mode = 'copy') {
  const outDir = path.join(HLS_DIR, id);
  fs.mkdirSync(outDir, { recursive: true });

  const args = buildFfmpegArgs({ srcUrl, outDir, mode });
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', d => process.stdout.write(`[FFMPEG ${id}] ${d}`));
  child.stderr.on('data', d => process.stdout.write(`[FFMPEG ${id}] ${d}`));
  child.on('close', code => {
    console.log(`[FFMPEG ${id}] exited ${code} null`);
  });

  return {
    id,
    url: `http://localhost:8090/hls/${id}/index.m3u8`
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, hlsDir: HLS_DIR }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/create', (req, res) => {
  try {
    const { srcUrl, mode = 'copy' } = req.body || {};
    if (!srcUrl || typeof srcUrl !== 'string') {
      return res.status(400).json({ error: 'srcUrl is required' });
    }
    const id = nanoid();
    const out = startFfmpeg(id, srcUrl.trim(), (mode || 'copy').trim());
    return res.json({ id: out.id, url: out.url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'internal' });
  }
});

app.listen(PORT, () => {
  console.log(`API on :${PORT}`);
});
