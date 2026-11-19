'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DEMO_STATS } from '@/lib/demo-positions';
import type { DemoInsight } from '@/lib/demo-positions';
import { pluralGames } from '@/lib/plural';

// ── Types ─────────────────────────────────────────────────────────────────────

type StatsSection = 'losses' | 'phases' | 'time' | 'openings' | 'rating';
type PeriodFilter = '30d' | '90d' | 'all';
type ColorFilter = 'w' | 'b' | 'all';
type TimeFilter = 'rapid' | 'blitz' | 'all';

interface StatsFilters {
  period: PeriodFilter;
  color: ColorFilter;
  time: TimeFilter;
}

const FILTERS_KEY = 'stats-filters';
const DEFAULT_FILTERS: StatsFilters = { period: '30d', color: 'all', time: 'all' };

function loadFilters(): StatsFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: StatsFilters) {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

// ── Loss group computation ────────────────────────────────────────────────────

interface LossGroup {
  key: string;
  label: string;
  losses: number;
  games: DemoInsight[];
}

function computeLossGroups(insights: DemoInsight[]): LossGroup[] {
  const groups: LossGroup[] = [
    { key: 'time_trouble', label: 'Цейтнот', losses: 0, games: [] },
    { key: 'dev_opening', label: 'Отход от линий', losses: 0, games: [] },
    { key: 'err_opening', label: 'Ошибки в дебюте', losses: 0, games: [] },
    { key: 'err_middlegame', label: 'Ошибки в миттельшпиле', losses: 0, games: [] },
    { key: 'err_endgame', label: 'Ошибки в эндшпиле', losses: 0, games: [] },
    { key: 'missed_win', label: 'Не дожал', losses: 0, games: [] },
  ];

  for (const ins of insights) {
    const pts = ins.result === 'loss' ? 1 : ins.result === 'draw' ? 0.5 : 0;
    if (ins.time_trouble) {
      groups[0].losses += pts; groups[0].games.push(ins);
    }
    if (ins.decisive_phase === 'opening' && ins.decisive_cls === 'mistake') {
      groups[1].losses += pts; groups[1].games.push(ins);
    } else if (ins.decisive_phase === 'opening') {
      groups[2].losses += pts; groups[2].games.push(ins);
    } else if (ins.decisive_phase === 'middlegame') {
      groups[3].losses += pts; groups[3].games.push(ins);
    } else if (ins.decisive_phase === 'endgame') {
      groups[4].losses += pts; groups[4].games.push(ins);
    }
    if (ins.missed_win) {
      groups[5].losses += pts; groups[5].games.push(ins);
    }
  }

  return groups.filter(g => g.games.length > 0).sort((a, b) => b.losses - a.losses);
}

// ── Phase row component ────────────────────────────────────────────────────────

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '5px 2px', border: 'none',
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--ivory)' : 'var(--muted)',
        fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: 'pointer', borderRadius: 'var(--radius-btn, 0px)',
        fontFamily: 'inherit', transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ── Stats page inner ───────────────────────────────────────────────────────────

