// Demo data for the openings trainer — matches the live mockup exactly.
// No database needed — used by /openings/demo, /openings/review?demo=1, /openings?demo=1.

const DAY = 86400000;

export interface DemoLineProg {
  mastery: number;
  next_review: string;
  correct_count: number;
  incorrect_count: number;
  last_practiced: string;
}

export interface DemoLine {
  id: string;
  index: number;
  sans: string;
  prog: DemoLineProg | null;
  badge: string | null;
  line_class: string | null;
}

export interface DemoTrainer {
  opening: { id: string; name: string; color: 'white' | 'black' | 'both' };
  lines: DemoLine[];
}

export function getDemoTrainer(): DemoTrainer {
  const now = Date.now();
  return {
    opening: { id: 'demo', name: 'Ускоренный дракон', color: 'black' },
    lines: [
      {
        id: 'L1', index: 0,
        sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nxc6 bxc6 Qd4 Nf6 e5 Nd5 e6 f6',
        prog: {
          mastery: 4,
          next_review: new Date(now + 20 * DAY).toISOString(),
          correct_count: 4, incorrect_count: 1,
          last_practiced: new Date(now - 10 * DAY).toISOString(),
        },
        badge: '⭐', line_class: 'main',
      },
      {
        id: 'L2', index: 1,
        sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O Qd2 Be6',
        prog: {
          mastery: 2,
          next_review: new Date(now - 1 * DAY).toISOString(),
          correct_count: 2, incorrect_count: 1,
          last_practiced: new Date(now - 12 * DAY).toISOString(),
        },
        badge: null, line_class: 'common',
      },
      {
        id: 'L3', index: 2,
        sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 Qa5 O-O O-O Bb3 d6',
        prog: {
          mastery: 1,
          next_review: new Date(now - 3 * DAY).toISOString(),
          correct_count: 1, incorrect_count: 0,
          last_practiced: new Date(now - 6 * DAY).toISOString(),
        },
        badge: '🔥', line_class: 'sharp',
      },
      {
        id: 'L4', index: 3,
        sans: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Nb3 Nf6 Be2 O-O O-O d6',
        prog: {
          mastery: 2,
          next_review: new Date(now + 4 * DAY).toISOString(),
          correct_count: 2, incorrect_count: 0,
          last_practiced: new Date(now - 3 * DAY).toISOString(),
        },
        badge: null, line_class: 'rare',
      },
      {
        id: 'L5', index: 4,
        sans: 'e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3 Bg7 h3 Nf6 Nc3 O-O',
        prog: null, badge: null, line_class: 'common',
      },
      {
        id: 'L6', index: 5,
        sans: 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6',
        prog: null, badge: null, line_class: null,
      },
    ],
  };
}

export const DEMO_SCOTCH: DemoTrainer = {
  opening: { id: 'demo-scotch', name: 'Шотландская партия', color: 'white' },
  lines: [
    {
      id: 'S1', index: 0,
      sans: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nxc6 Qf6 Qd2 dxc6 Nc3',
      prog: {
        mastery: 3,
        next_review: new Date(Date.now() + 9 * DAY).toISOString(),
        correct_count: 3, incorrect_count: 0,
        last_practiced: new Date(Date.now() - 5 * DAY).toISOString(),
      },
      badge: null, line_class: null,
    },
    {
      id: 'S2', index: 1,
      sans: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4',
      prog: {
        mastery: 1,
        next_review: new Date(Date.now() - 2 * DAY).toISOString(),
        correct_count: 1, incorrect_count: 1,
        last_practiced: new Date(Date.now() - 10 * DAY).toISOString(),
      },
      badge: null, line_class: null,
    },
  ],
};

export const DEMO_GAME_DEV = [
  {
    lineId: 'L2', ply: 7, played: 'Nf6', played_uci: 'g8f6',
    opp: 'petr_k', date: '10 ноя', result: 'loss' as const, daysAgo: 9,
  },
];

export const DEMO_MOVE_ROWS = [
  { line_id: 'L2', move_index: 7, incorrect_count: 2, daysAgo: 9 },
  { line_id: 'L3', move_index: 13, incorrect_count: 1, daysAgo: 2 },
  { line_id: 'L1', move_index: 11, incorrect_count: 1, daysAgo: 1 },
];

export const DEMO_EXAM_ORDER = ['L2', 'L1', 'L3', 'L4', 'L5', 'L6'];

export const DEMO_CATALOG = [
  {
    id: 'demo', name: 'Ускоренный дракон', color: 'black' as const,
    totalLines: 6, mastered: 1, learning: 1, due: 2, newLines: 2,
    cardFen: 'r1bqkbnr/pp1ppp1p/2n3p1/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5',
  },
  {
    id: 'demo-scotch', name: 'Шотландская партия', color: 'white' as const,
    totalLines: 8, mastered: 5, learning: 2, due: 1, newLines: 0,
    cardFen: 'r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4',
  },
  {
    id: 'demo-italian', name: 'Итальянская партия', color: 'white' as const,
    totalLines: 10, mastered: 2, learning: 4, due: 0, newLines: 4,
    cardFen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 3',
  },
  {
    id: 'demo-stafford', name: 'Гамбит Стаффорда', color: 'black' as const,
    totalLines: 5, mastered: 0, learning: 0, due: 0, newLines: 5,
    cardFen: 'r1bqkb1r/pppp1ppp/2n2n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 2 4',
  },
  {
    id: 'demo-caro', name: 'Каро-Канн, система с e5', color: 'black' as const,
    totalLines: 7, mastered: 7, learning: 0, due: 0, newLines: 0,
    cardFen: 'rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 1 4',
  },
];
