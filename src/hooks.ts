import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Title } from './data.ts';
import { fromQuery, isDefault, toQuery, type Query } from './filter.ts';

/**
 * The filter query. It mirrors to the URL, debounced because Safari throttles replaceState, and it
 * follows `def` when the settings change, unless the user has already moved off the old defaults.
 */
export function useQueryState(def: Query) {
  const [q, setQ] = useState<Query>(() => fromQuery(location.search, def));
  const set = useCallback((patch: Partial<Query>) => setQ((p) => ({ ...p, ...patch })), []);

  const prev = useRef(def);
  useEffect(() => {
    const old = prev.current;
    prev.current = def;
    if (old !== def) setQ((p) => (isDefault(p, old) ? def : p));
  }, [def]);

  useEffect(() => {
    const id = setTimeout(() => history.replaceState(history.state, '', location.pathname + toQuery(q, def)), 300);
    return () => clearTimeout(id);
  }, [q, def]);

  return [q, set] as const;
}

type Open = { open?: string; depth?: number } | null;
const openIdOf = () => (history.state as Open)?.open ?? null;
/** How many history entries the open title sits on: 1, plus one per "more like this" hop. */
const depthOf = () => (history.state as Open)?.depth ?? 0;

/**
 * The open title. It lives in history state, so Back steps back through the titles opened from each other
 * and then closes; Close drops them all at once. The grid cell that opened it gets focus back. `shown` is the list the arrows walk.
 */
export function useDetail(all: Title[], shown: Title[]) {
  const [openId, setOpenId] = useState<string | null>(openIdOf);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const onPop = () => setOpenId(openIdOf());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !openId && opener.current instanceof HTMLElement && opener.current.isConnected)
      opener.current.focus({ preventScroll: true });
    wasOpen.current = !!openId;
  }, [openId]);

  const open = useCallback((t: Title) => {
    if (!openIdOf()) opener.current = document.activeElement;
    history.pushState({ open: t.id, depth: depthOf() + 1 }, '', location.href);
    setOpenId(t.id);
  }, []);

  const close = useCallback(() => {
    if (depthOf()) history.go(-depthOf());
    else setOpenId(null);
  }, []);

  const current = openId ? all.find((t) => t.id === openId) : undefined;
  const idx = current ? shown.indexOf(current) : -1;

  const step = useCallback(
    (d: -1 | 1) => {
      const next = shown[idx + d];
      if (!next) return;
      history.replaceState({ open: next.id, depth: depthOf() }, '', location.href);
      setOpenId(next.id);
      document.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
    },
    [shown, idx],
  );

  /** Show another title in the open view without adding a history step. */
  const swap = useCallback((t: Title) => {
    history.replaceState({ open: t.id, depth: depthOf() }, '', location.href);
    setOpenId(t.id);
  }, []);

  return { openId, current, open, swap, close, step, hasPrev: idx > 0, hasNext: idx >= 0 && idx < shown.length - 1 };
}

/** A message that clears itself. A newer message restarts the timer. */
export function useToast(ms = 3000) {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback(
    (m: string) => {
      setMsg(m);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(''), ms) as unknown as number;
    },
    [ms],
  );
  return [msg, flash] as const;
}

export const PAGE_SIZE = 500;

/**
 * Pages over the filtered list. Filtering and search run on the whole list first, so every page is a slice
 * of all matches. Goes back to page 1 when `resetOn` changes, and follows `focus` (the open title's index)
 * so stepping through titles in the detail view never leaves the list on the wrong page.
 */
export function usePage(total: number, resetOn: unknown, focus: number) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => setPage(1), [resetOn]);
  useEffect(() => {
    if (focus >= 0) setPage(Math.floor(focus / PAGE_SIZE) + 1);
  }, [focus]);
  const at = Math.min(page, pages);
  return { page: at, pages, from: (at - 1) * PAGE_SIZE, setPage };
}
