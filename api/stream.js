const API_HOST = 'football-live-streaming-api.p.rapidapi.com';
const API_BASE = `https://${API_HOST}`;

function pick(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value.url || value.stream || value.src || value.embedUrl || value.embed || value.iframe || value.link || '';
}

function collect(data) {
  const source = data?.servers || data?.streams || data?.sources || data?.links || data?.data || data?.response || data;
  const list = Array.isArray(source) ? source : (source && typeof source === 'object' ? Object.values(source) : [source]);
  return list.map((x, i) => {
    const url = pick(x);
    return {
      name: x?.name || x?.title || x?.language || `Server ${i + 1}`,
      type: String(x?.type || x?.format || (url.includes('.m3u8') ? 'hls' : url.includes('.mpd') ? 'dash' : 'embed')).toLowerCase(),
      url
    };
  }).filter(x => x.url);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'Missing match id' });
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return res.status(500).json({ error: 'RAPIDAPI_KEY is not configured on Vercel.' });

  const headers = { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': API_HOST, Accept: 'application/json' };
  const candidates = [
    `/link/${encodeURIComponent(id)}`,
    `/stream/${encodeURIComponent(id)}`
  ];

  let lastError = 'No stream found';
  for (const path of candidates) {
    try {
      const r = await fetch(new URL(path, API_BASE), { headers });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!r.ok) { lastError = data?.message || data?.error || `RapidAPI ${r.status}`; continue; }
      const streams = collect(data);
      if (streams.length) {
        res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
        return res.status(200).json({ streams });
      }
      lastError = 'The API returned no playable stream for this match.';
    } catch (e) { lastError = e.message; }
  }
  return res.status(404).json({ error: lastError });
}
