#!/usr/bin/env python3
"""
sync_ruangan.py — Engine Sinkronisasi Jadwal Ruangan Kamar Diklat ke Layar Bali

Membaca status real-time 5 ruangan dari SQLite Kamar Diklat (pusdiklat.db),
memetakan agenda hari ini (WITA), dan menginjeksi ke data/bali.json & index.html.
Opsional melakukan auto-commit dan push ke GitHub repo untuk live Vercel deploy.
"""

import os
import sys
import json
import re
import sqlite3
import argparse
import subprocess
from pathlib import Path
from datetime import date, datetime

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path("/Users/muhammadkhairizkibudiman/Downloads/Aplikasi/diklatbali/pusdiklat.db")
BALI_JSON_PATH = BASE_DIR / "data" / "bali.json"
INDEX_HTML_PATH = BASE_DIR / "index.html"
BALI_INDEX_PATH = BASE_DIR / "bali" / "index.html"

KATEGORI_MAP = {
    "TM": "Diklat Tatap Muka",
    "TATAP_MUKA": "Diklat Tatap Muka",
    "PJJ": "PJJ Daring (Zoom)",
    "RAPAT_PWK": "Rapat Perwakilan BPKP",
    "PWK": "Rapat Perwakilan BPKP",
    "RAPAT_INTERNAL": "Rapat Internal Balai",
    "ISTIRAHAT": "Ruang Istirahat Tim",
    "BREAK": "Ruang Istirahat Tim",
    "SOSIALISASI": "Sosialisasi / FGD"
}

DEFAULT_ROOMS = [
    {"id": 1, "kode": "KLS-B", "nama": "Ruang Kelas B (Lantai 2)", "lokasi": "Lantai 2", "kapasitas": 36},
    {"id": 2, "kode": "KLS-A", "nama": "Ruang Kelas A (Lantai 2)", "lokasi": "Lantai 2", "kapasitas": 24},
    {"id": 3, "kode": "KLS-AUDIT", "nama": "Ruang Kelas Auditorium (Lantai 3)", "lokasi": "Lantai 3", "kapasitas": 60},
    {"id": 4, "kode": "AULA", "nama": "Aula (Lantai 1)", "lokasi": "Lantai 1", "kapasitas": 0},
    {"id": 5, "kode": "KLS-BLKG", "nama": "Ruang Kelas Belakang", "lokasi": "Sayap Belakang", "kapasitas": 4},
    {"id": 6, "kode": "WI", "nama": "Ruang Widyaiswara (WI)", "lokasi": "Lantai 2 (Depan Kelas)", "kapasitas": 3}
]

def get_rooms_status(target_date: str) -> list:
    if not DB_PATH.exists():
        print(f"[WARN] Database tidak ditemukan di {DB_PATH}. Menggunakan fallback default.")
        return [{
            "id": r["id"],
            "kode_ruangan": r["kode"],
            "nama": r["nama"],
            "lokasi": r["lokasi"],
            "kapasitas": r["kapasitas"],
            "status": "tersedia",
            "status_label": "TERSEDIA",
            "kegiatan": "Tidak ada agenda kegiatan saat ini",
            "jam": "-",
            "pj": "-",
            "is_available": True
        } for r in DEFAULT_ROOMS]

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, kode_ruangan, nama_ruangan, lokasi, kapasitas, kategori, fasilitas FROM master_ruangan WHERE status_aktif = 1 ORDER BY id ASC")
        rooms_db = [dict(r) for r in cur.fetchall()]

        if not rooms_db:
            rooms_db = [{
                "id": r["id"], "kode_ruangan": r["kode"], "nama_ruangan": r["nama"],
                "lokasi": r["lokasi"], "kapasitas": r["kapasitas"], "kategori": "KECIL", "fasilitas": ""
            } for r in DEFAULT_ROOMS]

        cur.execute("""
            SELECT id, ruangan_id, nama_peminjam, agenda, kategori_kegiatan, tanggal, jam_mulai, jam_selesai 
            FROM booking_ruangan 
            WHERE tanggal = ? AND status = 'CONFIRMED'
            ORDER BY jam_mulai ASC
        """, (target_date,))
        bookings = [dict(b) for b in cur.fetchall()]

        booking_map = {}
        for b in bookings:
            booking_map.setdefault(b["ruangan_id"], []).append(b)

        result = []
        for r in rooms_db:
            r_b = booking_map.get(r["id"], [])
            if not r_b:
                result.append({
                    "id": r["id"],
                    "kode_ruangan": r.get("kode_ruangan", ""),
                    "nama": r.get("nama_ruangan", ""),
                    "lokasi": r.get("lokasi", ""),
                    "kapasitas": r.get("kapasitas", 4),
                    "status": "tersedia",
                    "status_label": "TERSEDIA",
                    "kegiatan": "Tidak ada agenda kegiatan saat ini",
                    "jam": "-",
                    "pj": "-",
                    "is_available": True
                })
            else:
                first = r_b[0]
                kat = first.get("kategori_kegiatan", "PJJ").upper()
                kat_label = KATEGORI_MAP.get(kat, "Kegiatan Kedinasan")
                jam_str = f"{first.get('jam_mulai', '08:00')}–{first.get('jam_selesai', '17:00')} WITA"
                
                result.append({
                    "id": r["id"],
                    "kode_ruangan": r.get("kode_ruangan", ""),
                    "nama": r.get("nama_ruangan", ""),
                    "lokasi": r.get("lokasi", ""),
                    "kapasitas": r.get("kapasitas", 4),
                    "status": "terpakai",
                    "status_label": kat_label.upper(),
                    "kategori_label": kat_label,
                    "kegiatan": first.get("agenda", "Kegiatan Kedinasan"),
                    "jam": jam_str,
                    "pj": first.get("nama_peminjam", "Personel Balai"),
                    "is_available": False
                })

        return result
    finally:
        conn.close()

