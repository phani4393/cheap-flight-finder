// Quick test to discover real entity IDs from the Flight Scanner API
const axios = require('axios');

const API_KEY = process.env.RAPIDAPI_KEY;
if (!API_KEY) { console.log('Set RAPIDAPI_KEY env var'); process.exit(1); }

async function searchAirport(query) {
  const resp = await axios.get('https://flight-scanner10.p.rapidapi.com/api/v3/flights/searchAirport', {
    params: { query },
    headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': 'flight-scanner10.p.rapidapi.com' }
  });
  return resp.data?.data?.[0]?.navigation;
}

async function main() {
  const airports = ['ORD', 'LAX', 'MIA', 'DEN'];
  for (const code of airports) {
    try {
      await new Promise(r => setTimeout(r, 500));
      const nav = await searchAirport(code);
      console.log(`${code}: entityId=${nav?.entityId}, type=${nav?.entityType}, skyId=${nav?.relevantFlightParams?.skyId}`);
    } catch (e) {
      console.log(`${code}: ERROR - ${e.response?.status || e.message}`);
    }
  }
}

main();
