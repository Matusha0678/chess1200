'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { ChessMove } from '@/types/openings';
import type { PieceDropHandlerArgs } from 'react-chessboard';

interface Props {
  line: ChessMove[];
  playerColor: 'w' | 'b';
  onComplete: (correct: boolean, hadMistakes: boolean) => void;
  onMoveCorrect?: () => void;
  onMoveMistake?: (moveIndex: number) => void;
  showHint?: boolean;
  onMovesChange?: (moves: string[], currentMoveIndex: number) => void;
  onStatusChange?: (status: {
    feedback: 'correct' | 'wrong' | null;
    isPlayerTurn: boolean;
    isComplete: boolean;
    reviewsRemaining: number;
  }) => void;
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Feedback = 'correct' | 'wrong' | null;

export default function ChessBoardWrapper({
  line,
  playerColor,
  onComplete,
  onMoveCorrect,
  onMoveMistake,
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
  // Queue of move-indices to review after the line ends (positions where user made mistakes)
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  const mistakesRef = useRef<number[]>([]);
  const isProcessing = useRef(false);

  const inReview = reviewQueue.length > 0;

  const isPlayerTurn =
    feedback === null &&
    currentMoveIndex < line.length &&
    line[currentMoveIndex].color === playerColor;

  const isComplete = !inReview && currentMoveIndex >= line.length;

  useEffect(() => {
    onStatusChange?.({ feedback, isPlayerTurn, isComplete, reviewsRemaining: reviewQueue.length });
  }, [feedback, isPlayerTurn, isComplete, reviewQueue.length, onStatusChange]);

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
      if (isProcessing.current) return false;
      if (!targetSquare) return false;

      // ── Helpers ─────────────────────────────────────────────────────────────

      // After any move (correct or auto), handle opponent response + line end
      function continueFromIndex(nextIdx: number, currentMoves: string[]) {
        if (nextIdx >= line.length) {
          if (mistakesRef.current.length > 0) {
            // Enter review: reset board to first mistake position
            const firstIdx = mistakesRef.current[0];
            const fenBefore = firstIdx === 0 ? INITIAL_FEN : line[firstIdx - 1].fen;
            chess.load(fenBefore);
            setFen(fenBefore);
            const movesBefore = line.slice(0, firstIdx).map((m) => m.san);
            setPlayedMoves(movesBefore);
            onMovesChange?.(movesBefore, firstIdx);
            setCurrentMoveIndex(firstIdx);
            setReviewQueue([...mistakesRef.current]);
          } else {
            setCurrentMoveIndex(nextIdx);
            onComplete(true, false);
          }
          isProcessing.current = false;
          return;
        }
        const nextMove = line[nextIdx];
        if (nextMove.color !== playerColor) {
          // Auto-play opponent's move
          setTimeout(() => {
            chess.move({ from: nextMove.from, to: nextMove.to });
            setFen(chess.fen());
            const updated = [...currentMoves, nextMove.san];
            setPlayedMoves(updated);
            onMovesChange?.(updated, nextIdx + 1);
            setCurrentMoveIndex(nextIdx + 1);
            continueFromIndex(nextIdx + 1, updated);
          }, 300);
        } else {
          // Player's turn — wait for input
          isProcessing.current = false;
        }
      }

      // ── Review phase ────────────────────────────────────────────────────────
      if (inReview) {
        if (!isPlayerTurn) return false;
        const reviewIdx = reviewQueue[0];
        const expected = line[reviewIdx];
        const isCorrect = sourceSquare === expected.from && targetSquare === expected.to;

        isProcessing.current = true;

        if (isCorrect) {
          chess.move({ from: sourceSquare, to: targetSquare });
          setFen(chess.fen());
          const newMoves = [...playedMoves, expected.san];
          setPlayedMoves(newMoves);
          onMovesChange?.(newMoves, reviewIdx + 1);
          setFeedback('correct');
          setSquareStyles({
            [sourceSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
            [targetSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
          });

          setTimeout(() => {
            setFeedback(null);
            setSquareStyles({});
            const remaining = reviewQueue.slice(1);
            if (remaining.length === 0) {
              setReviewQueue([]);
              isProcessing.current = false;
              onComplete(true, true);
            } else {
              const nextIdx = remaining[0];
              const fenBefore = nextIdx === 0 ? INITIAL_FEN : line[nextIdx - 1].fen;
              chess.load(fenBefore);
              setFen(fenBefore);
              const movesBefore = line.slice(0, nextIdx).map((m) => m.san);
              setPlayedMoves(movesBefore);
              onMovesChange?.(movesBefore, nextIdx);
              setCurrentMoveIndex(nextIdx);
              setReviewQueue(remaining);
              isProcessing.current = false;
            }
          }, 400);

          return true;
        } else {
          // Wrong in review: show correct, auto-make, advance to next
          setFeedback('wrong');
          setSquareStyles({
            [sourceSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
            [targetSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
            [expected.from]: { background: 'rgba(214, 185, 126, 0.55)' },
            [expected.to]: { background: 'rgba(214, 185, 126, 0.55)' },
          });

          setTimeout(() => {
            setFeedback(null);
            setSquareStyles({});
            chess.move({ from: expected.from, to: expected.to });
            setFen(chess.fen());
            const newMoves = [...playedMoves, expected.san];
            setPlayedMoves(newMoves);
            onMovesChange?.(newMoves, reviewIdx + 1);

            const remaining = reviewQueue.slice(1);
            if (remaining.length === 0) {
              setReviewQueue([]);
              isProcessing.current = false;
              onComplete(true, true);
            } else {
              const nextIdx = remaining[0];
              const fenBefore = nextIdx === 0 ? INITIAL_FEN : line[nextIdx - 1].fen;
              chess.load(fenBefore);
              setFen(fenBefore);
              const movesBefore = line.slice(0, nextIdx).map((m) => m.san);
              setPlayedMoves(movesBefore);
              onMovesChange?.(movesBefore, nextIdx);
              setCurrentMoveIndex(nextIdx);
              setReviewQueue(remaining);
              isProcessing.current = false;
            }
          }, 1200);

          return false;
        }
      }

      // ── Normal play phase ───────────────────────────────────────────────────
      if (!isPlayerTurn) return false;
      if (currentMoveIndex >= line.length) return false;

      const expected = line[currentMoveIndex];
      const isCorrect = sourceSquare === expected.from && targetSquare === expected.to;

      if (isCorrect) {
        isProcessing.current = true;
        chess.move({ from: sourceSquare, to: targetSquare });
        const newMoves = [...playedMoves, expected.san];
        setFen(chess.fen());
        setPlayedMoves(newMoves);
        const nextIdx = currentMoveIndex + 1;
        onMovesChange?.(newMoves, nextIdx);
        setFeedback('correct');
        setSquareStyles({
          [sourceSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
          [targetSquare]: { background: 'rgba(155, 211, 166, 0.45)' },
        });
        onMoveCorrect?.();
        setCurrentMoveIndex(nextIdx);

        setTimeout(() => {
          setFeedback(null);
          setSquareStyles({});
          continueFromIndex(nextIdx, newMoves);
        }, 300);

        return true;
      } else {
        // Wrong: record mistake, show correct, auto-make, then continue
        isProcessing.current = true;
        mistakesRef.current = [...mistakesRef.current, currentMoveIndex];
        onMoveMistake?.(currentMoveIndex);

        setFeedback('wrong');
        setSquareStyles({
          [sourceSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
          [targetSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
          [expected.from]: { background: 'rgba(214, 185, 126, 0.55)' },
          [expected.to]: { background: 'rgba(214, 185, 126, 0.55)' },
        });

        const mistakeIdx = currentMoveIndex;
        setTimeout(() => {
          setFeedback(null);
          setSquareStyles({});
          // Auto-make the correct move on behalf of the user
          chess.move({ from: expected.from, to: expected.to });
          setFen(chess.fen());
          const newMoves = [...playedMoves, expected.san];
          setPlayedMoves(newMoves);
          const nextIdx = mistakeIdx + 1;
          onMovesChange?.(newMoves, nextIdx);
          setCurrentMoveIndex(nextIdx);
          continueFromIndex(nextIdx, newMoves);
        }, 1200);

        return false;
      }
    },
    [
      inReview,
      reviewQueue,
      isPlayerTurn,
      currentMoveIndex,
      line,
      chess,
      playedMoves,
      playerColor,
      onComplete,
      onMoveCorrect,
      onMoveMistake,
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
