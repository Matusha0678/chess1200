'use client';

import { useState, useEffect, useCallback, use } from 'react';
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

  // Extract comments by position in move stream
  let moveTextRaw = pgn.replace(/\[[^\]]*\]/g, '');
  moveTextRaw = moveTextRaw.replace(/^\s*|\s*$/g, '');
  const commentsByMoveIdx: Map<number, string> = new Map();
  let cIdx = 0;
  moveTextRaw.replace(/\{([^}]*)\}/g, (_, c) => {
    commentsByMoveIdx.set(cIdx++, c.trim());
    return '';
  });

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

function getFenBefore(moves: ParsedMove[], idx: number): string {
  if (idx === 0) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  return moves[idx - 1].fen;
}

function checkTalLabels(fenBefore: string, san: string): Set<TalLabel> {
  const out = new Set<TalLabel>();
  try {
    const chess = new Chess(fenBefore);
    const m = chess.moves({ verbose: true }).find(mv => mv.san === san);
    if (!m) return out;
    if (m.flags.includes('c') || m.flags.includes('e')) out.add('capture');
    chess.move(san);
    if (chess.inCheck()) out.add('check');
    const central = new Set(['d4','d5','e4','e5','c4','c5','f4','f5']);
    if (central.has(m.to)) out.add('active');
  } catch {}
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MasterGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { boardTheme, customPieces, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();
  const { getTopMoves, isReady: engineReady } = useStockfish();

  const [game, setGame]         = useState<MasterGame | null>(null);
  const [moves, setMoves]       = useState<ParsedMove[]>([]);
  const [viewIdx, setViewIdx]   = useState(0);
  const [loading, setLoading]   = useState(true);
  const [flipped, setFlipped]   = useState(false);

  // Guess mode
  const [guessPhase, setGuessPhase]         = useState<GuessPhase>('off');
  const [guessSide, setGuessSide]           = useState<'white' | 'black'>('white');
  const [guessIdx, setGuessIdx]             = useState(0);
  const [moveScores, setMoveScores]         = useState<MoveScore[]>([]);
  const [pendingScore, setPendingScore]     = useState<MoveScore | null>(null);
  const [topMoves, setTopMoves]             = useState<string[]>([]);
  const [topMovesLoading, setTopMovesLoading] = useState(false);

  // Tal's Three Questions
  const [talOpen, setTalOpen]           = useState(false);
  const [talSelected, setTalSelected]   = useState<Set<TalLabel>>(new Set());
  const [talResult, setTalResult]       = useState<{ correct: Set<TalLabel>; userPicks: Set<TalLabel> } | null>(null);

  useEffect(() => {
    supabase.from('master_games').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) { setLoading(false); return; }
      setGame(data as MasterGame);
      setMoves(parseGameMoves((data as MasterGame).pgn));
      setLoading(false);
    });
  }, [id]);

  const fen = viewIdx === 0
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : moves[viewIdx - 1]?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const isMyTurn = useCallback((moveColor: 'w' | 'b') => {
    return (guessSide === 'white' && moveColor === 'w') ||
           (guessSide === 'black' && moveColor === 'b');
  }, [guessSide]);

  function startGuess(side: 'white' | 'black') {
    setGuessSide(side);
    setGuessPhase('playing');
    setMoveScores([]);
    setPendingScore(null);
    const firstIdx = moves.findIndex(m => (side === 'white' && m.color === 'w') || (side === 'black' && m.color === 'b'));
    if (firstIdx === -1) { setGuessPhase('done'); return; }
    setGuessIdx(firstIdx);
    setViewIdx(firstIdx);
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

    const isPromo = (() => {
      try {
        const ch = new Chess(getFenBefore(moves, guessIdx));
        const sq = ch.get(sourceSquare as Parameters<typeof ch.get>[0]);
        return sq?.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1');
      } catch { return false; }
    })();
    const userUci   = sourceSquare + targetSquare + (isPromo ? 'q' : '');
    const masterUci = masterMove.from + masterMove.to;

    let pts = 0;
    if (userUci.startsWith(masterUci.slice(0, 4))) pts = 2;
    else if (!topMovesLoading && topMoves.includes(userUci.slice(0, 4))) pts = 1;

    setPendingScore({ pts, max: 2, san: userUci.slice(0, 4), master: masterMove.san });
    setViewIdx(guessIdx + 1);
    return false;
  }, [guessPhase, guessIdx, moves, pendingScore, topMoves, topMovesLoading, isMyTurn]);

  function advanceGuess() {
    const applied = pendingScore ? [...moveScores, pendingScore] : moveScores;
    setMoveScores(applied);
    setPendingScore(null);
    setTalOpen(false);
    setTalSelected(new Set());
    setTalResult(null);

    const nextIdx = moves.findIndex((m, i) => i > guessIdx && isMyTurn(m.color));
    if (nextIdx === -1) { finishGuess(applied); return; }
    setGuessIdx(nextIdx);
    setViewIdx(nextIdx);
    prefetchTopMoves(getFenBefore(moves, nextIdx));
  }

  async function finishGuess(scores: MoveScore[]) {
    setGuessPhase('done');
    const total = scores.reduce((a, s) => a + s.pts, 0);
    const max   = scores.reduce((a, s) => a + s.max, 0);
    await supabase.from('guess_log').insert({ game_id: id, side: guessSide, score: total, max_score: max });
  }

  function handleTalSubmit() {
    if (guessIdx >= moves.length) return;
    const masterMove = moves[guessIdx];
    const correct = checkTalLabels(getFenBefore(moves, guessIdx), masterMove.san);
    setTalResult({ correct, userPicks: new Set(talSelected) });
  }

  // Keyboard navigation (viewer only)
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

  const baseOrientation: 'white' | 'black' = guessSide === 'black' ? 'black' : 'white';
  const boardOrientation: 'white' | 'black' = flipped
    ? (baseOrientation === 'white' ? 'black' : 'white')
    : baseOrientation;

  if (loading) return (
    <main className="page-wrap">
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
    </main>
  );
  if (!game) return (
    <main className="page-wrap">
      <div className="ui-card ui-card-lg" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 8 }}>Партия не найдена</div>
        <Link href="/masters" className="ui-btn ui-btn-outline" style={{ display: 'inline-flex', marginTop: 8 }}>К библиотеке</Link>
      </div>
    </main>
  );

  return (
    <main className="page-wrap">
      {/* Header */}
      <div className="page-header">
        <Link href="/masters" className="ui-back">← Библиотека</Link>
        <div className="ui-eyebrow">
          <span>Партия</span>
          <span className="ui-eyebrow-line" />
          <span>{game.event || '—'}{game.year ? ` · ${game.year}` : ''}</span>
        </div>
        <h1 className="ui-h1" style={{ fontSize: 28, fontWeight: 600 }}>
          {game.white} <span style={{ color: 'var(--muted)' }}>—</span> {game.black}
        </h1>
        <p className="ui-sub">
          Итог: <span className={
            game.result === '1-0' ? 'result-win'
            : game.result === '0-1' ? 'result-loss' : 'result-draw'
          }>{game.result}</span>
          {moves.length > 0 && <> · {moves.length} ходов</>}
        </p>
      </div>

      <div className="board-layout">
        {/* ── Board column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="board-wrap">
            <Chessboard
              key={boardKey}
              options={{
                position: fen,
                boardOrientation,
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

          {guessPhase === 'off' && (
            <>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="ui-btn-icon" onClick={() => setViewIdx(0)}            title="В начало">⏮</button>
                <button className="ui-btn-icon" onClick={() => setViewIdx(i => Math.max(0, i - 1))}            title="Назад (←)">←</button>
                <button className="ui-btn-icon" onClick={() => setViewIdx(i => Math.min(moves.length, i + 1))} title="Вперёд (→)">→</button>
                <button className="ui-btn-icon" onClick={() => setViewIdx(moves.length)} title="В конец">⏭</button>
                <button className="ui-btn-icon" onClick={() => setFlipped(v => !v)}      title="Перевернуть (F)">⇄</button>
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                {viewIdx === 0 ? 'Начальная позиция' : `Ход ${Math.ceil(viewIdx / 2)}, ${viewIdx % 2 === 1 ? 'белые' : 'чёрные'}`}
              </div>
            </>
          )}

          {guessPhase === 'off' && viewIdx > 0 && moves[viewIdx - 1]?.comment && (
            <div className="ui-card ui-card-sm" style={{ fontSize: 13, lineHeight: 1.6 }}>
              💬 {moves[viewIdx - 1].comment}
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Viewer */}
          {guessPhase === 'off' && (
            <>
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

              <div className="ui-card ui-card-lg">
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 8 }}>
                  Угадай ход
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                  Играй за одну сторону и находи ходы мастера. Ход мастера — <strong style={{ color: 'var(--ivory)' }}>2 очка</strong>,
                  один из топ-3 движка — <strong style={{ color: 'var(--ivory)' }}>1 очко</strong>.
                </div>
                {!engineReady ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Движок загружается…</div>
                ) : (
                  <button className="ui-btn ui-btn-primary" onClick={() => setGuessPhase('choosing-side')}>
                    Начать угадывать
                  </button>
                )}
              </div>
            </>
          )}

          {/* Side selection */}
          {guessPhase === 'choosing-side' && (
            <div className="ui-card ui-card-lg">
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', marginBottom: 14 }}>
                За кого играть?
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <button className="ui-btn ui-btn-primary" style={{ flex: 1, minWidth: 180 }} onClick={() => startGuess('white')}>
                  ♔ Белые ({game.white})
                </button>
                <button className="ui-btn ui-btn-ghost" style={{ flex: 1, minWidth: 180 }} onClick={() => startGuess('black')}>
                  ♚ Чёрные ({game.black})
                </button>
              </div>
              <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setGuessPhase('off')}>
                Отмена
              </button>
            </div>
          )}

          {/* Playing */}
          {guessPhase === 'playing' && (
            <>
              {/* Scoreboard */}
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-value">{totalScore}/{maxScore || '?'}</div>
                  <div className="stat-label">Счёт</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{moveScores.length}</div>
                  <div className="stat-label">Ходов</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ fontSize: 16 }}>{guessSide === 'white' ? '♔ Белые' : '♚ Чёрные'}</div>
                  <div className="stat-label">Сторона</div>
                </div>
              </div>

              {/* Result of last guess */}
              {pendingScore && (
                <div className={`ui-banner ${
                  pendingScore.pts === 2 ? 'ui-banner-success'
                  : pendingScore.pts === 1 ? 'ui-banner-warn'
                  : 'ui-banner-danger'
                }`}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', marginBottom: 6 }}>
                    {pendingScore.pts === 2 ? '✓ Ход мастера — 2 очка'
                      : pendingScore.pts === 1 ? '≈ Хороший ход (топ-3 движка) — 1 очко'
                      : '✗ Не совпало — 0 очков'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                    Ход мастера: <strong style={{ color: 'var(--ivory)', fontFamily: 'ui-monospace, monospace' }}>{pendingScore.master}</strong>
                  </div>
                  {guessIdx < moves.length && moves[guessIdx]?.comment && (
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
                      💬 {moves[guessIdx].comment}
                    </div>
                  )}
                  <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={advanceGuess}>
                    Следующий ход →
                  </button>
                </div>
              )}

              {/* Prompt */}
              {!pendingScore && guessIdx < moves.length && (
                <div className="ui-card">
                  <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 4 }}>
                    Ход {Math.ceil((guessIdx + 1) / 2)} · {moves[guessIdx]?.color === 'w' ? 'Белые' : 'Чёрные'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Перетащи фигуру на доске
                    {topMovesLoading ? ' · движок думает…' : ''}
                  </div>

                  {/* Tal's Three Questions */}
                  {!talOpen && (
                    <button
                      className="ui-btn ui-btn-outline ui-btn-sm"
                      style={{ marginTop: 14 }}
                      onClick={() => setTalOpen(true)}
                    >
                      🧠 Три вопроса Таля
                    </button>
                  )}
                  {talOpen && !talResult && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.05em' }}>
                        Что будет в ходе мастера?
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        {TAL_LABELS.map(({ id: lid, label }) => (
                          <button
                            key={lid}
                            className={`ui-chip ${talSelected.has(lid) ? 'ui-chip-active' : ''}`}
                            onClick={() => setTalSelected(prev => {
                              const s = new Set(prev);
                              if (s.has(lid)) s.delete(lid); else s.add(lid);
                              return s;
                            })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={handleTalSubmit}>
                        Проверить
                      </button>
                    </div>
                  )}
                  {talResult && (
                    <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                      Правильно: <strong style={{ color: 'var(--ivory)' }}>
                        {TAL_LABELS.filter(l => talResult.correct.has(l.id)).map(l => l.label).join(', ') || '—'}
                      </strong>
                      <br/>
                      Ты отметил: {TAL_LABELS.filter(l => talResult.userPicks.has(l.id)).map(l => l.label).join(', ') || '—'}
                    </div>
                  )}
                </div>
              )}

              {/* Score history pills */}
              {moveScores.length > 0 && (
                <div className="pill-row">
                  {moveScores.map((s, i) => (
                    <div
                      key={i}
                      title={`Ход ${i + 1}: ${s.master}`}
                      className={`pill pill-${s.pts}`}
                    >
                      {s.pts}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Done */}
          {guessPhase === 'done' && (
            <div className="ui-card ui-card-lg">
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)', marginBottom: 6,
                fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)' }}>
                Итог: {totalScore}/{maxScore} очков
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
                {maxScore > 0 ? `${Math.round(100 * totalScore / maxScore)}% совпадений` : ''}
              </div>
              {moveScores.length > 0 && (
                <div className="score-chart" style={{ marginBottom: 20 }}>
                  {moveScores.map((s, i) => (
                    <div key={i} title={`Ход ${i + 1}: ${s.master}`}
                         className={`score-bar score-bar-${s.pts}`} />
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="ui-btn ui-btn-outline" onClick={() => { setGuessPhase('off'); setViewIdx(0); }}>
                  Просмотр партии
                </button>
                <button className="ui-btn ui-btn-primary" onClick={() => setGuessPhase('choosing-side')}>
                  Ещё раз
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
