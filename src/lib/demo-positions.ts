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

// ── DEMO_STATS ────────────────────────────────────────────────────────────────

export interface DemoInsight {
  game_id: string;
  my_color: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  decisive_move_number: number | null;
  decisive_san: string | null;
  decisive_phase: string | null;
  decisive_loss: number | null;
  decisive_cls: string | null;
  decisive_fen: string | null;
  decisive_best: string | null;
  clock_left: number | null;
  time_trouble: boolean;
  missed_win: boolean;
  max_my_win: number | null;
  errors_opening: number;
  errors_middlegame: number;
  errors_endgame: number;
  avg_time_opening: number | null;
  avg_time_middlegame: number | null;
  avg_time_endgame: number | null;
  convert_fen: string | null;
  convert_move_number: number | null;
  convert_eval: number | null;
  convert_my_win: number | null;
  opp: string;
  date: string;
  rating_me: number;
  time_class: 'rapid' | 'blitz';
  opening?: string | null;
}

// A middlegame FEN used for decisive positions
const MIDGAME_FEN = 'r1bq1rk1/pp3ppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 9';
// A convert FEN
const CONVERT_FEN = 'r1bq1rk1/pp3ppp/2n1pn2/3p4/1P1P4/2NB1N2/P1P2PPP/R1BQR1K1 w - - 0 11';

