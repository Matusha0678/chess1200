'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { Chessboard as ChessboardType } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { ClassIcon, type BadgeKind } from '@/components/ClassIcon';
import type { Square } from 'chess.js';

const Chessboard = dynamic(
  () => import('react-chessboard').then(m => m.Chessboard),
  { ssr: false, loading: () => null },
) as React.ComponentType<ComponentProps<typeof ChessboardType>>;

export type { BadgeKind };

export interface BoardArrow {
  from: Square;
  to: Square;
  color: string;
  style?: 'solid' | 'dashed';
  opacity?: number;
  label?: string;
  role?: 'offer' | 'plan' | 'threat' | 'fork' | 'best' | 'line-opp' | 'line-me' | 'played' | 'note';
}

const ROLE_CIRCLE: Record<string, string> = {
  plan: '#3A78C2', threat: '#C2453A', fork: '#C98424',
  best: '#5E8C35', 'line-opp': '#C2453A', 'line-me': '#3A78C2', offer: '#C98424',
};

export interface BoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  size: number;
  interactive?: boolean;
  movableColor?: 'w' | 'b';
  onMove?: (m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => boolean | Promise<boolean>;
  onSquareClick?: (sq: Square) => void;
  lastMove?: { from: Square; to: Square } | null;
  tints?: Partial<Record<Square, string>>;
  rings?: Partial<Record<Square, string>>;
  badges?: Partial<Record<Square, BadgeKind>>;
  arrows?: BoardArrow[];
  checkSquare?: Square | null;
  dimmed?: boolean;
}

// Convert Square to file/rank indices
function squareToCoords(sq: Square): { file: number; rank: number } {
  return { file: sq.charCodeAt(0) - 97, rank: parseInt(sq[1]) };
}

// Get pixel center of a square
function squareCenter(sq: Square, S: number, orientation: 'white' | 'black'): { x: number; y: number } {
  const q = S / 8;
  const { file, rank } = squareToCoords(sq);
  if (orientation === 'white') {
    return { x: (file + 0.5) * q, y: (8 - rank + 0.5) * q };
  }
  return { x: (7 - file + 0.5) * q, y: (rank - 1 + 0.5) * q };
}

