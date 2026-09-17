# Arquitectura de TradeJournal

Journal web para traders con limitador de riesgo. Este documento es la **fuente de verdad** compartida
entre las features: esquema de base de datos, contrato de la API y mapa de archivos.

Idioma: todo el texto visible de la UI, los mensajes de error de la API, el README y los comentarios importantes
van en **español**. Nombres de variables y código en inglés.

## Stack (fijo)

- Monorepo con **npm workspaces** (`server`, `client`). Scripts raíz: `dev` (concurrently), `seed`, `build`, `start`.
- **server/**: Express 5, ESM, JavaScript puro. Base de datos: módulo integrado **`node:sqlite`** (`DatabaseSync`).
  PROHIBIDO `better-sqlite3`, `sqlite3`, `prisma` o cualquier módulo nativo. Archivo: `server/data/journal.db`
  (o `process.env.JOURNAL_DB`). Puerto `process.env.PORT || 3200`.
  Deps: express@5, cors, jsonwebtoken, bcryptjs, multer@2, dotenv, csv-parse.
- **client/**: Vite 7 + React 19 + TypeScript + Tailwind 3.4 (`darkMode: 'class'`) + react-router-dom 7 + recharts 3 +
  zustand 5 + lucide-react + date-fns 4 + clsx + tailwind-merge. Puerto 5173 con proxy `/api` y `/uploads` → `http://localhost:3200`.
- **Auth**: JWT Bearer (`Authorization: Bearer <token>`) firmado con `JWT_SECRET` (fallback de desarrollo con aviso).
  Passwords con bcryptjs (10 rounds). Token en localStorage. `requireAuth` deja `req.user = {id, email, name}`.
- **Imágenes**: multer → `server/uploads/<userId>/<random>.<ext>` (jpg/png/webp/gif, máx 8 MB, hasta 10 por request).
  Se sirven estáticas en `/uploads` sin token (nombres aleatorios de 36 chars como protección).
- **Estilo**: tema oscuro tipo terminal: fondo `#0b0f17`, paneles `#121826`, bordes `#1f2937`, texto `#e5e7eb`,
  acento `#3b82f6`, profit `#22c55e`, loss `#ef4444`, ámbar `#f59e0b`. Números tabulares (`tnum`).
  Tailwind extiende `colors: { bg, panel, border, profit, loss, accent, warn }`.

## Esquema SQL (`server/src/db.js`, `CREATE TABLE IF NOT EXISTS`)

```sql
users(id INTEGER PK AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')))

accounts(id INTEGER PK, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
      firm TEXT DEFAULT '' /* p.ej. 'Lucid Trading' */,
      platform TEXT DEFAULT 'otro' /* 'tradovate'|'projectx'|'rithmic'|'ninjatrader'|'mt5'|'mt4'|'ctrader'|'otro' */,
      account_type TEXT DEFAULT 'evaluacion' /* 'evaluacion'|'financiada'|'personal' */,
      size REAL DEFAULT 0, currency TEXT DEFAULT 'USD', timezone TEXT DEFAULT 'America/New_York',
      day_reset_hour INTEGER DEFAULT 17 /* hora local del tz en que empieza el nuevo día de trading; futuros 17 (5pm ET); forex 0 */,
      daily_max_loss REAL DEFAULT NULL, weekly_max_loss REAL DEFAULT NULL, max_trades_per_day INTEGER DEFAULT NULL,
      lock_until TEXT DEFAULT NULL /* ISO UTC */, lock_reason TEXT DEFAULT NULL, is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))

