export const MASTER_KEY = process.env.ADMIN_KEY || 'layarsapi2026';

export const REGIONAL_KEYS = {
  bali: [process.env.KEY_BALI, 'bali2026', 'layarbali2026'].filter(Boolean),
  medan: [process.env.KEY_MEDAN, 'medan2026', 'layarmedan2026'].filter(Boolean),
  makassar: [process.env.KEY_MAKASSAR, 'makassar2026', 'layarmakassar2026'].filter(Boolean),
  ciawi: [process.env.KEY_CIAWI, 'ciawi2026', 'layarciawi2026'].filter(Boolean)
};

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
  const tenant = String(req.query.lokasi || req.body?.tenant || req.body?.lokasi || 'bali').toLowerCase().trim();
  const key = extractAuthKey(req);

  if (!isAuthorizedForTenant(tenant, key)) {
    return res.status(401).json({
      error: `Akses ditolak: Kata sandi admin tidak sah untuk wilayah ${tenant.toUpperCase()}.`
    });
  }

  req.authTenant = tenant;
  req.isMaster = (key === MASTER_KEY);
  next();
}
