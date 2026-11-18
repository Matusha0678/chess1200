import type { AnalysisRow } from './game-insights';

export interface ConvertPosition {
  fen: string;
  moveNumber: number;
  myColor: 'w' | 'b';
  myWin: number;
  evalCp: number;
}

/** «Дожми свою партию»: первая позиция, где у меня два хода подряд шанс ≥ 0.75, а партия не выиграна. */
export function findConvertPosition(
  game: { color: string; result: string },
  rows: AnalysisRow[]
): ConvertPosition | null {
  if (game.result === 'win') return null;
  const C: 'w' | 'b' = game.color === 'white' ? 'w' : 'b';
  const my = rows
    .filter(r => r.color === C)
    .sort((a, b) => a.move_number - b.move_number);

  const win = (r: AnalysisRow) => C === 'w' ? +r.win_before : 1 - +r.win_before;

  for (let i = 0; i + 1 < my.length; i++) {
    if (win(my[i]) >= 0.75 && win(my[i + 1]) >= 0.75) {
      return {
        fen: my[i].fen_before,
        moveNumber: my[i].move_number,
        myColor: C,
        myWin: +win(my[i]).toFixed(3),
        evalCp: my[i].eval_before,
      };
    }
  }
  return null;
}
