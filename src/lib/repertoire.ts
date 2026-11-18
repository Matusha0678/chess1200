// Логика проверки «Дебюты в партиях» — прямой перенос из repertoire-ref.cjs

import { Chess } from 'chess.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepStatus = 'in_line' | 'deviation' | 'other' | 'hole' | 'none';

export interface Opening {
  id: string;
  name: string;
  color: 'white' | 'black' | 'both';
}

export interface ChessMove {
  san: string;
  from: string;
  to: string;
  fen: string;
  color: 'w' | 'b';
}

export interface OpeningLine {
  id: string;
  opening_id: string;
  moves: ChessMove[];
}

export interface CheckResult {
  status: RepStatus;
  ply: number | null;
  moveNumber: number | null;
  color: 'w' | 'b' | null;
  fenBefore: string | null;
  played: string | null;
  playedUci: string | null;
  prevUci: string | null;
  expected: string[] | null;
  expectedUci: string[] | null;
  openingId: string | null;
  lineIds: string[];
  bookPlies: number;
  first: boolean;
}

interface IndexEntry { openingIds: Set<string>; lineIds: Set<string>; }

export interface RepIndex {
  mine: Map<string, Map<string, IndexEntry>>;
  theirs: Map<string, Map<string, IndexEntry>>;
  byId: Map<string, Opening>;
}

// ── posKey: расстановка + чей ход + рокировки ─────────────────────────────────

export function posKey(fen: string): string {
  const [placement, turn, castling] = fen.split(' ');
  return `${placement} ${turn} ${castling}`;
}

const START_FEN = new Chess().fen();

// ── buildIndex: индекс репертуара для цвета C ─────────────────────────────────

export function buildIndex(openings: Opening[], lines: OpeningLine[], C: 'w' | 'b'): RepIndex {
  const want = C === 'w' ? 'white' : 'black';
  const byId = new Map(openings.map(o => [o.id, o]));
  const mine = new Map<string, Map<string, IndexEntry>>();
  const theirs = new Map<string, Map<string, IndexEntry>>();

  const add = (map: Map<string, Map<string, IndexEntry>>, key: string, san: string, oId: string, lId: string) => {
    if (!map.has(key)) map.set(key, new Map());
    const m = map.get(key)!;
    if (!m.has(san)) m.set(san, { openingIds: new Set(), lineIds: new Set() });
    m.get(san)!.openingIds.add(oId);
    m.get(san)!.lineIds.add(lId);
  };

  for (const line of lines) {
    const op = byId.get(line.opening_id);
    if (!op || !(op.color === want || op.color === 'both')) continue;
    let fen = START_FEN;
    for (const mv of line.moves) {
      add(mv.color === C ? mine : theirs, posKey(fen), mv.san, op.id, line.id);
      fen = mv.fen;
    }
  }

  return { mine, theirs, byId };
}

// ── checkGameFull: проверка партии с UCIs ────────────────────────────────────

const MAX_PLY = 30;
const LOOKAHEAD = 4;

export function checkGameFull(moves: string[], C: 'w' | 'b', index: RepIndex): CheckResult {
  const ch = new Chess();
  const inIndex = (fen: string) => { const k = posKey(fen); return index.mine.has(k) || index.theirs.has(k); };
  const historyUci: string[] = [];

  let inBook = false, bookPlies = 0, lastOpening: string | null = null, resumeAt = -1;
  const n = Math.min(moves.length, MAX_PLY);

  const makeEmpty = (status: RepStatus, bp = 0, opId: string | null = null): CheckResult => ({
    status, bookPlies: bp, openingId: opId,
    ply: null, moveNumber: null, color: null, fenBefore: null,
    played: null, playedUci: null, prevUci: null, expected: null, expectedUci: null,
    lineIds: [], first: false,
  });

  for (let ply = 0; ply < n; ply++) {
    const fenBefore = ch.fen();
    const mover = ch.turn() as 'w' | 'b';
    let mr;
    try { mr = ch.move(moves[ply]); } catch { break; }
    const played = mr.san;
    const playedUci = `${mr.from}${mr.to}${mr.promotion ?? ''}`;
    historyUci.push(playedUci);

    if (ply < resumeAt) continue;

    const known = (mover === C ? index.mine : index.theirs).get(posKey(fenBefore));
    if (!known) {
      if (inBook) return makeEmpty('in_line', bookPlies, lastOpening);
      continue;
    }

    if (known.has(played)) {
      inBook = true;
      bookPlies = ply + 1;
      lastOpening = [...known.get(played)!.openingIds][0];
      continue;
    }

    // Перестановка: партия возвращается в мои линии за LOOKAHEAD ходов?
    const back = (() => {
      if (inIndex(ch.fen())) return ply + 1;
      const c2 = new Chess(ch.fen());
      for (let j = ply + 1; j < Math.min(n, ply + 1 + LOOKAHEAD); j++) {
        try { c2.move(moves[j]); } catch { return -1; }
        if (inIndex(c2.fen())) return j + 1;
      }
      return -1;
    })();
    if (back > 0) { inBook = true; resumeAt = back; continue; }

    const all = [...known.values()];
    const openingIds = [...new Set(all.flatMap(i => [...i.openingIds]))];
    const lineIds = [...new Set(all.flatMap(i => [...i.lineIds]))];
    const first = ply <= 1;

    const expectedSans = [...known.keys()];
    const expectedUci: string[] = [];
    for (const san of expectedSans) {
      try {
        const tmp = new Chess(fenBefore);
        const r = tmp.move(san);
        if (r) expectedUci.push(`${r.from}${r.to}${r.promotion ?? ''}`);
        else expectedUci.push('');
      } catch { expectedUci.push(''); }
    }

    const prevUci = ply > 0 ? historyUci[ply - 1] : null;

    const ev: Omit<CheckResult, 'status'> = {
      ply, moveNumber: Math.floor(ply / 2) + 1, color: mover,
      fenBefore, played, playedUci, prevUci,
      expected: expectedSans, expectedUci,
      openingId: openingIds[0] ?? null, lineIds, bookPlies, first,
    };

    return mover === C
      ? { ...ev, status: first ? 'other' : 'deviation' }
      : { ...ev, status: 'hole' };
  }

  return inBook
    ? makeEmpty('in_line', bookPlies, lastOpening)
    : makeEmpty('none');
}

// ── repHash: FNV-1a хэш репертуара ──────────────────────────────────────────

export function repHash(openings: Opening[], lines: OpeningLine[]): string {
  const sorted = [...lines].sort((a, b) => a.id.localeCompare(b.id));
  const str = sorted.map(l => {
    const op = openings.find(o => o.id === l.opening_id);
    const color = op?.color ?? 'white';
    const sans = l.moves.map(m => m.san).join(' ');
    return `${color}|${sans}`;
  }).join('\n');

  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

// ── parsePgnMoves: извлечь SAN-ходы из PGN ──────────────────────────────────

export function parsePgnMoves(pgn: string): string[] {
  if (/\[FEN "[^"]+"\]/.test(pgn) && !pgn.includes('[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')) {
    return [];
  }
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history();
  } catch {
    return [];
  }
}

// ── fenAfterMove: вычислить FEN после UCI-хода ───────────────────────────────

export function fenAfterUci(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const r = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return r ? chess.fen() : null;
  } catch { return null; }
}

// ── uciToSan: UCI → SAN в данной позиции ────────────────────────────────────

export function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const r = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] as 'q' | 'r' | 'b' | 'n') || undefined });
    return r?.san ?? uci;
  } catch { return uci; }
}
