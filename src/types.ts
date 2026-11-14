import * as v from 'valibot';

export const TYPES = ['movie', 'tvSeries', 'tvMovie', 'tvMiniSeries'] as const;
type TitleType = (typeof TYPES)[number];

export const IMG = 'https://m.media-amazon.com/images/M/';

const int = (min = 0, max = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const ints = (min?: number, max?: number) => v.array(int(min, max));
const strs = v.array(v.string());
/** One list per title: dictionary indexes, names, or ids. */
const lists = <T extends v.GenericSchema>(item: T) => v.array(v.array(item));

/** Columns that are dictionaries; every other array has one entry per title. */
const DICTIONARIES = new Set(['genres', 'certs', 'langs', 'countries']);

/**
 * data/titles.json: columnar. Index i is IMDb popularity rank i+1.
 * NEVER reorder. Every per-title column has the same length (checked below).
 * This schema is the contract: scripts/ validates against it before writing, src/ reads its type.
 */
export const TitlesSchema = v.pipe(
  v.object({
    generated: v.string(), // ISO time of fetch
    total: int(), // IMDb match count, larger than count when capped
    // Dictionaries. Genres and certificates: bit b of g[i] / ce[i] set => entry b (max 31). Languages and
    // countries: indexes in l[i] / c[i]; ordered by how many titles use them.
    genres: v.pipe(strs, v.maxLength(31)),
    certs: v.pipe(strs, v.maxLength(31)),
    langs: strs,
    countries: strs,

    id: v.array(v.pipe(v.string(), v.regex(/^tt\d{7,}$/))),
    t: v.array(v.pipe(v.string(), v.minLength(1))), // title (falls back to original title)
    o: strs, // original title, "" when same as t
    d: ints(0, 99999999), // release date YYYYMMDD; month and day 0 when only the year is known; 0 unknown
    e: ints(), // end year (series), 0 none
    k: ints(0, TYPES.length - 1), // index into TYPES
    // No rating floor upstream: 1.0 (10) is the lowest real rating. 0 means unrated, which is rejected loudly.
    r: ints(10, 100), // rating x10 (83 = 8.3)
    n: ints(5000), // vote count
    m: ints(), // runtime minutes, 0 unknown
    s: ints(0, 100), // metascore, 0 none
    g: ints(0, 2 ** 31 - 1), // genre bitmask
    ce: ints(0, 2 ** 31 - 1), // certificate bitmask (US), 0 none
    l: lists(int()), // spoken languages, indexes into langs
    c: lists(int()), // countries of origin, indexes into countries
    p: strs, // poster key between "/M/" and "._V1_", full URL if the pattern differs, "" none
    plot: strs,
    dir: lists(v.string()), // directors, or creators for series (max 3)
    cast: lists(v.string()), // billing order (max 4)
    chars: lists(v.string()), // character names, same order as cast, "" when unknown
    kw: lists(v.string()), // top keywords (max 4)
    rc: v.array(v.pipe(v.number(), v.integer())), // popularity rank change since last week, + is up
    w: ints(), // award wins
    nm: ints(), // award nominations
    sim: lists(int()), // "more like this", indexes into this file, only titles that are in it
    gr: ints(), // worldwide gross, USD thousands, 0 unknown
    bu: ints(), // production budget, USD thousands, 0 unknown
    tr: ints(), // trailer: number part of IMDb's "vi…" video id, 0 none
    se: ints(), // seasons (series), 0 none
    ep: ints(), // episodes (series), 0 none
    tm: ints(), // TMDB id: a TV id for series, a movie id otherwise; 0 unknown
  }),
  v.check(
    (f) =>
      Object.entries(f).every(([k, col]) => !Array.isArray(col) || DICTIONARIES.has(k) || col.length === f.id.length),
    'column lengths differ',
  ),
  v.check((f) => new Set(f.id).size === f.id.length, 'duplicate ids'),
);
export type TitlesFile = v.InferOutput<typeof TitlesSchema>;

/** One title as returned by the GraphQL query, after unwrapping nullable wrappers. */
export interface Row {
  id: string;
  title: string;
  orig: string;
  date: number; // YYYYMMDD
  end: number;
  type: TitleType;
  rating: number; // x10
  votes: number;
  mins: number;
  meta: number;
  genres: string[];
  cert: string;
  langs: string[];
  countries: string[];
  poster: string;
  plot: string;
  dir: string[];
  cast: string[];
  chars: string[];
  kw: string[];
  rankChange: number;
  wins: number;
  noms: number;
  sim: string[]; // ids
  gross: number; // USD thousands
  budget: number; // USD thousands
  trailer: number;
  seasons: number;
  episodes: number;
  tmdb: number; // TMDB id (TV for series, movie otherwise), 0 unknown; filled in by scripts/tmdb.ts
}
