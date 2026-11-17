'use client';

import { useState, useEffect, useCallback, useRef, use, useMemo } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { useStockfish } from '@/hooks/useStockfish';
import type { MultiPVLine } from '@/hooks/useStockfish';
import { describeMove, pieceName, uciToSan } from '@/lib/chess-utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MasterGame {
  id: string;
  white: string;
  black: string;
  event: string;
  year: number | null;
  result: string;
  pgn: string;
  moments_analyzed_at?: string | null;
}

interface ParsedMove {
  san: string;
  from: string;
  to: string;
  fen: string;        // FEN AFTER this move was played
  color: 'w' | 'b';
  comment?: string;
}

type MomentKind = 'sac' | 'check' | 'capture' | 'annotated';
interface Moment {
  ply: number;
  fen: string;        // FEN BEFORE this move was played
  master_move: string;
  best_move: string;
  second_gap_cp: number | null;
  kind: MomentKind;
}

type Mode = 'key' | 'sac' | 'all';
type GuessPhase = 'off' | 'choosing' | 'analyzing' | 'playing' | 'paused' | 'done';

interface MomentScore {
  ply: number;
  pts: 0 | 1 | 2;
  kind: MomentKind;
  masterSan: string;
  userSan: string;
}

interface PendingResult {
  score: MomentScore;
  bestUci: string;
  cpBefore?: number;
  cpAfter?: number;
  explanation: string[];
  commentary?: string;
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ── PGN parse ─────────────────────────────────────────────────────────────────

function parseGameMoves(pgn: string): ParsedMove[] {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { return []; }

  // Extract comments by their order in the move stream
  const t = pgn.replace(/\[[^\]]*\]/g, '');
  const commentsByMoveIdx: Map<number, string> = new Map();
  let cIdx = 0;
  t.replace(/\{([^}]*)\}/g, (_, c) => { commentsByMoveIdx.set(cIdx++, c.trim()); return ''; });

  const history = chess.history({ verbose: true });
  const out: ParsedMove[] = [];
  const replay = new Chess();
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    out.push({
      san: m.san, from: m.from, to: m.to, fen: replay.fen(),
      color: m.color, comment: commentsByMoveIdx.get(i),
    });
  }
  return out;
}

function parseAnnotations(pgn: string): Map<number, '!' | '!!'> {
  const out = new Map<number, '!' | '!!'>();
  let t = pgn.replace(/\[[^\]]*\]/g, '');
  t = t.replace(/\{[^}]*\}/g, '');
  // Strip RAV (recursive annotation variations) — handle one level
  for (let i = 0; i < 4; i++) t = t.replace(/\([^()]*\)/g, '');
  t = t.replace(/\d+\.(\.\.)?/g, '');
  const tokens = t.trim().split(/\s+/).filter(tok =>
    tok && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)
  );
  tokens.forEach((tok, idx) => {
    if (tok.endsWith('!!'))                           out.set(idx, '!!');
    else if (tok.endsWith('!') && !tok.includes('?')) out.set(idx, '!');
  });
  return out;
}

function getFenBefore(moves: ParsedMove[], idx: number): string {
  if (idx <= 0) return INITIAL_FEN;
  return moves[idx - 1].fen;
}

function evalCpSideToMove(line: MultiPVLine | undefined): number | undefined {
  if (!line) return undefined;
  if (line.mate != null) return line.mate > 0 ? 10000 : -10000;
  return line.cp;
}

/** eval bar fill percent for a given cp (side-to-move POV) */
function cpToPercent(cp: number | null | undefined): number {
  if (cp == null) return 50;
  if (cp >= 10000) return 100;
  if (cp <= -10000) return 0;
  return 50 + 50 * Math.tanh(cp / 400);
}

function formatEvalShort(cp: number | null | undefined): string {
  if (cp == null) return '—';
  if (cp >= 10000) return '#';
  if (cp <= -10000) return '-#';
  const sign = cp > 0 ? '+' : '';
  return sign + (cp / 100).toFixed(2);
}

