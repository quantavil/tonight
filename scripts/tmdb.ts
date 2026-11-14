/**
 * TMDB ids for IMDb titles, from Wikidata (properties P345 IMDb id, P4983 TMDB TV id, P4947 TMDB movie id).
 * No API key and no TMDB account: one SPARQL query per few hundred ids. Coverage is about 99.5%; the rest stay 0.
 */
import type { Row } from '../src/types.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const CHUNK = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lookup(ids: string[], prop: 'P4983' | 'P4947'): Promise<Map<string, number>> {
  const query = `SELECT ?imdb ?tm WHERE { VALUES ?imdb { ${ids.map((i) => `"${i}"`).join(' ')} } ?i wdt:P345 ?imdb . ?i wdt:${prop} ?tm }`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/sparql-results+json',
          'user-agent': 'cinedb-fetch/1.0 (personal project)',
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      const out = new Map<string, number>();
      for (const b of json.results.bindings) {
        const tm = Number(b.tm.value);
        const prev = out.get(b.imdb.value);
        // a title can carry several ids; the lowest is the original entry
        if (Number.isInteger(tm) && tm > 0 && (!prev || tm < prev)) out.set(b.imdb.value, tm);
      }
      return out;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`wikidata: ${lastErr}`);
}

/**
 * Sets `tmdb` on every row. An id that Wikidata does not return, or a chunk that fails, keeps the value it had
 * in `previous` (id -> tmdb from the last data file), so an outage never loses ids and never blocks a refresh.
 */
export async function addTmdbIds(rows: Row[], previous: Map<string, number>): Promise<void> {
  const found = new Map<string, number>();
  // a time budget for the whole stage, so slow Wikidata responses cannot push the 5-minute CI job over its limit
  const deadline = Date.now() + 90_000;
  let skipped = 0;
  for (const [prop, isSeries] of [
    ['P4983', true],
    ['P4947', false],
  ] as const) {
    const ids = rows.filter((r) => (r.type === 'tvSeries' || r.type === 'tvMiniSeries') === isSeries).map((r) => r.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      if (Date.now() > deadline) {
        skipped += part.length;
        continue;
      }
      try {
        for (const [k, v] of await lookup(part, prop)) found.set(k, v);
      } catch (e) {
        console.warn(`${e}; keeping previous ids for ${part.length} titles`);
      }
      await sleep(500);
    }
  }
  if (skipped) console.warn(`tmdb: 90s time budget ran out; keeping previous ids for ${skipped} titles`);
  for (const r of rows) r.tmdb = found.get(r.id) ?? previous.get(r.id) ?? 0;
  const n = rows.filter((r) => r.tmdb).length;
  console.log(`tmdb ids: ${n}/${rows.length} (${found.size} from wikidata)`);
}