def update_bali_json(rooms_data: list):
    if not BALI_JSON_PATH.exists():
        print(f"[ERR] File {BALI_JSON_PATH} tidak ditemukan.")
        return False

    with open(BALI_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    data["rooms"] = rooms_data

    with open(BALI_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✓ Berhasil memperbarui {BALI_JSON_PATH} dengan {len(rooms_data)} ruangan.")
    return True

def update_html_script_data(rooms_data: list, file_path: Path):
    if not file_path.exists():
        return False

    content = file_path.read_text(encoding="utf-8")
    m = re.search(r'<script id="data" type="application/json">([\s\S]*?)</script>', content)
    if not m:
        return False

    try:
        data = json.loads(m.group(1))
        data["rooms"] = rooms_data
        new_json_str = json.dumps(data, ensure_ascii=False, indent=2)
        new_content = content[:m.start(1)] + "\n" + new_json_str + "\n" + content[m.end(1):]
        file_path.write_text(new_content, encoding="utf-8")
        print(f"✓ Berhasil memperbarui blok data di {file_path.name}.")
        return True
    except Exception as e:
        print(f"[WARN] Gagal update script data di {file_path.name}: {e}")
        return False

def git_commit_and_push(target_date: str):
    try:
        print("🚀 Memulai Git Commit & Push ke GitHub...")
        subprocess.run(["git", "add", "data/bali.json", "index.html", "bali/index.html"], cwd=str(BASE_DIR), check=True)
        commit_msg = f"sync(bali): perbarui status 5 ruangan untuk tanggal {target_date}"
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(BASE_DIR), check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=str(BASE_DIR), check=True)
        print("✅ Sukses push ke GitHub! Vercel otomatis me-redeploy layar lobi.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERR] Gagal menjalankan git: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Sinkronisasi Status Ruangan ke Layar Bali Signage")
    parser.add_argument("--date", type=str, default=str(date.today()), help="Tanggal target (YYYY-MM-DD), default hari ini")
    parser.add_argument("--push", action="store_true", help="Otomatis git commit & push ke GitHub untuk live deploy")
    parser.add_argument("--dry-run", action="store_true", help="Hanya cetak JSON hasil kalkulasi tanpa menulis ke file")

    args = parser.parse_args()
    print(f"📋 Memeriksa status 5 ruangan untuk tanggal: {args.date}")
    
    rooms = get_rooms_status(args.date)

    if args.dry_run:
        print("\n--- [DRY RUN] OUTPUT HASIL RUANGAN ---")
        print(json.dumps(rooms, ensure_ascii=False, indent=2))
        return

    update_bali_json(rooms)
    update_html_script_data(rooms, INDEX_HTML_PATH)
    update_html_script_data(rooms, BALI_INDEX_PATH)

    if args.push:
        git_commit_and_push(args.date)

if __name__ == "__main__":
    main()
