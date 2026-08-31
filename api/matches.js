const API_HOST = 'football-live-streaming-api.p.rapidapi.com';
const API_BASE = `https://${API_HOST}`;

function headers() {
  return {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '',
    'X-RapidAPI-Host': API_HOST,
    Accept: 'application/json'
  };
}

function arr(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
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
  const competition = m?.competition || m?.leagueInfo || {};
  const servers = arr(m?.servers || m?.streams || m?.sources).map(normalizeServer).filter(x => x.url);
  const status = String(m?.match_status || m?.status || m?.state || '').toLowerCase();
  const live = m?.live === true || status.includes('live') || status === '1';

  return {
    id: m?.id ?? m?.match_id ?? m?.matchId ?? m?.slug,
    home_team_name: m?.home_team_name || m?.homeTeamName || home?.name || m?.home || 'Home',
    away_team_name: m?.away_team_name || m?.awayTeamName || away?.name || m?.away || 'Away',
    home_team_logo: m?.home_team_logo || m?.homeTeamLogo || home?.logo || home?.badge || home?.flag || '',
    away_team_logo: m?.away_team_logo || m?.awayTeamLogo || away?.logo || away?.badge || away?.flag || '',
    league_name: m?.league_name || m?.league || competition?.name || 'Football',
    league_logo: m?.league_logo || competition?.logo || '',
    match_time: m?.match_time || m?.timestamp || m?.date || m?.start_time || null,
    match_status: live ? 'live' : 'upcoming',
    homeTeamScore: m?.homeTeamScore ?? m?.home_score ?? m?.score?.home ?? m?.homeScore ?? null,
    awayTeamScore: m?.awayTeamScore ?? m?.away_score ?? m?.score?.away ?? m?.awayScore ?? null,
    servers
  };
}

async function fetchMatches(query = {}) {
  const url = new URL('/matches', API_BASE);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const response = await fetch(url, { headers: headers() });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.message || data?.error || `RapidAPI ${response.status}`);
  return arr(data?.matches || data?.data || data?.response || data);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY is not configured on Vercel.' });

  try {
    const { status, league, page = '1' } = req.query || {};

    // Do NOT make one API request per league. That was the reason the
    // previous Popular view could return an empty page and burn the quota.
    // The API already supports status and pagination on /matches.
    const raw = await fetchMatches({
      status: status || undefined,
      page
    });

    let matches = raw.map(normalize).filter(m => m.id !== undefined && m.id !== null);

    if (status === 'live') matches = matches.filter(m => m.match_status === 'live');
    if (status === 'vs') matches = matches.filter(m => m.match_status !== 'live');
    if (league) {
      const wanted = String(league).toLowerCase();
      matches = matches.filter(m => String(m.league_name).toLowerCase().includes(wanted));
    }

    const seen = new Set();
    matches = matches.filter(m => {
      const key = String(m.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ matches });
  } catch (error) {
    return res.status(502).json({
      error: 'RapidAPI request failed',
      detail: error?.message || 'Unknown API error'
    });
  }
}
