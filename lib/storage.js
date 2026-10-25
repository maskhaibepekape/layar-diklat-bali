import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export const VALID_TENANTS = ['bali', 'medan', 'ciawi', 'makassar'];

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export function isValidTenant(tenant) {
  return typeof tenant === 'string' && VALID_TENANTS.includes(tenant.toLowerCase().trim());
}

export function getTenantFilePath(tenant) {
  const t = tenant.toLowerCase().trim();
  return path.join(DATA_DIR, `${t}.json`);
}

export function readTenantData(tenant) {
  ensureDirs();
  const filePath = getTenantFilePath(tenant);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[STORAGE] Gagal membaca data ${tenant}:`, err.message);
    throw new Error(`Data wilayah ${tenant} rusak atau tidak valid.`);
  }
}

export function writeTenantData(tenant, dataObj) {
  ensureDirs();
  const t = tenant.toLowerCase().trim();
  const filePath = getTenantFilePath(t);

  if (!dataObj || typeof dataObj !== 'object') {
    throw new Error('Payload data harus berupa objek JSON valid.');
  }

  // Simpan snapshot backup jika file lama sudah ada
  if (fs.existsSync(filePath)) {
    try {
      const nowStr = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `${t}_${nowStr}.json`);
      fs.copyFileSync(filePath, backupPath);

      // Bersihkan backup lama, simpan maksimal 20 backup per tenant
      cleanOldBackups(t, 20);
    } catch (bErr) {
      console.warn(`[STORAGE] Gagal membuat backup untuk ${t}:`, bErr.message);
    }
  }

  // Tulis atomic melalui file sementara
  const tmpPath = `${filePath}.tmp_${Date.now()}`;
  const jsonContent = JSON.stringify(dataObj, null, 2);
  fs.writeFileSync(tmpPath, jsonContent, 'utf8');
  fs.renameSync(tmpPath, filePath);

  return { ok: true, path: filePath, bytes: jsonContent.length };
}

function cleanOldBackups(tenant, maxKeep = 20) {
  try {
    const prefix = `${tenant}_`;
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > maxKeep) {
      for (const item of files.slice(maxKeep)) {
        fs.unlinkSync(path.join(BACKUP_DIR, item.name));
      }
    }
  } catch (e) {
    // Ignore cleanup error
  }
}
