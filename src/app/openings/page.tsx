'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { MiniBoard } from '@/components/board/MiniBoard';
import { supabase } from '@/lib/supabase';
import { cardPly, toMoves, countStatuses } from '@/lib/opening-trainer';
import type { ChessMove } from '@/lib/opening-trainer';
import { DEMO_CATALOG } from '@/lib/demo-openings';
import { pluralLines, pluralOpenings, pluralMinutes } from '@/lib/plural';

// ── types / helpers ───────────────────────────────────────────────────────

const FILTERS_KEY = 'op-filters';
const AUTHORED_PREFIX_RE = /^\s*(📚\s*)?авторск\S*\s*[•·—-]\s*/i;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type OpCategory = 'all' | 'authored' | 'gambit' | 'defense' | 'classical' | 'sharp';

interface OpFilters {
  color: 'all' | 'white' | 'black';
  show: 'all' | 'review' | 'new';
  category: OpCategory;
}
const DEFAULT_FILTERS: OpFilters = { color: 'all', show: 'all', category: 'all' };

interface CatalogOpening {
  id: string;
  name: string;
  color: 'white' | 'black' | 'both';
  totalLines: number;
  mastered: number;
  learning: number;
  due: number;
  newLines: number;
  sharpCount: number;
  cardFen: string;
  firstMoves?: string;
  lastMoveSan?: string;
}

function classifyName(name: string): 'gambit' | 'defense' | 'classical' {
  const s = name.toLowerCase();
  if (/гамбит|контргамбит/.test(s)) return 'gambit';
  if (/защита|сицилианск|французск|каро|скандинавск|пирц|ал[её]хин|староинд|нимцо|грюнфельд|бенони|голланд|славянск/.test(s)) return 'defense';
  return 'classical';
}

function cleanName(raw: string): string {
  return raw.replace(AUTHORED_PREFIX_RE, '').trim();
}

function loadFilters(): OpFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const r = localStorage.getItem(FILTERS_KEY);
    return r ? { ...DEFAULT_FILTERS, ...JSON.parse(r) } : DEFAULT_FILTERS;
  } catch { return DEFAULT_FILTERS; }
}
function saveFilters(f: OpFilters) { try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)); } catch { /* */ } }

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

// ── page ──────────────────────────────────────────────────────────────────

