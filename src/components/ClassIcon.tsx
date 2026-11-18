'use client';

import { CLASS_COLOR, CLASS_LABEL, type MoveClass } from '@/lib/classify';

// SVG round badge — same icon everywhere (board, move list, courses).
export function ClassIcon({ cls, size = 24 }: { cls: MoveClass; size?: number }) {
  const color = CLASS_COLOR[cls];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label={CLASS_LABEL[cls]}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="12" fill={color} />
      {iconContent(cls)}
    </svg>
  );
}

const TXT = {
  fill: 'white',
  fontFamily: 'monospace',
  fontWeight: 800,
  textAnchor: 'middle',
  dominantBaseline: 'central',
  x: 12,
  y: 12,
} as React.SVGProps<SVGTextElement>;

function iconContent(cls: MoveClass): React.ReactNode {
  switch (cls) {
    case 'brilliant':
      return <text {...TXT} fontSize={8.5}>!!</text>;
    case 'great':
      return <text {...TXT} fontSize={13}>!</text>;
    case 'best':
      return (
        <polygon
          points="12,3.5 13.8,8.9 19.5,8.9 15,12.3 16.9,17.8 12,14.3 7.1,17.8 9,12.3 4.5,8.9 10.2,8.9"
          fill="white"
        />
      );
    case 'excellent':
      // thumb-up (Feather icons path)
      return (
        <g fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </g>
      );
    case 'good':
      return (
        <polyline
          points="4,12.5 9.5,18 20,7"
          fill="none" stroke="white" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      );
    case 'book':
      return (
        <g fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </g>
      );
    case 'inaccuracy':
      return <text {...TXT} fontSize={8}>?!</text>;
    case 'mistake':
      return <text {...TXT} fontSize={13}>?</text>;
    case 'miss':
      return (
        <g stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
          <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
        </g>
      );
    case 'blunder':
      return <text {...TXT} fontSize={8.5}>??</text>;
    default:
      return null;
  }
}
