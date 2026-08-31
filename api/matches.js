const API_HOST = 'football-live-streaming-api.p.rapidapi.com';
const API_BASE = `https://${API_HOST}`;

const POPULAR = [
  'Premier League', 'La Liga', 'Serie A', 'Bundesliga',
  'Ligue 1', 'Major League Soccer', 'Saudi Pro League', 'Champions League'
];

function headers() {
  return {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '',
    'X-RapidAPI-Host': API_HOST,
    Accept: 'application/json'
  };
}

function arr(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function normalizeServer(s, i) {
  if (typeof s === 'string') return { name: `Server ${i + 1}`, type: 'direct', url: s };
  return {
    name: s?.name || s?.title || `Server ${i + 1}`,
    type: String(s?.type || s?.format || 'direct').toLowerCase(),
    url: s?.url || s?.embedUrl || s?.embed || s?.iframe || s?.src || ''
  };
}

function normalize(m) {
  const home = m?.home_team || m?.homeTeam || m?.teams?.home || {};
  const away = m?.away_team || m?.awayTeam || m?.teams?.away || {};
  const servers = arr(m?.servers || m?.streams || m?.sources).map(normalizeServer).filter(s => s.url);
  return {
    id: m?.id ?? m?.match_id ?? m?.matchId ?? m?.slug,
    home_team_name: m?.home_team_name || m?.homeTeamName || home?.name || 'Home',
    away_team_name: m?.away_team_name || m?.awayTeamName || away?.name || 'Away',
    home_team_logo: m?.home_team_logo || home?.logo || home?.badge || home?.flag || '',
    away_team_logo: m?.away_team_logo || away?.logo || away?.badge || away?.flag || '',
    league_name: m?.league_name || m?.league || m?.competition?.name || 'Football',
    league_logo: m?.league_logo || m?.competition?.logo || '',
    match_time: m?.match_time || m?.timestamp || m?.date || null,
    match_status: String(m?.match_status || m?.status || '').toLowerCase().includes('live') || m?.live === true ? 'live' : 'upcoming',
    homeTeamScore: m?.homeTeamScore ?? m?.home_score ?? m?.score?.home ?? null,
    awayTeamScore: m?.awayTeamScore ?? m?.away_score ?? m?.score?.away ?? null,
    servers
  };
}

async function fetchMatches(params) {
  const url = new URL('/matches', API_BASE);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: headers() });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data?.message || data?.error || `RapidAPI ${r.status}`);
  return arr(data?.matches || data?.data || data?.response || data);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY is not configured on Vercel.' });

  try {
    const { popular, status, league, page = '1' } = req.query || {};
    let raw = [];

    if (popular === '1' || popular === 'true') {
      const groups = await Promise.all(POPULAR.map(async name => {
        try { return await fetchMatches({ league: name, page: '1' }); } catch { return []; }
      }));
      raw = groups.flat();
    } else {
      raw = await fetchMatches({ status: status || '', league: league || '', page });
    }

    let matches = raw.map(normalize).filter(m => m.id !== undefined && m.id !== null);
    if (status === 'live') matches = matches.filter(m => m.match_status === 'live');
    if (status === 'vs') matches = matches.filter(m => m.match_status !== 'live');
    if (league) matches = matches.filter(m => m.league_name.toLowerCase().includes(String(league).toLowerCase()));

    // Remove duplicate matches when league-specific popular requests overlap.
    const seen = new Set();
    matches = matches.filter(m => { const k = String(m.id); if (seen.has(k)) return false; seen.add(k); return true; });

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    return res.status(200).json({ matches });
  } catch (e) {
    return res.status(502).json({ error: 'RapidAPI request failed', detail: e.message });
  }
}
