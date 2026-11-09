'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import type { Opening, OpeningLine, ChessMove } from '@/types/openings';

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'loading' | 'ready' | 'playing' | 'line_done' | 'free_play' | 'game_over';

type MsgType = 'info' | 'success' | 'error' | 'trainer' | 'system' | 'choice';

interface ChatMessage {
  id: number;
  type: MsgType;
  text: string;
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
}

interface OpeningWithLines extends Opening {
  lines: OpeningLine[];
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const DIFFICULTY_PRESETS = [
  { label: 'Новичок', level: 4 },
  { label: 'Любитель', level: 8 },
  { label: 'Мастер', level: 15 },
];

let msgCounter = 0;
function makeMsg(
  type: MsgType,
  text: string,
  choiceA?: string,
  choiceB?: string,
  choiceC?: string,
): ChatMessage {
  return { id: ++msgCounter, type, text, choiceA, choiceB, choiceC };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveColor(op: Opening): 'w' | 'b' {
  if (op.color === 'white') return 'w';
  if (op.color === 'black') return 'b';
  return Math.random() < 0.5 ? 'w' : 'b';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatLineFull(moves: ChessMove[]): string {
  const parts: string[] = [];
  moves.forEach((m, i) => {
    if (m.color === 'w') parts.push(`${Math.floor(i / 2) + 1}.`);
    else if (i === 0) parts.push(`${Math.floor(i / 2) + 1}...`);
    parts.push(m.san);
  });
  return parts.join(' ');
}

// ── Line Notation Strip ────────────────────────────────────────────────────────

function LineNotationStrip({
  moves,
  currentIndex,
}: {
  moves: ChessMove[];
  currentIndex: number;
}) {
  const activeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentIndex]);

  if (moves.length === 0) return null;

  const tokens: Array<{ text: string; moveIdx: number | null }> = [];
  moves.forEach((m, i) => {
    if (m.color === 'w') tokens.push({ text: `${Math.floor(i / 2) + 1}.`, moveIdx: null });
    else if (i === 0) tokens.push({ text: `${Math.floor(i / 2) + 1}...`, moveIdx: null });
    tokens.push({ text: m.san, moveIdx: i });
  });

  return (
    <div className="overflow-x-auto scrollbar-none flex items-center gap-[3px] py-1 px-3 min-h-[32px]">
      {tokens.map((t, idx) => {
        if (t.moveIdx === null) {
          return (
            <span key={idx} className="text-[11px] text-[#404040] flex-shrink-0 select-none">
              {t.text}
            </span>
          );
        }
        const mi = t.moveIdx;
        const isDone = mi < currentIndex;
        const isActive = mi === currentIndex;
        return (
          <span
            key={idx}
            ref={isActive ? activeRef : undefined}
            className={`text-[12px] flex-shrink-0 font-mono px-[5px] py-[1px] rounded-full transition-all ${
              isActive
                ? 'bg-[#F5F5F5] text-[#050505] font-semibold'
                : isDone
                ? 'text-[#404040]'
                : 'text-[#2A2A2A]'
            }`}
          >
            {t.text}
          </span>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RandomOpeningPage() {
  const [phase, setPhase] = useState<GamePhase>('loading');
  const [allOpenings, setAllOpenings] = useState<OpeningWithLines[]>([]);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>('');
  const [currentOpening, setCurrentOpening] = useState<Opening | null>(null);
  const [currentLine, setCurrentLine] = useState<ChessMove[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState<number>(0);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [difficultyIdx, setDifficultyIdx] = useState<number>(1); // default: Любитель

  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(INITIAL_FEN);
  const [moveIndex, setMoveIndex] = useState(0);
  const [boardKey, setBoardKey] = useState(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});
  const [showHint, setShowHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isProcessingRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Store for "same line again" replay
  const savedLineRef = useRef<{ line: ChessMove[]; opening: Opening; lineIdx: number } | null>(null);

  const { getBestMove, setSkillLevel, isReady: sfReady } = useStockfish();

  // ── Load all openings + lines ─────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: openingsData } = await supabase
        .from('openings')
        .select('*')
        .order('created_at', { ascending: false });

      if (!openingsData || openingsData.length === 0) {
        setAllOpenings([]);
        setPhase('ready');
        return;
      }

      const ids = openingsData.map((o) => o.id);
      const { data: linesData } = await supabase
        .from('opening_lines')
        .select('*')
        .in('opening_id', ids)
        .order('line_index');

      const linesMap: Record<string, OpeningLine[]> = {};
      (linesData ?? []).forEach((l) => {
        (linesMap[l.opening_id] ??= []).push(l as OpeningLine);
      });

      const withLines: OpeningWithLines[] = (openingsData as Opening[])
        .map((o) => ({ ...o, lines: linesMap[o.id] ?? [] }))
        .filter((o) => o.lines.length > 0);

      setAllOpenings(withLines);
      setPhase('ready');
    }

    load();
  }, []);

  // ── Auto-scroll chat ──────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Apply difficulty on mount ─────────────────────────────────────────────

  useEffect(() => {
    setSkillLevel(DIFFICULTY_PRESETS[difficultyIdx].level);
  }, [difficultyIdx, setSkillLevel]);

  // ── Add message ───────────────────────────────────────────────────────────

  const addMsg = useCallback(
    (type: MsgType, text: string, choiceA?: string, choiceB?: string, choiceC?: string) => {
      setMessages((prev) => [...prev, makeMsg(type, text, choiceA, choiceB, choiceC)]);
    },
    [],
  );

  // ── Handle game over state ────────────────────────────────────────────────

  const handleGameOverState = useCallback(
    (pc: 'w' | 'b') => {
      setPhase('game_over');
      const chess = chessRef.current;
      let result = '';
      if (chess.isCheckmate()) {
        result = chess.turn() === pc ? 'Мат! Стокфиш выиграл.' : 'Мат! Ты выиграл! 🏆';
      } else if (chess.isDraw()) {
        result = 'Ничья!';
      } else {
        result = 'Игра завершена.';
      }
      setMessages((prev) => [
        ...prev,
        makeMsg('system', result),
        makeMsg('choice', 'Сыграть ещё?', 'Новая линия'),
      ]);
    },
    [],
  );

  // ── Request Stockfish move ────────────────────────────────────────────────

  const requestStockfishMove = useCallback(
    (currentFen: string, pc: 'w' | 'b') => {
      getBestMove(currentFen, 12, (uciMove) => {
        const from = uciMove.slice(0, 2) as `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'}`;
        const to = uciMove.slice(2, 4) as typeof from;
        const promotion = uciMove[4] as 'q' | 'r' | 'b' | 'n' | undefined;

        setTimeout(() => {
          try {
            const move = chessRef.current.move({ from, to, promotion });
            if (move) {
              setFen(chessRef.current.fen());

              if (chessRef.current.isGameOver()) {
                handleGameOverState(pc);
              }
            }
          } catch {
            // ignore invalid move from engine
          }
          isProcessingRef.current = false;
        }, 350);
      });
    },
    [getBestMove, handleGameOverState],
  );

  // ── Handle line complete ──────────────────────────────────────────────────

  const handleLineDone = useCallback(() => {
    setPhase('line_done');
    setMessages((prev) => [
      ...prev,
      makeMsg('success', 'Дебют пройден! Отличная работа.'),
      makeMsg(
        'choice',
        'Что дальше?',
        'Продолжить партию',
        'Та же линия',
        'Новая линия',
      ),
    ]);
  }, []);

  // ── Trainer auto-plays opponent move from line ────────────────────────────

  const autoTrainerMove = useCallback(
    (index: number, line: ChessMove[], color: 'w' | 'b') => {
      if (index >= line.length) return false;
      const m = line[index];
      if (m.color === color) return false;

      isProcessingRef.current = true;
      setTimeout(() => {
        chessRef.current.move({ from: m.from, to: m.to });
        setFen(chessRef.current.fen());
        const nextIdx = index + 1;
        setMoveIndex(nextIdx);
        isProcessingRef.current = false;

        if (nextIdx >= line.length) {
          handleLineDone();
        }
      }, 350);

      return true;
    },
    [handleLineDone],
  );

  // ── Core start-game logic (shared by startGame and replayLine) ───────────

  const launchLine = useCallback(
    (opening: OpeningWithLines, line: OpeningLine, lineIdx: number) => {
      const moves = line.moves as ChessMove[];
      const color = resolveColor(opening);

      chessRef.current = new Chess();
      isProcessingRef.current = false;

      savedLineRef.current = { line: moves, opening, lineIdx };

      setCurrentOpening(opening);
      setCurrentLine(moves);
      setCurrentLineIdx(lineIdx);
      setPlayerColor(color);
      setFen(INITIAL_FEN);
      setMoveIndex(0);
      setSquareStyles({});
      setShowHint(false);
      setBoardKey((k) => k + 1);
      setMessages([
        makeMsg('system', opening.name),
        makeMsg(
          'info',
          `Линия ${lineIdx + 1} из ${opening.lines.length}. Ты играешь ${color === 'w' ? 'белыми ♙' : 'чёрными ♟'}. Следуй дебютной линии.`,
        ),
      ]);
      setPhase('playing');

      if (color === 'b' && moves.length > 0 && moves[0].color === 'w') {
        isProcessingRef.current = true;
        setTimeout(() => {
          const m = moves[0];
          chessRef.current.move({ from: m.from, to: m.to });
          setFen(chessRef.current.fen());
          setMoveIndex(1);
          isProcessingRef.current = false;
        }, 500);
      }
    },
    [],
  );

  // ── Start new game ────────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    if (allOpenings.length === 0) return;

    let opening: OpeningWithLines;
    if (selectedOpeningId) {
      const found = allOpenings.find((o) => o.id === selectedOpeningId);
      opening = found ?? pickRandom(allOpenings);
    } else {
      opening = pickRandom(allOpenings);
    }

    const lineIdx = Math.floor(Math.random() * opening.lines.length);
    const line = opening.lines[lineIdx];
    launchLine(opening, line, lineIdx);
  }, [allOpenings, selectedOpeningId, launchLine]);

  // ── Replay the same line ──────────────────────────────────────────────────

  const replayLine = useCallback(() => {
    const saved = savedLineRef.current;
    if (!saved) { startGame(); return; }
    const opening = allOpenings.find((o) => o.id === saved.opening.id);
    if (!opening) { startGame(); return; }
    const line = opening.lines[saved.lineIdx];
    if (!line) { startGame(); return; }
    launchLine(opening, line, saved.lineIdx);
  }, [allOpenings, launchLine, startGame]);

  // ── Opening phase piece drop ──────────────────────────────────────────────

  const handleOpeningDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (isProcessingRef.current) return false;
      if (!targetSquare) return false;
      if (moveIndex >= currentLine.length) return false;

      const expected = currentLine[moveIndex];
      if (expected.color !== playerColor) return false;

      if (sourceSquare === expected.from && targetSquare === expected.to) {
        isProcessingRef.current = true;

        chessRef.current.move({ from: sourceSquare, to: targetSquare });
        const nextIdx = moveIndex + 1;
        setFen(chessRef.current.fen());
        setMoveIndex(nextIdx);

        setSquareStyles({
          [sourceSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
          [targetSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
        });

        setTimeout(() => {
          setSquareStyles({});

          if (nextIdx >= currentLine.length) {
            isProcessingRef.current = false;
            handleLineDone();
            return;
          }

          const nextMove = currentLine[nextIdx];
          if (nextMove && nextMove.color !== playerColor) {
            autoTrainerMove(nextIdx, currentLine, playerColor);
          } else {
            isProcessingRef.current = false;
          }
        }, 280);

        return true;
      } else {
        // Wrong move
        isProcessingRef.current = true;

        setSquareStyles({
          [sourceSquare]: { background: 'rgba(211, 107, 107, 0.4)' },
          [targetSquare]: { background: 'rgba(211, 107, 107, 0.4)' },
          [expected.from]: { background: 'rgba(214, 185, 126, 0.5)' },
          [expected.to]: { background: 'rgba(214, 185, 126, 0.5)' },
        });

        addMsg('error', `Ошибка! Правильный ход: ${expected.san}`);

        setTimeout(() => {
          setSquareStyles({});
          isProcessingRef.current = false;
        }, 900);

        return false;
      }
    },
    [moveIndex, currentLine, playerColor, handleLineDone, autoTrainerMove, addMsg],
  );

  // ── Free play piece drop ──────────────────────────────────────────────────

  const handleFreePlayDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (isProcessingRef.current || !sfReady) return false;
      if (!targetSquare) return false;

      try {
        const move = chessRef.current.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: 'q',
        });
        if (!move) return false;

        isProcessingRef.current = true;
        const newFen = chessRef.current.fen();
        setFen(newFen);

        if (chessRef.current.isGameOver()) {
          handleGameOverState(playerColor);
          isProcessingRef.current = false;
          return true;
        }

        requestStockfishMove(newFen, playerColor);
        return true;
      } catch {
        return false;
      }
    },
    [sfReady, requestStockfishMove, handleGameOverState, playerColor],
  );

  // ── Main piece drop router ────────────────────────────────────────────────

  const handlePieceDrop = useCallback(
    (args: PieceDropHandlerArgs): boolean => {
      if (phase === 'playing') return handleOpeningDrop(args);
      if (phase === 'free_play') return handleFreePlayDrop(args);
      return false;
    },
    [phase, handleOpeningDrop, handleFreePlayDrop],
  );

  // ── Continue with Stockfish ───────────────────────────────────────────────

  const continueWithStockfish = useCallback(() => {
    setPhase('free_play');
    addMsg('info', sfReady ? 'Стокфиш подключён. Играй дальше!' : 'Стокфиш загружается…');

    if (chessRef.current.turn() !== playerColor) {
      isProcessingRef.current = true;
      requestStockfishMove(chessRef.current.fen(), playerColor);
    }
  }, [sfReady, playerColor, requestStockfishMove, addMsg]);

  // ── Undo ──────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (phase !== 'playing') return;
    if (isProcessingRef.current) return;

    const played = currentLine.slice(0, moveIndex);
    const playerMoves = played.filter((m) => m.color === playerColor);
    if (playerMoves.length === 0) return;

    let newIdx = moveIndex;
    let undoCount = 0;

    if (newIdx > 0 && currentLine[newIdx - 1].color !== playerColor) {
      chessRef.current.undo();
      newIdx--;
      undoCount++;
    }

    if (newIdx > 0 && currentLine[newIdx - 1].color === playerColor) {
      chessRef.current.undo();
      newIdx--;
      undoCount++;
    }

    if (undoCount === 0) return;

    setMoveIndex(newIdx);
    setFen(chessRef.current.fen());
    setSquareStyles({});
    addMsg('info', 'Ход отменён. Попробуй снова.');
  }, [phase, moveIndex, currentLine, playerColor, addMsg]);

  // ── Hint ──────────────────────────────────────────────────────────────────

  const handleHint = useCallback(() => {
    if (phase !== 'playing') return;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setShowHint(true);
    hintTimerRef.current = setTimeout(() => setShowHint(false), 2500);
    if (moveIndex < currentLine.length) {
      const m = currentLine[moveIndex];
      addMsg('info', `Подсказка: ${m.san}`);
    }
  }, [phase, moveIndex, currentLine, addMsg]);

  // ── Computed square styles with hint ─────────────────────────────────────

  const displaySquareStyles = (() => {
    if (
      showHint &&
      phase === 'playing' &&
      moveIndex < currentLine.length &&
      currentLine[moveIndex].color === playerColor
    ) {
      const m = currentLine[moveIndex];
      return {
        ...squareStyles,
        [m.from]: { background: 'rgba(120, 200, 120, 0.5)' },
        [m.to]: { background: 'rgba(60, 180, 60, 0.75)' },
      };
    }
    return squareStyles;
  })();

  const isPlayerTurn =
    phase === 'playing' &&
    !isProcessingRef.current &&
    moveIndex < currentLine.length &&
    currentLine[moveIndex]?.color === playerColor;

  const boardSize = 'min(calc(100vh - 148px), calc(100vw - 340px))';

  const progressPct =
    currentLine.length > 0 ? Math.round((moveIndex / currentLine.length) * 100) : 0;

  // ── Render: loading ───────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <main className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-[#505050] text-[14px]">Загрузка дебютов…</div>
      </main>
    );
  }

  // ── Render: ready (no openings) ───────────────────────────────────────────

  if (phase === 'ready' && allOpenings.length === 0) {
    return (
      <main className="max-w-[600px] mx-auto px-5 pt-16 pb-6 text-center">
        <div className="font-cormorant text-[40px] text-[#F5F5F5] mb-4">Нет дебютов</div>
        <p className="text-[15px] text-[#808080] mb-8">
          Сначала добавь дебютные линии в разделе «Дебюты».
        </p>
        <Link
          href="/openings"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#F5F5F5] text-[#050505] rounded-full text-[14px] font-semibold no-underline hover:bg-white transition-colors"
        >
          Перейти к дебютам
        </Link>
      </main>
    );
  }

  // ── Render: main game ─────────────────────────────────────────────────────

  return (
    <main className="h-[calc(100vh-64px)] overflow-hidden flex flex-col px-5 md:px-10 pt-5 pb-6">
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="flex items-start gap-6 w-full max-w-[1100px]">

          {/* ── Board column ── */}
          <div className="flex flex-col flex-shrink-0" style={{ width: boardSize }}>

            {/* Player color bar */}
            <div className="h-9 flex items-center gap-2 text-[13px] text-[#606060]">
              {phase === 'ready'
                ? <span>Выбери дебют и нажми «Начать игру»</span>
                : playerColor === 'w'
                  ? <><span className="text-[15px]">♙</span> Ты играешь белыми</>
                  : <><span className="text-[15px]">♟</span> Ты играешь чёрными</>
              }
            </div>

            <div className="h-[8px] flex-shrink-0" />

            {/* Board — always rendered, overlay on ready */}
            <div className="flex-shrink-0 relative" style={{ width: boardSize, height: boardSize }}>
              <Chessboard
                key={boardKey}
                options={{
                  position: fen,
                  boardOrientation: playerColor === 'w' ? 'white' : 'black',
                  onPieceDrop: handlePieceDrop,
                  squareStyles: displaySquareStyles,
                  allowDragging: isPlayerTurn || phase === 'free_play',
                  boardStyle: { borderRadius: '4px', width: '100%', height: '100%' },
                  darkSquareStyle: { backgroundColor: '#3A3A3A' },
                  lightSquareStyle: { backgroundColor: '#8A8A8A' },
                  showNotation: true,
                  darkSquareNotationStyle: { color: '#C8C8C8' },
                  lightSquareNotationStyle: { color: '#505050' },
                  alphaNotationStyle: { fontSize: '11px', fontWeight: '700' },
                  numericNotationStyle: { fontSize: '11px', fontWeight: '700' },
                }}
              />
              {phase === 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[4px]"
                  style={{ background: 'rgba(5,5,5,0.72)' }}>
                  <button
                    onClick={startGame}
                    className="px-10 py-4 bg-[#F5F5F5] text-[#050505] rounded-full text-[16px] font-semibold hover:bg-white transition-colors cursor-pointer shadow-lg"
                  >
                    Начать игру
                  </button>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="h-9 flex-shrink-0 flex items-center gap-2 mt-2 px-3 rounded-[8px] bg-[#0D0D0D] border border-[#1E1E1E] text-[13px] text-[#606060]">
              {phase === 'ready' && <span>Выбери дебют для тренировки</span>}
              {phase === 'playing' && (
                isPlayerTurn
                  ? <><span className="w-2 h-2 rounded-full bg-[#81C784] inline-block" /> Твой ход</>
                  : <><span className="w-2 h-2 rounded-full bg-[#808080] inline-block" /> Тренер думает…</>
              )}
              {phase === 'line_done' && (
                <><span className="w-2 h-2 rounded-full bg-[#FFD54F] inline-block" /> Дебют пройден</>
              )}
              {phase === 'free_play' && (
                sfReady
                  ? <><span className="w-2 h-2 rounded-full bg-[#64B5F6] inline-block" /> Стокфиш Ур.{DIFFICULTY_PRESETS[difficultyIdx].level}</>
                  : <><span className="w-2 h-2 rounded-full bg-[#808080] animate-pulse inline-block" /> Загрузка Стокфиша…</>
              )}
              {phase === 'game_over' && (
                <><span className="w-2 h-2 rounded-full bg-[#EF9A9A] inline-block" /> Игра завершена</>
              )}
            </div>
          </div>

          {/* ── Right panel ── */}
          <div
            className="flex-shrink-0 w-[280px] bg-[#0D0D0D] border border-[#262626] rounded-[20px] flex flex-col overflow-hidden"
            style={{ maxHeight: `calc(${boardSize} + 60px)` }}
          >
            {/* 1. Panel header */}
            <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-[#1A1A1A] flex-shrink-0">
              <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <span className="font-cormorant text-[19px] leading-tight text-[#F5F5F5] font-[500] truncate">
                  {currentOpening?.name ?? 'Дебют Рандом'}
                </span>
                <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#404040]">
                  {phase === 'free_play'
                    ? 'Свободная игра'
                    : phase === 'game_over'
                    ? 'Игра окончена'
                    : phase === 'line_done'
                    ? 'Дебют пройден'
                    : currentOpening
                    ? `Линия ${currentLineIdx + 1} из ${
                        allOpenings.find((o) => o.id === currentOpening.id)?.lines.length ?? '?'
                      }`
                    : 'Дебют · тренировка'}
                </span>
              </div>
              <Link
                href="/openings"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-[#262626] text-[#505050] hover:text-[#A0A0A0] hover:border-[#404040] transition-colors no-underline mt-0.5"
                title="К дебютам"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
              </Link>
            </div>

            {/* 2. Progress bar + move counter (only during 'playing') */}
            {phase === 'playing' && (
              <div className="px-4 pt-2 pb-1 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[#404040] font-semibold tracking-[0.1em] uppercase">Прогресс</span>
                  <span className="text-[10px] text-[#505050] font-mono">
                    Ход {moveIndex} / {currentLine.length}
                  </span>
                </div>
                <div className="w-full h-[3px] bg-[#1A1A1A] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F5F5F5] rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* 3. Line notation strip (visible when playing or line_done or free_play with a line) */}
            {currentLine.length > 0 && (phase === 'playing' || phase === 'line_done' || phase === 'free_play') && (
              <div className="flex-shrink-0 border-b border-[#1A1A1A] bg-[#0A0A0A]">
                <LineNotationStrip moves={currentLine} currentIndex={moveIndex} />
              </div>
            )}

            {/* Divider before chat */}
            <div className="flex-shrink-0 h-[1px] bg-[#131313]" />

            {/* 4. Chat (flex-1, scrollable) */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0">
              {messages.length === 0 && (
                <div className="text-[12px] text-[#404040] text-center py-4">
                  Начни игру, чтобы увидеть подсказки тренера
                </div>
              )}

              {messages.map((msg) => {
                if (msg.type === 'choice') {
                  return (
                    <div key={msg.id} className="flex flex-col gap-2 mt-1">
                      {msg.text && (
                        <span className="text-[12px] text-[#808080]">{msg.text}</span>
                      )}
                      <div className="flex flex-col gap-1.5">
                        {msg.choiceA && (
                          <button
                            onClick={() => {
                              if (msg.choiceA === 'Продолжить партию') continueWithStockfish();
                              else if (msg.choiceA === 'Новая линия') startGame();
                            }}
                            className="h-9 w-full border border-[#404040] text-[#E5E5E5] hover:border-[#FFFFFF] hover:bg-[#161616] rounded-full text-[12px] font-medium transition-colors bg-transparent cursor-pointer"
                          >
                            {msg.choiceA}
                          </button>
                        )}
                        {msg.choiceB && (
                          <button
                            onClick={() => {
                              if (msg.choiceB === 'Та же линия') replayLine();
                              else if (msg.choiceB === 'Новая линия') startGame();
                            }}
                            className="h-9 w-full border border-[#303030] text-[#A0A0A0] hover:border-[#505050] hover:text-[#D0D0D0] rounded-full text-[12px] transition-colors bg-transparent cursor-pointer"
                          >
                            {msg.choiceB}
                          </button>
                        )}
                        {msg.choiceC && (
                          <button
                            onClick={() => {
                              if (msg.choiceC === 'Новая линия') startGame();
                            }}
                            className="h-9 w-full border border-[#242424] text-[#606060] hover:border-[#404040] hover:text-[#A0A0A0] rounded-full text-[12px] transition-colors bg-transparent cursor-pointer"
                          >
                            {msg.choiceC}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                const styles: Record<MsgType, string> = {
                  system: 'text-[#F5F5F5] font-semibold text-[13px]',
                  success: 'text-[#81C784] text-[12px]',
                  error: 'text-[#EF9A9A] text-[12px]',
                  info: 'text-[#808080] text-[12px]',
                  trainer: 'text-[#A0A0A0] text-[12px]',
                  choice: '',
                };

                return (
                  <div
                    key={msg.id}
                    className={`leading-relaxed whitespace-pre-wrap ${styles[msg.type]}`}
                  >
                    {msg.text}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Divider before action area */}
            <div className="flex-shrink-0 h-[1px] bg-[#1A1A1A]" />

            {/* 5. Bottom action area */}
            <div className="px-4 pb-4 pt-3 flex flex-col gap-2 flex-shrink-0">

              {/* Hint + Undo (only during 'playing') */}
              {phase === 'playing' && (
                <div className="flex gap-2">
                  <button
                    onClick={handleHint}
                    className="flex-1 h-9 border border-[#303030] text-[#D0D0D0] hover:border-[#FFFFFF] rounded-full text-[12px] transition-colors bg-transparent cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                    Подсказка
                  </button>
                  <button
                    onClick={handleUndo}
                    className="flex-1 h-9 border border-[#303030] text-[#808080] hover:border-[#505050] hover:text-[#D0D0D0] rounded-full text-[12px] transition-colors bg-transparent cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                    </svg>
                    Отменить
                  </button>
                </div>
              )}

              {/* "Новая линия" — always visible except 'ready' */}
              {phase !== 'ready' && (
                <button
                  onClick={startGame}
                  className="h-9 w-full border border-[#303030] text-[#808080] hover:border-[#505050] hover:text-[#D0D0D0] rounded-full text-[12px] transition-colors bg-transparent cursor-pointer"
                >
                  Новая линия
                </button>
              )}

              {/* "Начать игру" — only on ready */}
              {phase === 'ready' && (
                <button
                  onClick={startGame}
                  className="h-10 w-full bg-[#F5F5F5] text-[#050505] hover:bg-white rounded-full text-[13px] font-semibold transition-colors cursor-pointer"
                >
                  Начать игру
                </button>
              )}

              {/* Opening selector */}
              <select
                value={selectedOpeningId}
                onChange={(e) => setSelectedOpeningId(e.target.value)}
                className="h-8 w-full bg-transparent border border-[#242424] text-[#505050] hover:border-[#404040] hover:text-[#808080] rounded-full text-[11px] px-3 transition-colors cursor-pointer appearance-none text-center"
                style={{ WebkitAppearance: 'none' }}
              >
                <option value="">Случайный дебют</option>
                {allOpenings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.eco_code ? `${o.eco_code} · ` : ''}{o.name}
                  </option>
                ))}
              </select>

              {/* Difficulty presets */}
              <div className="flex gap-1.5">
                {DIFFICULTY_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setDifficultyIdx(idx);
                      setSkillLevel(preset.level);
                    }}
                    className={`flex-1 h-7 rounded-full text-[10px] font-medium transition-colors cursor-pointer border ${
                      difficultyIdx === idx
                        ? 'bg-[#1E1E1E] border-[#404040] text-[#D0D0D0]'
                        : 'bg-transparent border-[#1E1E1E] text-[#404040] hover:border-[#303030] hover:text-[#808080]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
