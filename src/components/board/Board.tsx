'use client';

import { useRef, useEffect, useState } from 'react';
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
  /** Explicit pixel size. Omit to auto-fit min(containerW, containerH). */
  size?: number;
  allowDragging?: boolean;
  onPieceDrop?: (args: PieceDropHandlerArgs) => boolean;
  onSquareClick?: (args: SquareHandlerArgs) => void;
  squareStyles?: Record<string, React.CSSProperties>;
  /**
   * Per-square overlay nodes (ClassIcon, glow, etc.).
   * Squares without an entry return null from squareRenderer → library renders
   * its own 100%×100% wrapper + squareStyles → pieces are full-size.
   * Squares with an entry get a custom wrapper (width/height 100%, position relative)
   * that includes squareStyles[square] and the overlay node on top.
   */
  overlays?: Record<string, React.ReactNode>;
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
  overlays,
  arrows,
  cacheKey,
  checkSquare,
}: BoardProps) {
  const {
    boardTheme, customPieces, animationMs,
    showNotation, boardThemeId, pieceStyleId,
  } = useBoardTheme();

  // Auto-size: track container and use min(width, height) so board stays square
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoSize, setAutoSize] = useState<number | null>(null);
  useEffect(() => {
    if (size !== undefined) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setAutoSize(Math.floor(Math.min(width, height)));
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [size]);

  const dim: number | string = size ?? autoSize ?? '100%';

  // Build the set of squares that need a custom wrapper
  const overlaySquares = new Set<string>([
    ...Object.keys(overlays ?? {}),
    ...(checkSquare ? [checkSquare as string] : []),
  ]);

  // squareRenderer: null for plain squares (let library handle sizing + squareStyles),
  // custom wrapper for overlay squares (apply squareStyles manually there).
  const composedRenderer: SquareRenderer | undefined = overlaySquares.size > 0
    ? ({ square, children }) => {
        const overlay = overlays?.[square];
        const isCheck = square === checkSquare;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!overlay && !isCheck) return null as any;
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%', ...squareStyles?.[square] }}>
            {children}
            {overlay}
            {isCheck && <div className="sq-check" />}
          </div>
        );
      }
    : undefined;

  // Exclude overlay squares from squareStyles passed to the library —
  // we apply them manually in the wrapper above.
  const rcSquareStyles: Record<string, React.CSSProperties> | undefined = (() => {
    if (!squareStyles || overlaySquares.size === 0) return squareStyles;
    const out: Record<string, React.CSSProperties> = {};
    for (const [sq, s] of Object.entries(squareStyles)) {
      if (!overlaySquares.has(sq)) out[sq] = s;
    }
    return out;
  })();

  // react-chessboard v5 only understands FEN strings, not 'start' shorthand
  const fen = position === 'start'
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : position;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Chessboard
        key={`${boardThemeId}-${pieceStyleId}-${orientation}-${cacheKey ?? ''}`}
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging,
          onPieceDrop,
          onSquareClick,
          squareStyles: rcSquareStyles,
          squareRenderer: composedRenderer,
          arrows,
          pieces: customPieces,
          darkSquareStyle: { backgroundColor: boardTheme.dark },
          lightSquareStyle: { backgroundColor: boardTheme.light },
          showNotation,
          animationDurationInMs: animationMs,
          darkSquareNotationStyle: { color: boardTheme.light },
          lightSquareNotationStyle: { color: boardTheme.dark },
          alphaNotationStyle: { fontSize: '13px', fontWeight: '600' },
          numericNotationStyle: { fontSize: '13px', fontWeight: '600' },
          boardStyle: { borderRadius: 6, width: dim, height: dim },
        }}
      />
    </div>
  );
}
