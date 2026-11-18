import { Chess } from 'chess.js';
import type { Move, Square, Color, PieceSymbol } from 'chess.js';

// Piece values in pawns
export const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

export function material(fen: string, side: Color): number {
  let s = 0;
  for (const row of new Chess(fen).board())
    for (const q of row)
      if (q) s += (q.color === side ? 1 : -1) * VAL[q.type];
  return s;
}

export function squaresOf(chess: Chess | string, color: Color, types: PieceSymbol[]): Square[] {
  const c = typeof chess === 'string' ? new Chess(chess) : chess;
  const out: Square[] = [];
  for (const row of c.board())
    for (const q of row)
      if (q && q.color === color && types.includes(q.type)) out.push(q.square);
  return out;
}

export function kingSquare(chess: Chess, color: Color): Square {
  return squaresOf(chess, color, ['k'])[0];
}

export function dist(a: string, b: string): number {
  return Math.max(
    Math.abs(a.charCodeAt(0) - b.charCodeAt(0)),
    Math.abs(Number(a[1]) - Number(b[1]))
  );
}

export function nullFen(fen: string): string {
  const p = fen.split(' ');
  p[1] = other(p[1] as Color);
  p[3] = '-';
  return p.join(' ');
}

export function uciOf(m: Move): string {
  return m.from + m.to + (m.promotion || '');
}

// Play a UCI line. Returns positions (fens[0] = start) and chess.js verbose moves.
export function play(fen: string, ucis: string[], n: number = ucis.length): { fens: string[]; moves: Move[]; sans: string[] } {
  const c = new Chess(fen);
  const fens = [c.fen()];
  const moves: Move[] = [];
  for (const u of ucis.slice(0, n)) {
    let m: Move | null = null;
    try {
      m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
    } catch {
      m = null;
    }
    if (!m) break;
    moves.push(m);
    fens.push(c.fen());
  }
  return { fens, moves, sans: moves.map(m => m.san) };
}

// SEE: how much net material the side-to-move gains by capturing on sq.
// 0 means capturing is unfavourable or impossible.
// Only legal captures are used → pins and checks are accounted for.
export function see(fen: string, sq: string): number {
  const c = new Chess(fen);
  const target = c.get(sq as Square);
  if (!target) return 0;
  const cost = (t: string) => (t === 'k' ? 100 : VAL[t]);
  const gains: number[] = [];
  let onSquare = VAL[target.type];
  let d = 0;
  for (;;) {
    const caps = c.moves({ verbose: true }).filter(m => m.to === sq && m.captured);
    if (!caps.length) break;
    caps.sort((a, b) => cost(a.piece) - cost(b.piece));
    gains[d] = onSquare - (d ? gains[d - 1] : 0);
    onSquare = VAL[caps[0].promotion || caps[0].piece];
    c.move(caps[0]);
    d++;
  }
  if (!d) return 0;
  while (--d > 0) gains[d - 1] = -Math.max(-gains[d - 1], gains[d]);
  return Math.max(0, gains[0]);
}

// A piece is doomed if the opponent can already win it (SEE at their turn >= 2)
// and none of its moves (except sacUci) escape to a safe square.
export function doomed(fen: string, sq: string, sacUci: string): boolean {
  if (see(nullFen(fen), sq) < 2) return false;
  for (const m of new Chess(fen).moves({ square: sq as Square, verbose: true })) {
    if (uciOf(m) === sacUci) continue;
    const c = new Chess(fen);
    c.move(m);
    if (see(c.fen(), m.to) < 2) return false;
  }
  return true;
}
