'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { ENDGAMES, CATEGORY_LABELS, type Endgame, type EndgameCategory } from '@/data/endgames';
import { PlayButton } from '@/components/PlayButton';
import { useStockfish } from '@/hooks/useStockfish';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { Board } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import type { Square } from 'chess.js';
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

// ── Endgame card in list view ─────────────────────────────────────────────────

const DIFF_LABEL = { 1: 'Легко', 2: 'Средне', 3: 'Сложно' } as const;
const DIFF_CLASS = { 1: 'diff-easy', 2: 'diff-mid', 3: 'diff-hard' } as const;

function EndgameListCard({
  eg, onSelect, boardDark, boardLight,
}: {
  eg: Endgame;
  onSelect: () => void;
  boardDark: string;
  boardLight: string;
}) {
  const goalLabel = eg.goal === 'win' ? 'Выиграть' : 'Сделать ничью';
  return (
    <button onClick={onSelect} className="list-card" style={{ border: 0, padding: 0, font: 'inherit', textAlign: 'left', background: 'inherit', cursor: 'pointer' }}>
      <div className="list-card-board">
        <Chessboard
          options={{
            position: eg.fen,
            allowDragging: false,
            boardStyle: { width: '100%', height: '100%' },
            darkSquareStyle:  { backgroundColor: boardDark  },
            lightSquareStyle: { backgroundColor: boardLight },
            showNotation: false,
            animationDurationInMs: 0,
          }}
        />
      </div>
      <div className="list-card-body">
        <div className="list-card-title">{CATEGORY_LABELS[eg.category]}</div>
        <div className="list-card-lead">{eg.idea}</div>
        <div className="list-card-foot">
          <span className={`diff-pill ${DIFF_CLASS[eg.difficulty]}`}>{DIFF_LABEL[eg.difficulty]}</span>
          <span style={{ color: 'var(--muted)' }}>· {goalLabel}</span>
        </div>
      </div>
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

  // Auto-start random endgame on mount
  useEffect(() => {
    if (ENDGAMES.length > 0) {
      const idx = Math.floor(Math.random() * ENDGAMES.length);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startEndgame(ENDGAMES[idx]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <ListOrPlay
      phase={phase}
      categories={categories}
      stats={stats}
      startEndgame={startEndgame}
      current={current}
      chess={chess}
      fen={fen}
      hintMove={hintMove}
      handleDrop={handleDrop}
      moveCount={moveCount}
      status={status}
      hintIdea={hintIdea}
      setHintIdea={setHintIdea}
      requestHintMove={requestHintMove}
      achieved={achieved}
      setPhase={setPhase}
    />
  );
}

// ── List + Play container (uses board theme for list thumbnails) ──────────────

function ListOrPlay(props: {
  phase: Phase;
  categories: EndgameCategory[];
  stats: Stats;
  startEndgame: (eg: Endgame) => void;
  current: Endgame | null;
  chess: Chess;
  fen: string;
  hintMove: string | null;
  handleDrop: (args: PieceDropHandlerArgs) => boolean;
  moveCount: number;
  status: string;
  hintIdea: boolean;
  setHintIdea: (v: boolean) => void;
  requestHintMove: () => void;
  achieved: boolean;
  setPhase: (p: Phase) => void;
}) {
  const { boardTheme } = useBoardTheme();
  const { phase, categories, stats, startEndgame } = props;

  const [catFilter, setCatFilter] = useState<EndgameCategory | 'all'>('all');
  const [diffFilter, setDiffFilter] = useState<1 | 2 | 3 | 'all'>('all');

  const items = useMemo(() => ENDGAMES.filter(e => {
    if (catFilter  !== 'all' && e.category   !== catFilter)  return false;
    if (diffFilter !== 'all' && e.difficulty !== diffFilter) return false;
    return true;
  }), [catFilter, diffFilter]);

  function pickRandom() {
    if (items.length === 0) return;
    const idx = Math.floor(Math.random() * items.length);
    startEndgame(items[idx]);
  }

  if (phase === 'list') {
    const totalAchieved = stats.achieved;
    const totalPlayed = stats.achieved + stats.failed;
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Эндшпили</h1>
            <p className="page-lead">
              Отыгрывай типовые позиции против Stockfish.
              {totalPlayed > 0 && <> Конвертировано: <strong style={{ color: 'var(--ivory)' }}>{totalAchieved}/{totalPlayed}</strong>.</>}
            </p>
          </div>
          <button className="ui-btn ui-btn-primary" onClick={pickRandom} disabled={items.length === 0}>
            Случайная позиция
          </button>
        </div>

        {/* Category chips */}
        <div className="chip-row">
          <button
            className={`ui-chip ${catFilter === 'all' ? 'ui-chip-active' : ''}`}
            onClick={() => setCatFilter('all')}
          >
            Все ({ENDGAMES.length})
          </button>
          {categories.map(cat => {
            const count = ENDGAMES.filter(e => e.category === cat).length;
            return (
              <button
                key={cat}
                className={`ui-chip ${catFilter === cat ? 'ui-chip-active' : ''}`}
                onClick={() => setCatFilter(cat)}
              >
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* Difficulty chips */}
        <div className="chip-row">
          <button className={`ui-chip ${diffFilter === 'all' ? 'ui-chip-active' : ''}`} onClick={() => setDiffFilter('all')}>
            Любая сложность
          </button>
          <button className={`ui-chip ${diffFilter === 1 ? 'ui-chip-active' : ''}`} onClick={() => setDiffFilter(1)}>
            Легко
          </button>
          <button className={`ui-chip ${diffFilter === 2 ? 'ui-chip-active' : ''}`} onClick={() => setDiffFilter(2)}>
            Средне
          </button>
          <button className={`ui-chip ${diffFilter === 3 ? 'ui-chip-active' : ''}`} onClick={() => setDiffFilter(3)}>
            Сложно
          </button>
        </div>

        {/* Cards grid */}
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">♜</div>
            <div className="empty-state-title">Ничего не найдено</div>
            <div className="empty-state-text">Попробуй другую категорию или сложность.</div>
          </div>
        ) : (
          <div className="card-grid">
            {items.map(eg => (
              <EndgameListCard
                key={eg.id} eg={eg}
                onSelect={() => startEndgame(eg)}
                boardDark={boardTheme.dark}
                boardLight={boardTheme.light}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return <PlayView {...props} />;
}

// ── Playing view ──────────────────────────────────────────────────────────────

function PlayView(props: {
  current: Endgame | null;
  chess: Chess;
  fen: string;
  hintMove: string | null;
  handleDrop: (args: PieceDropHandlerArgs) => boolean;
  moveCount: number;
  phase: Phase;
  status: string;
  hintIdea: boolean;
  setHintIdea: (v: boolean) => void;
  requestHintMove: () => void;
  achieved: boolean;
  setPhase: (p: Phase) => void;
  startEndgame: (eg: Endgame) => void;
}) {
  const { S } = useTrainerGeometry();
  const { current, chess, fen, hintMove, handleDrop, moveCount, phase, status, hintIdea, setHintIdea, requestHintMove, achieved, setPhase, startEndgame } = props;

  const boardOnMove = useCallback((m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    const sq = (s: Square) => s as `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'}`;
    return handleDrop({ sourceSquare: sq(m.from), targetSquare: sq(m.to) } as PieceDropHandlerArgs);
  }, [handleDrop]);

  if (!current) return null;

  const pColor = playerColor(current);
  const orientation = pColor === 'w' ? 'white' : 'black';
  const goalLabel = current.goal === 'win' ? 'Выиграть' : 'Сделать ничью';
  const isPlayerTurn = chess.turn() === pColor && phase === 'playing';

  const hintLastMove = hintMove
    ? { from: hintMove.slice(0, 2) as Square, to: hintMove.slice(2, 4) as Square }
    : undefined;

  const panel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div data-ui="panel-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{CATEGORY_LABELS[current.category]}</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', marginTop: 2 }}>{goalLabel}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Ход {moveCount + 1} · {isPlayerTurn ? 'Твой ход' : 'Ход Stockfish'}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Status */}
        {status && (
          <div style={{ padding: '10px 12px', background: achieved ? 'rgba(129,182,76,0.1)' : 'rgba(100,80,80,0.15)', border: `1px solid ${achieved ? 'var(--accent)' : '#6B4040'}`, fontSize: 13, color: 'var(--ivory)' }}>
            {status}
          </div>
        )}

        {/* Move counter */}
        {phase === 'playing' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              <span>Ходы</span>
              <span>{moveCount}/{MAX_MOVES}</span>
            </div>
            <div style={{ height: 3, background: 'var(--hairline)' }}>
              <div style={{ height: '100%', width: `${(moveCount / MAX_MOVES) * 100}%`, background: moveCount > 40 ? '#8B5A5A' : 'var(--accent)', transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {/* Hints */}
        {phase === 'playing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setHintIdea(true)} disabled={hintIdea} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--hairline)', color: hintIdea ? 'var(--muted)' : 'var(--ivory)', cursor: hintIdea ? 'default' : 'pointer', fontSize: 13, textAlign: 'left', fontFamily: 'inherit' }}>
              Подсказка идеи
            </button>
            <button onClick={requestHintMove} disabled={!!hintMove} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--hairline)', color: hintMove ? 'var(--muted)' : 'var(--ivory)', cursor: hintMove ? 'default' : 'pointer', fontSize: 13, textAlign: 'left', fontFamily: 'inherit' }}>
              Подсказка хода
            </button>
          </div>
        )}

        {hintIdea && (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            {current.idea}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
          <button onClick={() => setPhase('list')} style={{ flex: 1, padding: '8px 12px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            ← Список
          </button>
          {phase === 'done' && (
            <>
              <button onClick={() => startEndgame(current)} style={{ flex: 1, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ivory)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Повторить
              </button>
              <PlayButton fen={current.fen} color={new Chess(current.fen).turn()} label="Играть отсюда" />
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <TrainerLayout
      topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>Stockfish</span>}
      board={
        <Board
          fen={fen}
          size={S}
          orientation={orientation}
          interactive={isPlayerTurn}
          onMove={boardOnMove}
          lastMove={hintLastMove}
        />
      }
      bottomBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>{orientation === 'white' ? 'Ты играешь белыми' : 'Ты играешь чёрными'}</span>}
      panel={panel}
    />
  );
}
