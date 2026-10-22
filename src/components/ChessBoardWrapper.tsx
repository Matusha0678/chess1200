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
    ],
  );

  // Count how many player moves have been played / remain
  const totalPlayerMoves = line.filter((m) => m.color === playerColor).length;
  const playerMovesPlayed = line
    .slice(0, currentMoveIndex)
    .filter((m) => m.color === playerColor).length;
  // Current move number: moves played + 1, capped at total
  const currentMoveNumber = Math.min(
    playerMovesPlayed + (currentMoveIndex < line.length ? 1 : 0),
    totalPlayerMoves,
  );

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
      {/* Move counter + color label */}
      <div className="flex flex-col items-center gap-1 w-full max-w-[520px]">
        <div className="flex items-center gap-2">
          <span className="font-cormorant text-[32px] leading-none text-[#D6B97E] font-[500]">
            Ход {currentMoveNumber}
          </span>
          <span className="font-cormorant text-[32px] leading-none text-[#5A5249] font-[400]">
            / {totalPlayerMoves}
          </span>
        </div>
        <div className="text-[14px] text-[#B3AC9F]">
          {playerColor === 'w' ? 'Вы играете белыми' : 'Вы играете чёрными'}
        </div>
      </div>

      {/* Board — always square, max 520px */}
      <div className="w-full max-w-[520px] aspect-square rounded-[16px] overflow-hidden border border-[#2A2722]">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: playerColor === 'w' ? 'white' : 'black',
            onPieceDrop: handlePieceDrop,
            squareStyles,
            allowDragging: isPlayerTurn,
            boardStyle: { borderRadius: '0', width: '100%', height: '100%' },
            darkSquareStyle: { backgroundColor: '#4A3F30' },
            lightSquareStyle: { backgroundColor: '#C9A96E' },
          }}
        />
      </div>

      {/* Feedback bar */}
      <div
        className={`w-full max-w-[520px] rounded-[14px] border px-5 py-4 text-[15px] font-medium transition-all duration-300 flex items-center gap-3 ${feedbackBg} ${feedbackColor}`}
      >
        {feedbackIcon && (
          <span className="text-[18px] font-bold leading-none shrink-0">{feedbackIcon}</span>
        )}
        {!feedbackIcon && (
          <span className="text-[18px] leading-none shrink-0 opacity-60">
            {isPlayerTurn ? '○' : currentMoveIndex >= line.length ? '✓' : '…'}
          </span>
        )}
        <span>{feedbackText}</span>
      </div>

      {/* Move list */}
      {playedMoves.length > 0 && (
        <div className="w-full max-w-[520px] bg-[#15130F] border border-[#2A2722] rounded-[14px] px-5 py-4">
          <div className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#B3AC9F] mb-3">
            Сыгранные ходы
          </div>
          {/* Two-column grid: move number | white move | black move */}
          <div className="flex flex-col gap-[3px]">
            {Array.from(
              { length: Math.ceil(line.slice(0, currentMoveIndex).length / 2) },
              (_, pairIdx) => {
                const whiteIdx = pairIdx * 2;
                const blackIdx = pairIdx * 2 + 1;
                const whiteMove = line[whiteIdx] as ChessMove | undefined;
                const blackMove = line[blackIdx] as ChessMove | undefined;
                const isLastWhite = whiteIdx === currentMoveIndex - 1;
                const isLastBlack = blackIdx === currentMoveIndex - 1;
                const whiteIsDisplayed = whiteIdx < currentMoveIndex;
                const blackIsDisplayed = blackIdx < currentMoveIndex;
                return (
                  <div key={pairIdx} className="grid grid-cols-[28px_1fr_1fr] gap-x-2 items-center">
                    <span className="text-[13px] text-[#5A5249] text-right">{pairIdx + 1}.</span>
                    <span
                      className={`text-[14px] font-mono px-[6px] py-[2px] rounded ${
                        whiteIsDisplayed
                          ? isLastWhite
                            ? 'bg-[#2A2218] text-[#D6B97E] font-semibold'
                            : 'text-[#B3AC9F]'
                          : ''
                      }`}
                    >
                      {whiteIsDisplayed && whiteMove ? whiteMove.san : ''}
                    </span>
                    <span
                      className={`text-[14px] font-mono px-[6px] py-[2px] rounded ${
                        blackIsDisplayed
                          ? isLastBlack
                            ? 'bg-[#2A2218] text-[#D6B97E] font-semibold'
                            : 'text-[#B3AC9F]'
                          : ''
                      }`}
                    >
                      {blackIsDisplayed && blackMove ? blackMove.san : ''}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}
    </div>
  );
}