trades(id INTEGER PK, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('long','short')), qty REAL NOT NULL DEFAULT 1,
      entry_price REAL, exit_price REAL, entry_time TEXT NOT NULL /* ISO UTC */, exit_time TEXT NOT NULL /* ISO UTC */,
      trading_day TEXT NOT NULL /* 'YYYY-MM-DD' calculado por services/tradingDay.js */,
      pnl REAL NOT NULL DEFAULT 0 /* neto, ya con comisiones restadas */, fees REAL DEFAULT 0,
      risk_amount REAL DEFAULT NULL /* $ arriesgados; r_multiple = pnl/risk_amount */,
      rating INTEGER DEFAULT NULL /* 1-5 */, notes TEXT DEFAULT '', violated_lock INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual' /* 'manual'|'import:tradovate'|... */,
      external_id TEXT DEFAULT NULL /* para deduplicar importaciones */,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))
  -- UNIQUE INDEX (account_id, external_id) WHERE external_id IS NOT NULL
  -- INDEX (user_id, trading_day), INDEX (account_id, trading_day)

trade_images(id INTEGER PK, trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      path TEXT NOT NULL /* '/uploads/<userId>/<file>' */, caption TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))

tags(id INTEGER PK, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'patron' CHECK(kind IN ('patron','error','setup','emocion')),
      color TEXT DEFAULT '#3b82f6', UNIQUE(user_id, name, kind))

trade_tags(trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE, tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(trade_id, tag_id))

daily_notes(id INTEGER PK, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL /* YYYY-MM-DD */,
      content TEXT DEFAULT '', mood TEXT DEFAULT NULL /* 'excelente'|'bien'|'neutral'|'mal'|'terrible' */, UNIQUE(user_id, date))

lock_events(id INTEGER PK, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL /* 'daily_loss'|'weekly_loss'|'max_trades'|'manual'|'unlock' */, trading_day TEXT NOT NULL,
      pnl_at_lock REAL DEFAULT 0, lock_until TEXT, message TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))
