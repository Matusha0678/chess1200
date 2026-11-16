// Pure helpers and types for the "Банк ошибок" feature — no React.

import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MistakeTag = 'hanging' | 'missed_check' | 'missed_tactic' | 'positional';
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface MistakeCard {
  id: string;
  game_id: string;
  game_analysis_id: string | null;
  fen_before: string;
  my_move: string;        // SAN
  best_move: string;      // UCI
  eval_before: number | null;
  eval_loss: number;
  phase: GamePhase;
  tag: MistakeTag;
  mastery: number;
  correct_count: number;
  incorrect_count: number;
  last_practiced: string | null;
  next_review: string;
  created_at: string;
}

export interface GameAnalysis {
  id: string;
  game_id: string;
  move_number: number;
  color: 'w' | 'b';
  san: string;
  fen_before: string;
  eval_before: number | null;
  eval_after: number | null;
  best_move: string;
}

export interface ParsedMove {
  san: string;
  fen_before: string;
  fen_after: string;
  eval_after_cp: number | null;
  move_number: number;
  color: 'w' | 'b';
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const TAG_LABEL: Record<MistakeTag, string> = {
  hanging:        'Зевок фигуры',
  missed_check:   'Пропущенный шах/взятие',
  missed_tactic:  'Пропущенная тактика',
  positional:     'Позиционная',
};

export const PHASE_LABEL: Record<GamePhase, string> = {
  opening:     'Дебют',
  middlegame:  'Миттельшпиль',
  endgame:     'Эндшпиль',
};

// ── Spaced repetition ─────────────────────────────────────────────────────────

export function nextReviewDate(mastery: number): string {
  const days: Record<number, number> = { 0: 1, 1: 3, 2: 7, 3: 14, 4: 30, 5: 60 };
  const d = new Date();
  d.setDate(d.getDate() + (days[mastery] ?? 1));
  return d.toISOString();
}

// ── Phase detection ───────────────────────────────────────────────────────────

export function detectPhase(fen: string, moveNumber: number): GamePhase {
  if (moveNumber <= 6) return 'opening';
  const chess = new Chess(fen);
  const board = chess.board();
  let nonPawnNonKing = 0;
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.type !== 'p' && sq.type !== 'k') nonPawnNonKing++;
    }
  }
  if (nonPawnNonKing <= 6) return 'endgame';
  return 'middlegame';
}

// ── Mistake classification ────────────────────────────────────────────────────

export function classifyMistake(
  fenBefore: string,
  myMoveSan: string,
  bestMoveUci: string,
): MistakeTag {
  try {
    // 1. After my move, check for hanging pieces
    const chessAfterMine = new Chess(fenBefore);
    const myMoveResult = chessAfterMine.move(myMoveSan);
    if (!myMoveResult) return 'positional';

    const myColor = myMoveResult.color; // color of the user who moved
    const oppColor = myColor === 'w' ? 'b' : 'w';
    const board = chessAfterMine.board();
    const FILES = 'abcdefgh';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        if (piece.color !== myColor) continue;
        if (piece.type === 'p' || piece.type === 'k') continue;
        const sqName = (FILES[c] + (8 - r)) as Square;
        const attackedByOpp = chessAfterMine.isAttacked(sqName, oppColor);
        const defendedByMe = chessAfterMine.isAttacked(sqName, myColor);
        if (attackedByOpp && !defendedByMe) return 'hanging';
      }
    }

    // 2. Best move results in check
    if (bestMoveUci.length >= 4) {
      const chessBest = new Chess(fenBefore);
      const fromSq = bestMoveUci.slice(0, 2) as Square;
      const toSq = bestMoveUci.slice(2, 4) as Square;
      const promotion = bestMoveUci.length === 5 ? bestMoveUci[4] as 'q' | 'r' | 'b' | 'n' : undefined;
      const bestResult = chessBest.move({ from: fromSq, to: toSq, promotion });
      if (bestResult && chessBest.inCheck()) return 'missed_check';

      // 3. Best move is a capture
      if (bestResult && bestResult.captured) return 'missed_tactic';
    }

    return 'positional';
  } catch {
    return 'positional';
  }
}

// ── PGN parser ────────────────────────────────────────────────────────────────

export function parsePgnMoves(pgn: string): ParsedMove[] {
  // Strip headers (lines starting with [)
  const body = pgn
    .split('\n')
    .filter(line => !line.trim().startsWith('['))
    .join(' ')
    .trim();

  // Match SAN tokens and their optional comments
  // Pattern: castling first (longest), then standard SAN, then capture comment
  const movePattern = /(O-O-O[+#!?]*|O-O[+#!?]*|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#!?]*)\s*(?:\{([^}]*)\})?/g;

  const chess = new Chess();
  const results: ParsedMove[] = [];
  let match: RegExpExecArray | null;

  while ((match = movePattern.exec(body)) !== null) {
    const san = match[1]
      .replace(/[!?]+$/, '') // strip annotation characters
      .trim();
    const comment = match[2] ?? '';

    // Parse eval from comment: [%eval #?(-?\d+\.?\d*)]
    let evalCp: number | null = null;
    const evalMatch = comment.match(/\[%eval\s+(#)?(-?\d+\.?\d*)\]/);
    if (evalMatch) {
      if (evalMatch[1] === '#') {
        // Mate annotation
        const mateIn = parseFloat(evalMatch[2]);
        evalCp = mateIn > 0 ? 9000 : -9000;
      } else {
        evalCp = Math.round(parseFloat(evalMatch[2]) * 100);
      }
    }

    const fenBefore = chess.fen();
    const colorToMove = chess.turn();
    // Calculate move_number (chess move number, not ply)
    const moveNumber = chess.moveNumber();

    let result;
    try {
      result = chess.move(san);
    } catch {
      // If chess.js can't parse this token as a move, skip it
      continue;
    }

    if (!result) continue;

    const fenAfter = chess.fen();
    results.push({
      san: result.san,
      fen_before: fenBefore,
      fen_after: fenAfter,
      eval_after_cp: evalCp,
      move_number: moveNumber,
      color: colorToMove as 'w' | 'b',
    });
  }

  return results;
}
