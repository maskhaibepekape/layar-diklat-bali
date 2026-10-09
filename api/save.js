export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Whitelist Tenant & Validasi Kunci Akses Per Wilayah
  // MASTER_KEY (Super Admin): Bebas mengedit & menyimpan ke 4 wilayah sekaligus
  const MASTER_KEY = process.env.ADMIN_KEY || 'layarsapi2026';
  const KEYS = {
    bali: process.env.KEY_BALI || 'layarbali2026',
    medan: process.env.KEY_MEDAN || 'layarmedan2026',
    makassar: process.env.KEY_MAKASSAR || 'layarmakassar2026',
    ciawi: process.env.KEY_CIAWI || 'layarciawi2026'
  };

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Format data tidak valid' });
  }

  const tenant = String(req.query.lokasi || payload.tenant || payload.lokasi || 'bali').toLowerCase().trim();
  if (!Object.prototype.hasOwnProperty.call(KEYS, tenant)) {
    return res.status(400).json({ error: `Wilayah '${tenant}' tidak terdaftar dalam whitelist.` });
  }

  const expectedRegionalKey = KEYS[tenant];
  const incomingKey = String(req.headers['x-admin-key'] || req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();

  // Otorisasi: Lolos jika cocok dengan Master Key ATAU Kunci Khusus Wilayah Target
  const isAuthorized = incomingKey && (incomingKey === MASTER_KEY || incomingKey === expectedRegionalKey);
  if (!isAuthorized) {
    return res.status(401).json({ error: `Akses ditolak: Kata sandi admin tidak sah untuk wilayah ${tenant.toUpperCase()}.` });
  }

  // 2. Proteksi Batas Ukuran Payload (Maksimal 200 KB)
  const rawBodyStr = JSON.stringify(payload);
  if (rawBodyStr.length > 200000) {
    return res.status(413).json({ error: 'Ukuran data melebihi batas maksimal 200 KB.' });
  }

  // 3. Validasi Integritas Struktur Data (Wajib memiliki array trainings)
  const dataToSave = payload.data || payload;
  if (!dataToSave || typeof dataToSave !== 'object' || !Array.isArray(dataToSave.trainings)) {
    return res.status(400).json({ error: 'Struktur data tidak valid: field "trainings" berupa array wajib ada.' });
  }

  try {
    const token = process.env.GH_TOKEN;
    if (!token) {
      return res.status(200).json({ ok: true, message: 'Data tersimpan lokal di browser (GH_TOKEN belum dipasang di Vercel).' });
    }

    const owner = process.env.GH_OWNER || 'maskhaibepekape';
    const repo = process.env.GH_REPO || 'layar-diklat-bali';
    const targetFile = `data/${tenant}.json`;

    // 4. Helper Simpan GitHub dengan Auto-Retry 1x jika 409 Conflict
    async function updateGitHubFileWithRetry(path, dataObj, attempt = 1) {
      let sha = null;
      try {
        const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'LayarDiklat-Sync'
          }
        });
        if (getResp.ok) {
          const fileInfo = await getResp.json();
          sha = fileInfo.sha;
        }
      } catch (err) {}

      const contentStr = JSON.stringify(dataObj, null, 2);
      const contentB64 = Buffer.from(contentStr).toString('base64');

      const putPayload = {
        message: `chore(cms): update ${path} dari panel admin (${tenant})`,
        content: contentB64
      };
      if (sha) putPayload.sha = sha;

      const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'LayarDiklat-Sync',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putPayload)
      });

      if (putResp.status === 409 && attempt < 2) {
        // Auto-retry 1x on 409 SHA conflict
        await new Promise(resolve => setTimeout(resolve, 800));
        return updateGitHubFileWithRetry(path, dataObj, attempt + 1);
      }

      if (!putResp.ok) {
        const errText = await putResp.text();
        throw new Error(`Gagal simpan ${path}: HTTP ${putResp.status} ${errText}`);
      }
    }

    await updateGitHubFileWithRetry(targetFile, dataToSave);

    return res.status(200).json({ ok: true, message: `Data ${tenant.toUpperCase()} berhasil disinkronkan ke cloud & TV Lobby!` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
