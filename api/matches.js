const API='https://football-live-streaming-api.p.rapidapi.com';
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const key=process.env.RAPIDAPI_KEY;
  if(!key) return res.status(500).json({error:'RAPIDAPI_KEY is not configured on Vercel.'});
  const allowed=['page','status','date','type','league'];
  const params=new URLSearchParams();
  for(const name of allowed){const value=req.query?.[name]; if(value!==undefined&&value!=='') params.set(name,String(value));}
  try{
    const response=await fetch(`${API}/matches?${params.toString()}`,{headers:{'X-RapidAPI-Key':key,'X-RapidAPI-Host':'football-live-streaming-api.p.rapidapi.com'}});
    const text=await response.text();
    res.status(response.status).setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');
    res.setHeader('Content-Type','application/json');
    return res.send(text);
  }catch(e){return res.status(502).json({error:'Football API unavailable',detail:e.message});}
}