const DEMO_INSIGHTS: DemoInsight[] = [
  // 1 time_trouble
  {
    game_id: 'ds-1', my_color: 'w', result: 'loss',
    decisive_move_number: 32, decisive_san: 'Rd1', decisive_phase: 'middlegame',
    decisive_loss: 0.42, decisive_cls: 'blunder',
    decisive_fen: MIDGAME_FEN, decisive_best: 'd1e1',
    clock_left: 18, time_trouble: true, missed_win: false,
    max_my_win: 0.55, errors_opening: 0, errors_middlegame: 2, errors_endgame: 0,
    avg_time_opening: 8, avg_time_middlegame: 45, avg_time_endgame: null,
    convert_fen: CONVERT_FEN, convert_move_number: 11, convert_eval: 120, convert_my_win: 0.68,
    opp: 'Ivan_88', date: '2026-11-14', rating_me: 1182, time_class: 'rapid',
  },
  // 2 deviation (decisive_phase=opening)
  {
    game_id: 'ds-2', my_color: 'w', result: 'loss',
    decisive_move_number: 8, decisive_san: 'Bd3', decisive_phase: 'opening',
    decisive_loss: 0.35, decisive_cls: 'mistake',
    decisive_fen: MIDGAME_FEN, decisive_best: 'f1c4',
    clock_left: 180, time_trouble: false, missed_win: false,
    max_my_win: 0.50, errors_opening: 1, errors_middlegame: 0, errors_endgame: 0,
    avg_time_opening: 12, avg_time_middlegame: 25, avg_time_endgame: null,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'petr_k', date: '2026-11-13', rating_me: 1185, time_class: 'rapid',
  },
  {
    game_id: 'ds-3', my_color: 'b', result: 'loss',
    decisive_move_number: 7, decisive_san: 'Nc6', decisive_phase: 'opening',
    decisive_loss: 0.38, decisive_cls: 'mistake',
    decisive_fen: MIDGAME_FEN, decisive_best: 'g8f6',
    clock_left: 200, time_trouble: false, missed_win: false,
    max_my_win: 0.48, errors_opening: 1, errors_middlegame: 1, errors_endgame: 0,
    avg_time_opening: 15, avg_time_middlegame: 30, avg_time_endgame: null,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'd4_only', date: '2026-11-12', rating_me: 1188, time_class: 'blitz',
  },
  // 2 opening errors
  {
    game_id: 'ds-4', my_color: 'w', result: 'loss',
    decisive_move_number: 10, decisive_san: 'e4', decisive_phase: 'opening',
    decisive_loss: 0.28, decisive_cls: 'inaccuracy',
    decisive_fen: MIDGAME_FEN, decisive_best: 'd2d4',
    clock_left: 210, time_trouble: false, missed_win: false,
    max_my_win: 0.52, errors_opening: 2, errors_middlegame: 0, errors_endgame: 0,
    avg_time_opening: 20, avg_time_middlegame: 18, avg_time_endgame: null,
    convert_fen: CONVERT_FEN, convert_move_number: 11, convert_eval: 90, convert_my_win: 0.65,
    opp: 'Mira2010', date: '2026-11-11', rating_me: 1190, time_class: 'rapid',
  },
  {
    game_id: 'ds-5', my_color: 'b', result: 'loss',
    decisive_move_number: 9, decisive_san: 'Bd7', decisive_phase: 'opening',
    decisive_loss: 0.31, decisive_cls: 'mistake',
    decisive_fen: MIDGAME_FEN, decisive_best: 'c8e6',
    clock_left: 190, time_trouble: false, missed_win: false,
    max_my_win: 0.49, errors_opening: 2, errors_middlegame: 1, errors_endgame: 0,
    avg_time_opening: 22, avg_time_middlegame: 32, avg_time_endgame: null,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'kostya', date: '2026-11-10', rating_me: 1192, time_class: 'rapid',
  },
  // 3 middlegame errors
  {
    game_id: 'ds-6', my_color: 'w', result: 'loss',
    decisive_move_number: 24, decisive_san: 'Qd3', decisive_phase: 'middlegame',
    decisive_loss: 0.45, decisive_cls: 'blunder',
    decisive_fen: MIDGAME_FEN, decisive_best: 'f1d1',
    clock_left: 95, time_trouble: false, missed_win: false,
    max_my_win: 0.60, errors_opening: 0, errors_middlegame: 3, errors_endgame: 0,
    avg_time_opening: 10, avg_time_middlegame: 35, avg_time_endgame: null,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'Alex_K', date: '2026-11-09', rating_me: 1195, time_class: 'rapid',
  },
  {
    game_id: 'ds-7', my_color: 'b', result: 'loss',
    decisive_move_number: 20, decisive_san: 'Nb4', decisive_phase: 'middlegame',
    decisive_loss: 0.33, decisive_cls: 'mistake',
    decisive_fen: MIDGAME_FEN, decisive_best: 'c6d4',
    clock_left: 112, time_trouble: false, missed_win: false,
    max_my_win: 0.56, errors_opening: 1, errors_middlegame: 2, errors_endgame: 0,
    avg_time_opening: 14, avg_time_middlegame: 28, avg_time_endgame: null,
    convert_fen: CONVERT_FEN, convert_move_number: 11, convert_eval: 110, convert_my_win: 0.70,
    opp: 'Sasha', date: '2026-11-08', rating_me: 1197, time_class: 'blitz',
  },
  {
    game_id: 'ds-8', my_color: 'w', result: 'draw',
    decisive_move_number: 28, decisive_san: 'Rfe1', decisive_phase: 'middlegame',
    decisive_loss: 0.29, decisive_cls: 'inaccuracy',
    decisive_fen: MIDGAME_FEN, decisive_best: 'a1d1',
    clock_left: 130, time_trouble: false, missed_win: false,
    max_my_win: 0.70, errors_opening: 0, errors_middlegame: 2, errors_endgame: 0,
    avg_time_opening: 11, avg_time_middlegame: 22, avg_time_endgame: 15,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'grigoriy', date: '2026-11-07', rating_me: 1200, time_class: 'rapid',
  },
  // 1 endgame error
  {
    game_id: 'ds-9', my_color: 'w', result: 'loss',
    decisive_move_number: 42, decisive_san: 'Ke3', decisive_phase: 'endgame',
    decisive_loss: 0.38, decisive_cls: 'mistake',
    decisive_fen: MIDGAME_FEN, decisive_best: 'e1f2',
    clock_left: 85, time_trouble: false, missed_win: false,
    max_my_win: 0.58, errors_opening: 0, errors_middlegame: 0, errors_endgame: 1,
    avg_time_opening: 9, avg_time_middlegame: 20, avg_time_endgame: 40,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'timur_v', date: '2026-11-06', rating_me: 1200, time_class: 'rapid',
  },
  // 2 missed_win
  {
    game_id: 'ds-10', my_color: 'w', result: 'draw',
    decisive_move_number: null, decisive_san: null, decisive_phase: null,
    decisive_loss: null, decisive_cls: null,
    decisive_fen: null, decisive_best: null,
    clock_left: 220, time_trouble: false, missed_win: true,
    max_my_win: 0.82, errors_opening: 0, errors_middlegame: 1, errors_endgame: 0,
    avg_time_opening: 13, avg_time_middlegame: 24, avg_time_endgame: 20,
    convert_fen: CONVERT_FEN, convert_move_number: 11, convert_eval: 100, convert_my_win: 0.78,
    opp: 'boris_z', date: '2026-11-05', rating_me: 1200, time_class: 'rapid',
  },
  {
    game_id: 'ds-11', my_color: 'b', result: 'draw',
    decisive_move_number: null, decisive_san: null, decisive_phase: null,
    decisive_loss: null, decisive_cls: null,
    decisive_fen: null, decisive_best: null,
    clock_left: 180, time_trouble: false, missed_win: true,
    max_my_win: 0.80, errors_opening: 0, errors_middlegame: 0, errors_endgame: 0,
    avg_time_opening: 10, avg_time_middlegame: 18, avg_time_endgame: 25,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'maxim_p', date: '2026-11-04', rating_me: 1200, time_class: 'blitz',
  },
  // 1 win (no loss)
  {
    game_id: 'ds-12', my_color: 'w', result: 'win',
    decisive_move_number: null, decisive_san: null, decisive_phase: null,
    decisive_loss: null, decisive_cls: null,
    decisive_fen: null, decisive_best: null,
    clock_left: 300, time_trouble: false, missed_win: false,
    max_my_win: 0.90, errors_opening: 0, errors_middlegame: 0, errors_endgame: 0,
    avg_time_opening: 8, avg_time_middlegame: 15, avg_time_endgame: null,
    convert_fen: null, convert_move_number: null, convert_eval: null, convert_my_win: null,
    opp: 'Anton_G', date: '2026-11-03', rating_me: 1200, time_class: 'rapid',
  },
];