export default function OpeningsPage() {
  const [filters, setFilters] = useState<OpFilters>(DEFAULT_FILTERS);
  const [openings, setOpenings] = useState<CatalogOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const isDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(loadFilters());
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('q');
      if (q) setSearch(q);
    }
  }, []);

  const updateFilters = useCallback((u: Partial<OpFilters>) => {
    setFilters(prev => { const n = { ...prev, ...u }; saveFilters(n); return n; });
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
        supabase.from('opening_lines').select('id, opening_id, moves, line_class').in('opening_id', ids),
        supabase.from('line_progress').select('line_id, mastery, next_review').in('line_id',
          ((await supabase.from('opening_lines').select('id').in('opening_id', ids)).data ?? []).map((l: { id: string }) => l.id)
        ),
      ]);

      const linesByOp = new Map<string, Array<{ id: string; moves: ChessMove[]; lineClass: string | null }>>();
      for (const l of (linesData ?? []) as Array<{ id: string; opening_id: string; moves: unknown; line_class: string | null }>) {
        if (!linesByOp.has(l.opening_id)) linesByOp.set(l.opening_id, []);
        const mvs = Array.isArray(l.moves) ? l.moves as ChessMove[] : toMoves((l.moves as string) ?? '');
        linesByOp.get(l.opening_id)!.push({ id: l.id, moves: mvs, lineClass: l.line_class ?? null });
      }

      const progMap = new Map<string, { mastery: number; next_review: string; last_practiced?: string }>();
      for (const p of (progData ?? []) as Array<{ line_id: string; mastery: number; next_review: string; last_practiced?: string }>) {
        progMap.set(p.line_id, p);
      }

      if (typeof window !== 'undefined') {
        for (const [, ls] of linesByOp) {
          for (const l of ls) {
            try {
              const raw = window.localStorage.getItem(`op-lp:${l.id}`);
              if (!raw) continue;
              const local = JSON.parse(raw) as { mastery: number; next_review: string; last_practiced: string };
              const db = progMap.get(l.id);
              const dbT = db ? Date.parse(db.last_practiced ?? '1970-01-01') : 0;
              const loT = Date.parse(local.last_practiced ?? '1970-01-01');
              if (!db || loT >= dbT) progMap.set(l.id, local);
            } catch { /* */ }
          }
        }
      }

      const now = Date.now();
      const catalog: CatalogOpening[] = opsArr.map(op => {
        const ls = linesByOp.get(op.id) ?? [];
        const progs = ls.map(l => progMap.get(l.id) ?? null);
        const counts = countStatuses(progs, now);
        const plyInfo = cardPly(ls.map(l => ({ moves: l.moves })));
        const cardFen = plyInfo.lineIdx >= 0 && ls[plyInfo.lineIdx]?.moves[plyInfo.k - 1]
          ? ls[plyInfo.lineIdx].moves[plyInfo.k - 1].fen
          : START_FEN;
        const sharpCount = ls.filter(l => l.lineClass === 'sharp').length;
        const firstLine = ls[0]?.moves ?? [];
        const firstMoves = firstLine.slice(0, 6).map((m, i) => {
          const mv = Math.floor(i / 2) + 1;
          return i % 2 === 0 ? `${mv}.${m.san}` : m.san;
        }).join(' ');
        const lastMoveSan = plyInfo.lineIdx >= 0 ? ls[plyInfo.lineIdx]?.moves[plyInfo.k - 1]?.san : undefined;
        return {
          id: op.id, name: op.name, color: op.color as 'white' | 'black' | 'both',
          totalLines: ls.length, mastered: counts.mastered, learning: counts.learning, due: counts.due, newLines: counts.new,
          sharpCount, cardFen,
          firstMoves: firstMoves || undefined,
          lastMoveSan,
        };
      });
      setOpenings(catalog.sort(catalogSort));
      setLoading(false);
    } catch { setLoading(false); }
  }, [isDemo]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadOpenings(); }, [loadOpenings]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault(); searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── derived ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const due = openings.reduce((s, o) => s + o.due, 0);
    const mastered = openings.reduce((s, o) => s + o.mastered, 0);
    const learning = openings.reduce((s, o) => s + o.learning, 0);
    const newN = openings.reduce((s, o) => s + o.newLines, 0);
    const lines = openings.reduce((s, o) => s + o.totalLines, 0);
    return { due, mastered, learning, new: newN, lines };
  }, [openings]);

  const isSharp = (o: CatalogOpening) => o.totalLines > 0 && o.sharpCount / o.totalLines >= 0.5;
  const isAuthored = (o: CatalogOpening) => /авторск/i.test(o.name);
  const matchesCategory = (o: CatalogOpening, c: OpCategory) => {
    if (c === 'all') return true;
    if (c === 'sharp') return isSharp(o);
    if (c === 'authored') return isAuthored(o);
    return classifyName(o.name) === c;
  };

  const baseFiltered = openings.filter(o => {
    if (filters.color !== 'all' && o.color !== filters.color && o.color !== 'both') return false;
    if (filters.show === 'review' && o.due === 0) return false;
    if (filters.show === 'new' && o.newLines === 0) return false;
    if (search && !cleanName(o.name).toLowerCase().includes(search.toLowerCase())
             && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const catCounts: Record<OpCategory, number> = {
    all: baseFiltered.length,
    authored: baseFiltered.filter(o => matchesCategory(o, 'authored')).length,
    gambit: baseFiltered.filter(o => matchesCategory(o, 'gambit')).length,
    defense: baseFiltered.filter(o => matchesCategory(o, 'defense')).length,
    classical: baseFiltered.filter(o => matchesCategory(o, 'classical')).length,
    sharp: baseFiltered.filter(o => matchesCategory(o, 'sharp')).length,
  };

  const filtered = baseFiltered
    .filter(o => matchesCategory(o, filters.category))
    .sort(catalogSort);

  // Hero: top due opening (or first with new lines when nothing due)
  const topDue = openings.find(o => o.due > 0) ?? null;
  const topNew = !topDue ? openings.find(o => o.newLines > 0) ?? null : null;
  const heroOp = topDue ?? topNew ?? openings[0] ?? null;

  const reviewAllHref = isDemo ? '/openings/review?demo=1' : '/openings/review';
  const randomHref = '/openings/random';
  const addHref = '/openings/new';

  return (
    <div className="page">
      <div data-demo={isDemo ? 'openings' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Шапка ─────────────────────────────────────────────────────── */}
        <header className="opcat-head">
          <div className="opcat-head-text">
            <div className="coach-eyebrow">Учиться</div>
            <h1 className="opcat-h1 coach-serif">Дебюты</h1>
            <div className="opcat-head-meta">
              Твой репертуар: <strong>{pluralOpenings(openings.length)}</strong>
              {' '}·{' '}
              <strong>{totals.lines}</strong> {totals.lines === 1 ? 'линия' : totals.lines <= 4 ? 'линии' : 'линий'}
              {' '}· освоено <strong>{totals.mastered}</strong>
            </div>
          </div>
          <div className="opcat-head-actions">
            <div className="opcat-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                data-ui="op-search"
                type="text"
                placeholder="Найти дебют…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <kbd>/</kbd>
            </div>
            <Link href={addHref} className="opcat-add-btn">
              + Добавить дебют
            </Link>
          </div>
        </header>

        <div className="opcat-divider" />

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <HeroBlock
          due={totals.due}
          mastered={totals.mastered}
          learning={totals.learning}
          newCount={totals.new}
          lines={totals.lines}
          topOp={heroOp}
          loading={loading}
          openingsCount={openings.length}
          reviewAllHref={reviewAllHref}
          randomHref={randomHref}
          addHref={addHref}
        />

        {/* ── Фильтры (категории + цвет/показать) ───────────────────────── */}
        <div className="opcat-filters-row">
          <div data-ui="op-categories" className="opcat-tabs">
            {(['all','authored','gambit','defense','classical','sharp'] as const).map(c => {
              const labels: Record<OpCategory, string> = {
                all: 'Все', authored: 'Авторские', gambit: 'Гамбиты', defense: 'Защиты',
                classical: 'Классика', sharp: 'Острые',
              };
              const active = filters.category === c;
              return (
                <button
                  key={c}
                  data-category={c}
                  onClick={() => updateFilters({ category: c })}
                  className={`opcat-tab${active ? ' opcat-tab-active' : ''}`}
                >
                  <span>{labels[c]}</span>
                  <span className="opcat-tab-count">{catCounts[c]}</span>
                </button>
              );
            })}
          </div>

          <div data-ui="op-filters" className="opcat-seg-group">
            <div className="opcat-seg-label">Цвет</div>
            <div className="opcat-seg">
              {(['all','white','black'] as const).map(c => (
                <button
                  key={c}
                  data-color={c}
                  onClick={() => updateFilters({ color: c })}
                  className={`opcat-seg-btn${filters.color === c ? ' opcat-seg-btn-active' : ''}`}
                >
                  {c === 'all' ? 'Все' : c === 'white' ? 'Белыми' : 'Чёрными'}
                </button>
              ))}
            </div>
            <div className="opcat-seg-label">Показать</div>
            <div className="opcat-seg">
              {(['all','review','new'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => updateFilters({ show: s })}
                  className={`opcat-seg-btn${filters.show === s ? ' opcat-seg-btn-active' : ''}`}
                >
                  {s === 'all' ? 'Все' : s === 'review' ? 'Повторить' : 'Новые'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Сетка ─────────────────────────────────────────────────────── */}
        <div data-ui="eg-grid" className="opcat-grid">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
            : filtered.map((op, i) => (
                <OpeningCard key={op.id} op={op} index={i} isDemo={isDemo} />
              ))}
        </div>
      </div>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────

function HeroBlock({
  due, mastered, learning, newCount, lines, topOp, loading, openingsCount,
  reviewAllHref, randomHref, addHref,
}: {
  due: number; mastered: number; learning: number; newCount: number; lines: number;
  topOp: CatalogOpening | null; loading: boolean; openingsCount: number;
  reviewAllHref: string; randomHref: string; addHref: string;
}) {
  if (!loading && openingsCount === 0) {
    return (
      <section data-ui="op-hero" className="opcat-hero">
        <div className="opcat-hero-top opcat-hero-empty">
          <div className="opcat-hero-left">
            <div className="coach-eyebrow">Начни с одного дебюта</div>
            <div className="opcat-hero-headline coach-serif">Добавь первый дебют</div>
            <p className="opcat-hero-sub">Вставь PGN с вариантами — линии появятся сами и Таль начнёт строить план под твои партии.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href={addHref} className="opcat-btn-gold">+ Добавить дебют</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const headlineAccent = due > 0 ? `${due}` : `${newCount}`;
  const verb = due > 0
    ? (due === 1 ? 'линия ждёт' : due <= 4 ? 'линии ждут' : 'линий ждут')
    : (newCount === 1 ? 'новая линия' : newCount <= 4 ? 'новые линии' : 'новых линий');
  const tailWord = due > 0 ? 'повторения' : newCount > 0 ? 'в репертуаре' : '';
  const headlineNoun = due > 0 || newCount > 0 ? verb : 'всё освоено';
  const minutes = Math.max(1, due); // 1 линия ≈ 1 минута

  const heroTitle = cleanName(topOp?.name ?? '');
  const heroOrientation: 'white' | 'black' = topOp?.color === 'black' ? 'black' : 'white';

  // Описание: откуда задачи
  const lead = (() => {
    if (due === 0 && newCount > 0) {
      return `Новых линий: ${newCount}. Начни с «${heroTitle}».`;
    }
    if (due === 0) {
      return `Всё по срокам. ${mastered} из ${lines} освоено, в изучении ${learning}.`;
    }
    // due > 0
    if (topOp && topOp.due === due) {
      return `Все — из «${heroTitle}». Займёт около ${pluralMinutes(minutes)}. Повторяй по сроку — так линии остаются в памяти.`;
    }
    return `Больше всего — в «${heroTitle}» (${topOp?.due ?? 0}). Займёт около ${pluralMinutes(minutes)}.`;
  })();

  return (
    <section data-ui="op-hero" className="opcat-hero">
      <div className="opcat-hero-top">
        <div className="opcat-hero-left">
          <div className="coach-eyebrow">На повтор сегодня</div>
          <div className="opcat-hero-headline">
            <span className="opcat-hero-number coach-serif">{headlineAccent}</span>
            <span className="opcat-hero-tail coach-serif">
              {headlineNoun}{tailWord ? ' ' + tailWord : ''}
            </span>
          </div>
          <p className="opcat-hero-sub">{lead}</p>
          <div className="opcat-hero-actions">
            {due > 0 ? (
              <Link
                href={reviewAllHref}
                data-ui="op-review-all"
                className="opcat-btn-gold"
              >
                Повторить всё · {due} →
              </Link>
            ) : newCount > 0 && topOp ? (
              <Link
                href={`/openings/${topOp.id}`}
                data-ui="op-review-all"
                className="opcat-btn-gold"
              >
                Учить новые →
              </Link>
            ) : (
              <span
                data-ui="op-review-all"
                className="opcat-btn-gold opcat-btn-disabled"
                aria-disabled="true"
              >
                Всё повторено
              </span>
            )}
            <Link href={randomHref} className="opcat-btn-line">Дебют Рандом</Link>
          </div>
          <div className="opcat-hero-hint">Дебют Рандом — Stockfish играет против твоих линий, ты отвечаешь.</div>
        </div>

        {topOp && (
          <div className="opcat-hero-board">
            <div className="opcat-hero-board-frame">
              <MiniBoard fen={topOp.cardFen} orientation={heroOrientation} size={220} />
            </div>
            <div className="opcat-hero-board-title coach-serif">{heroTitle}</div>
            {topOp.lastMoveSan && (
              <div className="opcat-hero-board-move">{topOp.lastMoveSan}</div>
            )}
          </div>
        )}
      </div>

      <div className="opcat-hero-stats">
        <HeroStat label="Повторить" value={due} gold />
        <HeroStat label="Изучаю" value={learning} />
        <HeroStat label="Освоено" value={mastered} sub={`из ${lines}`} />
        <HeroStat label="Новых" value={newCount} />
      </div>
    </section>
  );
}

function HeroStat({ label, value, sub, gold }: { label: string; value: number; sub?: string; gold?: boolean }) {
  return (
    <div className="opcat-hero-stat">
      <div className="opcat-hero-stat-label">{label}</div>
      <div className="opcat-hero-stat-value coach-serif" style={gold ? { color: 'var(--accent)' } : undefined}>
        {value}
      </div>
      {sub && <div className="opcat-hero-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────

function OpeningCard({ op, index, isDemo }: { op: CatalogOpening; index: number; isDemo: boolean }) {
  const st = getStatus(op);
  const authored = /авторск/i.test(op.name);
  const display = cleanName(op.name);
  const colorIcon = op.color === 'white' ? '♔' : op.color === 'black' ? '♚' : '♗';
  const colorLabel = op.color === 'white' ? 'Белыми' : op.color === 'black' ? 'Чёрными' : 'За оба';
  const href = isDemo ? '/openings/demo' : `/openings/${op.id}`;
  const orientation: 'white' | 'black' = op.color === 'black' ? 'black' : 'white';
  const num = String(index + 1).padStart(2, '0');

  let cta = 'Продолжить →';
  let ctaGold = false;
  if (op.due > 0) { cta = `Повторить ${op.due} →`; ctaGold = true; }
  else if (op.newLines > 0) { cta = 'Учить →'; }
  else if (op.mastered === op.totalLines && op.totalLines > 0) { cta = 'Экзамен →'; }

  return (
    <Link href={href} data-ui="eg-card" data-status={st} className="opcat-card">
      <div data-ui="eg-board" className="opcat-card-board">
        <MiniBoard fen={op.cardFen} orientation={orientation} size={240} />
        {op.due > 0 && (
          <div className="opcat-card-badge opcat-card-badge-gold">ПОВТОРИТЬ · {op.due}</div>
        )}
        {op.due === 0 && op.mastered === op.totalLines && op.totalLines > 0 && (
          <div className="opcat-card-badge opcat-card-badge-outline">ОСВОЕНО</div>
        )}
      </div>

      <div className="opcat-card-body">
        <div className="opcat-card-header">
          <span className="opcat-card-num coach-serif">{num}</span>
          {authored && <span className="opcat-card-chip">АВТОРСКИЙ</span>}
        </div>
        <div data-ui="eg-card-title" className="opcat-card-title coach-serif">{display}</div>
        <div className="opcat-card-meta">
          <span className="opcat-card-color">{colorIcon}</span>
          <span>{colorLabel}</span>
          <span className="opcat-card-sep">·</span>
          <span>{pluralLines(op.totalLines)}</span>
        </div>
        {op.firstMoves && <div className="opcat-card-moves">{op.firstMoves}…</div>}

        <div className="opcat-card-progress" title={`Освоено ${op.mastered} · Изучаю ${op.learning} · На повтор ${op.due} · Новых ${op.newLines}`}>
          <div
            className="opcat-card-progress-mastered"
            style={{ width: op.totalLines > 0 ? `${(op.mastered / op.totalLines) * 100}%` : '0%' }}
          />
          <div
            className="opcat-card-progress-learning"
            style={{ width: op.totalLines > 0 ? `${(op.learning / op.totalLines) * 100}%` : '0%' }}
          />
        </div>
        <div className="opcat-card-foot">
          <span>освоено {op.mastered} из {op.totalLines}</span>
          <span className={`opcat-card-cta${ctaGold ? ' opcat-card-cta-gold' : ''}`}>{cta}</span>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="opcat-card opcat-card-skeleton" aria-hidden="true">
      <div className="opcat-card-board opcat-card-board-skeleton" />
      <div className="opcat-card-body">
        <div className="opcat-skeleton-line" style={{ width: '30%', marginBottom: 10 }} />
        <div className="opcat-skeleton-line" style={{ width: '80%', marginBottom: 8 }} />
        <div className="opcat-skeleton-line" style={{ width: '60%', marginBottom: 16 }} />
        <div className="opcat-skeleton-line" style={{ width: '100%', height: 2, marginBottom: 10 }} />
        <div className="opcat-skeleton-line" style={{ width: '50%' }} />
      </div>
    </div>
  );
}
