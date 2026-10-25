import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { readTenantData, writeTenantData } from './storage.js';

const execFileAsync = promisify(execFile);

const PUSDIKLAT_DB_PATH = process.env.PUSDIKLAT_DB_PATH || '/mnt/e/Project/pusdiklat.db';

export function tentukanRuanganDefault(jumlahPeserta) {
  if (jumlahPeserta <= 24) return 'Ruang Kelas A (Lantai 2)';
  if (jumlahPeserta <= 36) return 'Ruang Kelas B (Lantai 2)';
  return 'Ruang Kelas Auditorium (Lantai 3)';
}

export async function fetchDiklatFromLocalDb() {
  if (!fs.existsSync(PUSDIKLAT_DB_PATH)) {
    return null;
  }

  const pyScript = `
import sqlite3, json

conn = sqlite3.connect('${PUSDIKLAT_DB_PATH}')
cur = conn.cursor()

# Ambil diklat aktif dan akan datang (hingga 30 hari ke depan, abaikan yang sudah selesai >3 hari lalu)
cur.execute("""
    SELECT d.id, d.nama_diklat, d.kode_diklat, d.tanggal_mulai, d.tanggal_selesai, d.status,
           (SELECT COUNT(*) FROM peserta WHERE diklat_id = d.id) as jml_peserta
    FROM diklat d
    WHERE d.tanggal_selesai >= date('now', '-3 days')
    ORDER BY d.tanggal_mulai ASC
""")
rows = cur.fetchall()

result = []
for r in rows:
    result.append({
        'id': r[0],
        'nama': r[1],
        'kode': r[2] or '',
        'mulai': str(r[3]),
        'selesai': str(r[4]),
        'status': r[5],
        'peserta_count': r[6]
    })
print(json.dumps(result))
`;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', pyScript]);
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.error('[SYNC] Error mengekstrak diklat dari pusdiklat.db:', err.message);
    return null;
  }
}

export async function syncLayarBaliData() {
  const currentData = readTenantData('bali');
  if (!currentData) {
    throw new Error('Data bali.json belum ditemukan di direktori data/.');
  }

  const dbRows = await fetchDiklatFromLocalDb();
  if (!dbRows || dbRows.length === 0) {
    return { ok: false, message: 'Database lokal tidak ditemukan atau tidak ada jadwal diklat aktif.', syncedCount: 0 };
  }

  const existingMap = new Map();
  (currentData.trainings || []).forEach(t => {
    existingMap.set(t.nama.toLowerCase().trim(), t);
  });

  const updatedTrainings = dbRows.map(row => {
    const key = row.nama.toLowerCase().trim();
    const existing = existingMap.get(key) || {};
    const pesertaLabel = row.peserta_count > 0 ? `${row.peserta_count} orang` : (existing.peserta || '30 orang');
    const ruang = existing.ruang || tentukanRuanganDefault(row.peserta_count);

    return {
      nama: row.nama,
      mulai: row.mulai,
      selesai: row.selesai,
      ket: existing.ket || (row.nama.toLowerCase().includes('pjj') ? 'PJJ Daring' : 'Tatap Muka'),
      sambutan: existing.sambutan || `Selamat datang para peserta ${row.nama} di Learning Center Pusdiklatwas BPKP Wilayah II Bali.`,
      ruang: ruang,
      jam: existing.jam || '08.00–17.00 WITA',
      peserta: pesertaLabel
    };
  });

  currentData.trainings = updatedTrainings;
  writeTenantData('bali', currentData);

  return {
    ok: true,
    message: `Berhasil menyinkronkan ${updatedTrainings.length} diklat ke data/bali.json`,
    syncedCount: updatedTrainings.length
  };
}