export const DEMO_RATING: Array<{ date: string; rating: number }> = [
  { date: '2026-09-01', rating: 1150 },
  { date: '2026-09-05', rating: 1155 },
  { date: '2026-09-10', rating: 1148 },
  { date: '2026-09-15', rating: 1162 },
  { date: '2026-09-20', rating: 1158 },
  { date: '2026-09-25', rating: 1170 },
  { date: '2026-09-30', rating: 1165 },
  { date: '2026-10-05', rating: 1172 },
  { date: '2026-10-10', rating: 1180 },
  { date: '2026-10-15', rating: 1175 },
  { date: '2026-10-20', rating: 1183 },
  { date: '2026-10-25', rating: 1178 },
  { date: '2026-10-30', rating: 1188 },
  { date: '2026-11-03', rating: 1192 },
  { date: '2026-11-06', rating: 1195 },
  { date: '2026-11-09', rating: 1190 },
  { date: '2026-11-12', rating: 1198 },
  { date: '2026-11-15', rating: 1202 },
  { date: '2026-11-17', rating: 1207 },
  { date: '2026-11-18', rating: 1210 },
];

export const DEMO_STATS = {
  insights: DEMO_INSIGHTS,
  rating: DEMO_RATING,
} as const;

// ── DEMO_CONVERT ──────────────────────────────────────────────────────────────

export interface DemoConvertPos {
  fen: string;
  moveNumber: number;
  myColor: 'w' | 'b';
  evalCp: number;
  myWin: number;
  opp: string;
  date: string;
  result: 'loss' | 'draw';
  status: 'solved' | 'tried' | 'new';
}

