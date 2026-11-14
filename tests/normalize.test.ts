import { describe, expect, it } from 'vite-plus/test';
import { posterKey, toFile, toRow, validate } from '../scripts/normalize.ts';

const node = (over: object = {}) => ({
  id: 'tt0111161',
  titleText: { text: 'The Shawshank Redemption' },
  originalTitleText: { text: 'The Shawshank Redemption' },
  releaseYear: { year: 1994 },
  ratingsSummary: { aggregateRating: 9.3, voteCount: 3000000 },
  titleType: { id: 'movie' },
  runtime: { seconds: 8520 },
  genres: { genres: [{ text: 'Drama' }] },
  primaryImage: { url: 'https://m.media-amazon.com/images/M/MV5BX@._V1_QL75_UX90_.jpg' },
  ...over,
});

describe('posterKey', () => {
  it('extracts the key', () => expect(posterKey(node().primaryImage.url)).toBe('MV5BX@'));
  it('keeps foreign urls whole', () => expect(posterKey('https://x.test/a.jpg')).toBe('https://x.test/a.jpg'));
  it('handles missing', () => expect(posterKey(undefined)).toBe(''));
});

describe('toRow', () => {
  it('normalizes a full node', () => {
    const r = toRow(node())!;
    expect(r).toMatchObject({ rating: 93, mins: 142, orig: '', date: 19940000, meta: 0, poster: 'MV5BX@' });
  });
  it('survives nulls', () => {
    const r = toRow(
      node({ ratingsSummary: null, runtime: null, genres: null, primaryImage: null, releaseYear: null }),
    )!;
    expect(r).toMatchObject({
      rating: 0,
      mins: 0,
      genres: [],
      poster: '',
      date: 0,
      cert: '',
      langs: [],
      sim: [],
      trailer: 0,
    });
  });
  it('drops unknown types and missing ids', () => {
    expect(toRow(node({ titleType: { id: 'videoGame' } }))).toBeNull();
    expect(toRow(node({ id: undefined }))).toBeNull();
  });
  it('reads the richer fields', () => {
    const r = toRow(
      node({
        releaseDate: { year: 1994, month: 9, day: 23 },
        certificate: { rating: 'R' },
        countriesOfOrigin: { countries: [{ text: 'United States' }] },
        spokenLanguages: { spokenLanguages: [{ text: 'English' }, { text: 'English' }] },
        cast: { edges: [{ node: { name: { nameText: { text: 'Tim Robbins' } }, characters: [{ name: 'Andy' }] } }] },
        keywords: { edges: [{ node: { keyword: { text: { text: 'prison' } } } }] },
        meterRanking: { rankChange: { changeDirection: 'DOWN', difference: 4 } },
        awardWins: { total: 21 },
        moreLike: { edges: [{ node: { id: 'tt0068646' } }] },
        gross: { total: { amount: 28_341_469, currency: 'USD' } },
        budget: { budget: { amount: 25_000_000, currency: 'INR' } },
        video: { edges: [{ node: { id: 'vi3877612057' } }] },
        episodes: { episodes: { total: 62 }, displayableSeasons: { total: 5 } },
      }),
    )!;
    expect(r).toMatchObject({
      date: 19940923,
      cert: 'R',
      countries: ['United States'],
      langs: ['English'],
      cast: ['Tim Robbins'],
      chars: ['Andy'],
      kw: ['prison'],
      rankChange: -4,
      wins: 21,
      sim: ['tt0068646'],
      gross: 28341,
      budget: 0, // not USD
      trailer: 3877612057,
      seasons: 5,
      episodes: 62,
      tmdb: 0, // filled in later by scripts/tmdb.ts
    });
  });
  it('throws on a value of the wrong type, so a changed schema never reaches the data', () => {
    expect(() => toRow(node({ ratingsSummary: { aggregateRating: 'high' } }))).toThrow();
  });
  it('keeps original title only when it differs', () => {
    expect(toRow(node({ originalTitleText: { text: 'Orig' } }))!.orig).toBe('Orig');
  });
});

describe('toFile + validate', () => {
  const rows = [
    toRow(node())!,
    toRow(node({ id: 'tt0068646', titleText: { text: 'B' }, originalTitleText: { text: 'B' } }))!,
  ];
  it('keeps order and builds columns', () => {
    const f = toFile(rows, 10, 'now');
    expect(f.id).toEqual(['tt0111161', 'tt0068646']);
    expect(f.g[0]).toBe(1);
    expect(() => validate(f, 2)).not.toThrow();
  });
  it('rejects too few, duplicates and bad ratings', () => {
    expect(() => validate(toFile(rows, 10, 'now'), 5)).toThrow(/only 2/);
    expect(() => validate(toFile([rows[0]!, rows[0]!], 10, 'now'), 1)).toThrow(/duplicate/);
    expect(() => validate(toFile([{ ...rows[0]!, rating: 0 }], 10, 'now'), 1)).toThrow(/invalid data at r\./);
    expect(() => validate(toFile([{ ...rows[0]!, rating: 101 }], 10, 'now'), 1)).toThrow(/invalid data at r\./);
  });
  it('indexes similar titles inside the file and drops the rest', () => {
    const f = toFile([{ ...rows[0]!, sim: ['tt0068646', 'tt9999999', rows[0]!.id] }, rows[1]!], 10, 'now');
    expect(f.sim).toEqual([[1], []]);
  });
  it('accepts low ratings (no rating floor)', () => {
    for (const rating of [10, 35, 50, 69])
      expect(() => validate(toFile([{ ...rows[0]!, rating }], 10, 'now'), 1)).not.toThrow();
  });
});
