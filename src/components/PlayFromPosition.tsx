'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { PieceDropHandlerArgs, Arrow } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import type { AnalysisInfo } from '@/hooks/useStockfish';

// ── Types ──────────────────────────────────────────────────────────────────────

type GamePhase = 'playing' | 'analyzing' | 'done';

interface MoveRecord {
  san: string;
  fenBefore: string;
  fenAfter: string;
  side: 'w' | 'b';
}

interface MistakeInfo {
  moveNum: number;
  san: string;
  dropCp: number;
}

export interface PlayFromPositionProps {
  startFen: string;
  playerColor: 'w' | 'b';
  level: number;
  mode: 'free' | 'convert' | 'handicap';
  onNewGame?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function evalToWhiteScore(cp: number | undefined, mate: number | undefined, turn: 'w' | 'b'): number {
  if (mate !== undefined) {
    if (turn === 'w') return mate > 0 ? 97 : 3;
    return mate > 0 ? 3 : 97;
  }
  if (cp !== undefined) {
    const cpW = turn === 'w' ? cp : -cp;
    return Math.max(5, Math.min(95, 50 + cpW / 20));
  }
  return 50;
}

function evalToText(cp: number | undefined, mate: number | undefined, turn: 'w' | 'b'): string {
  if (mate !== undefined) {
    const mateW = turn === 'w' ? mate : -mate;
    return mateW > 0 ? `+M${Math.abs(mateW)}` : `-M${Math.abs(mateW)}`;
  }
  if (cp !== undefined) {
    const cpW = turn === 'w' ? cp : -cp;
    return cpW >= 0 ? `+${(cpW / 100).toFixed(1)}` : (cpW / 100).toFixed(1);
  }
  return '0.0';
}

function uciToArrows(uciMove: string | null): Arrow[] {
  if (!uciMove || uciMove.length < 4) return [];
  type Sq = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'}`;
  return [{
    startSquare: uciMove.slice(0, 2) as Sq,
    endSquare: uciMove.slice(2, 4) as Sq,
    color: 'rgba(100, 180, 255, 0.85)',
  }];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PlayFromPosition({
  startFen, playerColor, level, mode, onNewGame,
}: PlayFromPositionProps) {
  const chessRef = useRef(new Chess(startFen));
  const [fen, setFen] = useState(startFen);
  const [boardKey, setBoardKey] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [result, setResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const [showAnalysis, setShowAnalysis] = useState(false);
  const [evalInfo, setEvalInfo] = useState<{ cp?: number; mate?: number; turn: 'w' | 'b' } | null>(null);
  const [bestMoveArrow, setBestMoveArrow] = useState<string | null>(null);
  const showAnalysisRef = useRef(false);

  const [hintArrow, setHintArrow] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mistakes, setMistakes] = useState<MistakeInfo[] | null>(null);
  const [analysisDone, setAnalysisDone] = useState(false);

  const isProcessingRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [turn, setTurn] = useState<'w' | 'b'>(() => { try { return new Chess(startFen).turn(); } catch { return 'w'; } });
  const moveHistoryRef = useRef<MoveRecord[]>([]);
  const hasStartedRef = useRef(false);

  const { getBestMove, startAnalysis, stopAnalysis, setSkillLevel, isReady: sfReady } = useStockfish();

  useEffect(() => { setSkillLevel(level); }, [level, setSkillLevel]);

  // ── Eval capture for post-game analysis ──────────────────────────────────────

  // Promise-based single-position eval (500 ms window)
  const evalFenWhitePov = useCallback((positionFen: string): Promise<number> => {
    return new Promise<number>((resolve) => {
      let last = 0;
      let done = false;

      startAnalysis(positionFen, (info: AnalysisInfo) => {
        if (done) return;
        try {
          const turn = new Chess(positionFen).turn();
          if (info.cp !== undefined) last = turn === 'w' ? info.cp : -info.cp;
          if (info.mate !== undefined) last = turn === 'w' ? (info.mate > 0 ? 9900 : -9900) : (info.mate > 0 ? -9900 : 9900);
        } catch { /* ignore */ }
      });

      setTimeout(() => {
        if (done) return;
        done = true;
        stopAnalysis();
        setTimeout(() => resolve(last), 100);
      }, 500);
    });
  }, [startAnalysis, stopAnalysis]);

  // ── Post-game analysis (top 3 drops) ─────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'analyzing') return;
    let cancelled = false;

    async function run() {
      const playerMoves = moveHistoryRef.current.filter(m => m.side === playerColor);
      if (playerMoves.length === 0) {
        if (!cancelled) { setMistakes([]); setAnalysisDone(true); setPhase('done'); }
        return;
      }

      const evalMap = new Map<string, number>();

      for (const m of playerMoves) {
        if (cancelled) return;
        if (!evalMap.has(m.fenBefore)) {
          const cp = await evalFenWhitePov(m.fenBefore);
          if (!cancelled) evalMap.set(m.fenBefore, cp);
        }
        if (cancelled) return;
        if (!evalMap.has(m.fenAfter)) {
          const cp = await evalFenWhitePov(m.fenAfter);
          if (!cancelled) evalMap.set(m.fenAfter, cp);
        }
      }

      if (cancelled) return;

      const drops: MistakeInfo[] = [];
      let mn = 0;
      for (const m of moveHistoryRef.current) {
        if (m.side !== playerColor) continue;
        mn++;
        const before = evalMap.get(m.fenBefore);
        const after = evalMap.get(m.fenAfter);
        if (before === undefined || after === undefined) continue;
        const dropCp = playerColor === 'w' ? (before - after) : (after - before);
        if (dropCp > 50) drops.push({ moveNum: mn, san: m.san, dropCp });
      }
      drops.sort((a, b) => b.dropCp - a.dropCp);

      if (!cancelled) {
        setMistakes(drops.slice(0, 3));
        setAnalysisDone(true);
        setPhase('done');
      }
    }

    run();
    return () => { cancelled = true; };
  }, [phase, playerColor, evalFenWhitePov]);

