const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('../data/fixtures.json');
const angles = ['left-high','center-high','right-high','left-low','center-low','right-low'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,32);
let catalog;
function newsKeys() {
  if (catalog) return catalog;
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  catalog = new Set();
  for (const article of html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)) {
    const source = article[0].match(/class="source-line"[\s\S]*?href="([^"]+)"/);
    if (source) catalog.add('n-' + hash(source[1].replace(/&amp;/g,'&')));
    const video = article[0].match(/data-video-id="([\w-]{11})"/);
    if (video) catalog.add('v-' + video[1]);
  }
  return catalog;
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); return res.status(405).json({error:'Metodo non consentito.'}); }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return res.status(503).json({error:'Interazioni online in attivazione.',code:'NOT_CONFIGURED'});
  try {
    let user = null;
    const token = (req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
    if (token) {
      const auth = await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});
      if (!auth.ok) return res.status(401).json({error:'Accedi nuovamente al tuo account.'});
      user = await auth.json();
      if (!user.id) return res.status(401).json({error:'Sessione non valida.'});
    }
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : {};
    if (JSON.stringify(body).length > 5000) return res.status(413).json({error:'Richiesta troppo grande.'});
    const action = req.method === 'GET' ? 'state' : body?.action;
    if (!['state','reaction','view','prediction','comment','penalty','settings','referral'].includes(action)) return res.status(400).json({error:'Azione non valida.'});
    if (!['state','view'].includes(action) && !user) return res.status(401).json({error:'Accedi per partecipare.'});
    const data = {};
    const validKeys = newsKeys();
    if (['reaction','view'].includes(action)) {
      if (!validKeys.has(body.article)) return res.status(400).json({error:'Notizia non disponibile.'});
      data.article = body.article;
    }
    if (action === 'reaction') {
      if (![0,1,-1].includes(body.value)) return res.status(400).json({error:'Reazione non valida.'});
      data.value = body.value;
    }
    if (action === 'view') {
      // Daily pseudonymous deduplication; raw IP addresses are never persisted.
      const day = new Date().toISOString().slice(0,10);
      const address = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      data.viewer = crypto.createHmac('sha256',key).update(day+':'+(user?.id || address)).digest('hex');
    }
    const fixture = fixtures.fixtures.find(f=>new Date(f.kickoff).getTime()>Date.now());
    if (['prediction','comment'].includes(action)) {
      if (!fixture || body.fixture !== fixture.id) return res.status(409).json({error:'Pronostico chiuso o calendario da aggiornare.'});
      data.fixture = fixture.id; data.kickoff = fixture.kickoff;
      if (action === 'prediction') {
        if (![body.home,body.away].every(x=>Number.isInteger(x)&&x>=0&&x<=20)) return res.status(400).json({error:'Punteggio non valido.'});
        data.home=body.home; data.away=body.away;
      } else {
        data.comment = String(body.comment || '').trim();
        if (data.comment.length<12 || data.comment.length>400) return res.status(400).json({error:'Scrivi un commento tra 12 e 400 caratteri.'});
      }
    }
    if (action === 'penalty') {
      if (!angles.includes(body.choice) || !['shoot','save'].includes(body.mode) || !/^[a-f0-9-]{36}$/.test(body.requestId||'')) return res.status(400).json({error:'Giocata non valida.'});
      data.choice=body.choice; data.mode=body.mode; data.request_id=body.requestId;
      data.opponent=angles[crypto.randomInt(angles.length)];
    }
    if (action === 'settings') {
      data.topics = Array.isArray(body.topics) ? body.topics.filter(x=>['squadra','mercato','tifosi','societa','partite','video'].includes(x)) : [];
      data.leaderboard = body.leaderboard === true;
    }
    if (action === 'referral') {
      if (!user.email_confirmed_at || Date.now()-Date.parse(user.created_at)>7*86400000) return res.status(400).json({error:'Invito riservato alle nuove registrazioni verificate.'});
      if (!/^[a-f0-9]{24}$/.test(body.code||'')) return res.status(400).json({error:'Invito non valido.'});
      data.code=body.code;
    }
    data.keys = [...validKeys];
    data.current_fixture = fixture?.id || null;
    const upstream = await fetch(url+'/rest/v1/rpc/tb_member_action',{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({p_user:user?.id || null,p_action:action,p_data:data}),signal:AbortSignal.timeout(12000)
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      if (result.code==='PGRST202' || result.code==='42P01') return res.status(503).json({error:'Interazioni online in attivazione.',code:'MIGRATION_REQUIRED'});
      return res.status(409).json({error:result.code==='P0001' ? result.message : 'Operazione non completata. Riprova.'});
    }
    return res.status(200).json({...result,fixture:fixture||null});
  } catch (error) {
    return res.status(error instanceof SyntaxError?400:502).json({error:'Servizio temporaneamente non disponibile. Nessuna azione confermata.'});
  }
};
module.exports.newsKeys = newsKeys;
