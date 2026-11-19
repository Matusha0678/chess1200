// Идеи позиций. Порт секции «Идеи позиций» из docs/design/pages/pages2-ref.cjs.
import { numSan, type ChessMove } from './opening-trainer';

export interface IdeaLine {
  id: string;
  moves: ChessMove[];
  myColor: 'w' | 'b';
  openingId: string;
}

export interface EndPosition {
  key: string;
  fen: string;
  lineIds: string[];
  openingId: string;
  last: string;
  myColor: 'w' | 'b';
}

export interface ExplorerMove {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
}

export interface ExplorerStats {
  moves: ExplorerMove[];
}

export interface MoveStat {
  san: string;
  uci: string;
  games: number;
  share: number;
  white: number;
  draws: number;
  black: number;
}

export interface IdeaVerdict {
  ok: boolean;
  share: number;
  games: number;
  top: MoveStat[];
}

const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function endPositions(lines: IdeaLine[]): EndPosition[] {
  const map = new Map<string, EndPosition>();
  for (const L of lines) {
    const k = L.moves.length - 1;
    const fen = L.moves[k].fen;
    const key = posKey(fen);
    if (!map.has(key)) {
      map.set(key, {
        key,
        fen,
        lineIds: [],
        openingId: L.openingId,
        last: numSan(L.moves, k),
        myColor: L.myColor,
      });
    }
    map.get(key)!.lineIds.push(L.id);
  }
  return [...map.values()];
}

export function moveStats(stats: ExplorerStats): MoveStat[] {
  const total = stats.moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);
  return stats.moves.map(m => {
    const n = m.white + m.draws + m.black;
    return {
      san: m.san,
      uci: m.uci,
      games: n,
      share: total ? n / total : 0,
      white: n ? Math.round(m.white / n * 100) : 0,
      draws: n ? Math.round(m.draws / n * 100) : 0,
      black: n ? Math.round(m.black / n * 100) : 0,
    };
  });
}

export function ideaVerdict(stats: ExplorerStats, san: string): IdeaVerdict {
  const ms = moveStats(stats);
  const i = ms.findIndex(m => m.san === san);
  const m = i >= 0 ? ms[i] : null;
  const ok = !!m && m.games >= 3 && (i < 3 || m.share >= 0.10);
  return {
    ok,
    share: m ? m.share : 0,
    games: m ? m.games : 0,
    top: ms.slice(0, 3),
  };
}
