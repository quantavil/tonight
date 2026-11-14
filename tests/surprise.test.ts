import { describe, expect, it } from 'vite-plus/test';
import type { Title } from '../src/data.ts';
import type { Marks } from '../src/marks.ts';
import { surprise } from '../src/surprise.ts';

const mk = (id: string, o: Partial<Title> = {}): Title => ({
  rank: 100,
  id,
  title: id,
  orig: '',
  date: 0,
  year: 2010,
  end: 0,
  type: 0,
  rating: 80,
  votes: 200000,
  mins: 100,
  meta: 0,
  g: 0,
  genres: ['Drama'],
  ce: 0,
  cert: '',
  langs: ['English'],
  countries: [],
  poster: '',
  plot: '',
  dir: [],
  cast: [],
  chars: [],
  kw: [],
  rankChange: 0,
  wins: 0,
  noms: 0,
  sim: [],
  gross: 0,
  budget: 0,
  trailer: 0,
  seasons: 0,
  episodes: 0,
  tmdb: 0,
  hay: '',
  ...o,
});
const mark = (t: Title, m: 's' | 'w', at: number): Marks[string] => {
  const { hay: _h, ...snap } = t;
  return { m, at, snap };
};
const NOW = 1_700_000_000_000;

describe('surprise', () => {
  it('never suggests a seen title', () => {
    const a = mk('tt1'),
      b = mk('tt2');
    const r = surprise([a, b], [a, b], { tt1: mark(a, 's', NOW) }, new Set(), NOW, () => 0);
    expect(r?.title.id).toBe('tt2');
  });

  it('skips recent picks and returns undefined when nothing is left', () => {
    const a = mk('tt1');
    expect(surprise([a], [a], {}, new Set(['tt1']), NOW)).toBeUndefined();
  });

  it('leans toward what the marked titles share', () => {
    const likedA = mk('tt1', { genres: ['Horror'], dir: ['Ari'] });
    const likedB = mk('tt2', { genres: ['Horror'], dir: ['Ari'] });
    const horror = mk('tt3', { genres: ['Horror'], dir: ['Ari'], rating: 75 });
    const comedy = mk('tt4', { genres: ['Comedy'], rating: 78 });
    const filler = Array.from({ length: 20 }, (_, i) => mk(`tt${10 + i}`, { genres: ['Comedy'], rating: 70 }));
    const all = [likedA, likedB, horror, comedy, ...filler];
    const marks = { tt1: mark(likedA, 's', NOW), tt2: mark(likedB, 's', NOW) };
    const r = surprise(all, all, marks, new Set(), NOW, () => 0);
    expect(r?.title.id).toBe('tt3');
    expect(r?.why).toMatch(/Horror|Ari/);
  });

  it('works with no marks and prefers quality', () => {
    const good = mk('tt1', { rating: 88 });
    const poor = mk('tt2', { rating: 45 });
    const r = surprise([poor, good], [poor, good], {}, new Set(), NOW, () => 0);
    expect(r?.title.id).toBe('tt1');
  });

  it('varies with the random draw', () => {
    const ts = Array.from({ length: 30 }, (_, i) => mk(`tt${i}`, { rating: 80 - i * 0.1 }));
    const first = surprise(ts, ts, {}, new Set(), NOW, () => 0)?.title.id;
    const last = surprise(ts, ts, {}, new Set(), NOW, () => 0.999999)?.title.id;
    expect(first).not.toBe(last);
  });
});
