import type { Title } from './data.ts';
import type { Marks } from './marks.ts';

type T = Pick<
  Title,
  'id' | 'genres' | 'dir' | 'cast' | 'kw' | 'langs' | 'type' | 'year' | 'rating' | 'votes' | 'meta' | 'rank'
>;

export interface Suggestion {
  title: Title;
  why: string;
}

const DAY = 86_400_000;
const HALF_LIFE = 180 * DAY; // a mark loses half its pull on your taste in six months
const TOP = 40; // sample among this many best scores, so every press can differ
const TEMP = 0.08; // lower is closer to always the best; higher is closer to random

/** A title's taste features, namespaced. The label is what the reason line shows. */
const features = (t: T): [string, string][] => [
  ...t.genres.map((g): [string, string] => [`g:${g}`, g]),
  ...t.dir.map((d): [string, string] => [`d:${d}`, d]),
  ...t.cast.map((c): [string, string] => [`c:${c}`, c]),
  ...t.kw.map((k): [string, string] => [`k:${k}`, k]),
  ...t.langs.map((l): [string, string] => [`l:${l}`, l]),
  [`t:${t.type}`, ''],
  [`y:${Math.floor(t.year / 10)}`, ''],
];

/** Rating pulled toward 7 when few people voted, then 6 -> 0 and 9 -> 1; metascore, when there is one, counts half. */
const quality = (t: T) => {
  const m = 8000;
  const bayes = (t.votes * (t.rating / 10) + m * 7) / (t.votes + m);
  const q = Math.min(1, Math.max(0, (bayes - 6) / 3));
  return t.meta > 0 ? (q + t.meta / 100) / 2 : q;
};

/**
 * Picks one title to watch tonight without being told anything. It reads the titles you marked (watchlist
 * pulls harder than seen, recent marks harder than old ones) to learn your taste, and scores every unseen
 * title on taste, quality, being a hidden gem (good but not already everyone's pick) and being something new
 * for you. It then draws at random from the best few, so pressing again gives another good one.
 * `skip` holds ids picked recently. Returns undefined when nothing is left.
 */
export function surprise(
  pool: Title[],
  all: Title[],
  marks: Marks,
  skip: ReadonlySet<string> = new Set(),
  now = Date.now(),
  rnd = Math.random,
): Suggestion | undefined {
  const candidates = pool.filter((t) => marks[t.id]?.m !== 's' && !skip.has(t.id));
  if (!candidates.length) return undefined;

  // How common each feature is, so liking "Drama" says less than liking one director.
  const df = new Map<string, number>();
  for (const t of all) for (const [k] of features(t)) df.set(k, (df.get(k) ?? 0) + 1);
  const idf = (k: string) => Math.log((all.length + 1) / ((df.get(k) ?? 0) + 1));

  const affinity = new Map<string, number>();
  let total = 0;
  for (const e of Object.values(marks)) {
    const w = (e.m === 'w' ? 1 : 0.6) * 0.5 ** (Math.max(0, now - e.at) / HALF_LIFE);
    total += w;
    for (const [k] of features(e.snap)) affinity.set(k, (affinity.get(k) ?? 0) + w);
  }

  const rows = candidates.map((t) => {
    const q = quality(t);
    let taste = 0;
    const hits: { label: string; s: number }[] = [];
    const fresh: string[] = []; // genres you have never marked
    for (const [k, label] of features(t)) {
      const a = total ? (affinity.get(k) ?? 0) / total : 0;
      const s = a * idf(k);
      taste += s;
      if (label && s > 0 && !k.startsWith('l:')) hits.push({ label, s });
      if (k.startsWith('g:') && total && a === 0) fresh.push(label);
    }
    const gem = q * Math.min(1, t.rank > 0 ? t.rank / 2500 : 0.5);
    const novelty = t.genres.length ? q * (fresh.length / t.genres.length) : 0;
    return { t, q, taste, gem, novelty, hits, fresh };
  });
  const maxTaste = Math.max(...rows.map((r) => r.taste), 1e-9);
  const scored = rows
    .map((r) => {
      const taste = r.taste / maxTaste;
      const want = marks[r.t.id]?.m === 'w' ? 0.1 : 0;
      return { ...r, taste, score: 0.45 * taste + 0.3 * r.q + 0.12 * r.gem + 0.13 * r.novelty + want };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP);

  // softmax draw over the best few
  const best = scored[0]!.score;
  const weights = scored.map((r) => Math.exp((r.score - best) / TEMP));
  let x = rnd() * weights.reduce((a, b) => a + b, 0);
  let pick = scored[scored.length - 1]!;
  for (let i = 0; i < scored.length; i++) {
    x -= weights[i]!;
    if (x <= 0) {
      pick = scored[i]!;
      break;
    }
  }

  const top = pick.hits.sort((a, b) => b.s - a.s).slice(0, 2);
  const why =
    total && pick.taste > 0.35 && top.length
      ? `Because you like ${top.map((h) => h.label).join(' and ')}`
      : pick.novelty > 0.3
        ? `Something new for you: ${pick.fresh.join(', ')}`
        : pick.gem > 0.5
          ? `Hidden gem: ${(pick.t.rating / 10).toFixed(1)} from ${Math.round(pick.t.votes / 1000)}K votes`
          : `Highly rated, and you have not seen it`;
  return { title: pick.t as Title, why };
}
