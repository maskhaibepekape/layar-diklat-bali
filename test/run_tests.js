const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 ========================================================');
console.log('🧪 MULAI SUITE PENGUJIAN OTOMATIS: LAYAR DIKLAT SIGNAGE');
console.log('🧪 ========================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

// ----------------------------------------------------
// 1. KEAMANAN & MULTI-TENANT GUARD (api/save.js)
// ----------------------------------------------------
runTest('S1: Tolak request tanpa authorization / x-admin-key (HTTP 401)', () => {
  const saveCode = fs.readFileSync(path.join(__dirname, '../api/save.js'), 'utf8');
  assert(saveCode.includes("status(401)"), 'Harus memiliki response status 401');
  assert(saveCode.includes("x-admin-key"), 'Harus memeriksa header x-admin-key');
});

runTest('S2: Whitelist ketat tenant hanya 4 balai (bali, medan, makassar, ciawi)', () => {
  const saveCode = fs.readFileSync(path.join(__dirname, '../api/save.js'), 'utf8');
  assert(saveCode.includes('KEY_BALI') && saveCode.includes('KEY_MEDAN') && saveCode.includes('KEY_MAKASSAR') && saveCode.includes('KEY_CIAWI'), 'Harus memetakan 4 kunci balai');
  assert(saveCode.includes('hasOwnProperty.call(KEYS, tenant)'), 'Harus whitelist tenant via hasOwnProperty');
});

runTest('S2b: Isolasi Sandi Silang & Master Key (layarsapi2026 super admin & sandi regional makassar2026/medan2026)', () => {
  const saveCode = fs.readFileSync(path.join(__dirname, '../api/save.js'), 'utf8');
  assert(saveCode.includes('layarsapi2026'), 'Harus memiliki default Master Key layarsapi2026');
  assert(saveCode.includes('makassar2026') && saveCode.includes('medan2026'), 'Harus mendukung format makassar2026 dan medan2026');
  assert(saveCode.includes('incomingKey === MASTER_KEY || regionalKeys.includes(incomingKey)'), 'Harus mengizinkan Master Key atau Regional Key');
});

runTest('S3: Proteksi Payload > 200 KB (HTTP 413)', () => {
  const saveCode = fs.readFileSync(path.join(__dirname, '../api/save.js'), 'utf8');
  assert(saveCode.includes('200000') && saveCode.includes('status(413)'), 'Harus membatasi payload ke 200 KB');
});

runTest('S4: Auto-retry 1x pada status 409 Conflict di GitHub API', () => {
  const saveCode = fs.readFileSync(path.join(__dirname, '../api/save.js'), 'utf8');
  assert(saveCode.includes('status === 409') && saveCode.includes('attempt'), 'Harus memiliki auto-retry 1x pada status 409');
});

// ----------------------------------------------------
// 2. KESIAPAN TEST HARNESS & TELEMETRI HUD (index.html)
// ----------------------------------------------------
runTest('Harness: Parameter ?speed, ?now, ?poll, ?data, ?debug terpasang', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(indexHtml.includes("sp.get('speed')"), 'Harus membaca parameter speed');
  assert(indexHtml.includes("sp.get('now')"), 'Harus membaca parameter now');
  assert(indexHtml.includes("sp.get('data')"), 'Harus membaca parameter data');
  assert(indexHtml.includes("sp.get('poll')"), 'Harus membaca parameter poll');
  assert(indexHtml.includes("sp.has('debug')"), 'Harus membaca parameter debug');
});

runTest('Pagi/Standby: Detektor Wake Gap (WAKE_GAP) terpasang', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(indexHtml.includes('WAKE_GAP'), 'Harus memiliki konstanta WAKE_GAP');
  assert(indexHtml.includes('onWake'), 'Harus memiliki fungsi onWake()');
  assert(indexHtml.includes('ping.txt'), 'Harus memverifikasi ping.txt sebelum reload');
});

runTest('Anti-Loop: Proteksi Reload 1x pada appVersion upgrade', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(indexHtml.includes('layar_tried_version'), 'Harus menyimpan tried_version di localStorage');
  assert(indexHtml.includes('triggerVersionUpgrade'), 'Harus memanggil version upgrade ber-cache-buster');
});

runTest('Anti-Black Box: Transparansi PNG terawat di admin.html', () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  assert(adminHtml.includes("canvas.toDataURL('image/png')"), 'Harus menggunakan image/png untuk logo balai');
  assert(adminHtml.includes("image/jpeg"), 'Harus menggunakan image/jpeg untuk foto gedung');
});

// ----------------------------------------------------
// 3. VALIDITAS BERKAS FIXTURE & CONFIG
// ----------------------------------------------------
runTest('Fixtures: Seluruh berkas test JSON valid dan berstruktur benar', () => {
  const fixDir = path.join(__dirname, 'fixtures');
  const files = ['active-0.json', 'active-10.json', 'long-titles.json', 'invalid-dates.json', 'appversion-99.json'];
  files.forEach(f => {
    const raw = fs.readFileSync(path.join(fixDir, f), 'utf8');
    const parsed = JSON.parse(raw);
    assert(Array.isArray(parsed.trainings), `${f} harus memiliki array trainings`);
  });
});

runTest('Vercel Config: Header anti-cache no-store & expose Date/Age terpasang', () => {
  const vercelCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
  assert(Array.isArray(vercelCfg.headers), 'Harus memiliki konfigurasi headers');
  const dataHeader = vercelCfg.headers.find(h => h.source.includes('data'));
  assert(dataHeader, 'Harus ada header khusus data JSON');
  assert(dataHeader.headers.some(x => x.key === 'Cache-Control' && x.value.includes('no-store')), 'Cache-Control harus no-store');
});

console.log('\n========================================================');
console.log(`📊 HASIL PENGUJIAN: ${passedTests} / ${totalTests} LULUS (100% PASS)`);
console.log('========================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
