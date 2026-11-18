/** Остаток времени (сек) после каждого полухода — из комментариев {[%clk 0:09:58.5]} PGN chess.com. */
export function parseClocks(pgn: string): number[] {
  const out: number[] = [];
  const re = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn))) out.push(+m[1] * 3600 + +m[2] * 60 + +m[3]);
  return out;
}

/** [TimeControl "600+5"] → { base: 600, inc: 5 }; "600" → inc 0; дневные ("1/86400") → null. */
export function parseTimeControl(pgn: string): { base: number; inc: number } | null {
  const m = pgn.match(/\[TimeControl\s+"(\d+)(?:\+(\d+))?"\]/);
  return m ? { base: +m[1], inc: m[2] ? +m[2] : 0 } : null;
}

/** Сколько секунд ушло на каждый полуход: своё прошлое время − текущее + добавка. */
export function timeSpent(clocks: number[], tc: { base: number; inc: number }): number[] {
  return clocks.map((c, i) =>
    Math.max(0, +((i >= 2 ? clocks[i - 2] : tc.base) - c + tc.inc).toFixed(1))
  );
}
