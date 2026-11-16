// Pure threat-detection helpers using chess.js only — no Stockfish.

import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

export type ThreatType = 'check' | 'hanging' | 'fork';

export interface Threat {
  type: ThreatType;
  square: Square;         // my piece that is under threat
  attackers: Square[];    // squares of opponent pieces delivering the threat
  gainCp: number;         // material at stake (centipawns)
}

// ── Material values ───────────────────────────────────────────────────────────

const PIECE_VALUE: Record<string, number> = {
  p: 100, n: 300, b: 300, r: 500, q: 900, k: 20000,
};

// ── Low-level helpers ─────────────────────────────────────────────────────────

/**
 * Returns the squares of pieces with `attackerColor` that can capture on `square`
 * in the given position. Uses the FEN side-switching trick so chess.js generates
 * the opponent's pseudo-legal moves.
 */
export function getSquareAttackers(fen: string, square: Square, attackerColor: 'w' | 'b'): Square[] {
  const parts = fen.split(' ');
  parts[1] = attackerColor;
  parts[3] = '-'; // clear en passant to avoid spurious pawn captures
  const switchedFen = parts.join(' ');

  let chess: Chess;
  try {
    chess = new Chess(switchedFen);
  } catch {
    return [];
  }

  return chess
    .moves({ verbose: true })
    .filter(m => m.to === square)
    .map(m => m.from as Square);
}

/**
 * Minimum-value attacker of `attackerColor` on `square`.
 * Returns the piece type char or null if none.
 */
function minAttacker(fen: string, square: Square, attackerColor: 'w' | 'b'): string | null {
  const attackers = getSquareAttackers(fen, square, attackerColor);
  if (attackers.length === 0) return null;

  const chess = new Chess(fen);
  let minVal = Infinity;
  let minType: string | null = null;

  for (const sq of attackers) {
    const p = chess.get(sq);
    if (!p) continue;
    const v = PIECE_VALUE[p.type] ?? 0;
    if (v < minVal) { minVal = v; minType = p.type; }
  }

  return minType;
}

/**
 * Simplified SEE: how many centipawns the opponent wins by capturing on `square`.
 * Returns 0 if the capture is not profitable.
 */
export function materialGain(fen: string, square: Square, attackerColor: 'w' | 'b'): number {
  const chess = new Chess(fen);
  const target = chess.get(square);
  if (!target) return 0;

  const targetVal = PIECE_VALUE[target.type] ?? 0;
  const myColor = attackerColor === 'w' ? 'b' : 'w';

  // If the square is undefended, any capture wins the full piece
  const defenders = getSquareAttackers(fen, square, myColor);
  if (defenders.length === 0) return targetVal;

  // Else: gain = captured – cheapest attacker (we might recapture, but opponent must commit)
  const atkType = minAttacker(fen, square, attackerColor);
  if (!atkType) return 0;
  const atkVal = PIECE_VALUE[atkType] ?? 0;

  return Math.max(0, targetVal - atkVal);
}

// ── Fork detection ────────────────────────────────────────────────────────────

/**
 * Returns [attacker, [target1, target2, ...]] pairs where a single opponent
 * piece attacks two or more of my pieces simultaneously.
 */
export function findForkedSquares(fen: string, myColor: 'w' | 'b'): Array<{ attacker: Square; targets: Square[] }> {
  const chess = new Chess(fen);
  const board = chess.board();
  const oppColor: 'w' | 'b' = myColor === 'w' ? 'b' : 'w';

  // Collect squares of my pieces (excluding king — we'll add it back for forks)
  const myPieceSquares: Square[] = [];
  const FILES = 'abcdefgh';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === myColor) {
        myPieceSquares.push((FILES[c] + (8 - r)) as Square);
      }
    }
  }

  // Build attacker → targets map
  const attackerTargets = new Map<Square, Square[]>();

  for (const mySq of myPieceSquares) {
    const attackers = getSquareAttackers(fen, mySq, oppColor);
    for (const atk of attackers) {
      const list = attackerTargets.get(atk) ?? [];
      list.push(mySq);
      attackerTargets.set(atk, list);
    }
  }

  const result: Array<{ attacker: Square; targets: Square[] }> = [];
  for (const [atk, targets] of attackerTargets) {
    if (targets.length >= 2) result.push({ attacker: atk, targets });
  }
  return result;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Finds all significant threats the opponent has in `fen` against `myColor`.
 *
 * "Significant" means:
 *   - check (always)
 *   - hanging: opponent can win ≥ 100 cp of material
 *   - fork: a single opponent piece attacks 2+ of my pieces
 */
