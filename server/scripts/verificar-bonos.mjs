// Verifica fuentes gratuitas de bonos a 2 años por divisa (histórico diario). Imprime filas, última fecha y valor.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GTFX-Journal/1.0', Accept: '*/*' };
const since = new Date(Date.now() - 3 * 366 * 86400000).toISOString().slice(0, 10);
const tests = {
  USD_FRED_DGS2: async () => {
    const key = process.env.FRED_API_KEY;
    const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DGS2&api_key=${key}&file_type=json&observation_start=${since}`, { headers: UA });
    const j = await r.json();
    return (j.observations || []).filter((o) => o.value !== '.').map((o) => [o.date, Number(o.value)]);
  },
  EUR_ECB_2Y: async () => {
    const r = await fetch(`https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?format=csvdata&startPeriod=${since}`, { headers: UA });
    const t = await r.text();
    const lines = t.trim().split('\n');
    const head = lines[0].split(',');
    const iD = head.indexOf('TIME_PERIOD'); const iV = head.indexOf('OBS_VALUE');
    return lines.slice(1).map((l) => l.split(',')).map((c) => [c[iD], Number(c[iV])]).filter((x) => Number.isFinite(x[1]));
  },
  JPY_MOF_JGB: async () => {
    const r = await fetch('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv', { headers: UA });
    const t = await r.text();
    const lines = t.trim().split('\n');
    const head = lines[0].split(',').map((s) => s.trim());
    const iV = head.indexOf('2Y');
    return lines.slice(1).map((l) => l.split(',')).map((c) => [c[0].trim().replace(/\//g, '-'), Number(c[iV])]).filter((x) => Number.isFinite(x[1]));
  },
  CAD_BOC_2Y: async () => {
    const r = await fetch(`https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/json?start_date=${since}`, { headers: UA });
    const j = await r.json();
    return (j.observations || []).map((o) => [o.d, Number(o['BD.CDN.2YR.DQ.YLD']?.v)]).filter((x) => Number.isFinite(x[1]));
  },
  AUD_RBA_F2: async () => {
    const r = await fetch('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv', { headers: UA });
    const t = await r.text();
    const lines = t.split('\n').map((l) => l.replace(/\r$/, ''));
    const idIdx = lines.findIndex((l) => l.startsWith('Series ID'));
    const ids = lines[idIdx].split(',');
    const iV = ids.indexOf('FCMYGBAG2D');
    const out = [];
    for (const l of lines.slice(idIdx + 1)) {
      const c = l.split(',');
      if (!/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(c[0])) continue;
      const d = new Date(c[0].replace(/-/g, ' ') + ' UTC');
      const v = Number(c[iV]);
      if (Number.isFinite(v)) out.push([d.toISOString().slice(0, 10), v]);
    }
    return out;
  },
  CHF_SNB: async () => {
    const r = await fetch('https://data.snb.ch/api/cube/rendoblid/data/csv/en', { headers: UA });
    const t = await r.text();
    const lines = t.trim().split('\n');
    const rows = lines.filter((l) => /^\d{4}-\d{2}-\d{2};/.test(l)).map((l) => l.split(';'));
    return rows.filter((c) => c[1] === '2J' || c[1] === '2').map((c) => [c[0], Number(c[2])]).filter((x) => Number.isFinite(x[1]));
  },
  CHF_SNB_head: async () => {
    const r = await fetch('https://data.snb.ch/api/cube/rendoblid/data/csv/en', { headers: UA });
    const t = await r.text();
    return t.split('\n').slice(0, 8);
  },
  GBP_BOE: async () => {
    const r = await fetch('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Sep/2023&Dateto=now&SeriesCodes=IUDSNPY,IUDMNPY,IUDLNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N', { headers: UA });
    const t = await r.text();
    return t.split('\n').slice(0, 6);
  },
  NZD_RBNZ: async () => {
    const r = await fetch('https://www.rbnz.govt.nz/-/media/project/sites/rbnz/files/statistics/tables/b2/hb2-daily.xlsx', { headers: UA });
    return [`status ${r.status} type ${r.headers.get('content-type')} bytes ${(await r.arrayBuffer()).byteLength}`];
  },
  TV_SCANNER_2Y: async () => {
    const r = await fetch('https://scanner.tradingview.com/global/scan', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ symbols: { tickers: ['TVC:US02Y', 'TVC:DE02Y', 'TVC:GB02Y', 'TVC:JP02Y', 'TVC:AU02Y', 'TVC:CA02Y', 'TVC:CH02Y', 'TVC:NZ02Y'] }, columns: ['close', 'change'] }) });
    const j = await r.json();
    return (j.data || []).map((d) => [d.s, d.d[0]]);
  },
};
for (const [name, fn] of Object.entries(tests)) {
  try {
    const rows = await fn();
    if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) console.log(`${name}: ${rows.length} filas · primera ${rows[0][0]} · última ${rows[rows.length - 1][0]} = ${rows[rows.length - 1][1]}`);
    else console.log(`${name}:`, rows);
  } catch (e) {
    console.log(`${name}: ERROR ${e.message}`);
  }
}
