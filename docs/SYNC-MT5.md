# Sincronización automática con MetaTrader 5

Cada posición que se cierra en MT5 llega sola al journal, junto con el balance, la equidad y el flotante de la cuenta.
Se activa en **Cuentas → Conectar → 3. Sincronización automática** (cuentas con plataforma MetaTrader 5).

## Cómo funciona

```
MetaTrader 5 (tu PC)                         Journal (Railway)
 └─ servicio GTFX_JournalSync  ── HTTPS ──▶  POST /api/sync/mt5   (token de la cuenta)
      lee el historial local                  guarda operaciones nuevas, balance y equidad
```

- `GTFX_JournalSync` es un **servicio** de MT5 (como RadarPrecios): corre en segundo plano, sin gráfico, y arranca solo
  con el terminal. Revisa la cuenta cada 10 s; al cerrarse una posición la envía; con posiciones abiertas manda el
  balance y la equidad cada minuto (cada 5 min si no hay nada abierto).
- Si el PC estuvo apagado, al abrir MT5 envía todo lo cerrado desde la última sincronización (la primera vez, 90 días).
- El journal **no duplica**: usa el mismo identificador que la importación por CSV (`mt5:pos:<posición>`), así que se
  pueden mezclar ambas vías.
- Una posición con cierres parciales se envía una sola vez, cuando queda cerrada del todo (precios medios ponderados).
- P&L neto = beneficio + swap − comisiones (igual que el CSV). Origen de la operación: `sync:mt5`.
- Horas: MT5 da "hora del servidor". Si el servidor va en Nueva York + 7 h (UTC+2/+3, lo habitual en forex y prop
  firms) se convierte con el calendario real de Nueva York, que acierta también con operaciones de otro horario.
- Tras cada envío el journal evalúa los límites de riesgo; si la cuenta queda bloqueada, MT5 muestra una alerta.

## Seguridad y prop firms

Diseñado para no dar ningún motivo de sospecha a una prop firm:

- **Nadie inicia sesión en la cuenta desde otro sitio.** El servicio corre dentro del MetaTrader del propio trader, en
  su PC y con su IP de siempre. El servidor del journal nunca se conecta al bróker.
- **Sin contraseñas.** Ni la principal ni la de inversor. Se usa un token propio del journal, por cuenta, del que solo
  se guarda el hash; se puede rotar o revocar desde la tarjeta.
- **Solo lectura.** El servicio no abre, modifica ni cierra órdenes (no hay ninguna llamada a `OrderSend`): lee el
  historial que el terminal ya tiene y lo envía por HTTPS a este journal, a ningún tercero.
- **Descartado a propósito:** los conectores en la nube (MetaApi y similares, o dar la contraseña de inversor a un
  servicio). Esos sí abren sesiones desde centros de datos con otra IP, que es justo lo que las prop firms vigilan.
- **No instalarlo en un VPS ni en otro PC** distinto del que se usa para operar: eso sí sería una conexión nueva.
- El token queda ligado a la primera cuenta de MT5 que sincroniza. Si el terminal cambia a otra cuenta, el journal
  rechaza el envío (409) y no guarda nada, para no mezclar cuentas.
- Aun así, cada firma tiene sus reglas sobre herramientas de terceros: ante la duda, preguntar a su soporte.

## Instalación (una vez por terminal)

1. MT5 → Herramientas → Opciones → Asesores Expertos → marcar "Permitir WebRequest para las URL listadas" y añadir
   `https://journal.cesarzorrilla.com`.
2. Archivo → Abrir carpeta de datos → `MQL5\Services`: copiar `GTFX_JournalSync.ex5` (se descarga desde la tarjeta).
3. Navegador → Servicios → clic derecho → Actualizar → clic derecho → "Añadir servicio" → GTFX_JournalSync.
4. Pegar el token en el campo `Token` → Aceptar.

Mensajes del servicio: pestaña "Expertos" del terminal (token inválido, WebRequest sin permitir, sin conexión…).

## Piezas

| Pieza | Dónde |
|---|---|
| Servicio MT5 (fuente y compilado) | `client/public/descargas/GTFX_JournalSync.mq5` / `.ex5` |
| Entrada con token y límite de peticiones | `server/src/routes/sync.js` |
| Token, validación, conversión de horas, inserción | `server/src/services/mt5Sync.js` |
| Token por cuenta | `POST` / `DELETE /api/accounts/:id/sync-token` |
| Tarjeta de estado e instalación | `client/src/components/Mt5SyncCard.tsx` |
| Columnas | `accounts.sync_*` (el hash del token nunca sale del servidor) |

Recompilar tras cambiar el `.mq5`:
`MetaEditor64.exe /compile:"…\GTFX_JournalSync.mq5" /log` y copiar el `.ex5` a `client/public/descargas/`.
