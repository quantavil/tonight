import * as v from 'valibot';
import { IMG, TYPES, TitlesSchema, type Row, type TitlesFile } from '../src/types.ts';

// The shape of a GraphQL node. IMDb omits fields freely, so every object and leaf is nullish; a value of
// the wrong type is a schema change and throws, so the old data stays in place.
const S = v.nullish(v.string());
const N = v.nullish(v.number());
const obj = <E extends v.ObjectEntries>(entries: E) => v.nullish(v.object(entries));
const list = <E extends v.ObjectEntries>(entries: E) => v.nullish(v.array(v.object(entries)));
const edges = <E extends v.ObjectEntries>(node: E) => obj({ edges: list({ node: obj(node) }) });
const personName = obj({ nameText: obj({ text: S }) });
const money = obj({ amount: N, currency: S });

const Node = v.object({
  id: S,
  titleText: obj({ text: S }),
  originalTitleText: obj({ text: S }),
  releaseDate: obj({ year: N, month: N, day: N }),
  releaseYear: obj({ year: N, endYear: N }),
  ratingsSummary: obj({ aggregateRating: N, voteCount: N }),
  titleType: obj({ id: S }),
  runtime: obj({ seconds: N }),
  genres: obj({ genres: list({ text: S }) }),
  certificate: obj({ rating: S }),
  countriesOfOrigin: obj({ countries: list({ text: S }) }),
  spokenLanguages: obj({ spokenLanguages: list({ text: S }) }),
  primaryImage: obj({ url: S }),
  metacritic: obj({ metascore: obj({ score: N }) }),
  plot: obj({ plotText: obj({ plainText: S }) }),
  principalCredits: list({ category: obj({ id: S }), credits: list({ name: personName }) }),
  cast: edges({ name: personName, characters: list({ name: S }) }),
  meterRanking: obj({ rankChange: obj({ changeDirection: S, difference: N }) }),
  keywords: edges({ keyword: obj({ text: obj({ text: S }) }) }),
  awardWins: obj({ total: N }),
  awardNoms: obj({ total: N }),
  moreLike: edges({ id: S }),
  gross: obj({ total: money }),
  budget: obj({ budget: money }),
  video: edges({ id: S }),
  episodes: obj({ episodes: obj({ total: N }), displayableSeasons: obj({ total: N }) }),
});
type Node = v.InferOutput<typeof Node>;

const text = (s: string | null | undefined) => s ?? '';
const nodes = <T>(e: { edges?: { node?: T | null }[] | null } | null | undefined): T[] =>
  (e?.edges ?? []).flatMap((x) => (x.node ? [x.node] : []));
const unique = (xs: (string | null | undefined)[], max: number) =>
  [...new Set(xs.filter(Boolean) as string[])].slice(0, max);

const crew = (n: Node, cats: string[], max: number): string[] =>
  unique(
    (n.principalCredits ?? [])
      .filter((c) => cats.includes(text(c.category?.id)))
      .flatMap((c) => (c.credits ?? []).map((cr) => cr.name?.nameText?.text)),
    max,
  );

/** "https://.../images/M/KEY._V1_QL75.jpg" -> "KEY"; unknown patterns are kept whole. */
export const posterKey = (url: string | null | undefined): string => {
  if (!url) return '';
  if (!url.startsWith(IMG)) return url;
  const i = url.indexOf('._V1_', IMG.length);
  return i < 0 ? url : url.slice(IMG.length, i);
};

/** USD only, in thousands. Other currencies would need a rate, so they count as unknown. */
const usdThousands = (m: { amount?: number | null; currency?: string | null } | null | undefined) =>
  m?.currency === 'USD' ? Math.round((m.amount ?? 0) / 1000) : 0;

