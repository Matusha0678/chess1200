'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  fetchArchives, fetchMonthGames, parseGame, computeStats,
  type Game, type SyncState, type GameStats, type WDL,
} from '@/lib/chesscom';
import { ActivityHeatmap } from '@/components/stats/ActivityHeatmap';
import { opponentList, opponentNemesis, opponentBest, monthlyBreakdown, monthLabelRu } from '@/lib/games-aggregates';
import { evaluate as evaluateAchievements, CATEGORY_LABEL, CATEGORY_COLOR } from '@/lib/achievements';
import { AchievementIcon } from '@/components/AchievementIcon';

// ── Design tokens (inline, Ivory Dark) ───────────────────────────────────────

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
  color: 'var(--muted)', textTransform: 'uppercase',
};
const SECTION_HEAD: React.CSSProperties = {
  borderBottom: '1px solid var(--hairline)',
  display: 'flex', alignItems: 'center', gap: 12,
  minHeight: 40, paddingBottom: 8, marginBottom: 16,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}

function fmtSince(iso: string | null) {
  if (!iso) return 'никогда';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин. назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч. назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}

function wdlPct(wdl: WDL): number {
  const total = wdl.win + wdl.draw + wdl.loss;
  return total > 0 ? Math.round((wdl.win / total) * 100) : 0;
}

function wdlTotal(wdl: WDL) { return wdl.win + wdl.draw + wdl.loss; }

const TIME_CLASS_RU: Record<string, string> = {
  bullet: 'Пуля', blitz: 'Блиц', rapid: 'Рапид', daily: 'Ежедн.', classical: 'Классика',
};

// ── WDL bar ───────────────────────────────────────────────────────────────────

