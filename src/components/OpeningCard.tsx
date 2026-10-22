'use client';

import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { ChessMove } from '@/types/openings';

interface Props {
  opening: {
    id: string;
    name: string;
    eco_code?: string | null;
    color: 'white' | 'black' | 'both';
    total_lines: number;
  };
  linesTotal: number;
  linesMastered: number;
  linesDue: number;
  onClick: () => void;
  firstLineMoves?: ChessMove[];
}

const COLOR_ICON: Record<'white' | 'black' | 'both', string> = {
  white: '♙',
  black: '♟',
  both: '♗',
};

const COLOR_LABEL: Record<'white' | 'black' | 'both', string> = {
  white: 'Белые',
  black: 'Чёрные',
  both: 'Оба цвета',
};

function computeFen(moves: ChessMove[], maxMoves = 8): string {
  const chess = new Chess();
  for (let i = 0; i < Math.min(moves.length, maxMoves); i++) {
    try { chess.move({ from: moves[i].from, to: moves[i].to }); } catch { break; }
  }
  return chess.fen();
}

export default function OpeningCard({
  opening,
  linesTotal,
  linesMastered,
  linesDue,
  onClick,
  firstLineMoves,
}: Props) {
  const progress = linesTotal > 0 ? (linesMastered / linesTotal) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-7 flex flex-col gap-4 hover:border-[#303030] hover:bg-[#111111] transition-all duration-200 cursor-pointer group"
    >
      {/* Mini chess board */}
      {firstLineMoves && firstLineMoves.length > 0 && (
        <div className="w-full aspect-square rounded-[12px] overflow-hidden border border-[#262626]">
          <Chessboard
            options={{
              position: computeFen(firstLineMoves),
              boardOrientation: opening.color === 'black' ? 'black' : 'white',
              allowDragging: false,
              boardStyle: { borderRadius: '0', width: '100%', height: '100%' },
              darkSquareStyle: { backgroundColor: '#3A3A3A' },
              lightSquareStyle: { backgroundColor: '#8A8A8A' },
            }}
          />
        </div>
      )}

      {/* Header row: ECO badge + color pill */}
      <div className="flex items-center gap-2 flex-wrap">
        {opening.eco_code && (
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF] bg-[#1A1A1A] border border-[#303030] rounded-[8px] px-[10px] py-[4px]">
            {opening.eco_code}
          </span>
        )}
        <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0] bg-[#0D0D0D] border border-[#262626] rounded-full px-[10px] py-[4px] flex items-center gap-1.5">
          <span className="text-[14px] leading-none">{COLOR_ICON[opening.color]}</span>
          <span>{COLOR_LABEL[opening.color]}</span>
        </span>
      </div>

      {/* Opening name */}
      <h3 className="m-0 font-[500] text-[26px] leading-[1.15] tracking-[-0.01em] text-[#F5F5F5] group-hover:text-[#FFFFFF] transition-colors">
        {opening.name}
      </h3>

      {/* Progress bar */}
      <div className="h-[5px] w-full bg-[#1E1E1E] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#FFFFFF] rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[#A0A0A0]">
          {linesTotal} {linesTotal === 1 ? 'линия' : linesTotal >= 2 && linesTotal <= 4 ? 'линии' : 'линий'}
        </span>
        {linesDue > 0 && (
          <span className="flex items-center gap-[5px] bg-[#1A1A1A] border border-[#303030] rounded-full px-[10px] py-[4px]">
            <span className="w-[5px] h-[5px] rounded-full bg-[#FFFFFF]" />
            <span className="text-[12px] font-semibold text-[#FFFFFF] whitespace-nowrap">
              {linesDue} к повторению
            </span>
          </span>
        )}
      </div>
    </button>
  );
}
