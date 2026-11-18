// src/lib/demo-positions.ts — демо-позиции для проверки вида (BOARD-EXPLAIN.md, раздел 4)
import { Chess } from 'chess.js';

export const DEMO_SAC = {
  works: {
    id: 'demo-works',
    fen: 'r1bq1rk1/pppnbppp/2n1p3/3pP3/3P3P/2NB1N2/PPP2PP1/R1BQK2R w KQ - 0 8',
    move: 'd3h7', san: 'Bxh7+',
    kind: 'real' as const, sac_type: 'combination', pattern: 'greek_gift', piece: 'b',
    material_given: 2, king_attack: true, mate_in: null, mate_forced: false, score: 60, is_decoy: false,
    eval_before: 662, eval_after: 662, eval_no_sac: 223, best_no_sac: 'h1h3',
    accepted_pv: 'g8h7 f3g5 h7h6 g5f7 h6h7 f7d8 e7d8 h1h3 b7b5 h3g3',
    pv: 'g8h7 f3g5 h7g6 h4h5 g6h6 g5f7 h7g8 d8c6 g8h8 f7d6',
    defenses: [
      { move: 'g8h7', pv: ['g8h7', 'f3g5', 'h7g6', 'h4h5', 'g6h6', 'g5f7'], cp: 706, mate: null, outcome: 'вилка на ферзя, +7.1' },
      { move: 'g8h8', pv: ['g8h8', 'f3g5', 'g7g6', 'h4h5', 'e7g5', 'h5g6'], cp: 980, mate: null, outcome: 'перевес +9.8' },
    ],
    opening: 'Французская защита',
    game_id: null, ply: null, version: 2, source: null,
  },
  fails: {
    id: 'demo-fails',
    fen: 'r1bq1rk1/ppp1bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 0 7',
    move: 'd3h7', san: 'Bxh7+',
    kind: 'fake' as const, sac_type: 'real', pattern: 'greek_gift', piece: 'b',
    material_given: 2, king_attack: true, mate_in: null, mate_forced: false, score: 60, is_decoy: true,
    eval_before: -9, eval_after: -447, eval_no_sac: -9, best_no_sac: 'e1g1',
    accepted_pv: 'g8h7 f3e5 h7g8 h2h4 f6h7 c1d2 c6e5 d4e5 d8e8 h4h5',
    pv: 'f6h7 h2h4 e7b4 f3g5 d8e8 g5h7 g8h7 c1d2 b4c3 d2c3',
    defenses: [
      { move: 'f6h7', pv: ['f6h7', 'h2h4', 'e7b4', 'f3g5', 'd8e8', 'g5h7'], cp: -444, mate: null, outcome: 'чёрные отбиваются' },
      { move: 'g8h7', pv: ['g8h7', 'f3g5', 'h7g8', 'f2f4', 'd8e8', 'h2h4'], cp: -430, mate: null, outcome: 'чёрные отбиваются' },
    ],
    opening: 'Система Колле',
    game_id: null, ply: null, version: 2, source: null,
  },
} as const;

// ── DEMO_REPERTOIRE ───────────────────────────────────────────────────────────

function mkLine(id: string, opening_id: string, sans: string) {
  const ch = new Chess();
  const moves: Array<{ san: string; from: string; to: string; fen: string; color: 'w' | 'b' }> = [];
  for (const s of sans.split(' ')) {
    const r = ch.move(s);
    moves.push({ san: r.san, from: r.from, to: r.to, fen: ch.fen(), color: r.color as 'w' | 'b' });
  }
  return { id, opening_id, moves };
}

export const DEMO_OPENINGS = [
  { id: 'op-scotch',   name: 'Шотландская партия', color: 'white' as const },
  { id: 'op-stafford', name: 'Гамбит Стаффорда',   color: 'black' as const },
];

