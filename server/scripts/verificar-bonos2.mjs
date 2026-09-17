// Segunda ronda: JPY (cabecera MoF), CHF (SNB con comillas), GBP (títulos BoE), GB/NZ vía MarketWatch (2 años).
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GTFX-Journal/1.0', Accept: '*/*' };
const tests = {
  JPY_MOF_head: async () => {
    const r = await fetch('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv', { headers: UA });
    const t = await r.text();
    const lines = t.split('\n');
    return [`status ${r.status} len ${t.length}`, ...lines.slice(0, 3).map((l) => l.slice(0, 120)), '...', ...lines.slice(-3).map((l) => l.slice(0, 120))];
  },
  JPY_MOF_hist_head: async () => {
    const r = await fetch('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv', { headers: UA });
    const t = await r.text();
    const lines = t.split('\n');
    return [`status ${r.status} len ${t.length} lineas ${lines.length}`, ...lines.slice(0, 3).map((l) => l.slice(0, 120)), '...', ...lines.slice(-2).map((l) => l.slice(0, 120))];
  },
  CHF_SNB_2J: async () => {
    const r = await fetch('https://data.snb.ch/api/cube/rendoblid/data/csv/en', { headers: UA });
    const t = await r.text();
    const rows = t.split('\n').map((l) => l.replace(/\r$/, '').split(';').map((c) => c.replace(/^"|"$/g, ''))).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && c[1] === '2J' && c[2] !== '');
    return rows.map((c) => [c[0], Number(c[2])]);
  },
  GBP_BOE_titulos: async () => {
    const r = await fetch('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Sep/2025&Dateto=now&SeriesCodes=IUDSNPY,IUDMNPY,IUDLNPY,IUDSIZC,IUDMIZC&CSVF=TT&UsingCodes=Y&VPD=Y&VFD=N', { headers: UA });
    const t = await r.text();
    return t.split('\n').slice(0, 4).map((l) => l.slice(0, 400));
  },
  MW_GB02Y: async () => mw('BX:TMBMKGB-02Y'),
  MW_NZ02Y: async () => mw('BX:TMBMKNZ-02Y'),
  MW_JP02Y: async () => mw('BX:TMBMKJP-02Y'),
  MW_CH02Y: async () => mw('BX:TMBMKCH-02Y'),
};
async function mw(key) {
  const json = { Step: 'P1D', TimeFrame: 'P3Y', EntitlementToken: 'cecc4267a0194af89ca343805a3e57af', IncludeMockTick: false, FilterNullSlots: true, FilterClosedPoints: true, IncludeClosedSlots: false, IncludeOfficialClose: true, InjectOpen: false, ShowPreMarket: false, ShowAfterHours: false, UseExtendedTimeFrame: true, WantPriorClose: false, IncludeCurrentQuotes: false, ResetTodaysAfterHoursPercentChange: false, Series: [{ Key: key, Dialect: 'Charting', Kind: 'Ticker', SeriesId: 's1', DataTypes: ['Last'] }] };
  const url = `https://api.wsj.net/api/michelangelo/timeseries/history?json=${encodeURIComponent(JSON.stringify(json))}&ckey=cecc4267a0`;
  const r = await fetch(url, { headers: { ...UA, 'Dylan2010.EntitlementToken': 'cecc4267a0194af89ca343805a3e57af', Origin: 'https://www.marketwatch.com', Referer: 'https://www.marketwatch.com/' } });
  if (r.status !== 200) return [`status ${r.status}: ${(await r.text()).slice(0, 200)}`];
  const j = await r.json();
  const ticks = j.TimeInfo?.Ticks || [];
  const vals = j.Series?.[0]?.DataPoints || [];
  return ticks.map((t, i) => [new Date(t).toISOString().slice(0, 10), vals[i]?.[0]]).filter((x) => Number.isFinite(x[1]));
}
for (const [name, fn] of Object.entries(tests)) {
  try {
    const rows = await fn();
    if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) console.log(`${name}: ${rows.length} filas · primera ${rows[0][0]} · última ${rows[rows.length - 1][0]} = ${rows[rows.length - 1][1]}`);
    else console.log(`${name}:`, rows);
  } catch (e) {
    console.log(`${name}: ERROR ${e.message}`);
  }
}
