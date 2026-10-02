const $ = (id) => document.getElementById(id);
const DEFAULT_URL = 'https://journal.cesarzorrilla.com';

async function load() {
  const s = await chrome.storage.sync.get({ url: DEFAULT_URL, token: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  $('url').value = s.url;
  $('token').value = s.token;
  $('timezone').value = s.timezone;
  const { last } = await chrome.storage.local.get('last');
  if (last) show(last);
}

function show(r) {
  if (!r) return;
  $('msg').textContent = r.ok
    ? `Conectado con «${r.account_name || 'la cuenta'}» (${r.at ? new Date(r.at).toLocaleString() : ''}).\nÓrdenes leídas: ${r.orders ?? 0} · operaciones: ${r.trades ?? 0} · nuevas: ${r.imported ?? 0} · ya existentes: ${r.duplicates ?? 0}${r.errors && r.errors.length ? `\nAvisos: ${r.errors.join(' | ')}` : ''}`
    : `Error: ${r.error}${r.at ? ` (${new Date(r.at).toLocaleString()})` : ''}`;
}

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ url: $('url').value.trim().replace(/\/+$/, '') || DEFAULT_URL, token: $('token').value.trim(), timezone: $('timezone').value.trim() || 'UTC' });
  $('msg').textContent = 'Guardado. Pulsa «Probar conexión».';
});

$('test').addEventListener('click', async () => {
  await chrome.storage.sync.set({ url: $('url').value.trim().replace(/\/+$/, '') || DEFAULT_URL, token: $('token').value.trim(), timezone: $('timezone').value.trim() || 'UTC' });
  $('msg').textContent = 'Probando…';
  chrome.runtime.sendMessage({ type: 'test' }, (r) => show(r || { ok: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'sin respuesta' }));
});

load();