export const DEMO_CONVERT: DemoConvertPos[] = [
  // solved
  {
    fen: 'r1bq1rk1/pp3ppp/2n1pn2/3p4/1P1P4/2NB1N2/P1P2PPP/R1BQR1K1 w - - 0 11',
    moveNumber: 11, myColor: 'w', evalCp: 130, myWin: 0.72,
    opp: 'Ivan_88', date: '2026-11-14', result: 'draw', status: 'solved',
  },
  {
    fen: 'r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 10',
    moveNumber: 10, myColor: 'w', evalCp: 110, myWin: 0.68,
    opp: 'petr_k', date: '2026-11-13', result: 'loss', status: 'solved',
  },
  // tried
  {
    fen: 'r1bqr1k1/pp3ppp/2n1pn2/3p4/3P4/2NBPN2/PPP1BPPP/R1BQ1RK1 w - - 0 10',
    moveNumber: 10, myColor: 'w', evalCp: 95, myWin: 0.65,
    opp: 'd4_only', date: '2026-11-12', result: 'draw', status: 'tried',
  },
  {
    fen: 'r1bq1rk1/pp3ppp/4pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 9',
    moveNumber: 9, myColor: 'w', evalCp: 85, myWin: 0.63,
    opp: 'Mira2010', date: '2026-11-11', result: 'loss', status: 'tried',
  },
  // new
  {
    fen: 'r1bq1rk1/pp3ppp/2n1pn2/2Pp4/3P4/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 10',
    moveNumber: 10, myColor: 'w', evalCp: 120, myWin: 0.70,
    opp: 'kostya', date: '2026-11-10', result: 'draw', status: 'new',
  },
  {
    fen: 'r1bq1rk1/ppp2ppp/2n1pn2/3P4/8/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 9',
    moveNumber: 9, myColor: 'w', evalCp: 100, myWin: 0.66,
    opp: 'Alex_K', date: '2026-11-09', result: 'loss', status: 'new',
  },
  {
    fen: 'r1bq1rk1/pp3ppp/2n1p3/3p2n1/3PP3/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 10',
    moveNumber: 10, myColor: 'w', evalCp: 90, myWin: 0.64,
    opp: 'Sasha', date: '2026-11-08', result: 'draw', status: 'new',
  },
  {
    fen: 'r1bq1rk1/pp3ppp/2n1pn2/3p4/3P2P1/2NB1N2/PPP2PP1/R1BQ1RK1 w - - 0 10',
    moveNumber: 10, myColor: 'w', evalCp: 80, myWin: 0.62,
    opp: 'grigoriy', date: '2026-11-07', result: 'loss', status: 'new',
  },
];

// ── DEMO_TACTICS ──────────────────────────────────────────────────────────────

import type { ParsedPuzzle } from './lichess-puzzles';
import { parsePuzzle } from './lichess-puzzles';

function computeDemoTactics(): ParsedPuzzle[] {
  // 0NNEG: fork, white to move, 43 half-moves
  const p0 = parsePuzzle({
    game: { pgn: 'd4 Nf6 Bf4 d6 e3 Nbd7 Nf3 g6 Be2 Bg7 c4 O-O Nc3 a6 h3 b6 O-O Bb7 a4 Qe8 d5 h6 Re1 Nh5 Bh2 e5 e4 Nf4 Bxf4 exf4 Nd4 Ne5 b3 Bc8 Rc1 Bd7 Rc2 Qc8 Bd3 g5 Rce2 g4 Nf5 f3' },
    puzzle: {
      id: '0NNEG', rating: 1102, plays: 0,
      themes: ['fork'],
      solution: ['f5e7', 'g8h8', 'e7c8'],
      initialPly: 43,
    },
  });

  // 0haqU: endgame, black to move — hardcoded (pgn would be complex)
  const p1: ParsedPuzzle = {
    id: '0haqU',
    rating: 1167,
    plays: 24912,
    themes: ['endgame', 'advancedPawn', 'crushing', 'long', 'promotion', 'discoveredAttack'],
    fenStart: '6k1/1q3p2/5prp/2b5/3pN3/1PP2P1P/2Q1R1P1/6K1 b - - 2 26',
    lastMoveUci: 'f2f3',
    fen: '6k1/1q3p2/5prp/2b5/3pN3/1PP2P1P/2Q1R1P1/6K1 b - - 0 27',
    solverColor: 'b',
    solution: ['d4d3', 'e4c5', 'd3c2', 'c5b7', 'c2c1q'],
  };

  // daily: hangingPiece, white to move, 23 half-moves
  const p2 = parsePuzzle({
    game: { pgn: 'd4 Nf6 Bg5 d5 Nf3 e6 e3 Nbd7 Bd3 Bd6 O-O O-O Nbd2 c6 Rc1 Re8 c3 e5 dxe5 Nxe5 Nxe5 Bxe5 Bb1 Bxh2+' },
    puzzle: {
      id: 'daily', rating: 1957, plays: 0,
      themes: ['hangingPiece'],
      solution: ['g1h2', 'f6g4', 'd1g4', 'c8g4', 'g5d8'],
      initialPly: 23,
    },
  });

  return [p0, p1, p2];
}

export const DEMO_TACTICS: ParsedPuzzle[] = computeDemoTactics();

export const DEMO_BLIND: ParsedPuzzle = DEMO_TACTICS[1];