export function toRow(raw: unknown): Row | null {
  const n = v.parse(Node, raw);
  const type = n.titleType?.id as Row['type'] | undefined;
  if (!n.id || !type || !TYPES.includes(type)) return null;
  const title = text(n.titleText?.text) || text(n.originalTitleText?.text);
  const orig = text(n.originalTitleText?.text);
  const year = n.releaseYear?.year ?? n.releaseDate?.year ?? 0;
  const rd = n.releaseDate;
  const cast = nodes(n.cast).filter((c) => c.name?.nameText?.text);
  const move = n.meterRanking?.rankChange;
  return {
    id: n.id,
    title,
    orig: orig === title ? '' : orig,
    date: year * 10000 + (rd?.year === year ? (rd.month ?? 0) * 100 + (rd.day ?? 0) : 0),
    end: n.releaseYear?.endYear ?? 0,
    type,
    rating: Math.round((n.ratingsSummary?.aggregateRating ?? 0) * 10),
    votes: n.ratingsSummary?.voteCount ?? 0,
    mins: Math.round((n.runtime?.seconds ?? 0) / 60),
    meta: n.metacritic?.metascore?.score ?? 0,
    genres: unique(
      (n.genres?.genres ?? []).map((g) => g.text),
      31,
    ),
    cert: text(n.certificate?.rating),
    langs: unique(
      (n.spokenLanguages?.spokenLanguages ?? []).map((l) => l.text),
      8,
    ),
    countries: unique(
      (n.countriesOfOrigin?.countries ?? []).map((c) => c.text),
      6,
    ),
    poster: posterKey(n.primaryImage?.url),
    plot: text(n.plot?.plotText?.plainText),
    dir: crew(n, ['director', 'creator'], 3),
    cast: cast.map((c) => text(c.name?.nameText?.text)),
    chars: cast.map((c) =>
      (c.characters ?? [])
        .map((x) => x.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(' / '),
    ),
    kw: unique(
      nodes(n.keywords).map((k) => k.keyword?.text?.text),
      4,
    ),
    rankChange:
      (move?.changeDirection === 'DOWN' ? -1 : move?.changeDirection === 'UP' ? 1 : 0) * (move?.difference ?? 0),
    wins: n.awardWins?.total ?? 0,
    noms: n.awardNoms?.total ?? 0,
    sim: unique(
      nodes(n.moreLike).map((s) => s.id),
      6,
    ),
    gross: usdThousands(n.gross?.total),
    budget: usdThousands(n.budget?.budget),
    trailer: Number(nodes(n.video)[0]?.id?.replace(/^vi/, '')) || 0,
    seasons: n.episodes?.displayableSeasons?.total ?? 0,
    episodes: n.episodes?.episodes?.total ?? 0,
    tmdb: 0,
  };
}

/** Most used first, then alphabetical. */
const byUse = (values: string[][]): string[] => {
  const count = new Map<string, number>();
  for (const x of values.flat()) count.set(x, (count.get(x) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([x]) => x);
};

/** Rows (already in popularity order) -> columnar file. */
export function toFile(rows: Row[], total: number, generated: string): TitlesFile {
  const genres = [...new Set(rows.flatMap((r) => r.genres))].sort();
  const certs = byUse(rows.map((r) => (r.cert ? [r.cert] : [])));
  const langs = byUse(rows.map((r) => r.langs));
  const countries = byUse(rows.map((r) => r.countries));
  if (genres.length > 31) throw new Error(`too many genres (${genres.length}), bitmask holds 31`);
  if (certs.length > 31) throw new Error(`too many certificates (${certs.length}), bitmask holds 31`);
  const mask = (dict: string[], xs: string[]) => xs.reduce((a, x) => a | (1 << dict.indexOf(x)), 0);
  const index = (dict: string[], xs: string[]) => xs.map((x) => dict.indexOf(x));
  const at = new Map(rows.map((r, i) => [r.id, i]));
  return {
    generated,
    total,
    genres,
    certs,
    langs,
    countries,
    id: rows.map((r) => r.id),
    t: rows.map((r) => r.title),
    o: rows.map((r) => r.orig),
    d: rows.map((r) => r.date),
    e: rows.map((r) => r.end),
    k: rows.map((r) => TYPES.indexOf(r.type)),
    r: rows.map((r) => r.rating),
    n: rows.map((r) => r.votes),
    m: rows.map((r) => r.mins),
    s: rows.map((r) => r.meta),
    g: rows.map((r) => mask(genres, r.genres)),
    ce: rows.map((r) => (r.cert ? mask(certs, [r.cert]) : 0)),
    l: rows.map((r) => index(langs, r.langs)),
    c: rows.map((r) => index(countries, r.countries)),
    p: rows.map((r) => r.poster),
    plot: rows.map((r) => r.plot),
    dir: rows.map((r) => r.dir),
    cast: rows.map((r) => r.cast),
    chars: rows.map((r) => r.chars),
    kw: rows.map((r) => r.kw),
    rc: rows.map((r) => r.rankChange),
    w: rows.map((r) => r.wins),
    nm: rows.map((r) => r.noms),
    sim: rows.map((r) => r.sim.flatMap((id) => (id !== r.id && at.has(id) ? [at.get(id)!] : []))),
    gr: rows.map((r) => r.gross),
    bu: rows.map((r) => r.budget),
    tr: rows.map((r) => r.trailer),
    se: rows.map((r) => r.seasons),
    ep: rows.map((r) => r.episodes),
    tm: rows.map((r) => r.tmdb),
  };
}

/** Throws on anything suspicious. A throw means the old data stays in place. */
export function validate(f: TitlesFile, minCount: number): void {
  if (f.id.length < minCount) throw new Error(`only ${f.id.length} titles, expected at least ${minCount}`);
  const res = v.safeParse(TitlesSchema, f);
  if (!res.success) {
    const [issue] = res.issues;
    throw new Error(`invalid data at ${v.getDotPath(issue) ?? 'file'}: ${issue.message}`);
  }
}
