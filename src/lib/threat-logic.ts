import { Chess } from 'chess.js';
import type { Move, Square, Color } from 'chess.js';
import { VAL, other, material, squaresOf, kingSquare, nullFen, play, uciOf } from './see';
import { isMateFor, forSide, fmtEval } from './engine';
import type { Engine } from './engine';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ThreatResult {
  usable: boolean;
  reason?: string;
  hasThreat?: boolean;
  decoyOk?: boolean;
  T?: string;
  attacker?: string;
  targets?: string[];
  optional?: string[];
  motif?: string;
  title?: string;
  difficulty?: number;
  mate_in?: number | null;
  cur?: string;
  nul?: string;
  gain?: number;
  line?: string;
  threatUci?: string;    // uciOf(T) in UCI notation
  threatPv?: string[];   // nul.pv first 6 moves in UCI
}

// ── Helper: is a piece pinned ──────────────────────────────────────────────

function isPinned(c1: Chess, sq: string, me: Color): boolean {
  const c = new Chess(c1.fen());
  const piece = c.remove(sq as Square);
  if (!piece) return false;
  const opp = other(me);
  const k = kingSquare(c, me);
  if (c.attackers(k, opp).length > new Chess(c1.fen()).attackers(k, opp).length) return true;
  return squaresOf(c, me, ['q']).some(
    qs =>
      qs !== sq &&
      c.attackers(qs, opp).length > new Chess(c1.fen()).attackers(qs, opp).length
  );
}

// ── Helper: is a piece skewered ───────────────────────────────────────────

function isSkewered(c1: Chess, T: Move, sq: string, me: Color): boolean {
  if (!'brq'.includes(T.piece)) return false;
  for (const front of squaresOf(c1, me, ['k', 'q'])) {
    if (!c1.attackers(front, other(me)).includes(T.to)) continue;
    const df = Math.sign(front.charCodeAt(0) - T.to.charCodeAt(0));
    const dr = Math.sign(Number(front[1]) - Number(T.to[1]));
    let f = front.charCodeAt(0) + df;
    let r = Number(front[1]) + dr;
    while (f >= 97 && f <= 104 && r >= 1 && r <= 8) {
      const s = String.fromCharCode(f) + r;
      const p = c1.get(s as Square);
      if (p) return s === sq && p.color === me;
      f += df;
      r += dr;
    }
  }
  return false;
}

// ── Helper: is a piece trapped ────────────────────────────────────────────

function isTrapped(c1: Chess, sq: string, opp: Color): boolean {
  if (!c1.attackers(sq as Square, opp).length) return false;
  const moves = c1.moves({ square: sq as Square, verbose: true });
  return moves.every(m => {
    const c = new Chess(c1.fen());
    c.move(m);
    return c.attackers(m.to, opp).length > 0;
  });
}

// ── 2.3: motif title ──────────────────────────────────────────────────────

export function motifTitle(motif: string, T: Move): string {
  const INSTR: Record<string, string> = {
    p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём',
  };
  const GEN: Record<string, string> = {
    p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля',
  };
  const ACC: Record<string, string> = {
    p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля',
  };
  switch (motif) {
    case 'back_rank': return 'Мат по последней горизонтали';
    case 'mate': return 'Угроза мата';
    case 'fork': return `Вилка ${INSTR[T.piece]}`;
    case 'discovered': return 'Вскрытое нападение';
    case 'skewer': return 'Сквозной удар';
    case 'pin': return 'Связка';
    case 'trapped': return 'Ловля фигуры';
    case 'hanging': return `Зевок ${GEN[T.captured!]}`;
    case 'cheaper': return `Нападение на ${ACC[T.captured!]}`;
    default: return 'Выигрыш материала';
  }
}

// ── 2.1–2.4: analyse a threat in a position where it is my turn ──────────

