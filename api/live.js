const SOURCE_ORIGIN = 'https://www.corrieredellosport.it';
const CURRENT_FALLBACK = '/live/partita/team-altamura-bari-2675598';

function decodeHtml(value = '') {
  const named = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
    agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì',
    ograve: 'ò', ugrave: 'ù', deg: '°'
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBariMatchPath(path) {
  const slug = path.split('/').pop() || '';
  return /(?:^|-)bari(?:-|$)/i.test(slug);
}

function findMatchPaths(html) {
  const found = [];
  const expression = /href="(\/live\/partita\/[^"]+)"/g;
  let match;
  while ((match = expression.exec(html))) {
    const path = decodeHtml(match[1]);
    if (isBariMatchPath(path) && !found.includes(path)) found.push(path);
  }
  return found;
}

function parseMatch(html, source) {
  const teams = [...html.matchAll(/<span class="Match_name__[^"]*">([^<]+)<\/span>/g)]
    .slice(0, 2)
    .map(match => decodeHtml(match[1]));
  const score = decodeHtml((html.match(/<p class="Match_result__[^"]*">([^<]+)<\/p>/) || [])[1]);
  const status = decodeHtml((html.match(/<p class="Match_status__[^"]*"[^>]*>([^<]+)<\/p>/) || [])[1]);
  const isOngoing = html.includes('--color-live-ongoing') ||
    /(?:\d+['’]|intervallo|1° tempo|2° tempo|tempi supplementari|rigori)/i.test(status);
  const isFinished = /terminata|finale|fine partita/i.test(status);

  const events = [];
  const eventExpression = /<div class="Commentary_minute__[^"]*">([\s\S]*?)<\/div><div class="Commentary_commentText__[^"]*">([\s\S]*?)<\/div>/g;
  let event;
  while ((event = eventExpression.exec(html)) && events.length < 120) {
    const minute = decodeHtml(event[1]);
    const text = decodeHtml(event[2]);
    if (!minute || !text) continue;
    const salient = /gol!|ammonit|espuls|sostituz|tiro parato|tiro respinto|tentativo fallito|calcio d.angolo|rigore|palo|traversa|inizia|termina|intervallo|gara (?:riprende|momentaneamente sospesa)|infortun/i.test(text);
    events.push({ minute, text, salient });
  }

  if (teams.length !== 2 || !score || !status) return null;
  return {
    live: isOngoing,
    finished: isFinished,
    competition: 'Serie C · Girone C',
    home: teams[0],
    away: teams[1],
    score: score.replace(/\s+/g, ' '),
    status,
    events,
    source,
    sourceName: 'Corriere dello Sport · dati Opta',
    updatedAt: new Date().toISOString()
  };
}

function periodLabel(period, minute) {
  if (period === 'FirstHalf') return `${minute || 1}' 1° tempo`;
  if (period === 'HalfTime') return 'Intervallo';
  if (period === 'SecondHalf') return `${minute || 46}' 2° tempo`;
  if (period === 'ExtraTimeFirstHalf' || period === 'ExtraTimeSecondHalf') return `${minute || ''}' supplementari`.trim();
  if (period === 'PenaltyShootout') return 'Calci di rigore';
  if (period === 'FullTime') return 'Finale';
  return '';
}

function parseMatchData(payload, source) {
  const result = payload?.matchresults;
  const fixture = result?.fixtures;
  const liveData = result?.live;
  const info = liveData?.MatchInfo;
  if (!fixture || !liveData || !info) return null;

  const livePeriods = new Set(['FirstHalf', 'HalfTime', 'SecondHalf', 'ExtraTimeFirstHalf', 'ExtraTimeSecondHalf', 'PenaltyShootout']);
  const rawEvents = payload?.commentary?.commentary?.elements?.[0]?.elements || [];
  const salientTypes = new Set([
    'goal', 'penalty goal', 'own goal', 'yellow card', 'second yellow', 'red card',
    'substitution', 'kick off', 'half time', 'full time', 'attempt saved',
    'attempt blocked', 'attempt missed', 'corner', 'penalty', 'start delay', 'end delay'
  ]);
  const events = rawEvents.slice(0, 120).map(item => {
    const attributes = item?.attributes || {};
    return {
      minute: String(attributes.time || (attributes.minute ? `${attributes.minute}'` : '')),
      text: String(attributes.comment || ''),
      salient: salientTypes.has(String(attributes.type || '').toLowerCase())
    };
  }).filter(event => event.minute && event.text);

  return {
    live: livePeriods.has(info.Period),
    finished: info.Period === 'FullTime',
    competition: fixture.cName || 'Serie C · Girone C',
    home: fixture.home_name || 'Casa',
    away: fixture.away_name || 'Bari',
    score: `${liveData.score_home ?? 0} - ${liveData.score_away ?? 0}`,
    status: periodLabel(info.Period, info.MatchTime),
    matchDate: fixture?.date?.dateUTC || '',
    events,
    source,
    sourceName: 'Corriere dello Sport · dati Opta',
    updatedAt: payload.lastUpdate || new Date().toISOString()
  };
}

function isRecentFinal(match) {
  if (!match?.finished) return false;
  const timestamp = Date.parse(match.updatedAt || match.matchDate || '');
  return Number.isFinite(timestamp) && Date.now() - timestamp < 18 * 60 * 60 * 1000;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; TreninoBari/1.0; +https://treninobari.vercel.app)',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`Fonte live non disponibile (${response.status})`);
  return response.text();
}

async function fetchMatchData(matchId, matchPath = '') {
  const response = await fetch(`${SOURCE_ORIGIN}/api-live/matchresults/${matchId}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; TreninoBari/1.0; +https://treninobari.vercel.app)',
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`Dati live non disponibili (${response.status})`);
  const source = matchPath ? new URL(matchPath, SOURCE_ORIGIN).href : `${SOURCE_ORIGIN}/live`;
  return parseMatchData(await response.json(), source);
}

function matchIdFromPath(path) {
  return (path.match(/-([0-9]+)$/) || [])[1] || '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');

  try {
    const currentId = matchIdFromPath(CURRENT_FALLBACK);
    if (currentId) {
      const current = await fetchMatchData(currentId, CURRENT_FALLBACK);
      if (current?.live || isRecentFinal(current)) return res.status(200).json(current);
    }

    const homepage = await fetchPage(SOURCE_ORIGIN);
    const paths = findMatchPaths(homepage);
    for (const path of paths.slice(0, 4)) {
      const matchId = matchIdFromPath(path);
      if (!matchId || matchId === currentId) continue;
      try {
        const data = await fetchMatchData(matchId, path);
        if (data?.live || isRecentFinal(data)) return res.status(200).json(data);
      } catch (_) {
        // Prova l'eventuale altra gara del Bari presente nella pagina live.
      }
    }

    return res.status(200).json({ live: false, updatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(200).json({
      live: false,
      unavailable: true,
      message: error instanceof Error ? error.message : 'Fonte live non disponibile',
      updatedAt: new Date().toISOString()
    });
  }
};

module.exports._parseMatch = parseMatch;
module.exports._findMatchPaths = findMatchPaths;
module.exports._parseMatchData = parseMatchData;
module.exports._isRecentFinal = isRecentFinal;
