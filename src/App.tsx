import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Detail } from './Detail.tsx';
import { List } from './List.tsx';
import { Pager } from './Pager.tsx';
import { NO_DICTS, load, makeHay, type Dataset, type Title } from './data.ts';
import { filterTitles } from './filter.ts';
import { PAGE_SIZE, useDetail, usePage, useQueryState, useToast } from './hooks.ts';
import { Dice, Gear, Search } from './icons.tsx';
import { downloadMarks, useMarks } from './marks.ts';
import { Settings } from './Settings.tsx';
import { useSettings } from './settings.ts';
import { surprise } from './surprise.ts';
import { Toolbar } from './Toolbar.tsx';

/** Titles that dropped out of the top list stay reachable through their mark snapshot. */
const withOrphans = (data: Dataset, marks: ReturnType<typeof useMarks>['marks']): Title[] => {
  const have = new Set(data.titles.map((t) => t.id));
  const orphans = Object.entries(marks)
    .filter(([id]) => !have.has(id))
    .map(([, e]): Title => ({ ...e.snap, rank: 0, hay: makeHay(e.snap) }));
  return orphans.length ? [...data.titles, ...orphans] : data.titles;
};

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState('');
  const { settings, def, change } = useSettings();
  const [q, set] = useQueryState(def);
  const { marks, counts, toggle, merge } = useMarks();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, flash] = useToast();
  const search = useRef<HTMLInputElement>(null);
  const [lucky, setLucky] = useState<{ id: string; why: string } | null>(null);
  const recent = useRef(new Set<string>());

  useEffect(() => {
    load().then(setData, (e) => setError(String(e)));
  }, []);

  const all = useMemo(() => (data ? withOrphans(data, marks) : []), [data, marks]);
  const shown = useMemo(() => filterTitles(all, q, marks), [all, q, marks]);
  const detail = useDetail(all, shown);
  const { current, openId } = detail;
  const { page, pages, from, setPage } = usePage(shown.length, q, current ? shown.indexOf(current) : -1);
  const surpriseMe = () => {
    const go = () => surprise(all, all, marks, recent.current);
    const pick = go() ?? (recent.current.clear(), go());
    if (!pick) return flash('Nothing left to suggest.');
    recent.current.add(pick.title.id);
    setLucky({ id: pick.title.id, why: pick.why });
    if (current) detail.swap(pick.title);
    else detail.open(pick.title);
  };
  const similar = useMemo(() => {
    if (!current) return [];
    const byId = new Map(all.map((t) => [t.id, t]));
    return current.sim.flatMap((id) => byId.get(id) ?? []);
  }, [all, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      if (e.key === 'Escape') {
        // A modal dialog (the title, a filter card) takes Esc itself and closes through its own close event.
        if (el.closest('dialog')) return;
        if (settingsOpen) setSettingsOpen(false);
        else if (typing) el.blur();
        return;
      }
      if (typing || el.closest('.pop')) return;
      if (e.key === 'r' && data) surpriseMe();
      else if (e.key === '/') {
        e.preventDefault();
        search.current?.focus();
      } else if (current) {
        if (e.key === 'ArrowLeft') detail.step(-1);
        else if (e.key === 'ArrowRight') detail.step(1);
        else if (e.key === 'w') toggle(current, 'w');
        else if (e.key === 's') toggle(current, 's');
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [current, settingsOpen, detail.step, toggle, data, all, marks]);

  const onImport = async (file: File) => {
    try {
      flash(`Imported. ${merge(await file.text())} marked titles.`);
    } catch {
      flash('That file is not a marks export.');
    }
  };

  return (
    <div class="app">
      <Settings
        s={settings}
        set={change}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onExport={() => downloadMarks(marks)}
        onImport={onImport}
        titles={all}
        generated={data?.generated ?? ''}
      />
      {/* inert keeps focus and the screen reader out of the page while the settings panel covers it; the modal dialogs do this natively */}
      <main inert={settingsOpen}>
        <header class="masthead">
          <div class="bar">
            <h1 class="brand">
              <span class="logo" aria-hidden="true" />
              <span class="brand-name">CineDB</span>
            </h1>
            <label class="find">
              <Search />
              <input
                ref={search}
                type="search"
                placeholder="Title, cast, plot"
                aria-label="Search"
                enterkeyhint="search"
                autocomplete="off"
                value={q.q}
                onInput={(e) => set({ q: (e.target as HTMLInputElement).value })}
              />
              <kbd class="hint" aria-hidden="true">
                /
              </kbd>
            </label>
            <button
              class="icon dice"
              aria-label="Surprise me"
              title="Surprise me (r)"
              disabled={!data}
              onClick={surpriseMe}
            >
              <Dice />
            </button>
            <button
              class="icon gear"
              aria-label="Settings"
              aria-controls="settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Gear />
            </button>
          </div>
          <Toolbar
            q={q}
            def={def}
            set={set}
            dict={data ?? NO_DICTS}
            count={shown.length}
            counts={counts}
            titles={all}
            marks={marks}
          />
        </header>

        {error ? (
          <div class="state">
            <p>Could not load the list. {error}</p>
            <button class="btn" onClick={() => location.reload()}>
              Retry
            </button>
          </div>
        ) : !data ? (
          <div class="state" aria-busy="true">
            Loading
          </div>
        ) : shown.length === 0 ? (
          <div class="state">
            <p>Nothing matches.</p>
            <button class="btn" onClick={() => set({ ...def })}>
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <List titles={shown.slice(from, from + PAGE_SIZE)} marks={marks} onOpen={detail.open} selected={openId} />
            <Pager page={page} pages={pages} total={shown.length} onPage={setPage} />
          </>
        )}
      </main>

      {current && (
        <Detail
          t={current}
          similar={similar}
          onOpen={detail.open}
          mark={marks[current.id]?.m}
          onMark={(m) => toggle(current, m)}
          onClose={detail.close}
          onFilter={(patch) => {
            set(patch);
            detail.close();
          }}
          onStep={detail.step}
          hasPrev={detail.hasPrev}
          hasNext={detail.hasNext}
          why={lucky?.id === current.id ? lucky.why : ''}
          onAnother={surpriseMe}
        />
      )}
      <div class="toast" role="status">
        {toast}
      </div>
    </div>
  );
}
