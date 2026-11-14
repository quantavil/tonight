import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import * as v from 'valibot';
import type { Title } from './data.ts';

export type Mark = 'w' | 's'; // watchlist, seen
type Snap = Omit<Title, 'hay'>;

/** A title as it was when marked, kept so a title that drops out of the top list still shows up. */
const SnapSchema: v.GenericSchema<unknown, Snap> = v.object({
  rank: v.number(),
  id: v.string(),
  title: v.string(),
  orig: v.string(),
  date: v.number(),
  year: v.number(),
  end: v.number(),
  type: v.number(),
  rating: v.number(),
  votes: v.number(),
  mins: v.number(),
  meta: v.number(),
  g: v.number(),
  genres: v.array(v.string()),
  ce: v.number(),
  cert: v.string(),
  langs: v.array(v.string()),
  countries: v.array(v.string()),
  poster: v.string(),
  plot: v.string(),
  dir: v.array(v.string()),
  cast: v.array(v.string()),
  chars: v.array(v.string()),
  kw: v.array(v.string()),
  rankChange: v.number(),
  wins: v.number(),
  noms: v.number(),
  sim: v.array(v.string()),
  gross: v.number(),
  budget: v.number(),
  trailer: v.number(),
  seasons: v.number(),
  episodes: v.number(),
  tmdb: v.optional(v.number(), 0), // snapshots saved before the id existed
});

const EntrySchema = v.object({ m: v.picklist(['w', 's']), at: v.number(), snap: SnapSchema });
export type Marks = Record<string, v.InferOutput<typeof EntrySchema>>;

const KEY = 'marks';

function loadMarks(): Marks {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function saveMarks(m: Marks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* private mode or full: marks stay in memory for this session */
  }
}

/** Keeps the entries that parse; one bad entry does not cost the rest. */
const clean = (x: unknown): Marks => {
  const out: Marks = {};
  if (!x || typeof x !== 'object') return out;
  for (const [id, e] of Object.entries(x)) {
    const res = v.safeParse(EntrySchema, e);
    if (/^tt\d+$/.test(id) && res.success) out[id] = res.output;
  }
  return out;
};

export const exportJson = (m: Marks) => JSON.stringify({ marks: m }, null, 1);

/** Merge an exported file into current marks; the newer entry wins. Throws on garbage. */
export function importJson(text: string, current: Marks): Marks {
  const parsed = JSON.parse(text) as { marks?: unknown };
  if (!parsed?.marks) throw new Error('not a marks export');
  const incoming = clean(parsed.marks);
  const out = { ...current };
  for (const [id, e] of Object.entries(incoming)) if (!out[id] || out[id]!.at < e.at) out[id] = e;
  return out;
}

/** Download the marks as a dated JSON file. */
export function downloadMarks(m: Marks): void {
  const url = URL.createObjectURL(new Blob([exportJson(m)], { type: 'application/json' }));
  Object.assign(document.createElement('a'), {
    href: url,
    download: `cinedb-marks-${new Date().toISOString().slice(0, 10)}.json`,
  }).click();
  URL.revokeObjectURL(url);
}

/** Marks state, saved on change. `toggle` adds a mark or removes it when the title already has it. */
export function useMarks() {
  const [marks, setMarks] = useState<Marks>(loadMarks);
  useEffect(() => saveMarks(marks), [marks]);

  const toggle = useCallback((t: Title, m: Mark) => {
    setMarks((prev) => {
      const next = { ...prev };
      if (prev[t.id]?.m === m) delete next[t.id];
      else {
        const { hay: _hay, ...snap } = t;
        next[t.id] = { m, at: Date.now(), snap };
      }
      return next;
    });
  }, []);

  /** Merge an exported file in. Returns how many titles are marked now; throws when the file is not an export. */
  const merge = (text: string) => {
    const next = importJson(text, marks);
    setMarks(next);
    return Object.keys(next).length;
  };

  const counts = useMemo(() => {
    let w = 0;
    for (const e of Object.values(marks)) if (e.m === 'w') w++;
    return { w, s: Object.keys(marks).length - w };
  }, [marks]);

  return { marks, counts, toggle, merge };
}
