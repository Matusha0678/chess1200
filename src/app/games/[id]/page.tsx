'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { SquareRenderer } from 'react-chessboard';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import type { MistakeCard } from '@/lib/mistakes';
import { TAG_LABEL } from '@/lib/mistakes';
import { CLASS_LABEL, CLASS_COLOR, type MoveClass } from '@/lib/classify';
import { ClassIcon } from '@/components/ClassIcon';

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
  from: string;
  to: string;
  fenAfter: string;
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
  best_move: string | null;
}

function gaKey(moveNumber: number, color: 'w' | 'b') { return `${moveNumber}:${color}`; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]} ${d.getFullYear()}`;
}

const RESULT_LABEL: Record<string, string> = { win: 'Победа', draw: 'Ничья', loss: 'Поражение' };
const RESULT_COLOR: Record<string, string> = {
  win: 'var(--accent)', draw: 'var(--muted)', loss: 'var(--control)',
};
const TIME_CLASS_RU: Record<string, string> = {
  bullet: 'Пуля', blitz: 'Блиц', rapid: 'Рапид', daily: 'Ежедн.', classical: 'Классика',
};

function fmtEval(cp: number | null): string {
  if (cp === null) return '—';
  if (Math.abs(cp) >= 9000) return cp > 0 ? '#' : '-#';
  const v = cp / 100;
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
    results.push({
      san: result.san,
      move_number: moveNumber,
      color: colorToMove as 'w' | 'b',
      from: result.from,
      to: result.to,
      fenAfter: chess.fen(),
    });
  }
  return results;
}

// Parse UCI move string "e2e4" → { from: "e2", to: "e4" }
function parseUci(uci: string): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

const ERROR_CLASSES = new Set<MoveClass>(['blunder', 'mistake', 'miss', 'inaccuracy']);

// ── Eval bar ──────────────────────────────────────────────────────────────────

function EvalBar({ winWhite }: { winWhite: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, winWhite)) * 100);
  return (
    <div style={{
      width: 12, alignSelf: 'stretch', flexShrink: 0, overflow: 'hidden',
      border: '1px solid var(--hairline)', borderRadius: 2, display: 'flex',
      flexDirection: 'column',
    }}>
      {/* black area (top) */}
      <div style={{ flex: `0 0 ${100 - pct}%`, background: '#1c1c1c' }} />
      {/* white area (bottom) */}
      <div style={{ flex: `0 0 ${pct}%`, background: '#f0ede8' }} />
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

// ── Eval chart ────────────────────────────────────────────────────────────────

interface EvalPoint { ply: number; cp: number; label: string; cls?: MoveClass }

interface EvalChartProps { data: EvalPoint[]; selectedPly: number | null; onSelect: (ply: number) => void }

function EvalChart({ data, selectedPly, onSelect }: EvalChartProps) {
  if (data.length < 2) return null;

  type DotProps = { cx?: number; cy?: number; payload?: EvalPoint };

  return (
    <div
      style={{ height: 72, margin: '0 -4px', cursor: 'pointer' }}
      title="Нажми для перехода к ходу"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          onClick={(d) => {
            const idx = d?.activeIndex;
            if (idx !== undefined && idx !== null) {
              const pt = data[idx as number];
              if (pt) onSelect(pt.ply - 1);
            }
          }}
        >
          <defs>
            <linearGradient id="evalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--ivory)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--ivory)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ply" hide />
          <YAxis domain={[-1000, 1000]} hide />
          <ReferenceLine y={0} stroke="var(--hairline)" strokeDasharray="2 2" />
          {selectedPly !== null && (
            <ReferenceLine
              x={selectedPly + 1}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          )}
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
            isAnimationActive={false}
            dot={({ cx, cy, payload }: DotProps) => {
              const cls = payload?.cls;
              if (!cls || !(cls === 'blunder' || cls === 'mistake' || cls === 'miss' || cls === 'brilliant')) {
                return <g key={`empty-${payload?.ply}`} />;
              }
              return (
                <circle
                  key={`dot-${payload?.ply}`}
                  cx={cx} cy={cy} r={4}
                  fill={CLASS_COLOR[cls]}
                  stroke="var(--bg)"
                  strokeWidth={1}
                />
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Course comparison ─────────────────────────────────────────────────────────

interface CourseMatch {
  courseId: string; courseName: string; lessonId: string; lessonTitle: string;
  deviationPly: number | null; gameMove: string | null; courseMove: string | null;
  whoDeviated: 'me' | 'opponent' | null;
}

function getFen4(fen: string): string { return fen.split(' ').slice(0, 4).join(' '); }

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

interface Props { params: Promise<{ id: string }> }

export default function GameViewerPage({ params }: Props) {
  const { id } = use(params);

  const [game,         setGame]        = useState<GameRow | null>(null);
  const [moves,        setMoves]       = useState<ParsedMove[]>([]);
  const [mistakes,     setMistakes]    = useState<Map<string, MistakeInfo>>(new Map());
  const [analysis,     setAnalysis]    = useState<Map<string, AnalysisInfo>>(new Map());
  const [loading,      setLoading]     = useState(true);
  const [courseMatch,  setCourseMatch] = useState<CourseMatch | null>(null);
  const [selectedPly,  setSelectedPly] = useState<number | null>(null);
  const [orientation,  setOrientation] = useState<'white' | 'black'>('white');
  const [boardPx,      setBoardPx]     = useState(360);

  const moveRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const boardWrapRef   = useRef<HTMLDivElement>(null);

  // Track board pixel width for icon sizing
  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoardPx(el.offsetWidth));
    ro.observe(el);
    setBoardPx(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  async function loadGame() {
    setLoading(true);
    const [{ data: gameData }, { data: cardsData }, { data: gaData }] = await Promise.all([
      supabase.from('games').select('*').eq('id', id).single(),
      supabase.from('mistake_cards').select('*').eq('game_id', id),
      supabase.from('game_analysis').select('*').eq('game_id', id).order('move_number').order('color'),
    ]);

    if (!gameData) { setLoading(false); return; }

    const g = gameData as GameRow;
    setGame(g);
    setOrientation(g.color === 'white' ? 'white' : 'black');

    const parsedMoves = parseMoves(g.pgn ?? '');
    setMoves(parsedMoves);

    const mistakeMap = new Map<string, MistakeInfo>();
    for (const card of (cardsData ?? []) as MistakeCard[]) {
      if (!mistakeMap.has(card.my_move)) {
        mistakeMap.set(card.my_move, { tag: card.tag, phase: card.phase, eval_loss: card.eval_loss });
      }
    }
    setMistakes(mistakeMap);

    interface GaRow {
      move_number: number; color: 'w' | 'b';
      classification: string | null;
      eval_before: number | null; eval_after: number | null;
      win_before: number | null; win_after: number | null;
      loss: number | null; best_move: string | null;
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
        best_move:      row.best_move,
      });
    }
    setAnalysis(analysisMap);

    // ── Course comparison ─────────────────────────────────────────────────────
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

      interface CourseRow  { id: string; name: string; }
      interface LessonRow  { id: string; title: string; course_id: string; }
      interface LineRow    { lesson_id: string; moves: Array<{ from: string; to: string; san: string; color: string }>; start_fen?: string; }

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
        for (const mv of line.moves) {
          try { lineChess.move({ from: mv.from, to: mv.to }); } catch { break; }
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
      return Math.max(0, Math.min(moves.length - 1, cur + dir));
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
      if (e.key === 'Home') { e.preventDefault(); setSelectedPly(null); }
      if (e.key === 'End')  { e.preventDefault(); setSelectedPly(moves.length - 1); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate, moves.length]);

  useEffect(() => {
    if (selectedPly !== null) {
      moveRefs.current[selectedPly]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedPly]);

  // ── Loading / not found ───────────────────────────────────────────────────

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

  // ── Derived data ──────────────────────────────────────────────────────────

  const myColor: 'w' | 'b' = game.color === 'white' ? 'w' : 'b';
  const hasAnalysis = !!game.analyzed_at && (game.analysis_version ?? 0) >= 2;

  const selectedMove = selectedPly !== null ? moves[selectedPly] : null;
  const selectedAnalysis = selectedMove
    ? analysis.get(gaKey(selectedMove.move_number, selectedMove.color)) ?? null
    : null;

  // Current FEN for board
  const currentFen = selectedPly === null
    ? INITIAL_FEN
    : (moves[selectedPly]?.fenAfter ?? INITIAL_FEN);

  // Win probability for eval bar (white's perspective)
  const currentWinWhite = hasAnalysis
    ? (selectedAnalysis?.win_after ?? 0.5)
    : 0.5;

  // Arrows: show best_move for error classes (Arrow type uses startSquare/endSquare)
  const arrows: Array<{ startSquare: string; endSquare: string; color: string }> = [];
  if (selectedAnalysis?.best_move && selectedAnalysis.classification && ERROR_CLASSES.has(selectedAnalysis.classification)) {
    const uci = parseUci(selectedAnalysis.best_move);
    if (uci) arrows.push({ startSquare: uci.from, endSquare: uci.to, color: 'rgba(80,200,80,0.80)' });
  }

  // ~45% of cell width, min 26px — clearly visible above the piece
  const iconSize = Math.max(26, Math.round(boardPx / 8 * 0.45));

  // squareRenderer: highlight from/to + ClassIcon centered above the piece
  const squareRenderer: SquareRenderer = ({ square, children }) => {
    const isFrom = selectedMove?.from === square;
    const isTo   = selectedMove?.to   === square;
    const cls    = isTo ? selectedAnalysis?.classification ?? null : null;
    const color  = cls ? CLASS_COLOR[cls] : null;

    if (!isFrom && !isTo) return <>{children}</>;

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {children}
        {/* Square tint */}
        {(isFrom || isTo) && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: color ? `${color}55` : 'rgba(100,180,100,0.35)',
            }}
          />
        )}
        {/* ClassIcon: centered horizontally, sits at the top of the square
            so it floats visually above the piece head */}
        {isTo && cls && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 2,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
            }}
          >
            <ClassIcon cls={cls} size={iconSize} />
          </div>
        )}
      </div>
    );
  };

  // Group moves into pairs for the move list
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

  // Eval chart data
  const evalData: EvalPoint[] = [];
  for (let pi = 0; pi < moves.length; pi++) {
    const mv = moves[pi];
    const ai = analysis.get(gaKey(mv.move_number, mv.color));
    if (ai?.eval_after !== null && ai?.eval_after !== undefined) {
      const cp  = Math.max(-1000, Math.min(1000, ai.eval_after));
      const isW = mv.color === 'w';
      evalData.push({
        ply: pi + 1, cp,
        label: `${mv.move_number}${isW ? '.' : '…'}${mv.san}`,
        cls: ai.classification ?? undefined,
      });
    }
  }

  // Class counts for summary
  const classCounts: Partial<Record<MoveClass, number>> = {};
  for (const mv of moves) {
    const ai = analysis.get(gaKey(mv.move_number, mv.color));
    if (ai?.classification) {
      classCounts[ai.classification] = (classCounts[ai.classification] ?? 0) + 1;
    }
  }

  const CLASS_ORDER: MoveClass[] = ['brilliant','great','best','excellent','good','book','inaccuracy','mistake','miss','blunder'];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">

      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/games" className="page-back">← Партии</Link>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <h1 className="page-title">
              vs {game.opp_name}
              {game.rating_opp && (
                <span style={{ fontSize: '0.5em', fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                  {game.rating_opp}
                </span>
              )}
            </h1>
            <span style={{ fontSize: 18, fontWeight: 600, color: RESULT_COLOR[game.result] }}>
              {RESULT_LABEL[game.result]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <span>{fmtDate(game.played_at)}</span>
            <span>{game.color === 'white' ? '♙ Белые' : '♟ Чёрные'}</span>
            {game.time_class && <span>{TIME_CLASS_RU[game.time_class] ?? game.time_class}</span>}
            {game.eco_name && <span style={{ color: 'var(--ivory)' }}>{game.eco_name}</span>}
            {game.rating_me && <span>Мой рейтинг: {game.rating_me}</span>}
            <a href={game.url} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--muted)', textDecoration: 'underline' }}>chess.com ↗</a>
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

      {/* ── Main two-column layout ── */}
      <div style={{
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}>

        {/* ── Left: eval bar + board + controls + annotation ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto', width: 'min(480px, calc(100vw - 32px))' }}>

          {/* Board row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            {/* Eval bar */}
            {hasAnalysis && <EvalBar winWhite={currentWinWhite} />}

            {/* Board */}
            <div
              ref={boardWrapRef}
              style={{ position: 'relative', aspectRatio: '1', flex: 1, overflow: 'hidden' }}
            >
              <Chessboard
                options={{
                  position: currentFen,
                  boardOrientation: orientation,
                  allowDragging: false,
                  squareRenderer,
                  arrows: arrows.length ? arrows : [],
                  boardStyle: { width: '100%', height: '100%', borderRadius: 0 },
                }}
              />
            </div>
          </div>

          {/* Nav buttons */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <button
              className="ui-btn ui-btn-outline ui-btn-sm"
              onClick={() => setSelectedPly(null)}
              title="Начало (Home)"
            >|◀</button>
            <button
              className="ui-btn ui-btn-outline ui-btn-sm"
              onClick={() => navigate(-1)}
              title="Назад (←)"
            >◀</button>
            <button
              className="ui-btn ui-btn-outline ui-btn-sm"
              onClick={() => navigate(1)}
              title="Вперёд (→)"
            >▶</button>
            <button
              className="ui-btn ui-btn-outline ui-btn-sm"
              onClick={() => setSelectedPly(moves.length - 1)}
              title="Конец (End)"
            >▶|</button>
            <button
              className="ui-btn ui-btn-outline ui-btn-sm"
              onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
              title="Перевернуть доску"
              style={{ marginLeft: 8 }}
            >⇅</button>
            {hasAnalysis && (
              <>
                <button
                  className="ui-btn ui-btn-outline ui-btn-sm"
                  onClick={() => jumpToNextError(-1)}
                  title="Предыдущая ошибка (J)"
                  style={{ marginLeft: 8 }}
                >← ошибка</button>
                <button
                  className="ui-btn ui-btn-outline ui-btn-sm"
                  onClick={() => jumpToNextError(1)}
                  title="Следующая ошибка (K)"
                >ошибка →</button>
              </>
            )}
          </div>

          {/* Move annotation under board */}
          {selectedMove && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderLeft: selectedAnalysis?.classification
                ? `3px solid ${CLASS_COLOR[selectedAnalysis.classification]}`
                : '3px solid var(--hairline)',
              borderRadius: 'var(--radius-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {/* Move + class */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {selectedAnalysis?.classification && (
                  <ClassIcon cls={selectedAnalysis.classification} size={28} />
                )}
                <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: 'var(--ivory)' }}>
                  {selectedMove.move_number}{selectedMove.color === 'w' ? '.' : '…'}{selectedMove.san}
                </span>
                {selectedAnalysis?.classification && (
                  <span style={{ fontSize: 14, color: CLASS_COLOR[selectedAnalysis.classification], fontWeight: 600 }}>
                    {CLASS_LABEL[selectedAnalysis.classification]}
                  </span>
                )}
              </div>
              {/* Best move hint + eval */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {selectedAnalysis?.best_move &&
                 selectedAnalysis.classification &&
                 ERROR_CLASSES.has(selectedAnalysis.classification) && (
                  <span style={{ fontSize: 13, color: 'var(--accent)' }}>
                    Лучше было {selectedAnalysis.best_move}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                  {fmtEval(selectedAnalysis?.eval_before ?? null)}
                  {' → '}
                  {fmtEval(selectedAnalysis?.eval_after ?? null)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: summary + chart + moves ── */}
        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Accuracy + class summary */}
          {hasAnalysis && (
            <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Accuracy pills */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <AccPill label="♙ Белые" value={game.accuracy_white} />
                <AccPill label="♟ Чёрные" value={game.accuracy_black} />
                {myColor === 'w' && <AccPill label="Моя точность" value={game.accuracy_white} />}
                {myColor === 'b' && <AccPill label="Моя точность" value={game.accuracy_black} />}
              </div>

              {/* Class counts */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CLASS_ORDER.map(cls => {
                  const count = classCounts[cls];
                  if (!count) return null;
                  return (
                    <div key={cls} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 7px',
                      background: `${CLASS_COLOR[cls]}18`,
                      border: `1px solid ${CLASS_COLOR[cls]}44`,
                      borderRadius: 'var(--radius-btn)',
                    }}>
                      <ClassIcon cls={cls} size={16} />
                      <span style={{ fontSize: 12, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Eval chart */}
              {evalData.length > 1 && (
                <EvalChart
                  data={evalData}
                  selectedPly={selectedPly}
                  onSelect={setSelectedPly}
                />
              )}
            </div>
          )}

          {/* Move list */}
          <section>
            <div style={{
              borderBottom: '1px solid var(--hairline)',
              paddingBottom: 8, marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Ходы</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                ← → J K навигация
              </span>
            </div>

            {moves.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Нет ходов</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', gap: 0 }}>
                {/* Header */}
                {(['#','Белые','Чёрные'] as const).map(h => (
                  <span key={h} style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--muted)',
                    padding: '6px 0 6px 4px',
                    borderBottom: '1px solid var(--hairline)',
                  }}>{h}</span>
                ))}

                {movePairs.map((pair) => {
                  const wPly = pair.white ? moves.indexOf(pair.white) : -1;
                  const bPly = pair.black ? moves.indexOf(pair.black) : -1;
                  const wAi  = pair.white ? analysis.get(gaKey(pair.white.move_number, 'w')) : null;
                  const bAi  = pair.black ? analysis.get(gaKey(pair.black.move_number, 'b')) : null;
                  const wMistake = pair.white ? mistakes.get(pair.white.san) : null;
                  const bMistake = pair.black ? mistakes.get(pair.black.san) : null;

                  return [
                    <span key={`n${pair.number}`} style={{
                      fontSize: 12, color: 'var(--muted)', padding: '7px 0 7px 4px',
                      borderBottom: '1px solid var(--hairline)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {pair.number}.
                    </span>,

                    <MoveCell
                      key={`w${pair.number}`}
                      move={pair.white}
                      ai={wAi}
                      mistake={wMistake}
                      ply={wPly}
                      selected={selectedPly === wPly}
                      onClick={() => wPly >= 0 && setSelectedPly(wPly === selectedPly ? null : wPly)}
                      ref={el => { if (wPly >= 0) moveRefs.current[wPly] = el; }}
                    />,

                    <MoveCell
                      key={`b${pair.number}`}
                      move={pair.black}
                      ai={bAi}
                      mistake={bMistake}
                      ply={bPly}
                      selected={selectedPly === bPly}
                      onClick={() => bPly >= 0 && setSelectedPly(bPly === selectedPly ? null : bPly)}
                      ref={el => { if (bPly >= 0) moveRefs.current[bPly] = el; }}
                    />,
                  ];
                })}
              </div>
            )}
          </section>

          {/* Link to mistake trainer */}
          {game.analyzed_at && mistakes.size > 0 && (
            <div>
              <Link href="/mistakes" className="ui-btn ui-btn-primary" style={{ textDecoration: 'none' }}>
                Тренировать ошибки →
              </Link>
            </div>
          )}
        </div>
      </div>

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
                <> В партии <code style={{ color: 'var(--control)' }}>{courseMatch.gameMove}</code>, в курсе <code style={{ color: 'var(--accent)' }}>{courseMatch.courseMove}</code>.</>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--accent)' }}>Линия сыграна по курсу!</div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`/courses/${courseMatch.courseId}/${courseMatch.lessonId}`}
              className="ui-btn ui-btn-outline ui-btn-sm" style={{ textDecoration: 'none' }}>
              Открыть урок
            </Link>
            <Link href={`/courses/${courseMatch.courseId}/${courseMatch.lessonId}/practice`}
              className="ui-btn ui-btn-primary ui-btn-sm" style={{ textDecoration: 'none' }}>
              Повторить линию
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

// ── MoveCell subcomponent ─────────────────────────────────────────────────────

import React from 'react';

interface MoveCellProps {
  move: ParsedMove | null;
  ai: AnalysisInfo | null | undefined;
  mistake: MistakeInfo | null | undefined;
  ply: number;
  selected: boolean;
  onClick: () => void;
}

const MoveCell = React.forwardRef<HTMLDivElement, MoveCellProps>(
  function MoveCell({ move, ai, mistake, ply, selected, onClick }, ref) {
    if (!move) {
      return (
        <div
          ref={ref}
          style={{ padding: '7px 8px', borderBottom: '1px solid var(--hairline)' }}
        />
      );
    }

    const cls = ai?.classification ?? null;
    const isError = cls && (['blunder','mistake','miss'] as MoveClass[]).includes(cls);
    const textColor = isError ? 'var(--control)' : (mistake ? 'var(--control)' : 'var(--ivory)');

    return (
      <div
        ref={ref}
        onClick={onClick}
        style={{
          padding: '7px 8px',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', gap: 5,
          cursor: ply >= 0 ? 'pointer' : 'default',
          background: selected ? 'var(--surface)' : 'transparent',
        }}
      >
        {/* ClassIcon (18px) */}
        {cls && <ClassIcon cls={cls} size={18} />}
        {!cls && <div style={{ width: 18, flexShrink: 0 }} />}

        <span style={{
          fontSize: 14, fontFamily: 'monospace', fontWeight: isError ? 600 : 400, color: textColor,
        }}>
          {move.san}
        </span>

        {/* Fallback: show tag if no AI classification but old mistake card */}
        {!cls && mistake && (
          <span style={{ fontSize: 10, color: 'var(--control)', marginLeft: 2 }}>
            {TAG_LABEL[mistake.tag]}
          </span>
        )}
      </div>
    );
  }
);
