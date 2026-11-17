'use client';
import type { MoveLabel } from '@/types/courses';
export type { MoveLabel };

interface BadgeMeta { symbol: string; name: string; color: string }

export const LABEL_META: Record<MoveLabel, BadgeMeta> = {
  '!!':   { symbol: '!!',  name: 'Блестящий',  color: '#00bcd4' },
  '!':    { symbol: '!',   name: 'Сильный',    color: '#3b82f6' },
  '!?':   { symbol: '!?',  name: 'Интересный', color: '#9c27b0' },
  'best': { symbol: '✓',   name: 'Лучший',     color: '#4caf50' },
  'book': { symbol: '≡',   name: 'Книжный',    color: '#c5b89a' },
  'good': { symbol: '○',   name: 'Хороший',    color: '#8bc34a' },
  '?!':   { symbol: '?!',  name: 'Неточность', color: '#ffc107' },
  '?':    { symbol: '?',   name: 'Ошибка',     color: '#ff9800' },
  'miss': { symbol: '✗',   name: 'Пропуск',    color: '#f44336' },
  '??':   { symbol: '??',  name: 'Зевок',      color: '#c62828' },
};

export const ALL_LABELS: MoveLabel[] = ['!!', '!', '!?', 'best', 'book', 'good', '?!', '?', 'miss', '??'];

export interface MoveBadgeProps {
  label: MoveLabel;
  variant: 'square' | 'inline';
}

export function MoveBadge({ label, variant }: MoveBadgeProps) {
  const m = LABEL_META[label];

  if (variant === 'square') {
    return (
      <div
        aria-hidden="true"
        title={m.name}
        className="move-badge-sq"
        style={{ position: 'absolute', top: 2, right: 3, zIndex: 10, pointerEvents: 'auto' }}
      >
        <span
          className="move-badge-sq-inner"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 4,
            background: m.color, color: '#fff',
            fontSize: 10, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1,
            boxShadow: '0 1px 4px rgba(0,0,0,0.65)',
          }}
        >
          {m.symbol}
        </span>
      </div>
    );
  }

  return (
    <span
      title={m.name}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 18, height: 16, padding: '0 3px', borderRadius: 3,
        background: `${m.color}22`, border: `1px solid ${m.color}66`,
        color: m.color, fontSize: 10, fontWeight: 800, fontFamily: 'monospace',
        lineHeight: 1, flexShrink: 0, verticalAlign: 'middle',
      }}
    >
      {m.symbol}
    </span>
  );
}

/** NAG number → MoveLabel (standard chess.com / PGN NAG mapping). */
export function nagToLabel(nag: number): MoveLabel | null {
  const map: Partial<Record<number, MoveLabel>> = {
    1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!',
  };
  return map[nag] ?? null;
}

/** For auto-annotating engine analysis: centipawn loss → MoveLabel. */
export function evalDeltaToLabel(cpLoss: number): MoveLabel | null {
  if (cpLoss >= 300) return '??';
  if (cpLoss >= 100) return '?';
  if (cpLoss >= 50)  return '?!';
  return null;
}
