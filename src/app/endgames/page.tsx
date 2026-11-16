'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { ENDGAMES, CATEGORY_LABELS, type Endgame, type EndgameCategory } from '@/data/endgames';
import { useStockfish } from '@/hooks/useStockfish';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MAX_MOVES = 50;

type Phase = 'list' | 'playing' | 'done';

interface Stats {
  achieved: number;
  failed: number;
  byCategory: Record<EndgameCategory, { achieved: number; failed: number }>;
}

function emptyStats(): Stats {
  const byCategory = {} as Stats['byCategory'];
  for (const k of Object.keys(CATEGORY_LABELS) as EndgameCategory[]) {
    byCategory[k] = { achieved: 0, failed: 0 };
  }
  return { achieved: 0, failed: 0, byCategory };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function goalAchieved(endgame: Endgame, chess: Chess): boolean {
  if (endgame.goal === 'win') {
    return chess.isCheckmate();
  }
  if (endgame.goal === 'draw') {
    return chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition();
  }
  return false;
}

function goalFailed(endgame: Endgame, chess: Chess, moveCount: number): boolean {
  if (moveCount >= MAX_MOVES) return true;
  if (endgame.goal === 'win' && chess.isDraw()) return true;
  if (endgame.goal === 'draw' && chess.isCheckmate()) return true;
  return false;
}

function playerColor(endgame: Endgame): 'w' | 'b' {
  return new Chess(endgame.fen).turn();
}

// ── Category stat row ─────────────────────────────────────────────────────────

function CategoryRow({ cat, stats }: { cat: EndgameCategory; stats: Stats }) {
  const { achieved, failed } = stats.byCategory[cat];
  const total = achieved + failed;
  const pct = total > 0 ? Math.round((achieved / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--ivory)' }}>{CATEGORY_LABELS[cat]}</span>
      {total > 0 ? (
        <>
          <div style={{ width: 80, height: 4, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ivory)', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', width: 50, textAlign: 'right' }}>{achieved}/{total}</span>
        </>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
      )}
    </div>
  );
}

// ── Endgame card in list view ─────────────────────────────────────────────────