export function findThreats(fen: string, myColor: 'w' | 'b'): Threat[] {
  const chess = new Chess(fen);
  const oppColor: 'w' | 'b' = myColor === 'w' ? 'b' : 'w';
  const threats: Threat[] = [];
  const FILES = 'abcdefgh';

  // 1. Check — the king is in check (position is after opponent's move)
  //    chess.js fen represents the side TO MOVE; we need to know if myColor king is attacked.
  //    Trick: switch side to myColor so chess.inCheck() reflects opponent attacking my king.
  {
    const parts = fen.split(' ');
    parts[1] = myColor;
    try {
      const c2 = new Chess(parts.join(' '));
      if (c2.inCheck()) {
        // Find my king square
        const board = chess.board();
        let kingSq: Square | null = null;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.color === myColor && p.type === 'k') {
              kingSq = (FILES[c] + (8 - r)) as Square;
            }
          }
        }
        if (kingSq) {
          const attackers = getSquareAttackers(fen, kingSq, oppColor);
          threats.push({ type: 'check', square: kingSq, attackers, gainCp: 0 });
        }
      }
    } catch { /* invalid fen variant */ }
  }

  // 2. Hanging / material threats
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== myColor) continue;
      const sq = (FILES[c] + (8 - r)) as Square;
      const gain = materialGain(fen, sq, oppColor);
      if (gain >= 100) {
        const attackers = getSquareAttackers(fen, sq, oppColor);
        // Avoid duplicating a check threat already added
        if (!threats.some(t => t.square === sq && t.type === 'check')) {
          threats.push({ type: 'hanging', square: sq, attackers, gainCp: gain });
        }
      }
    }
  }

  // 3. Forks
  const forks = findForkedSquares(fen, myColor);
  for (const { attacker, targets } of forks) {
    // Only add fork if the total material at stake is significant (≥ 200 cp)
    // and not already covered by hanging threats
    const totalGain = targets.reduce((sum, t) => {
      const p2 = chess.get(t);
      return sum + (p2 ? (PIECE_VALUE[p2.type] ?? 0) : 0);
    }, 0);
    if (totalGain >= 200) {
      const forkTargets = targets.filter(t =>
        !threats.some(th => th.square === t && th.type === 'hanging'),
      );
      if (forkTargets.length >= 2 || targets.length >= 2) {
        threats.push({ type: 'fork', square: targets[0], attackers: [attacker], gainCp: totalGain });
      }
    }
  }

  return threats;
}

// ── Explanation helpers ───────────────────────────────────────────────────────

export function threatExplanation(threat: Threat, fen: string): string {
  const chess = new Chess(fen);

  if (threat.type === 'check') {
    return `Король под шахом! Клетка ${threat.square.toUpperCase()} атакована.`;
  }

  if (threat.type === 'hanging') {
    const piece = chess.get(threat.square);
    const name = piece ? PIECE_NAME[piece.type] : 'фигура';
    const gain = Math.round(threat.gainCp / 100);
    return `${name} на ${threat.square.toUpperCase()} висит — противник выигрывает ${gain} пешки материала.`;
  }

  if (threat.type === 'fork') {
    const attacker = chess.get(threat.attackers[0]);
    const atkName = attacker ? PIECE_NAME[attacker.type] : 'фигура';
    const targets = threat.attackers.length > 0
      ? ` атакует несколько фигур одновременно`
      : '';
    return `Вилка! ${atkName} на ${threat.attackers[0].toUpperCase()}${targets}.`;
  }

  return 'Угроза обнаружена.';
}

const PIECE_NAME: Record<string, string> = {
  p: 'Пешка', n: 'Конь', b: 'Слон', r: 'Ладья', q: 'Ферзь', k: 'Король',
};
