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
  onStatusChange?: (status: {
    feedback: 'correct' | 'wrong' | null;
    isPlayerTurn: boolean;
    isComplete: boolean;
  }) => void;
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
  onStatusChange,
}: Props) {
  const [chess] = useState(() => new Chess(INITIAL_FEN));
  const [fen, setFen] = useState(INITIAL_FEN);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);
  const isProcessing = useRef(false);

  const isPlayerTurn =
    feedback === null &&
    currentMoveIndex < line.length &&
    line[currentMoveIndex].color === playerColor;

  const isComplete = currentMoveIndex >= line.length;

  useEffect(() => {
    onStatusChange?.({ feedback, isPlayerTurn, isComplete });
  }, [feedback, isPlayerTurn, isComplete, onStatusChange]);

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

  useEffect(() => {
    if (playerColor === 'b' && line.length > 0 && line[0].color === 'w') {
      const timer = setTimeout(() => autoPlayMove(0), 200);
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
            }, 200);
          } else {
            isProcessing.current = false;
          }
        }, 300);

        return true;
      } else {
        isProcessing.current = true;
        setFeedback('wrong');
        setSquareStyles({
          [sourceSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
          [targetSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
          [expected.from]: { background: 'rgba(214, 185, 126, 0.55)' },
          [expected.to]: { background: 'rgba(214, 185, 126, 0.55)' },
        });
        onMoveWrong?.();

        // Capture closure values for the replay — onComplete(false) branch
        // does not read hadWrongMove so stale closure is safe here
        const capturedLine = line;
        const capturedChess = chess;
        const capturedOnComplete = onComplete;
        const replayStartIndex = currentMoveIndex;

        function replayLine(index: number) {
          if (index >= capturedLine.length) {
            isProcessing.current = false;
            capturedOnComplete(false);
            return;
          }
          const move = capturedLine[index];
          capturedChess.move({ from: move.from, to: move.to });
          setFen(capturedChess.fen());
          setPlayedMoves((prev) => {
            const updated = [...prev, move.san];
            onMovesChange?.(updated, index + 1);
            return updated;
          });
          setCurrentMoveIndex(index + 1);
          setTimeout(() => replayLine(index + 1), 420);
        }

        setTimeout(() => {
          setFeedback(null);
          setSquareStyles({});
          replayLine(replayStartIndex);
        }, 1200);

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

  const displaySquareStyles =
    showHint && isPlayerTurn && feedback === null && currentMoveIndex < line.length
      ? {
          ...squareStyles,
          [line[currentMoveIndex].from]: { background: 'rgba(120, 200, 120, 0.5)' },
          [line[currentMoveIndex].to]: { background: 'rgba(60, 180, 60, 0.75)' },
        }
      : squareStyles;

  return (
    <div className="w-full h-full overflow-hidden border border-[#262626]" style={{ borderRadius: '4px' }}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: playerColor === 'w' ? 'white' : 'black',
          onPieceDrop: handlePieceDrop,
          squareStyles: displaySquareStyles,
          allowDragging: isPlayerTurn,
          boardStyle: { borderRadius: '0', width: '100%', height: '100%' },
          darkSquareStyle: { backgroundColor: '#3A3A3A' },
          lightSquareStyle: { backgroundColor: '#8A8A8A' },
          showNotation: true,
          darkSquareNotationStyle: { color: '#C8C8C8' },
          lightSquareNotationStyle: { color: '#505050' },
          alphaNotationStyle: { fontSize: '11px', fontWeight: '700' },
          numericNotationStyle: { fontSize: '11px', fontWeight: '700' },
        }}
      />
    </div>
  );
}