  // ── Log game ──────────────────────────────────────────────────────────────────

  const logGame = useCallback(async (gameResult: 'win' | 'loss' | 'draw') => {
    try {
      await supabase.from('game_log').insert({
        fen: startFen, mode, result: gameResult,
        player_color: playerColor, level,
        pgn: chessRef.current.pgn(),
      });
    } catch { /* non-critical */ }
  }, [startFen, mode, playerColor, level]);

  // ── Game over ─────────────────────────────────────────────────────────────────

  const handleGameOver = useCallback((pc: 'w' | 'b') => {
    const chess = chessRef.current;
    let gameResult: 'win' | 'loss' | 'draw';
    let msg: string;

    if (chess.isCheckmate()) {
      if (chess.turn() === pc) { gameResult = 'loss'; msg = 'Мат. Стокфиш выиграл.'; }
      else { gameResult = 'win'; msg = 'Мат! Ты выиграл!'; }
    } else if (chess.isDraw()) {
      gameResult = 'draw'; msg = 'Ничья.';
    } else {
      gameResult = 'draw'; msg = 'Игра завершена.';
    }

    setResult(gameResult);
    setStatusMsg(msg);
    stopAnalysis();
    logGame(gameResult);
    setPhase('analyzing');
  }, [stopAnalysis, logGame]);

  // ── Stockfish move ────────────────────────────────────────────────────────────

  const requestStockfishMove = useCallback((currentFen: string, pc: 'w' | 'b') => {
    getBestMove(currentFen, 12, (uciMove) => {
      setTimeout(() => {
        try {
          const from = uciMove.slice(0, 2);
          const to = uciMove.slice(2, 4);
          const promotion = uciMove[4] as 'q' | 'r' | 'b' | 'n' | undefined;
          const move = chessRef.current.move({ from, to, promotion });
          if (move) {
            const newFen = chessRef.current.fen();
            moveHistoryRef.current.push({ san: move.san, fenBefore: currentFen, fenAfter: newFen, side: move.color as 'w' | 'b' });
            setFen(newFen);
            setTurn(chessRef.current.turn());
            if (chessRef.current.isGameOver()) {
              isProcessingRef.current = false; setIsProcessing(false);
              handleGameOver(pc);
              return;
            }
            if (showAnalysisRef.current && sfReady) {
              startAnalysis(newFen, (info) => {
                setEvalInfo({ cp: info.cp, mate: info.mate, turn: chessRef.current.turn() });
                if (info.bestMove) setBestMoveArrow(info.bestMove);
              });
            }
          }
        } catch { /* ignore */ }
        isProcessingRef.current = false; setIsProcessing(false);
      }, 300);
    });
  }, [getBestMove, handleGameOver, sfReady, startAnalysis]);

  // ── Player drop ───────────────────────────────────────────────────────────────

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (isProcessingRef.current || !sfReady || phase !== 'playing') return false;
    if (!targetSquare) return false;
    if (chessRef.current.turn() !== playerColor) return false;

    try {
      const prevFen = chessRef.current.fen();
      const move = chessRef.current.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!move) return false;

