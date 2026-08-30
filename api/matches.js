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
          const r = await fetch(`${API}/matches?${params}`, { headers });
          if (!r.ok) return [];
          const data = await r.json();
          return Array.isArray(data) ? data : (data.matches || data.response || []);
        })
      );
      return res.status(200).json({ matches: results.flat() });
    }

    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    if (date) params.set('date', date);
    if (type) params.set('type', type);
    if (league) params.set('league', league);

    const response = await fetch(`${API}/matches?${params}`, { headers });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch matches.' });
  }
}