// SVG arrow component
function Arrow({ arrow, S }: { arrow: BoardArrow; S: number }) {
  const q = S / 8;
  const scale = q / 96;
  const from = squareCenter(arrow.from, S, 'white'); // orientation handled by ArrowLayer
  const to   = squareCenter(arrow.to,   S, 'white');

  const opacity = arrow.opacity ?? 0.85;
  const color   = arrow.color;
  const circleColor = arrow.role ? (ROLE_CIRCLE[arrow.role] ?? '#3A78C2') : '#3A78C2';

  const isDashed = arrow.style === 'dashed';
  const startOffset = 18 * scale;
  const endOffset   = 14 * scale;
  // Solid dimensions
  const headLen  = 34 * scale;
  const headHW   = 22 * scale;
  const shaftHW  =  9 * scale;
  const shaftStroke = 18 * scale;
  // Dashed dimensions (thin line + small head)
  const dHeadLen = 22 * scale;
  const dHeadHW  = 10 * scale;
  const dStroke  =  5 * scale;
  const dash     = `${10 * scale} ${8 * scale}`;

  // Detect knight L-shape: file diff × rank diff must equal 2
  const df = Math.abs(arrow.from.charCodeAt(0) - arrow.to.charCodeAt(0));
  const dr = Math.abs(parseInt(arrow.from[1]) - parseInt(arrow.to[1]));
  const isKnight = (df === 1 && dr === 2) || (df === 2 && dr === 1);

  if (isKnight) {
    // Corner of the L: go in the "long" direction first
    const fromFile = arrow.from.charCodeAt(0) - 97;
    const fromRank = parseInt(arrow.from[1]);
    const toFile   = arrow.to.charCodeAt(0) - 97;
    const toRank   = parseInt(arrow.to[1]);

    let midX: number, midY: number;
    if (dr > df) {
      // Long = vertical → intermediate = (fromFile, toRank)
      midX = (fromFile + 0.5) * q;
      midY = (8 - toRank + 0.5) * q;
    } else {
      // Long = horizontal → intermediate = (toFile, fromRank)
      midX = (toFile + 0.5) * q;
      midY = (8 - fromRank + 0.5) * q;
    }

    // Direction of segment 1 (from → mid)
    const dx1 = midX - from.x, dy1 = midY - from.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const ux1 = len1 > 0 ? dx1 / len1 : 0;
    const uy1 = len1 > 0 ? dy1 / len1 : 0;

    // Direction of segment 2 (mid → to)
    const dx2 = to.x - midX, dy2 = to.y - midY;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len2 < 1) return null;
    const ux2 = dx2 / len2, uy2 = dy2 / len2;
    const nx2 = -uy2, ny2 = ux2;

    const aHL = isDashed ? dHeadLen : headLen;
    const aHW = isDashed ? dHeadHW  : headHW;
    const aSW = isDashed ? dStroke  : shaftStroke;

    const startX = from.x + ux1 * startOffset;
    const startY = from.y + uy1 * startOffset;
    const tipX   = to.x - ux2 * endOffset;
    const tipY   = to.y - uy2 * endOffset;
    const baseX  = tipX - ux2 * aHL;
    const baseY  = tipY - uy2 * aHL;

    const shaftD = `M ${startX} ${startY} L ${midX} ${midY} L ${baseX} ${baseY}`;
    const headPts = [
      [tipX, tipY],
      [baseX + nx2 * aHW, baseY + ny2 * aHW],
      [baseX - nx2 * aHW, baseY - ny2 * aHW],
    ].map(([x, y]) => `${x},${y}`).join(' ');

    return (
      <g opacity={opacity} data-ui="board-arrow" data-role={arrow.role} data-label={arrow.label}>
        <path
          d={shaftD}
          stroke={color}
          strokeWidth={aSW}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={isDashed ? dash : undefined}
        />
        <polygon points={headPts} fill={color} />
      </g>
    );
  }

  // Straight arrow
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;

  if (isDashed) {
    const ex = to.x - ux * dHeadLen;
    const ey = to.y - uy * dHeadLen;
    const startX = from.x + ux * startOffset;
    const startY = from.y + uy * startOffset;
    const p1x = to.x,              p1y = to.y;
    const p2x = ex + nx * dHeadHW, p2y = ey + ny * dHeadHW;
    const p3x = ex - nx * dHeadHW, p3y = ey - ny * dHeadHW;

    return (
      <g opacity={opacity} data-ui="board-arrow" data-role={arrow.role} data-label={arrow.label}>
        <line
          x1={startX} y1={startY} x2={ex} y2={ey}
          stroke={color} strokeWidth={dStroke}
          strokeDasharray={dash} strokeLinecap="round"
        />
        <polygon points={`${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`} fill={color} />
      </g>
    );
  }

  // Solid straight arrow
  const startX = from.x + ux * startOffset;
  const startY = from.y + uy * startOffset;
  const tipX   = to.x - ux * endOffset;
  const tipY   = to.y - uy * endOffset;
  const baseX  = tipX - ux * headLen;
  const baseY  = tipY - uy * headLen;

  const points = [
    [tipX, tipY],
    [baseX + nx * headHW,  baseY + ny * headHW],
    [baseX + nx * shaftHW, baseY + ny * shaftHW],
    [startX + nx * shaftHW, startY + ny * shaftHW],
    [startX - nx * shaftHW, startY - ny * shaftHW],
    [baseX - nx * shaftHW, baseY - ny * shaftHW],
    [baseX - nx * headHW,  baseY - ny * headHW],
  ].map(([x, y]) => `${x},${y}`).join(' ');

  const labelX = from.x + dx * 0.35;
  const labelY = from.y + dy * 0.35;

  return (
    <g opacity={opacity} data-ui="board-arrow" data-role={arrow.role} data-label={arrow.label}>
      <polygon points={points} fill={color} />
      {arrow.label && (
        <g>
          <circle cx={labelX} cy={labelY} r={15 * scale} fill={circleColor} />
          <text
            x={labelX} y={labelY + 5 * scale}
            textAnchor="middle" fontSize={16 * scale} fontWeight="800"
            fill="white" fontFamily="Inter,sans-serif"
          >
            {arrow.label}
          </text>
        </g>
      )}
    </g>
  );
}

function ArrowLayer({ arrows, S, orientation }: { arrows: BoardArrow[]; S: number; orientation: 'white' | 'black' }) {
  // Reverse orientation: flip all coordinates
  const oriented = arrows.map(a => {
    if (orientation === 'white') return a;
    const flipSq = (sq: Square): Square => {
      const f = String.fromCharCode(104 - (sq.charCodeAt(0) - 97)); // 'h' - file
      const r = 9 - parseInt(sq[1]);
      return `${f}${r}` as Square;
    };
    return { ...a, from: flipSq(a.from), to: flipSq(a.to) };
  });

  return (
    <svg
      width={S}
      height={S}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {oriented.map((a, i) => <Arrow key={i} arrow={a} S={S} />)}
    </svg>
  );
}

