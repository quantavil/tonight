import { Component } from 'preact';
import { fmtRating, fmtVotes, fmtYears, posterUrl, typeLabel, type Title } from './data.ts';
import { Bookmark, Check, Star } from './icons.tsx';
import type { Mark, Marks } from './marks.ts';

interface Props {
  titles: Title[];
  marks: Marks;
  onOpen: (t: Title) => void;
  selected: string | null;
}

interface CellProps {
  t: Title;
  m: Mark | undefined;
  sel: boolean;
  eager: boolean;
  top: boolean;
  onOpen: (t: Title) => void;
}

/**
 * One poster card. It re-renders only when its own title, mark or selection changes, so opening, stepping
 * through and closing a title does not diff all 500 cards (a visible hitch on a phone).
 */
class Cell extends Component<CellProps> {
  shouldComponentUpdate(n: CellProps) {
    const p = this.props;
    return (
      n.t !== p.t || n.m !== p.m || n.sel !== p.sel || n.onOpen !== p.onOpen || n.eager !== p.eager || n.top !== p.top
    );
  }
  render({ t, m, sel, eager, top, onOpen }: CellProps) {
    return (
      <li class="cell" data-m={m} data-sel={sel ? '' : undefined}>
        <button
          class="frame"
          data-id={t.id}
          onClick={() => onOpen(t)}
          aria-label={`${t.title}, ${fmtYears(t)}, rated ${fmtRating(t.rating)} from ${fmtVotes(t.votes)} votes${m === 'w' ? ', on watchlist' : m === 's' ? ', seen' : ''}`}
        >
          {t.poster ? (
            <img
              src={posterUrl(t.poster, 280)}
              width="140"
              height="207"
              alt=""
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              fetchpriority={top ? 'high' : undefined}
            />
          ) : (
            <span class="nopic">{t.title}</span>
          )}
          {t.rank > 0 && <span class="no">#{t.rank}</span>}
          <span class="rt">
            <Star />
            <span class="val">{fmtRating(t.rating)}</span>
            {t.votes > 0 && <span class="vt">{fmtVotes(t.votes)}</span>}
          </span>
          {m && <span class="mk">{m === 'w' ? <Bookmark fill /> : <Check />}</span>}
        </button>
        <p class="cap">
          <span class="tt">{t.title}</span>
          <span class="yr">{[fmtYears(t), typeLabel(t.type)].filter(Boolean).join(' · ')}</span>
        </p>
      </li>
    );
  }
}

export function List({ titles, marks, onOpen, selected }: Props) {
  return (
    <ol class="grid">
      {titles.map((t, i) => (
        // the first rows are the LCP: no lazy loading, no delay
        <Cell key={t.id} t={t} m={marks[t.id]?.m} sel={selected === t.id} eager={i < 12} top={i < 4} onOpen={onOpen} />
      ))}
    </ol>
  );
}
