// Дебютный спринт. Порт секции «Дебютный спринт» из docs/design/pages/pages2-ref.cjs.
import {
  fenBefore,
  lineStatus,
  type ChessMove,
  type LessonProg,
} from './opening-trainer';

export interface SprintLine {
  id: string;
  moves: ChessMove[];
  myColor: 'w' | 'b';
  prog: LessonProg | null;
}

export interface SprintItem {
  key: string;
  lineId: string;
  ply: number;
  fen: string;
  from: string;
  to: string;
  san: string;
  myColor: 'w' | 'b';
  w: number;
}

const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function sprintItems(lines: SprintLine[], now: number, hard: Set<string> = new Set()): SprintItem[] {
  const byKey = new Map<string, SprintItem>();
  for (const L of lines) {
    const st = lineStatus(L.prog, now);
    for (let k = 2; k < L.moves.length; k++) {
      const m = L.moves[k];
      if (m.color !== L.myColor) continue;
      let w = st === 'due' ? 3 : st === 'mastered' ? 0.5 : 1;
      if (hard.has(`${L.id}:${k}`)) w *= 3;
      const fen = fenBefore(L.moves, k);
      const key = `${posKey(fen)}|${m.from}${m.to}`;
      const old = byKey.get(key);
      if (!old || old.w < w) {
        byKey.set(key, { key, lineId: L.id, ply: k, fen, from: m.from, to: m.to, san: m.san, myColor: L.myColor, w });
      }
    }
  }
  return [...byKey.values()];
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sprintOrder(items: SprintItem[], rand: () => number = Math.random): SprintItem[] {
  return items
    .map(it => ({ it, s: -Math.log(1 - rand()) / it.w }))
    .sort((a, b) => a.s - b.s)
    .map(x => x.it);
}

export const sprintCheck = (item: SprintItem, from: string, to: string): boolean =>
  item.from === from && item.to === to;
