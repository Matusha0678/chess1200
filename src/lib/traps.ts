// Ловушки. Порт секции «Ловушки» из docs/design/pages/pages2-ref.cjs.
import { Chess } from 'chess.js';
import {
  START,
  toMoves,
  fenBefore,
  createRun,
  type ChessMove,
  type Run,
} from './opening-trainer';

export interface TrapLibEntry {
  id: string;
  line: string;
  punish: string;
  setter: 'w' | 'b';
  safe: string[];
  idea: string;
  result: string;
  opening?: string;
  name?: string;
}

export interface TrapData extends TrapLibEntry {
  key: string;
  moves: ChessMove[];
  mistakePly: number;
}

export interface OpeningForMatch {
  id: string;
  color: 'white' | 'black' | 'both';
  lines: ChessMove[][];
}

export interface TrapMatch {
  openingId: string;
  role: 'setter' | 'victim';
  k: number;
}

export type AvoidResult = 'trap' | 'safe' | 'other' | 'illegal';

const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function loadTraps(lib: TrapLibEntry[]): TrapData[] {
  return lib.map(t => {
    const moves = toMoves(`${t.line} ${t.punish}`);
    return {
      ...t,
      key: `lib:${t.id}`,
      moves,
      mistakePly: t.line.split(/\s+/).filter(Boolean).length - 1,
    };
  });
}

export function matchTrap(trap: TrapData, opening: OpeningForMatch): TrapMatch | null {
  const keys = new Set([posKey(START)]);
  for (const L of opening.lines) for (const m of L) keys.add(posKey(m.fen));
  const colors: Array<'w' | 'b'> = opening.color === 'white' ? ['w'] : opening.color === 'black' ? ['b'] : ['w', 'b'];
  for (const me of colors) {
    let k = 0;
    while (k < trap.moves.length && keys.has(posKey(trap.moves[k].fen))) k++;
    const reached = k > trap.mistakePly;
    if (reached || (k >= 2 && trap.moves[k].color !== me)) {
      return { openingId: opening.id, role: trap.setter === me ? 'setter' : 'victim', k };
    }
  }
  return null;
}

export interface MineEntry extends TrapMatch { trap: TrapData; oi: number; }
export interface TrapsForRepertoire { mine: MineEntry[]; other: TrapData[]; }

export function trapsForRepertoire(traps: TrapData[], openings: OpeningForMatch[]): TrapsForRepertoire {
  const mine: MineEntry[] = [];
  const other: TrapData[] = [];
  for (const t of traps) {
    let best: (TrapMatch & { oi: number }) | null = null;
    openings.forEach((o, oi) => {
      const m = matchTrap(t, o);
      if (m && (!best || m.k > best.k)) best = { ...m, oi };
    });
    if (best) mine.push({ trap: t, ...(best as TrapMatch & { oi: number }) });
    else other.push(t);
  }
  mine.sort((a, b) => a.oi - b.oi || b.k - a.k);
  return { mine, other };
}

export function punishRun(t: TrapData): Run {
  return createRun(t.moves, t.setter, 'drill', { startPly: t.mistakePly + 1 });
}

export function avoidVerdict(t: TrapData, from: string, to: string): AvoidResult {
  const c = new Chess(fenBefore(t.moves, t.mistakePly));
  let san: string;
  try {
    san = c.move({ from, to, promotion: 'q' }).san;
  } catch {
    return 'illegal';
  }
  if (san === t.moves[t.mistakePly].san) return 'trap';
  return t.safe.includes(san) ? 'safe' : 'other';
}
