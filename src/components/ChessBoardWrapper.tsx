'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { ChessMove } from '@/types/openings';
import type { PieceDropHandlerArgs } from 'react-chessboard';

interface Props {
  line: ChessMove[];
  playerColor: 'w' | 'b';
  onComplete: (correct: boolean) => void;
  onMoveCorrect?: () => void;
  onMoveWrong?: () => void;
  showHint?: boolean;
  onMovesChange?: (moves: string[], currentMoveIndex: number) => void;
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Feedback = 'correct' | 'wrong' | null;

export default function ChessBoardWrapper({
  line,
  playerColor,
  onComplete,
  onMoveCorrect,
  onMoveWrong,
  showHint,
  onMovesChange,
}: Props) {
  const [chess] = useState(() => new Chess(INITIAL_FEN));
  const [fen, setFen] = useState(INITIAL_FEN);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);
  const isProcessing = useRef(false);

  // Whether it is currently the player's turn to move
  const isPlayerTurn =
    feedback === null &&
    currentMoveIndex < line.length &&
    line[currentMoveIndex].color === playerColor;

  // Auto-play a move from the line at the given index
  const autoPlayMove = useCallback(
    (index: number) => {
      if (index >= line.length) return;
      const move = line[index];
      chess.move({ from: move.from, to: move.to });
      setFen(chess.fen());
      setPlayedMoves((prev) => {
        const updated = [...prev, move.san];
        onMovesChange?.(updated, index + 1);
        return updated;
      });
      setCurrentMoveIndex(index + 1);
    },
    [chess, line, onMovesChange],
  );

  // On mount: if the player is black, auto-play the first (white) move
  useEffect(() => {
    if (playerColor === 'b' && line.length > 0 && line[0].color === 'w') {
      const timer = setTimeout(() => autoPlayMove(0), 400);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (!isPlayerTurn || isProcessing.current) return false;
      if (currentMoveIndex >= line.length) return false;
      if (!targetSquare) return false;

      const expected = line[currentMoveIndex];
      const isCorrect =
        sourceSquare === expected.from && targetSquare === expected.to;

      if (isCorrect) {
        isProcessing.current = true;

        chess.move({ from: sourceSquare, to: targetSquare });
        const newPlayedMoves = [...playedMoves, expected.san];
        setFen(chess.fen());
        setPlayedMoves(newPlayedMoves);
        const nextIndex = currentMoveIndex + 1;
        onMovesChange?.(newPlayedMoves, nextIndex);

        // Flash green on the moved squares
        setFeedback('correct');
        setSquareStyles({
          [sourceSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
          [targetSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
        });
        onMoveCorrect?.();

        setTimeout(() => {
          setFeedback(null);
          setSquareStyles({});

          if (nextIndex >= line.length) {
            setCurrentMoveIndex(nextIndex);
            isProcessing.current = false;
            onComplete(true);
            return;
          }

          setCurrentMoveIndex(nextIndex);

          // Auto-play opponent's response if the next move belongs to opponent
          const nextMove = line[nextIndex];
          if (nextMove && nextMove.color !== playerColor) {
            setTimeout(() => {
              chess.move({ from: nextMove.from, to: nextMove.to });
              setFen(chess.fen());
              setPlayedMoves((prev) => {
                const updated = [...prev, nextMove.san];
                onMovesChange?.(updated, nextIndex + 1);
                return updated;
              });
              setCurrentMoveIndex(nextIndex + 1);
              isProcessing.current = false;
            }, 500);
          } else {
            isProcessing.current = false;
          }
        }, 600);

        return true;
      } else {
        // Wrong move — flash red, highlight the correct squares in gold, then reset
        isProcessing.current = true;
        setFeedback('wrong');
        setSquareStyles({
          [sourceSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
          [targetSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
          [expected.from]: { background: 'rgba(214, 185, 126, 0.55)' },
          [expected.to]: { background: 'rgba(214, 185, 126, 0.55)' },
        });
        onMoveWrong?.();

        setTimeout(() => {
          setFeedback(null);
          setSquareStyles({});
          isProcessing.current = false;
        }, 1500);

        return false;
      }
    },
    [
      isPlayerTurn,
      currentMoveIndex,
      line,
      chess,
      playedMoves,
      playerColor,
      onComplete,
      onMoveCorrect,
      onMoveWrong,
      onMovesChange,
    ],
  );

  // Compute hint overlay styles
  const displaySquareStyles = (showHint && isPlayerTurn && feedback === null && currentMoveIndex < line.length)
    ? {
        ...squareStyles,
        [line[currentMoveIndex].from]: { background: 'rgba(120, 200, 120, 0.5)' },
        [line[currentMoveIndex].to]:   { background: 'rgba(60, 180, 60, 0.75)' },
      }
    : squareStyles;

  const feedbackIcon =
    feedback === 'correct' ? '✓' : feedback === 'wrong' ? '✗' : null;

  const feedbackText =
    feedback === 'correct'
      ? 'Верно!'
      : feedback === 'wrong'
        ? 'Неверный ход — правильный выделен золотым'
        : isPlayerTurn
          ? 'Ваш ход'
          : currentMoveIndex >= line.length
            ? 'Линия завершена!'
            : 'Соперник думает…';

  const feedbackBg =
    feedback === 'correct'
      ? 'bg-[#1C2D1F] border-[#3A6B44]'
      : feedback === 'wrong'
        ? 'bg-[#2D1C1C] border-[#6B3A3A]'
        : 'bg-[#15130F] border-[#2A2722]';

  const feedbackColor =
    feedback === 'correct'
      ? 'text-[#9BD3A6]'
      : feedback === 'wrong'
        ? 'text-[#D36B6B]'
        : 'text-[#B3AC9F]';

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Board — always square, max 600px */}
      <div className="w-full max-w-[600px] aspect-square rounded-[16px] overflow-hidden border border-[#2A2722]">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: playerColor === 'w' ? 'white' : 'black',
            onPieceDrop: handlePieceDrop,
            squareStyles: displaySquareStyles,
            allowDragging: isPlayerTurn,
            boardStyle: { borderRadius: '0', width: '100%', height: '100%' },
            darkSquareStyle: { backgroundColor: '#4A3F30' },
            lightSquareStyle: { backgroundColor: '#C9A96E' },
          }}
        />
      </div>

      {/* Feedback bar */}
      <div
        className={`w-full max-w-[600px] h-11 rounded-[12px] border px-5 text-[15px] font-medium transition-all duration-300 flex items-center gap-3 ${feedbackBg} ${feedbackColor}`}
      >
        {feedbackIcon && (
          <span className="text-[17px] font-bold leading-none shrink-0">{feedbackIcon}</span>
        )}
        {!feedbackIcon && (
          <span className="text-[17px] leading-none shrink-0 opacity-60">
            {isPlayerTurn ? '○' : currentMoveIndex >= line.length ? '✓' : '…'}
          </span>
        )}
        <span>{feedbackText}</span>
      </div>
    </div>
  );
}
