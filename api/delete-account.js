module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metodo non consentito.' });
  }
  if (request.body?.confirmation !== 'CANCELLA') {
    return response.status(400).json({ error: 'Conferma non valida.' });
  }

  const authHeader = request.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) return response.status(401).json({ error: 'Sessione mancante.' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !publishableKey || !serviceKey) {
    return response.status(503).json({ error: 'Servizio account non configurato.' });
  }

  const userResponse = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken }
  });
  if (!userResponse.ok) return response.status(401).json({ error: 'Sessione non valida o scaduta.' });
  const user = await userResponse.json();
  if (!user?.id) return response.status(401).json({ error: 'Utente non riconosciuto.' });

  const deleteResponse = await fetch(supabaseUrl + '/auth/v1/admin/users/' + encodeURIComponent(user.id), {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
  });
  if (!deleteResponse.ok) {
    return response.status(502).json({ error: 'Cancellazione non completata. Riprova o invia una richiesta privacy.' });
  }
  return response.status(200).json({ deleted: true });
};
