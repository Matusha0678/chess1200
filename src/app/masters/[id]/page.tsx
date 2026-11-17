'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { useStockfish } from '@/hooks/useStockfish';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MasterGame {
  id: string;
  white: string;
  black: string;
  event: string;
  year: number | null;
  result: string;
  pgn: string;
}

interface ParsedMove {
  san: string;
  from: string;
  to: string;
  fen: string;
  color: 'w' | 'b';
  comment?: string;
}

type GuessPhase = 'off' | 'choosing-side' | 'playing' | 'done';

interface MoveScore { pts: number; max: number; san: string; master: string; }

// Three-Questions labels
type TalLabel = 'capture' | 'check' | 'active';
const TAL_LABELS: { id: TalLabel; label: string }[] = [
  { id: 'capture', label: 'Взятие' },
  { id: 'check',   label: 'Шах' },
  { id: 'active',  label: 'Активная фигура' },
];

// ── PGN parse ─────────────────────────────────────────────────────────────────

function parseGameMoves(pgn: string): ParsedMove[] {
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { return []; }

  // Extract inline comments {…}
  const commentMap: Map<number, string> = new Map();
  let commentIdx = 0;
  const stripped = pgn.replace(/\{([^}]*)\}/g, (_, c) => { commentMap.set(commentIdx++, c.trim()); return `{${commentIdx-1}}`; });
  void stripped;

  const history = chess.history({ verbose: true });
  const result: ParsedMove[] = [];
  const replay = new Chess();

  // Re-extract comments by replaying
  let raw = pgn;
  raw = raw.replace(/\[[^\]]*\]/g, ''); // remove headers
  raw = raw.replace(/\d+\./g, '');      // remove move numbers
  raw = raw.replace(/1-0|0-1|1\/2-1\/2|\*/g, '');

  // Simple comment extraction by move index
  const commentsByMoveIdx: Map<number, string> = new Map();
  let cIdx = 0;
  raw.replace(/\{([^}]*)\}/g, (_, c) => {
    commentsByMoveIdx.set(cIdx++, c.trim());
    return '';
  });

  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    result.push({
      san:     m.san,
      from:    m.from,
      to:      m.to,
      fen:     replay.fen(),
      color:   m.color,
      comment: commentsByMoveIdx.get(i),
    });
  }
  return result;
}

