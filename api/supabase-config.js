module.exports = function handler(request, response) {
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return response.status(503).json({ configured: false });
  }

  return response.status(200).json({ configured: true, url, key });
};
