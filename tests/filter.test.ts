import { describe, expect, it } from 'vite-plus/test';
import { decode } from '../src/data.ts';
import { DEFAULT, countWith, domains, filterTitles, fromQuery, histogram, ratingSpan, toQuery } from '../src/filter.ts';
import { exportJson, importJson, type Marks } from '../src/marks.ts';
import type { TitlesFile } from '../src/types.ts';

const col = <T>(x: T, n = 3) => Array.from({ length: n }, () => x);
const f: TitlesFile = {
  generated: 'now',
  total: 3,
  genres: ['Action', 'Drama'],
  certs: ['R', 'PG'],
  langs: ['English', 'French'],
  countries: ['United States', 'France'],
  id: ['tt0000001', 'tt0000002', 'tt0000003'],
  t: ['Alpha', 'Béta', 'Gamma'],
  o: col(''),
  d: [20010305, 19990000, 20100101],
  e: col(0),
  k: [0, 1, 0],
  r: [80, 90, 75],
  n: [10000, 50000, 6000],
  m: [100, 50, 90],
  s: col(0),
  g: [1, 2, 3],
  ce: [1, 2, 0],
  l: [[0], [1], [0, 1]],
  c: [[0], [1], [0]],
  p: col(''),
  plot: ['a hero', 'a doctor', 'both'],
  dir: [['Ann'], [], []],
  cast: [[], ['Zed Quinn'], []],
  chars: [[], ['Dr Who'], []],
  kw: [['heist'], [], []],
  rc: [0, 5, -2],
  w: [0, 3, 9],
  nm: col(0),
  sim: [[1], [], [0, 1]],
  gr: col(0),
  bu: col(0),
  tr: [0, 12, 0],
  se: [0, 4, 0],
  ep: [0, 40, 0],
  tm: [0, 1396, 0],
};
const { titles } = decode(f);
const ids = (q: Partial<typeof DEFAULT>, marks: Marks = {}) =>
  filterTitles(titles, { ...DEFAULT, ...q }, marks).map((t) => t.id.slice(-1));

describe('filterTitles', () => {
  it('defaults keep popularity order', () => expect(ids({})).toEqual(['1', '2', '3']));
  it('searches accent-insensitively across cast and plot', () => {
    expect(ids({ q: 'beta' })).toEqual(['2']);
    expect(ids({ q: 'quinn doctor' })).toEqual(['2']);
  });
  it('forgives a typo only when nothing matches exactly', () => {
    expect(ids({ q: 'betta' })).toEqual(['2']);
    expect(ids({ q: 'hero' })).toEqual(['1']);
    expect(ids({ q: 'zzzzzz' })).toEqual([]);
  });
  it('finds characters and keywords', () => {
    expect(ids({ q: 'dr who' })).toEqual(['2']);
    expect(ids({ q: 'heist' })).toEqual(['1']);
  });
  it('filters certificate, language and country', () => {
    expect(ids({ certs: 3 })).toEqual(['1', '2']);
    expect(ids({ certs: 2 })).toEqual(['2']);
    expect(ids({ lang: 'French' })).toEqual(['2', '3']);
    expect(ids({ country: 'France' })).toEqual(['2']);
  });
  it('requires all selected genres', () => expect(ids({ genres: 3 })).toEqual(['3']));
  it('filters type, rating, votes, years', () => {
    expect(ids({ types: 1 << 1 })).toEqual(['2']);
    expect(ids({ rating: 80 })).toEqual(['1', '2']);
    expect(ids({ rating: 76, rmax: 85 })).toEqual(['1']);
    expect(ids({ votes: 20000 })).toEqual(['2']);
    expect(ids({ from: 2000, to: 2005 })).toEqual(['1']);
  });
  it('sorts with stable ties', () => {
    expect(ids({ sort: 'rating' })).toEqual(['2', '1', '3']);
    expect(ids({ sort: 'year' })).toEqual(['3', '1', '2']);
    expect(ids({ sort: 'rising' })).toEqual(['2', '1', '3']);
    expect(ids({ sort: 'wins' })).toEqual(['3', '2', '1']);
  });
  it('filters by mark state', () => {
    const marks = { tt0000002: { m: 'w' } } as unknown as Marks;
    expect(ids({ mark: 'w' }, marks)).toEqual(['2']);
    expect(ids({ mark: 'u' }, marks)).toEqual(['1', '3']);
  });
});

describe('query string', () => {
  it('omits defaults and round-trips', () => {
    expect(toQuery(DEFAULT)).toBe('');
    const q = { ...DEFAULT, q: 'a b', genres: 5, sort: 'votes' as const, mark: 's' as const };
    expect(fromQuery(toQuery(q))).toEqual(q);
  });
  it('drops a crossed range instead of showing an empty list', () => {
    const q = fromQuery('?r=90&rx=50&f=2010&to=2000');
    expect(q.rmax).toBe(100);
    expect(q.to).toBe(0);
  });
  it('ignores garbage', () => expect(fromQuery('?t=-1&s=nope&m=x&r=abc')).toEqual(DEFAULT));
});

describe('decode', () => {
  it('turns dictionaries and indexes into values', () => {
    const [a, b] = titles;
    expect(a).toMatchObject({
      year: 2001,
      cert: 'R',
      langs: ['English'],
      countries: ['United States'],
      sim: ['tt0000002'],
    });
    expect(b).toMatchObject({ date: 19990000, cert: 'PG', seasons: 4, trailer: 12 });
  });
});

describe('marks import', () => {
  const entry = (at: number) => ({ m: 's' as const, at, snap: { ...titles[0]!, hay: undefined } });
  it('merges newest wins and rejects junk', () => {
    const cur = { tt0000001: entry(5) } as unknown as Marks;
    const incoming = exportJson({ tt0000001: entry(9), tt0000002: entry(1) } as unknown as Marks);
    const out = importJson(incoming, cur);
    expect(out.tt0000001!.at).toBe(9);
    expect(Object.keys(out)).toHaveLength(2);
    expect(() => importJson('{"x":1}', cur)).toThrow();
  });
});

describe('histogram', () => {
  it('bins values and keeps both ends', () => {
    expect(histogram([10, 15, 19, 20, 100, 101], 10, 100, 9)).toEqual([3, 1, 0, 0, 0, 0, 0, 0, 1]);
  });
});

describe('rating range', () => {
  it('words each side, and the sentinels mean no limit', () => {
    expect(ratingSpan(10, 100)).toBe('Any');
    expect(ratingSpan(75, 100)).toBe('7.5+');
    expect(ratingSpan(10, 85)).toBe('Up to 8.5');
    expect(ratingSpan(70, 85)).toBe('7.0–8.5');
  });
  it('derives slider domains from the data, rounded outward', () => {
    const t = [
      { rating: 33, year: 1987 },
      { rating: 95, year: 2026 },
    ] as never;
    expect(domains(t)).toEqual({ rating: [30, 100], year: [1980, 2026] });
  });
  it('counts what a patch would leave without touching the query', () => {
    const t = [
      { rating: 80, votes: 1, year: 2000, type: 0, g: 0, hay: '' },
      { rating: 60, votes: 1, year: 2000, type: 0, g: 0, hay: '' },
    ] as never;
    expect(countWith(t, DEFAULT, {}, { rating: 70 })).toBe(1);
    expect(countWith(t, DEFAULT, {}, {})).toBe(2);
  });
});
