// src/lib/demo-positions.ts — демо-позиции для проверки вида (BOARD-EXPLAIN.md, раздел 4)

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
