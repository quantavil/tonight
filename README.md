# CineDB

A personal, fast replacement for IMDb's slow pages: IMDb's most popular titles (movies, series, TV movies,
mini-series; any rating, 5,000+ votes, adult titles included) as one small static app. Search, filter, open a title
for plot and cast, mark it watchlist or seen.

Preact + TypeScript, built with Vite+ (`vp`), Bun as package manager. No backend.

## Features

- Search over title, original title, plot, cast, characters, keywords and directors. Typos are forgiven when nothing matches exactly. Search and filters cover the whole list; results show 500 per page.
- Filters: Rating, Genre, Type, Rated (certificate), Language, Country, Votes, Year, and Sort. Tabs for All, Movies, Series, Watchlist, Seen. Everything is in the URL, so a view can be shared.
- Detail view: cast with characters, keywords, awards, box office, seasons, rank change since last week, trailer link, similar titles.
- Watchlist and seen marks and your default settings live in `localStorage`. Marks export and import as JSON from Settings.
- Light and dark theme, installable, works offline after the first visit.
- Keys: `/` search, `Esc` close, `←` `→` previous/next title, `w` watchlist, `s` seen.

## Data

All data comes from one file, `data/titles.json`, built from IMDb's public GraphQL endpoint. TMDB ids (`tm`, used for the SeriesGraph link) come from Wikidata through `scripts/tmdb.ts`. No API key is needed.

- **Build it yourself:** `bun scripts/fetch.ts` (or `bun run fetch`) writes the file. `--limit 200` makes a smaller one; the default size is `LIMIT` in `scripts/fetch.ts`.
- **Format:** columnar JSON. Each key is a column, and index `i` in every column is the title at IMDb popularity rank `i + 1`, so the order is the rank. Genres and certificates are bitmasks into the `genres` and `certs` lists; languages and countries are index lists. The valibot schema in `src/types.ts` documents every column and is what the fetcher validates against.
- **Read it:** `src/data.ts` turns the columns into title objects. From any language, zip the columns by index.
- **Refresh:** a weekly GitHub Action (`.github/workflows/refresh-data.yml`) re-runs the fetch and commits changes. It also deletes workflow runs older than 30 days.

## Develop

```bash
bun install
bun run dev      # dev server
bun run check    # format, lint, types
bun run test     # unit and property tests (tests/)
bun run e2e      # Playwright (e2e/); first time: bunx playwright install chromium
bun run size     # build, then check the brotli budgets
bun run build
```

Cloudflare Pages builds on push (`bun install && bun run build`, output `dist`). See `AGENTS.md` for the code map and rules.

## Terms and license

The code is GPL-3.0-only (see `LICENSE`).
