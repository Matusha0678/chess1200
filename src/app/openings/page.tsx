'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { MiniBoard } from '@/components/board/MiniBoard';
import { supabase } from '@/lib/supabase';
import { lineStatus, cardPly, toMoves, countStatuses } from '@/lib/opening-trainer';
import type { ChessMove } from '@/lib/opening-trainer';
import { DEMO_CATALOG } from '@/lib/demo-openings';

const FILTERS_KEY = 'op-filters';

interface OpFilters {
  color: 'all' | 'white' | 'black';
  show: 'all' | 'review' | 'new';
}

const DEFAULT_FILTERS: OpFilters = { color: 'all', show: 'all' };

function loadFilters(): OpFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch { return DEFAULT_FILTERS; }
}
function saveFilters(f: OpFilters) {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

interface CatalogOpening {
  id: string;
  name: string;
  color: 'white' | 'black' | 'both';
  totalLines: number;
  mastered: number;
  learning: number;
  due: number;
  newLines: number;
  cardFen: string;
}

function catalogSort(a: CatalogOpening, b: CatalogOpening): number {
  if (b.due !== a.due) return b.due - a.due;
  if (b.newLines !== a.newLines) return b.newLines - a.newLines;
  if (a.mastered === a.totalLines && b.mastered !== b.totalLines) return 1;
  if (b.mastered === b.totalLines && a.mastered !== a.totalLines) return -1;
  return a.name.localeCompare(b.name, 'ru');
}

function getStatus(op: CatalogOpening): 'due' | 'new' | 'mastered' | 'learning' {
  if (op.due > 0) return 'due';
  if (op.newLines > 0) return 'new';
  if (op.mastered === op.totalLines && op.totalLines > 0) return 'mastered';
  return 'learning';
}

function statusBadge(op: CatalogOpening) {
  if (op.due > 0) return { text: `Повторить · ${op.due}`, bg: 'var(--accent)', color: 'var(--accent-contrast)' };
  if (op.newLines > 0) return { text: `Новых · ${op.newLines}`, bg: 'color-mix(in srgb, var(--accent) 32%, var(--surface))', color: 'var(--ivory)' };
  return null;
}

function ctaText(op: CatalogOpening): string {
  if (op.due > 0) return `${op.due} ${op.due === 1 ? 'линия ждёт' : op.due <= 4 ? 'линии ждут' : 'линий ждут'} повторения`;
  if (op.newLines > 0) return `${op.newLines} новых ${op.newLines === 1 ? 'линия' : op.newLines <= 4 ? 'линии' : 'линий'} — начни учить`;
  if (op.mastered === op.totalLines && op.totalLines > 0) return 'Всё освоено — проверь себя экзаменом';
  return 'Продолжить тренировки';
}

export default function OpeningsPage() {
  const [filters, setFilters] = useState<OpFilters>(DEFAULT_FILTERS);
  const [openings, setOpenings] = useState<CatalogOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const isDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setFilters(loadFilters()); }, []);

  const updateFilters = useCallback((update: Partial<OpFilters>) => {
    setFilters(prev => { const next = { ...prev, ...update }; saveFilters(next); return next; });
  }, []);

  const loadOpenings = useCallback(async () => {
    if (isDemo) {
      setOpenings(DEMO_CATALOG as CatalogOpening[]);
      setLoading(false);
      return;
    }
    try {
      const { data: opsData, error: opErr } = await supabase.from('openings').select('id, name, color, total_lines');
      if (opErr) { setLoading(false); return; }
      const opsArr = (opsData ?? []) as Array<{ id: string; name: string; color: string; total_lines: number }>;
      const ids = opsArr.map(o => o.id);
      if (ids.length === 0) { setOpenings([]); setLoading(false); return; }

      const [{ data: linesData }, { data: progData }] = await Promise.all([
        supabase.from('opening_lines').select('id, opening_id, moves').in('opening_id', ids),
        supabase.from('line_progress').select('line_id, mastery, next_review').in('line_id',
          ((await supabase.from('opening_lines').select('id').in('opening_id', ids)).data ?? []).map((l: { id: string }) => l.id)
        ),
      ]);

      const linesByOp = new Map<string, Array<{ id: string; moves: ChessMove[] }>>();
      for (const l of (linesData ?? []) as Array<{ id: string; opening_id: string; moves: unknown }>) {
        if (!linesByOp.has(l.opening_id)) linesByOp.set(l.opening_id, []);
        const mvs = Array.isArray(l.moves) ? l.moves as ChessMove[] : toMoves((l.moves as string) ?? '');
        linesByOp.get(l.opening_id)!.push({ id: l.id, moves: mvs });
      }

      const progMap = new Map<string, { mastery: number; next_review: string }>();
      for (const p of (progData ?? []) as Array<{ line_id: string; mastery: number; next_review: string }>) {
        progMap.set(p.line_id, p);
      }

      const now = Date.now();
      const catalog: CatalogOpening[] = opsArr.map(op => {
        const ls = linesByOp.get(op.id) ?? [];
        const progs = ls.map(l => progMap.get(l.id) ?? null);
        const counts = countStatuses(progs, now);
        const plyInfo = cardPly(ls.map(l => ({ moves: l.moves })));
        const cardFen = plyInfo.lineIdx >= 0 && ls[plyInfo.lineIdx]?.moves[plyInfo.k - 1]
          ? ls[plyInfo.lineIdx].moves[plyInfo.k - 1].fen
          : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        return {
          id: op.id, name: op.name, color: op.color as 'white' | 'black' | 'both',
          totalLines: ls.length, mastered: counts.mastered, learning: counts.learning, due: counts.due, newLines: counts.new,
          cardFen,
        };
      });
      setOpenings(catalog.sort(catalogSort));
      setLoading(false);
    } catch { setLoading(false); }
  }, [isDemo]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadOpenings(); }, [loadOpenings]);

  // keyboard /
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault(); searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totalDue = openings.reduce((s, o) => s + o.due, 0);
  const totalMastered = openings.reduce((s, o) => s + o.mastered, 0);
  const totalLearning = openings.reduce((s, o) => s + o.learning, 0);
  const totalNew = openings.reduce((s, o) => s + o.newLines, 0);
  const totalLines = openings.reduce((s, o) => s + o.totalLines, 0);

  const filtered = openings
    .filter(o => {
      if (filters.color !== 'all' && o.color !== filters.color && o.color !== 'both') return false;
      if (filters.show === 'review' && o.due === 0) return false;
      if (filters.show === 'new' && o.newLines === 0) return false;
      if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort(catalogSort);

  const leftStyle: React.CSSProperties = {
    width: 280, flexShrink: 0,
    background: 'var(--surface)',
    border: '1px solid var(--hairline)',
    borderRadius: 'var(--radius-card, 0px)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    alignSelf: 'stretch',
  };

  const segBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '5px 2px', border: 'none',
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? 'var(--ivory)' : 'var(--muted)',
    fontSize: 13, fontWeight: active ? 600 : 400,
    cursor: 'pointer', borderRadius: 'var(--radius-btn, 4px)',
    fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', gap: 20, padding: 20, overflow: 'hidden' }}>

        {/* LEFT COLUMN */}
        <section data-ui="eg-left" style={leftStyle}>
          <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--ivory)' }}>Дебюты</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{totalMastered} из {totalLines} освоено</span>
            </div>
            <div style={{ height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden', marginBottom: 14, display: 'flex' }}>
              <div style={{ height: '100%', width: totalLines > 0 ? `${(totalMastered / totalLines) * 100}%` : '0%', background: 'var(--accent)', transition: 'width 0.3s' }} />
              <div style={{ height: '100%', width: totalLines > 0 ? `${(totalLearning / totalLines) * 100}%` : '0%', background: 'color-mix(in srgb, var(--accent) 50%, var(--surface))', transition: 'width 0.3s' }} />
            </div>

            {/* Stats */}
            <div data-ui="op-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { v: totalDue,      label: 'повторить', color: 'var(--accent)' },
                { v: totalMastered, label: 'освоено',   color: 'var(--ivory)' },
                { v: totalLearning, label: 'изучаю',    color: 'color-mix(in srgb, var(--accent) 65%, var(--ivory))' },
                { v: totalNew,      label: 'новых',     color: 'var(--muted)' },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center', padding: '8px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.v}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Review all button */}
            <Link
              href={isDemo ? '/openings/review?demo=1' : '/openings/review'}
              data-ui="op-review-all"
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                padding: '10px 0',
                background: totalDue > 0 ? 'var(--accent)' : 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-btn, 4px)',
                color: totalDue > 0 ? '#fff' : 'var(--muted)',
                fontSize: 14, fontWeight: 600, textDecoration: 'none',
                marginBottom: 8,
                pointerEvents: totalDue === 0 ? 'none' : 'auto',
                opacity: totalDue === 0 ? 0.5 : 1,
              }}
            >
              {totalDue > 0 ? `Повторить всё · ${totalDue}` : 'Всё повторено'}
            </Link>
            {totalDue > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.4 }}>
                Линии из всех дебютов, у которых подошёл срок. Займёт около {totalDue} мин.
              </div>
            )}

            {/* Color filter */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Цвет
            </div>
            <div data-ui="op-filters" style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-card, 4px)', padding: 3, marginBottom: 12 }}>
              {(['all','white','black'] as const).map(c => {
                const labels = { all: 'Все', white: 'Белыми', black: 'Чёрными' };
                return (
                  <button key={c} data-color={c} onClick={() => updateFilters({ color: c })} style={segBtnStyle(filters.color === c)}>
                    {labels[c]}
                  </button>
                );
              })}
            </div>

            {/* Show filter */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Показать
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-card, 4px)', padding: 3, marginBottom: 16 }}>
              {(['all','review','new'] as const).map(s => {
                const labels = { all: 'Все', review: 'Повторить', new: 'Новые' };
                return (
                  <button key={s} onClick={() => updateFilters({ show: s })} style={segBtnStyle(filters.show === s)}>
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
            <Link
              href="/openings/new"
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                padding: '8px 0', background: 'transparent',
                border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
                color: 'var(--ivory)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
                marginBottom: 8,
              }}
            >
              Добавить дебют
            </Link>
            <Link
              href="/openings/random"
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                padding: '8px 0', background: 'transparent',
                border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
                color: 'var(--muted)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
                marginBottom: 6,
              }}
            >
              Дебют Рандом
            </Link>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, opacity: 0.7 }}>
              Дебют Рандом — Stockfish играет против твоих линий, ты отвечаешь.
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section
          data-demo={isDemo ? 'openings' : undefined}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 16, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ivory)', lineHeight: 1.1, fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
                Мои дебюты
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
                {openings.length} {openings.length === 1 ? 'дебют' : openings.length <= 4 ? 'дебюта' : 'дебютов'} · {totalLines} линий{totalDue > 0 ? ` · ${totalDue} ждут повторения` : ' · всё повторено'}
              </div>
            </div>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                ref={searchRef}
                data-ui="op-search"
                type="text"
                placeholder="Найти дебют /"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  height: 36, padding: '0 12px', background: 'var(--surface)',
                  border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
                  color: 'var(--ivory)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  width: 200,
                }}
              />
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Загрузка…
            </div>
          ) : (
            <div
              data-ui="eg-grid"
              style={{
                flex: 1, overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gridAutoRows: 'max-content',
                gap: 16, alignContent: 'start',
              }}
            >
              {filtered.map(op => (
                <OpeningCard
                  key={op.id} op={op} isHovered={hovered === op.id}
                  onHover={setHovered} isDemo={isDemo}
                />
              ))}
              {/* Add card */}
              <Link
                data-ui="op-add"
                href="/openings/new"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: 24, minHeight: 200,
                  background: 'transparent',
                  border: '2px dashed var(--hairline)',
                  borderRadius: 'var(--radius-card, 0px)',
                  color: 'var(--muted)', textDecoration: 'none',
                  cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ivory)'; (e.currentTarget as HTMLElement).style.color = 'var(--ivory)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
              >
                <span style={{ fontSize: 28 }}>＋</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Новый дебют</span>
                <span style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.4, opacity: 0.7 }}>
                  Вставь PGN с вариантами — линии появятся сами
                </span>
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function OpeningCard({ op, isHovered, onHover, isDemo }: {
  op: CatalogOpening; isHovered: boolean; onHover: (id: string | null) => void; isDemo: boolean;
}) {
  const badge = statusBadge(op);
  const st = getStatus(op);
  const colorIcon = op.color === 'white' ? '♔' : op.color === 'black' ? '♚' : '♗';
  const colorLabel = op.color === 'white' ? 'Белыми' : op.color === 'black' ? 'Чёрными' : 'За оба';
  const href = isDemo ? `/openings/demo` : `/openings/${op.id}`;
  const boardOrientation: 'white' | 'black' = op.color === 'black' ? 'black' : 'white';

  return (
    <Link
      href={href}
      data-ui="eg-card"
      data-status={st}
      onMouseEnter={() => onHover(op.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isHovered ? 'rgba(255,255,255,.2)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-card, 0px)',
        overflow: 'hidden', cursor: 'pointer', display: 'block', textDecoration: 'none',
        transform: isHovered ? 'translateY(-2px)' : undefined,
        boxShadow: isHovered ? '0 8px 20px rgba(0,0,0,.35)' : undefined,
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        position: 'relative',
      }}
    >
      {/* Board */}
      <div data-ui="eg-board" style={{ position: 'relative', width: '100%', aspectRatio: '1/1' }}>
        <div style={{ width: '100%', height: '100%' }}>
          <MiniBoard fen={op.cardFen} orientation={boardOrientation} size={240} />
        </div>

        {/* Badge top-left */}
        {badge && (
          <div style={{
            position: 'absolute', left: 10, top: 10, zIndex: 2,
            height: 26, borderRadius: 6, padding: '0 9px',
            display: 'flex', alignItems: 'center',
            fontSize: 13, fontWeight: 700,
            background: badge.bg, color: badge.color,
            boxShadow: '0 2px 6px rgba(0,0,0,.35)',
          }}>
            {badge.text}
          </div>
        )}

        {/* Mastered checkmark */}
        {st === 'mastered' && (
          <div style={{ position: 'absolute', right: 10, top: 10, zIndex: 2 }}>
            <svg width="28" height="28" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11.5" fill="currentColor" />
              <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Hover overlay */}
        {isHovered && (
          <div
            data-ui="op-card-cta"
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(20,20,18,.75)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 14, padding: 20, textAlign: 'center', zIndex: 3,
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.45, margin: 0 }}>{ctaText(op)}</p>
            <div style={{
              width: 48, height: 48, borderRadius: 24,
              background: 'var(--accent)', boxShadow: '0 3px 0 var(--accent-press)',
              display: 'grid', placeItems: 'center', color: 'var(--accent-contrast)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Below board */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div data-ui="eg-card-title" style={{
          fontSize: 15, fontWeight: 600, color: 'var(--ivory)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', lineHeight: 1.3, minHeight: '2.6em',
          marginBottom: 6,
        }}>
          {op.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
          <span>{colorIcon}</span>
          <span>{colorLabel}</span>
          <span>·</span>
          <span>{op.totalLines} {op.totalLines === 1 ? 'линия' : op.totalLines <= 4 ? 'линии' : 'линий'}</span>
        </div>
        {/* Progress bar — mastered (green) + learning (purple) */}
        <div style={{ height: 5, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden', marginBottom: 4, display: 'flex' }}>
          <div style={{
            height: '100%',
            width: op.totalLines > 0 ? `${(op.mastered / op.totalLines) * 100}%` : '0%',
            background: 'var(--accent)', transition: 'width 0.3s',
          }} />
          <div style={{
            height: '100%',
            width: op.totalLines > 0 ? `${(op.learning / op.totalLines) * 100}%` : '0%',
            background: 'color-mix(in srgb, var(--accent) 50%, var(--surface))', transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {op.mastered > 0 && <>освоено {op.mastered}/{op.totalLines}</>}
          {op.mastered > 0 && op.learning > 0 && <> · </>}
          {op.learning > 0 && <span style={{ color: 'color-mix(in srgb, var(--accent) 65%, var(--ivory))' }}>изучаю {op.learning}</span>}
          {op.mastered === 0 && op.learning === 0 && <>освоено 0/{op.totalLines}</>}
        </div>
      </div>
    </Link>
  );
}

// Suppress lineStatus unused import warning
void lineStatus;
