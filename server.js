import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import displayRouter from './routes/display.js';
import { syncLayarBaliData } from './lib/sync_pusdiklat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(cors());
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));

// Logging ringan
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/ping') && !req.path.endsWith('.png') && !req.path.endsWith('.mp3')) {
      console.log(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// Static assets (logo, foto, audio, icon)
app.use(express.static(ROOT_DIR, {
  maxAge: '1h',
  index: false
}));

// Mount Routers
app.use('/api', apiRouter);
app.use('/', displayRouter);

// Background auto-sync untuk Layar Bali tiap 15 menit
const SYNC_INTERVAL_MS = 15 * 60 * 1000;
setInterval(async () => {
  try {
    const res = await syncLayarBaliData();
    if (res.ok) {
      console.log(`[AUTO-SYNC] ${res.message}`);
    }
  } catch (err) {
    // Abaikan jika database belum siap
  }
}, SYNC_INTERVAL_MS);

// Jalankan sinkronisasi awal saat server pertama kali start
setTimeout(async () => {
  try {
    const res = await syncLayarBaliData();
    console.log(`[INIT-SYNC] ${res.message || 'Selesai'}`);
  } catch (e) {}
}, 2000);

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`📺 Layar Diklat Pusdiklatwas BPKP (Modular Signage Server)`);
  console.log(`🚀 Berjalan di http://0.0.0.0:${PORT}`);
  console.log(`🌐 Domain Target: https://layardiklat.pdbali.my.id`);
  console.log(`=======================================================`);
});

// Graceful Shutdown
function shutdown() {
  console.log('\n[SERVER] Menutup server layar-diklat...');
  server.close(() => {
    console.log('[SERVER] Server berhasil ditutup.');
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
