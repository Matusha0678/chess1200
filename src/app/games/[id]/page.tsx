'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import type { MistakeCard } from '@/lib/mistakes';
import { TAG_LABEL, PHASE_LABEL } from '@/lib/mistakes';
import { CLASS_LABEL, CLASS_SYMBOL, CLASS_COLOR, type MoveClass } from '@/lib/classify';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  pgn: string;
  color: 'white' | 'black';
  result: 'win' | 'draw' | 'loss';
  opp_name: string;
  rating_opp: number | null;
  rating_me: number | null;
  eco_name: string;
  played_at: string;
  url: string;
  time_class: string;
  analyzed_at: string | null;
  accuracy_white: number | null;
  accuracy_black: number | null;
  analysis_version: number | null;
}

interface ParsedMove {
  san: string;
  move_number: number;
  color: 'w' | 'b';
}

interface MistakeInfo {
  tag: MistakeCard['tag'];
  phase: MistakeCard['phase'];
  eval_loss: number;
}

interface AnalysisInfo {
  classification: MoveClass | null;
  eval_before: number | null;
  eval_after: number | null;
  win_before: number | null;
  win_after: number | null;
  loss: number | null;
}

// Key for analysis map
function gaKey(moveNumber: number, color: 'w' | 'b') { return `${moveNumber}:${color}`; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]} ${d.getFullYear()}`;
}

const RESULT_LABEL: Record<string, string> = { win: 'Победа', draw: 'Ничья', loss: 'Поражение' };
const RESULT_COLOR: Record<string, string> = {
  win: 'var(--ivory)', draw: 'var(--muted)', loss: 'var(--control)',
};
const TIME_CLASS_RU: Record<string, string> = {
  bullet: 'Пуля', blitz: 'Блиц', rapid: 'Рапид', daily: 'Ежедн.', classical: 'Классика',
};

/** Format cp as +1.23 / -1.23 */
function fmtEval(cp: number | null): string {
  if (cp === null) return '—';
  const v = cp / 100;
  if (Math.abs(cp) >= 9000) return cp > 0 ? '#' : '-#';
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

function parseMoves(pgn: string): ParsedMove[] {
  const body = pgn.split('\n').filter(l => !l.trim().startsWith('[')).join(' ').trim();
  const chess = new Chess();
  const results: ParsedMove[] = [];
  const pattern = /(O-O-O[+#!?]*|O-O[+#!?]*|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#!?]*)\s*(?:\{[^}]*\})?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const san = match[1].replace(/[!?]+$/, '').trim();
    const colorToMove = chess.turn();
    const moveNumber = chess.moveNumber();
    let result;
    try { result = chess.move(san); } catch { continue; }
    if (!result) continue;
    results.push({ san: result.san, move_number: moveNumber, color: colorToMove as 'w' | 'b' });
  }
  return results;
}

// ── Classification badge ──────────────────────────────────────────────────────

function ClassBadge({ cls }: { cls: MoveClass }) {
  const sym = CLASS_SYMBOL[cls];
  const color = CLASS_COLOR[cls];
  if (!sym && cls === 'best') {
    return <span style={{ fontSize: 11, color, fontWeight: 700 }}>★</span>;
  }
  if (!sym) return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color,
      background: color + '22', borderRadius: 2,
      padding: '1px 3px', letterSpacing: 0,
    }}>
      {sym}
    </span>
  );
}

// ── Eval chart ────────────────────────────────────────────────────────────────

interface EvalPoint { ply: number; cp: number; label: string }

function EvalChart({ data }: { data: EvalPoint[] }) {
  if (data.length < 2) return null;
  return (
    <div style={{ height: 80, margin: '0 -4px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="evalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--ivory)" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="var(--ivory)" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="ply" hide />
          <YAxis domain={[-1000, 1000]} hide />
          <ReferenceLine y={0} stroke="var(--hairline)" strokeDasharray="2 2" />
          <Tooltip
            content={({ payload }) => {
              const p = payload?.[0]?.payload as EvalPoint | undefined;
              if (!p) return null;
              return (
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--hairline)',
                  padding: '4px 8px', fontSize: 11, color: 'var(--ivory)',
                }}>
                  {p.label}: {fmtEval(p.cp)}
                </div>
              );
            }}
          />
          <Area
            type="monotone" dataKey="cp"
            stroke="var(--ivory)" strokeWidth={1.5}
            fill="url(#evalGrad)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Accuracy pill ─────────────────────────────────────────────────────────────

function AccPill({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const color = value >= 85 ? 'var(--accent)' : value >= 70 ? 'var(--ivory)' : 'var(--control)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 56 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

// ── Course comparison types ───────────────────────────────────────────────────

interface CourseMatch {
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonTitle: string;
  deviationPly: number | null;
  gameMove: string | null;
  courseMove: string | null;
  whoDeviated: 'me' | 'opponent' | null;
}

function getFen4(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

function buildFenSequence(pgn: string): string[] {
  const chess = new Chess();
  const fens: string[] = [getFen4(chess.fen())];
  const body = pgn.split('\n').filter(l => !l.trim().startsWith('[')).join(' ').trim();
  const pattern = /(O-O-O[+#!?]*|O-O[+#!?]*|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#!?]*)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const san = m[1].replace(/[!?]+$/, '');
    try { chess.move(san); } catch { continue; }
    fens.push(getFen4(chess.fen()));
  }
  return fens;
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>;
}

export default function GameViewerPage({ params }: Props) {
  const { id } = use(params);
  const [game,       setGame]       = useState<GameRow | null>(null);
  const [moves,      setMoves]      = useState<ParsedMove[]>([]);
  const [mistakes,   setMistakes]   = useState<Map<string, MistakeInfo>>(new Map());
  const [analysis,   setAnalysis]   = useState<Map<string, AnalysisInfo>>(new Map());
  const [loading,    setLoading]    = useState(true);
  const [courseMatch, setCourseMatch] = useState<CourseMatch | null>(null);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const moveRefs = useRef<(HTMLDivElement | null)[]>([]);

  async function loadGame() {
    setLoading(true);
    const [{ data: gameData }, { data: cardsData }, { data: gaData }] = await Promise.all([
      supabase.from('games').select('*').eq('id', id).single(),
      supabase.from('mistake_cards').select('*').eq('game_id', id),
      supabase.from('game_analysis').select('*').eq('game_id', id),
    ]);

    if (!gameData) { setLoading(false); return; }

    const g = gameData as GameRow;
    setGame(g);

    const parsedMoves = parseMoves(g.pgn ?? '');
    setMoves(parsedMoves);

    // Mistake map keyed by san
    const mistakeMap = new Map<string, MistakeInfo>();
    for (const card of (cardsData ?? []) as MistakeCard[]) {
      if (!mistakeMap.has(card.my_move)) {
        mistakeMap.set(card.my_move, { tag: card.tag, phase: card.phase, eval_loss: card.eval_loss });
      }
    }
    setMistakes(mistakeMap);

    // Analysis map keyed by "moveNumber:color"
    interface GaRow {
      move_number: number; color: 'w' | 'b';
      classification: string | null;
      eval_before: number | null; eval_after: number | null;
      win_before: number | null; win_after: number | null;
      loss: number | null;
    }
    const analysisMap = new Map<string, AnalysisInfo>();
    for (const row of (gaData ?? []) as GaRow[]) {
      analysisMap.set(gaKey(row.move_number, row.color), {
        classification: (row.classification as MoveClass) ?? null,
        eval_before:    row.eval_before,
        eval_after:     row.eval_after,
        win_before:     row.win_before,
        win_after:      row.win_after,
        loss:           row.loss,
      });
    }
    setAnalysis(analysisMap);

    // ── Course comparison ───────────────────────────────────────────────────
    try {
      const gameFens = buildFenSequence(g.pgn ?? '');
      const { data: coursesData } = await supabase.from('courses').select('id, name, opening').not('opening', 'is', null).neq('opening', '');
      if (!coursesData?.length) { setLoading(false); return; }
      const { data: lessonsData } = await supabase.from('course_lessons').select('id, title, course_id')
        .in('course_id', (coursesData as Array<{ id: string }>).map(c => c.id));
      if (!lessonsData?.length) { setLoading(false); return; }
      const lessonIds = (lessonsData as Array<{ id: string }>).map(l => l.id);
      const { data: linesData } = await supabase.from('lesson_lines')
        .select('lesson_id, moves, start_fen').in('lesson_id', lessonIds).order('line_order', { ascending: true });

      interface CourseRow { id: string; name: string; }
      interface LessonRow { id: string; title: string; course_id: string; }
      interface LineRow { lesson_id: string; moves: Array<{ from: string; to: string; san: string; color: string }>; start_fen?: string; }

      const courseMap: Record<string, CourseRow> = {};
      for (const c of (coursesData as CourseRow[])) courseMap[c.id] = c;
      const lessonMap: Record<string, LessonRow> = {};
      for (const l of (lessonsData as LessonRow[])) lessonMap[l.id] = l;

      let bestMatch: CourseMatch | null = null;
      let bestMatchLen = 0;

      for (const line of (linesData ?? []) as LineRow[]) {
        const startFen = line.start_fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
        if (!Array.isArray(line.moves) || !line.moves.length) continue;
        const lineChess = new Chess(startFen);
        const lineFens: string[] = [getFen4(lineChess.fen())];
        for (const m of line.moves) {
          try { lineChess.move({ from: m.from, to: m.to }); } catch { break; }
          lineFens.push(getFen4(lineChess.fen()));
        }
        let matchLen = 0;
        for (let fi = 0; fi < Math.min(gameFens.length, lineFens.length); fi++) {
          if (gameFens[fi] === lineFens[fi]) matchLen = fi + 1; else break;
        }
        if (matchLen < 3 || matchLen <= bestMatchLen) continue;
        bestMatchLen = matchLen;
        const lesson = lessonMap[line.lesson_id];
        const course = lesson ? courseMap[lesson.course_id] : null;
        if (!lesson || !course) continue;
        let deviationPly: number | null = null;
        let gameMove: string | null = null;
        let courseMove: string | null = null;
        let whoDeviated: 'me' | 'opponent' | null = null;
        if (matchLen < lineFens.length && matchLen < gameFens.length) {
          deviationPly = matchLen;
          courseMove = line.moves[matchLen - 1]?.san ?? null;
          gameMove = parsedMoves[matchLen - 1]?.san ?? null;
          const myColor = g.color === 'white' ? 'w' : 'b';
          whoDeviated = (line.moves[matchLen - 1]?.color ?? 'w') === myColor ? 'me' : 'opponent';
        }
        bestMatch = { courseId: lesson.course_id, courseName: course.name, lessonId: lesson.id, lessonTitle: lesson.title, deviationPly, gameMove, courseMove, whoDeviated };
      }
      setCourseMatch(bestMatch);
    } catch { /* ignore */ }

    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const navigate = useCallback((dir: 1 | -1) => {
    setSelectedPly(p => {
      const cur = p ?? -1;
      const next = Math.max(0, Math.min(moves.length - 1, cur + dir));
      return next;
    });
  }, [moves.length]);

  const jumpToNextError = useCallback((dir: 1 | -1) => {
    const errorClasses: MoveClass[] = ['blunder', 'mistake', 'miss'];
    setSelectedPly(cur => {
      const start = cur ?? -1;
      for (let i = start + dir; i >= 0 && i < moves.length; i += dir) {
        const mv = moves[i];
        const ai = analysis.get(gaKey(mv.move_number, mv.color));
        if (ai?.classification && errorClasses.includes(ai.classification)) return i;
      }
      return cur;
    });
  }, [moves, analysis]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'k') { e.preventDefault(); navigate(1); }
      if (e.key === 'ArrowLeft'  || e.key === 'j') { e.preventDefault(); navigate(-1); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate]);

  // Scroll selected move into view
  useEffect(() => {
    if (selectedPly !== null) {
      moveRefs.current[selectedPly]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedPly]);

  // ── Derived data ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page animate-pulse">
        <div style={{ height: 60, width: 220, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
        <div style={{ height: 400, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="page">
        <Link href="/games" className="page-back">← Партии</Link>
        <p style={{ color: 'var(--muted)' }}>Партия не найдена.</p>
      </div>
    );
  }

  const myColor: 'w' | 'b' = game.color === 'white' ? 'w' : 'b';
  const hasAnalysis = !!game.analyzed_at && (game.analysis_version ?? 0) >= 2;

  // Group moves into pairs
  const movePairs: Array<{ number: number; white: ParsedMove | null; black: ParsedMove | null }> = [];
  let mi = 0;
  while (mi < moves.length) {
    const mn = moves[mi].move_number;
    const white = moves[mi]?.color === 'w' ? moves[mi] : null;
    const black = moves[mi + 1]?.color === 'b' ? moves[mi + 1] : null;
    movePairs.push({ number: mn, white, black });
    mi += (white ? 1 : 0) + (black ? 1 : 0);
    if (!white && !black) break;
  }

  // Build eval chart data (clamp to ±1000)
  const evalData: EvalPoint[] = [];
  for (let pi = 0; pi < moves.length; pi++) {
    const mv = moves[pi];
    const ai = analysis.get(gaKey(mv.move_number, mv.color));
    if (ai?.eval_after !== null && ai?.eval_after !== undefined) {
      const cp = Math.max(-1000, Math.min(1000, ai.eval_after));
      const isWhite = mv.color === 'w';
      evalData.push({ ply: pi + 1, cp, label: `${mv.move_number}${isWhite ? '.' : '…'}${mv.san}` });
    }
  }

  // Count classes for summary
  const classCounts: Partial<Record<MoveClass, number>> = {};
  for (const mv of moves) {
    const ai = analysis.get(gaKey(mv.move_number, mv.color));
    if (ai?.classification) {
      classCounts[ai.classification] = (classCounts[ai.classification] ?? 0) + 1;
    }
  }

  // Build flat ply→index for keyboard nav
  const selectedMove = selectedPly !== null ? moves[selectedPly] : null;
  const selectedAnalysis = selectedMove
    ? analysis.get(gaKey(selectedMove.move_number, selectedMove.color))
    : null;

  return (
    <div className="page">

      {/* Game header */}
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/games" className="page-back">← Партии</Link>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <h1 className="page-title">
              vs {game.opp_name}
              {game.rating_opp && (
                <span style={{ fontSize: '0.5em', fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>{game.rating_opp}</span>
              )}
            </h1>
            <span style={{ fontSize: 18, fontWeight: 600, color: RESULT_COLOR[game.result] }}>
              {RESULT_LABEL[game.result]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <span>{fmtDate(game.played_at)}</span>
            <span>{game.color === 'white' ? '♙ Белые' : '♟ Чёрные'}</span>
            {game.time_class && <span>{TIME_CLASS_RU[game.time_class] ?? game.time_class}</span>}
            {game.eco_name && <span style={{ color: 'var(--ivory)' }}>{game.eco_name}</span>}
            {game.rating_me && <span>Мой рейтинг: {game.rating_me}</span>}
            <a href={game.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>
              chess.com ↗
            </a>
          </div>
        </div>
      </div>

      {/* Analyze banner */}
      {!hasAnalysis && (
        <div className="ui-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>Партия ещё не проанализирована</span>
          <Link href="/games/analyze" className="ui-btn ui-btn-primary ui-btn-sm" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Анализировать
          </Link>
        </div>
      )}

      {/* Accuracy summary */}
      {hasAnalysis && (game.accuracy_white !== null || game.accuracy_black !== null) && (
        <div className="ui-card">
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <AccPill label="♙ Точность" value={game.accuracy_white} />
              <AccPill label="♟ Точность" value={game.accuracy_black} />
              {myColor === 'w' && game.accuracy_white !== null && (
                <AccPill label="Моя точность" value={game.accuracy_white} />
              )}
              {myColor === 'b' && game.accuracy_black !== null && (
                <AccPill label="Моя точность" value={game.accuracy_black} />
              )}
            </div>
            {/* Class summary */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(['blunder', 'mistake', 'miss', 'inaccuracy', 'brilliant', 'great'] as MoveClass[]).map(cls => {
                const count = classCounts[cls];
                if (!count) return null;
                return (
                  <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <span style={{ color: CLASS_COLOR[cls], fontWeight: 700 }}>
                      {CLASS_SYMBOL[cls] || CLASS_LABEL[cls]}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Eval chart */}
          {evalData.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <EvalChart data={evalData} />
            </div>
          )}
        </div>
      )}

      {/* Selected move info */}
      {selectedMove && selectedAnalysis && (
        <div style={{
          padding: '10px 16px', background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderLeft: selectedAnalysis.classification
            ? `3px solid ${CLASS_COLOR[selectedAnalysis.classification]}`
            : '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 600, color: 'var(--ivory)' }}>
            {selectedMove.move_number}{selectedMove.color === 'w' ? '.' : '…'}{selectedMove.san}
          </span>
          {selectedAnalysis.classification && (
            <span style={{ fontSize: 13, color: CLASS_COLOR[selectedAnalysis.classification] }}>
              {CLASS_LABEL[selectedAnalysis.classification]}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
            {fmtEval(selectedAnalysis.eval_before)} → {fmtEval(selectedAnalysis.eval_after)}
          </span>
        </div>
      )}

      {/* Move list */}
      <section>
        <div style={{ borderBottom: '1px solid var(--hairline)', paddingBottom: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Ходы</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {hasAnalysis && (
                <>
                  <button
                    onClick={() => jumpToNextError(-1)}
                    className="ui-btn ui-btn-outline ui-btn-sm"
                    title="Предыдущая ошибка"
                  >← ошибка</button>
                  <button
                    onClick={() => jumpToNextError(1)}
                    className="ui-btn ui-btn-outline ui-btn-sm"
                    title="Следующая ошибка"
                  >ошибка →</button>
                </>
              )}
              {mistakes.size > 0 && (
                <span style={{ fontSize: 13, color: 'var(--control)', alignSelf: 'center' }}>
                  {mistakes.size} {mistakes.size === 1 ? 'ошибка' : mistakes.size < 5 ? 'ошибки' : 'ошибок'}
                </span>
              )}
            </div>
          </div>
          {hasAnalysis && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              ← → для навигации по ходам
            </div>
          )}
        </div>

        {moves.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Нет ходов</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr', gap: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>#</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>Белые</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>Чёрные</span>

            {movePairs.map((pair) => {
              const wPly = pair.white ? moves.indexOf(pair.white) : -1;
              const bPly = pair.black ? moves.indexOf(pair.black) : -1;
              const wAi  = pair.white ? analysis.get(gaKey(pair.white.move_number, 'w')) : null;
              const bAi  = pair.black ? analysis.get(gaKey(pair.black.move_number, 'b')) : null;
              const wMistake = pair.white ? mistakes.get(pair.white.san) : null;
              const bMistake = pair.black ? mistakes.get(pair.black.san) : null;

              return [
                // Move number
                <span
                  key={`n${pair.number}`}
                  style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0', borderBottom: '1px solid var(--hairline)', fontVariantNumeric: 'tabular-nums', alignSelf: 'start', paddingTop: 10 }}
                >
                  {pair.number}.
                </span>,

                // White move
                <div
                  key={`w${pair.number}`}
                  ref={el => { if (wPly >= 0) moveRefs.current[wPly] = el; }}
                  onClick={() => wPly >= 0 && setSelectedPly(wPly === selectedPly ? null : wPly)}
                  style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--hairline)',
                    display: 'flex', flexDirection: 'column', gap: 2,
                    cursor: wPly >= 0 ? 'pointer' : 'default',
                    background: selectedPly === wPly ? 'var(--surface)' : 'transparent',
                  }}
                >
                  {pair.white && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 14, fontWeight: wMistake ? 600 : 400,
                          color: wAi?.classification
                            ? ((['blunder','mistake','miss'] as MoveClass[]).includes(wAi.classification) ? 'var(--control)' : 'var(--ivory)')
                            : (wMistake ? 'var(--control)' : 'var(--ivory)'),
                          fontFamily: 'monospace',
                        }}>
                          {pair.white.san}
                        </span>
                        {wAi?.classification && <ClassBadge cls={wAi.classification} />}
                      </div>
                      {wAi?.classification && (['blunder','mistake','miss','inaccuracy'] as MoveClass[]).includes(wAi.classification) && (
                        <span style={{ fontSize: 11, color: CLASS_COLOR[wAi.classification] }}>
                          {CLASS_LABEL[wAi.classification]}
                          {wAi.eval_before !== null && wAi.eval_after !== null && (
                            <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                              {fmtEval(wAi.eval_before)}→{fmtEval(wAi.eval_after)}
                            </span>
                          )}
                        </span>
                      )}
                      {!wAi?.classification && wMistake && (
                        <span style={{ fontSize: 11, color: 'var(--control)' }}>
                          {TAG_LABEL[wMistake.tag]} · {PHASE_LABEL[wMistake.phase]} · -{wMistake.eval_loss}cp
                        </span>
                      )}
                    </>
                  )}
                </div>,

                // Black move
                <div
                  key={`b${pair.number}`}
                  ref={el => { if (bPly >= 0) moveRefs.current[bPly] = el; }}
                  onClick={() => bPly >= 0 && setSelectedPly(bPly === selectedPly ? null : bPly)}
                  style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--hairline)',
                    display: 'flex', flexDirection: 'column', gap: 2,
                    cursor: bPly >= 0 ? 'pointer' : 'default',
                    background: selectedPly === bPly ? 'var(--surface)' : 'transparent',
                  }}
                >
                  {pair.black && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 14, fontWeight: bMistake ? 600 : 400,
                          color: bAi?.classification
                            ? ((['blunder','mistake','miss'] as MoveClass[]).includes(bAi.classification) ? 'var(--control)' : 'var(--ivory)')
                            : (bMistake ? 'var(--control)' : 'var(--ivory)'),
                          fontFamily: 'monospace',
                        }}>
                          {pair.black.san}
                        </span>
                        {bAi?.classification && <ClassBadge cls={bAi.classification} />}
                      </div>
                      {bAi?.classification && (['blunder','mistake','miss','inaccuracy'] as MoveClass[]).includes(bAi.classification) && (
                        <span style={{ fontSize: 11, color: CLASS_COLOR[bAi.classification] }}>
                          {CLASS_LABEL[bAi.classification]}
                          {bAi.eval_before !== null && bAi.eval_after !== null && (
                            <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                              {fmtEval(bAi.eval_before)}→{fmtEval(bAi.eval_after)}
                            </span>
                          )}
                        </span>
                      )}
                      {!bAi?.classification && bMistake && (
                        <span style={{ fontSize: 11, color: 'var(--control)' }}>
                          {TAG_LABEL[bMistake.tag]} · {PHASE_LABEL[bMistake.phase]} · -{bMistake.eval_loss}cp
                        </span>
                      )}
                    </>
                  )}
                </div>,
              ];
            })}
          </div>
        )}
      </section>

      {/* Link to mistakes */}
      {game.analyzed_at && mistakes.size > 0 && (
        <div style={{ paddingTop: 8 }}>
          <Link href="/mistakes" className="ui-btn ui-btn-primary" style={{ textDecoration: 'none' }}>
            Тренировать ошибки →
          </Link>
        </div>
      )}

      {/* Course match */}
      {courseMatch && (
        <section className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Курс</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)' }}>
            {courseMatch.courseName} · {courseMatch.lessonTitle}
          </div>
          {courseMatch.deviationPly !== null ? (
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              {courseMatch.whoDeviated === 'me' ? 'Ты' : 'Соперник'} отошёл от курса на ходу {Math.ceil(courseMatch.deviationPly / 2)}.
              {courseMatch.gameMove && courseMatch.courseMove && (
                <> В партии <code style={{ color: 'rgba(220,80,60,0.9)' }}>{courseMatch.gameMove}</code>, в курсе <code style={{ color: 'rgba(100,220,100,0.9)' }}>{courseMatch.courseMove}</code>.</>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--accent)' }}>Линия сыграна по курсу!</div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`/courses/${courseMatch.courseId}/${courseMatch.lessonId}`} className="ui-btn ui-btn-outline ui-btn-sm" style={{ textDecoration: 'none' }}>
              Открыть урок
            </Link>
            <Link href={`/courses/${courseMatch.courseId}/${courseMatch.lessonId}/practice`} className="ui-btn ui-btn-primary ui-btn-sm" style={{ textDecoration: 'none' }}>
              Повторить линию
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
