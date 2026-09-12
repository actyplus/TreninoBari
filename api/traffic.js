const crypto = require('node:crypto');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = (key, value) => crypto.createHmac('sha256', key).update(value).digest('hex');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) {
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'Metodo non consentito.'});
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return res.status(503).json({code:'NOT_CONFIGURED'});
  try {
    let action = 'read', visitor = null, page = null, account = null, bucket = null;
    if (req.method === 'POST') {
      // Same-origin only. No arbitrary client identity or counters are trusted.
      const origin = req.headers.origin;
      const allowed = origin === 'https://treninobari.vercel.app' ||
        (process.env.VERCEL_ENV !== 'production' && origin === 'https://' + process.env.VERCEL_URL);
      if (!allowed || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({code:'ORIGIN_REJECTED'});
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({code:'JSON_REQUIRED'});
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (raw.length > 512) return res.status(413).json({code:'TOO_LARGE'});
      const body = JSON.parse(raw);
      if (!['beat','leave'].includes(body.action) || !uuid.test(body.visitor || '') || !uuid.test(body.page || '')) return res.status(400).json({code:'INVALID_REQUEST'});
      if (body.consent !== true) return res.status(400).json({code:'CONSENT_REQUIRED'});
      if (/bot|crawler|spider|headless/i.test(req.headers['user-agent'] || '')) return res.status(204).end();
      const address = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'];
      if (!address) return res.status(503).json({code:'ADDRESS_UNAVAILABLE'});
      bucket = digest(key, 'rate:' + new Date().toISOString().slice(0,10) + ':' + address);
      visitor = digest(key, 'visitor:' + body.visitor);
      page = digest(key, 'page:' + body.page);
      action = body.action;
      const token = (req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
      if (token && action === 'beat') {
        const result = await fetch(url + '/auth/v1/user', {headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});
        if (!result.ok) return res.status(result.status === 401 || result.status === 403 ? 401 : 502).json({code:'AUTH_UNAVAILABLE'});
        const user = await result.json();
        if (!user.id || user.is_anonymous) return res.status(401).json({code:'INVALID_SESSION'});
        account = digest(key, 'account:' + user.id);
      }
    }
    const upstream = await fetch(url + '/rest/v1/rpc/tb_traffic_action', {
      method:'POST', headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({p_action:action,p_visitor:visitor,p_page:page,p_account:account,p_bucket:bucket}),
      signal:AbortSignal.timeout(10000)
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      const code = ['PGRST202','42P01'].includes(result.code) ? 'MIGRATION_REQUIRED' : result.message === 'rate_limit' ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE';
      console.warn(JSON.stringify({event:'tb_traffic_failure',code}));
      if (code === 'RATE_LIMITED') res.setHeader('Retry-After','60');
      return res.status(code === 'RATE_LIMITED' ? 429 : 503).json({code});
    }
    if (req.method === 'GET') res.setHeader('Cache-Control','public, max-age=0, s-maxage=30');
    return res.status(200).json(result);
  } catch (error) {
    console.warn(JSON.stringify({event:'tb_traffic_failure',code:error instanceof SyntaxError?'INVALID_JSON':'UPSTREAM_FAILED'}));
    return res.status(error instanceof SyntaxError ? 400 : 502).json({code:'SERVICE_UNAVAILABLE'});
  }
};
