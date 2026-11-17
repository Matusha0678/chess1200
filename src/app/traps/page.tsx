'use client';
import { useState, useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import type { CourseLessonMove } from '@/types/courses';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BOARD_SIZE = 160;

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};
const SECTION_HEADER: React.CSSProperties = {
  borderTop: '2px solid var(--ivory)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  minHeight: 48,
};
const LABEL: React.CSSProperties = {
  margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
  color: 'var(--ivory)', textTransform: 'uppercase',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrapRow {
  trap_key: string;
  title: string;
  course_name: string;
  course_slug: string;
  course_id: string;
  lesson_id: string;
  opening: string;
  color: 'white' | 'black' | 'both';
  lesson_order: number;
  line_order: number;
  final_fen: string;
  puzzle_fen: string;
  trap_move_san: string;
  trap_move_color: 'w' | 'b';
}

interface EvalResult {
  cp?: number | null;
  mate?: number | null;
  depth: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEval(e: EvalResult | undefined): string {
  if (!e) return '—';
  if (e.mate != null) {
    // negative mate = opponent is getting mated (good for trap setter)
    if (e.mate < 0) return `Мат в ${-e.mate}`;
    return `−Мат в ${e.mate}`;
  }
  if (e.cp != null) {
    // cp is from side-to-move (opponent of trap setter) perspective
    // negate to get trap setter's advantage
    const v = -e.cp / 100;
    const sign = v >= 0 ? '+' : '';
    return `≈${sign}${v.toFixed(1)}`;
  }
  return '—';
}

function colorLabel(c: 'white' | 'black' | 'both'): string {
  return c === 'white' ? 'Белые' : c === 'black' ? 'Чёрные' : 'Оба';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrapsPage() {
  const [traps, setTraps] = useState<TrapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [evalMap, setEvalMap] = useState<Record<string, EvalResult>>({});
  const [hitMap, setHitMap] = useState<Record<string, { caught: number; caught_self: number }>>({});
  const [evalStatus, setEvalStatus] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<'all' | 'white' | 'black'>('all');
  const [openingFilter, setOpeningFilter] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [dataReady, setDataReady] = useState(false);

  const evalStartedRef = useRef(false);
  const { startAnalysis, stopAnalysis, isReady } = useStockfish();

  // ── Fetch data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);

      // 1. Trap lines
      const { data: rawLines } = await supabase
        .from('lesson_lines')
        .select('id, lesson_id, line_order, title, moves')
        .ilike('title', '%ловушка%');

      if (!rawLines || rawLines.length === 0) {
        setLoading(false);
        setDataReady(true);
        return;
      }

      // 2. Lessons
      const lessonIds = [...new Set(rawLines.map((l: { lesson_id: string }) => l.lesson_id))];
      const { data: lessons } = await supabase
        .from('course_lessons')
        .select('id, course_id, lesson_order')
        .in('id', lessonIds);

      // 3. Courses
      const courseIds = [...new Set((lessons ?? []).map((l: { course_id: string }) => l.course_id))];
      const { data: courses } = await supabase
        .from('courses')
        .select('id, slug, name, color, opening')
        .in('id', courseIds);

      // 4. Build trap rows
      const rows: TrapRow[] = [];
      for (const ll of rawLines) {
        const lesson = (lessons ?? []).find((ls: { id: string }) => ls.id === ll.lesson_id);
        const course = lesson ? (courses ?? []).find((c: { id: string }) => c.id === lesson.course_id) : null;
        if (!lesson || !course) continue;

        const moves = ll.moves as CourseLessonMove[];
        if (!moves || moves.length === 0) continue;

        const trap_key = `${course.slug}/${lesson.lesson_order}/${ll.line_order}`;
        const last = moves[moves.length - 1];
        const prev = moves.length >= 2 ? moves[moves.length - 2] : null;

        rows.push({
          trap_key,
          title: ll.title as string,
          course_name: course.name as string,
          course_slug: course.slug as string,
          course_id: course.id as string,
          lesson_id: ll.lesson_id as string,
          opening: (course.opening as string) ?? '',
          color: course.color as 'white' | 'black' | 'both',
          lesson_order: lesson.lesson_order as number,
          line_order: ll.line_order as number,
          final_fen: last.fen,
          puzzle_fen: prev?.fen ?? START_FEN,
          trap_move_san: last.san,
          trap_move_color: last.color,
        });
      }

      // 5. Fetch existing evals
      const trapKeys = rows.map(r => r.trap_key);
      const { data: evals } = trapKeys.length > 0
        ? await supabase.from('trap_eval').select('trap_key, cp, mate, depth').in('trap_key', trapKeys)
        : { data: [] };

      const evalMapInit: Record<string, EvalResult> = {};
      for (const e of evals ?? []) {
        evalMapInit[e.trap_key as string] = { cp: e.cp as number | null, mate: e.mate as number | null, depth: e.depth as number };
      }

      // 6. Fetch hit counts
      const { data: hits } = trapKeys.length > 0
        ? await supabase.from('trap_hits').select('trap_key, type').in('trap_key', trapKeys)
        : { data: [] };

      const hitMapInit: Record<string, { caught: number; caught_self: number }> = {};
      for (const h of hits ?? []) {
        const key = h.trap_key as string;
        if (!hitMapInit[key]) hitMapInit[key] = { caught: 0, caught_self: 0 };
        if (h.type === 'caught') hitMapInit[key].caught++;
        else hitMapInit[key].caught_self++;
      }

      setTraps(rows);
      setEvalMap(evalMapInit);
      setHitMap(hitMapInit);
      setLoading(false);
      setDataReady(true);
    }
    void load();
  }, []);

  // ── Auto-eval missing traps ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !dataReady || evalStartedRef.current) return;
    const missing = traps.filter(t => !evalMap[t.trap_key]);
    if (missing.length === 0) return;

    evalStartedRef.current = true;

    let idx = 0;
    function next() {
      if (idx >= missing.length) { setEvalStatus(null); return; }
      setEvalStatus({ done: idx, total: missing.length });
      const trap = missing[idx];
      let latest: { cp?: number; mate?: number } = {};
      startAnalysis(trap.final_fen, info => {
        if (info.cp != null || info.mate != null) latest = { cp: info.cp, mate: info.mate };
      });
      setTimeout(() => {
        stopAnalysis();
        setTimeout(async () => {
          await supabase.from('trap_eval').upsert({
            trap_key: trap.trap_key,
            cp: latest.cp ?? null,
            mate: latest.mate ?? null,
            depth: 14,
          });
          setEvalMap(prev => ({ ...prev, [trap.trap_key]: { cp: latest.cp, mate: latest.mate, depth: 14 } }));
          idx++;
          next();
        }, 150);
      }, 1500);
    }
    setTimeout(next, 0);
  // dataReady and traps/evalMap intentionally not in deps: snapshot state at first eval trigger
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, dataReady, startAnalysis, stopAnalysis]);

  // ── Hit counter ─────────────────────────────────────────────────────────────

  async function addHit(trap_key: string, type: 'caught' | 'caught_self') {
    await supabase.from('trap_hits').insert({ trap_key, type });
    setHitMap(prev => {
      const cur = prev[trap_key] ?? { caught: 0, caught_self: 0 };
      return {
        ...prev,
        [trap_key]: type === 'caught'
          ? { ...cur, caught: cur.caught + 1 }
          : { ...cur, caught_self: cur.caught_self + 1 },
      };
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  const openings = [...new Set(traps.map(t => t.opening).filter(Boolean))].sort();

  const filtered = traps.filter(t => {
    if (colorFilter !== 'all' && t.color !== colorFilter && t.color !== 'both') return false;
    if (openingFilter && t.opening !== openingFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.opening.toLowerCase().includes(q) && !t.course_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div style={{ height: 60, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} className="animate-pulse" />
        {[0, 1, 2].map(i => (
          <div key={i} className="ui-card animate-pulse" style={{ height: 180 }} />
        ))}
      </div>
    );
  }

  if (traps.length === 0) {
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Ловушки</h1>
            <p className="page-lead">Ловушек пока нет</p>
          </div>
        </div>
        <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>Создать курс с ловушками</span>
          <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Добавьте в курс секции <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 6px', borderRadius: 3 }}>## Ловушка: Название</code> — они появятся здесь автоматически.
          </span>
          <Link href="/courses/import" className="ui-btn ui-btn-primary" style={{ alignSelf: 'flex-start' }}>
            Импортировать курс
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>

      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Ловушки</h1>
          <p className="page-lead">
            {traps.length} {traps.length === 1 ? 'ловушка' : traps.length < 5 ? 'ловушки' : 'ловушек'} из курсов
          </p>
        </div>
      </div>

      {/* Eval progress */}
      {evalStatus && (
        <div className="ui-banner" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--muted)', borderTopColor: 'var(--ivory)', animation: 'spin 0.8s linear infinite' }} />
          Вычисляю оценку {evalStatus.done + 1} из {evalStatus.total}…
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div className="ui-search-wrap" style={{ flex: '1 1 180px', maxWidth: 280 }}>
          <svg className="ui-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
          </svg>
          <input
            type="text"
            placeholder="Поиск…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ui-search search-input"
          />
        </div>
        <div className="chip-row">
          {(['all', 'white', 'black'] as const).map(c => (
            <button
              key={c}
              onClick={() => setColorFilter(c)}
              className={`ui-chip ${colorFilter === c ? 'ui-chip-active' : ''}`}
            >
              {c === 'all' ? 'Все' : c === 'white' ? 'Белые' : 'Чёрные'}
            </button>
          ))}
          {openings.length > 1 && (
            <select
              value={openingFilter}
              onChange={e => setOpeningFilter(e.target.value)}
              className="ui-chip"
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <option value="">Все дебюты</option>
              {openings.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          )}
          {(search || colorFilter !== 'all' || openingFilter) && (
            <button
              onClick={() => { setSearch(''); setColorFilter('all'); setOpeningFilter(''); }}
              className="ui-chip"
            >
              Сбросить ×
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      {filtered.length !== traps.length && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Показано {filtered.length} из {traps.length}
        </div>
      )}

      {/* Traps section */}
      <section>
        <div style={SECTION_HEADER}>
          <h2 style={LABEL}>ЛОВУШКИ</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length}</span>
        </div>

        {filtered.length === 0 ? (
          <p style={{ marginTop: 20, fontSize: 14, color: 'var(--muted)' }}>Ничего не найдено</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
            {filtered.map(trap => {
              const ev = evalMap[trap.trap_key];
              const hits = hitMap[trap.trap_key] ?? { caught: 0, caught_self: 0 };
              const isRevealed = revealed.has(trap.trap_key);
              const boardOrientation = trap.trap_move_color === 'w' ? 'white' : 'black';

              return (
                <div
                  key={trap.trap_key}
                  style={{
                    display: 'flex', gap: 20, padding: '20px',
                    border: '1px solid var(--hairline)',
                    background: 'var(--surface)',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Board */}
                  <div style={{ flexShrink: 0 }}>
                    <Chessboard options={{
                      position: trap.puzzle_fen,
                      boardOrientation,
                      allowDragging: false,
                      boardStyle: { width: BOARD_SIZE, height: BOARD_SIZE },
                    }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Eyebrow */}
                      <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                        {trap.opening || trap.course_name} · {colorLabel(trap.color)}
                      </div>
                      {/* Title */}
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', lineHeight: 1.3 }}>
                        {trap.title}
                      </div>
                      {/* Eval */}
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        Оценка:&nbsp;
                        <span style={{ color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
                          {evalStatus && !ev ? 'вычисляю…' : formatEval(ev)}
                        </span>
                      </div>
                    </div>

                    {/* Answer reveal */}
                    <div>
                      {isRevealed ? (
                        <div style={{
                          padding: '8px 14px',
                          border: '1px solid var(--hairline)',
                          background: 'rgba(242,239,231,0.05)',
                          fontSize: 14, fontWeight: 600, color: 'var(--ivory)',
                          fontFamily: 'monospace', letterSpacing: '0.05em',
                        }}>
                          {trap.trap_move_san}
                        </div>
                      ) : (
                        <button
                          onClick={() => setRevealed(prev => new Set(prev).add(trap.trap_key))}
                          style={{
                            height: 34, padding: '0 16px',
                            background: 'transparent',
                            border: '1px solid var(--control)',
                            color: 'var(--muted)', fontSize: 13,
                            fontFamily: 'inherit', cursor: 'pointer',
                          }}
                        >
                          Найти ход →
                        </button>
                      )}
                    </div>

                    {/* Hit counters */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                        Заманил: <span style={{ color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{hits.caught}</span>
                        <button
                          onClick={() => void addHit(trap.trap_key, 'caught')}
                          style={{ width: 22, height: 22, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, fontFamily: 'inherit' }}
                          title="Заманил соперника"
                        >+</button>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                        Попался: <span style={{ color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>{hits.caught_self}</span>
                        <button
                          onClick={() => void addHit(trap.trap_key, 'caught_self')}
                          style={{ width: 22, height: 22, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, fontFamily: 'inherit' }}
                          title="Сам попался"
                        >+</button>
                      </span>
                    </div>

                    {/* Course link */}
                    <Link
                      href={`/courses/${trap.course_id}/${trap.lesson_id}`}
                      style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
                      className="play-button-link"
                    >
                      {trap.course_name} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
