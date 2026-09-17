// Noticias de mercado (RSS de ForexLive y FXStreet): etiquetas por activo y urgencia 1-10.
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { NEWS_CURRENCY_KEYWORDS, NEWS_ASSET_KEYWORDS, NEWS_URGENT_KEYWORDS, NEWS_MEDIUM_KEYWORDS, NEWS_RETENTION_DAYS } from '../constants.js';
import { fetchText } from './http.js';

const FEEDS = [
  { source: 'ForexLive', url: 'https://www.forexlive.com/feed/news' },
  { source: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
];

const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata', textNodeName: '__text' });

function text(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if (v.__cdata !== undefined) return text(v.__cdata);
    if (v.__text !== undefined) return text(v.__text);
    if (v['@_href']) return String(v['@_href']);
  }
  return '';
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&#x2018;|&#x2019;/g, "'")
    .replace(/&#x201c;|&#x201d;/gi, '"')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Etiquetas del titular: divisas, bancos y activos, con dirección si el titular la sugiere. */
export function tagsFor(title) {
  const t = ` ${title.toLowerCase()} `;
  const tags = [];
  const up = /\b(rises?|jumps?|surges?|climbs?|gains?|rallies|rally|higher|soars?|strengthens?|boost)\b/.test(t);
  const down = /\b(falls?|drops?|slides?|plunges?|sinks?|tumbles?|lower|weakens?|slumps?|dips?|declines?)\b/.test(t);
  const arrow = up && !down ? ' ↑' : down && !up ? ' ↓' : '';
  for (const [code, words] of NEWS_CURRENCY_KEYWORDS) if (words.some((w) => t.includes(w))) tags.push(code + arrow);
  for (const [code, words] of NEWS_ASSET_KEYWORDS) if (words.some((w) => t.includes(w))) tags.push(code + arrow);
  return [...new Set(tags)].slice(0, 6);
}

export function urgencyFor(title) {
  const t = title.toLowerCase();
  if (NEWS_URGENT_KEYWORDS.some((w) => t.includes(w))) return /\b(war|attack|emergency|missile|explosion|intervention)\b/.test(t) ? 9 : 8;
  if (NEWS_MEDIUM_KEYWORDS.some((w) => t.includes(w))) return /\b(cpi|payrolls|nfp|fomc|decision)\b/.test(t) ? 7 : 5;
  return 3;
}

function parseFeed(xml, source) {
  const doc = parser.parse(xml);
  const channel = doc && doc.rss && doc.rss.channel;
  let items = channel ? channel.item : doc && doc.feed ? doc.feed.entry : null;
  if (!items) return [];
  if (!Array.isArray(items)) items = [items];
  const out = [];
  for (const it of items) {
    const title = decode(text(it.title));
    const link = decode(text(it.link)) || decode(text(it.guid));
    const pub = text(it.pubDate) || text(it.published) || text(it.updated);
    const d = new Date(pub);
    if (!title || Number.isNaN(d.getTime())) continue;
    out.push({ id: createHash('sha1').update(link || `${source}|${title}`).digest('hex'), title, link, source, published_at: d.toISOString() });
  }
  return out;
}

export async function refreshNews(db, { now = new Date() } = {}) {
  const up = db.prepare(
    `INSERT OR IGNORE INTO radar_news (id, title, link, source, published_at, tags, urgency, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  let okFeeds = 0;
  let error = null;
  for (const f of FEEDS) {
    try {
      const xml = await fetchText(f.url, { label: f.source, accept: 'application/rss+xml, application/xml, text/xml, */*' });
      const items = parseFeed(xml, f.source);
      db.exec('BEGIN');
      try {
        for (const it of items) {
          const info = up.run(it.id, it.title, it.link, it.source, it.published_at, JSON.stringify(tagsFor(it.title)), urgencyFor(it.title), now.toISOString());
          if (info.changes) added++;
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      okFeeds++;
    } catch (e) {
      error = e.message;
    }
  }
  const cutoff = new Date(now.getTime() - NEWS_RETENTION_DAYS * 86400000).toISOString();
  db.prepare('DELETE FROM radar_news WHERE published_at < ?').run(cutoff);
  const count = db.prepare('SELECT COUNT(*) AS n FROM radar_news').get().n;
  return { ok: okFeeds > 0, added, count, error: okFeeds === FEEDS.length ? null : error };
}

export function listNews(db, { limit = 40, minUrgency = 0 } = {}) {
  const rows = db.prepare('SELECT * FROM radar_news WHERE urgency >= ? ORDER BY published_at DESC LIMIT ?').all(minUrgency, limit);
  return rows.map((r) => ({ id: r.id, title: r.title, link: r.link, source: r.source, published_at: r.published_at, tags: safeTags(r.tags), urgency: r.urgency }));
}

function safeTags(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