function EndgameCard({ eg, onSelect }: { eg: Endgame; onSelect: () => void }) {
  const stars = '●'.repeat(eg.difficulty) + '○'.repeat(3 - eg.difficulty);
  const goalLabel = eg.goal === 'win' ? 'Выиграть' : 'Сделать ничью';
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        borderRadius: 4, padding: '12px 16px', cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--control)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--hairline)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: '0.06em' }}>{stars}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{goalLabel}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ivory)', lineHeight: 1.4 }}>{eg.idea}</div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EndgamesPage() {
  const [phase, setPhase] = useState<Phase>('list');
  const [current, setCurrent] = useState<Endgame | null>(null);
  const [chess, setChess] = useState(() => new Chess());
  const [fen, setFen] = useState('start');
  const [moveCount, setMoveCount] = useState(0);
  const [status, setStatus] = useState('');
  const [hintIdea, setHintIdea] = useState(false);
  const [hintMove, setHintMove] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [achieved, setAchieved] = useState(false);
  const startTimeRef = useRef(0);
  const { getBestMove, setSkillLevel, isReady } = useStockfish();

  useEffect(() => {
    if (isReady) {
      void setSkillLevel(20);
    }
  }, [isReady, setSkillLevel]);

  // Load stats from Supabase on mount
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('endgame_log')
        .select('endgame_id, category, achieved');
      if (!data) return;
      const s = emptyStats();
      for (const row of data) {
        const cat = row.category as EndgameCategory;
        if (row.achieved) {
          s.achieved++;
          if (s.byCategory[cat]) s.byCategory[cat].achieved++;
        } else {
          s.failed++;
          if (s.byCategory[cat]) s.byCategory[cat].failed++;
        }
      }
      setStats(s);
    })();
  }, []);

  const startEndgame = useCallback((eg: Endgame) => {
    const c = new Chess(eg.fen);
    setCurrent(eg);
    setChess(c);
    setFen(eg.fen);
    setMoveCount(0);
    setStatus('');
    setHintIdea(false);
    setHintMove(null);
    setAchieved(false);
    setPhase('playing');
    startTimeRef.current = Date.now();
  }, []);

  const finishEndgame = useCallback(async (ok: boolean, c: Chess, moves: number) => {
    if (!current) return;
    setAchieved(ok);
    setPhase('done');
    setStatus(ok
      ? (current.goal === 'win' ? 'Мат! Цель достигнута.' : 'Ничья! Цель достигнута.')
      : (moves >= MAX_MOVES ? 'Превышен лимит ходов.' : 'Цель не достигнута.'),
    );

    const timeTaken = Date.now() - startTimeRef.current;
    await supabase.from('endgame_log').insert({
      endgame_id: current.id,
      category: current.category,
      goal: current.goal,
      achieved: ok,
      moves_played: moves,
      time_taken_ms: timeTaken,
    });

    setStats(prev => {
      const next = { ...prev, byCategory: { ...prev.byCategory } };
      const cat = current.category;
      next.byCategory[cat] = { ...next.byCategory[cat] };
      if (ok) { next.achieved++; next.byCategory[cat].achieved++; }
      else     { next.failed++;  next.byCategory[cat].failed++; }
      return next;
    });
  }, [current]);

  // Stockfish makes a move for the opponent
  const makeStockfishMove = useCallback((currentFen: string, moves: number) => {
    if (!current) return;
    getBestMove(currentFen, 20, (uciMove: string) => {
      const c = new Chess(currentFen);
      const result = c.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] || 'q' });
      if (!result) return;
      const nextFen = c.fen();
      setFen(nextFen);
      setChess(c);
      const nextMoves = moves + 1;
      setMoveCount(nextMoves);
      if (goalAchieved(current, c) || goalFailed(current, c, nextMoves)) {
        void finishEndgame(goalAchieved(current, c), c, nextMoves);
      }
    });
  }, [current, getBestMove, finishEndgame]);

  const handleDrop = useCallback(({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (!current || phase !== 'playing' || !targetSquare) return false;
    const c = new Chess(fen);
    if (c.turn() !== playerColor(current)) return false;

    let result;
    try {
      result = c.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false;
    }
    if (!result) return false;

    const nextFen = c.fen();
    const nextMoves = moveCount + 1;
    setFen(nextFen);
    setChess(c);
    setMoveCount(nextMoves);
    setHintMove(null);

    if (goalAchieved(current, c)) {
      void finishEndgame(true, c, nextMoves);
      return true;
    }
    if (goalFailed(current, c, nextMoves)) {
      void finishEndgame(false, c, nextMoves);
      return true;
    }

    // Opponent's turn (Stockfish)
    makeStockfishMove(nextFen, nextMoves);
    return true;
  }, [current, phase, fen, moveCount, finishEndgame, makeStockfishMove]);

  const requestHintMove = useCallback(() => {
    if (!current || phase !== 'playing') return;
    getBestMove(fen, 18, (uciMove: string) => {
      setHintMove(uciMove);
    });
  }, [current, phase, fen, getBestMove]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const categories = Object.keys(CATEGORY_LABELS) as EndgameCategory[];

  if (phase === 'list') {
    const totalAchieved = stats.achieved;
    const totalPlayed = stats.achieved + stats.failed;
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ivory)', margin: 0 }}>Эндшпиль</h1>
            {totalPlayed > 0 && (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Конвертировано: {totalAchieved}/{totalPlayed}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            Играй против Stockfish за сторону с целью. Подсказка хода стоит XP.
          </p>
        </div>

        {/* Stats by category */}
        {totalPlayed > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '12px 16px', marginBottom: 32 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Статистика по категориям</div>
            {categories.map(cat => <CategoryRow key={cat} cat={cat} stats={stats} />)}
          </div>
        )}

        {/* Positions by category */}
        {categories.map(cat => {
          const items = ENDGAMES.filter(e => e.category === cat);
          return (
            <div key={cat} style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 400, margin: '0 0 12px 0' }}>
                {CATEGORY_LABELS[cat]}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                {items.map(eg => (
                  <EndgameCard key={eg.id} eg={eg} onSelect={() => startEndgame(eg)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (!current) return null;

  const pColor = playerColor(current);
  const orientation = pColor === 'w' ? 'white' : 'black';
  const goalLabel = current.goal === 'win' ? 'Выиграть' : 'Сделать ничью';

  // Highlight hint squares
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (hintMove) {
    squareStyles[hintMove.slice(0, 2)] = { backgroundColor: 'rgba(242,239,231,0.25)' };
    squareStyles[hintMove.slice(2, 4)] = { backgroundColor: 'rgba(242,239,231,0.45)' };
  }

  const isPlayerTurn = chess.turn() === pColor && phase === 'playing';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Board */}
        <div>
          <Chessboard options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: isPlayerTurn,
            onPieceDrop: handleDrop,
            squareStyles,
            boardStyle: { width: 420, height: 420 },
          }} />
        </div>

        {/* Sidebar */}
        <div style={{ flex: 1, minWidth: 220 }}>
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>
              {CATEGORY_LABELS[current.category]}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', marginBottom: 2 }}>
              {goalLabel}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {orientation === 'white' ? 'Играете белыми' : 'Играете чёрными'} · ход {moveCount + 1}
            </div>
          </div>

          {/* Status */}
          {status && (
            <div style={{
              padding: '10px 12px', borderRadius: 4, marginBottom: 16,
              background: achieved ? 'rgba(242,239,231,0.08)' : 'rgba(100,80,80,0.15)',
              border: `1px solid ${achieved ? 'var(--control)' : '#6B4040'}`,
              fontSize: 13, color: 'var(--ivory)',
            }}>
              {status}
            </div>
          )}

          {/* Move counter */}
          {phase === 'playing' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                <span>Ходы</span>
                <span>{moveCount}/{MAX_MOVES}</span>
              </div>
              <div style={{ height: 3, background: 'var(--track)', borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${(moveCount / MAX_MOVES) * 100}%`,
                  background: moveCount > 40 ? '#8B5A5A' : 'var(--control)',
                  transition: 'width 0.2s',
                }} />
              </div>
            </div>
          )}

          {/* Hint buttons */}
          {phase === 'playing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setHintIdea(true)}
                disabled={hintIdea}
                style={{
                  padding: '8px 12px', background: 'transparent',
                  border: '1px solid var(--control)', borderRadius: 4,
                  color: hintIdea ? 'var(--muted)' : 'var(--ivory)', cursor: hintIdea ? 'default' : 'pointer',
                  fontSize: 13, textAlign: 'left',
                }}
              >
                💡 Подсказка идеи
              </button>
              <button
                onClick={requestHintMove}
                disabled={!!hintMove}
                style={{
                  padding: '8px 12px', background: 'transparent',
                  border: '1px solid var(--control)', borderRadius: 4,
                  color: hintMove ? 'var(--muted)' : 'var(--ivory)', cursor: hintMove ? 'default' : 'pointer',
                  fontSize: 13, textAlign: 'left',
                }}
              >
                ♟ Подсказка хода
              </button>
            </div>
          )}

          {/* Idea hint */}
          {hintIdea && (
            <div style={{
              padding: '10px 12px', background: 'var(--surface)',
              border: '1px solid var(--hairline)', borderRadius: 4,
              fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 16,
            }}>
              {current.idea}
            </div>
          )}

          {/* Back / Next */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setPhase('list')}
              style={{
                flex: 1, padding: '8px 12px', background: 'transparent',
                border: '1px solid var(--hairline)', borderRadius: 4,
                color: 'var(--muted)', cursor: 'pointer', fontSize: 13,
              }}
            >
              ← Список
            </button>
            {phase === 'done' && (
              <button
                onClick={() => startEndgame(current)}
                style={{
                  flex: 1, padding: '8px 12px', background: 'var(--surface)',
                  border: '1px solid var(--control)', borderRadius: 4,
                  color: 'var(--ivory)', cursor: 'pointer', fontSize: 13,
                }}
              >
                Повторить
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
