'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { ChessMove } from '@/types/openings';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { playMove, playCapture, playCorrect, playWrong, playComplete } from '@/lib/sounds';

interface Props {
  line: ChessMove[];
  playerColor: 'w' | 'b';
  onComplete: (correct: boolean, hadMistakes: boolean) => void;
  onMoveCorrect?: () => void;
  onMoveMistake?: (moveIndex: number) => void;
  showHint?: boolean;
  flipBoard?: boolean;
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
  flipBoard,
  onMovesChange,
  onStatusChange,
}: Props) {
  const { boardTheme, customPieces, showNotation: notationEnabled, animationMs, soundEnabled, boardThemeId, pieceStyleId } = useBoardTheme();
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const [chess] = useState(() => new Chess(INITIAL_FEN));
  const [fen, setFen] = useState(INITIAL_FEN);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  const mistakesRef = useRef<number[]>([]);
  const isProcessing = useRef(false);
  const premoveRef = useRef<{ from: string; to: string } | null>(null);
  const [premoveSquares, setPremoveSquares] = useState<Record<string, React.CSSProperties>>({});

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
      const result = chess.move({ from: move.from, to: move.to });
      if (soundRef.current) result?.captured ? playCapture() : playMove();
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

  const cancelPremove = useCallback(() => {
    premoveRef.current = null;
    setPremoveSquares({});
  }, []);

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (!targetSquare) return false;

      // ── Premove: queue a move while the opponent is responding ───────────────
      // Allow premoves whenever it's NOT the player's turn (and not in review)
      if (!inReview && !isPlayerTurn && !isComplete) {
        premoveRef.current = { from: sourceSquare, to: targetSquare };
        setPremoveSquares({
          [sourceSquare]: { background: 'rgba(100, 150, 255, 0.3)' },
          [targetSquare]: { background: 'rgba(100, 150, 255, 0.52)' },
        });
        return false; // snap piece back; blue highlights show the queued premove
      }

      if (isProcessing.current) return false;

      // ── Helpers ─────────────────────────────────────────────────────────────

      // Validate a premove using a temporary chess instance so we don't mutate
      // the main board. Returns the SAN string if legal, null otherwise.
      function validatePremoveSan(from: string, to: string): string | null {
        try {
          const temp = new Chess(chess.fen());
          const result = temp.move({ from, to });
          return result ? result.san : null;
        } catch {
          return null;
        }
      }

      function continueFromIndex(nextIdx: number, currentMoves: string[]) {
        if (nextIdx >= line.length) {
          if (mistakesRef.current.length > 0) {
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
            if (soundRef.current) playComplete();
            onComplete(true, false);
          }
          isProcessing.current = false;
          return;
        }
        const nextMove = line[nextIdx];
        if (nextMove.color !== playerColor) {
          setTimeout(() => {
            const r = chess.move({ from: nextMove.from, to: nextMove.to });
            if (soundRef.current) r?.captured ? playCapture() : playMove();
            setFen(chess.fen());
            const updated = [...currentMoves, nextMove.san];
            setPlayedMoves(updated);
            onMovesChange?.(updated, nextIdx + 1);
            setCurrentMoveIndex(nextIdx + 1);
            continueFromIndex(nextIdx + 1, updated);
          }, 300);
        } else {
          // Player's turn — execute queued premove or wait for input
          const pm = premoveRef.current;
          if (pm) {
            premoveRef.current = null;
            setPremoveSquares({});
            setTimeout(() => {
              const expected = line[nextIdx];
              const san = validatePremoveSan(pm.from, pm.to);
              const isCorrect = san !== null && san === expected.san;

              if (isCorrect) {
                const r = chess.move({ from: pm.from, to: pm.to });
                if (soundRef.current) r?.captured ? playCapture() : playMove();
                const newMoves = [...currentMoves, expected.san];
                setFen(chess.fen());
                setPlayedMoves(newMoves);
                onMovesChange?.(newMoves, nextIdx + 1);
                setFeedback('correct');
                if (soundRef.current) playCorrect();
                setSquareStyles({
                  [pm.from]: { background: 'rgba(155, 211, 166, 0.45)' },
                  [pm.to]: { background: 'rgba(155, 211, 166, 0.45)' },
                });
                onMoveCorrect?.();
                setCurrentMoveIndex(nextIdx + 1);
                setTimeout(() => {
                  setFeedback(null);
                  setSquareStyles({});
                  continueFromIndex(nextIdx + 1, newMoves);
                }, 300);
              } else {
                // Wrong premove — record mistake, show correction
                mistakesRef.current = [...mistakesRef.current, nextIdx];
                onMoveMistake?.(nextIdx);
                setFeedback('wrong');
                if (soundRef.current) playWrong();
                setSquareStyles({
                  [pm.from]: { background: 'rgba(211, 107, 107, 0.45)' },
                  [pm.to]: { background: 'rgba(211, 107, 107, 0.45)' },
                  [expected.from]: { background: 'rgba(214, 185, 126, 0.55)' },
                  [expected.to]: { background: 'rgba(214, 185, 126, 0.55)' },
                });
                const afterWrong = nextIdx + 1;
                setTimeout(() => {
                  setFeedback(null);
                  setSquareStyles({});
                  const r = chess.move({ from: expected.from, to: expected.to });
                  if (soundRef.current) r?.captured ? playCapture() : playMove();
                  setFen(chess.fen());
                  const newMoves2 = [...currentMoves, expected.san];
                  setPlayedMoves(newMoves2);
                  onMovesChange?.(newMoves2, afterWrong);
                  setCurrentMoveIndex(afterWrong);
                  continueFromIndex(afterWrong, newMoves2);
                }, 1200);
              }
            }, 50);
          } else {
            isProcessing.current = false;
          }
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
          const r1 = chess.move({ from: sourceSquare, to: targetSquare });
          if (soundRef.current) r1?.captured ? playCapture() : playMove();
          setFen(chess.fen());
          const newMoves = [...playedMoves, expected.san];
          setPlayedMoves(newMoves);
          onMovesChange?.(newMoves, reviewIdx + 1);
          setFeedback('correct');
          if (soundRef.current) playCorrect();
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
              setCurrentMoveIndex(line.length);
              isProcessing.current = false;
              if (soundRef.current) playComplete();
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
          setFeedback('wrong');
          if (soundRef.current) playWrong();
          setSquareStyles({
            [sourceSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
            [targetSquare]: { background: 'rgba(211, 107, 107, 0.45)' },
            [expected.from]: { background: 'rgba(214, 185, 126, 0.55)' },
            [expected.to]: { background: 'rgba(214, 185, 126, 0.55)' },
          });

          setTimeout(() => {
            setFeedback(null);
            setSquareStyles({});
            const r2 = chess.move({ from: expected.from, to: expected.to });
            if (soundRef.current) r2?.captured ? playCapture() : playMove();
            setFen(chess.fen());
            const newMoves = [...playedMoves, expected.san];
            setPlayedMoves(newMoves);
            onMovesChange?.(newMoves, reviewIdx + 1);

            const remaining = reviewQueue.slice(1);
            if (remaining.length === 0) {
              setReviewQueue([]);
              setCurrentMoveIndex(line.length);
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
        const r3 = chess.move({ from: sourceSquare, to: targetSquare });
        if (soundRef.current) r3?.captured ? playCapture() : playMove();
        const newMoves = [...playedMoves, expected.san];
        setFen(chess.fen());
        setPlayedMoves(newMoves);
        const nextIdx = currentMoveIndex + 1;
        onMovesChange?.(newMoves, nextIdx);
        setFeedback('correct');
        if (soundRef.current) playCorrect();
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
        isProcessing.current = true;
        mistakesRef.current = [...mistakesRef.current, currentMoveIndex];
        onMoveMistake?.(currentMoveIndex);

        setFeedback('wrong');
        if (soundRef.current) playWrong();
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
          const r4 = chess.move({ from: expected.from, to: expected.to });
          if (soundRef.current) r4?.captured ? playCapture() : playMove();
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
      isComplete,
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

  const displaySquareStyles = (() => {
    let styles = { ...premoveSquares, ...squareStyles };
    if (showHint && isPlayerTurn && feedback === null && currentMoveIndex < line.length) {
      styles = {
        ...styles,
        [line[currentMoveIndex].from]: { background: 'rgba(120, 200, 120, 0.5)' },
        [line[currentMoveIndex].to]: { background: 'rgba(60, 180, 60, 0.75)' },
      };
    }
    return styles;
  })();

  const naturalOrientation = playerColor === 'w' ? 'white' : 'black';
  const boardOrientation = flipBoard
    ? (naturalOrientation === 'white' ? 'black' : 'white')
    : naturalOrientation;

  const boardKey = `${boardThemeId}-${pieceStyleId}-${boardOrientation}`;

  return (
    <div className="w-full h-full overflow-hidden border border-[#262626]" style={{ borderRadius: '4px' }}>
      <Chessboard
        key={boardKey}
        options={{
          position: fen,
          boardOrientation,
          onPieceDrop: handlePieceDrop,
          onSquareRightClick: cancelPremove,
          squareStyles: displaySquareStyles,
          allowDragging: true,
          boardStyle: { borderRadius: '0', width: '100%', height: '100%' },
          darkSquareStyle: { backgroundColor: boardTheme.dark },
          lightSquareStyle: { backgroundColor: boardTheme.light },
          pieces: customPieces,
          showNotation: notationEnabled,
          animationDurationInMs: animationMs,
          darkSquareNotationStyle: { color: '#C8C8C8' },
          lightSquareNotationStyle: { color: '#505050' },
          alphaNotationStyle: { fontSize: '11px', fontWeight: '700' },
          numericNotationStyle: { fontSize: '11px', fontWeight: '700' },
        }}
      />
    </div>
  );
}
