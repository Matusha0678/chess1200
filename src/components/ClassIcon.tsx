'use client';

import { CLASS_LABEL, type MoveClass } from '@/lib/classify';

export type BadgeKind =
  | MoveClass
  | 'found'   // угрозы — нашёл
  | 'missed'  // угрозы — пропустил
  | 'wrong';  // угрозы — лишняя отметка

const ICON_FILE: Record<BadgeKind, string> = {
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
};

function getLabel(kind: BadgeKind): string {
  if (kind in CLASS_LABEL) return CLASS_LABEL[kind as MoveClass];
  if (kind === 'found')  return 'Нашёл';
  if (kind === 'missed') return 'Пропустил';
  return 'Лишняя';
}

export function ClassIcon({ cls, size = 24 }: { cls: BadgeKind; size?: number }) {
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
