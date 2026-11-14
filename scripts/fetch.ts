#!/usr/bin/env bun
/**
 * Fetch IMDb's popularity-ranked titles through the public GraphQL endpoint and write
 * data/titles.json. Runs on a normal or CI IP, never from a Worker or the browser.
 *
 *   bun scripts/fetch.ts                 # the default limit
 *   bun scripts/fetch.ts --limit 200     # smaller, for development
 *
 * Fails loudly and leaves the existing data untouched if anything looks wrong.
 */
import { renameSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';
import { TYPES, type Row } from '../src/types.ts';
import { toFile, toRow, validate } from './normalize.ts';
import { addTmdbIds } from './tmdb.ts';

const HOSTS = ['https://caching.graphql.imdb.com/', 'https://api.graphql.imdb.com/'];
const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const LIMIT = arg('limit', 5000);
const MIN_COUNT = process.argv.includes('--limit') ? 1 : arg('min-count', 4800);
let pageSize = Math.min(arg('page-size', 500), LIMIT);

const QUERY = `
query Search($first: Int!, $after: String) {
  advancedTitleSearch(
    first: $first, after: $after,
    sort: { sortBy: POPULARITY, sortOrder: ASC },
    constraints: {
      titleTypeConstraint: { anyTitleTypeIds: ${JSON.stringify(TYPES)} }
      userRatingsConstraint: { ratingsCountRange: { min: 5000 } }
      explicitContentConstraint: { explicitContentFilter: INCLUDE_ADULT }
    }
  ) {
    total
    pageInfo { hasNextPage endCursor }
    edges { node { title {
      id
      titleText { text }
      originalTitleText { text }
      releaseDate { year month day }
      releaseYear { year endYear }
      ratingsSummary { aggregateRating voteCount }
      titleType { id }
      runtime { seconds }
      genres { genres { text } }
      certificate { rating }
      countriesOfOrigin { countries { text } }
      spokenLanguages { spokenLanguages { text } }
      primaryImage { url }
      metacritic { metascore { score } }
      plot { plotText { plainText } }
      principalCredits { category { id } credits { name { nameText { text } } } }
      cast: credits(first: 4, filter: { categories: ["cast"] }) {
        edges { node { name { nameText { text } } ... on Cast { characters { name } } } }
      }
      meterRanking { rankChange { changeDirection difference } }
      keywords(first: 4) { edges { node { keyword { text { text } } } } }
      awardWins: awardNominations(first: 1, filter: { wins: WINS_ONLY }) { total }
      awardNoms: awardNominations(first: 1) { total }
      moreLike: moreLikeThisTitles(first: 6) { edges { node { id } } }
      gross: lifetimeGross(boxOfficeArea: WORLDWIDE) { total { amount currency } }
      budget: productionBudget { budget { amount currency } }
      video: primaryVideos(first: 1) { edges { node { id } } }
      episodes { episodes(first: 1) { total } displayableSeasons(first: 1) { total } }
    } } }
  }
}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(first: number, after: string | null) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const host = HOSTS[attempt % HOSTS.length]!;
    try {
      const res = await fetch(host, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-imdb-client-name': 'imdb-web-next-localized' },
        body: JSON.stringify({ query: QUERY, variables: { first, after } }),
      });
      if (!res.ok) throw new Error(`${host} -> HTTP ${res.status}`);
      const json: any = await res.json();
      if (json.errors?.length) throw new Error(json.errors[0].message);
      return json.data.advancedTitleSearch;
    } catch (e) {
      lastErr = e;
      if (String(e).includes('Too much data') && pageSize > 50) {
        pageSize = Math.floor(pageSize / 2);
        first = pageSize;
        console.warn(`page too large, retrying with ${pageSize}`);
      }
      console.warn(`attempt ${attempt + 1} failed: ${e}`);
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`giving up: ${lastErr}`);
}

const rows: Row[] = [];
let total = 0;
let after: string | null = null;
while (rows.length < LIMIT) {
  const res = await page(Math.min(pageSize, LIMIT - rows.length), after);
  total = res.total;
  for (const edge of res.edges) {
    const row = toRow(edge.node.title);
    if (row) rows.push(row);
  }
  console.log(`${rows.length}/${LIMIT} titles`);
  if (!res.pageInfo.hasNextPage) break;
  after = res.pageInfo.endCursor;
  await sleep(500);
}

const out = new URL('../data/titles.json', import.meta.url).pathname;
// TMDB ids come from Wikidata; ones it does not know keep the value from the last file
const previous = new Map<string, number>();
try {
  const old = await Bun.file(out).json();
  old.id.forEach((id: string, i: number) => old.tm?.[i] && previous.set(id, old.tm[i]));
} catch {}
await addTmdbIds(rows, previous);

const file = toFile(rows.slice(0, LIMIT), total, new Date().toISOString());
validate(file, MIN_COUNT);

const json = JSON.stringify(file);
await Bun.write(out + '.tmp', json);
renameSync(out + '.tmp', out);

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const br = brotliCompressSync(json).length;
console.log(`wrote ${file.id.length} titles (total ${total}): ${kb(json.length)} raw, ${kb(br)} brotli`);
console.log(`first: ${file.id[0]} ${file.t[0]}`);
if (br > 1000 * 1024) console.warn('WARNING: over the 1 MB brotli budget');
