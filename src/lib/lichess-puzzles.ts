import { Chess } from 'chess.js';

export interface LichessPuzzleRaw {
  game: { pgn: string };
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    themes: string[];
    solution: string[];
    initialPly: number;
  };
}

export interface ParsedPuzzle {
  id: string;
  rating: number;
  plays: number;
  themes: string[];
  fenStart: string;
  lastMoveUci: string;
  fen: string;
  solverColor: 'w' | 'b';
  solution: string[];
}

/**
 * Задача из ответа /api/puzzle/batch/{angle}.
 * game.pgn — ходы SAN до задачи включительно (initialPly + 1 полуходов).
 * Последний ход pgn делает соперник — его показываем анимацией; потом решает сторона, чей ход.
 * solution — UCI, ходы решающего на чётных местах.
 */
export function parsePuzzle(p: LichessPuzzleRaw): ParsedPuzzle {
  const sans = p.game.pgn.trim().split(/\s+/);
  if (p.puzzle.initialPly + 1 !== sans.length) {
    throw new Error(`initialPly ${p.puzzle.initialPly} не совпадает с pgn (${sans.length} полуходов)`);
  }
  const ch = new Chess();
  for (const s of sans.slice(0, -1)) ch.move(s);
  const fenStart = ch.fen();
  const last = ch.move(sans[sans.length - 1]);
  const fen = ch.fen();

  // Validate solution
  const check = new Chess(fen);
  for (const u of p.puzzle.solution) {
    check.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as 'q' | 'r' | 'b' | 'n' | undefined });
  }

  return {
    id: p.puzzle.id,
    rating: p.puzzle.rating,
    plays: p.puzzle.plays,
    themes: p.puzzle.themes,
    fenStart,
    lastMoveUci: last.from + last.to + (last.promotion ?? ''),
    fen,
    solverColor: ch.turn() as 'w' | 'b',
    solution: p.puzzle.solution,
  };
}
