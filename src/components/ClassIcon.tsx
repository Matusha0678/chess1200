'use client';

import { ThumbsUp, BookOpen } from 'lucide-react';
import { CLASS_COLOR, CLASS_LABEL, type MoveClass } from '@/lib/classify';

export type BadgeKind =
  | MoveClass
  | 'found'   // угрозы — нашёл
  | 'missed'  // угрозы — пропустил
  | 'wrong';  // угрозы — лишняя отметка

const EXTRA_COLOR: Record<'found' | 'missed' | 'wrong', string> = {
  found:  '#81B64C',
  missed: '#F0A43A',
  wrong:  '#E0574A',
};

function getColor(kind: BadgeKind): string {
  if (kind in CLASS_COLOR) return CLASS_COLOR[kind as MoveClass];
  return EXTRA_COLOR[kind as 'found' | 'missed' | 'wrong'];
}

function getLabel(kind: BadgeKind): string {
  if (kind in CLASS_LABEL) return CLASS_LABEL[kind as MoveClass];
  if (kind === 'found')  return 'Нашёл';
  if (kind === 'missed') return 'Пропустил';
  return 'Лишняя';
}

/* Kinds that need lucide-react icons inside the circle */
type LucideKind = 'excellent' | 'good' | 'book';
const LUCIDE_KINDS = new Set<BadgeKind>(['excellent', 'good', 'book']);

function LucideIcon({ kind, iconSize }: { kind: LucideKind; iconSize: number }) {
  if (kind === 'book') return <BookOpen size={iconSize} color="white" strokeWidth={2.4} />;
  return <ThumbsUp size={iconSize} color="white" strokeWidth={2.4} />;
}

/* SVG-only sign for simple kinds */
function SvgSign({ kind }: { kind: BadgeKind }) {
  if (kind === 'brilliant')
    return <text x="12" y="16.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="white" fontFamily="Inter,sans-serif">!!</text>;
  if (kind === 'great')
    return <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="white" fontFamily="Inter,sans-serif">!</text>;
  if (kind === 'inaccuracy')
    return <text x="12" y="16.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="white" fontFamily="Inter,sans-serif">?!</text>;
  if (kind === 'mistake')
    return <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="white" fontFamily="Inter,sans-serif">?</text>;
  if (kind === 'blunder')
    return <text x="12" y="16.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="white" fontFamily="Inter,sans-serif">??</text>;

  if (kind === 'best')
    return (
      <polygon
        points="12,5.5 13.4,9.5 17.5,9.5 14.3,11.9 15.5,16 12,13.5 8.5,16 9.7,11.9 6.5,9.5 10.6,9.5"
        fill="white"
      />
    );

  if (kind === 'miss') {
    return (
      <g stroke="white" strokeWidth="2.6" strokeLinecap="round">
        <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
        <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
      </g>
    );
  }

  if (kind === 'found')
    return (
      <g stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <polyline points="5,12.5 9.5,17 19,7.5" />
      </g>
    );

  if (kind === 'missed')
    return <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="white" fontFamily="Inter,sans-serif">!</text>;

  if (kind === 'wrong')
    return (
      <g stroke="white" strokeWidth="2.6" strokeLinecap="round">
        <line x1="7" y1="7" x2="17" y2="17" />
        <line x1="17" y1="7" x2="7" y2="17" />
      </g>
    );

  return null;
}

export function ClassIcon({ cls, size = 24 }: { cls: BadgeKind; size?: number }) {
  const color = getColor(cls);
  const label = getLabel(cls);

  if (LUCIDE_KINDS.has(cls)) {
    const iconSize = Math.round(size * 0.54);
    return (
      <div
        aria-label={label}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <LucideIcon kind={cls as LucideKind} iconSize={iconSize} />
      </div>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label={label}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="11.5" fill={color} />
      <SvgSign kind={cls} />
    </svg>
  );
}
