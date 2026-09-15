'use strict';
// Match identity comes from the editorial calendar, never from the last game visited.
const calendar = require('../data/fixtures.json');
const ORIGIN = 'https://www.corrieredellosport.it';
const CALENDAR_URL = ORIGIN + '/squadra/calcio/bari/calendario/t122';
const HOUR = 3600000;
let cache = null, pending = null;
const pathsCache = new Map();
const clean = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const normal = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(ssc|calcio|fc)\b/g, '').replace(/[^a-z0-9]/g, '');
function selectFixture(now = Date.now()) {
  const list = (calendar.fixtures || []).filter(f => Number.isFinite(Date.parse(f.kickoff))).sort((a,b) => Date.parse(a.kickoff)-Date.parse(b.kickoff));
  return list.find(f => now >= Date.parse(f.kickoff)-48*HOUR && now <= Date.parse(f.kickoff)+18*HOUR) || null;
}
function matchesFixture(data, fixture) {
  return normal(data.home) === normal(fixture.home) && normal(data.away) === normal(fixture.away) &&
    Number.isFinite(Date.parse(data.matchDate)) && Math.abs(Date.parse(data.matchDate)-Date.parse(fixture.kickoff)) < 6*HOUR;
}
function findMatchPaths(html) {
  return [...new Set([...html.matchAll(/href=["'](?:https:\/\/www\.corrieredellosport\.it)?(\/live\/partita\/[^"'#?]+)["']/g)].map(m => clean(m[1])).filter(p => /(?:^|-)bari(?:-|$)/i.test(p.split('/').pop())))];
}
function periodLabel(period, minute) {
  const labels = {PreMatch:'Prepartita',FirstHalf:'1° tempo',HalfTime:'Intervallo',SecondHalf:'2° tempo',ExtraTimeFirstHalf:'Supplementari',ExtraTimeSecondHalf:'Supplementari',PenaltyShootout:'Rigori',FullTime:'Finale',Postponed:'Rinviata',Abandoned:'Interrotta',Suspended:'Sospesa'};
  return `${['FirstHalf','SecondHalf','ExtraTimeFirstHalf','ExtraTimeSecondHalf'].includes(period) && minute != null ? String(minute)+"' · " : ''}${labels[period] || 'Stato in verifica'}`;
}
// Concise factual event labels; do not mirror a publisher's complete live article.
function eventSummary(a) {
  const type = String(a.type || '').toLowerCase(), comment = clean(a.comment);
  const person = clean(a.playerName || a.player_name || a.player || '');
  const subject = person || (comment.match(/([^.!?]{1,65}\([^()]{1,35}\))/) || [])[1] || '';
  const labels = {'goal':'Gol','penalty goal':'Gol su rigore','own goal':'Autorete','yellow card':'Ammonizione','second yellow':'Seconda ammonizione','red card':'Espulsione','attempt saved':'Conclusione parata','attempt blocked':'Conclusione respinta','attempt missed':'Conclusione fuori','corner':'Calcio d’angolo','penalty':'Rigore','offside':'Fuorigioco','foul':'Fallo','substitution':'Cambio','kick off':'Inizio del tempo','half time':'Intervallo','full time':'Fischio finale','start delay':'Gioco interrotto','end delay':'Gioco ripreso'};
  if (!labels[type]) return null;
  if (type === 'substitution') {
    const names = comment.match(/([\p{L} .’'-]+) sostituisce ([\p{L} .’'-]+)/u);
    if (names) return `Cambio: entra ${names[1].trim().slice(-50)}, esce ${names[2].trim().slice(0,50)}.`;
  }
  return labels[type] + (subject ? ': '+subject : '') + '.';
}
function parseMatchData(payload, source) {
  const result = payload?.matchresults, f = result?.fixtures, l = result?.live, info = l?.MatchInfo;
  if (!f || !l || !info) return null;
  const periods = new Set(['FirstHalf','HalfTime','SecondHalf','ExtraTimeFirstHalf','ExtraTimeSecondHalf','PenaltyShootout']);
  const events = [], seen = new Set();
  for (const item of payload?.commentary?.commentary?.elements?.[0]?.elements || []) {
    const a = item?.attributes || {}, text = eventSummary(a);
    if (!text) continue;
    const minute = String(a.time || (a.minute != null ? a.minute+"'" : ''));
    const id = String(a.id || `${minute}-${text}`);
    if (seen.has(id)) continue;
    seen.add(id); events.push({id,minute,text,salient:true,type:String(a.type||'')});
  }
  const minuteOrder = e => {const parts=e.minute.match(/\d+/g)||[];return Number(parts[0]||0)+(parts[1]?Number(parts[1])/100:0);};
  events.sort((a,b) => minuteOrder(b)-minuteOrder(a));
  const hasScore = l.score_home != null && l.score_away != null && /^\d+$/.test(String(l.score_home)) && /^\d+$/.test(String(l.score_away));
  const active = periods.has(info.Period), finished = info.Period === 'FullTime';
  return {live:active,finished,phase:finished?'finished':active?'live':info.Period==='PreMatch'?'pre':'waiting',
    home:f.home_name,away:f.away_name,matchDate:f?.date?.dateUTC || '',competition:f.cName || 'Serie C',
    score:hasScore && (active || finished) ? `${l.score_home} - ${l.score_away}` : null,
    status:periodLabel(info.Period, info.MatchTime),events:events.slice(0,120),source,
    sourceName:'Corriere dello Sport · sintesi eventi',updatedAt:payload.lastUpdate || null,sourceUpdatedAt:payload.lastUpdate || null};
}
function isRecentFinal(data, now=Date.now()) {
  const when = Date.parse(data?.matchDate || '');
  return Boolean(data?.finished) && Number.isFinite(when) && now >= when && now-when <= 18*HOUR;
}
async function request(url, json=false) {
  const response = await fetch(url,{headers:{'user-agent':'TreninoBari/2.0 (+https://treninobari.vercel.app)','accept':json?'application/json':'text/html'},signal:AbortSignal.timeout(6500)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
async function fromPath(path, fixture) {
  if (!/^\/live\/partita\/[a-z0-9-]+-\d+$/.test(path || '')) return null;
  const id = path.match(/-(\d+)$/)[1];
  const data = parseMatchData(await request(`${ORIGIN}/api-live/matchresults/${id}`,true),ORIGIN+path);
  return data && matchesFixture(data,fixture) ? {...data,fixtureId:fixture.id,kickoff:fixture.kickoff} : null;
}
async function resolve(fixture) {
  const explicit = pathsCache.get(fixture.id)?.path || fixture.livePath;
  if (explicit) { try {const data=await fromPath(explicit,fixture);if(data)return data;} catch (_) {} }
  let discovered = pathsCache.get(fixture.id);
  if (!discovered || Date.now()-discovered.at > 5*60000) {
    const paths = findMatchPaths(await request(CALENDAR_URL));
    const slug = normal(fixture.home)+normal(fixture.away);
    discovered = {paths:paths.filter(p => normal(p.split('/').pop().replace(/-\d+$/,''))===slug).slice(0,3),at:Date.now()};
    pathsCache.set(fixture.id,discovered);
  }
  const candidates = (discovered.paths || []).filter(p=>p!==explicit);
  const values = await Promise.all(candidates.map(p=>fromPath(p,fixture).then(data=>({p,data})).catch(()=>({data:null}))));
  const found = values.find(v=>v.data);
  if (found) {pathsCache.set(fixture.id,{...discovered,path:found.p});return found.data;}
  throw new Error('Nessun dato corrente validato');
}
async function getLive(fixture) {
  const now=Date.now();
  if(cache?.id===fixture.id && now-cache.at<12000) return cache.value;
  if(pending?.id===fixture.id) return pending.promise;
  const promise=resolve(fixture).then(data=>{
    const sourceTime=Date.parse(data.sourceUpdatedAt||'');
    const stale=Boolean(data.live && Number.isFinite(sourceTime) && Date.now()-sourceTime>5*60000);
    const value={...data,checkedAt:new Date().toISOString(),unavailable:false,stale,message:stale?'La fonte non aggiorna da oltre 5 minuti: ultimo dato ricevuto.':undefined};
    cache={id:fixture.id,at:Date.now(),value};return value;
  }).catch(()=>{
    if(cache?.id===fixture.id && now-cache.at<15*60000)return {...cache.value,unavailable:true,stale:true,message:'Collegamento alla fonte interrotto: mostrati gli ultimi dati ricevuti.'};
    return {fixtureId:fixture.id,home:fixture.home,away:fixture.away,kickoff:fixture.kickoff,matchDate:fixture.kickoff,
      live:false,finished:false,score:null,phase:now<Date.parse(fixture.kickoff)?'pre':'waiting',unavailable:true,
      status:now<Date.parse(fixture.kickoff)?'Prepartita':'Dati live in attesa',events:[],checkedAt:new Date().toISOString(),updatedAt:null,
      source:fixture.livePath?ORIGIN+fixture.livePath:CALENDAR_URL,sourceName:'Corriere dello Sport',
      message:'La fonte non ha restituito dati verificabili. Radio e collegamenti ufficiali restano disponibili.'};
  }).finally(()=>{if(pending?.promise===promise)pending=null;});
  pending={id:fixture.id,promise};return promise;
}
module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=10, stale-while-revalidate=15');
  if(req.method && !['GET','HEAD'].includes(req.method))return res.status(405).json({error:'Metodo non consentito'});
  const fixture=selectFixture();
  if(!fixture)return res.status(200).json({live:false,finished:false,phase:'idle',events:[],checkedAt:new Date().toISOString()});
  return res.status(200).json(await getLive(fixture));
};
module.exports._parseMatchData=parseMatchData;
module.exports._findMatchPaths=findMatchPaths;
module.exports._isRecentFinal=isRecentFinal;
module.exports._matchesFixture=matchesFixture;
module.exports._selectFixture=selectFixture;
