import { Chess, type Square } from 'chess.js';

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export function pieceValue(p: string): number {
  return PIECE_VALUES[p] ?? 0;
}

export function pieceName(p: string): string {
  switch (p.toLowerCase()) {
    case 'p': return 'пешку';
    case 'n': return 'коня';
    case 'b': return 'слона';
    case 'r': return 'ладью';
    case 'q': return 'ферзя';
    case 'k': return 'короля';
    default:  return 'фигуру';
  }
}

/** True if move gives up material: upward exchange OR piece moves to attacked square. */
export function isSacrifice(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to   = uci.slice(2, 4);
    const m = chess.moves({ verbose: true }).find(mv => mv.from === from && mv.to === to);
    if (!m) return false;
    const movedVal = pieceValue(m.piece);
    if (m.captured) {
      const capVal = pieceValue(m.captured);
      if (movedVal > capVal) return true;
    }
    chess.move({ from, to, promotion: m.promotion });
    const opp = m.color === 'w' ? 'b' : 'w';
    return chess.isAttacked(to as Square, opp);
  } catch { return false; }
}

/** Describe what a move does: capture, check, sacrifice. */
export interface MoveTraits {
  capturedPiece?: string;  // lowercase piece letter
  isCheck:        boolean;
  isSac:          boolean;
  isMate:         boolean;
  movedPiece?:    string;
}

export function describeMove(fen: string, uci: string): MoveTraits {
  const out: MoveTraits = { isCheck: false, isSac: false, isMate: false };
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to   = uci.slice(2, 4);
    const m = chess.moves({ verbose: true }).find(mv => mv.from === from && mv.to === to);
    if (!m) return out;
    out.movedPiece = m.piece;
    if (m.captured) out.capturedPiece = m.captured;
    chess.move({ from, to, promotion: m.promotion });
    out.isCheck = chess.inCheck();
    out.isMate  = chess.isCheckmate();
    out.isSac   = isSacrifice(fen, uci);
  } catch {}
  return out;
}

/** Convert UCI → SAN using chess.js (returns UCI unchanged on failure). */
export function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const r = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
    return r?.san ?? uci;
  } catch { return uci; }
}
