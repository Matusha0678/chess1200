// Pure helpers and types for the "Банк ошибок" feature — no React.

import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MistakeTag = 'hanging' | 'missed_check' | 'missed_tactic' | 'positional' | 'deviation';
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface MistakeCard {
  id: string;
  game_id: string | null;
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
  deviation:      'Отклонение',
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
  const loader = new Chess();
  try {
    loader.loadPgn(pgn);
  } catch {
    return [];
  }

  const history = loader.history({ verbose: true });
  if (!history.length) return [];

  const fenHeader = loader.header()['FEN'];
  const replay = fenHeader ? new Chess(fenHeader) : new Chess();
  const results: ParsedMove[] = [];

  for (const h of history) {
    const fen_before = replay.fen();
    const colorToMove = replay.turn() as 'w' | 'b';
    const moveNumber = replay.moveNumber();

    try {
      replay.move(h.san);
    } catch {
      break;
    }

    results.push({
      san: h.san,
      fen_before,
      fen_after: replay.fen(),
      eval_after_cp: null,
      move_number: moveNumber,
      color: colorToMove,
    });
  }

  return results;
}
