import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { readTenantData, writeTenantData } from './storage.js';

const execFileAsync = promisify(execFile);

const PUSDIKLAT_DB_PATH = process.env.PUSDIKLAT_DB_PATH || 
  (fs.existsSync('/mnt/e/Project/pusdiklat.db') 
    ? '/mnt/e/Project/pusdiklat.db' 
    : '/Users/muhammadkhairizkibudiman/Downloads/Aplikasi/diklatbali/pusdiklat.db');

export function tentukanRuanganDefault(jumlahPeserta) {
  if (jumlahPeserta <= 24) return 'Ruang Kelas A (Lantai 2)';
  if (jumlahPeserta <= 36) return 'Ruang Kelas B (Lantai 2)';
  return 'Ruang Kelas Auditorium (Lantai 3)';
}

export async function fetchPusdiklatDataFromLocalDb() {
  if (!fs.existsSync(PUSDIKLAT_DB_PATH)) {
    return null;
  }

  const pyScript = `
import sqlite3, json

conn = sqlite3.connect('${PUSDIKLAT_DB_PATH}')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 1. Diklat aktif dan akan datang (hingga 30 hari ke depan, abaikan yang selesai >3 hari lalu)
cur.execute("""
    SELECT d.id, d.nama_diklat, d.kode_diklat, d.tanggal_mulai, d.tanggal_selesai, d.status,
           (SELECT COUNT(*) FROM peserta WHERE diklat_id = d.id) as jml_peserta
    FROM diklat d
    WHERE d.tanggal_selesai >= date('now', '-3 days')
    ORDER BY d.tanggal_mulai ASC
""")
diklat_rows = [dict(r) for r in cur.fetchall()]

# 2. Master Ruangan
cur.execute("""
    SELECT id, kode_ruangan, nama_ruangan, lokasi, kapasitas, kategori, fasilitas
    FROM master_ruangan
    WHERE status_aktif = 1
    ORDER BY id ASC
""")
rooms_rows = [dict(r) for r in cur.fetchall()]

# 3. Tanggal hari ini WITA
cur.execute("SELECT date('now', '+8 hours')")
today_wita = cur.fetchone()[0]

# 4. Booking Ruangan hari ini
cur.execute("""
    SELECT id, ruangan_id, nama_peminjam, agenda, kategori_kegiatan, tanggal, jam_mulai, jam_selesai 
    FROM booking_ruangan 
    WHERE tanggal = ? AND status = 'CONFIRMED'
    ORDER BY jam_mulai ASC
""", (today_wita,))
booking_rows = [dict(r) for r in cur.fetchall()]

print(json.dumps({
    'diklat': diklat_rows,
    'rooms': rooms_rows,
    'bookings': booking_rows,
    'today_wita': today_wita
}))
`;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', pyScript]);
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.error('[SYNC] Error mengekstrak data dari pusdiklat.db:', err.message);
    return null;
  }
}

