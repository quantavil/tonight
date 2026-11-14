# AGENTS.md — cinedb

Personal SPA over IMDb's popularity-ranked titles. `README.md` has features, data format and commands.

## Verify before committing

```bash
bun run check && bun run test && bun run size && bun run e2e
bunx tsc --noEmit -p .
bunx knip
```

`tsc` and `knip` must both be clean. Do not add knip as a dependency. lefthook runs `check` on commit and `test` plus `size` on push. Tests live in `tests/` (vitest) and `e2e/` (Playwright), never in `src/`.

## IMDb access: verified constraints, do not "fix" them

1. Never fetch IMDb from a Cloudflare Worker (429) or from the browser (CORS allows only www.imdb.com). Data is prebuilt into `data/titles.json`.
2. Never scrape the HTML pages (AWS WAF). Use the GraphQL endpoint (`caching.graphql.imdb.com`, fallback `api.graphql.imdb.com`, header `x-imdb-client-name: imdb-web-next-localized`). GitHub Actions egress works.
3. Array order in `data/titles.json` IS the popularity rank. Never sort or reorder it. `meterRanking.currentRank` is per type, not global.
4. Default sort is `POPULARITY ASC`. Verify against the live page before changing.
5. IMDb caps a query at 10,000 results. With plot and credits, page size max is 500 (1000 fails with "Too much data requested"); the fetcher halves on that error.
6. Dataset = search `title_type=feature,tv_series,tv_movie,tv_miniseries`, `num_votes=5000,`, adult included. No rating floor (1.0–10.0 valid; 0 is rejected by `validate`).
7. Introspection is disabled. Guard every optional field (`toRow` does).
8. TMDB ids (`tm`) come from Wikidata SPARQL (`scripts/tmdb.ts`), never from IMDb or a TMDB key. A missing id stays 0 and keeps its previous value; the UI hides anything that needs it.

## Data contract

`src/types.ts` (valibot `TitlesSchema`) is the contract between `scripts/` and `src/`: scripts validate against it, `src/` reads its inferred type. No version field, no backward compatibility: change the contract, regenerate the file, update tests. `fetch.ts` validates before writing; a throw leaves the old data in place.

## Code map

- `src/App.tsx`: composition root. `src/hooks.ts`: query/URL state, detail route, pages, toast.
- `src/List.tsx`: title grid, poster cards. `src/Detail.tsx`: title detail dialog.
- `src/Toolbar.tsx` (tabs, pills), `src/Facets.tsx` and `src/Sliders.tsx` (popover bodies), `src/Pop.tsx` (card on desktop, bottom sheet on phone), `src/Pager.tsx`.
- `src/dialog.ts`: `useModal`, the one place a native `<dialog>` is opened (Detail and Pop). Esc, backdrop and focus are the browser's; do not add scrims, `role="dialog"`, focus traps or Esc handlers.
- `src/search.ts`: uFuzzy, exact words first, typo-tolerant fallback on names only. `src/filter.ts`: query model, filtering, sorting, URL. `src/marks.ts`, `src/settings.ts`: localStorage state.
- `src/icons.tsx`: every SVG. `src/styles/`: CSS by area, imported from `src/style.css`.

## Rules

- Budgets in `.size-limit.json`: critical path ≤ 30 kB brotli, data ≤ 1 MB. Raise them deliberately.
- Filter and search the whole list first, then page (500 per page). Never search only the visible page.
- Add dependencies only with a reason. No Worker, signals, IndexedDB, virtualization library or PWA plugin unless a measured budget is missed.
- Service worker `src/sw.js`: the precache list is injected by the plugin in `vite.config.ts`; the cache name changes per build.
- URL state uses debounced `replaceState`; the detail view uses `pushState` (depth in the state), so Back steps one title and Close leaves.
- Marks (`localStorage` `marks`, valibot-validated snapshots) and settings (`settings`) are unversioned. Red is used for marks only.
- Terms: IMDb forbids public/commercial use of the data. Keep the repo private and the site personal. No secrets in the repo.