function BadgeLayer({ badges, S, orientation }: {
  badges: Partial<Record<Square, BadgeKind>>;
  S: number;
  orientation: 'white' | 'black';
}) {
  const q = S / 8;
  const badgeSize = Math.round(0.375 * q);

  return (
    <>
      {(Object.entries(badges) as [Square, BadgeKind][]).map(([sq, kind]) => {
        const { file, rank } = squareToCoords(sq);
        let col: number, row: number;
        if (orientation === 'white') {
          col = file; row = 8 - rank;
        } else {
          col = 7 - file; row = rank - 1;
        }
        // Center badge on the top-right corner of the square
        const left = (col + 1) * q - badgeSize / 2;
        const top = row * q - badgeSize / 2;

        return (
          <div
            key={sq}
            data-ui="board-badge"
            data-kind={kind}
            data-square={sq}
            style={{
              position: 'absolute',
              left,
              top,
              width: badgeSize,
              height: badgeSize,
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))',
              pointerEvents: 'none',
            }}
          >
            <ClassIcon cls={kind} size={badgeSize} />
          </div>
        );
      })}
    </>
  );
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const LAST_MOVE_FROM = 'rgba(247,214,74,.26)';
const LAST_MOVE_TO   = 'rgba(247,214,74,.35)';
const CHECK_GLOW     = 'radial-gradient(circle, rgba(232,64,52,.95) 0%, rgba(232,64,52,.6) 38%, rgba(232,64,52,0) 72%)';
const MOVE_DOT       = 'radial-gradient(circle, rgba(0,0,0,.16) 0 18%, transparent 19%)';
const CAPTURE_RING   = 'radial-gradient(circle, transparent 0 74%, rgba(0,0,0,.16) 75%)';
const SELECTED_SQ    = 'rgba(20,85,30,.5)';