function StatsPageInner() {
  const { S } = useTrainerGeometry();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === '1';

  const [insights, setInsights] = useState<DemoInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StatsFilters>(DEFAULT_FILTERS);
  const [section, setSection] = useState<StatsSection>('losses');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [boardFen, setBoardFen] = useState('start');

  // Load filters from localStorage
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(loadFilters());
  }, []);

  // Load insights
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (isDemo) {
          setInsights([...DEMO_STATS.insights]);
        } else {
          const { loadInsights } = await import('@/lib/insights-store');
          const data = await loadInsights(false);
          setInsights(data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [isDemo]);

  const updateFilters = useCallback((update: Partial<StatsFilters>) => {
    setFilters(prev => {
      const next = { ...prev, ...update };
      saveFilters(next);
      return next;
    });
  }, []);

  // Filter insights
  const filteredInsights = insights.filter(ins => {
    if (filters.color !== 'all' && ins.my_color !== filters.color) return false;
    if (filters.time !== 'all' && ins.time_class !== filters.time) return false;
    if (filters.period !== 'all') {
      const days = filters.period === '30d' ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      if (new Date(ins.date) < cutoff) return false;
    }
    return true;
  });

  const lossGroups = computeLossGroups(filteredInsights);
  const totalLosses = lossGroups.reduce((s, g) => s + g.losses, 0);
  const wins = filteredInsights.filter(i => i.result === 'win').length;
  const losses = filteredInsights.filter(i => i.result === 'loss').length;
  const missedWin = filteredInsights.filter(i => i.missed_win).length;
  const percent = filteredInsights.length > 0 ? Math.round((wins / filteredInsights.length) * 100) : 0;

  // Active group examples
  const examples = useMemo(() => {
    const activeGroupData = lossGroups.find(g => g.key === activeGroup);
    return activeGroupData?.games ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, filteredInsights]);

  // Set board FEN when example changes
  useEffect(() => {
    if (examples.length > 0 && exampleIdx < examples.length) {
      const ex = examples[exampleIdx];
      if (ex.decisive_fen) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBoardFen(ex.decisive_fen);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBoardFen('start');
      }
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBoardFen('start');
    }
  }, [examples, exampleIdx]);

  const handleGroupClick = useCallback((key: string) => {
    setActiveGroup(prev => prev === key ? null : key);
    setExampleIdx(0);
  }, []);

  // Board arrows
  const boardArrows: BoardArrow[] = [];
  if (examples.length > 0 && exampleIdx < examples.length) {
    const ex = examples[exampleIdx];
    if (ex.decisive_fen && ex.decisive_san) {
      // Red arrow for played move (we show the decisive FEN, so we highlight the best move)
      if (ex.decisive_best && ex.decisive_best.length >= 4) {
        boardArrows.push({
          from: ex.decisive_best.slice(0, 2) as Square,
          to: ex.decisive_best.slice(2, 4) as Square,
          color: 'var(--accent)', style: 'dashed', role: 'best',
        });
      }
    }
  }

  // Board orientation - use my_color of current example
  const currentEx = examples.length > 0 && exampleIdx < examples.length ? examples[exampleIdx] : null;
  const boardOrientation = currentEx?.my_color === 'b' ? 'black' : 'white';

  // Check board FEN validity
  let validFen = boardFen;
  try {
    if (boardFen !== 'start') new Chess(boardFen);
  } catch {
    validFen = 'start';
  }

  // ── Rating section simple chart ─────────────────────────────────────────────

  const ratingData = isDemo ? DEMO_STATS.rating : [];
  const minRating = ratingData.length ? Math.min(...ratingData.map(d => d.rating)) - 20 : 1100;
  const maxRating = ratingData.length ? Math.max(...ratingData.map(d => d.rating)) + 20 : 1300;
  const currentRating = ratingData.length ? ratingData[ratingData.length - 1].rating : null;
  const startRating30d = (() => {
    if (!ratingData.length) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const before = ratingData.filter(d => new Date(d.date) < cutoff);
    return before.length ? before[before.length - 1].rating : ratingData[0].rating;
  })();
  const ratingChange = currentRating && startRating30d ? currentRating - startRating30d : null;

  // ── Sections ─────────────────────────────────────────────────────────────────

  const SECTION_ITEMS: { key: StatsSection; label: string }[] = [
    { key: 'losses', label: 'Где теряю очки' },
    { key: 'phases', label: 'Стадии партии' },
    { key: 'time', label: 'Время' },
    { key: 'openings', label: 'Дебюты' },
    { key: 'rating', label: 'Рейтинг' },
  ];

  // ── Session panel ─────────────────────────────────────────────────────────────

  const session = (
    <SessionPanel
      title="Мои очки"
      rightNote={`${filteredInsights.length} ${pluralGames(filteredInsights.length)}`}
      stats={[
        { label: 'очков', value: percent, color: 'var(--accent)' },
        { label: 'поражений', value: losses, color: '#F08277' },
        { label: 'не дожал', value: missedWin, color: '#F4B45C' },
      ]}
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Period filter */}
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>Период</div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
            {(['30d', '90d', 'all'] as const).map(p => (
              <SegBtn key={p} active={filters.period === p} onClick={() => updateFilters({ period: p })}>
                {p === '30d' ? '30д' : p === '90d' ? '90д' : 'Всё'}
              </SegBtn>
            ))}
          </div>
          {/* Color filter */}
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 2 }}>Цвет</div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
            {(['w', 'b', 'all'] as const).map(c => (
              <SegBtn key={c} active={filters.color === c} onClick={() => updateFilters({ color: c })}>
                {c === 'w' ? 'Белые' : c === 'b' ? 'Чёрные' : 'Все'}
              </SegBtn>
            ))}
          </div>
          {/* Time filter */}
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 2 }}>Контроль</div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
            {(['rapid', 'blitz', 'all'] as const).map(t => (
              <SegBtn key={t} active={filters.time === t} onClick={() => updateFilters({ time: t })}>
                {t === 'rapid' ? 'Рапид' : t === 'blitz' ? 'Блиц' : 'Все'}
              </SegBtn>
            ))}
          </div>
        </div>
      }
      list={
        SECTION_ITEMS.map(({ key, label }) => {
          const isActive = section === key;
          return (
            <div
              key={key}
              onClick={() => setSection(key)}
              style={{
                padding: '10px 10px',
                cursor: 'pointer',
                borderRadius: 6,
                background: isActive ? 'var(--surface-2)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                fontSize: 14, color: isActive ? 'var(--ivory)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 400,
                transition: 'background 0.15s',
              }}
            >
              {label}
            </div>
          );
        })
      }
      footer={
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Посчитано {insights.length} {pluralGames(insights.length)}
          </div>
          <button
            style={{
              width: '100%', padding: '8px 0',
              background: 'var(--surface-2)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-btn, 0px)',
              color: 'var(--ivory)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Пересчитать
          </button>
        </div>
      }
    />
  );

  // ── Top bar ───────────────────────────────────────────────────────────────────

  const topBarText = currentEx
    ? `${currentEx.opp} · ${currentEx.date.slice(0, 10)} · ${currentEx.decisive_move_number ?? '?'}-й ход`
    : 'Статистика партий';

  // ── Right panel content ───────────────────────────────────────────────────────

  let panelContent: React.ReactNode = null;

  if (loading) {
    panelContent = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}>Загружаю партии...</span>
      </div>
    );
  } else if (error) {
    panelContent = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 15, color: '#F08277' }}>{error}</span>
      </div>
    );
  } else if (filteredInsights.length === 0) {
    panelContent = (
      <div data-ui="stats-empty" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}>Нет партий для анализа</span>
        <span style={{ fontSize: 13, color: 'var(--faint)' }}>Импортируй партии из Chess.com</span>
      </div>
    );
  } else if (section === 'losses') {
    panelContent = (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Insight summary */}
        {lossGroups.length > 0 && (
          <div data-ui="stats-insight" style={{
            padding: '12px 14px', background: 'var(--surface-2)',
            border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)',
            fontSize: 13, color: 'var(--muted)', lineHeight: 1.5,
          }}>
            Больше всего очков уходит на <strong style={{ color: 'var(--ivory)' }}>{lossGroups[0]?.label ?? '—'}</strong>:{' '}
            −{lossGroups[0]?.losses.toFixed(1)} из {totalLosses.toFixed(1)}{' '}
            ({totalLosses > 0 ? Math.round((lossGroups[0]?.losses / totalLosses) * 100) : 0}%)
          </div>
        )}

        {/* Loss groups */}
        {lossGroups.map(group => {
          const isActive = activeGroup === group.key;
          return (
            <div key={group.key}>
              <div
                data-ui="stats-row"
                onClick={() => handleGroupClick(group.key)}
                style={{
                  padding: '12px 14px',
                  background: isActive ? 'var(--surface-2)' : 'var(--surface)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--hairline)'}`,
                  borderRadius: 'var(--radius-card, 0px)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>{group.label}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>
                      {group.games.length}/{filteredInsights.length}
                    </span>
                  </div>
                  <button
                    data-ui="stats-train"
                    onClick={e => { e.stopPropagation(); }}
                    style={{
                      padding: '4px 10px', border: '1px solid var(--hairline)',
                      background: 'transparent', color: 'var(--muted)',
                      fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-btn, 0px)',
                      fontFamily: 'inherit',
                    }}
                  >
                    Тренировать
                  </button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                  −{group.losses.toFixed(1)} очков · {group.games.length} {pluralGames(group.games.length)}
                </div>
                <ProgressBar value={group.losses} max={totalLosses} height={4} />
              </div>

              {/* Examples */}
              {isActive && examples.length > 0 && (
                <div data-ui="stats-examples" style={{
                  padding: '10px 14px',
                  background: 'var(--row)',
                  border: '1px solid var(--hairline)',
                  borderTop: 'none',
                  fontSize: 13,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <button
                      onClick={() => setExampleIdx(i => Math.max(0, i - 1))}
                      disabled={exampleIdx === 0}
                      style={{ background: 'none', border: 'none', color: exampleIdx === 0 ? 'var(--faint)' : 'var(--ivory)', cursor: exampleIdx === 0 ? 'default' : 'pointer', fontSize: 16 }}
                    >
                      ‹
                    </button>
                    <span style={{ color: 'var(--muted)' }}>
                      Пример {exampleIdx + 1} из {examples.length}
                    </span>
                    <button
                      onClick={() => setExampleIdx(i => Math.min(examples.length - 1, i + 1))}
                      disabled={exampleIdx === examples.length - 1}
                      style={{ background: 'none', border: 'none', color: exampleIdx === examples.length - 1 ? 'var(--faint)' : 'var(--ivory)', cursor: exampleIdx === examples.length - 1 ? 'default' : 'pointer', fontSize: 16 }}
                    >
                      ›
                    </button>
                    <a
                      href={`/games?id=${examples[exampleIdx]?.game_id}`}
                      style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 13 }}
                    >
                      Открыть партию →
                    </a>
                  </div>
                  <div style={{ color: 'var(--muted)' }}>
                    {examples[exampleIdx]?.opp} · {examples[exampleIdx]?.date?.slice(0, 10)} ·{' '}
                    {examples[exampleIdx]?.decisive_phase ?? 'миттельшпиль'}
                    {examples[exampleIdx]?.decisive_san ? ` · ${examples[exampleIdx].decisive_san}` : ''}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {lossGroups.length === 0 && (
          <div data-ui="stats-empty" style={{ padding: '20px 0', fontSize: 15, color: 'var(--muted)', textAlign: 'center' }}>
            Нет данных о потерях
          </div>
        )}
      </div>
    );
  } else if (section === 'phases') {
    const avgErrors = (phase: 'opening' | 'middlegame' | 'endgame') => {
      const vals = filteredInsights.map(i => i[`errors_${phase}`]);
      return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : '—';
    };
    const avgTime = (phase: 'opening' | 'middlegame' | 'endgame') => {
      const vals = filteredInsights.map(i => i[`avg_time_${phase}`]).filter((v): v is number => v != null);
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    };
    const rows = [
      { label: 'Дебют', key: 'opening' as const },
      { label: 'Миттельшпиль', key: 'middlegame' as const },
      { label: 'Эндшпиль', key: 'endgame' as const },
    ];
    panelContent = (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', marginBottom: 8 }}>Ошибки по стадиям</div>
        {rows.map(r => {
          const t = avgTime(r.key);
          return (
            <div
              key={r.key}
              style={{
                padding: '12px 14px', background: 'var(--surface-2)',
                border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>{r.label}</span>
                <span style={{ fontSize: 14, color: '#F08277' }}>{avgErrors(r.key)} ошибок/партию</span>
              </div>
              {t != null && (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Среднее время на ход: {t} сек
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  } else if (section === 'time') {
    const timeTroubleCount = filteredInsights.filter(i => i.time_trouble).length;
    const avgTimeOpening = (() => {
      const vals = filteredInsights.map(i => i.avg_time_opening).filter((v): v is number => v != null);
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    })();
    const clocksAtDecisive = filteredInsights.filter(i => i.clock_left != null).map(i => i.clock_left as number);
    const avgClock = clocksAtDecisive.length ? Math.round(clocksAtDecisive.reduce((s, v) => s + v, 0) / clocksAtDecisive.length) : null;
    panelContent = (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4 }}>Анализ времени</div>
        <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
          <div style={{ fontSize: 14, color: 'var(--ivory)', marginBottom: 4 }}>Цейтнот</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: timeTroubleCount > 0 ? '#F4B45C' : 'var(--muted)' }}>{timeTroubleCount}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>партий с дефицитом времени (менее 60 сек)</div>
        </div>
        {avgTimeOpening != null && (
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: `1px solid ${avgTimeOpening > 20 ? '#F4B45C' : 'var(--hairline)'}`, borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 14, color: 'var(--ivory)', marginBottom: 4 }}>Дебют</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)' }}>{avgTimeOpening} сек/ход</div>
            {avgTimeOpening > 20 && (
              <div style={{ fontSize: 13, color: '#F4B45C', marginTop: 4 }}>
                В дебюте ты думаешь {avgTimeOpening} сек на ход — свои линии играй быстрее
              </div>
            )}
          </div>
        )}
        {avgClock != null && (
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 14, color: 'var(--ivory)', marginBottom: 4 }}>Часы на переломном ходу</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)' }}>{avgClock} сек</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>в среднем оставалось на часах</div>
          </div>
        )}
      </div>
    );
  } else if (section === 'openings') {
    panelContent = (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', marginBottom: 12 }}>Дебюты</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Нет данных о дебютных названиях. Импортируй партии с полным PGN.
        </div>
      </div>
    );
  } else if (section === 'rating') {
    const chartH = 160;
    const chartW = 400;
    panelContent = (
      <div data-ui="stats-rating" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)' }}>Рейтинг</div>
        {currentRating && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Сейчас</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)' }}>{currentRating}</div>
            </div>
            {ratingChange != null && (
              <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>За 30 дней</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: ratingChange >= 0 ? 'var(--accent)' : '#F08277' }}>
                  {ratingChange >= 0 ? '+' : ''}{ratingChange}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Simple SVG chart */}
        {ratingData.length > 1 && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)', padding: '12px 16px' }}>
            <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{ display: 'block' }}>
              {/* Goal line at 1300 */}
              <line
                x1={0} y1={(1 - (1300 - minRating) / (maxRating - minRating)) * chartH}
                x2={chartW} y2={(1 - (1300 - minRating) / (maxRating - minRating)) * chartH}
                stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="6,4"
              />
              <text x={chartW - 4} y={(1 - (1300 - minRating) / (maxRating - minRating)) * chartH - 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.3)">цель 1300</text>
              {/* Rating line */}
              <polyline
                points={ratingData.map((d, i) => {
                  const x = (i / (ratingData.length - 1)) * chartW;
                  const y = (1 - (d.rating - minRating) / (maxRating - minRating)) * chartH;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
              />
            </svg>
          </div>
        )}
        {ratingData.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Нет данных о рейтинге</div>
        )}
      </div>
    );
  }

  const panel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div data-ui="panel-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>
          Партии · {SECTION_ITEMS.find(s => s.key === section)?.label ?? 'Статистика'}
        </div>
        <div data-ui="panel-title" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', marginTop: 2 }}>
          {SECTION_ITEMS.find(s => s.key === section)?.label ?? 'Где я теряю очки'}
        </div>
      </div>
      <div data-ui="panel-actions" style={{ display: 'flex', gap: 8, padding: '8px 20px', flexShrink: 0, borderBottom: '1px solid var(--hairline)' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {filteredInsights.length} {pluralGames(filteredInsights.length)}
        </span>
      </div>
      {panelContent}
    </div>
  );

  return (
    <TrainerLayout
      session={session}
      topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>{topBarText}</span>}
      board={
        <Board
          fen={validFen}
          size={S}
          orientation={boardOrientation}
          interactive={false}
          arrows={boardArrows}
        />
      }
      bottomBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>
        {boardOrientation === 'white' ? 'Вы играли белыми' : 'Вы играли чёрными'}
      </span>}
      panel={panel}
      panelAttrs={isDemo ? { 'data-demo': 'stats' } : {}}
    />
  );
}

// ── Suspense wrapper ──────────────────────────────────────────────────────────

export function StatsPage() {
  return (
    <Suspense fallback={null}>
      <StatsPageInner />
    </Suspense>
  );
}

export default StatsPage;