function WdlBar({ wdl }: { wdl: WDL }) {
  const total = wdlTotal(wdl);
  if (total === 0) return <span style={{ fontSize: 13, color: 'var(--muted)' }}>—</span>;
  const wp = Math.round((wdl.win / total) * 100);
  const dp = Math.round((wdl.draw / total) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: 'var(--ivory)' }}>П {wdl.win}</span>
        <span style={{ color: 'var(--muted)' }}>Н {wdl.draw}</span>
        <span style={{ color: 'var(--control)' }}>Пр {wdl.loss}</span>
        <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{wdlPct(wdl)}%</span>
      </div>
      <div style={{ display: 'flex', height: 2, background: 'var(--track)' }}>
        {wp > 0 && <span style={{ flex: `${wp} 1 0`, background: 'var(--ivory)' }} />}
        {dp > 0 && <span style={{ flex: `${dp} 1 0`, background: 'var(--control)' }} />}
        {(100 - wp - dp) > 0 && <span style={{ flex: `${100 - wp - dp} 1 0`, background: 'var(--track)' }} />}
      </div>
    </div>
  );
}

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: GameStats }) {
  const maxHour = Math.max(...stats.byHour, 1);
  const maxWd = Math.max(...stats.byWeekday.map(wdlTotal), 1);
  const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  const timeClasses = Object.entries(stats.byTimeClass)
    .sort((a, b) => wdlTotal(b[1]) - wdlTotal(a[1]));

  const totalWdl: WDL = { win: stats.white.win + stats.black.win, draw: stats.white.draw + stats.black.draw, loss: stats.white.loss + stats.black.loss };
  const totalGames = wdlTotal(totalWdl);
  const winPct = totalGames > 0 ? Math.round((totalWdl.win / totalGames) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Hero metrics strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
          <div style={{ ...HEADING, fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--ivory)', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{winPct}%</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>побед</div>
        </div>
        {stats.currentRating != null && (
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ ...HEADING, fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--ivory)', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>
              {stats.currentRating}
              {stats.ratingChange30d != null && stats.ratingChange30d !== 0 && (
                <span style={{ fontSize: 14, color: stats.ratingChange30d > 0 ? 'var(--accent)' : '#F08277', marginLeft: 6 }}>
                  {stats.ratingChange30d > 0 ? '+' : ''}{stats.ratingChange30d}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>рейтинг{stats.ratingChange30d != null ? ' · 30д' : ''}</div>
          </div>
        )}
        <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
          <div style={{ ...HEADING, fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--ivory)', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{stats.avgMoves}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>средних ходов</div>
        </div>
        {stats.avgAccuracy != null && (
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ ...HEADING, fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--ivory)', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{stats.avgAccuracy}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>точность %</div>
          </div>
        )}
        {stats.longestWinStreak > 1 && (
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ ...HEADING, fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--accent)', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>+{stats.longestWinStreak}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>побед подряд</div>
          </div>
        )}
        {stats.longestLossStreak > 1 && (
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ ...HEADING, fontSize: 30, fontWeight: 800, lineHeight: 1, color: '#F08277', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>−{stats.longestLossStreak}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>поражений подряд</div>
          </div>
        )}
      </div>

      {/* Row 1: color breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--hairline)' }}>
        {([
          ['ВСЕГО', totalWdl],
          ['БЕЛЫЕ ♙', stats.white],
          ['ЧЁРНЫЕ ♟', stats.black],
        ] as [string, WDL][]).map(([label, wdl]) => (
          <div key={label} style={{ padding: '16px 20px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={SECTION_LABEL}>{label}</span>
            <span style={{ ...HEADING, fontSize: 36, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {wdlTotal(wdl)}
            </span>
            <WdlBar wdl={wdl} />
          </div>
        ))}
      </div>

      {/* Row 2: by time class + top openings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>

        {/* Time class */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>По тайм-контролю</span>
          </div>
          {timeClasses.length === 0
            ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Нет данных</span>
            : timeClasses.map(([tc, wdl]) => (
              <div key={tc} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>
                    {TIME_CLASS_RU[tc] ?? tc}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {wdlTotal(wdl)} партий
                  </span>
                </div>
                <WdlBar wdl={wdl} />
              </div>
            ))
          }
        </div>

        {/* Top openings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>Топ дебютов</span>
          </div>
          {stats.topOpenings.map((op, i) => {
            const pct = op.count > 0 ? Math.round((op.wins / op.count) * 100) : 0;
            return (
              <div key={op.eco} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 40px 36px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {op.eco}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  {op.count}п
                </span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: pct >= 50 ? 'var(--ivory)' : 'var(--control)' }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 2.5: by weekday + by opponent strength */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>

        {/* Weekday */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>По дням недели</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, alignItems: 'end' }}>
            {stats.byWeekday.map((wdl, i) => {
              const total = wdlTotal(wdl);
              const h = total === 0 ? 4 : Math.max(8, Math.round((total / maxWd) * 100));
              const winPct = total > 0 ? Math.round((wdl.win / total) * 100) : 0;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: '70%', height: h, background: total === 0 ? 'var(--hairline)' : 'color-mix(in srgb, var(--accent) 50%, var(--surface))', position: 'relative', transition: 'height 0.3s' }}>
                    {total > 0 && (
                      <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{winPct}%</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{WEEKDAYS[i]}</div>
                  <div style={{ fontSize: 10, color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>{total}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Opponent strength */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>По силе соперника</span>
          </div>
          {([
            ['Слабее меня (−50+)', stats.byOppStrength.weaker],
            ['Равный (±50)', stats.byOppStrength.even],
            ['Сильнее меня (+50+)', stats.byOppStrength.stronger],
          ] as [string, WDL][]).map(([label, wdl]) => {
            const total = wdlTotal(wdl);
            const winPct = total > 0 ? Math.round((wdl.win / total) * 100) : 0;
            return (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>{label}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {total} · <strong style={{ color: 'var(--ivory)' }}>{winPct}%</strong>
                  </span>
                </div>
                {total > 0 && <WdlBar wdl={wdl} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 2.6: extremes (longest game, shortest win, best/worst accuracy) */}
      {(stats.longestGame || stats.shortestWin || stats.bestAccuracyWin || stats.worstAccuracyLoss) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>Экстремумы</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {stats.longestGame && (
              <Link href={`/games/${stats.longestGame.id}`} className="ui-card" style={{ padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.08 }}>САМАЯ ДЛИННАЯ</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginTop: 4 }}>{stats.longestGame.moves_count} ходов</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>против {stats.longestGame.opp_name || '?'} · {stats.longestGame.result === 'win' ? '+' : stats.longestGame.result === 'loss' ? '−' : '='}</div>
              </Link>
            )}
            {stats.shortestWin && (
              <Link href={`/games/${stats.shortestWin.id}`} className="ui-card" style={{ padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.08 }}>БЫСТРАЯ ПОБЕДА</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginTop: 4 }}>{stats.shortestWin.moves_count} ходов</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>против {stats.shortestWin.opp_name || '?'}</div>
              </Link>
            )}
            {stats.bestAccuracyWin && (
              <Link href={`/games/${stats.bestAccuracyWin.id}`} className="ui-card" style={{ padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.08 }}>ЛУЧШАЯ ТОЧНОСТЬ (ПОБЕДА)</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', marginTop: 4 }}>{stats.bestAccuracyWin.color === 'white' ? stats.bestAccuracyWin.accuracy_white : stats.bestAccuracyWin.accuracy_black}%</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>против {stats.bestAccuracyWin.opp_name || '?'}</div>
              </Link>
            )}
            {stats.worstAccuracyLoss && (
              <Link href={`/games/${stats.worstAccuracyLoss.id}`} className="ui-card" style={{ padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ fontSize: 11, color: '#F08277', fontWeight: 700, letterSpacing: 0.08 }}>ХУДШАЯ ТОЧНОСТЬ (ПОРАЖЕНИЕ)</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#F08277', marginTop: 4 }}>{stats.worstAccuracyLoss.color === 'white' ? stats.worstAccuracyLoss.accuracy_white : stats.worstAccuracyLoss.accuracy_black}%</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>против {stats.worstAccuracyLoss.opp_name || '?'}</div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Row 3: by hour */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={SECTION_HEAD}>
          <span style={SECTION_LABEL}>По часу суток</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 24px' }}>
          {stats.byHour.map((count, h) => {
            if (count === 0) return null;
            const pct = Math.round((count / maxHour) * 100);
            return (
              <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
                  {String(h).padStart(2, '0')}:00
                </span>
                <div style={{ flex: 1, height: 2, background: 'var(--track)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ivory)' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 20, textAlign: 'right' }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

interface Filters {
  color: '' | 'white' | 'black';
  timeClass: string;
  result: '' | 'win' | 'draw' | 'loss';
  eco: string;
  rep: '' | 'deviation';
}

function FilterBar({
  filters, onChange, timeClasses, ecoOptions,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  timeClasses: string[];
  ecoOptions: string[];
}) {
  const sel: React.CSSProperties = {
    height: 36, padding: '0 10px', fontSize: 13,
    background: 'var(--surface)', color: 'var(--ivory)',
    border: '1px solid var(--hairline)', cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <select style={sel} value={filters.color}
        onChange={e => onChange({ ...filters, color: e.target.value as Filters['color'] })}>
        <option value=''>Все цвета</option>
        <option value='white'>♙ Белые</option>
        <option value='black'>♟ Чёрные</option>
      </select>

      <select style={sel} value={filters.timeClass}
        onChange={e => onChange({ ...filters, timeClass: e.target.value })}>
        <option value=''>Все контроли</option>
        {timeClasses.map(tc => (
          <option key={tc} value={tc}>{TIME_CLASS_RU[tc] ?? tc}</option>
        ))}
      </select>

      <select style={sel} value={filters.result}
        onChange={e => onChange({ ...filters, result: e.target.value as Filters['result'] })}>
        <option value=''>Все результаты</option>
        <option value='win'>Победа</option>
        <option value='draw'>Ничья</option>
        <option value='loss'>Поражение</option>
      </select>

      <input
        type='text' placeholder='Дебют…' value={filters.eco}
        onChange={e => onChange({ ...filters, eco: e.target.value })}
        list='eco-list'
        style={{ ...sel, width: 180 }}
      />
      <datalist id='eco-list'>
        {ecoOptions.slice(0, 50).map(e => <option key={e} value={e} />)}
      </datalist>

      <button
        onClick={() => onChange({ ...filters, rep: filters.rep === 'deviation' ? '' : 'deviation' })}
        style={{ height: 36, padding: '0 12px', fontSize: 13, background: filters.rep === 'deviation' ? 'var(--accent)' : 'var(--surface)', color: filters.rep === 'deviation' ? '#fff' : 'var(--ivory)', border: '1px solid var(--hairline)', cursor: 'pointer', borderRadius: 4 }}
      >
        📖 Отошёл от линии
      </button>

      {(filters.color || filters.timeClass || filters.result || filters.eco || filters.rep) && (
        <button
          onClick={() => onChange({ color: '', timeClass: '', result: '', eco: '', rep: '' })}
          style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
        >
          × Сбросить
        </button>
      )}
    </div>
  );
}

// ── Games list ────────────────────────────────────────────────────────────────

const RESULT_LABEL: Record<string, string> = { win: 'Победа', draw: 'Ничья', loss: 'Поражение' };
const RESULT_COLOR: Record<string, string> = {
  win: 'var(--ivory)', draw: 'var(--muted)', loss: 'var(--control)',
};

function AccLabel({ g }: { g: Game }) {
  const myAcc = g.color === 'white' ? g.accuracy_white : g.accuracy_black;
  if (myAcc === null || myAcc === undefined) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>;
  const color = myAcc >= 85 ? 'var(--accent)' : myAcc >= 70 ? 'var(--ivory)' : 'var(--control)';
  return <span style={{ fontSize: 12, color, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Math.round(myAcc)}%</span>;
}

const REP_STATUS_COLOR: Record<string, string> = {
  in_line: 'var(--accent)', deviation: '#F08277', hole: '#F0A43A',
};
const REP_STATUS_TITLE: Record<string, string> = {
  in_line: 'По линии', deviation: 'Отошёл от линии', hole: 'Дыра в линиях',
};

function RepMark({ status }: { status: string | null }) {
  if (!status || !REP_STATUS_COLOR[status]) return null;
  return (
    <span
      data-ui="rep-mark"
      title={REP_STATUS_TITLE[status] ?? ''}
      style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6, flexShrink: 0 }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={REP_STATUS_COLOR[status]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    </span>
  );
}

function GameRow({ g, repStatus }: { g: Game; repStatus: string | null }) {
  return (
    <a
      href={`/games/${g.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 24px minmax(100px,1fr) 60px minmax(60px,1fr) 44px 44px',
        columnGap: 12, alignItems: 'center',
        padding: '10px 0', borderBottom: '1px solid var(--hairline)',
        color: 'var(--ivory)', textDecoration: 'none',
      }}
      className='row-hover-link'
    >
      <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
        {fmtDate(g.played_at)}
      </span>
      <span style={{ fontSize: 16, lineHeight: 1 }}>
        {g.color === 'white' ? '♙' : '♟'}
      </span>
      <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
        {g.opp_name}
        {g.rating_opp != null && (
          <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{g.rating_opp}</span>
        )}
        <RepMark status={repStatus} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: RESULT_COLOR[g.result] }}>
        {RESULT_LABEL[g.result]}
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {g.eco_name || '—'}
      </span>
      <AccLabel g={g} />
      <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {g.moves_count}
      </span>
    </a>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface SyncProgress {
  phase: string;
  archive: number;
  total: number;
  added: number;
  skipped: number;
  errors: number;
}

const PAGE_SIZE = 60;
const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function GamesPageInner() {
  const searchParams = useSearchParams();
  const initRep = searchParams.get('rep') === 'deviation' ? 'deviation' : '';

  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [repStatuses, setRepStatuses] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncDone, setSyncDone] = useState<{ added: number; errors: number } | null>(null);
  const [filters, setFilters] = useState<Filters>({ color: '', timeClass: '', result: '', eco: '', rep: initRep as '' | 'deviation' });
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(false);
  const [userInput, setUserInput] = useState('');
  const syncRunning = useRef(false);

  // ── Load from Supabase ────────────────────────────────────────────────────
  // No synchronous setState: all state updates happen after the first await,
  // so the React Compiler's set-state-in-effect rule does not fire.

  async function loadData() {
    const [{ data: stateData }, { data: gamesData }, { data: goData }] = await Promise.all([
      supabase.from('games_sync_state').select('*').eq('id', 1).single(),
      supabase.from('games').select('*').order('played_at', { ascending: false }),
      supabase.from('game_openings').select('game_id, status'),
    ]);
    if (stateData) setSyncState(stateData as SyncState);
    if (gamesData) setGames(gamesData as Game[]);
    if (goData) setRepStatuses(new Map((goData as Array<{ game_id: string; status: string }>).map(r => [r.game_id, r.status])));
    setLoading(false);
  }

  // ── Sync ─────────────────────────────────────────────────────────────────
  // Defined before the effects that call it to avoid the forward-reference error.

  async function startSync(username: string, alreadySynced: string[]) {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setSyncing(true);
    setSyncDone(null);

    let added = 0;
    let errors = 0;
    const newlySynced = [...alreadySynced];

    try {
      setSyncProgress({ phase: 'Загружаем архивы…', archive: 0, total: 0, added: 0, skipped: 0, errors: 0 });
      const archives = await fetchArchives(username);

      const now = new Date();
      const currentArchive = `https://api.chess.com/pub/player/${username}/games/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      const toProcess = archives.filter(a => !alreadySynced.includes(a) || a === currentArchive);

      setSyncProgress(p => p ? { ...p, phase: 'Скачиваем партии…', total: toProcess.length } : null);

      for (let i = 0; i < toProcess.length; i++) {
        const archiveUrl = toProcess[i];
        setSyncProgress(p => p ? { ...p, archive: i + 1, phase: `Архив ${i + 1}/${toProcess.length}` } : null);

        try {
          const rawGames = await fetchMonthGames(archiveUrl);
          const parsed = rawGames
            .map(g => parseGame(g, username))
            .filter((g): g is NonNullable<typeof g> => g !== null);

          if (parsed.length > 0) {
            const rows = parsed.map(g => ({ ...g, source: 'chesscom' }));
            for (let j = 0; j < rows.length; j += 100) {
              const { error } = await supabase
                .from('games')
                .upsert(rows.slice(j, j + 100), { onConflict: 'url', ignoreDuplicates: true });
              if (!error) added += rows.slice(j, j + 100).length;
            }
          }

          if (archiveUrl !== currentArchive && !newlySynced.includes(archiveUrl)) {
            newlySynced.push(archiveUrl);
          }
        } catch {
          errors++;
        }

        setSyncProgress(p => p ? { ...p, added, errors } : null);
      }

      await supabase.from('games_sync_state').upsert({
        id: 1,
        username,
        last_synced_at: new Date().toISOString(),
        synced_archives: newlySynced,
      });

      setSyncDone({ added, errors });
      await loadData();
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncDone({ added, errors: errors + 1 });
    } finally {
      syncRunning.current = false;
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  // Auto-sync once per hour on page open
  useEffect(() => {
    if (!syncState || syncRunning.current) return;
    const lastSync = syncState.last_synced_at ? new Date(syncState.last_synced_at).getTime() : 0;
    if (Date.now() - lastSync > SYNC_COOLDOWN_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void startSync(syncState.username, syncState.synced_archives ?? []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState]);

  // ── Username save ─────────────────────────────────────────────────────────

  async function saveUsername() {
    const u = userInput.trim().toLowerCase();
    if (!u) return;
    await supabase.from('games_sync_state').upsert({ id: 1, username: u });
    setSyncState(s => s ? { ...s, username: u, synced_archives: [] } : null);
    setEditingUser(false);
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const stats = computeStats(games);

  const ecoOptions = [...new Set(games.map(g => g.eco_name).filter(Boolean))].sort();
  const timeClasses = [...new Set(games.map(g => g.time_class))].sort();

  const filtered = games.filter(g => {
    if (filters.color && g.color !== filters.color) return false;
    if (filters.timeClass && g.time_class !== filters.timeClass) return false;
    if (filters.result && g.result !== filters.result) return false;
    if (filters.eco && !g.eco_name.toLowerCase().includes(filters.eco.toLowerCase())) return false;
    if (filters.rep === 'deviation' && repStatuses.get(g.id) !== 'deviation') return false;
    return true;
  });

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page animate-pulse">
        <div style={{ height: 60, width: 220, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
        <div style={{ height: 120, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
        <div style={{ height: 400, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
      </div>
    );
  }

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Партии</h1>
          {/* Username */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {editingUser ? (
              <>
                <input
                  autoFocus
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') setEditingUser(false); }}
                  className="ui-input"
                  style={{ width: 160 }}
                />
                <button onClick={saveUsername} className="ui-btn ui-btn-primary ui-btn-sm">Сохранить</button>
                <button onClick={() => setEditingUser(false)} className="ui-btn ui-btn-outline ui-btn-sm">Отмена</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>chess.com / <span style={{ color: 'var(--ivory)' }}>{syncState?.username ?? '—'}</span></span>
                <button onClick={() => { setUserInput(syncState?.username ?? ''); setEditingUser(true); }} style={{ fontSize: 12, color: 'var(--control)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>изменить</button>
              </>
            )}
          </div>
        </div>

        {/* Sync controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {syncing && syncProgress ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
              <div>{syncProgress.phase}</div>
              {syncProgress.total > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div className="progress-track" style={{ width: 180 }}>
                    <div className="progress-fill" style={{ width: `${Math.round((syncProgress.archive / syncProgress.total) * 100)}%` }} />
                  </div>
                </div>
              )}
              {syncProgress.added > 0 && <div style={{ marginTop: 4 }}>+{syncProgress.added} партий</div>}
            </div>
          ) : syncDone ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
              Готово. Добавлено {syncDone.added}
              {syncDone.errors > 0 && `, ошибок ${syncDone.errors}`}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Синхр. {fmtSince(syncState?.last_synced_at ?? null)}
            </div>
          )}
          <button
            onClick={() => syncState && startSync(syncState.username, syncState.synced_archives ?? [])}
            disabled={syncing}
            className={`ui-btn ${syncing ? 'ui-btn-outline' : 'ui-btn-primary'}`}
          >
            {syncing ? 'Синхронизация…' : 'Синхронизировать'}
          </button>
        </div>
      </div>

      {/* ── Related pages ── */}
      {games.length > 0 && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <Link href="/games/openings" className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-btn, 4px)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>♟</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>Я против дебютов</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Где отхожу от сохранённых линий</div>
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 14, opacity: 0.6 }}>→</span>
          </Link>
          <Link href="/stats" className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-btn, 4px)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>Σ</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>Где я теряю очки</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Статистика по фазам и темам</div>
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 14, opacity: 0.6 }}>→</span>
          </Link>
          <Link href="/repertoire" className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-btn, 4px)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>♟</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>Дебюты в партиях</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Что играю и где ухожу от линий</div>
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 14, opacity: 0.6 }}>→</span>
          </Link>
        </section>
      )}

      {/* ── Personal records ── */}
      {games.length > 0 && (() => {
        // Max games in a single day
        const byDay = new Map<string, number>();
        for (const g of games) {
          if (!g.played_at) continue;
          const d = g.played_at.slice(0, 10);
          byDay.set(d, (byDay.get(d) ?? 0) + 1);
        }
        let maxDayGames = 0, maxDay = '';
        for (const [d, c] of byDay) if (c > maxDayGames) { maxDayGames = c; maxDay = d; }

        const records = [
          { label: 'Пик рейтинга', value: stats.maxRating?.toString() ?? '—', color: 'var(--accent)' },
          { label: 'Серия побед', value: stats.longestWinStreak > 0 ? `+${stats.longestWinStreak}` : '—', color: 'var(--accent)' },
          { label: 'Длиннейшая партия', value: stats.longestGame ? `${stats.longestGame.moves_count} ходов` : '—', color: 'var(--ivory)' },
          { label: 'Пик за день', value: maxDayGames > 0 ? `${maxDayGames} партий` : '—', color: 'var(--ivory)', sub: maxDay ? maxDay : undefined },
          { label: 'Всего ходов', value: games.reduce((s, g) => s + (g.moves_count || 0), 0).toString(), color: 'var(--ivory)' },
          { label: 'Уникальных ЭКО', value: new Set(games.map(g => g.eco_name).filter(Boolean)).size.toString(), color: 'var(--ivory)' },
        ];

        return (
          <section>
            <div style={SECTION_HEAD}>
              <span style={SECTION_LABEL}>Личные рекорды</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {records.map(r => (
                <div key={r.label} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>{r.label}</div>
                  <div style={{ ...HEADING, fontSize: 24, fontWeight: 800, color: r.color, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{r.value}</div>
                  {r.sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{r.sub}</div>}
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* ── Activity heatmap ── */}
      {games.length > 0 && (
        <section style={{ padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
          <ActivityHeatmap games={games} weeks={26} />
        </section>
      )}

      {/* ── Monthly comparison ── */}
      {games.length > 0 && (() => {
        const monthly = monthlyBreakdown(games, 4);
        if (monthly.length < 1) return null;
        return (
          <section>
            <div style={SECTION_HEAD}>
              <span style={SECTION_LABEL}>По месяцам</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {monthly.map((m, idx) => {
                const prev = monthly[idx + 1];
                const trend = prev ? m.winPct - prev.winPct : null;
                return (
                  <div key={m.month} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>{monthLabelRu(m.month)}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                      <div style={{ ...HEADING, fontSize: 28, fontWeight: 800, color: 'var(--ivory)', letterSpacing: '-0.025em', lineHeight: 1 }}>{m.winPct}%</div>
                      {trend != null && trend !== 0 && (
                        <span style={{ fontSize: 13, color: trend > 0 ? 'var(--accent)' : '#F08277', fontWeight: 600 }}>
                          {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      {m.games} партий · +{m.wins} ={m.draws} −{m.losses}
                      {m.avgRating != null && <> · {m.avgRating}</>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ── Achievements ── */}
      {games.length > 0 && (() => {
        const achievements = evaluateAchievements({ games, stats, totalLines: 0, masteredLines: 0, totalOpenings: 0, streak: 0 });
        const earned = achievements.filter(a => a.earned);
        const pending = achievements.filter(a => !a.earned).slice(0, 4);
        return (
          <section>
            <div style={SECTION_HEAD}>
              <span style={SECTION_LABEL}>Достижения</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{earned.length} из {achievements.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {[...earned, ...pending].map(a => (
                <div key={a.id} style={{
                  padding: '14px 14px',
                  background: a.earned
                    ? `color-mix(in srgb, ${CATEGORY_COLOR[a.category]} 12%, var(--surface))`
                    : 'var(--surface)',
                  border: `1px solid ${a.earned
                    ? `color-mix(in srgb, ${CATEGORY_COLOR[a.category]} 35%, var(--hairline))`
                    : 'var(--hairline)'}`,
                  borderRadius: 'var(--radius-card, 0px)',
                  opacity: a.earned ? 1 : 0.55,
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: a.earned ? CATEGORY_COLOR[a.category] : 'var(--muted)', display: 'inline-flex' }}>
                      <AchievementIcon name={a.icon} size={18} />
                    </span>
                    <div style={{ fontSize: 10, fontWeight: 700, color: a.earned ? CATEGORY_COLOR[a.category] : 'var(--muted)', letterSpacing: 0.08, textTransform: 'uppercase' }}>{CATEGORY_LABEL[a.category]}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ivory)', marginTop: 2 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.35 }}>{a.desc}</div>
                  {!a.earned && a.target > 1 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ height: 3, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round((a.progress / a.target) * 100)}%`, height: '100%', background: CATEGORY_COLOR[a.category] }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{a.progress}/{a.target}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* ── Opponents ── */}
      {games.length > 0 && (() => {
        const nemesis = opponentNemesis(games);
        const best = opponentBest(games);
        const top = opponentList(games, 10);
        if (top.length === 0) return null;
        return (
          <section>
            <div style={SECTION_HEAD}>
              <span style={SECTION_LABEL}>Соперники</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(nemesis || best) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  {nemesis && nemesis.games >= 3 && (
                    <div style={{ padding: '14px 16px', background: 'color-mix(in srgb, #E0574A 10%, var(--surface))', border: '1px solid color-mix(in srgb, #E0574A 30%, var(--hairline))', borderRadius: 'var(--radius-card, 0px)' }}>
                      <div style={{ fontSize: 11, color: '#E0574A', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>НЕМЕЗИДА</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)', marginTop: 4 }}>{nemesis.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        +{nemesis.wins} ={nemesis.draws} −{nemesis.losses} ({Math.round((nemesis.wins / nemesis.games) * 100)}% побед)
                        {nemesis.avgRating != null && <> · {nemesis.avgRating}</>}
                      </div>
                    </div>
                  )}
                  {best && best.games >= 2 && (
                    <div style={{ padding: '14px 16px', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--hairline))', borderRadius: 'var(--radius-card, 0px)' }}>
                      <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>УДОБНЫЙ СОПЕРНИК</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)', marginTop: 4 }}>{best.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        +{best.wins} ={best.draws} −{best.losses} ({Math.round((best.wins / best.games) * 100)}% побед)
                        {best.avgRating != null && <> · {best.avgRating}</>}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {top.map((o, i) => {
                  const total = o.games;
                  const winPct = total > 0 ? Math.round((o.wins / total) * 100) : 0;
                  return (
                    <div key={o.name} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 60px 60px', gap: 10, alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ fontSize: 13, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{total} партий</span>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: winPct >= 50 ? 'var(--ivory)' : 'var(--control)' }}>{winPct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── Stats ── */}
      {games.length > 0 && (
        <section>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>Статистика</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{games.length} партий</span>
          </div>
          <StatsPanel stats={stats} />
        </section>
      )}

      {/* ── Games list ── */}
      <section>
        <div style={SECTION_HEAD}>
          <span style={SECTION_LABEL}>Партии</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} из {games.length}</span>
        </div>

        {games.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>Нет партий. Нажми «Синхронизировать».</p>
          </div>
        ) : (
          <>
            <FilterBar filters={filters} onChange={f => { setFilters(f); setPage(1); }} timeClasses={timeClasses} ecoOptions={ecoOptions} />

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '72px 24px minmax(100px,1fr) 60px minmax(60px,1fr) 44px 44px', columnGap: 12, padding: '10px 0', borderBottom: '1px solid var(--hairline)' }}>
              {['ДАТА', '', 'СОПЕРНИК', 'РЕЗУЛЬТАТ', 'ДЕБЮТ', 'ТОЧН.', 'ХОДОВ'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            {paged.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--muted)', padding: '24px 0' }}>Нет партий по фильтру.</p>
            ) : (
              paged.map(g => <GameRow key={g.id} g={g} repStatus={repStatuses.get(g.id) ?? null} />)
            )}

            {hasMore && (
              <div style={{ paddingTop: 20 }}>
                <button
                  onClick={() => setPage(p => p + 1)}
                  style={{ height: 40, padding: '0 24px', fontSize: 13, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', cursor: 'pointer' }}
                >
                  Показать ещё ({filtered.length - paged.length})
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default function GamesPage() {
  return (
    <Suspense>
      <GamesPageInner />
    </Suspense>
  );
}
