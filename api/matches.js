const API = 'https://api.sportsrc.org/';

function normalizeMatch(m) {
  const home = m?.teams?.home || {};
  const away = m?.teams?.away || {};
  return {
    id: m.id,
    home_team_name: home.name || 'Home',
    away_team_name: away.name || 'Away',
    home_team_logo: home.badge || '',
    away_team_logo: away.badge || '',
    league_name: m.league || m.league_name || m.competition || 'Football',
    league_logo: m.league_logo || '',
    match_time: m.date ? Math.floor(Number(m.date) / 1000) : null,
    match_status: m.status === 'live' || m.live === true ? 'live' : 'upcoming',
    homeTeamScore: m.score?.home ?? m.home_score ?? null,
    awayTeamScore: m.score?.away ?? m.away_score ?? null,
    popular: !!m.popular
  };
}

function extractStreams(d) {
  const candidates = d?.streams || d?.stream || d?.sources || d?.embeds || d?.servers || [];
  const arr = Array.isArray(candidates) ? candidates : Object.values(candidates || {});
  return arr.map((s, i) => {
    if (typeof s === 'string') return { name: `Server ${i + 1}`, type: 'embed', url: s };
    return {
      name: s?.name || s?.title || `Server ${i + 1}`,
      type: s?.type || 'embed',
      url: s?.url || s?.embed || s?.iframe || s?.src || ''
    };
  }).filter(s => s.url);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { detail, popular, status, league } = req.query || {};
  try {
    if (detail) {
      const u = new URL(API);
      u.searchParams.set('data', 'detail');
      u.searchParams.set('category', 'football');
      u.searchParams.set('id', String(detail));
      const r = await fetch(u);
      const d = await r.json();
      return res.status(r.status).json({ ...d, servers: extractStreams(d) });
    }

    const u = new URL(API);
    u.searchParams.set('data', 'matches');
    u.searchParams.set('category', 'football');
    const r = await fetch(u);
    const d = await r.json();
    let matches = Array.isArray(d) ? d : (d.matches || d.data || []);
    matches = matches.map(normalizeMatch);
    if (popular === '1' || popular === 'true') matches = matches.filter(m => m.popular);
    if (status === 'live') matches = matches.filter(m => m.match_status === 'live');
    if (status === 'vs') matches = matches.filter(m => m.match_status !== 'live');
    if (league) matches = matches.filter(m => m.league_name.toLowerCase().includes(String(league).toLowerCase()));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(r.status).json({ matches });
  } catch (e) {
    return res.status(502).json({ error: 'SportSRC API unavailable', detail: e.message });
  }
}
