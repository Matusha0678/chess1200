'use client';

import { CLASS_LABEL, type MoveClass } from '@/lib/classify';

export type BadgeKind =
  | MoveClass
  | 'found'       // угрозы — нашёл
  | 'missed'      // угрозы — пропустил
  | 'wrong'       // угрозы — лишняя отметка
  | 'interesting'; // !? — Интересный ход (SVG inline, нет файла)

const ICON_FILE: Partial<Record<BadgeKind, string>> = {
  brilliant:  'brilliant_128x.png',
  great:      'great_find_128x.png',
  excellent:  'excellent_128x.png',
  good:       'good_128x.png',
  inaccuracy: 'inaccuracy_128x.png',
  mistake:    'mistake_128x.png',
  blunder:    'blunder_128x.png',
  best:       'best_128x.png',
  book:       'book_128x.png',
  miss:       'missed_win_128x.png',
  found:      'correct_128x.png',
  missed:     'missed_win_128x.png',
  wrong:      'incorrect_128x.png',
  // 'interesting' intentionally omitted — rendered as SVG below
};

function getLabel(kind: BadgeKind): string {
  if (kind in CLASS_LABEL) return CLASS_LABEL[kind as MoveClass];
  if (kind === 'found')       return 'Нашёл';
  if (kind === 'missed')      return 'Пропустил';
  if (kind === 'interesting') return 'Интересный ход';
  return 'Лишняя';
}

export function ClassIcon({ cls, size = 24 }: { cls: BadgeKind; size?: number }) {
  // Special case: 'interesting' (!?) rendered as inline SVG
  if (cls === 'interesting') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ display: 'block', flexShrink: 0 }}
        aria-label="Интересный ход"
      >
        <circle cx="12" cy="12" r="12" fill="#9C27B0" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill="white"
          fontFamily="Inter,sans-serif"
        >
          !?
        </text>
      </svg>
    );
  }

  const file = ICON_FILE[cls];
  if (!file) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/move-classes/${file}`}
      alt={getLabel(cls)}
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
    />
  );
}