function getFenBefore(moves: ParsedMove[], idx: number): string {
  if (idx === 0) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  return moves[idx - 1].fen;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkTalLabels(fenBefore: string, san: string): Set<TalLabel> {
  const result = new Set<TalLabel>();
  try {
    const chess = new Chess(fenBefore);
    const moves = chess.moves({ verbose: true });
    const m = moves.find(mv => mv.san === san);
    if (!m) return result;
    if (m.flags.includes('c') || m.flags.includes('e')) result.add('capture');
    chess.move(san);
    if (chess.inCheck()) result.add('check');
    // "Active": piece moved to central squares (d4-e5 area) or forward
    const centralSquares = new Set(['d4','d5','e4','e5','c4','c5','f4','f5']);
    if (centralSquares.has(m.to)) result.add('active');
  } catch {}
  return result;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MasterGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { boardTheme, customPieces, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();
  const { getTopMoves, isReady: engineReady } = useStockfish();

  const [game, setGame]         = useState<MasterGame | null>(null);
  const [moves, setMoves]       = useState<ParsedMove[]>([]);
  const [viewIdx, setViewIdx]   = useState(0); // 0 = initial pos, 1..n = after move n
  const [loading, setLoading]   = useState(true);

  // Guess mode state
  const [guessPhase, setGuessPhase]   = useState<GuessPhase>('off');
  const [guessSide, setGuessSide]     = useState<'white' | 'black'>('white');
  const [guessIdx, setGuessIdx]       = useState(0);
  const [moveScores, setMoveScores]   = useState<MoveScore[]>([]);
  const [pendingScore, setPendingScore] = useState<MoveScore | null>(null);
  const [topMoves, setTopMoves]       = useState<string[]>([]);
  const [topMovesLoading, setTopMovesLoading] = useState(false);

  // Tal's Three Questions state
  const [talOpen, setTalOpen]           = useState(false);
  const [talSelected, setTalSelected]   = useState<Set<TalLabel>>(new Set());
  const [talResult, setTalResult]       = useState<{ correct: Set<TalLabel>; userPicks: Set<TalLabel> } | null>(null);

  const flippedRef = useRef(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => { flippedRef.current = flipped; }, [flipped]);

  useEffect(() => {
    supabase.from('master_games').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) { setLoading(false); return; }
      setGame(data as MasterGame);
      const parsed = parseGameMoves((data as MasterGame).pgn);
      setMoves(parsed);
      setLoading(false);
    });
  }, [id]);

  const fen = viewIdx === 0
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : moves[viewIdx - 1]?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // ── Guess mode helpers ────────────────────────────────────────────────────

  const isMyTurn = useCallback((moveColor: 'w' | 'b') => {
    return (guessSide === 'white' && moveColor === 'w') ||
           (guessSide === 'black' && moveColor === 'b');
  }, [guessSide]);

  function startGuess(side: 'white' | 'black') {
    setGuessSide(side);
    setGuessPhase('playing');
    setMoveScores([]);
    setPendingScore(null);
    // Start at the first move for the chosen side
    const firstIdx = moves.findIndex(m => isMyTurn(m.color));
    if (firstIdx === -1) {
      setGuessPhase('done');
      return;
    }
    setGuessIdx(firstIdx);
    setViewIdx(firstIdx); // show position before this move
    // Pre-fetch engine moves
    prefetchTopMoves(getFenBefore(moves, firstIdx));
  }

  function prefetchTopMoves(fenStr: string) {
    setTopMovesLoading(true);
    setTopMoves([]);
    getTopMoves(fenStr, 12, 3, (top) => {
      setTopMoves(top);
      setTopMovesLoading(false);
    });
  }

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (guessPhase !== 'playing' || !targetSquare) return false;
    if (guessIdx >= moves.length) return false;
    const masterMove = moves[guessIdx];
    if (!isMyTurn(masterMove.color)) return false;
    if (pendingScore) return false;

    // Check pawn promotion by peeking at the board
    const isPromo = (() => {
      try {
        const ch = new Chess(getFenBefore(moves, guessIdx));
        const sq = ch.get(sourceSquare as Parameters<typeof ch.get>[0]);
        return sq?.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1');
      } catch { return false; }
    })();
    const userUci = sourceSquare + targetSquare + (isPromo ? 'q' : '');
    const masterUci = masterMove.from + masterMove.to;

    let pts = 0;
    if (userUci.startsWith(masterUci.slice(0, 4))) {
      pts = 2; // exact master move
    } else if (!topMovesLoading && topMoves.includes(userUci.slice(0, 4))) {
      pts = 1; // top-3 engine move
    }

    const score: MoveScore = { pts, max: 2, san: userUci.slice(0, 4), master: masterMove.san };
    setPendingScore(score);
    setViewIdx(guessIdx + 1); // show the actual master move on board

    return false; // don't apply drop visually; we show master move
  }, [guessPhase, guessIdx, moves, pendingScore, topMoves, topMovesLoading, isMyTurn]);

  function advanceGuess() {
    if (pendingScore) {
      setMoveScores(prev => [...prev, pendingScore]);
      setPendingScore(null);
      setTalOpen(false);
      setTalSelected(new Set());
      setTalResult(null);
    }
    // Find next move for our side
    const nextIdx = moves.findIndex((m, i) => i > guessIdx && isMyTurn(m.color));
    if (nextIdx === -1) {
      // End of game
      finishGuess([...moveScores, pendingScore!].filter(Boolean));
      return;
    }
    setGuessIdx(nextIdx);
    setViewIdx(nextIdx);
    prefetchTopMoves(getFenBefore(moves, nextIdx));
  }

  async function finishGuess(scores: MoveScore[]) {
    setGuessPhase('done');
    const total = scores.reduce((a, s) => a + s.pts, 0);
    const max   = scores.reduce((a, s) => a + s.max, 0);
    await supabase.from('guess_log').insert({
      game_id:   id,
      side:      guessSide,
      score:     total,
      max_score: max,
    });
  }

  function handleTalSubmit() {
    if (guessIdx >= moves.length) return;
    const masterMove = moves[guessIdx];
    const correct = checkTalLabels(getFenBefore(moves, guessIdx), masterMove.san);
    setTalResult({ correct, userPicks: new Set(talSelected) });
  }

  // Keyboard navigation (viewer mode only)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (guessPhase === 'playing') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' && viewIdx < moves.length) setViewIdx(i => i + 1);
      if (e.key === 'ArrowLeft'  && viewIdx > 0)            setViewIdx(i => i - 1);
      if (e.key === 'f' || e.key === 'F') setFlipped(v => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guessPhase, viewIdx, moves.length]);

  const boardKey = `${boardThemeId}-${pieceStyleId}-${flipped}`;

  const totalScore = moveScores.reduce((a, s) => a + s.pts, 0);
  const maxScore   = moveScores.reduce((a, s) => a + s.max, 0);

  if (loading) return (
    <main style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</main>
  );
  if (!game) return (
    <main style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Партия не найдена.</main>
  );

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 20px 40px' }}>
      {/* Back */}
      <Link href="/masters" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← Библиотека
      </Link>

      {/* Title */}
      <h1 style={{ margin: '10px 0 4px', fontSize: 24, fontWeight: 700, color: 'var(--ivory)' }}>
        {game.white} — {game.black}
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>
        {game.event || 'Партия'}{game.year ? ` · ${game.year}` : ''} · {game.result}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,460px) 1fr', gap: 28, alignItems: 'start' }}>

        {/* ── Board ── */}
        <div>
          <div style={{ width: '100%', aspectRatio: '1', border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
            <Chessboard
              key={boardKey}
              options={{
                position: fen,
                boardOrientation: flipped ? (guessSide === 'black' ? 'white' : 'black') : (guessSide === 'black' ? 'black' : 'white'),
                onPieceDrop: guessPhase === 'playing' && !pendingScore ? handlePieceDrop : undefined,
                allowDragging: guessPhase === 'playing' && !pendingScore,
                boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                darkSquareStyle:  { backgroundColor: boardTheme.dark },
                lightSquareStyle: { backgroundColor: boardTheme.light },
                pieces: customPieces,
                showNotation: true,
                animationDurationInMs: animationMs,
              }}
            />
          </div>

          {/* Board controls */}
          {guessPhase === 'off' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
              <button onClick={() => setViewIdx(0)} style={navBtnStyle}>⏮</button>
              <button onClick={() => setViewIdx(i => Math.max(0, i - 1))} style={navBtnStyle}>←</button>
              <button onClick={() => setViewIdx(i => Math.min(moves.length, i + 1))} style={navBtnStyle}>→</button>
              <button onClick={() => setViewIdx(moves.length)} style={navBtnStyle}>⏭</button>
              <button onClick={() => setFlipped(v => !v)} style={navBtnStyle} title="Перевернуть (F)">⇄</button>
            </div>
          )}

          {/* Position indicator */}
          {guessPhase === 'off' && (
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
              {viewIdx === 0 ? 'Начальная позиция' : `Ход ${Math.ceil(viewIdx / 2)}, ${viewIdx % 2 === 1 ? 'Белые' : 'Чёрные'}`}
            </div>
          )}

          {/* Comment */}
          {guessPhase === 'off' && viewIdx > 0 && moves[viewIdx - 1]?.comment && (
            <div style={{
              marginTop: 10, padding: '8px 12px',
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-card)', fontSize: 13, color: 'var(--ivory)', lineHeight: 1.5,
            }}>
              {moves[viewIdx - 1].comment}
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div>
          {/* ── Viewer mode ── */}
          {guessPhase === 'off' && (
            <>
              {/* Moves list */}
              <div style={{
                maxHeight: 320, overflowY: 'auto', marginBottom: 20,
                background: 'var(--surface)', border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-card)', padding: '10px 8px',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr', gap: '2px 4px' }}>
                  {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => {
                    const wIdx = i * 2;
                    const bIdx = i * 2 + 1;
                    return (
                      <>
                        <span key={`n${i}`} style={{ padding: '3px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
                          {i + 1}.
                        </span>
                        <button
                          key={`w${i}`}
                          onClick={() => setViewIdx(wIdx + 1)}
                          style={moveBtnStyle(viewIdx === wIdx + 1)}
                        >
                          {moves[wIdx]?.san ?? ''}
                        </button>
                        <button
                          key={`b${i}`}
                          onClick={() => bIdx < moves.length ? setViewIdx(bIdx + 1) : undefined}
                          style={moveBtnStyle(viewIdx === bIdx + 1)}
                        >
                          {moves[bIdx]?.san ?? ''}
                        </button>
                      </>
                    );
                  })}
                </div>
              </div>

              {/* Guess mode button */}
              <div style={{
                padding: 20,
                background: 'var(--surface)', border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-card)', marginBottom: 20,
              }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 8 }}>
                  Угадай ход
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                  Играй за одну сторону и угадывай ходы мастера. Ход мастера = 2 очка, лучший ход движка = 1 очко.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {!engineReady ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Движок загружается…</div>
                  ) : (
                    <>
                      <button onClick={() => { setGuessPhase('choosing-side'); }} style={accentBtnStyle}>
                        Играть за белых
                      </button>
                      <button onClick={() => { setGuessPhase('choosing-side'); }} style={outlineBtnStyle}>
                        Играть за чёрных
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Side selection ── */}
          {guessPhase === 'choosing-side' && (
            <div style={{
              padding: 24,
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-card)',
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', marginBottom: 16 }}>
                За кого играть?
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <button onClick={() => startGuess('white')} style={{ ...accentBtnStyle, flex: 1 }}>
                  ♔ За белых ({game.white})
                </button>
                <button onClick={() => startGuess('black')} style={{ ...outlineBtnStyle, flex: 1 }}>
                  ♚ За чёрных ({game.black})
                </button>
              </div>
              <button onClick={() => setGuessPhase('off')} style={{ ...outlineBtnStyle, color: 'var(--muted)' }}>
                Отмена
              </button>
            </div>
          )}

          {/* ── Guess playing ── */}
          {guessPhase === 'playing' && (
            <div>
              {/* Score */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20,
                padding: '12px 16px',
                background: 'var(--surface)', border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-card)',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Счёт</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ivory)' }}>{totalScore}/{maxScore || '?'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ходов</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ivory)' }}>{moveScores.length}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>
                  За {guessSide === 'white' ? 'белых' : 'чёрных'}
                </div>
              </div>

              {/* Result of last guess */}
              {pendingScore && (
                <div style={{
                  marginBottom: 16, padding: '12px 16px',
                  background: pendingScore.pts === 2 ? 'rgba(129,182,76,0.15)' : pendingScore.pts === 1 ? 'rgba(200,160,60,0.1)' : 'rgba(200,80,80,0.1)',
                  border: `1px solid ${pendingScore.pts === 2 ? 'rgba(129,182,76,0.4)' : pendingScore.pts === 1 ? 'rgba(200,160,60,0.3)' : 'rgba(200,80,80,0.3)'}`,
                  borderRadius: 'var(--radius-card)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)', marginBottom: 4 }}>
                    {pendingScore.pts === 2 ? '✓ Ход мастера — 2 очка'
                      : pendingScore.pts === 1 ? '≈ Лучший ход движка — 1 очко'
                      : '✗ Не совпало — 0 очков'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Ход мастера: <strong style={{ color: 'var(--ivory)' }}>{pendingScore.master}</strong>
                    {guessIdx < moves.length && moves[guessIdx]?.comment && (
                      <span style={{ display: 'block', marginTop: 4, lineHeight: 1.5 }}>
                        💬 {moves[guessIdx].comment}
                      </span>
                    )}
                  </div>
                  <button onClick={advanceGuess} style={{ ...accentBtnStyle, marginTop: 10, height: 34, fontSize: 13 }}>
                    Следующий ход →
                  </button>
                </div>
              )}

              {/* Waiting for user move */}
              {!pendingScore && guessIdx < moves.length && (
                <div style={{
                  marginBottom: 16, padding: '12px 16px',
                  background: 'var(--surface)', border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-card)',
                }}>
                  <div style={{ fontSize: 14, color: 'var(--ivory)', marginBottom: 4 }}>
                    Ход {Math.ceil((guessIdx + 1) / 2)} · {moves[guessIdx]?.color === 'w' ? 'Белые' : 'Чёрные'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Перетащи фигуру на доске
                    {topMovesLoading ? ' · движок думает…' : ''}
                  </div>

                  {/* Tal's Three Questions */}
                  {!talOpen && (
                    <button
                      onClick={() => setTalOpen(true)}
                      style={{ ...outlineBtnStyle, marginTop: 10, height: 32, fontSize: 12 }}
                    >
                      🧠 Три вопроса Таля
                    </button>
                  )}
                  {talOpen && !talResult && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                        Что делает следующий ход?
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {TAL_LABELS.map(({ id: lid, label }) => {
                          const sel = talSelected.has(lid);
                          return (
                            <button
                              key={lid}
                              onClick={() => setTalSelected(prev => {
                                const s = new Set(prev);
                                if (s.has(lid)) s.delete(lid); else s.add(lid);
                                return s;
                              })}
                              style={{
                                padding: '5px 12px', borderRadius: 20, fontSize: 12,
                                background: sel ? 'var(--accent)' : 'var(--surface)',
                                border: `1px solid ${sel ? 'var(--accent)' : 'var(--hairline)'}`,
                                color: sel ? '#fff' : 'var(--muted)', cursor: 'pointer',
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={handleTalSubmit} style={{ ...outlineBtnStyle, marginTop: 8, height: 30, fontSize: 12 }}>
                        Проверить
                      </button>
                    </div>
                  )}
                  {talResult && (
                    <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                      Правильно: {TAL_LABELS.filter(l => talResult.correct.has(l.id)).map(l => l.label).join(', ') || 'ни одного'}
                      <br/>
                      Ты отметил: {TAL_LABELS.filter(l => talResult.userPicks.has(l.id)).map(l => l.label).join(', ') || 'ни одного'}
                    </div>
                  )}
                </div>
              )}

              {/* Score history */}
              {moveScores.length > 0 && (
                <div style={{
                  display: 'flex', gap: 4, flexWrap: 'wrap',
                  padding: '8px 12px',
                  background: 'var(--surface)', border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-card)',
                }}>
                  {moveScores.map((s, i) => (
                    <div
                      key={i}
                      title={s.master}
                      style={{
                        width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        background: s.pts === 2 ? 'rgba(129,182,76,0.3)' : s.pts === 1 ? 'rgba(200,160,60,0.3)' : 'rgba(200,80,80,0.2)',
                        color: s.pts === 2 ? '#81B64C' : s.pts === 1 ? '#C8A040' : '#E06060',
                      }}
                    >
                      {s.pts}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {guessPhase === 'done' && (
            <div style={{
              padding: 24,
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-card)',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)', marginBottom: 8 }}>
                Итог: {totalScore}/{maxScore} очков
              </div>
              <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 16 }}>
                {maxScore > 0 ? `${Math.round(100 * totalScore / maxScore)}% совпадений` : ''}
              </div>
              {/* Score chart */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 20, flexWrap: 'wrap' }}>
                {moveScores.map((s, i) => (
                  <div
                    key={i}
                    title={`Ход ${i + 1}: ${s.master}`}
                    style={{
                      flex: '0 0 auto', width: 20, height: 32, borderRadius: 3,
                      background: s.pts === 2 ? '#81B64C' : s.pts === 1 ? '#C8A040' : '#404040',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setGuessPhase('off'); setViewIdx(0); }} style={outlineBtnStyle}>
                  Просмотр партии
                </button>
                <button onClick={() => setGuessPhase('choosing-side')} style={accentBtnStyle}>
                  Играть ещё раз
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .master-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 'var(--radius-btn)',
  background: 'var(--surface)', border: '1px solid var(--hairline)',
  color: 'var(--ivory)', fontSize: 14, cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};

const accentBtnStyle: React.CSSProperties = {
  height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
  background: 'var(--accent)', color: '#fff', border: 'none',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const outlineBtnStyle: React.CSSProperties = {
  height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
  background: 'transparent', color: 'var(--ivory)',
  border: '1px solid var(--hairline)', fontSize: 14, cursor: 'pointer',
};

function moveBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 6px', borderRadius: 4, textAlign: 'left',
    background: active ? 'var(--accent)' : 'transparent',
    border: 'none', color: active ? '#fff' : 'var(--ivory)',
    fontSize: 13, cursor: 'pointer', fontFamily: 'monospace',
  };
}
