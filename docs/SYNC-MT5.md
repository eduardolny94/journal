# Sincronización automática con MetaTrader 5

Cada posición que se cierra en MT5 llega sola al journal, junto con el balance, la equidad y el flotante de la cuenta.
Se activa en **Cuentas → Conectar → 3. Sincronización automática** (cuentas con plataforma MetaTrader 5).

## Un solo token para todo (desde 28-10-2026)

Antes había un token por cuenta del journal, ligado a la primera cuenta de MT5 que lo usaba: si el terminal cambiaba
de cuenta (otra evaluación, otra prop firm) el journal respondía 409 y el trader tenía que generar y pegar otro token.
Ahora cada usuario tiene un **token único** (`gtfxu_<usuario>_…`, en **Conectar → 3. Sincronización automática →
Generar mi token único**) que se pega una sola vez en el servicio y vale para cualquier cuenta de MT5:

1. El servicio manda siempre el login y el servidor de MT5. El journal busca la cuenta del usuario asociada a ese login.
2. Si no hay ninguna y el usuario tiene **exactamente una** cuenta MT5 sin asociar (la creó a mano antes), la usa.
3. Si tampoco, **crea la cuenta** `MT5 <login>` (plataforma mt5, divisa y tamaño = balance del terminal, firma = servidor)
   y el trader solo le pone nombre y límites después en Cuentas.

Respuesta de `POST /api/sync/mt5` con cualquier token: `{ …, account_id, account_name, account_created }`.
Los tokens por cuenta (`gtfx_<cuenta>_…`) siguen funcionando igual («Token solo para esta cuenta (avanzado)»); el de
TradingView sigue siendo por cuenta (con el token único responde 400 `account_token_required`).

El guardián `GTFX_JournalGuard` (v1.1) añade `?login=…&server=…` a `GET /api/sync/mt5/estado`; con el token único y sin
login responde 400 `bad_login`. Si ese login aún no ha sincronizado, responde sin bloqueo y con `pending`.

**Móvil.** La app de MetaTrader del teléfono no ejecuta servicios. La recomendación en la tarjeta: dejar el MetaTrader
del PC de casa abierto, conectado a la misma cuenta con la **contraseña de inversor** (solo lectura). Es el mismo PC e
IP de siempre y no puede operar; al encenderlo manda todo lo cerrado mientras estuvo apagado.

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
- Con el token único, cada cuenta de MT5 va a su cuenta del journal por su número de login: nunca se mezclan. El token
  por cuenta (avanzado) queda ligado a la primera cuenta de MT5 que sincroniza y rechaza otras (409).
- Aun así, cada firma tiene sus reglas sobre herramientas de terceros: ante la duda, preguntar a su soporte.

## Instalación (una vez por terminal)

1. MT5 → Herramientas → Opciones → Asesores Expertos → marcar "Permitir WebRequest para las URL listadas" y añadir
   `https://journal.cesarzorrilla.com`.
2. Archivo → Abrir carpeta de datos → `MQL5\Services`: copiar `GTFX_JournalSync.ex5` (se descarga desde la tarjeta).
3. Navegador → Servicios → clic derecho → Actualizar → clic derecho → "Añadir servicio" → GTFX_JournalSync.
4. Pegar el token en el campo `Token` → Aceptar.

Mensajes del servicio: pestaña "Expertos" del terminal (token inválido, WebRequest sin permitir, sin conexión…).

## Instalación en Mac

MetaTrader 5 para Mac es la versión de MetaQuotes envuelta en Wine: la carpeta de datos está en
`~/Library/Application Support/<paquete>/drive_c/Program Files/<MetaTrader 5>/MQL5`. El `.ex5` compilado en Windows sirve
igual. El instalador `.bat` es solo de Windows (en Mac sale "No hay ninguna aplicación definida para abrir…").

La tarjeta detecta el sistema y, en Mac, ofrece un **comando de Terminal** (copiar → pegar → Intro) que busca todos los
MetaTrader 5 del usuario con `find`, descarga el servicio y lo deja en `MQL5/Services`, diciendo dónde. Si no encuentra
ninguno (instalación en Parallels, CrossOver u otra ruta), indica el camino manual: MT5 → Archivo → Abrir carpeta de
datos → MQL5 → Services → arrastrar el `.ex5`. Después, igual que en Windows: Navegador → Servicios → Actualizar →
Añadir servicio → token. Probado en local con una estructura de carpetas simulada (paquete oficial y de bróker).

## Piezas

| Pieza | Dónde |
|---|---|
| Servicio MT5 (fuente y compilado) | `client/public/descargas/GTFX_JournalSync.mq5` / `.ex5` |
| Entrada con token y límite de peticiones | `server/src/routes/sync.js` |
| Token, validación, conversión de horas, inserción | `server/src/services/mt5Sync.js` |
| Token único del usuario | `POST` / `DELETE /api/auth/me/sync-token` (columnas `users.sync_*`) |
| Token por cuenta (avanzado) | `POST` / `DELETE /api/accounts/:id/sync-token` |
| Tarjeta de estado e instalación | `client/src/components/Mt5SyncCard.tsx` |
| Columnas | `accounts.sync_*` (el hash del token nunca sale del servidor) |

Recompilar tras cambiar el `.mq5`:
`MetaEditor64.exe /compile:"…\GTFX_JournalSync.mq5" /log` y copiar el `.ex5` a `client/public/descargas/`.

## Para un suscriptor (autoservicio)

Cada suscriptor lo activa solo, desde su cuenta y su PC; el equipo no interviene ni ve sus credenciales:

1. Se registra, crea su cuenta de fondeo en **Cuentas** (plataforma MetaTrader 5) y pone sus límites.
2. **Conectar → 3. Sincronización automática → Generar mi token único.** Un solo token para todas sus cuentas de MT5.
3. Descarga `GTFX_JournalSync.ex5` desde la misma tarjeta y sigue los 4 pasos que aparecen en pantalla.

- Varias cuentas de fondeo: nada más que hacer. Al conectarse en MT5 a otra cuenta, el journal la reconoce por su
  número o la crea (`MT5 <login>`), y el trader le pone nombre y límites en Cuentas. Un mismo servicio sirve para todas.
- Si la suscripción vence y está activado "exigir suscripción", la sincronización responde 402 y se reanuda sola al
  renovar: al volver envía todo lo pendiente.
- Quien opere desde el móvil deja el MT5 del PC abierto con la contraseña de inversor (ver «Un solo token para todo»).
  MT4/cTrader/futuros usan la importación por CSV (esas plataformas no tienen aún servicio automático).
