'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { Chessboard as ChessboardType } from 'react-chessboard';
import { useBoardTheme } from '@/contexts/BoardThemeContext';

const Chessboard = dynamic(
  () => import('react-chessboard').then(m => m.Chessboard),
  { ssr: false, loading: () => null },
) as React.ComponentType<ComponentProps<typeof ChessboardType>>;

interface MiniBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  size: number;
}

export function MiniBoard({ fen, orientation = 'white', size }: MiniBoardProps) {
  const { boardTheme } = useBoardTheme();

  return (
    <div style={{ width: size, height: size, flexShrink: 0 }} data-ui="eg-board">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          darkSquareStyle: { backgroundColor: boardTheme.dark },
          lightSquareStyle: { backgroundColor: boardTheme.light },
          boardStyle: { borderRadius: 0, width: size, height: size },
          showNotation: false,
        }}
      />
    </div>
  );
}
