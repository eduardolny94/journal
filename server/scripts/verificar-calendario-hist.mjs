// ¿Devuelve el calendario de TradingView histórico con valores reales? Prueba un mes de hace 2 años.
const H = { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
for (const [from, to] of [['2024-09-01', '2024-10-01'], ['2023-03-01', '2023-04-01']]) {
  const url = `https://economic-calendar.tradingview.com/events?from=${from}T00:00:00.000Z&to=${to}T00:00:00.000Z&countries=US,EU,GB,JP,CH,CA,AU,NZ`;
  const r = await fetch(url, { headers: H });
  const j = await r.json();
  const list = j.result || [];
  const withActual = list.filter((e) => e.actual !== null && e.actual !== undefined);
  const withFc = list.filter((e) => e.forecast !== null && e.forecast !== undefined);
  const hi = list.filter((e) => Number(e.importance) >= 1);
  console.log(`${from}: status ${r.status} · ${list.length} eventos · con actual ${withActual.length} · con forecast ${withFc.length} · alto impacto ${hi.length}`);
  console.log('  ejemplo:', JSON.stringify(hi.slice(0, 2).map((e) => ({ t: e.title, c: e.country, d: e.date, a: e.actual, f: e.forecast, p: e.previous, u: e.unit }))));
}