      const newFen = chessRef.current.fen();
      moveHistoryRef.current.push({ san: move.san, fenBefore: prevFen, fenAfter: newFen, side: playerColor });

      if (showAnalysisRef.current) { stopAnalysis(); setBestMoveArrow(null); }
      setHintArrow(null);
      isProcessingRef.current = true; setIsProcessing(true);
      setFen(newFen);
      setTurn(chessRef.current.turn());

      if (chessRef.current.isGameOver()) {
        isProcessingRef.current = false; setIsProcessing(false);
        handleGameOver(playerColor);
        return true;
      }

      requestStockfishMove(newFen, playerColor);
      return true;
    } catch { return false; }
  }, [sfReady, phase, playerColor, stopAnalysis, handleGameOver, requestStockfishMove]);

  // ── Undo (undo bot + player move) ────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (isProcessingRef.current || phase !== 'playing') return;
    const history = moveHistoryRef.current;

    // Undo bot's last move (if present)
    if (history.length > 0 && history[history.length - 1].side !== playerColor) {
      chessRef.current.undo();
      moveHistoryRef.current.pop();
    }
    // Undo player's last move (if present)
    if (history.length > 0 && history[history.length - 1].side === playerColor) {
      chessRef.current.undo();
      moveHistoryRef.current.pop();
    }

    setFen(chessRef.current.fen());
    setTurn(chessRef.current.turn());
    setHintArrow(null);
    if (showAnalysisRef.current && sfReady) {
      startAnalysis(chessRef.current.fen(), (info) => {
        setEvalInfo({ cp: info.cp, mate: info.mate, turn: chessRef.current.turn() });
        if (info.bestMove) setBestMoveArrow(info.bestMove);
      });
    }
  }, [phase, playerColor, sfReady, startAnalysis]);

  // ── Hint ──────────────────────────────────────────────────────────────────────

  const handleHint = useCallback(() => {
    if (phase !== 'playing' || isProcessingRef.current || !sfReady) return;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    getBestMove(chessRef.current.fen(), 10, (uciMove) => {
      setHintArrow(uciMove);
      hintTimerRef.current = setTimeout(() => setHintArrow(null), 2500);
    });
  }, [phase, sfReady, getBestMove]);

  // ── Analysis toggle ───────────────────────────────────────────────────────────

  const handleToggleAnalysis = useCallback(() => {
    const next = !showAnalysis;
    setShowAnalysis(next);
    showAnalysisRef.current = next;
    if (!next) {
      stopAnalysis(); setEvalInfo(null); setBestMoveArrow(null);
    } else if (phase === 'playing' && sfReady && chessRef.current.turn() === playerColor) {
      startAnalysis(chessRef.current.fen(), (info) => {
        setEvalInfo({ cp: info.cp, mate: info.mate, turn: chessRef.current.turn() });
        if (info.bestMove) setBestMoveArrow(info.bestMove);
      });
    }
  }, [showAnalysis, stopAnalysis, phase, sfReady, playerColor, startAnalysis]);

  // ── Bot moves first on game start ─────────────────────────────────────────────

  useEffect(() => {
    if (!sfReady || hasStartedRef.current) return;
    hasStartedRef.current = true;
    if (chessRef.current.turn() !== playerColor) {
      isProcessingRef.current = true; setIsProcessing(true);
      requestStockfishMove(chessRef.current.fen(), playerColor);
    }
  }, [sfReady, playerColor, requestStockfishMove]);

  // ── New game reset ────────────────────────────────────────────────────────────

  const handleNewGame = useCallback(() => {
    if (onNewGame) { onNewGame(); return; }
    chessRef.current = new Chess(startFen);
    moveHistoryRef.current = [];
    hasStartedRef.current = false;
    isProcessingRef.current = false; setIsProcessing(false);
    setFen(startFen);
    setTurn(() => { try { return new Chess(startFen).turn(); } catch { return 'w'; } });
    setPhase('playing');
    setResult(null);
    setStatusMsg('');
    setMistakes(null);
    setAnalysisDone(false);
    setEvalInfo(null);
    setBestMoveArrow(null);
    setHintArrow(null);
    setBoardKey(k => k + 1);
    stopAnalysis();
  }, [onNewGame, startFen, stopAnalysis]);

  // ── Computed ──────────────────────────────────────────────────────────────────

  const whiteScore = evalInfo ? evalToWhiteScore(evalInfo.cp, evalInfo.mate, evalInfo.turn) : 50;
  const evalText = evalInfo ? evalToText(evalInfo.cp, evalInfo.mate, evalInfo.turn) : null;
  const displayArrows = hintArrow ? uciToArrows(hintArrow) : showAnalysis ? uciToArrows(bestMoveArrow) : [];
  const isPlayerTurn = phase === 'playing' && !isProcessing && turn === playerColor;

  // ── Render ────────────────────────────────────────────────────────────────────

  const resultColor = result === 'win' ? '#81C784' : result === 'loss' ? '#EF9A9A' : '#FFD54F';

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

      {/* ── Board ── */}
      <div style={{ position: 'relative', flexShrink: 0, width: 'min(480px, 100%)' }}>
        {showAnalysis && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, right: 'calc(100% + 6px)',
            width: 10, display: 'flex', flexDirection: 'column',
            borderRadius: 6, overflow: 'hidden',
          }}>
            <div style={{ background: 'var(--hairline)', flex: `${100 - whiteScore} 0 0`, transition: 'flex 0.5s' }} />
            <div style={{ background: 'var(--ivory)', flex: `${whiteScore} 0 0`, transition: 'flex 0.5s' }} />
          </div>
        )}

        <Chessboard
          key={boardKey}
          options={{
            position: fen,
            boardOrientation: playerColor === 'w' ? 'white' : 'black',
            onPieceDrop: handlePieceDrop,
            arrows: displayArrows,
            allowDragging: isPlayerTurn,
            boardStyle: { borderRadius: 4 },
          }}
        />
      </div>

      {/* ── Side panel ── */}
      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Status bar */}
        <div style={{
          padding: '10px 14px', borderRadius: 6,
          background: 'var(--surface)', border: '1px solid var(--hairline)',
          fontSize: 13, color: 'var(--ivory)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {phase === 'playing' && (
            isPlayerTurn
              ? <><span style={dot('#81C784')} />Твой ход</>
              : <><span style={dot('var(--muted)')} />Стокфиш думает…</>
          )}
          {phase === 'analyzing' && <><span style={dot('#64B5F6')} />Анализируется…</>}
          {phase === 'done' && result && (
            <>
              <span style={dot(resultColor)} />
              {statusMsg}
            </>
          )}
          {showAnalysis && evalText && phase === 'playing' && (
            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{evalText}</span>
          )}
          {!sfReady && phase === 'playing' && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>Движок загружается…</span>
          )}
        </div>

        {/* Post-game analysis */}
        {analysisDone && mistakes !== null && (
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              padding: '6px 14px', background: 'var(--surface)',
              borderBottom: '1px solid var(--hairline)',
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)',
            }}>
              Главные потери
            </div>
            {mistakes.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>
                Явных ошибок не найдено — хорошая игра!
              </div>
            ) : mistakes.map((m, i) => (
              <div key={i} style={{
                padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 13, borderBottom: i < mistakes.length - 1 ? '1px solid var(--hairline)' : undefined,
              }}>
                <span style={{ color: 'var(--ivory)' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 8 }}>#{m.moveNum}</span>
                  {m.san}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#EF9A9A' }}>
                  −{(m.dropCp / 100).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phase === 'playing' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleHint} style={btnSt}>
                Подсказка
              </button>
              <button onClick={handleUndo} style={btnSt}>
                Отменить
              </button>
            </div>
          )}

          <button
            onClick={handleToggleAnalysis}
            style={{
              ...btnSt,
              borderColor: showAnalysis ? '#64B5F6' : undefined,
              color: showAnalysis ? '#64B5F6' : undefined,
              background: showAnalysis ? 'rgba(100,181,246,0.08)' : undefined,
            }}
          >
            Оценка{showAnalysis ? ' · вкл' : ' · выкл'}
          </button>

          <button onClick={handleNewGame} style={{ ...btnSt, opacity: 0.75 }}>
            {phase === 'playing' ? 'Начать заново' : 'Новая партия'}
          </button>
        </div>

        {/* Color + difficulty legend */}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {playerColor === 'w' ? '♙ Белые' : '♟ Чёрные'} · Уровень {level}
          {mode !== 'free' && <> · {mode === 'convert' ? 'Конвертация' : 'С форой'}</>}
        </div>
      </div>
    </div>
  );
}

// ── Style helpers ──────────────────────────────────────────────────────────────

function dot(color: string): React.CSSProperties {
  return { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 };
}

const btnSt: React.CSSProperties = {
  flex: 1, height: 36, border: '1px solid var(--hairline)',
  background: 'transparent', color: 'var(--muted)',
  borderRadius: 18, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
};
