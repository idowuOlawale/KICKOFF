const API = 'https://football-live-streaming-api.p.rapidapi.com';
const POPULAR_LEAGUES = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League'];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.RAPIDAPI_KEY;
  if (!key) return res.status(500).json({ error: 'RAPIDAPI_KEY is not configured on Vercel.' });

  const headers = {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': 'football-live-streaming-api.p.rapidapi.com'
  };

  const { popular, page = '1', status, date, type, league } = req.query || {};

  try {
    // The API is paginated at 20 matches/page. The popular feed uses the API's
    // league filter so major competitions are not hidden behind page 1.
    if (popular === '1' || popular === 'true') {
      const results = await Promise.all(
        POPULAR_LEAGUES.map(async (leagueName) => {
          const params = new URLSearchParams({ league: leagueName, page: '1' });
          if (status && status !== 'all' && status !== 'popular') params.set('status', status);
          if (date) params.set('date', date);
          if (type) params.set('type', type);
          const response = await fetch(`${API}/matches?${params.toString()}`, { headers });
          if (!response.ok) return [];
          const data = await response.json();
          return Array.isArray(data.matches) ? data.matches : [];
        })
      );

      const matches = results.flat().sort((a, b) => Number(a.match_time || 0) - Number(b.match_time || 0));
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ matches, popularLeagues: POPULAR_LEAGUES });
    }

    const params = new URLSearchParams();
    params.set('page', String(page));
    if (status && status !== 'all') params.set('status', String(status));
    if (date) params.set('date', String(date));
    if (type) params.set('type', String(type));
    if (league) params.set('league', String(league));

    const response = await fetch(`${API}/matches?${params.toString()}`, { headers });
    const text = await response.text();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json');
    return res.status(response.status).send(text);
  } catch (e) {
    return res.status(502).json({ error: 'Football API unavailable', detail: e.message });
  }
}
