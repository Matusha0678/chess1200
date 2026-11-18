import { Chess } from 'chess.js';
import type { Move, Square, Color } from 'chess.js';
import { VAL, other, material, squaresOf, kingSquare, dist, nullFen, uciOf, play, see, doomed } from './see';
import { isMateFor, forSide, wp, fmtEval } from './engine';
import type { Engine, EngineLine } from './engine';

// ── Types ──────────────────────────────────────────────────────────────────

export interface QuickSacResult {
  ok: boolean;
  reason?: string;
  S?: Color;
  san?: string;
  move?: Move;
  fenAfter?: string;
  sacSquare?: string;
  sacPiece?: string;
  took?: number;
}

export interface SacResult {
  isSac: boolean;
  stage?: string;
  reason?: string;
  type?: 'mate' | 'combination' | 'real';
  kind?: 'works' | 'fails' | null;
  pattern?: string;
  given?: number;
  score?: number;
  settled?: number;
  mate_in?: number | null;
  mate_forced?: boolean;
  keep?: boolean;
  notKept?: string | null;
  defenses?: string[];
  best?: string;
  bestSan?: string;
  alt?: string;
  altSan?: string;
  after?: string;
  accepted?: string;
  deltas?: string;
  S?: Color;
  san?: string;
  sacSquare?: string;
  sacPiece?: string;
}

// ── 1.1 А: quick filter (no engine) ───────────────────────────────────────

export function quickSac(fen: string, uci: string): QuickSacResult {
  const c = new Chess(fen);
  const S = c.turn();
  const piece = c.get(uci.slice(0, 2) as Square);
  if (!piece || piece.color !== S) return { ok: false, reason: 'нет фигуры' };
  if (piece.type === 'p') return { ok: false, reason: 'ход пешкой' };
  if (piece.type === 'k') return { ok: false, reason: 'ход королём' };
  const victim = c.get(uci.slice(2, 4) as Square);
  const took = victim ? VAL[victim.type] : 0;
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  if (c.isCheckmate()) return { ok: false, reason: 'это сразу мат, а не жертва' };
  const fenAfter = c.fen();

  // find the best of my pieces (non-pawn) that opponent can capture with advantage
  let best: { sq: Square; gain: number; d2: number } | null = null;
  for (const sq of squaresOf(c, S, ['n', 'b', 'r', 'q'])) {
    const gain = see(fenAfter, sq);
    if (gain < 2) continue;
    const d2 = took - VAL[c.get(sq)!.type]; // I took − opponent takes from me
    if (d2 > -2) continue;
    const better =
      !best ||
      VAL[c.get(sq)!.type] > VAL[c.get(best.sq)!.type] ||
      (VAL[c.get(sq)!.type] === VAL[c.get(best.sq)!.type] && sq === m.to);
    if (better) best = { sq, gain, d2 };
  }
  if (!best)
    return {
      ok: false,
      reason: took ? 'размен или выгодное взятие' : 'соперник ничего не выигрывает',
    };

  // step 4: desperate piece — already losing it and can't escape
  const origin = best.sq === m.to ? m.from : best.sq;
  if (doomed(fen, origin, uci))
    return { ok: false, reason: 'фигура и так погибала (атакована, уйти некуда)' };

  return {
    ok: true,
    S,
    san: m.san,
    move: m,
    fenAfter,
    sacSquare: best.sq,
    sacPiece: c.get(best.sq)!.type,
    took,
  };
}

// Material delta after position has "settled" (10 half-moves, extended while last was a capture, up to 14)
export function settledDelta(fen: string, line: string[], side: Color): number {
  const p = play(fen, line, 14);
  let k = Math.min(10, p.moves.length);
  while (k < p.moves.length && k < 14 && p.moves[k - 1].captured) k++;
  return material(p.fens[k], side) - material(fen, side);
}

// ── 1.1 Б + 1.2–1.6: full analysis of one candidate ──────────────────────

