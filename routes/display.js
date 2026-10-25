import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { readTenantData, isValidTenant } from '../lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const router = express.Router();

// Route /ping.txt
router.get('/ping.txt', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.type('text/plain').send('pong');
});

// Route legacy static JSON file: /data/:lokasi.json
router.get('/data/:lokasi.json', (req, res) => {
  const lokasi = String(req.params.lokasi || '').toLowerCase().trim();
  if (!isValidTenant(lokasi)) {
    return res.status(404).send('Wilayah tidak ditemukan.');
  }

  try {
    const data = readTenantData(lokasi);
    if (!data) return res.status(404).send('File data tidak ditemukan.');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Access-Control-Expose-Headers', 'Date, Age');
    return res.json(data);
  } catch (err) {
    return res.status(500).send('Gagal membaca data.');
  }
});

// Route /admin
router.get(['/admin', '/admin/*'], (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'admin.html'));
});

// Route per wilayah
router.get('/bali', (req, res) => {
  const customPath = path.join(ROOT_DIR, 'bali', 'index.html');
  if (fs.existsSync(customPath)) return res.sendFile(customPath);
  return res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

router.get('/medan', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'medan', 'index.html'));
});

router.get('/ciawi', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'ciawi', 'index.html'));
});

router.get('/makassar', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'makassar', 'index.html'));
});

// Route default root /
router.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

export default router;
