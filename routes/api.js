import express from 'express';
import { readTenantData, writeTenantData, isValidTenant, VALID_TENANTS } from '../lib/storage.js';
import { requireTenantAuth } from '../lib/auth.js';
import { syncLayarBaliData } from '../lib/sync_pusdiklat.js';

const router = express.Router();

// GET /api/data/:lokasi — Data JSON signage real-time
router.get('/data/:lokasi', (req, res) => {
  const lokasi = String(req.params.lokasi || '').toLowerCase().trim();
  if (!isValidTenant(lokasi)) {
    return res.status(400).json({ error: `Wilayah '${lokasi}' tidak terdaftar.` });
  }

  try {
    const data = readTenantData(lokasi);
    if (!data) {
      return res.status(404).json({ error: `Data wilayah '${lokasi}' tidak ditemukan.` });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Access-Control-Expose-Headers', 'Date, Age');
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/save — Simpan perubahan data dari Admin Dashboard
router.post('/save', requireTenantAuth, (req, res) => {
  const tenant = req.authTenant;
  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Format data tidak valid' });
  }

  // Validasi ukuran payload (maks. 250 KB)
  const rawBodyStr = JSON.stringify(payload);
  if (rawBodyStr.length > 250000) {
    return res.status(413).json({ error: 'Ukuran data melebihi batas maksimal 250 KB.' });
  }

  const dataToSave = payload.data || payload;
  if (!dataToSave || typeof dataToSave !== 'object' || !Array.isArray(dataToSave.trainings)) {
    return res.status(400).json({ error: 'Struktur data tidak valid: field "trainings" berupa array wajib ada.' });
  }

  try {
    const result = writeTenantData(tenant, dataToSave);
    return res.json({
      ok: true,
      message: `Data layar wilayah ${tenant.toUpperCase()} berhasil disimpan.`,
      bytes: result.bytes,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: `Gagal menyimpan data: ${err.message}` });
  }
});

// POST /api/sync/bali — Trigger sinkronisasi jadwal diklat lokal Balai
router.post('/sync/bali', requireTenantAuth, async (req, res) => {
  try {
    const result = await syncLayarBaliData();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: `Gagal sinkronisasi: ${err.message}` });
  }
});

// GET /api/status — Status & health check
router.get('/status', (req, res) => {
  return res.json({
    status: 'ok',
    app: 'layar-diklat',
    version: '2.0.0',
    tenants: VALID_TENANTS,
    timestamp: new Date().toISOString()
  });
});

export default router;