/** Build the explanation text. Returns a list of short bullets. */
function explainMasterMove(
  masterMoment: Moment,
  cpBefore: number | undefined,
  cpAfter: number | undefined,
): string[] {
  const bullets: string[] = [];
  const t = describeMove(masterMoment.fen, masterMoment.master_move);
  if (t.isCheck)                     bullets.push(t.isMate ? 'Мат!' : 'Шах.');
  if (t.capturedPiece)               bullets.push(`Выигрывает ${pieceName(t.capturedPiece)}.`);
  if (t.isSac)                       bullets.push(`Жертва ${t.movedPiece ? pieceName(t.movedPiece) : 'фигуры'}.`);
  if (masterMoment.kind === 'annotated') bullets.push('Отмечен автором: сильный или важный ход.');
  if (cpBefore != null && cpAfter != null) {
    // cpAfter is from opponent's POV — negate for same-side comparison
    const cpAfterOur = -cpAfter;
    const diff = cpAfterOur - cpBefore;
    if (diff >= 50)         bullets.push(`Движок: позиция усиливается на +${(diff/100).toFixed(2)}.`);
    else if (diff <= -200)  bullets.push(`Движок: позиция ухудшается на ${(diff/100).toFixed(2)}.`);
  }
  if (bullets.length === 0) bullets.push('Единственный сильный ход по оценке движка.');
  return bullets;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MasterGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { boardTheme, customPieces, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();
  const { getMultiPV, getEval, isReady: engineReady } = useStockfish();

  // ── Game data ──
  const [game, setGame]         = useState<MasterGame | null>(null);
  const [moves, setMoves]       = useState<ParsedMove[]>([]);
  const [annotations, setAnnotations] = useState<Map<number, '!' | '!!'>>(new Map());
  const [moments, setMoments]   = useState<Moment[]>([]);
  const [loading, setLoading]   = useState(true);

  // ── Viewer state ──
  const [viewIdx, setViewIdx]   = useState(0);         // 0=initial, N=after N plys
  const [flipped, setFlipped]   = useState(false);

  // ── Guess mode ──
  const [guessPhase, setGuessPhase] = useState<GuessPhase>('off');
  const [mode, setMode]             = useState<Mode>('key');
  const [skipOpening, setSkipOpening] = useState(10);
  const [side, setSide]             = useState<'white' | 'black' | null>(null);
  const [scores, setScores]         = useState<MomentScore[]>([]);
  const [pending, setPending]       = useState<PendingResult | null>(null);
  const [engineTop, setEngineTop]   = useState<MultiPVLine[] | null>(null);
  const [currentMoment, setCurrentMoment] = useState<Moment | null>(null);
  const [evalCp, setEvalCp]         = useState<number | null>(null);

  // ── Analysis ──
  const [analyzeProg, setAnalyzeProg] = useState<{ done: number; total: number } | null>(null);
  const stopAnalyzeRef = useRef(false);

  // ── Refs to avoid stale closures in play loop ──
  const guessPhaseRef = useRef(guessPhase);
  guessPhaseRef.current = guessPhase;

  // ── Load game + moments ──
  useEffect(() => {
    (async () => {
      const [{ data: g }, { data: ms }] = await Promise.all([
        supabase.from('master_games').select('*').eq('id', id).single(),
        supabase.from('master_moments').select('*').eq('game_id', id).order('ply'),
      ]);
      if (!g) { setLoading(false); return; }
      const gameData = g as MasterGame;
      setGame(gameData);
      const parsed = parseGameMoves(gameData.pgn);
      setMoves(parsed);
      setAnnotations(parseAnnotations(gameData.pgn));
      setMoments((ms ?? []) as Moment[]);
      // Auto-detect Tal side
      const w = gameData.white.toLowerCase();
      const b = gameData.black.toLowerCase();
      if (w.includes('tal'))      setSide('white');
      else if (b.includes('tal')) setSide('black');
      setLoading(false);
    })();
  }, [id]);

  const needsAnalysis = useMemo(() => {
    if (!game) return false;
    return !game.moments_analyzed_at && moments.length === 0;
  }, [game, moments.length]);

  const isMyTurn = useCallback((moveColor: 'w' | 'b') => {
    return (side === 'white' && moveColor === 'w') ||
           (side === 'black' && moveColor === 'b');
  }, [side]);

  // ── Shown position ──
  const displayIdx = guessPhase === 'off' ? viewIdx : viewIdx;
  const fen = displayIdx === 0 ? INITIAL_FEN : moves[displayIdx - 1]?.fen ?? INITIAL_FEN;

  // ── Stop-point logic ──
  const shouldStopAt = useCallback((ply: number): boolean => {
    if (ply < skipOpening * 2) return false;
    if (mode === 'all')        return true;
    const m = moments.find(x => x.ply === ply);
    if (!m) return false;
    if (mode === 'sac')        return m.kind === 'sac';
    return true;
  }, [mode, moments, skipOpening]);

  // ── Analysis loop ─────────────────────────────────────────────────────────

  async function analyzeKeyMoments() {
    if (!game || moves.length === 0) return;
    setGuessPhase('analyzing');
    stopAnalyzeRef.current = false;

    const startPly = skipOpening * 2;

    // Pre-filter: candidate plys (fast chess.js checks)
    const candidates: number[] = [];
    for (let ply = startPly; ply < moves.length; ply++) {
      const move = moves[ply];
      const fenBefore = getFenBefore(moves, ply);
      const uci = move.from + move.to;
      const traits = describeMove(fenBefore, uci);
      const ann = annotations.get(ply);
      const hasComment = !!move.comment;
      if (traits.isSac || traits.isCheck || traits.capturedPiece || ann || hasComment) {
        candidates.push(ply);
      }
    }

    setAnalyzeProg({ done: 0, total: candidates.length });

    // Engine pass
    interface Analyzed { ply: number; kind: MomentKind | null; gap: number; bestMove: string; fenBefore: string; uci: string; }
    const analyzed: Analyzed[] = [];

    for (let i = 0; i < candidates.length; i++) {
      if (stopAnalyzeRef.current) break;
      const ply = candidates[i];
      const move = moves[ply];
      const fenBefore = getFenBefore(moves, ply);
      const uci = move.from + move.to;
      const traits = describeMove(fenBefore, uci);
      const ann = annotations.get(ply);

      let baseKind: MomentKind | null = null;
      if (traits.isSac)                     baseKind = 'sac';
      else if (ann || move.comment)         baseKind = 'annotated';
      else if (traits.isCheck)              baseKind = 'check';
      else if (traits.capturedPiece)        baseKind = 'capture';

      const lines = await new Promise<MultiPVLine[]>(resolve => getMultiPV(fenBefore, 10, 2, resolve));
      const best   = lines[0];
      const second = lines[1];
      const bestCp   = evalCpSideToMove(best);
      const secondCp = evalCpSideToMove(second);
      const gap = (bestCp != null && secondCp != null) ? Math.max(0, bestCp - secondCp) : 0;

      analyzed.push({ ply, kind: baseKind, gap, bestMove: best?.move ?? '', fenBefore, uci });
      setAnalyzeProg({ done: i + 1, total: candidates.length });
    }

    // Filter: include with 80cp threshold for check/capture
    function pickWithThreshold(threshold: number): Moment[] {
      const picked: Moment[] = [];
      for (const a of analyzed) {
        if (!a.kind) continue;
        let include = false;
        if (a.kind === 'sac' || a.kind === 'annotated')        include = true;
        else if (a.kind === 'check' || a.kind === 'capture')   include = a.gap >= threshold;
        if (include) {
          picked.push({
            ply: a.ply, fen: a.fenBefore, master_move: a.uci,
            best_move: a.bestMove, second_gap_cp: a.gap, kind: a.kind,
          });
        }
      }
      return picked;
    }

    let found = pickWithThreshold(80);
    if (found.length < 3) found = pickWithThreshold(50);

    // Save to DB
    if (found.length > 0) {
      await supabase.from('master_moments').upsert(
        found.map(m => ({ ...m, game_id: id })),
        { onConflict: 'game_id,ply' },
      );
    }
    await supabase.from('master_games').update({ moments_analyzed_at: new Date().toISOString() }).eq('id', id);

    setMoments(found);
    setAnalyzeProg(null);
    beginPlay();
  }

  // ── Play ──────────────────────────────────────────────────────────────────

  function beginPlay() {
    setScores([]);
    setPending(null);
    setCurrentMoment(null);
    setEngineTop(null);
    setEvalCp(null);
    // Position at start of "after-opening" region (but show from very beginning)
    setViewIdx(0);
    setGuessPhase('playing');
  }

  function cancelPlay() {
    setGuessPhase('off');
    setViewIdx(0);
    setPending(null);
    setCurrentMoment(null);
    setEngineTop(null);
  }

  // Auto-advance effect
  useEffect(() => {
    if (guessPhase !== 'playing') return;
    if (moves.length === 0) return;

    if (viewIdx >= moves.length) {
      // Game over
      finishGuess();
      return;
    }

    const upcoming = moves[viewIdx];
    const isMy = isMyTurn(upcoming.color);
    const stop = isMy && shouldStopAt(viewIdx);

    // Delay depends on whether a comment was just displayed
    const justPlayed = viewIdx > 0 ? moves[viewIdx - 1] : undefined;
    const commentExtra = justPlayed?.comment ? 2500 : 0;

    if (stop) {
      // Wait for comment first, then pause
      const t = setTimeout(() => pauseAt(viewIdx), commentExtra > 0 ? commentExtra : 500);
      return () => clearTimeout(t);
    }

    // Auto-advance
    const base = 850;
    const t = setTimeout(() => setViewIdx(i => i + 1), base + commentExtra);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewIdx, guessPhase, moves, mode, skipOpening, side, moments]);

  function pauseAt(ply: number) {
    const fenBefore = getFenBefore(moves, ply);
    const moment = moments.find(m => m.ply === ply) ?? null;
    setCurrentMoment(moment);
    setGuessPhase('paused');
    setEngineTop(null);
    setEvalCp(null);
    // Fetch top-3 engine moves (for 1-pt scoring) + eval
    getMultiPV(fenBefore, 10, 3, (lines) => {
      setEngineTop(lines);
      setEvalCp(evalCpSideToMove(lines[0]) ?? null);
    });
  }

  function handleUserDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (guessPhase !== 'paused' || !targetSquare) return false;
    if (viewIdx >= moves.length) return false;
    if (pending) return false;

    const fenBefore = getFenBefore(moves, viewIdx);
    const master = moves[viewIdx];

    // Handle promotion default to queen
    const isPromo = (() => {
      try {
        const ch = new Chess(fenBefore);
        const sq = ch.get(sourceSquare as Parameters<typeof ch.get>[0]);
        return sq?.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1');
      } catch { return false; }
    })();
    const userUci   = sourceSquare + targetSquare + (isPromo ? 'q' : '');
    const masterUci = master.from + master.to;

    // Scoring
    let pts: 0 | 1 | 2 = 0;
    if (userUci.slice(0, 4) === masterUci.slice(0, 4)) {
      pts = 2;
    } else if (engineTop) {
      const best = engineTop[0];
      const bestCp = evalCpSideToMove(best);
      // top-3 within 50 cp of best
      const within = engineTop.filter(l => {
        if (bestCp == null) return false;
        const cp = evalCpSideToMove(l);
        if (cp == null) return false;
        return (bestCp - cp) <= 50;
      });
      if (within.some(l => l.move === userUci.slice(0, 4))) pts = 1;
    }

    const momentKind = currentMoment?.kind ?? 'annotated';
    const scoreEntry: MomentScore = {
      ply: viewIdx,
      pts,
      kind: momentKind,
      masterSan: master.san,
      userSan: uciToSan(fenBefore, userUci),
    };

    // After showing result, advance the viewer by one (showing master's actual move)
    const bestUci = engineTop?.[0]?.move ?? currentMoment?.best_move ?? '';
    const cpBefore = evalCpSideToMove(engineTop?.[0]);

    // Compute eval AFTER master's move (opponent's perspective)
    const afterFen = (() => {
      try {
        const ch = new Chess(fenBefore);
        ch.move({ from: master.from, to: master.to });
        return ch.fen();
      } catch { return null; }
    })();

    const momentForExplain: Moment = currentMoment ?? {
      ply: viewIdx, fen: fenBefore, master_move: masterUci,
      best_move: bestUci, second_gap_cp: null, kind: momentKind,
    };

    // Set initial pending (with just cpBefore), then refine with cpAfter asynchronously
    setPending({
      score: scoreEntry,
      bestUci,
      cpBefore,
      cpAfter: undefined,
      explanation: explainMasterMove(momentForExplain, cpBefore, undefined),
      commentary: master.comment,
    });

    // Advance viewer by 1 so the board shows master's move
    setViewIdx(viewIdx + 1);

    if (afterFen) {
      getEval(afterFen, 10, (r) => {
        const cpAfter = r.mate != null ? (r.mate > 0 ? 10000 : -10000) : r.cp;
        setPending(p => p ? ({
          ...p,
          cpAfter,
          explanation: explainMasterMove(momentForExplain, cpBefore, cpAfter),
        }) : p);
      });
    }

    return false;
  }

  function nextMove() {
    if (!pending) return;
    setScores(prev => [...prev, pending.score]);
    setPending(null);
    setCurrentMoment(null);
    setEngineTop(null);
    setGuessPhase('playing');
    // viewIdx was already advanced on handleUserDrop, so we're ready to continue
  }

  async function finishGuess() {
    setGuessPhase('done');
    const total = scores.reduce((a, s) => a + s.pts, 0);
    const max   = scores.length * 2;
    await supabase.from('guess_log').insert({
      game_id: id, side: side ?? 'white',
      score: total, max_score: max,
    });
  }

  // ── Viewer keyboard (off-mode only) ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (guessPhase !== 'off') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' && viewIdx < moves.length) setViewIdx(i => i + 1);
      if (e.key === 'ArrowLeft'  && viewIdx > 0)            setViewIdx(i => i - 1);
      if (e.key === 'f' || e.key === 'F')                   setFlipped(v => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guessPhase, viewIdx, moves.length]);

  // ── Derived UI data ──
  const totalScore = scores.reduce((a, s) => a + s.pts, 0);
  const momentsTotal = scores.length;
  const hitPct = momentsTotal > 0 ? Math.round(100 * scores.filter(s => s.pts > 0).length / momentsTotal) : 0;

  const baseOrient: 'white' | 'black' = side === 'black' ? 'black' : 'white';
  const boardOrientation: 'white' | 'black' = flipped
    ? (baseOrient === 'white' ? 'black' : 'white')
    : baseOrient;

  const boardKey = `${boardThemeId}-${pieceStyleId}-${boardOrientation}`;

  // Highlight squares for best move after guess
  const bestHighlight: Record<string, React.CSSProperties> = useMemo(() => {
    if (!pending || !pending.bestUci) return {};
    const from = pending.bestUci.slice(0, 2);
    const to   = pending.bestUci.slice(2, 4);
    return {
      [from]: { background: 'rgba(129,182,76,0.55)' },
      [to]:   { background: 'rgba(129,182,76,0.75)' },
    };
  }, [pending]);

  // The current comment to display next to board during play
  const activeComment = useMemo(() => {
    if (guessPhase === 'off' && viewIdx > 0) return moves[viewIdx - 1]?.comment;
    if (guessPhase === 'playing' && viewIdx > 0) return moves[viewIdx - 1]?.comment;
    if (guessPhase === 'paused') return moves[viewIdx]?.comment; // comment on upcoming move
    return undefined;
  }, [guessPhase, viewIdx, moves]);

  // ── Early returns ──
  if (loading) return (
    <div className="page-wrap">
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
    </div>
  );
  if (!game) return (
    <div className="page-wrap">
      <div className="ui-card ui-card-lg" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 8 }}>Партия не найдена</div>
        <Link href="/masters" className="ui-btn ui-btn-outline" style={{ display: 'inline-flex', marginTop: 8 }}>К библиотеке</Link>
      </div>
    </div>
  );

  const evalPct = cpToPercent(evalCp);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="page-header">
        <Link href="/masters" className="ui-back">← Библиотека</Link>
        <div className="ui-eyebrow">
          <span>Партия</span>
          <span className="ui-eyebrow-line" />
          <span>{game.event || '—'}{game.year ? ` · ${game.year}` : ''}</span>
        </div>
        <h1 className="ui-h1" style={{ fontSize: 28 }}>
          {game.white} <span style={{ color: 'var(--muted)' }}>—</span> {game.black}
        </h1>
        <p className="ui-sub">
          Итог: <span className={
            game.result === '1-0' ? 'result-win'
            : game.result === '0-1' ? 'result-loss' : 'result-draw'
          }>{game.result}</span>
          {moves.length > 0 && <> · {moves.length} полуходов</>}
          {moments.length > 0 && guessPhase === 'off' && <> · {moments.length} ключевых моментов</>}
        </p>
      </div>

      <div className="master-layout">
        {/* ── Board column ─────────────────────────────── */}
        <div className="master-board-col">
          <div className="master-board-inner">
            {/* Eval bar */}
            <div className="eval-bar-row">
              <div className="eval-bar">
                <div className="eval-bar-fill" style={{ width: `${evalPct}%` }} />
              </div>
              <div className="eval-bar-text">{formatEvalShort(evalCp)}</div>
            </div>

            {/* Board */}
            <div className="master-board-wrap">
              <Chessboard
                key={boardKey}
                options={{
                  position: fen,
                  boardOrientation,
                  onPieceDrop: guessPhase === 'paused' && !pending ? handleUserDrop : undefined,
                  allowDragging: guessPhase === 'paused' && !pending,
                  squareStyles: pending ? bestHighlight : {},
                  boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                  darkSquareStyle:  { backgroundColor: boardTheme.dark },
                  lightSquareStyle: { backgroundColor: boardTheme.light },
                  pieces: customPieces,
                  showNotation: true,
                  animationDurationInMs: animationMs,
                }}
              />
            </div>

            {/* Board controls (viewer only) */}
            {guessPhase === 'off' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="ui-btn-icon" onClick={() => setViewIdx(0)}            title="В начало">⏮</button>
                <button className="ui-btn-icon" onClick={() => setViewIdx(i => Math.max(0, i - 1))}            title="Назад (←)">←</button>
                <button className="ui-btn-icon" onClick={() => setViewIdx(i => Math.min(moves.length, i + 1))} title="Вперёд (→)">→</button>
                <button className="ui-btn-icon" onClick={() => setViewIdx(moves.length)} title="В конец">⏭</button>
                <button className="ui-btn-icon" onClick={() => setFlipped(v => !v)}      title="Перевернуть (F)">⇄</button>
                <div style={{ marginLeft: 12, alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>
                  {viewIdx === 0 ? 'Начальная позиция' : `Ход ${Math.ceil(viewIdx / 2)}, ${viewIdx % 2 === 1 ? 'белые' : 'чёрные'}`}
                </div>
              </div>
            )}

            {/* Status during play */}
            {(guessPhase === 'playing' || guessPhase === 'paused') && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
                <span>Полуход {viewIdx} / {moves.length}</span>
                {guessPhase === 'playing' && <span style={{ color: 'var(--accent)' }}>▶ идёт автопроигрыш</span>}
                {guessPhase === 'paused' && <span style={{ color: 'var(--accent)' }}>⏸ твой ход</span>}
                <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={cancelPlay} style={{ marginLeft: 'auto' }}>
                  Остановить
                </button>
              </div>
            )}

            {/* Comment */}
            {activeComment && (
              <div className="ui-card ui-card-sm" style={{ fontSize: 13, lineHeight: 1.6 }}>
                💬 {activeComment}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* === Viewer mode: setup + move list === */}
          {guessPhase === 'off' && (
            <>
              <div className="ui-card ui-card-lg" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', marginBottom: 4 }}>
                    Угадай ход
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    Партия проигрывается сама. Останавливается только на ключевых моментах — твоя задача найти ход мастера.
                    Ход мастера = 2 очка, топ-3 движка (в пределах 0.5 пешки) = 1 очко.
                  </div>
                </div>

                {/* Mode switch */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>Режим</label>
                  <div className="ui-segmented">
                    <button className={`ui-segment ${mode === 'key' ? 'ui-segment-active' : ''}`} onClick={() => setMode('key')}>
                      Ключевые
                    </button>
                    <button className={`ui-segment ${mode === 'sac' ? 'ui-segment-active' : ''}`} onClick={() => setMode('sac')}>
                      Только жертвы
                    </button>
                    <button className={`ui-segment ${mode === 'all' ? 'ui-segment-active' : ''}`} onClick={() => setMode('all')}>
                      Каждый ход
                    </button>
                  </div>
                </div>

                {/* Skip opening */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>Пропустить дебют: первые {skipOpening} ход{skipOpening === 1 ? '' : skipOpening <= 4 ? 'а' : 'ов'} каждой стороны</label>
                  <input
                    type="range"
                    min={0} max={15}
                    value={skipOpening}
                    onChange={e => setSkipOpening(parseInt(e.target.value, 10))}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                </div>

                {/* Side */}
                {side == null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={labelStyle}>Играть за</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="ui-btn ui-btn-ghost" style={{ flex: 1 }} onClick={() => setSide('white')}>
                        ♔ Белых ({game.white})
                      </button>
                      <button className="ui-btn ui-btn-ghost" style={{ flex: 1 }} onClick={() => setSide('black')}>
                        ♚ Чёрных ({game.black})
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Играешь за <strong style={{ color: 'var(--ivory)' }}>
                      {side === 'white' ? `белых (${game.white})` : `чёрных (${game.black})`}
                    </strong>
                    <button
                      onClick={() => setSide(null)}
                      style={{
                        marginLeft: 8, background: 'transparent', border: 'none',
                        color: 'var(--muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
                      }}
                    >
                      сменить
                    </button>
                  </div>
                )}

                {/* Start */}
                {!engineReady ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Движок загружается…</div>
                ) : side != null && (
                  <button
                    className="ui-btn ui-btn-primary"
                    onClick={() => (needsAnalysis ? analyzeKeyMoments() : beginPlay())}
                  >
                    {needsAnalysis ? 'Найти ключевые моменты и начать' : 'Начать'}
                  </button>
                )}

                {needsAnalysis && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Первое открытие — движок проанализирует партию (10–60 сек).
                  </div>
                )}
              </div>

              {/* Move list */}
              <div className="move-list">
                <div className="move-list-grid">
                  {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => {
                    const wIdx = i * 2;
                    const bIdx = i * 2 + 1;
                    return (
                      <div key={i} style={{ display: 'contents' }}>
                        <span className="move-num">{i + 1}.</span>
                        <button
                          className={`move-btn ${viewIdx === wIdx + 1 ? 'move-btn-active' : ''}`}
                          onClick={() => setViewIdx(wIdx + 1)}
                        >
                          {moves[wIdx]?.san ?? ''}
                        </button>
                        <button
                          className={`move-btn ${viewIdx === bIdx + 1 ? 'move-btn-active' : ''}`}
                          onClick={() => bIdx < moves.length ? setViewIdx(bIdx + 1) : undefined}
                        >
                          {moves[bIdx]?.san ?? ''}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* === Analyzing === */}
          {guessPhase === 'analyzing' && analyzeProg && (
            <div className="ui-card ui-card-lg">
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 6 }}>
                Ищу ключевые моменты…
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
                Движок просматривает ходы после дебюта. Ищет жертвы, пометки ! и !!, и позиции с явно лучшим ходом.
              </div>
              <div className="progress-track" style={{ marginBottom: 10 }}>
                <div className="progress-fill" style={{
                  width: analyzeProg.total > 0 ? `${100 * analyzeProg.done / analyzeProg.total}%` : '0%',
                }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                {analyzeProg.done} / {analyzeProg.total} позиций
              </div>
              <button
                className="ui-btn ui-btn-outline ui-btn-sm"
                onClick={() => { stopAnalyzeRef.current = true; cancelPlay(); }}
              >
                Отмена
              </button>
            </div>
          )}

          {/* === Playing (auto-play, no interaction) === */}
          {guessPhase === 'playing' && (
            <>
              <div className="ui-card">
                <div style={{ fontSize: 14, color: 'var(--ivory)', marginBottom: 4 }}>
                  Автопроигрыш партии
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Остановлюсь на ключевом моменте и спрошу тебя.
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
                  <span>Счёт: <strong style={{ color: 'var(--ivory)' }}>{totalScore}</strong></span>
                  <span>Моментов: <strong style={{ color: 'var(--ivory)' }}>{momentsTotal}</strong></span>
                </div>
              </div>

              {scores.length > 0 && (
                <div className="pill-row">
                  {scores.map((s, i) => (
                    <div key={i} className={`pill pill-${s.pts}`} title={`#${i + 1}: ${s.masterSan}`}>
                      {s.pts}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* === Paused: waiting for user === */}
          {guessPhase === 'paused' && !pending && (
            <>
              <div className="ui-card">
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 6 }}>
                  Что сыграет мастер?
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                  Полуход {viewIdx + 1} · {currentMoment && kindLabel(currentMoment.kind)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Перетащи фигуру на доске.{!engineTop ? ' Движок анализирует…' : ''}
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>
                  <span>Счёт: <strong style={{ color: 'var(--ivory)' }}>{totalScore}</strong></span>
                  <span>Моментов: <strong style={{ color: 'var(--ivory)' }}>{momentsTotal}</strong></span>
                </div>
              </div>

              {scores.length > 0 && (
                <div className="pill-row">
                  {scores.map((s, i) => (
                    <div key={i} className={`pill pill-${s.pts}`} title={`#${i + 1}: ${s.masterSan}`}>
                      {s.pts}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* === Paused: showing result === */}
          {guessPhase === 'paused' && pending && (
            <>
              <div className={`ui-banner ${
                pending.score.pts === 2 ? 'ui-banner-success'
                : pending.score.pts === 1 ? 'ui-banner-warn'
                : 'ui-banner-danger'
              }`}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)', marginBottom: 6 }}>
                  {pending.score.pts === 2 ? '✓ Ход мастера — 2 очка'
                    : pending.score.pts === 1 ? '≈ Топ-3 движка — 1 очко'
                    : '✗ Другой ход — 0 очков'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                  Мастер: <strong style={{ color: 'var(--ivory)', fontFamily: 'ui-monospace, monospace' }}>{pending.score.masterSan}</strong>
                  {pending.bestUci && pending.bestUci.slice(0,4) !== (moves[viewIdx-1]?.from + moves[viewIdx-1]?.to) && (
                    <> · движок: <strong style={{ color: 'var(--ivory)', fontFamily: 'ui-monospace, monospace' }}>
                      {uciToSan(getFenBefore(moves, viewIdx - 1), pending.bestUci)}
                    </strong></>
                  )}
                </div>
                {(pending.cpBefore != null || pending.cpAfter != null) && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                    Оценка: {formatEvalShort(pending.cpBefore)}
                    {pending.cpAfter != null && <> → {formatEvalShort(-(pending.cpAfter))}</>}
                  </div>
                )}
                <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: 'var(--ivory)', lineHeight: 1.5 }}>
                  {pending.explanation.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
                {pending.commentary && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5, fontStyle: 'italic' }}>
                    💬 {pending.commentary}
                  </div>
                )}
                <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={nextMove}>
                  Дальше →
                </button>
              </div>

              {scores.length > 0 && (
                <div className="pill-row">
                  {scores.map((s, i) => (
                    <div key={i} className={`pill pill-${s.pts}`} title={`#${i + 1}: ${s.masterSan}`}>
                      {s.pts}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* === Done === */}
          {guessPhase === 'done' && (
            <div className="ui-card ui-card-lg">
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)', marginBottom: 6,
                fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)' }}>
                Моментов {momentsTotal}, угадано {scores.filter(s => s.pts === 2).length} ({hitPct}%)
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
                Счёт: {totalScore} из {momentsTotal * 2}
              </div>
              {scores.length > 0 && (
                <div className="score-chart" style={{ marginBottom: 20 }}>
                  {scores.map((s, i) => (
                    <div key={i} title={`#${i + 1} ${s.masterSan} · ${kindLabel(s.kind)}`}
                         className={`score-bar score-bar-${s.pts}`} />
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="ui-btn ui-btn-outline" onClick={cancelPlay}>
                  Просмотр партии
                </button>
                <button className="ui-btn ui-btn-primary" onClick={() => { setViewIdx(0); beginPlay(); }}>
                  Ещё раз
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--muted)', fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase',
};

function kindLabel(kind: MomentKind): string {
  switch (kind) {
    case 'sac':       return 'жертва';
    case 'check':     return 'шах';
    case 'capture':   return 'взятие';
    case 'annotated': return 'отмечен автором';
  }
}