export async function analyseThreat(engine: Engine, fen: string): Promise<ThreatResult> {
  const c = new Chess(fen);
  const me = c.turn() as Color;
  const opp = other(me);
  if (c.inCheck()) return { usable: false, reason: 'мне шах — не берём' };

  const cur = (await engine.analyse(fen))[0];
  const nf = nullFen(fen);
  const nul = (await engine.analyse(nf))[0];

  // gain = how much opponent benefits from their null move
  const gain = forSide(nul, opp) - forSide(cur, opp);
  const mateNul = isMateFor(nul, opp);
  const line = play(nf, nul.pv, 6);
  const T = line.moves[0];
  if (!T) return { usable: false, reason: 'у соперника нет ходов' };

  const base = {
    cur: fmtEval(cur, me),
    nul: fmtEval(nul, opp),
    gain: Number(gain.toFixed(2)),
    line: line.sans.join(' '),
  };

  const big = gain >= 1.5 || mateNul;
  if (!big) return { usable: true, hasThreat: false, decoyOk: gain < 0.5, ...base };

  const matGain3 = material(line.fens[Math.min(3, line.fens.length - 1)], opp) - material(nf, opp);
  const concrete = !!T.captured || /[+#]/.test(T.san) || mateNul || matGain3 >= 2;
  if (!concrete)
    return { usable: false, reason: 'угроза не конкретная (позиционная)', ...base };

  // 2.2 targets — track where my pieces actually land
  const where: Record<string, string> = {};
  for (const row of new Chess(nf).board())
    for (const q of row)
      if (q && q.color === me) where[q.square] = q.square;

  const captured: Array<{ ply: number; sq: string; type: string }> = [];
  line.moves.forEach((m, i) => {
    if (m.color === me) {
      if (where[m.from]) {
        where[m.to] = where[m.from];
        delete where[m.from];
      }
      return;
    }
    if (m.captured) {
      const capSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
      if (where[capSq]) {
        captured.push({ ply: i + 1, sq: where[capSq], type: m.captured });
        delete where[capSq];
      }
    }
  });

  const required = new Set<string>();
  const optional = new Set<string>();
  const cNull = new Chess(nf);
  const c1 = new Chess(line.fens[1]); // after the threat move (my turn again)
  const myKing = kingSquare(c1, me);

  // (1) what the threat move captures directly
  if (T.captured) required.add(T.to);

  // (2) fork: the moved piece attacks ≥2 valuable targets (king counts)
  const attackedByT = squaresOf(c1, me, ['n', 'b', 'r', 'q', 'k']).filter(sq =>
    c1.attackers(sq as Square, opp).includes(T.to)
  );
  const winnable = attackedByT.filter(sq => {
    const t = c1.get(sq as Square)!.type;
    if (t === 'k') return true;
    return c1.attackers(sq as Square, me).length === 0 || VAL[t] > VAL[T.piece];
  });
  const fork = winnable.length >= 2 && winnable.some(sq => c1.get(sq as Square)!.type !== 'k');
  if (fork) for (const sq of winnable) if (c1.get(sq as Square)!.type !== 'k') required.add(sq);

  // (3) quiet threat move → valuable pieces taken on move 2 (discovered, pin, trap…)
  for (const x of captured) {
    if (x.ply !== 3) continue;
    if (!T.captured && matGain3 >= 2 && VAL[x.type] >= 3) required.add(x.sq);
  }

  // (4) mate → king
  if (mateNul) required.add(myKing);

  // optional: king under check; pieces taken on move 2 not already required
  if (/[+]/.test(T.san) && !required.has(myKing)) optional.add(myKing);
  for (const x of captured)
    if (x.ply === 3 && !required.has(x.sq)) optional.add(x.sq);

  if (!required.size) return { usable: false, reason: 'нечего отмечать', ...base };

  // 2.3 motif
  const backRank = me === 'w' ? '1' : '8';
  const lastMate = line.moves.find(m => m.san.includes('#'));
  let motif: string;
  const targetsAfter = [...required].filter(sq => sq !== T.to);
  const newAttack = (sq: string) =>
    c1
      .attackers(sq as Square, opp)
      .some(a => a !== T.to && !cNull.attackers(sq as Square, opp).includes(a));

  if (
    mateNul &&
    lastMate &&
    lastMate.to[1] === backRank &&
    myKing[1] === backRank &&
    'rq'.includes(lastMate.piece)
  )
    motif = 'back_rank';
  else if (mateNul) motif = 'mate';
  else if (fork) motif = 'fork';
  else if (targetsAfter.some(newAttack) || (/[+]/.test(T.san) && newAttack(myKing)))
    motif = 'discovered';
  else if (targetsAfter.some(sq => isSkewered(c1, T, sq, me))) motif = 'skewer';
  else if (targetsAfter.some(sq => isPinned(c1, sq, me))) motif = 'pin';
  else if (targetsAfter.some(sq => isTrapped(c1, sq, opp))) motif = 'trapped';
  else if (T.captured && cNull.attackers(T.to, me).length === 0) motif = 'hanging';
  else if (T.captured && VAL[T.captured] > VAL[T.piece]) motif = 'cheaper';
  else motif = 'material';

  // 2.4 difficulty
  const quietT = !T.captured && !/[+#]/.test(T.san);
  let difficulty = 2;
  if (['hanging', 'cheaper'].includes(motif) || (mateNul && Math.abs(nul.mate!) === 1))
    difficulty = 1;
  if ((mateNul && Math.abs(nul.mate!) >= 2) || quietT) difficulty = 3;

  return {
    usable: true,
    hasThreat: true,
    T: T.san,
    attacker: T.from,
    targets: [...required].sort(),
    optional: [...optional].sort(),
    motif,
    title: motifTitle(motif, T),
    difficulty,
    mate_in: mateNul ? Math.abs(nul.mate!) : null,
    threatUci: uciOf(T),
    threatPv: nul.pv.slice(0, 6),
    ...base,
  };
}