export const DEMO_LINES = [
  mkLine('l-sc-1', 'op-scotch',   'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nxc6 Qf6 Qd2 dxc6 Nc3'),
  mkLine('l-sc-2', 'op-scotch',   'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4'),
  mkLine('l-st-1', 'op-stafford', 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5'),
];

export const DEMO_GAMES = [
  { id: 'g1', color: 'w' as const, result: 'loss' as const, opp: 'Ivan_88',  date: '2026-11-12', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nf5 d5 Nxg7+ Kf8 Nh5 Qh4' },
  { id: 'g2', color: 'w' as const, result: 'loss' as const, opp: 'petr_k',   date: '2026-11-10', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nf5 g6 Ng3 Nf6' },
  { id: 'g3', color: 'w' as const, result: 'draw' as const, opp: 'Mira2010', date: '2026-11-08', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7' },
  { id: 'g4', color: 'w' as const, result: 'win'  as const, opp: 'kostya',   date: '2026-11-07', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Qh4 Nc3 Bb4 Be2' },
  { id: 'g5', color: 'w' as const, result: 'win'  as const, opp: 'Alex_K',   date: '2026-11-05', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Nb6 Nd2' },
  { id: 'g6', color: 'b' as const, result: 'loss' as const, opp: 'd4_only',  date: '2026-11-04', moves: 'd4 d5 c4 e6 Nc3 Nf6' },
  { id: 'g7', color: 'b' as const, result: 'win'  as const, opp: 'Sasha',    date: '2026-11-03', moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5 Nc3 Ng4' },
];

// Оценки для deviation-ходов в демо
export const DEMO_ANALYSIS: Record<string, { cls: string; loss: number }> = {
  g1: { cls: 'inaccuracy', loss: 0.064 },
  g2: { cls: 'inaccuracy', loss: 0.064 },
  g3: { cls: 'good',       loss: 0.01  },
};

// Ответы Lichess Opening Explorer для демо (ключ = posKey после хода)
export const DEMO_LICHESS: Record<string, { total: number; moves: Array<{ san: string; uci: string; share: number; score: number }> }> = {
  // после 4...Qh4 (позиция: белые ходят)
  'r1b1kbnr/pppp1ppp/2n5/8/3NP2q/8/PPP2PPP/RNBQKB1R w KQkq': {
    total: 100,
    moves: [
      { san: 'Nc3', uci: 'b1c3', share: 0.61, score: 0.53 },
      { san: 'Nb5', uci: 'd4b5', share: 0.22, score: 0.49 },
      { san: 'Nf3', uci: 'd4f3', share: 0.09, score: 0.50 },
    ],
  },
  // после 1.d4 (позиция: чёрные ходят)
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq': {
    total: 100,
    moves: [
      { san: 'd5',  uci: 'd7d5', share: 0.48, score: 0.47 },
      { san: 'Nf6', uci: 'g8f6', share: 0.39, score: 0.48 },
      { san: 'e6',  uci: 'e7e6', share: 0.06, score: 0.46 },
    ],
  },
};

export const DEMO_REPERTOIRE = {
  openings: DEMO_OPENINGS,
  lines:    DEMO_LINES,
  games:    DEMO_GAMES,
  analysis: DEMO_ANALYSIS,
  lichess:  DEMO_LICHESS,
} as const;

export const DEMO_THREAT = {
  fork: {
    id: 'demo-fork',
    fen: 'r3k2r/ppp2pb1/5q2/1N1P2pp/2B1P3/3Q1b2/PP3P2/R3K1R1 b - - 0 20',
    my_color: 'b' as const, opp_name: 'Ivan_88',
    last_move_uci: 'c3b5', last_move_san: 'Nb5',
    has_threat: true, threat_uci: 'b5c7', threat_san: 'Nxc7+',
    threat_pv: 'b5c7 e8d8 c7e6 f7e6 d5e6 f6d4 d3f3 d4c4',
    targets: ['a8', 'c7'] as string[], optional_targets: ['e8'] as string[], attacker_sq: 'b5',
    motif: 'fork', gain_cp: 345, mate_in: null, difficulty: 2,
    missed_in_game: false, my_move_san: null,
    game_id: null, version: 2,
  },
} as const;
