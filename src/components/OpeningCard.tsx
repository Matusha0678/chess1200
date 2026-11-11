'use client';

import Link from 'next/link';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { ChessMove } from '@/types/openings';

interface Props {
  opening: {
    id: string;
    name: string;
    eco_code?: string | null;
    color: 'white' | 'black' | 'both';
  };
  index: number;
  linesTotal: number;
  linesMastered: number;
  linesDue: number;
  firstLineMoves?: ChessMove[];
  href: string;
}

function computeFen(moves: ChessMove[], maxMoves = 8): string {
  const chess = new Chess();
  for (let i = 0; i < Math.min(moves.length, maxMoves); i++) {
    try { chess.move({ from: moves[i].from, to: moves[i].to }); } catch { break; }
  }
  return chess.fen();
}

function linesPlural(n: number): string {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 19) return `${n} линий`;
  if (m10 === 1) return `${n} линия`;
  if (m10 >= 2 && m10 <= 4) return `${n} линии`;
  return `${n} линий`;
}

const HEADING: React.CSSProperties = { fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" };

export default function OpeningCard({ opening, index, linesTotal, linesMastered, linesDue, firstLineMoves, href }: Props) {
  const progress = linesTotal > 0 ? linesMastered / linesTotal : 0;
  const fen = firstLineMoves && firstLineMoves.length > 0 ? computeFen(firstLineMoves) : 'start';
  const isWhite = opening.color === 'white';
  const isBoth = opening.color === 'both';

  // suppress unused variable warning
  void linesDue;

  return (
    <Link
      href={href}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, padding: 14,
        border: '1px solid var(--hairline)', background: 'var(--surface)',
        color: 'var(--ivory)',
      }}
      className="opening-card-link"
    >
      {/* Board */}
      <div style={{ flex: '0 1 190px', minWidth: 140, alignSelf: 'flex-start', border: '1px solid var(--board-border)' }}>
        <div style={{ width: '100%', aspectRatio: '1 / 1' }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: opening.color === 'black' ? 'black' : 'white',
              allowDragging: false,
              boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
              darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
              lightSquareStyle: { backgroundColor: 'var(--board-light)' },
            }}
          />
        </div>
      </div>

      {/* Text */}
      <div style={{ flex: '1 1 180px', minWidth: 0, minHeight: 190, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Top row: number + color tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ ...HEADING, fontSize: 14, fontWeight: 600, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            {String(index).padStart(2, '0')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {isBoth ? (
              <span style={{ display: 'inline-flex', fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 18, lineHeight: 1 }}>
                <span style={{ color: 'var(--ivory)' }}>♚</span>
                <span style={{ marginLeft: -4, color: 'var(--ink)', WebkitTextStroke: '0.8px var(--ivory)' }}>♚</span>
              </span>
            ) : (
              <span style={{
                fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 18, lineHeight: 1,
                color: isWhite ? 'var(--ivory)' : 'var(--ink)',
                WebkitTextStroke: isWhite ? 'none' : '0.8px var(--ivory)',
              }}>♚</span>
            )}
            {isWhite ? 'БЕЛЫЕ' : isBoth ? 'ОБА' : 'ЧЁРНЫЕ'}
          </span>
        </div>

        {/* Title */}
        <h2 style={{ ...HEADING, margin: 0, fontSize: 26, lineHeight: '28px', fontWeight: 600, letterSpacing: '0', color: 'var(--ivory)' }}>
          {opening.name}
        </h2>

        {/* Bottom: progress + count + arrow */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Progress track */}
          <div style={{ height: 2, background: 'var(--track)' }}>
            {progress > 0 && <div style={{ height: '100%', width: `${progress * 100}%`, background: 'var(--ivory)' }} />}
          </div>
          {/* Footer row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{linesPlural(linesTotal)}</span>
            {/* Arrow button */}
            <button
              aria-hidden="true"
              tabIndex={-1}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                border: '1px solid var(--ivory)', background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ivory)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