export function Board({
  fen,
  orientation = 'white',
  size,
  interactive = false,
  movableColor,
  onMove,
  onSquareClick,
  lastMove,
  tints,
  rings,
  badges,
  arrows,
  checkSquare,
  dimmed = false,
}: BoardProps) {
  const { boardTheme, customPieces, animationMs, showNotation, boardThemeId, pieceStyleId } = useBoardTheme();
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  // Selection keyed to FEN — resets automatically when position changes (no effect needed)
  const [selState, setSelState] = useState<{ fen: string; sq: Square | null; targets: Set<Square> }>(
    { fen: '', sq: null, targets: new Set() }
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const h = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const resolvedFen = fen === 'start' ? START_FEN : fen;

  // Derive selection — nulls out automatically when FEN changes
  const selected = selState.fen === resolvedFen ? selState.sq : null;
  const legalTargets = useMemo(
    () => selState.fen === resolvedFen ? selState.targets : new Set<Square>(),
    [selState, resolvedFen]
  );

  const clearSel = useCallback(() => {
    setSelState({ fen: '', sq: null, targets: new Set() });
  }, []);

  // Determine whose turn it is
  const turnColor = resolvedFen.split(' ')[1] as 'w' | 'b';
  const allowedColor = movableColor ?? turnColor;

  const computeLegalTargets = useCallback((sq: Square, currentFen: string): Set<Square> => {
    try {
      const chess = new Chess(currentFen);
      const moves = chess.moves({ square: sq, verbose: true });
      return new Set(moves.map(m => m.to as Square));
    } catch { return new Set(); }
  }, []);

  const handleSquareClick = useCallback((sq: Square) => {
    // «Отметь клетки» режим (угрозы)
    if (!interactive && onSquareClick) {
      onSquareClick(sq);
      return;
    }

    if (!interactive) return;

    // Interactive mode: select piece + click to move
    const chess = new Chess(resolvedFen);
    const piece = chess.get(sq);

    if (selected) {
      if (legalTargets.has(sq)) {
        const isPromo = (() => {
          const p = chess.get(selected);
          return p?.type === 'p' && ((p.color === 'w' && sq[1] === '8') || (p.color === 'b' && sq[1] === '1'));
        })();
        const move = { from: selected, to: sq, promotion: isPromo ? ('q' as const) : undefined };
        const result = onMove?.(move);
        clearSel();
        if (result instanceof Promise) { result.catch(() => {}); }
        return;
      }
      if (piece && piece.color === allowedColor) {
        setSelState({ fen: resolvedFen, sq, targets: computeLegalTargets(sq, resolvedFen) });
        return;
      }
      clearSel();
      return;
    }

    if (piece && piece.color === allowedColor) {
      setSelState({ fen: resolvedFen, sq, targets: computeLegalTargets(sq, resolvedFen) });
    }
  }, [interactive, onSquareClick, selected, legalTargets, resolvedFen, allowedColor, onMove, computeLegalTargets, clearSel]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') clearSel();
  }, [clearSel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDrop = useCallback((args: PieceDropHandlerArgs): boolean => {
    if (!interactive || !onMove) return false;
    const { sourceSquare, targetSquare } = args;
    if (!targetSquare) return false;
    const chess = new Chess(resolvedFen);
    const piece = chess.get(sourceSquare as Square);
    const isPromo = piece?.type === 'p' &&
      ((piece.color === 'w' && targetSquare[1] === '8') || (piece.color === 'b' && targetSquare[1] === '1'));
    const result = onMove({ from: sourceSquare as Square, to: targetSquare as Square, promotion: isPromo ? 'q' : undefined });
    if (result instanceof Promise) {
      result.then(ok => { if (!ok) { /* piece snaps back automatically */ } });
      return true;
    }
    return result !== false;
  }, [interactive, onMove, resolvedFen]);

  // Build squareStyles
  const squareStyles: Record<string, React.CSSProperties> = {};

  const addBg = (sq: Square, bg: string) => {
    const existing = squareStyles[sq]?.background as string | undefined;
    squareStyles[sq] = {
      ...squareStyles[sq],
      background: existing ? `${bg}, ${existing}` : bg,
    };
  };

  const addBoxShadow = (sq: Square, shadow: string) => {
    const existing = squareStyles[sq]?.boxShadow as string | undefined;
    squareStyles[sq] = {
      ...squareStyles[sq],
      boxShadow: existing ? `${shadow}, ${existing}` : shadow,
    };
  };

  if (lastMove) {
    addBg(lastMove.from, LAST_MOVE_FROM);
    addBg(lastMove.to, LAST_MOVE_TO);
  }

  if (checkSquare) {
    addBg(checkSquare, CHECK_GLOW);
  }

  if (selected) {
    addBg(selected, SELECTED_SQ);
    // Legal move dots / capture rings
    legalTargets.forEach(target => {
      try {
        const chess = new Chess(resolvedFen);
        const targetPiece = chess.get(target);
        addBg(target, targetPiece ? CAPTURE_RING : MOVE_DOT);
      } catch {
        addBg(target, MOVE_DOT);
      }
    });
  }

  // Tints and rings from props
  if (tints) {
    (Object.entries(tints) as [Square, string][]).forEach(([sq, color]) => addBg(sq, color));
  }
  if (rings) {
    (Object.entries(rings) as [Square, string][]).forEach(([sq, color]) => {
      addBoxShadow(sq, `inset 0 0 0 4px ${color}`);
    });
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} data-board-fen={resolvedFen}>
      <Chessboard
        key={`${boardThemeId}-${pieceStyleId}-${orientation}`}
        options={{
          position: resolvedFen,
          boardOrientation: orientation,
          allowDragging: interactive,
          onPieceDrop: handleDrop,
          onSquareClick: ({ square }) => handleSquareClick(square as Square),
          squareStyles,
          arrows: undefined,
          pieces: customPieces,
          darkSquareStyle: { backgroundColor: boardTheme.dark },
          lightSquareStyle: { backgroundColor: boardTheme.light },
          showNotation,
          animationDurationInMs: reducedMotion ? 0 : animationMs,
          darkSquareNotationStyle: { color: boardTheme.light },
          lightSquareNotationStyle: { color: boardTheme.dark },
          alphaNotationStyle: { fontSize: '13px', fontWeight: '600' },
          numericNotationStyle: { fontSize: '13px', fontWeight: '600' },
          boardStyle: { borderRadius: 6, width: size, height: size },
        }}
      />

      {/* Overlay layer: arrows + badges (not clipped) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
        {arrows && arrows.length > 0 && (
          <ArrowLayer arrows={arrows} S={size} orientation={orientation} />
        )}
        {badges && Object.keys(badges).length > 0 && (
          <BadgeLayer badges={badges} S={size} orientation={orientation} />
        )}
      </div>

      {/* Dimmed overlay */}
      {dimmed && (
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 6,
          background: 'rgba(38,37,34,.55)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
