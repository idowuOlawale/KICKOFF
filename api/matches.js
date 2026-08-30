const API_URL = 'https://football-live-streaming-api.p.rapidapi.com/matches';
const API_HOST = 'football-live-streaming-api.p.rapidapi.com';

// KICKOFF intentionally supports only these six leagues.
const LEAGUES = {
  epl: 'Premier League',
  laliga: 'La Liga',
  ligue1: 'Ligue 1',
  bundesliga: 'Bundesliga',
  mls: 'MLS',
  saudi: 'Saudi Pro League'
};

// Keep a short-lived server cache so refreshing/filtering the site does not
// create a new RapidAPI request every time. The provider documents frequent
// live-data updates, so 180 seconds is a sensible cache window.
const CACHE_TTL = 180000;
const cache = globalThis.__kickoffCache || (globalThis.__kickoffCache = new Map());

function filterMatches(matches) {
  return (matches || [])
    .filter((match) => Object.values(LEAGUES).includes(String(match.league_name || '')))
    .map((match) => ({
      ...match,
      servers: filterAuthorizedStreams(match.servers || [])
    }));
}

function filterAuthorizedStreams(servers) {
  const allowed = (process.env.ALLOWED_STREAM_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  // Never expose arbitrary third-party stream URLs unless the host has been
  // explicitly allow-listed in Vercel.
  if (!allowed.length) return [];

  return servers.filter((server) => {
    try {
      const host = new URL(String(server.url).split('|')[0]).hostname.toLowerCase();
      return allowed.some((item) => host === item || host.endsWith(`.${item}`));
    } catch {
      return false;
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || process.env.X_RAPIDAPI_KEY;
  if (!key) return res.status(500).json({ error: 'RapidAPI key is not configured in Vercel.' });

  const { status = 'live', date = '', page = '1' } = req.query || {};
  const normalizedStatus = status === 'upcoming' ? 'vs' : status === 'live' ? 'live' : '';
  const cacheKey = JSON.stringify({ status: normalizedStatus, date: String(date), page: String(page) });
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.time < CACHE_TTL) {
    res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=60');
    res.setHeader('X-KICKOFF-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  const params = new URLSearchParams({ page: String(page) });
  if (normalizedStatus) params.set('status', normalizedStatus);
  if (date) params.set('date', String(date));

  try {
    // One RapidAPI request returns matches across all leagues. We filter to the
    // six supported leagues locally instead of making six separate API calls.
    const response = await fetch(`${API_URL}?${params.toString()}`, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': API_HOST
      }
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.message || 'RapidAPI request failed',
        details: data
      });
    }

    const result = {
      ...data,
      matches: filterMatches(data.matches)
    };

    cache.set(cacheKey, { time: Date.now(), data: result });
    res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=60');
    res.setHeader('X-KICKOFF-Cache', 'MISS');
    return res.status(200).json(result);
  } catch {
    return res.status(502).json({ error: 'Unable to reach the football streaming API.' });
  }
}
