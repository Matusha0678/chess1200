'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
import { generateInsights, aggregate, SEVERITY_COLOR } from '@/lib/insights-analyzer';

// ── Types ─────────────────────────────────────────────────────────────────────

type StatsSection = 'assistant' | 'losses' | 'phases' | 'time' | 'openings' | 'rating' | 'deep';
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
  const [section, setSection] = useState<StatsSection>('assistant');
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
         
        setBoardFen('start');
      }
    } else {
       
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

  // ratingData reconstructed from insights (which have rating_me + date from games join)
  const ratingData = isDemo
    ? DEMO_STATS.rating
    : filteredInsights
        .filter(i => i.rating_me != null && i.date)
        .map(i => ({ date: i.date!, rating: i.rating_me! }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
  const peakRating = ratingData.length ? Math.max(...ratingData.map(d => d.rating)) : null;
  const lowestRating = ratingData.length ? Math.min(...ratingData.map(d => d.rating)) : null;

  // ── Sections ─────────────────────────────────────────────────────────────────

  const SECTION_ITEMS: { key: StatsSection; label: string }[] = [
    { key: 'assistant', label: 'Ассистент' },
    { key: 'losses', label: 'Где теряю очки' },
    { key: 'phases', label: 'Стадии партии' },
    { key: 'time', label: 'Время' },
    { key: 'openings', label: 'Дебюты' },
    { key: 'rating', label: 'Рейтинг' },
    { key: 'deep', label: 'Глубокая аналитика' },
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
            onClick={async () => {
              setLoading(true); setError(null);
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
            }}
            disabled={loading}
            style={{
              width: '100%', padding: '8px 0',
              background: 'var(--surface-2)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-btn, 0px)',
              color: 'var(--ivory)', fontSize: 13, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Загрузка…' : 'Пересчитать'}
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
  } else if (section === 'assistant') {
    const assistantInsights = generateInsights(filteredInsights);
    const agg = aggregate(filteredInsights);
    panelContent = (
      <div data-ui="stats-assistant" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 13,
              background: 'color-mix(in srgb, var(--accent) 20%, var(--surface))',
              color: 'var(--accent)', fontSize: 14, fontWeight: 800,
            }}>А</span>
            Ассистент
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Главные выводы по {pluralGames(filteredInsights.length)} за {filters.period === '30d' ? '30 дней' : filters.period === '90d' ? '90 дней' : 'всё время'}
          </div>
        </div>

        {/* Top-line summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', lineHeight: 1, fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em' }}>
              {agg.winPct}%
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>побед</div>
          </div>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', lineHeight: 1, fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em' }}>
              +{agg.wins}<span style={{ fontSize: 16, color: 'var(--muted)' }}>/={agg.draws}/−{agg.losses}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>побед/ничьих/поражений</div>
          </div>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', lineHeight: 1, fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em' }}>
              {agg.missedWins}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>упущено побед</div>
          </div>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', lineHeight: 1, fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em' }}>
              {agg.timeTrouble}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>цейтнотов</div>
          </div>
        </div>

        {/* Insight cards */}
        {assistantInsights.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Явных проблем не вижу. Продолжай как сейчас.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {assistantInsights.map(ins => {
              const colors = SEVERITY_COLOR[ins.severity];
              return (
                <div key={ins.id} style={{
                  padding: '14px 16px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 'var(--radius-card, 0px)',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: 'color-mix(in srgb, var(--bg) 60%, transparent)',
                    color: colors.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0, fontWeight: 700,
                  }}>{ins.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)' }}>{ins.title}</div>
                      {ins.stat && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: colors.text, lineHeight: 1 }}>{ins.stat.value}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, letterSpacing: 0.05, textTransform: 'uppercase', fontWeight: 600 }}>{ins.stat.label}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45, marginBottom: ins.action ? 10 : 0 }}>{ins.body}</div>
                    {ins.action && (
                      <Link href={ins.action.href} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px',
                        background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
                        border: `1px solid ${colors.border}`,
                        borderRadius: 999,
                        fontSize: 12, fontWeight: 600,
                        color: colors.text,
                        textDecoration: 'none',
                      }}>
                        {ins.action.label} →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  } else if (section === 'deep') {
    const agg = aggregate(filteredInsights);
    const maxWdGames = Math.max(1, ...Object.values(agg.byWeekday).map(v => v.games));
    panelContent = (
      <div data-ui="stats-deep" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)' }}>Глубокая аналитика</div>

        {/* By weekday chart */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, fontWeight: 600 }}>ПАРТИИ ПО ДНЯМ НЕДЕЛИ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end' }}>
            {Object.entries(agg.byWeekday).map(([day, v]) => {
              const h = Math.max(4, Math.round((v.games / maxWdGames) * 120));
              const winPct = v.games > 0 ? Math.round((v.wins / v.games) * 100) : 0;
              return (
                <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '70%', height: h,
                    background: 'color-mix(in srgb, var(--accent) 60%, var(--surface))',
                    borderRadius: 2,
                    position: 'relative',
                    transition: 'height 0.3s',
                  }}>
                    {v.games > 0 && (
                      <div style={{
                        position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)',
                        fontSize: 11, fontWeight: 700, color: 'var(--ivory)',
                        fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)",
                      }}>{winPct}%</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{day}</div>
                  <div style={{ fontSize: 10, color: 'var(--faint)' }}>{v.games}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By-color performance */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, fontWeight: 600 }}>ПО ЦВЕТУ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>♔ Белыми</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em' }}>{agg.asWhiteWinPct}%</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>побед</div>
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>♚ Чёрными</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em' }}>{agg.asBlackWinPct}%</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>побед</div>
            </div>
          </div>
        </div>

        {/* Phase breakdown */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, fontWeight: 600 }}>РЕШАЮЩИЕ ОШИБКИ ПО ФАЗАМ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {([
              { label: 'Дебют', value: agg.byPhase.opening, color: '#4A90E2' },
              { label: 'Миттельшпиль', value: agg.byPhase.middlegame, color: '#F0A43A' },
              { label: 'Эндшпиль', value: agg.byPhase.endgame, color: '#E0574A' },
            ] as const).map(p => (
              <div key={p.label} style={{ padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: p.color, fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em' }}>{p.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{p.value === 1 ? 'партия' : p.value <= 4 ? 'партии' : 'партий'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Best / Worst game */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, fontWeight: 600 }}>ЭКСТРЕМУМЫ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {agg.bestGame && (
              <div style={{ padding: '14px 16px', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface-2))', border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--hairline))', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 4, fontWeight: 700, letterSpacing: 0.05 }}>ЛУЧШАЯ ПОБЕДА</div>
                <div style={{ fontSize: 14, color: 'var(--ivory)', fontWeight: 600 }}>против {agg.bestGame.opp}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{agg.bestGame.date?.slice(0, 10)}</div>
              </div>
            )}
            {agg.worstGame && (
              <div style={{ padding: '14px 16px', background: 'color-mix(in srgb, #E0574A 10%, var(--surface-2))', border: '1px solid color-mix(in srgb, #E0574A 25%, var(--hairline))', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 12, color: '#E0574A', marginBottom: 4, fontWeight: 700, letterSpacing: 0.05 }}>КРУПНЕЙШИЙ ЗЕВОК</div>
                <div style={{ fontSize: 14, color: 'var(--ivory)', fontWeight: 600 }}>против {agg.worstGame.opp}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  потеря {agg.worstGame.decisive_loss ?? '?'} ед. · {agg.worstGame.decisive_phase === 'opening' ? 'в дебюте' : agg.worstGame.decisive_phase === 'middlegame' ? 'в середине' : 'в эндшпиле'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Play-style classifier */}
        {(() => {
          const total = filteredInsights.length;
          if (total < 5) return null;
          const timeTroublePct = Math.round((agg.timeTrouble / total) * 100);
          const openingErrPct = Math.round((agg.byPhase.opening / total) * 100);
          const middleErrPct  = Math.round((agg.byPhase.middlegame / total) * 100);
          const endgameErrPct = Math.round((agg.byPhase.endgame / total) * 100);
          const missedPct     = Math.round((agg.missedWins / total) * 100);

          // Simple heuristic
          type Tag = { label: string; color: string; desc: string };
          const tags: Tag[] = [];
          if (middleErrPct > openingErrPct && middleErrPct > endgameErrPct) {
            tags.push({ label: 'Тактик', color: 'var(--accent)', desc: 'Ошибки чаще в середине — ты ищешь комбинации, но иногда просчитываешься.' });
          }
          if (openingErrPct > 30) {
            tags.push({ label: 'Не любишь теорию', color: '#F0A43A', desc: 'Много ошибок в дебюте — повторяй линии чаще.' });
          }
          if (endgameErrPct > 25) {
            tags.push({ label: 'Слабый эндшпиль', color: '#E0574A', desc: 'Технические окончания подводят — тренируй эндшпиль.' });
          }
          if (timeTroublePct > 25) {
            tags.push({ label: 'Быстро играешь', color: '#4A90E2', desc: 'Много цейтнотов — возможно спешишь или играешь слишком длинные партии.' });
          }
          if (missedPct > 15) {
            tags.push({ label: 'Не дожимаешь', color: '#F0A43A', desc: 'Упущенные победы — тренируй технику реализации.' });
          }
          if (tags.length === 0) {
            tags.push({ label: 'Сбалансированный', color: 'var(--accent)', desc: 'Явных перекосов не вижу — хороший универсальный игрок.' });
          }

          return (
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, fontWeight: 600 }}>СТИЛЬ ИГРЫ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tags.map(t => (
                  <div key={t.label} style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ padding: '4px 10px', background: `color-mix(in srgb, ${t.color} 18%, transparent)`, color: t.color, borderRadius: 999, fontSize: 11, fontWeight: 700, flexShrink: 0, letterSpacing: 0.04 }}>
                      {t.label}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
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
    // Group insights by opening name
    type OpStat = { name: string; games: number; wins: number; draws: number; losses: number; openingErrors: number; devCount: number };
    const openingMap = new Map<string, OpStat>();
    for (const ins of filteredInsights) {
      const name = ins.opening?.trim() || 'Без названия';
      let s = openingMap.get(name);
      if (!s) { s = { name, games: 0, wins: 0, draws: 0, losses: 0, openingErrors: 0, devCount: 0 }; openingMap.set(name, s); }
      s.games++;
      if (ins.result === 'win') s.wins++;
      else if (ins.result === 'loss') s.losses++;
      else s.draws++;
      s.openingErrors += ins.errors_opening ?? 0;
      if (ins.decisive_phase === 'opening' && ins.decisive_cls === 'mistake') s.devCount++;
    }
    const openingStats = Array.from(openingMap.values()).sort((a, b) => b.games - a.games);
    const maxGames = openingStats[0]?.games ?? 1;
    panelContent = (
      <div data-ui="stats-openings" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4 }}>Дебюты в партиях</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          {filteredInsights.length > 0
            ? `${openingStats.length} ${openingStats.length === 1 ? 'дебют' : openingStats.length <= 4 ? 'дебюта' : 'дебютов'} в ${pluralGames(filteredInsights.length)}`
            : 'Нет партий в выбранном фильтре'}
        </div>
        {openingStats.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Нет данных. Импортируй партии с полным PGN или расширь фильтр периода.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openingStats.slice(0, 20).map(op => {
              const winPct = op.games > 0 ? Math.round((op.wins / op.games) * 100) : 0;
              const barPct = Math.max(4, Math.round((op.games / maxGames) * 100));
              const resultColor = winPct >= 55 ? 'var(--accent)' : winPct >= 40 ? 'var(--ivory)' : '#F08277';
              const canLink = op.name !== 'Без названия';
              const cardStyle: React.CSSProperties = {
                padding: '12px 14px',
                background: 'var(--surface-2)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-card, 0px)',
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                cursor: canLink ? 'pointer' : 'default',
                transition: 'border-color 0.15s',
              };
              const inner = (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</div>
                    <div style={{ fontSize: 13, color: resultColor, fontWeight: 600, flexShrink: 0 }}>{winPct}%</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--accent)', opacity: 0.6 }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                      {op.games} {op.games === 1 ? 'партия' : op.games <= 4 ? 'партии' : 'партий'}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10 }}>
                    <span>+{op.wins}</span>
                    <span>={op.draws}</span>
                    <span>−{op.losses}</span>
                    {op.devCount > 0 && <span style={{ color: '#F08277', marginLeft: 'auto' }}>· отход от линий: {op.devCount}</span>}
                  </div>
                </>
              );
              return canLink ? (
                <Link key={op.name} href={`/openings?q=${encodeURIComponent(op.name)}`} style={cardStyle}>
                  {inner}
                </Link>
              ) : (
                <div key={op.name} style={cardStyle}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    );
  } else if (section === 'rating') {
    const chartH = 220;
    const chartW = 760;
    const yRange = Math.max(50, maxRating - minRating);
    const yToPx = (r: number) => (1 - (r - minRating) / yRange) * chartH;
    const goalRating = 1300;
    panelContent = (
      <div data-ui="stats-rating" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)' }}>Рейтинг</div>
        {currentRating && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>Сейчас</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.025em', lineHeight: 1, marginTop: 6 }}>{currentRating}</div>
            </div>
            {peakRating != null && (
              <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>Пик</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.025em', lineHeight: 1, marginTop: 6 }}>{peakRating}</div>
              </div>
            )}
            {lowestRating != null && (
              <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>Минимум</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#F08277', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.025em', lineHeight: 1, marginTop: 6 }}>{lowestRating}</div>
              </div>
            )}
            {ratingChange != null && (
              <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase' }}>За 30 дней</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: ratingChange >= 0 ? 'var(--accent)' : '#F08277', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.025em', lineHeight: 1, marginTop: 6 }}>
                  {ratingChange >= 0 ? '+' : ''}{ratingChange}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Enhanced SVG chart */}
        {ratingData.length > 1 && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)', padding: '18px 20px' }}>
            <svg width="100%" viewBox={`0 0 ${chartW} ${chartH + 24}`} style={{ display: 'block' }} preserveAspectRatio="none">
              {/* Y gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((f, idx) => (
                <g key={idx}>
                  <line x1={40} y1={f * chartH} x2={chartW} y2={f * chartH} stroke="var(--hairline)" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
                  <text x={34} y={f * chartH + 4} textAnchor="end" fontSize={10} fill="var(--muted)" fontFamily="ui-monospace, Menlo, monospace">
                    {Math.round(minRating + (1 - f) * yRange)}
                  </text>
                </g>
              ))}
              {/* Goal line */}
              {goalRating >= minRating && goalRating <= maxRating && (
                <>
                  <line x1={40} y1={yToPx(goalRating)} x2={chartW} y2={yToPx(goalRating)} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6} />
                  <text x={chartW - 4} y={yToPx(goalRating) - 6} textAnchor="end" fontSize={11} fill="var(--accent)" fontWeight="600">цель 1300</text>
                </>
              )}
              {/* Gradient area under line */}
              <defs>
                <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {(() => {
                const pts = ratingData.map((d, i) => {
                  const x = 40 + (i / (ratingData.length - 1)) * (chartW - 40);
                  const y = yToPx(d.rating);
                  return { x, y };
                });
                const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${chartH} L ${pts[0].x} ${chartH} Z`;
                return (
                  <>
                    <path d={areaPath} fill="url(#ratingGrad)" />
                    <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    {/* Peak marker */}
                    {peakRating != null && pts.length > 0 && (() => {
                      const peakIdx = ratingData.findIndex(d => d.rating === peakRating);
                      if (peakIdx < 0) return null;
                      return (
                        <>
                          <circle cx={pts[peakIdx].x} cy={pts[peakIdx].y} r={5} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />
                          <text x={pts[peakIdx].x} y={pts[peakIdx].y - 10} textAnchor="middle" fontSize={11} fill="var(--accent)" fontWeight={700}>{peakRating}</text>
                        </>
                      );
                    })()}
                    {/* Current */}
                    {currentRating != null && pts.length > 0 && (
                      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill="var(--ivory)" stroke="var(--accent)" strokeWidth={2} />
                    )}
                  </>
                );
              })()}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              <span>{ratingData[0]?.date?.slice(0, 10)}</span>
              <span>{ratingData[ratingData.length - 1]?.date?.slice(0, 10)}</span>
            </div>
          </div>
        )}
        {ratingData.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Нет данных о рейтинге. Загрузи партии и выполни анализ.</div>
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
