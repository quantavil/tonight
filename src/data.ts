import dataUrl from '../data/titles.json?url';
import { IMG, type TitlesFile } from './types.ts';

export interface Title {
  rank: number; // 1-based IMDb popularity rank, 0 for titles no longer in the list
  id: string;
  title: string;
  orig: string;
  date: number; // YYYYMMDD, month and day 0 when unknown
  year: number;
  end: number;
  type: number; // index into TYPES
  rating: number; // x10
  votes: number;
  mins: number;
  meta: number;
  g: number; // genre bitmask
  genres: string[];
  ce: number; // certificate bitmask, 0 none
  cert: string;
  langs: string[];
  countries: string[];
  poster: string;
  plot: string;
  dir: string[];
  cast: string[];
  chars: string[]; // same order as cast
  kw: string[];
  rankChange: number; // + moved up since last week
  wins: number;
  noms: number;
  sim: string[]; // ids of similar titles
  gross: number; // USD thousands
  budget: number; // USD thousands
  trailer: number;
  seasons: number;
  episodes: number;
  tmdb: number; // TMDB id, 0 unknown
  hay: string; // normalized search text
}

/** The dictionaries the filters choose from. */
export interface Dicts {
  genres: string[];
  certs: string[];
  langs: string[];
  countries: string[];
}
export const NO_DICTS: Dicts = { genres: [], certs: [], langs: [], countries: [] };

export interface Dataset extends Dicts {
  titles: Title[];
  generated: string;
  total: number;
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Everything a search can hit, except the plot, which is matched on its own (see filter.ts). */
export const makeHay = (t: Omit<Title, 'hay'>) =>
  norm([t.title, t.orig, t.dir.join(' '), t.cast.join(' '), t.chars.join(' '), t.kw.join(' ')].join(' '));

const pick = (dict: string[], mask: number) => dict.filter((_, b) => mask & (1 << b));

export function decode(f: TitlesFile): Dataset {
  const titles = f.id.map((id, i): Title => {
    const t = {
      rank: i + 1,
      id,
      title: f.t[i]!,
      orig: f.o[i]!,
      date: f.d[i]!,
      year: Math.floor(f.d[i]! / 10000),
      end: f.e[i]!,
      type: f.k[i]!,
      rating: f.r[i]!,
      votes: f.n[i]!,
      mins: f.m[i]!,
      meta: f.s[i]!,
      g: f.g[i]!,
      genres: pick(f.genres, f.g[i]!),
      ce: f.ce[i]!,
      cert: pick(f.certs, f.ce[i]!)[0] ?? '',
      langs: f.l[i]!.map((x) => f.langs[x]!),
      countries: f.c[i]!.map((x) => f.countries[x]!),
      poster: f.p[i]!,
      plot: f.plot[i]!,
      dir: f.dir[i]!,
      cast: f.cast[i]!,
      chars: f.chars[i]!,
      kw: f.kw[i]!,
      rankChange: f.rc[i]!,
      wins: f.w[i]!,
      noms: f.nm[i]!,
      sim: f.sim[i]!.map((x) => f.id[x]!),
      gross: f.gr[i]!,
      budget: f.bu[i]!,
      trailer: f.tr[i]!,
      seasons: f.se[i]!,
      episodes: f.ep[i]!,
      tmdb: f.tm[i]!,
    };
    return { ...t, hay: makeHay(t) };
  });
  return {
    titles,
    genres: f.genres,
    certs: f.certs,
    langs: f.langs,
    countries: f.countries,
    generated: f.generated,
    total: f.total,
  };
}

export async function load(): Promise<Dataset> {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`data HTTP ${res.status}`);
  return decode((await res.json()) as TitlesFile);
}

export const TYPE_LABEL = ['Movie', 'Series', 'TV movie', 'Mini-series'] as const;
export const typeLabel = (t: number) => TYPE_LABEL[t] ?? '';

/** Poster URL at a given width. Keys come from the fetcher; full URLs pass through. */
export const posterUrl = (key: string, w: number) =>
  !key ? '' : key.startsWith('http') ? key : `${IMG}${key}._V1_QL75_UX${w}_.jpg`;

export const fmtVotes = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
export const fmtRating = (r: number) => (r / 10).toFixed(1);
export const fmtMins = (m: number) =>
  m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`) : '';
export const fmtYears = (t: Pick<Title, 'year' | 'end'>) =>
  !t.year ? '' : t.end && t.end !== t.year ? `${t.year}–${t.end}` : String(t.year);

/** USD thousands -> "$1.2B" / "$250M". */
export const fmtMoney = (k: number) =>
  k >= 1e6 ? `$${+(k / 1e6).toFixed(1)}B` : k >= 1e3 ? `$${Math.round(k / 1e3)}M` : `$${k}K`;
