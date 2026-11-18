'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { Chessboard as ChessboardType } from 'react-chessboard';
import type { SquareRenderer, PieceDropHandlerArgs, SquareHandlerArgs, Arrow } from 'react-chessboard';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import type { Square } from 'chess.js';

const Chessboard = dynamic(
  () => import('react-chessboard').then(m => m.Chessboard),
  { ssr: false, loading: () => null },
) as React.ComponentType<ComponentProps<typeof ChessboardType>>;

export interface BoardProps {
  position: string;
  orientation?: 'white' | 'black';
  /** Explicit pixel size. Omit to fill the parent (parent must be a sized square). */
  size?: number;
  allowDragging?: boolean;
  onPieceDrop?: (args: PieceDropHandlerArgs) => boolean;
  onSquareClick?: (args: SquareHandlerArgs) => void;
  squareStyles?: Record<string, React.CSSProperties>;
  squareRenderer?: SquareRenderer;
  arrows?: Arrow[];
  /** Used as part of the Chessboard key to force remount on change. */
  cacheKey?: string;
  /** Square to show animated check glow on. */
  checkSquare?: Square | null;
}

export function Board({
  position,
  orientation = 'white',
  size,
  allowDragging = true,
  onPieceDrop,
  onSquareClick,
  squareStyles,
  squareRenderer,
  arrows,
  cacheKey,
  checkSquare,
}: BoardProps) {
  const {
    boardTheme, customPieces, animationMs,
    showNotation, boardThemeId, pieceStyleId,
  } = useBoardTheme();

  // Compose: check glow + caller's squareRenderer
  const composedRenderer: SquareRenderer | undefined = (() => {
    if (!checkSquare && !squareRenderer) return undefined;
    if (!checkSquare) return squareRenderer;
    return function CheckRenderer(args) {
      const { square, children } = args;
      const inner = squareRenderer ? squareRenderer(args) : children;
      if (square !== checkSquare) return <>{inner}</>;
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {inner}
          <div className="sq-check" />
        </div>
      );
    };
  })();

  const dim: number | string = size ?? '100%';

  return (
    <Chessboard
      key={`${boardThemeId}-${pieceStyleId}-${orientation}-${cacheKey ?? ''}`}
      options={{
        position,
        boardOrientation: orientation,
        allowDragging,
        onPieceDrop,
        onSquareClick,
        squareStyles,
        squareRenderer: composedRenderer,
        arrows,
        pieces: customPieces,
        darkSquareStyle: { backgroundColor: boardTheme.dark },
        lightSquareStyle: { backgroundColor: boardTheme.light },
        showNotation,
        animationDurationInMs: animationMs,
        darkSquareNotationStyle: { color: '#C8C8C8' },
        lightSquareNotationStyle: { color: '#505050' },
        alphaNotationStyle: { fontSize: '11px', fontWeight: '700' },
        numericNotationStyle: { fontSize: '11px', fontWeight: '700' },
        boardStyle: { borderRadius: 6, width: dim, height: dim },
      }}
    />
  );
}
