// Only explicitly public Supabase keys may cross this browser boundary.
// JWT decoding checks the configured key type; it does not authenticate users.
function isPublicKey(key) {
  if (typeof key !== 'string' || key.startsWith('sb_secret_')) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split('.');
    return parts.length === 3 &&
      JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}

module.exports = function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: 'Metodo non consentito.' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch { /* Fail closed on a malformed deployment configuration. */ }
  if (!validUrl || !isPublicKey(key) ||
      key === process.env.SUPABASE_SERVICE_ROLE_KEY || key === process.env.SUPABASE_SECRET_KEY) {
    return response.status(503).json({ configured: false });
  }

  return response.status(200).json({ configured: true, url, key });
};
