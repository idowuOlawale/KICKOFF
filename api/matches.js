const API_URL = 'https://football-live-streaming-api.p.rapidapi.com/matches';
const API_HOST = 'football-live-streaming-api.p.rapidapi.com';

const LEAGUES = {
  epl: 'Premier League',
  laliga: 'La Liga',
  ligue1: 'Ligue 1',
  bundesliga: 'Bundesliga',
  mls: 'MLS',
  saudi: 'Saudi Pro League'
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || process.env.X_RAPIDAPI_KEY;
  if (!key) {
    return res.status(500).json({ error: 'RapidAPI key is not configured in Vercel.' });
  }

  const { status = 'all', league = 'all', date = '', page = '1' } = req.query || {};
  const params = new URLSearchParams({ page: String(page) });
  if (status === 'live') params.set('status', 'live');
  if (status === 'upcoming') params.set('status', 'vs');
  if (date) params.set('date', String(date));
  if (league !== 'all' && LEAGUES[league]) params.set('league', LEAGUES[league]);

  try {
    const response = await fetch(`${API_URL}?${params.toString()}`, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': API_HOST,
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || 'RapidAPI request failed', details: data });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Unable to reach the football streaming API.' });
  }
}
