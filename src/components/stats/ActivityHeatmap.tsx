'use client';

import { useMemo } from 'react';
import type { Game } from '@/lib/chesscom';

interface Props {
  games: Game[];
  weeks?: number; // default 26 (half year)
}

const WEEKDAY_LABELS = ['Пн', 'Ср', 'Пт'];

export function ActivityHeatmap({ games, weeks = 26 }: Props) {
  const grid = useMemo(() => {
    // Map YYYY-MM-DD → { count, wins }
    const byDay = new Map<string, { count: number; wins: number }>();
    for (const g of games) {
      if (!g.played_at) continue;
      const d = new Date(g.played_at);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { count: 0, wins: 0 };
      cur.count++;
      if (g.result === 'win') cur.wins++;
      byDay.set(key, cur);
    }

    // Build array of last N weeks * 7 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Align to Sunday of current week (Sun=0..Sat=6)
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + (6 - today.getDay())); // next Saturday

    const totalDays = weeks * 7;
    const cells: Array<{ date: string; count: number; wins: number; dow: number; inFuture: boolean }> = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(endDate.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const info = byDay.get(key) ?? { count: 0, wins: 0 };
      cells.push({
        date: key,
        count: info.count,
        wins: info.wins,
        dow: d.getDay(),
        inFuture: d.getTime() > today.getTime(),
      });
    }

    // Organize into columns (weeks) × 7 rows (Sun → Sat)
    const columns: typeof cells[] = [];
    for (let w = 0; w < weeks; w++) {
      columns.push(cells.slice(w * 7, w * 7 + 7));
    }

    // Max count for scaling
    const max = Math.max(1, ...cells.map(c => c.count));

    return { columns, max, totalGames: cells.reduce((s, c) => s + c.count, 0) };
  }, [games, weeks]);

  const cellSize = 11;
  const cellGap = 3;
  const width = grid.columns.length * (cellSize + cellGap) + 20;
  const height = 7 * (cellSize + cellGap) + 24;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.08, textTransform: 'uppercase' }}>Активность</div>
          <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 2 }}>{grid.totalGames} партий за {weeks} недель</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
          <span>меньше</span>
          {[0, 1, 2, 3, 4].map(level => (
            <div key={level} style={{
              width: 10, height: 10,
              background: level === 0
                ? 'var(--hairline)'
                : `color-mix(in srgb, var(--accent) ${level * 22 + 10}%, var(--surface))`,
              borderRadius: 2,
            }} />
          ))}
          <span>больше</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          {/* Weekday labels (Mon, Wed, Fri) */}
          {WEEKDAY_LABELS.map((lbl, i) => (
            <text
              key={lbl}
              x={0}
              y={(i * 2 + 1) * (cellSize + cellGap) + cellSize - 2}
              fontSize={10}
              fill="var(--muted)"
            >{lbl}</text>
          ))}
          {/* Cells */}
          {grid.columns.map((col, ci) => (
            <g key={ci} transform={`translate(${20 + ci * (cellSize + cellGap)}, 0)`}>
              {col.map((cell, ri) => {
                const level = cell.count === 0
                  ? 0
                  : cell.count <= 1 ? 1
                    : cell.count <= 3 ? 2
                      : cell.count <= 6 ? 3 : 4;
                const winPct = cell.count > 0 ? Math.round((cell.wins / cell.count) * 100) : 0;
                const bg = cell.inFuture
                  ? 'transparent'
                  : level === 0
                    ? 'var(--hairline)'
                    : `color-mix(in srgb, var(--accent) ${level * 22 + 10}%, var(--surface))`;
                return (
                  <rect
                    key={ri}
                    x={0}
                    y={ri * (cellSize + cellGap)}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    ry={2}
                    fill={bg}
                    stroke={cell.inFuture ? 'var(--hairline)' : 'none'}
                    strokeDasharray={cell.inFuture ? '1 1' : undefined}
                  >
                    <title>{cell.date}: {cell.count} {cell.count === 1 ? 'партия' : cell.count <= 4 ? 'партии' : 'партий'}{cell.count > 0 ? ` · ${winPct}% побед` : ''}</title>
                  </rect>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
