export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verifikasi Kata Sandi Admin
  const ADMIN_PASS = 'layarbali2026';
  const incomingKey = req.headers['x-admin-key'] || req.headers['authorization'];
  if (incomingKey !== ADMIN_PASS && incomingKey !== `Bearer ${ADMIN_PASS}`) {
    return res.status(401).json({ error: 'Akses ditolak: Kata sandi admin tidak sah.' });
  }

  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Format data tidak valid' });
    }

    const token = process.env.GH_TOKEN;
    if (!token) {
      return res.status(200).json({ ok: true, message: 'Data tersimpan lokal di browser (GH_TOKEN belum dipasang di Vercel).' });
    }

    const owner = 'maskhaibepekape';
    const repo = 'layar-diklat-bali';

    // Tentukan lokasi file yang di-update
    const lokasi = (req.query.lokasi || payload.lokasi || 'bali').toLowerCase();
    const targetFile = ['bali', 'medan', 'makassar', 'ciawi'].includes(lokasi) ? `data/${lokasi}.json` : 'data.json';
    const dataToSave = payload.data || payload;

    // Helper update 1 file di GitHub
    async function updateGitHubFile(path, dataObj) {
      let sha = null;
      try {
        const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
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
        message: `chore(cms): update ${path} dari panel admin (${lokasi})`,
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

      if (!putResp.ok) {
        const errText = await putResp.text();
        throw new Error(`Gagal simpan ${path}: ${errText}`);
      }
    }

    await updateGitHubFile(targetFile, dataToSave);

    return res.status(200).json({ ok: true, message: `Data ${lokasi.toUpperCase()} berhasil disinkronkan ke cloud & TV Lobby!` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
