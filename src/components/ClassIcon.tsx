'use client';

import { CLASS_LABEL, type MoveClass } from '@/lib/classify';

// Official chess.com Brilliance icons (from public/move-classes/).
// PNG badges already contain their colored circle — just render as <img>.

const ICON_FILE: Record<MoveClass, string> = {
  brilliant:  'brilliant_128x.png',
  great:      'great_find_128x.png',
  best:       'best_128x.png',
  excellent:  'excellent_128x.png',
  good:       'good_128x.png',
  book:       'book_128x.png',
  inaccuracy: 'inaccuracy_128x.png',
  mistake:    'mistake_128x.png',
  miss:       'missed_win_128x.png',
  blunder:    'blunder_128x.png',
};

export function ClassIcon({ cls, size = 24 }: { cls: MoveClass; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`/move-classes/${ICON_FILE[cls]}`}
      alt={CLASS_LABEL[cls]}
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
      draggable={false}
    />
  );
}
