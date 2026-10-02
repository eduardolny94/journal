// Trabajador de fondo: recibe las órdenes leídas por content.js y las envía al journal con el token de la cuenta.
// Solo él habla con el journal (host_permissions); el contenido de TradingView nunca ve el token.
const DEFAULT_URL = 'https://journal.cesarzorrilla.com';

async function settings() {
  const s = await chrome.storage.sync.get({ url: DEFAULT_URL, token: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  return { ...s, url: String(s.url || DEFAULT_URL).replace(/\/+$/, '') };
}

async function send(payload) {
  const s = await settings();
  if (!s.token) return { ok: false, error: 'Falta el token: ábrelo en Ajustes de la extensión.' };
  try {
    const res = await fetch(`${s.url}/api/sync/tradingview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ account: { broker: payload.broker || null, account_id: payload.account_id || null, timezone: s.timezone, balance: payload.balance ?? null, equity: payload.equity ?? null }, orders: payload.orders || [] }),
    });
    const json = await res.json().catch(() => ({}));
    const result = res.ok ? { ok: true, ...json, at: new Date().toISOString() } : { ok: false, error: json.error || `HTTP ${res.status}`, code: json.code, at: new Date().toISOString() };
    await chrome.storage.local.set({ last: result });
    await chrome.action.setBadgeText({ text: result.ok ? (result.imported ? String(result.imported) : '') : '!' });
    await chrome.action.setBadgeBackgroundColor({ color: result.ok ? '#0f9d58' : '#d93025' });
    return result;
  } catch (e) {
    const result = { ok: false, error: `No se pudo conectar con el journal (${e.message}).`, at: new Date().toISOString() };
    await chrome.storage.local.set({ last: result });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
    return result;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sync') { send(msg.payload || {}).then(sendResponse); return true; }
  if (msg && msg.type === 'test') { send({ orders: [] }).then(sendResponse); return true; }
  return false;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
