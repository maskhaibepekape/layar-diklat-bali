export const MASTER_KEY = process.env.ADMIN_KEY || 'layarsapi2026';

export const REGIONAL_KEYS = {
  bali: [process.env.KEY_BALI, 'bali2026', 'layarbali2026'].filter(Boolean),
  medan: [process.env.KEY_MEDAN, 'medan2026', 'layarmedan2026'].filter(Boolean),
  makassar: [process.env.KEY_MAKASSAR, 'makassar2026', 'layarmakassar2026'].filter(Boolean),
  ciawi: [process.env.KEY_CIAWI, 'ciawi2026', 'layarciawi2026'].filter(Boolean)
};

const _FAILED_AUTH = new Map();
const _AUTH_WINDOW_MS = 60000;
const _MAX_FAILED_AUTH = 5;

export function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return String(cfIp).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function checkAuthRateLimit(ip) {
  const now = Date.now();
  const attempts = (_FAILED_AUTH.get(ip) || []).filter(t => now - t < _AUTH_WINDOW_MS);
  _FAILED_AUTH.set(ip, attempts);
  if (attempts.length >= _MAX_FAILED_AUTH) {
    const sisa = Math.ceil((_AUTH_WINDOW_MS - (now - attempts[0])) / 1000);
    return Math.max(sisa, 1);
  }
  return 0;
}

export function recordFailedAuth(ip) {
  const now = Date.now();
  const attempts = (_FAILED_AUTH.get(ip) || []).filter(t => now - t < _AUTH_WINDOW_MS);
  attempts.push(now);
  _FAILED_AUTH.set(ip, attempts);
}

export function clearFailedAuth(ip) {
  _FAILED_AUTH.delete(ip);
}

export function extractAuthKey(req) {
  const headerKey = req.headers['x-admin-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }

  if (req.query && req.query.key) {
    return String(req.query.key).trim();
  }

  return '';
}

export function isAuthorizedForTenant(tenant, key) {
  if (!key) return false;
  if (key === MASTER_KEY) return true;

  const t = String(tenant || '').toLowerCase().trim();
  const allowedKeys = REGIONAL_KEYS[t] || [];
  return allowedKeys.includes(key);
}

export function requireTenantAuth(req, res, next) {
  const ip = getClientIp(req);
  const sisaDetik = checkAuthRateLimit(ip);
  if (sisaDetik > 0) {
    return res.status(429).json({
      error: `Terlalu banyak percobaan autentikasi tidak sah. Akses dibatasi sementara selama ${sisaDetik} detik.`
    });
  }

  const tenant = String(req.query.lokasi || req.body?.tenant || req.body?.lokasi || 'bali').toLowerCase().trim();
  const key = extractAuthKey(req);

  if (!isAuthorizedForTenant(tenant, key)) {
    recordFailedAuth(ip);
    return res.status(401).json({
      error: `Akses ditolak: Kata sandi admin tidak sah untuk wilayah ${tenant.toUpperCase()}.`
    });
  }

  clearFailedAuth(ip);
  req.authTenant = tenant;
  req.isMaster = (key === MASTER_KEY);
  next();
}
