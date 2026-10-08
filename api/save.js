export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    const data = req.body;
    if (!data || !data.trainings) {
      return res.status(400).json({ error: 'Format data tidak valid' });
    }

    const token = process.env.GH_TOKEN;
    if (!token) {
      return res.status(200).json({ ok: true, message: 'Data tersimpan secara lokal di browser.' });
    }

    const owner = 'maskhaibepekape';
    const repo = 'layar-diklat-bali';
    const path = 'data.json';

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

    const contentStr = JSON.stringify(data, null, 2);
    const contentB64 = Buffer.from(contentStr).toString('base64');

    const putPayload = {
      message: 'chore(cms): auto-sync data.json dari panel admin',
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
      return res.status(500).json({ error: 'Gagal update GitHub: ' + errText });
    }

    return res.status(200).json({ ok: true, message: 'Data berhasil disinkronkan ke seluruh TV Lobby!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
