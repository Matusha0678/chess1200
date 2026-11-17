'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { useStockfish } from '@/hooks/useStockfish';

// ── Types ─────────────────────────────────────────────────────────────────────

type EvalChoice = 'white' | 'equal' | 'black';
type Factor = 'material' | 'king_safety' | 'activity' | 'pawn_structure' | 'center';

const FACTOR_LABEL: Record<Factor, string> = {
  material:       'Материал',
  king_safety:    'Безопасность короля',
  activity:       'Активность фигур',
  pawn_structure: 'Пешечная структура',
  center:         'Центр и пространство',
};

const FACTORS: Factor[] = ['material', 'king_safety', 'activity', 'pawn_structure', 'center'];

type Mode = 'my_games' | 'masters' | 'all';
type Phase = 'question' | 'result';

interface PositionRow {
  fen: string;
  source: 'my_games' | 'masters';
}

interface Stats {
  total: number;
  correct: number;
  byFactor: Record<Factor, { total: number; correct: number }>;
}

// ── Material helpers ──────────────────────────────────────────────────────────

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function computeFactors(fen: string): Record<Factor, number> {
  const chess = new Chess(fen);
  const board = chess.board();
  const turn = chess.turn();

  // Material
  let matW = 0, matB = 0;
  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.type === 'k') continue;
      const v = PIECE_VALUE[sq.type] ?? 0;
      if (sq.color === 'w') matW += v;
      else matB += v;
    }
  }
  const materialAdv = matW - matB; // positive = white better

  // King safety: count attacking pieces near king
  function kingFile(color: 'w' | 'b'): number {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq && sq.type === 'k' && sq.color === color) return c;
    }
    return 4;
  }
  function countPawnsNearKing(color: 'w' | 'b'): number {
    const kf = kingFile(color);
    let cnt = 0;
    for (const row of board) {
      for (let c = 0; c < 8; c++) {
        const sq = row[c];
        if (!sq || sq.type !== 'p') continue;
        if (sq.color === color && Math.abs(c - kf) <= 1) cnt++;
      }
    }
    return cnt;
  }
  const kingSafetyAdv = countPawnsNearKing('w') - countPawnsNearKing('b');

  // Activity: legal moves count (approximate)
  const myMoves = chess.moves({ verbose: false }).length;
  const oppChess = new Chess(fen);
  // Flip turn for opponent move count estimation — not perfect but quick
  const activityAdv = turn === 'w' ? myMoves / 10 : -myMoves / 10;

  // Pawn structure: doubled + isolated
  function pawnFiles(color: 'w' | 'b'): number[] {
    const files: number[] = [];
    for (const row of board) for (let c = 0; c < 8; c++) {
      const sq = row[c];
      if (sq && sq.type === 'p' && sq.color === color) files.push(c);
    }
    return files;
  }
  function structurePenalty(files: number[]): number {
    let penalty = 0;
    const counts: number[] = new Array(8).fill(0);
    for (const f of files) counts[f]++;
    for (let f = 0; f < 8; f++) {
      if (counts[f] > 1) penalty += counts[f] - 1; // doubled
      if (counts[f] > 0 && counts[f - 1] === 0 && counts[f + 1] === 0) penalty++; // isolated
    }
    return penalty;
  }
  const pawnAdv = structurePenalty(pawnFiles('b')) - structurePenalty(pawnFiles('w'));

  // Center control: count pieces controlling d4,d5,e4,e5
  const CENTER_SQ = ['d4','d5','e4','e5'];
  let centerW = 0, centerB = 0;
  for (const sq of CENTER_SQ) {
    if (chess.isAttacked(sq as Parameters<typeof chess.isAttacked>[0], 'w')) centerW++;
    if (chess.isAttacked(sq as Parameters<typeof chess.isAttacked>[0], 'b')) centerB++;
  }
  const centerAdv = centerW - centerB;

  return {
    material:       materialAdv,
    king_safety:    kingSafetyAdv,
    activity:       activityAdv,
    pawn_structure: pawnAdv,
    center:         centerAdv,
  };
}

