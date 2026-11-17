// Pure move-classification helpers — no React, no Stockfish calls.

export type MoveClass =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good'
  | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';

export interface ClassifyInput {
  evalBefore: number;         // eval of position before move, white's POV (cp)
  evalAfter: number;          // eval of position after actual move, white's POV (cp)
  evalSecondBest?: number;    // eval after 2nd-best move from same position, white's POV
  color: 'w' | 'b';
  isEngineMove: boolean;      // player played the engine's top-1 move
  plyNumber: number;          // 1-based half-move count (1 = white's first move)
  phase: 'opening' | 'middlegame' | 'endgame';
  hasRealSacrifice?: boolean; // piece left hanging ≥300 cp after move
  isRecapture?: boolean;      // move recaptured on the square just vacated
  isOnlyLegalMove?: boolean;  // only legal reply in the position
  opponentPrevLoss?: number;  // opponent's mover-loss on the immediately prior half-move
}

// ── Core formula ──────────────────────────────────────────────────────────────

/** Convert centipawns to win probability from white's perspective. */
export function winProb(cp: number): number {
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

/**
 * Lichess-style accuracy from an array of mover's win-probability losses (0–1).
 * Returns 0–100.
 */
export function computeAccuracy(losses: number[]): number {
  if (!losses.length) return 100;
  const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avg * 100) - 3.1669));
}

// ── Phase strictness ──────────────────────────────────────────────────────────

// Opening is more lenient (×1.5), endgame is stricter (×0.7).
// Applied only to the five standard thresholds; not to brilliant/great/book/miss.
const STRICTNESS: Record<string, number> = { opening: 1.5, middlegame: 1.0, endgame: 0.7 };

// ── Main classifier ───────────────────────────────────────────────────────────

export function classifyMove(input: ClassifyInput): MoveClass {
  const {
    evalBefore, evalAfter, evalSecondBest, color,
    isEngineMove, plyNumber, phase,
    hasRealSacrifice, isRecapture, isOnlyLegalMove, opponentPrevLoss,
  } = input;

  const wpBefore = winProb(evalBefore);
  const wpAfter  = winProb(evalAfter);

  // Mover's win-probability (before = best case, after = actual result)
  const mWpBefore = color === 'w' ? wpBefore : 1 - wpBefore;
  const mWpAfter  = color === 'w' ? wpAfter  : 1 - wpAfter;
  const loss      = Math.max(0, mWpBefore - mWpAfter);

  const s = STRICTNESS[phase] ?? 1.0;

  // ── 1. Brilliant: best/excellent + real sacrifice + balanced position ─────
  if ((isEngineMove || loss <= 0.02) && hasRealSacrifice) {
    if (mWpBefore >= 0.45 && mWpBefore <= 0.90) return 'brilliant';
  }

  // ── 2. Great: best/excellent + only good move + not winning/losing ────────
  if (
    (isEngineMove || loss <= 0.02) &&
    evalSecondBest !== undefined &&
    !isRecapture && !isOnlyLegalMove
  ) {
    const mWpSecond = color === 'w' ? winProb(evalSecondBest) : 1 - winProb(evalSecondBest);
    if (
      mWpBefore - mWpSecond >= 0.15 &&
      mWpBefore <= 0.95 &&
      mWpBefore >= 0.02
    ) return 'great';
  }

  // ── 3. Book: first 8 half-moves with minimal loss ─────────────────────────
  if (plyNumber <= 8 && loss <= 0.02) return 'book';

  // ── 4. Miss: opponent blundered previous move, I didn't capitalise ────────
  if (
    opponentPrevLoss !== undefined && opponentPrevLoss >= 0.10 &&
    mWpBefore >= 0.70 &&
    loss >= 0.10 &&
    mWpAfter >= 0.40
  ) return 'miss';

  // ── 5. Standard (with phase strictness) ──────────────────────────────────
  if (isEngineMove || loss < 0.005 * s) return 'best';
  if (loss <= 0.02 * s)                  return 'excellent';
  if (loss <= 0.05 * s)                  return 'good';
  if (loss <= 0.10 * s)                  return 'inaccuracy';
  if (loss <= 0.20 * s)                  return 'mistake';
  return 'blunder';
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const CLASS_LABEL: Record<MoveClass, string> = {
  brilliant:  'Блестящий',
  great:      'Отличный',
  best:       'Лучший',
  excellent:  'Очень хороший',
  good:       'Хороший',
  book:       'Теория',
  inaccuracy: 'Неточность',
  mistake:    'Ошибка',
  miss:       'Упущенный шанс',
  blunder:    'Зевок',
};

export const CLASS_SYMBOL: Record<MoveClass, string> = {
  brilliant:  '!!',
  great:      '!',
  best:       '★',
  excellent:  '',
  good:       '',
  book:       '',
  inaccuracy: '?!',
  mistake:    '?',
  miss:       '⊘',
  blunder:    '??',
};

/** CSS colour token for each class badge. */
export const CLASS_COLOR: Record<MoveClass, string> = {
  brilliant:  '#3ccfcf',
  great:      '#5b9cf6',
  best:       '#81b64c',
  excellent:  '#a8d57a',
  good:       '#a8d57a',
  book:       '#a07850',
  inaccuracy: '#e6c84a',
  mistake:    '#e09040',
  miss:       '#e06030',
  blunder:    '#d9534f',
};
