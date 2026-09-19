// Conexión a SQLite mediante el módulo integrado node:sqlite (sin módulos nativos).
// getDb() devuelve un singleton; respeta process.env.JOURNAL_DB para la ruta del archivo.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '..', 'data', 'journal.db');

let db = null;

export function getDbPath() {
  const custom = process.env.JOURNAL_DB;
  if (!custom) return DEFAULT_DB_PATH;
  return path.isAbsolute(custom) ? custom : path.resolve(process.cwd(), custom);
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  firm TEXT DEFAULT '',
  platform TEXT DEFAULT 'otro',
  account_type TEXT DEFAULT 'evaluacion',
  size REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  timezone TEXT DEFAULT 'America/New_York',
  day_reset_hour INTEGER DEFAULT 17,
  daily_max_loss REAL DEFAULT NULL,
  weekly_max_loss REAL DEFAULT NULL,
  max_trades_per_day INTEGER DEFAULT NULL,
  lock_until TEXT DEFAULT NULL,
  lock_reason TEXT DEFAULT NULL,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('long','short')),
  qty REAL NOT NULL DEFAULT 1,
  entry_price REAL,
  exit_price REAL,
  entry_time TEXT NOT NULL,
  exit_time TEXT NOT NULL,
  trading_day TEXT NOT NULL,
  pnl REAL NOT NULL DEFAULT 0,
  fees REAL DEFAULT 0,
  risk_amount REAL DEFAULT NULL,
  rating INTEGER DEFAULT NULL,
  notes TEXT DEFAULT '',
  violated_lock INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',
  external_id TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_external ON trades(account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_user_day ON trades(user_id, trading_day);
CREATE INDEX IF NOT EXISTS idx_trades_account_day ON trades(account_id, trading_day);

CREATE TABLE IF NOT EXISTS trade_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_images_trade ON trade_images(trade_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'patron' CHECK(kind IN ('patron','error','setup','emocion')),
  color TEXT DEFAULT '#3b82f6',
  UNIQUE(user_id, name, kind)
);

CREATE TABLE IF NOT EXISTS trade_tags (
  trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(trade_id, tag_id)
);

CREATE TABLE IF NOT EXISTS daily_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  content TEXT DEFAULT '',
  mood TEXT DEFAULT NULL,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS lock_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  trading_day TEXT NOT NULL,
  pnl_at_lock REAL DEFAULT 0,
  lock_until TEXT,
  message TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lock_events_account ON lock_events(account_id, created_at);

-- Radar de divisas (docs/RADAR.md)
CREATE TABLE IF NOT EXISTS radar_series (
  source TEXT NOT NULL,
  series_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL,
  PRIMARY KEY(source, series_id, date)
);

CREATE TABLE IF NOT EXISTS radar_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS radar_calendar (
  id TEXT PRIMARY KEY,
  title TEXT,
  country TEXT,
  at_utc TEXT,
  impact TEXT,
  forecast TEXT,
  previous TEXT,
  actual TEXT,
  fetched_at TEXT,
  actual_inferred INTEGER DEFAULT 0,
  category TEXT
);
CREATE INDEX IF NOT EXISTS idx_radar_calendar_country_at ON radar_calendar(country, at_utc);

CREATE TABLE IF NOT EXISTS radar_cot (
  report_date TEXT,
  currency TEXT,
  open_interest INTEGER,
  lev_long INTEGER,
  lev_short INTEGER,
  asset_long INTEGER,
  asset_short INTEGER,
  PRIMARY KEY(report_date, currency)
);

CREATE TABLE IF NOT EXISTS radar_policy (
  currency TEXT PRIMARY KEY,
  rate REAL,
  source TEXT,
  effective_date TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS radar_manual (
  currency TEXT PRIMARY KEY,
  cb_tone INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS radar_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_radar_snapshots_created ON radar_snapshots(created_at);

-- Radar v2 (docs/RADAR-v2.md): expectativas de tipos, notas semanales y noticias
CREATE TABLE IF NOT EXISTS radar_expectations (
  currency TEXT PRIMARY KEY,
  meeting_date TEXT,
  prob_hike REAL,
  prob_cut REAL,
  prob_hold REAL,
  expected_bp INTEGER,
  source TEXT,
  note TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS radar_notes (
  week_key TEXT PRIMARY KEY,
  content TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS radar_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TEXT,
  PRIMARY KEY(user_id, symbol)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'prueba',
  status TEXT NOT NULL DEFAULT 'prueba',
  price REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  started_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  auto_renew INTEGER DEFAULT 0,
  provider TEXT DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  notes TEXT DEFAULT '',
  canceled_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS subscription_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  paid_at TEXT NOT NULL,
  method TEXT DEFAULT 'manual',
  reference TEXT DEFAULT '',
  plan TEXT,
  period_start TEXT,
  period_end TEXT,
  note TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_payments_user ON subscription_payments(user_id, paid_at);
CREATE TABLE IF NOT EXISTS subscription_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER,
  kind TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_events_user ON subscription_events(user_id, id);
CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  name TEXT,
  subject TEXT,
  body TEXT,
  days_before INTEGER,
  enabled INTEGER DEFAULT 1,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT,
  template_key TEXT,
  subject TEXT,
  body TEXT,
  status TEXT,
  error TEXT,
  period_end TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id, template_key, period_end);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS account_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  gross_amount REAL,
  fee_amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  occurred_at TEXT NOT NULL,
  recurring INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_account_tx_user_date ON account_transactions(user_id, occurred_at);
CREATE TABLE IF NOT EXISTS radar_daily_bias (
  date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  diff REAL,
  regime TEXT,
  PRIMARY KEY(date, symbol)
);

CREATE TABLE IF NOT EXISTS radar_news (
  id TEXT PRIMARY KEY,
  title TEXT,
  link TEXT,
  source TEXT,
  published_at TEXT,
  tags TEXT,
  urgency INTEGER,
  fetched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_radar_news_published ON radar_news(published_at);
CREATE INDEX IF NOT EXISTS idx_radar_calendar_at ON radar_calendar(at_utc);
`;

/**
 * Migraciones idempotentes: columnas añadidas después del esquema inicial.
 * Los nombres de tabla/columna son constantes del código (nunca entrada del usuario).
 */
const COLUMN_MIGRATIONS = [
  { table: 'users', column: 'role', ddl: "TEXT DEFAULT 'user'" },
  { table: 'users', column: 'is_disabled', ddl: 'INTEGER DEFAULT 0' },
  { table: 'users', column: 'last_login_at', ddl: 'TEXT' },
  { table: 'accounts', column: 'outcome', ddl: "TEXT DEFAULT 'activa'" },
  { table: 'accounts', column: 'purchased_at', ddl: 'TEXT' },
  { table: 'accounts', column: 'funded_at', ddl: 'TEXT' },
  { table: 'accounts', column: 'ended_at', ddl: 'TEXT' },
  { table: 'accounts', column: 'profit_split', ddl: 'REAL' },
  { table: 'trades', column: 'bias_diff', ddl: 'REAL' },
  { table: 'trades', column: 'bias_alignment', ddl: 'TEXT' },
  { table: 'radar_calendar', column: 'actual_inferred', ddl: 'INTEGER DEFAULT 0' },
  { table: 'radar_calendar', column: 'category', ddl: 'TEXT' },
  { table: 'radar_news', column: 'fetched_at', ddl: 'TEXT' },
];

function applyColumnMigrations(conn) {
  for (const m of COLUMN_MIGRATIONS) {
    const cols = conn.prepare(`PRAGMA table_info(${m.table})`).all().map((c) => c.name);
    if (!cols.includes(m.column)) conn.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.ddl}`);
  }
}

/**
 * Devuelve la conexión singleton a la base de datos, creándola (y el esquema) si hace falta.
 * @returns {DatabaseSync}
 */
export function getDb() {
  if (db) return db;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  applyColumnMigrations(db);
  return db;
}

/** Cierra la conexión (útil en tests/scripts). */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
