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
 * Returns the squares of pieces with `attackerColor` that attack `square`.
 * Uses chess.js native attackers() — no FEN tricks, handles pins correctly.
 */
export function getSquareAttackers(fen: string, square: Square, attackerColor: 'w' | 'b'): Square[] {
  try {
    return new Chess(fen).attackers(square, attackerColor);
  } catch {
    return [];
  }
}

/**
 * Simplified SEE: how many centipawns the opponent wins by capturing on `square`.
 *
 * Logic:
 *   – No attackers            → 0 (nobody is even threatening)
 *   – Attackers, no defenders → full piece value (free capture)
 *   – Attackers + defenders   → max(0, target − cheapest attacker)
 *
 * Returns 0 if the capture is not profitable.
 */
export function materialGain(fen: string, square: Square, attackerColor: 'w' | 'b'): number {
  try {
    const chess = new Chess(fen);
    const target = chess.get(square);
    if (!target) return 0;

    const targetVal = PIECE_VALUE[target.type] ?? 0;
    const myColor: 'w' | 'b' = attackerColor === 'w' ? 'b' : 'w';

    // 1. Any attackers at all?
    const attackers = chess.attackers(square, attackerColor);
    if (attackers.length === 0) return 0;

    // 2. Find cheapest attacker
    let cheapestAtkVal = Infinity;
    for (const sq of attackers) {
      const p = chess.get(sq);
      if (!p) continue;
      const v = PIECE_VALUE[p.type] ?? 0;
      if (v < cheapestAtkVal) cheapestAtkVal = v;
    }
    if (cheapestAtkVal === Infinity) return 0;

    // 3. Defenders?
    const defenders = chess.attackers(square, myColor);
    if (defenders.length === 0) return targetVal; // free capture

    // 4. Contested: gain = target − cheapest attacker (if positive)
    return Math.max(0, targetVal - cheapestAtkVal);
  } catch {
    return 0;
  }
}

// ── Fork detection ────────────────────────────────────────────────────────────

/**
 * Returns [attacker, [target1, target2, ...]] pairs where a single opponent
 * piece attacks two or more of my pieces simultaneously.
 * King is included as a fork target (opponent attacking king + piece = check+fork).
 */
export function findForkedSquares(fen: string, myColor: 'w' | 'b'): Array<{ attacker: Square; targets: Square[] }> {
  const chess = new Chess(fen);
  const board = chess.board();
  const oppColor: 'w' | 'b' = myColor === 'w' ? 'b' : 'w';

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

  const attackerTargets = new Map<Square, Square[]>();
  for (const mySq of myPieceSquares) {
    for (const atk of chess.attackers(mySq, oppColor)) {
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
 * Returns:
 *   - check    — my king is attacked (always reported)
 *   - hanging  — opponent can win ≥ 100 cp; king excluded from hanging
 *   - fork     — single opponent piece attacks 2+ of my pieces
 */
export function findThreats(fen: string, myColor: 'w' | 'b'): Threat[] {
  const chess = new Chess(fen);
  const oppColor: 'w' | 'b' = myColor === 'w' ? 'b' : 'w';
  const threats: Threat[] = [];
  const FILES = 'abcdefgh';
  const board = chess.board();

  // 1. Find my king square
  let kingSq: Square | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === myColor && p.type === 'k') {
        kingSq = (FILES[c] + (8 - r)) as Square;
      }
    }
  }

  // 2. Check
  if (kingSq && chess.isAttacked(kingSq, oppColor)) {
    threats.push({
      type: 'check',
      square: kingSq,
      attackers: chess.attackers(kingSq, oppColor),
      gainCp: 0,
    });
  }

  // 3. Hanging pieces (king excluded — it can't "hang")
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== myColor || p.type === 'k') continue;
      const sq = (FILES[c] + (8 - r)) as Square;
      const gain = materialGain(fen, sq, oppColor);
      if (gain >= 100) {
        // Don't duplicate a square already in check list
        if (!threats.some(t => t.square === sq)) {
          threats.push({
            type: 'hanging',
            square: sq,
            attackers: chess.attackers(sq, oppColor),
            gainCp: gain,
          });
        }
      }
    }
  }

  // 4. Forks
  const forks = findForkedSquares(fen, myColor);
  for (const { attacker, targets } of forks) {
    const totalGain = targets.reduce((sum, t) => {
      const p2 = chess.get(t);
      return sum + (p2 ? (PIECE_VALUE[p2.type] ?? 0) : 0);
    }, 0);
    if (totalGain >= 200) {
      const newTargets = targets.filter(t =>
        !threats.some(th => th.square === t && th.type === 'hanging'),
      );
      if (newTargets.length >= 2 || targets.length >= 2) {
        threats.push({ type: 'fork', square: targets[0], attackers: [attacker], gainCp: totalGain });
      }
    }
  }

  return threats;
}

// ── Explanation helpers ───────────────────────────────────────────────────────

function pluralPawns(cp: number): string {
  const n = Math.round(cp / 100);
  if (n === 1) return '1 пешку';
  if (n >= 2 && n <= 4) return `${n} пешки`;
  return `${n} пешек`;
}

export function threatExplanation(threat: Threat, fen: string): string {
  const chess = new Chess(fen);

  if (threat.type === 'check') {
    return `Король под шахом! Клетка ${threat.square.toUpperCase()} атакована.`;
  }

  if (threat.type === 'hanging') {
    const piece = chess.get(threat.square);
    const name = piece ? PIECE_NAME[piece.type] : 'фигура';
    return `${name} на ${threat.square.toUpperCase()} висит — противник выигрывает ${pluralPawns(threat.gainCp)}.`;
  }

  if (threat.type === 'fork') {
    const attacker = chess.get(threat.attackers[0]);
    const atkName = attacker ? PIECE_NAME[attacker.type] : 'фигура';
    return `Вилка! ${atkName} на ${threat.attackers[0].toUpperCase()} атакует несколько фигур одновременно.`;
  }

  return 'Угроза обнаружена.';
}

const PIECE_NAME: Record<string, string> = {
  p: 'Пешка', n: 'Конь', b: 'Слон', r: 'Ладья', q: 'Ферзь', k: 'Король',
};