export async function analyseSac(
  engine: Engine,
  fen: string,
  uci: string,
  { fromMaster = true, before = null }: { fromMaster?: boolean; before?: EngineLine[] | null } = {}
): Promise<SacResult> {
  const q = quickSac(fen, uci);
  if (!q.ok) return { isSac: false, stage: 'фильтр', reason: q.reason };
  const { S, fenAfter, sacSquare, sacPiece } = q;
  const O = other(S!);

  const beforeLines: EngineLine[] = before || (await engine.analyse(fen, { multipv: 2 }));
  const best = beforeLines[0];
  const alt = best.move === uci ? beforeLines[1] : best; // best WITHOUT the sacrifice
  if (!alt) return { isSac: false, stage: 'движок', reason: 'единственный ход' };

  // evaluation of the sacrifice itself — must be from the same root search as best
  const cand: EngineLine =
    best.move === uci
      ? best
      : (await engine.analyse(fen, { multipv: 1, searchmoves: [uci] }))[0];

  const afterLines = await engine.analyse(fenAfter!, { multipv: 2 }); // 2 responses for display
  const caps = new Chess(fenAfter!)
    .moves({ verbose: true })
    .filter(m => m.to === sacSquare && m.captured)
    .map(uciOf);
  if (!caps.length) return { isSac: false, stage: 'движок', reason: 'жертву нельзя взять' };

  const acc = (await engine.analyse(fenAfter!, { multipv: 1, searchmoves: caps }))[0];
  const accLine = [uci, ...acc.pv];
  const accPlay = play(fen, accLine, 12);
  const d = (k: number) =>
    material(accPlay.fens[Math.min(k, accPlay.fens.length - 1)], S!) - material(fen, S!);
  const accMate = isMateFor(acc, S!);

  const resBase = {
    S: S!,
    san: q.san,
    sacSquare,
    sacPiece,
    best: fmtEval(best, S!),
    bestSan: play(fen, [best.move]).sans[0],
    alt: fmtEval(alt, S!),
    altSan: play(fen, [alt.move]).sans[0],
    after: fmtEval(cand, S!),
    accepted: accPlay.sans.slice(0, 8).join(' '),
    deltas: accPlay.fens
      .slice(1, 11)
      .map((_, i) => d(i + 1))
      .join(' '),
  };

  // step 7: material must actually be sacrificed after acceptance
  if (d(2) > -2)
    return { isSac: false as const, stage: 'движок', reason: 'после взятия материал не отдан', ...resBase };
  // step 8: if material is immediately equal again — it's just a trade, not a sacrifice
  if (!accMate && d(4) >= 0 && d(4) <= 1)
    return {
      isSac: false as const,
      stage: 'движок',
      reason: 'материал сразу возвращается — это размен',
      ...resBase,
    };

  // ── definitely a sacrifice; now decide if it's good for the trainer ──

  // 1.2 type
  const mateForced = isMateFor(cand, S!) && Math.abs(cand.mate!) <= 6;
  const mateIfTaken = accMate && Math.abs(acc.mate!) + 1 <= 6;
  const mate_in = mateForced
    ? Math.abs(cand.mate!)
    : mateIfTaken
    ? Math.abs(acc.mate!) + 1
    : null;
  const settled = settledDelta(fen, accLine, S!);
  const type: 'mate' | 'combination' | 'real' = mate_in ? 'mate' : settled >= 0 ? 'combination' : 'real';

  // 1.3 works or fails (by win probability, not raw pawns)
  const wBest = wp(best, S!);
  const wCand = wp(cand, S!);
  const wAlt = wp(alt, S!);
  let kind: 'works' | 'fails' | null = null;
  if (wBest - wCand <= 0.02 && wCand - wAlt >= 0.05 && wCand >= 0.45) kind = 'works';
  else if (wBest - wCand >= 0.1 && wCand <= 0.55) kind = 'fails';

  // 1.4 keep for trainer?
  let notKept: string | null = null;
  if (
    isMateFor(alt, S!) &&
    !(isMateFor(cand, S!) && Math.abs(cand.mate!) < Math.abs(alt.mate!))
  )
    notKept = 'без жертвы есть мат не дольше';
  else if (kind === null) notKept = 'спорно: жертва не явно лучше и не явно хуже';

  // 1.5 pattern
  const c0 = new Chess(fen);
  const oppKing = kingSquare(c0, O);
  const givesCheck = q.san!.includes('+') || q.san!.includes('#');
  const given = -d(2);
  let pattern = 'other';
  if (
    sacPiece === 'b' &&
    q.move!.to === (S === 'w' ? 'h7' : 'h2') &&
    oppKing === (S === 'w' ? 'g8' : 'g1') &&
    givesCheck
  )
    pattern = 'greek_gift';
  else if (q.move!.to === (S === 'w' ? 'f7' : 'f2') && dist(q.move!.to, oppKing) <= 1)
    pattern = 'f7';
  else if (sacPiece === 'q') pattern = 'queen';
  else if (sacPiece === 'r' && given === 2) pattern = 'exchange';
  else if (dist(sacSquare!, oppKing) <= 2) pattern = 'king_attack';

  // 1.6 interest score
  const myChecks = accPlay.moves
    .slice(0, 6)
    .filter((m, i) => i % 2 === 0 && /[+#]/.test(m.san)).length;
  const quiet = !q.move!.captured && !givesCheck;
  const pieces = (col: Color) => squaresOf(c0, col, ['n', 'b', 'r', 'q']);
  const endgame =
    squaresOf(c0, 'w', ['q']).length + squaresOf(c0, 'b', ['q']).length === 0 &&
    pieces('w').length <= 2 &&
    pieces('b').length <= 2;
  const score =
    10 * given +
    (type === 'mate' ? 25 : 0) +
    (pattern !== 'other' ? 10 : 0) +
    (dist(sacSquare!, oppKing) <= 2 ? 10 : 0) +
    5 * Math.min(3, myChecks) +
    (quiet ? 10 : 0) +
    (type === 'real' ? 10 : 0) +
    (fromMaster ? 5 : 0) -
    (endgame ? 15 : 0);

  return {
    isSac: true,
    type,
    kind,
    pattern,
    given,
    score,
    settled,
    mate_in,
    mate_forced: mateForced,
    keep: !notKept && score >= 30,
    notKept: notKept || (score < 30 ? 'неинтересно (score < 30)' : null),
    defenses: afterLines.map(l => play(fenAfter!, l.pv, 5).sans.join(' ')),
    ...resBase,
  };
}

// 1.7: tempting moves for decoys — captures and checks by pieces (not pawns) near the
// opponent's king (≤2 squares) that pass the quick sacrifice filter.
export function temptingMoves(fen: string): string[] {
  const c = new Chess(fen);
  const k = kingSquare(c, other(c.turn() as Color));
  return c
    .moves({ verbose: true })
    .filter(
      m =>
        'nbrq'.includes(m.piece) &&
        (m.captured || /[+#]/.test(m.san)) &&
        dist(m.to, k) <= 2
    )
    .map(uciOf)
    .filter(u => quickSac(fen, u).ok);
}
