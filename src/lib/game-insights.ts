import { Chess } from 'chess.js';
import { parseClocks, parseTimeControl, timeSpent } from './clock';
export { parseClocks, parseTimeControl, timeSpent }; // re-export for Node TS test runner

function detectPhase(fen: string, moveNumber: number): 'opening' | 'middlegame' | 'endgame' {
  if (moveNumber <= 6) return 'opening';
  const chess = new Chess(fen);
  let n = 0;
  for (const row of chess.board()) for (const sq of row) if (sq && sq.type !== 'p' && sq.type !== 'k') n++;
  return n <= 6 ? 'endgame' : 'middlegame';
}

export interface AnalysisRow {
  move_number: number;
  color: 'w' | 'b';
  san: string;
  fen_before: string;
  eval_before: number;
  eval_after: number;
  classification: string;
  win_before: number;
  win_after: number;
  loss: number;
}

export interface DecisiveMove {
  moveNumber: number;
  san: string;
  phase: string;
  loss: number;
  cls: string;
  clockLeft: number | null;
}

export interface GameInsightResult {
  myColor: 'w' | 'b';
  result: string;
  decisive: DecisiveMove | null;
  missedWin: boolean;
  maxMyWin: number | null;
  errorsByPhase: { opening: number; middlegame: number; endgame: number };
  timeTrouble: boolean;
  avgTimeByPhase: { opening: number | null; middlegame: number | null; endgame: number | null };
}

const plyOf = (r: AnalysisRow) => (r.move_number - 1) * 2 + (r.color === 'w' ? 0 : 1);
const mine = (rows: AnalysisRow[], C: 'w' | 'b') =>
  rows.filter(r => r.color === C).sort((a, b) => a.move_number - b.move_number);
const myWin = (r: AnalysisRow, C: 'w' | 'b') => C === 'w' ? +r.win_before : 1 - +r.win_before;
const myWinAfter = (r: AnalysisRow, C: 'w' | 'b') => C === 'w' ? +r.win_after : 1 - +r.win_after;

const avg = (a: number[]) => a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : null;

/**
 * Итоги одной партии для «Где я теряю очки».
 * decisive — переломный ход: первый мой ход, после которого шанс упал с ≥ 0.40 до ≤ 0.25;
 *            нет такого и партия проиграна — мой ход с наибольшей потерей (если потеря ≥ 0.10); победа — null.
 * missedWin — два моих хода подряд с шансом ≥ 0.75, а партия не выиграна.
 */
export function gameInsight(
  game: { color: string; result: string; pgn?: string },
  rows: AnalysisRow[]
): GameInsightResult {
  const C: 'w' | 'b' = game.color === 'white' ? 'w' : 'b';
  const my = mine(rows, C);
  const clocks = parseClocks(game.pgn ?? '');
  const tc = parseTimeControl(game.pgn ?? '');
  const spent = tc && clocks.length ? timeSpent(clocks, tc) : [];

  let d: AnalysisRow | null = null;
  if (game.result !== 'win') {
    d = my.find(r => myWin(r, C) >= 0.40 && myWinAfter(r, C) <= 0.25) ?? null;
    if (!d && game.result === 'loss') {
      const m = [...my].sort((a, b) => +b.loss - +a.loss)[0];
      if (m && +m.loss >= 0.10) d = m;
    }
  }

  const decisive: DecisiveMove | null = d ? {
    moveNumber: d.move_number,
    san: d.san,
    phase: detectPhase(d.fen_before, d.move_number),
    loss: +d.loss,
    cls: d.classification,
    clockLeft: clocks.length > plyOf(d) ? clocks[plyOf(d)] : null,
  } : null;

  let missedWin = false;
  for (let i = 0; i + 1 < my.length; i++) {
    if (myWin(my[i], C) >= 0.75 && myWin(my[i + 1], C) >= 0.75) {
      missedWin = game.result !== 'win';
      break;
    }
  }

  const errorsByPhase = { opening: 0, middlegame: 0, endgame: 0 };
  const timeByPhase: { opening: number[]; middlegame: number[]; endgame: number[] } = { opening: [], middlegame: [], endgame: [] };

  for (const r of my) {
    const ph = detectPhase(r.fen_before, r.move_number) as keyof typeof errorsByPhase;
    if (r.classification === 'mistake' || r.classification === 'blunder') errorsByPhase[ph]++;
    if (spent.length > plyOf(r)) timeByPhase[ph].push(spent[plyOf(r)]);
  }

  return {
    myColor: C,
    result: game.result,
    decisive,
    missedWin,
    maxMyWin: my.length ? Math.max(...my.map(r => myWin(r, C))) : null,
    errorsByPhase,
    timeTrouble: !!(decisive && decisive.clockLeft != null && decisive.clockLeft < 60),
    avgTimeByPhase: {
      opening: avg(timeByPhase.opening),
      middlegame: avg(timeByPhase.middlegame),
      endgame: avg(timeByPhase.endgame),
    },
  };
}