export async function syncLayarBaliData() {
  const currentData = readTenantData('bali');
  if (!currentData) {
    throw new Error('Data bali.json belum ditemukan di direktori data/.');
  }

  const dbData = await fetchPusdiklatDataFromLocalDb();
  if (!dbData || !dbData.diklat || dbData.diklat.length === 0) {
    return { ok: false, message: 'Database lokal tidak ditemukan atau tidak ada jadwal diklat aktif.', syncedCount: 0 };
  }

  // 1. Update Trainings
  const existingMap = new Map();
  (currentData.trainings || []).forEach(t => {
    existingMap.set(t.nama.toLowerCase().trim(), t);
  });

  const updatedTrainings = dbData.diklat.map(row => {
    const key = (row.nama_diklat || row.nama || '').toLowerCase().trim();
    const existing = existingMap.get(key) || {};
    const jmlPeserta = row.jml_peserta ?? row.peserta_count ?? 0;
    const pesertaLabel = jmlPeserta > 0 ? `${jmlPeserta} orang` : (existing.peserta || '30 orang');
    const ruang = existing.ruang || tentukanRuanganDefault(jmlPeserta);

    return {
      nama: row.nama_diklat || row.nama,
      mulai: String(row.tanggal_mulai || row.mulai),
      selesai: String(row.tanggal_selesai || row.selesai),
      ket: existing.ket || ((row.nama_diklat || '').toLowerCase().includes('pjj') ? 'PJJ Daring' : 'Tatap Muka'),
      sambutan: existing.sambutan || `Selamat datang para peserta ${row.nama_diklat || row.nama} di Learning Center Pusdiklatwas BPKP Wilayah II Bali.`,
      ruang: ruang,
      jam: existing.jam || '08.00–17.00 WITA',
      peserta: pesertaLabel
    };
  });

  // 2. Update Rooms
  const existingRoomsMap = new Map();
  (currentData.rooms || []).forEach(r => {
    const k = (r.kode_ruangan || r.nama || '').toUpperCase().trim();
    existingRoomsMap.set(k, r);
  });

  const bookingMap = new Map();
  (dbData.bookings || []).forEach(b => {
    bookingMap.set(b.ruangan_id, b);
  });

  const activeTrainingsToday = updatedTrainings.filter(t => {
    return t.mulai <= dbData.today_wita && dbData.today_wita <= (t.selesai || t.mulai);
  });

  const updatedRooms = (dbData.rooms || []).map(r => {
    const rKey = (r.kode_ruangan || r.nama_ruangan || '').toUpperCase().trim();
    const existing = existingRoomsMap.get(rKey) || {};

    // Jika ada override manual dari admin dashboard, hormati
    if (existing.override && existing.override !== 'auto') {
      const isAvail = existing.override === 'tersedia';
      return {
        ...existing,
        id: r.id,
        kode_ruangan: r.kode_ruangan,
        nama: r.nama_ruangan,
        lokasi: r.lokasi,
        kapasitas: r.kapasitas,
        status: existing.override,
        status_label: existing.override.toUpperCase(),
        is_available: isAvail
      };
    }

    // Cek booking ruangan di pusdiklat.db
    const booking = bookingMap.get(r.id);
    if (booking) {
      return {
        id: r.id,
        kode_ruangan: r.kode_ruangan,
        nama: r.nama_ruangan,
        lokasi: r.lokasi,
        kapasitas: r.kapasitas,
        status: 'terpakai',
        status_label: 'TERPAKAI',
        kegiatan: booking.agenda || booking.nama_peminjam || 'Kegiatan Kedinasan',
        jam: `${booking.jam_mulai || '08:00'}–${booking.jam_selesai || '17:00'} WITA`,
        pj: booking.nama_peminjam || '-',
        is_available: false,
        override: null
      };
    }

    // Cek kecocokan dengan training aktif hari ini
    const rNama = (r.nama_ruangan || '').toLowerCase().trim();
    const rKode = (r.kode_ruangan || '').toLowerCase().trim();
    const matchedTraining = activeTrainingsToday.find(t => {
      const tRuang = (t.ruang || '').toLowerCase().trim();
      if (!tRuang) return false;
      if (rKode === 'aula' && tRuang.includes('auditorium')) return false;
      if (rKode === 'kls-audit') {
        return tRuang.includes('auditorium') || tRuang.includes('kls-audit');
      }
      return (
        tRuang.includes(rNama) || rNama.includes(tRuang) ||
        (rKode && tRuang.includes(rKode))
      );
    });

    if (matchedTraining) {
      return {
        id: r.id,
        kode_ruangan: r.kode_ruangan,
        nama: r.nama_ruangan,
        lokasi: r.lokasi,
        kapasitas: r.kapasitas,
        status: 'terpakai',
        status_label: 'TERPAKAI',
        kegiatan: matchedTraining.nama,
        jam: matchedTraining.jam || '08.00–17.00 WITA',
        pj: matchedTraining.peserta || '-',
        is_available: false,
        override: null
      };
    }

    // Default: Ruangan Tersedia
    return {
      id: r.id,
      kode_ruangan: r.kode_ruangan,
      nama: r.nama_ruangan,
      lokasi: r.lokasi,
      kapasitas: r.kapasitas,
      status: 'tersedia',
      status_label: 'TERSEDIA',
      kegiatan: 'Tidak ada agenda kegiatan saat ini',
      jam: '-',
      pj: '-',
      is_available: true,
      override: null
    };
  });

  currentData.trainings = updatedTrainings;
  if (updatedRooms.length > 0) {
    currentData.rooms = updatedRooms;
  }
  writeTenantData('bali', currentData);

  return {
    ok: true,
    message: `Berhasil menyinkronkan ${updatedTrainings.length} diklat & ${updatedRooms.length} ruangan ke data/bali.json`,
    syncedCount: updatedTrainings.length,
    roomsCount: updatedRooms.length
  };
}
