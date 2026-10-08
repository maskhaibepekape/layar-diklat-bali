# Layar Diklat – Pusdiklatwas BPKP Wilayah II Bali

Tampilan layar (signage) vertikal 1080×1920 yang berputar otomatis. File utamanya `index.html`.

## Aturan utama untuk agen

- **Hanya ubah data di blok `<script id="data" type="application/json">`** di `index.html`, yang diapit komentar `EDIT DATA LAYAR DI SINI` dan `AKHIR DATA`.
- Jangan mengubah CSS, HTML, atau JavaScript lain kecuali pengguna memintanya secara eksplisit.
- Isi blok itu harus **JSON valid**: tanda kutip ganda, tanpa koma di elemen terakhir, tanpa komentar.
- Setelah mengedit, validasi JSON-nya (misalnya `python3 -c "import json,re;s=open('index.html').read();json.loads(re.search(r'<script id=\"data\" type=\"application/json\">(.*?)</script>',s,re.S).group(1));print('OK')"`).

## Struktur data

| Kolom | Isi |
|---|---|
| `alamat` | Alamat lengkap, tampil di kartu sambutan dan footer |
| `wifiNama`, `wifiSandi` | Nama dan sandi Wi-Fi |
| `ig`, `yt`, `xx`, `fb` | Akun Instagram, YouTube, X, Facebook. Kosongkan (`""`) untuk menyembunyikan ikonnya |
| `logo` | Nama file logo di folder yang sama, misalnya `"logo-bpkp.png"` |
| `foto` | Nama file foto gedung di folder yang sama, misalnya `"foto-gedung.jpg"`. Kosong = panel cokelat bergaris |
| `notes` | Catatan untuk peserta: daftar `{"judul": "...", "isi": "..."}` |
| `trainings` | Daftar diklat (lihat di bawah) |

Setiap item `trainings`:

| Kolom | Isi |
|---|---|
| `nama` | Nama diklat (wajib) |
| `mulai`, `selesai` | Tanggal format `YYYY-MM-DD` (wajib) |
| `ket` | Keterangan, misalnya `"Tatap Muka"` |
| `sambutan` | Pesan sambutan opsional di layar sambutan |
| `ruang`, `jam`, `peserta` | Info peserta opsional, misalnya `"Kelas Bali 2"`, `"07.30–16.00 WITA"`, `"32 orang"` |

## Cara kerja tampilan

- Status diklat dihitung otomatis dari tanggal komputer: sedang berlangsung, akan datang, atau selesai (disembunyikan). Diklat lama tidak perlu dihapus, tetapi boleh dihapus agar data tetap ringkas.
- Urutan layar: sambutan per diklat yang sedang berlangsung → informasi peserta (hanya bila `ruang`/`jam`/`peserta` atau `notes` diisi) → jadwal diklat mendatang (5 per halaman). Bila tidak ada diklat berjalan, tampil sambutan umum Learning Center.
- Tombol panah kanan di keyboard melompat ke layar berikutnya (untuk mengecek tampilan).

## Setelah setiap perubahan data

1. Validasi JSON di blok data (lihat perintah di atas).
2. Buat ulang file `layar-diklat-magicinfo.zip` di folder ini, berisi `index.html`, `logo-bpkp.png`, `foto-gedung.png`, dan `bgm.mp3` bila ada, **langsung di akar zip** (bukan di dalam subfolder). Timpa zip lama.
   - Windows (PowerShell): `Compress-Archive -Path index.html,logo-bpkp.png,foto-gedung.png,bgm.mp3,AGENTS.md -DestinationPath layar-diklat-magicinfo.zip -Force`
   - macOS/Linux: `rm -f layar-diklat-magicinfo.zip && zip layar-diklat-magicinfo.zip index.html logo-bpkp.png foto-gedung.png bgm.mp3 AGENTS.md`
3. Laporkan singkat apa yang diubah, dalam bahasa Indonesia.
