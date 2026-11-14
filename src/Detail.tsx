import { useEffect, useRef } from 'preact/hooks';
import { LIGHT_DISMISS, useModal } from './dialog.ts';
import { fmtMins, fmtMoney, fmtRating, fmtVotes, fmtYears, posterUrl, typeLabel, type Title } from './data.ts';
import type { Query } from './filter.ts';
import { Bookmark, Check, Close, Dice, External, Left, Right, Star } from './icons.tsx';
import type { Mark } from './marks.ts';

interface Props {
  t: Title;
  similar: Title[];
  onOpen: (t: Title) => void;
  mark: Mark | undefined;
  onMark: (m: Mark) => void;
  onClose: () => void;
  onFilter: (patch: Partial<Query>) => void;
  onStep: (d: -1 | 1) => void;
  /** Why Surprise me chose this title; empty when the title was opened any other way. */
  why: string;
  onAnother: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

export function Detail({
  t,
  similar,
  onOpen,
  mark,
  onMark,
  onClose,
  onFilter,
  onStep,
  hasPrev,
  hasNext,
  why,
  onAnother,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useModal(dialog, onClose);
  useEffect(() => {
    body.current?.scrollTo(0, 0);
  }, [t.id]);

  const series = t.seasons
    ? `${plural(t.seasons, 'season')}${t.episodes ? `, ${plural(t.episodes, 'episode')}` : ''}`
    : '';
  const facts = [fmtYears(t), typeLabel(t.type), series || fmtMins(t.mins), t.cert].filter(Boolean);
  const money = [t.gross && `${fmtMoney(t.gross)} worldwide`, t.budget && `${fmtMoney(t.budget)} budget`].filter(
    Boolean,
  );
  const awards = [t.wins && plural(t.wins, 'win'), t.noms && plural(t.noms, 'nomination')].filter(Boolean);
  return (
    <dialog class="detail" ref={dialog} aria-label={t.title} {...LIGHT_DISMISS}>
      <header class="dh">
        <button class="icon" onClick={() => onStep(-1)} disabled={!hasPrev} aria-label="Previous title">
          <Left />
        </button>
        <button class="icon" onClick={() => onStep(1)} disabled={!hasNext} aria-label="Next title">
          <Right />
        </button>
        <span class="dh-rank">
          {t.rank ? `Popularity #${t.rank}` : 'No longer in the top list'}
          {t.rank > 0 && t.rankChange !== 0 && (
            <small class={t.rankChange > 0 ? 'up' : 'down'}>
              {t.rankChange > 0 ? '▲' : '▼'} {Math.abs(t.rankChange)}
            </small>
          )}
        </span>
        <button class="icon" autofocus onClick={onClose} aria-label="Close">
          <Close />
        </button>
      </header>
      <div class="db" ref={body}>
        {why && (
          <p class="why">
            <Dice /> <span>{why}</span>
            <button class="btn" onClick={onAnother}>
              Another
            </button>
          </p>
        )}
        <div class="top">
          {t.poster && <img class="pic" src={posterUrl(t.poster, 400)} width="200" height="296" alt="" />}
          <div>
            <h2>{t.title}</h2>
            {t.orig && <p class="orig">{t.orig}</p>}
            <p class="facts">{facts.join(' · ')}</p>
            <p class="score">
              <b class="num">
                <Star /> {fmtRating(t.rating)}
              </b>
              <span>{fmtVotes(t.votes)} votes</span>
              {t.meta > 0 && <span>Metascore {t.meta}</span>}
            </p>
            <p class="tags">{t.genres.join(' · ')}</p>
          </div>
        </div>
        <div class="acts">
          <button class="btn" aria-pressed={mark === 'w'} onClick={() => onMark('w')}>
            <Bookmark fill={mark === 'w'} /> Watchlist
          </button>
          <button class="btn" aria-pressed={mark === 's'} onClick={() => onMark('s')}>
            <Check /> Seen
          </button>
        </div>
        {t.plot && <p class="plot">{t.plot}</p>}
        {t.kw.length > 0 && (
          <ul class="kws" aria-label="Keywords">
            {t.kw.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => onFilter({ q: k })} aria-label={`Filter by keyword ${k}`}>
                  {k}
                </button>
              </li>
            ))}
          </ul>
        )}
        <dl class="crew">
          {t.dir.length > 0 && (
            <>
              <dt>{t.type === 1 || t.type === 3 ? 'Creator' : 'Director'}</dt>
              <dd>
                {t.dir.map((d, i) => (
                  <span key={d}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      class="tag-btn"
                      onClick={() => onFilter({ q: d })}
                      aria-label={`Filter by ${d}`}
                    >
                      {d}
                    </button>
                  </span>
                ))}
              </dd>
            </>
          )}
          {t.cast.length > 0 && (
            <>
              <dt>Cast</dt>
              <dd>
                {t.cast.map((name, i) => (
                  <span key={name} class="role">
                    <button
                      type="button"
                      class="tag-btn"
                      onClick={() => onFilter({ q: name })}
                      aria-label={`Filter by cast ${name}`}
                    >
                      {name}
                    </button>
                    {t.chars[i] && <small> as {t.chars[i]}</small>}
                  </span>
                ))}
              </dd>
            </>
          )}
          {awards.length > 0 && (
            <>
              <dt>Awards</dt>
              <dd>{awards.join(', ')}</dd>
            </>
          )}
          {money.length > 0 && (
            <>
              <dt>Box office</dt>
              <dd>{money.join(' · ')}</dd>
            </>
          )}
          {(t.countries.length > 0 || t.langs.length > 0) && (
            <>
              <dt>Made in</dt>
              <dd>
                {t.countries.map((c, i) => (
                  <span key={c}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      class="tag-btn"
                      onClick={() => onFilter({ country: c, q: '' })}
                      aria-label={`Filter by country ${c}`}
                    >
                      {c}
                    </button>
                  </span>
                ))}
                {t.countries.length > 0 && t.langs.length > 0 && ' · '}
                {t.langs.map((l, i) => (
                  <span key={l}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      class="tag-btn"
                      onClick={() => onFilter({ lang: l, q: '' })}
                      aria-label={`Filter by language ${l}`}
                    >
                      {l}
                    </button>
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
        {similar.length > 0 && (
          <section class="more" aria-label="More like this">
            <h3>More like this</h3>
            <ul>
              {similar.map((s) => (
                <li key={s.id}>
                  <button onClick={() => onOpen(s)} aria-label={`${s.title}, ${fmtYears(s)}`}>
                    {s.poster ? (
                      <img
                        src={posterUrl(s.poster, 200)}
                        width="100"
                        height="148"
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span class="nopic">{s.title}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div class="acts">
          {t.trailer > 0 && (
            <a
              class="btn link"
              href={`https://www.imdb.com/video/vi${t.trailer}/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Trailer <External />
            </a>
          )}
          {(t.type === 1 || t.type === 3) && t.tmdb > 0 && (
            <a
              class="btn link"
              href={`https://seriesgraph.com/show/${t.tmdb}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ratings <External />
            </a>
          )}
          <a class="btn link" href={`https://www.imdb.com/title/${t.id}/`} target="_blank" rel="noopener noreferrer">
            IMDb <External />
          </a>
        </div>
      </div>
    </dialog>
  );
}