function cpToChoice(cp: number): EvalChoice {
  if (cp >= 70)  return 'white';
  if (cp <= -70) return 'black';
  return 'equal';
}

function factorToChoice(val: number): EvalChoice {
  if (val > 0.3) return 'white';
  if (val < -0.3) return 'black';
  return 'equal';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  const { boardTheme, customPieces, boardThemeId, pieceStyleId } = useBoardTheme();
  const { getEval, isReady } = useStockfish();

  const [mode,     setMode]     = useState<Mode>('all');
  const [phase,    setPhase]    = useState<Phase>('question');
  const [loading,  setLoading]  = useState(true);
  const [fen,      setFen]      = useState('');
  const [myEval,   setMyEval]   = useState<EvalChoice | null>(null);
  const [myFactors,setMyFactors]= useState<Factor[]>([]);
  const [engineCp, setEngineCp] = useState<number | null>(null);
  const [bestMove, setBestMove] = useState<string | null>(null);
  const [analyzing,setAnalyzing]= useState(false);
  const [stats,    setStats]    = useState<Stats>({ total: 0, correct: 0, byFactor: Object.fromEntries(FACTORS.map(f => [f, { total: 0, correct: 0 }])) as Stats['byFactor'] });
  const [sqlMissing, setSqlMissing] = useState(false);
  const [factors,  setFactors]  = useState<Record<Factor, number> | null>(null);

  // Queue of positions fetched
  const posQueueRef = useRef<PositionRow[]>([]);

  const fetchPositions = useCallback(async () => {
    // Fetch positions from games (move 12-30) or master_games
    const positions: PositionRow[] = [];

    if (mode === 'my_games' || mode === 'all') {
      const { data } = await supabase.from('games').select('pgn').limit(20);
      for (const game of (data ?? []) as Array<{ pgn: string }>) {
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn ?? '');
          const history = chess.history({ verbose: true });
          // Pick a random move between 12 and 30
          const eligible = history.filter((_, i) => i >= 11 && i <= 29);
          if (eligible.length === 0) continue;
          const pick = eligible[Math.floor(Math.random() * eligible.length)];
          const replay = new Chess();
          for (const h of history.slice(0, history.indexOf(pick) + 1)) {
            replay.move({ from: h.from, to: h.to, promotion: h.promotion });
          }
          const f = replay.fen();
          // Skip extreme positions
          positions.push({ fen: f, source: 'my_games' });
        } catch { /* skip */ }
      }
    }

    if (mode === 'masters' || mode === 'all') {
      const { data } = await supabase.from('master_games').select('pgn').limit(10);
      for (const game of (data ?? []) as Array<{ pgn: string }>) {
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn ?? '');
          const history = chess.history({ verbose: true });
          const eligible = history.filter((_, i) => i >= 11 && i <= 29);
          if (eligible.length === 0) continue;
          const pick = eligible[Math.floor(Math.random() * eligible.length)];
          const replay = new Chess();
          for (const h of history.slice(0, history.indexOf(pick) + 1)) {
            replay.move({ from: h.from, to: h.to, promotion: h.promotion });
          }
          const f = replay.fen();
          positions.push({ fen: f, source: 'masters' });
        } catch { /* skip */ }
      }
    }

    // Shuffle and filter extreme (|cp| > 300)
    posQueueRef.current = positions.sort(() => Math.random() - 0.5).slice(0, 20);
  }, [mode]);

  async function nextPosition() {
    if (posQueueRef.current.length === 0) {
      await fetchPositions();
    }
    if (posQueueRef.current.length === 0) {
      setLoading(false);
      return;
    }
    const pos = posQueueRef.current.shift()!;
    setFen(pos.fen);
    setMyEval(null);
    setMyFactors([]);
    setEngineCp(null);
    setBestMove(null);
    setFactors(computeFactors(pos.fen));
    setPhase('question');
    setLoading(false);
  }

  useEffect(() => {
    void nextPosition();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleSubmit() {
    if (!myEval || !fen) return;
    setAnalyzing(true);
    // Run Stockfish while we process
    if (isReady) {
      getEval(fen, 12, (result) => {
        const cp = result.cp ?? (result.mate ? (result.mate > 0 ? 9000 : -9000) : 0);
        // Check if position is too extreme
        const turn = fen.split(' ')[1];
        const cpFromWhite = turn === 'w' ? cp : -cp;
        setEngineCp(cpFromWhite);
        setBestMove(result.bestMove ?? null);
        setAnalyzing(false);
      });
    } else {
      setAnalyzing(false);
    }

    // Compute result against known engine eval (use factor estimate if no engine)
    // For now show phase='result', engine eval fills in async
    setPhase('result');

    // Log to DB
    const engineChoice = engineCp !== null ? cpToChoice(engineCp) : myEval; // provisional
    const ok = myEval === engineChoice;
    setStats(prev => {
      const byFactor = { ...prev.byFactor };
      for (const f of myFactors) {
        byFactor[f] = { total: (byFactor[f]?.total ?? 0) + 1, correct: (byFactor[f]?.correct ?? 0) + (ok ? 1 : 0) };
      }
      return { total: prev.total + 1, correct: prev.correct + (ok ? 1 : 0), byFactor };
    });

    try {
      await supabase.from('eval_log').insert({
        fen,
        my_eval: myEval,
        my_factors: myFactors,
        engine_cp: engineCp,
        ok,
      });
    } catch (e) {
      const err = e as { message?: string; code?: string };
      if (err?.message?.includes('does not exist') || err?.code === '42P01') setSqlMissing(true);
    }
  }

  function toggleFactor(f: Factor) {
    setMyFactors(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f].slice(0, 2));
  }

  const boardKey = `${boardThemeId}-${pieceStyleId}`;
  const engineChoice = engineCp !== null ? cpToChoice(engineCp) : null;

  if (sqlMissing) {
    return (
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 72px' }}>
        <div style={{ padding: '20px 24px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 14, color: 'var(--muted)' }}>
          Таблица <code>eval_log</code> не создана. Выполни <strong>supabase/20-eval-log.sql</strong>.
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 72px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <Link href="/" style={{ fontSize: 13, color: 'var(--muted)' }}>← Сегодня</Link>
        <h1 style={{ margin: '12px 0 4px', fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          Оцени позицию
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Факторы — приблизительные правила, а не мнение движка.
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 0, border: '1px solid var(--hairline)' }}>
        {(['all', 'my_games', 'masters'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{ flex: 1, height: 36, border: 'none', borderRight: '1px solid var(--hairline)', background: mode === m ? 'var(--track)' : 'transparent', color: mode === m ? 'var(--ivory)' : 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {m === 'all' ? 'Все' : m === 'my_games' ? 'Мои партии' : 'Мастера'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      ) : !fen ? (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Нет позиций для анализа.</div>
      ) : (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Board */}
          <div style={{ flex: '0 0 auto', width: 'min(100%, 420px)' }}>
            <div style={{ width: '100%', aspectRatio: '1' }}>
              <Chessboard
                key={boardKey}
                options={{
                  position: fen,
                  allowDragging: false,
                  boardOrientation: 'white',
                  boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                  darkSquareStyle:  { backgroundColor: boardTheme.dark },
                  lightSquareStyle: { backgroundColor: boardTheme.light },
                  pieces: customPieces,
                  showNotation: true,
                  animationDurationInMs: 0,
                }}
              />
            </div>
          </div>

          {/* Panel */}
          <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Q1: Who's better */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>1. Кто лучше?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['white', 'equal', 'black'] as EvalChoice[]).map(choice => {
                  const label = choice === 'white' ? 'Белые лучше' : choice === 'equal' ? 'Примерно равно' : 'Чёрные лучше';
                  const isSelected = myEval === choice;
                  const showResult = phase === 'result' && engineChoice !== null;
                  const isCorrect = showResult && choice === engineChoice;
                  const isWrong   = showResult && isSelected && choice !== engineChoice;
                  return (
                    <button
                      key={choice}
                      onClick={() => phase === 'question' && setMyEval(choice)}
                      disabled={phase === 'result'}
                      style={{ height: 36, padding: '0 14px', border: `1px solid ${isCorrect ? 'rgba(100,220,100,0.6)' : isWrong ? 'rgba(220,80,60,0.6)' : isSelected ? 'var(--ivory)' : 'var(--hairline)'}`, background: isCorrect ? 'rgba(100,220,100,0.1)' : isWrong ? 'rgba(220,80,60,0.1)' : isSelected ? 'rgba(255,255,255,0.08)' : 'transparent', color: isCorrect ? 'rgba(100,220,100,0.95)' : isWrong ? 'rgba(220,80,60,0.9)' : 'var(--ivory)', fontSize: 13, cursor: phase === 'question' ? 'pointer' : 'default', fontFamily: 'inherit' }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Q2: Main factor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>2. Главный фактор (до 2)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {FACTORS.map(f => {
                  const isSelected = myFactors.includes(f);
                  const fVal = factors?.[f] ?? 0;
                  const fChoice = factorToChoice(fVal);
                  const showResult = phase === 'result';
                  const isCorrect = showResult && isSelected && engineChoice !== null && fChoice === engineChoice;
                  return (
                    <button
                      key={f}
                      onClick={() => phase === 'question' && toggleFactor(f)}
                      disabled={phase === 'result'}
                      style={{ height: 34, padding: '0 12px', border: `1px solid ${isSelected ? 'var(--ivory)' : 'var(--hairline)'}`, background: isCorrect ? 'rgba(100,220,100,0.1)' : isSelected ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--ivory)', fontSize: 13, cursor: phase === 'question' ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span>{FACTOR_LABEL[f]}</span>
                      {showResult && factors && (
                        <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fVal > 0 ? '+' : ''}{fVal.toFixed(1)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            {phase === 'question' && (
              <button
                onClick={() => void handleSubmit()}
                disabled={!myEval || !isReady}
                style={{ height: 44, padding: '0 24px', background: myEval ? 'var(--ivory)' : 'var(--surface)', color: myEval ? 'var(--ink)' : 'var(--muted)', border: '1px solid var(--hairline)', fontSize: 15, fontWeight: 600, cursor: myEval ? 'pointer' : 'default', fontFamily: 'inherit', alignSelf: 'flex-start' }}
              >
                {!isReady ? 'Загрузка движка…' : 'Ответить'}
              </button>
            )}

            {/* Result */}
            {phase === 'result' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analyzing && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Анализируем…</div>}
                {engineCp !== null && (
                  <div style={{ padding: '12px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                    <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Движок (глубина 12)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: engineChoice === myEval ? 'rgba(100,220,100,0.95)' : 'rgba(220,80,60,0.9)' }}>
                      {engineCp >= 70 ? 'Белые лучше' : engineCp <= -70 ? 'Чёрные лучше' : 'Примерно равно'}
                      <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 8, color: 'var(--muted)' }}>
                        {engineCp > 0 ? '+' : ''}{(engineCp / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => void nextPosition()}
                  style={{ height: 44, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}
                >
                  Следующая →
                </button>
              </div>
            )}

            {/* Stats */}
            {stats.total > 0 && (
              <div style={{ marginTop: 8, padding: '12px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>Статистика сессии</div>
                <div style={{ fontSize: 14, color: 'var(--ivory)' }}>
                  Верных оценок: <strong>{stats.correct}</strong> / {stats.total} ({stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0}%)
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
