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
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Feedback = 'correct' | 'wrong' | null;

export default function ChessBoardWrapper({
  line,
  playerColor,
  onComplete,
  onMoveCorrect,
  onMoveWrong,
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
      setPlayedMoves((prev) => [...prev, move.san]);
      setCurrentMoveIndex(index + 1);
    },
    [chess, line],
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
              setPlayedMoves((prev) => [...prev, nextMove.san]);
              setCurrentMoveIndex(nextIndex + 1);
              isProcessing.current = false;
            }, 300);
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
    ],
  );

  // Count how many player moves have been played
  const totalPlayerMoves = line.filter((m) => m.color === playerColor).length;
  const playerMovesPlayed = line
    .slice(0, currentMoveIndex)
    .filter((m) => m.color === playerColor).length;

  const feedbackText =
    feedback === 'correct'
      ? 'Верно!'
      : feedback === 'wrong'
        ? 'Неверный ход — правильный выделен золотым'
        : isPlayerTurn
          ? 'Ваш ход'
          : currentMoveIndex >= line.length
            ? 'Линия завершена!'
            : 'Соперник думает...';

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
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Move counter */}
      <div className="flex items-center gap-3 text-[13px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
        <span className="text-[#D6B97E]">
          Ход {Math.min(playerMovesPlayed + (isPlayerTurn ? 1 : 0), totalPlayerMoves)} из{' '}
          {totalPlayerMoves}
        </span>
        <span className="w-6 h-px bg-[#2A2722]" />
        <span>{playerColor === 'w' ? 'Вы играете белыми' : 'Вы играете чёрными'}</span>
      </div>

      {/* Board */}
      <div className="w-full max-w-[480px] rounded-[16px] overflow-hidden border border-[#2A2722]">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: playerColor === 'w' ? 'white' : 'black',
            onPieceDrop: handlePieceDrop,
            squareStyles,
            allowDragging: isPlayerTurn,
            boardStyle: { borderRadius: '0' },
            darkSquareStyle: { backgroundColor: '#4A3F30' },
            lightSquareStyle: { backgroundColor: '#C9A96E' },
          }}
        />
      </div>

      {/* Feedback bar */}
      <div
        className={`w-full max-w-[480px] rounded-[14px] border px-5 py-3 text-[14px] font-medium transition-all duration-300 ${feedbackBg} ${feedbackColor}`}
      >
        {feedbackText}
      </div>

      {/* Move list */}
      {playedMoves.length > 0 && (
        <div className="w-full max-w-[480px] bg-[#15130F] border border-[#2A2722] rounded-[14px] px-5 py-4">
          <div className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#B3AC9F] mb-3">
            Сыгранные ходы
          </div>
          <div className="flex flex-wrap gap-x-1 gap-y-1">
            {line.slice(0, currentMoveIndex).map((move, idx) => {
              const isWhiteMove = move.color === 'w';
              const moveNumber = Math.floor(idx / 2) + 1;
              const isLast = idx === currentMoveIndex - 1;
              return (
                <span key={idx} className="flex items-center gap-[2px]">
                  {isWhiteMove && (
                    <span className="text-[13px] text-[#5A5249] mr-[2px]">{moveNumber}.</span>
                  )}
                  <span
                    className={`text-[13px] font-mono px-[5px] py-[1px] rounded ${
                      isLast
                        ? 'bg-[#2A2218] text-[#D6B97E] font-semibold'
                        : 'text-[#B3AC9F]'
                    }`}
                  >
                    {move.san}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