```

`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`

`db.js` exporta `getDb()` (singleton, respeta `JOURNAL_DB`), `getDbPath()`, `closeDb()` y `SCHEMA_SQL`.

## Día de trading (`server/src/services/tradingDay.js`)

Implementado y probado (`node scripts/test-tradingDay.js`, 22 pruebas).

- `tradingDayFor(isoUtc, { timezone='America/New_York', day_reset_hour=17 })` → `'YYYY-MM-DD'`. Convierte el instante al tz
  con `Intl.DateTimeFormat`; si la hora local ≥ `day_reset_hour`, devuelve la fecha local + 1 día. Ej.: domingo 18:00 ET con reset 17 ⇒ lunes.
- `currentTradingDay(account)` → `tradingDayFor(new Date(), account)`.
- `nextResetIso(account, now?)` → ISO UTC del próximo instante en que cambia el día de trading (para `lock_until` diario).
- `weekOf(tradingDay)` → `{ start (lunes), end (domingo), key: 'YYYY-Www' }`.
- `nextWeekResetIso(account, now?)` → ISO UTC del primer reset del próximo lunes.
- Extras: `tradingDayStartIso(tradingDay, account)`, `addDays(ymd, n)`, `weekdayOf(ymd)`, `isoWeekKey(ymd)`, `localParts(date, tz)`, `zonedTimeToUtc(parts, tz)`.

## Contrato API

Todas bajo `/api`, JSON. Errores ⇒ status 4xx/5xx con `{ error: 'mensaje en español' }`. Todas salvo `/auth/*` requieren Bearer
(el middleware `requireAuth` ya está aplicado en `index.js` al montar cada router).

### Auth (scaffold, listo)
- `POST /auth/register {email,password,name}` → `{token,user}` (201). 409 si el email existe.
- `POST /auth/login {email,password}` → `{token,user}`. 401 si es incorrecto.
- `GET /auth/me` → `{user}`.
- `GET /health` → `{ok:true}` (público).

### Cuentas (feature A) — `routes/accounts.js`, `services/risk.js`
- `GET /accounts` → `[{...account, status}]`
- `POST /accounts {name, firm, platform, account_type, size, currency, timezone, day_reset_hour, daily_max_loss, weekly_max_loss, max_trades_per_day}`
- `GET/PUT/DELETE /accounts/:id`
- `PUT /accounts/:id/risk {daily_max_loss, weekly_max_loss, max_trades_per_day}`
- `POST /accounts/:id/lock {hours?:number, until?:ISO, reason?}` (bloqueo manual; sin hours/until ⇒ hasta próximo reset diario)
- `POST /accounts/:id/unlock`
- `GET /accounts/:id/status` → `{ locked, lock_until, lock_reason, trading_day, today_pnl, today_trades, week_pnl, week_trades, remaining_daily (null si sin límite), remaining_weekly, remaining_trades, daily_used_pct, weekly_used_pct, events:[últimos 20 lock_events] }`
- `GET /accounts/:id/events`

`services/risk.js`: `evaluateAccountRisk(db, accountId)` → status (misma forma que `/status`). Si `today_pnl <= -daily_max_loss`
(y `daily_max_loss > 0`) ⇒ `lock_until = nextResetIso`, `lock_reason 'daily_loss'`, inserta `lock_event` (si no hay ya uno activo del
mismo tipo para ese `trading_day`). Igual weekly (lock hasta `nextWeekResetIso`) y `max_trades` (`today_trades >= max_trades_per_day`).
Nunca reduce un `lock_until` existente más lejano. `isLocked(account, now=new Date())` → boolean.
**La ruta de trades (feature B) DEBE llamar `evaluateAccountRisk(db, account_id)` tras crear/editar/borrar/importar un trade y devolver el status en la respuesta como `{ trade, status }`.**

### Operaciones (feature B) — `routes/trades.js`
- `GET /trades?account_id&from&to&symbol&tag_id&side&page&limit(50)` → `{ items:[{...trade, tags:[{id,name,kind,color}], images:[{id,path,caption}], r_multiple}], total }`
- `POST /trades {account_id, symbol, side, qty, entry_price, exit_price, entry_time, exit_time, pnl, fees, risk_amount, rating, notes, tag_ids:[], force?:boolean}` → `{ trade, status }`.
  Si la cuenta está bloqueada y `!force` ⇒ **423** `{ error, locked:true, status }`; con `force` ⇒ crea con `violated_lock=1`.
- `GET/PUT/DELETE /trades/:id`
- `POST /trades/:id/images` (multipart, campo `images`, + campo opcional `captions` JSON) → `{ images }`
- `DELETE /trades/:id/images/:imageId`
- `GET /trades/symbols` → `['MNQ','NQ',...]` (distintos del usuario)

### Tags (feature B) — `routes/tags.js`
- `GET /tags` → `[]` ; `POST /tags {name, kind, color}` ; `PUT /tags/:id` ; `DELETE /tags/:id`

### Diario (feature B) — `routes/notes.js`
- `GET /notes?from&to` → `[{date, content, mood}]` ; `GET /notes/:date` → `{date, content, mood}` (o vacío) ; `PUT /notes/:date {content, mood}`

### Estadísticas (feature C) — `routes/stats.js`
Todos aceptan `?account_id` (opcional; sin él = todas las cuentas del usuario) y `?from&to` (trading_day).
- `GET /stats/summary` → `{ today:{pnl,trades,wins,losses}, week:{...}, month:{...}, period:{ pnl, trades, wins, losses, breakeven, win_rate, profit_factor, avg_win, avg_loss, expectancy, avg_r, best_day:{date,pnl}, worst_day:{date,pnl}, max_drawdown, current_streak:{kind:'win'|'loss', n}, gross_profit, gross_loss, total_fees } }`
- `GET /stats/calendar?month=YYYY-MM` → `{ days:[{date, pnl, trades, wins, losses}], weeks:[{week_key, start, end, pnl, trades}], month:{pnl, trades} }`
- `GET /stats/daily` → `[{date, pnl, trades, cum_pnl}]`
- `GET /stats/weekly` → `[{week_key, start, end, pnl, trades, wins, losses}]`
- `GET /stats/monthly` → `[{month:'YYYY-MM', pnl, trades, wins, losses}]`
- `GET /stats/by-tag` → `[{tag_id,name,kind,color,trades,pnl,win_rate}]`
- `GET /stats/by-symbol`
- `GET /stats/by-weekday` → `[{weekday:0..6, label, pnl, trades, win_rate}]`
- `GET /stats/by-hour` → `[{hour, pnl, trades}]` (hora local del tz de la cuenta o America/New_York)

"today/week/month" se calculan con el trading_day actual de la cuenta (si hay `account_id`) o de America/New_York con reset 17.

### Importación (feature D) — `routes/import.js`
- `POST /import/preview` (multipart campo `file` CSV, + `account_id`) → `{ source_detected:'tradovate'|'projectx'|'ninjatrader'|'mt5'|'rithmic'|'generic', columns:[...], sample:[primeras 5 filas], suggested_mapping:{symbol, side, qty, entry_price, exit_price, entry_time, exit_time, pnl, fees, external_id}, total_rows }`
- `POST /import/commit {account_id, source, mapping, rows? (o re-subir file), timezone_of_file?}` → `{ imported, skipped_duplicates, errors:[{row, error}], status }`
  (dedupe por `external_id`; si no hay, hash de symbol+entry_time+exit_time+qty+pnl). Tradovate "Performance" trae round-trips;
  para fills/orders hay que emparejar entradas y salidas FIFO por símbolo.

## Cliente

### Rutas (react-router 7, `src/App.tsx`)
`/login`, `/registro` (públicas; redirigen a `/` si ya hay sesión). Con `Layout` protegido (redirige a `/login` sin token):
`/` (Dashboard, C), `/operaciones` (lista, B), `/operaciones/nueva` (form, B), `/operaciones/:id` (detalle+edición+imágenes, B),
`/cuentas` (A), `/diario` (B), `/importar` (D).

### Utilidades del scaffold
- `src/lib/api.ts`: `api<T>(path, { method, body, formData, signal })` — añade el Bearer, lanza `ApiError` (con `.status`) con el
  mensaje en español del backend; en 401 limpia sesión y redirige a `/login`. `qs(params)` para query strings. Acepta `'/accounts'` o `'/api/accounts'`.
- `src/lib/format.ts`: `fmtMoney(n, currency='USD', {sign})`, `fmtNum`, `fmtPct`, `fmtR`, `pnlClass(n)` (`'text-profit'|'text-loss'|'text-gray-400'`),
  `fmtDate`, `fmtDateTime`, `fmtTime`, `toDatetimeLocal`, `fromDatetimeLocal`, `todayYmd` (español, `date-fns/locale/es`).
- `src/lib/cn.ts`: `cn(...)` (clsx + tailwind-merge).
- `src/store/session.ts` (zustand + persist): `{ token, user, accountId (null=todas), accounts, setSession, logout, setAccountId, setAccounts }`
  + tipos `User`, `Account`, `AccountStatus`, `LockEvent`, `Platform`, `AccountType` + hook `useSelectedAccount()`.
- `src/components/ui/`: `Button` (variants primary/secondary/ghost/danger/success/warn, `loading`), `Card` + `StatCard`,
  `Input` + `Textarea` + `FieldWrapper`, `Select` (options o children), `Badge` + `SideBadge`, `Modal` + `ConfirmModal`,
  `Spinner` + `PageSpinner`, `EmptyState`. Barrel en `ui/index.ts`. **Los features DEBEN reutilizarlos.**
- `src/components/Layout.tsx`: sidebar (logo "TradeJournal", nav Dashboard/Operaciones/Cuentas/Diario/Importar) + header con
  selector de cuenta global (carga `GET /api/accounts` al montar y guarda en el store) + `<LockBanner accountId={accountId}/>` bajo el header.
- `src/components/LockBanner.tsx`: STUB (feature A) — `default export ({ accountId: number | null }) => null`.

## Mapa de archivos por feature

| Feature | Servidor | Cliente |
|---|---|---|
| Scaffold (listo) | `src/index.js`, `src/db.js`, `src/auth.js`, `src/upload.js`, `src/services/tradingDay.js`, `src/routes/auth.js`, `scripts/test-tradingDay.js` | `App.tsx`, `main.tsx`, `index.css`, `lib/*`, `store/session.ts`, `components/ui/*`, `components/Layout.tsx`, `pages/Login.tsx`, `pages/Register.tsx` |
| A — Cuentas y riesgo | `src/routes/accounts.js`, `src/services/risk.js` | `pages/Accounts.tsx`, `components/LockBanner.tsx` |
| B — Operaciones, tags, diario | `src/routes/trades.js`, `src/routes/tags.js`, `src/routes/notes.js` | `pages/Trades.tsx`, `pages/TradeForm.tsx`, `pages/TradeDetail.tsx`, `pages/Notes.tsx` |
| C — Estadísticas / Dashboard | `src/routes/stats.js` | `pages/Dashboard.tsx` |
| D — Importación | `src/routes/import.js` | `pages/Import.tsx` |
| Seed | `scripts/seed.js` (usuario demo `demo@journal.com` / `demo1234` + datos) | — |

Los stubs actuales de rutas responden `GET /` → `{ todo: true }`; las páginas stub muestran un `EmptyState` "En construcción".

## Reglas de trabajo

- Solo edita los archivos asignados a tu feature; para lo demás usa el contrato de arriba. No toques `package.json` ni instales dependencias.
- No ejecutes `npm run dev`, `vite build` ni `npm install` mientras otros agentes trabajan. Para probar el servidor:
  `PORT=32xx JOURNAL_DB=/c/.../server/data/test-<nombre>.db node src/index.js` en background, curl, y matar el proceso.
  Cliente: `npx tsc --noEmit -p tsconfig.app.json` desde `client/` sin errores en tus archivos.
- Validación de entrada, mensajes de error en español, **filtrar SIEMPRE por `user_id`**, números con 2 decimales en UI.

## Seguridad (actualizado 2026-09-10)

- **Sesión**: JWT (7 días, HS256, issuer `trading-journal`) enviado en una cookie `tj_session` **httpOnly, SameSite=Lax** (Secure en producción). El cliente web ya no guarda el token en localStorage. Scripts y herramientas pueden seguir usando `Authorization: Bearer <token>` (el token también se devuelve en el JSON de login/registro).
- **CSRF**: cookie SameSite=Lax + comprobación del header `Origin` en toda petición que modifica datos (`POST/PUT/PATCH/DELETE` bajo `/api`): solo el propio host, `http://localhost:5173` en desarrollo y los orígenes de `CORS_ORIGIN`.
- **Cabeceras**: `helmet` con CSP (`script-src 'self'`, `img-src 'self' data: blob:`), `frame-ancestors 'none'`, `Referrer-Policy`.
- **Rate limiting**: 30 intentos / 15 min por IP en `/api/auth/*`; 900 peticiones / 15 min por IP en `/api`. Se desactiva con `NODE_ENV=test` (pruebas).
- **Contraseñas**: bcrypt (12 rondas); mínimo 8 caracteres con al menos una letra y un número.
- **Imágenes privadas**: `/uploads/<userId>/<archivo>` exige sesión y que `<userId>` sea el usuario autenticado; el nombre debe ser hexadecimal aleatorio. Al borrar una operación o imagen, el archivo se elimina del disco con reintentos (Windows puede mantenerlo abierto unos ms).
- **Secreto JWT**: `JWT_SECRET` en `.env` (≥ 32 caracteres). En producción el servidor no arranca sin él.
- **Cuerpo de peticiones**: JSON máximo 1 MB; CSV de importación 5 MB; imágenes 8 MB (10 por envío).
- **Pruebas**: `npm run smoke` levanta un servidor temporal con DB propia y ejecuta 26 pruebas end-to-end (auth, cuentas, bloqueo, operaciones, imágenes, diario, estadísticas, importación, aislamiento entre usuarios).
