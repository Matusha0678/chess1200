export type EndgameGoal = 'win' | 'draw';
export type EndgameCategory = 'king_pawn' | 'rook' | 'light_pieces' | 'queen_vs_pawn';

export interface Endgame {
  id: string;
  fen: string;
  goal: EndgameGoal;
  difficulty: 1 | 2 | 3;
  category: EndgameCategory;
  idea: string;
}

export const ENDGAMES: Endgame[] = [
  // ═══ KING AND PAWN ═══
  {
    id: 'kp-01', fen: '8/4P3/4K3/8/8/8/8/5k2 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'king_pawn',
    idea: 'Пешка на 7-й, король на 6-й. Одним ходом пешку в ферзи.',
  },
  {
    id: 'kp-02', fen: '8/8/8/8/8/8/4P3/4K1k1 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'king_pawn',
    idea: 'Выведи короля на e3–e4–e5, сопровождая пешку к превращению.',
  },
  {
    id: 'kp-05', fen: '8/8/5K2/5P2/8/5k2/8/8 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король на 6-й горизонтали — ключевое поле занято. Поддержи пешку.',
  },
  {
    id: 'kp-06', fen: '8/8/8/4K3/8/4P3/8/4k3 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король далеко впереди пешки. Держи оппозицию и веди пешку.',
  },
  {
    id: 'kp-07', fen: '8/8/8/8/8/8/3P4/3K1k2 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Марш на ключевое поле перед пешкой определяет победу.',
  },
  {
    id: 'kp-08', fen: '8/8/8/8/8/8/5P2/5K1k w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Захвати ключевые поля f3–f4 и веди пешку при поддержке короля.',
  },
  {
    id: 'kp-09', fen: '8/8/8/8/4k3/4P3/4K3/8 b - - 0 1',
    goal: 'draw', difficulty: 2, category: 'king_pawn',
    idea: 'Чёрный король перед пешкой — классическая ничья. Держи оппозицию.',
  },
  {
    id: 'kp-10', fen: '8/8/8/8/8/k7/p7/K7 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'king_pawn',
    idea: 'Ладейная пешка заблокирована: любой ход короля даёт белым взять пешку. Ничья.',
  },
  {
    id: 'kp-11', fen: '8/8/8/8/1P6/8/8/1K3k2 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король опередил — веди к ключевому полю b5, пешка следует за ним.',
  },
  {
    id: 'kp-12', fen: '8/8/8/3K4/8/3P4/8/3k4 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король опередил чёрного. Оппозиция и ключевые поля d5–e5.',
  },

  // ═══ ROOK ENDGAMES ═══
  {
    id: 're-01', fen: '8/8/8/8/4k3/8/8/4KR2 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'rook',
    idea: 'Ладья и король матуют одинокого короля: оттесняй к краю.',
  },
  {
    id: 're-02', fen: '8/8/8/8/8/8/3P4/3RK2k w - - 0 1',
    goal: 'win', difficulty: 1, category: 'rook',
    idea: 'Ладья отрезает короля по горизонтали. Пешка свободно продвигается.',
  },
  {
    id: 're-03', fen: '1K1k4/1P6/8/8/8/8/r7/4R3 w - - 0 1',
    goal: 'win', difficulty: 3, category: 'rook',
    idea: 'Позиция Лусены: «строй мост» ладьёй, чтобы прикрыть короля от шахов.',
  },
  {
    id: 're-04', fen: '2k5/2P5/2K5/8/8/8/8/R7 w - - 0 1',
    goal: 'win', difficulty: 3, category: 'rook',
    idea: 'Ладья на первой горизонтали, пешка рвётся в ферзи. Маневр для укрытия.',
  },
  {
    id: 're-05', fen: '8/8/r7/6k1/4P3/4K3/8/4R3 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'rook',
    idea: 'Метод Филидора: ладья на 6-й горизонтали. После Ke5 — на 1-ю для шахов.',
  },
  {
    id: 're-06', fen: '8/8/8/8/3R4/8/3P4/3K3k w - - 0 1',
    goal: 'win', difficulty: 2, category: 'rook',
    idea: 'Ладья по горизонтали отрезает вражеского короля. Пешка проходит без помех.',
  },
  {
    id: 're-07', fen: '8/8/8/8/8/P7/R7/K6k w - - 0 1',
    goal: 'win', difficulty: 1, category: 'rook',
    idea: 'Ладья позади проходной пешки — классический принцип Нимцовича.',
  },
  {
    id: 're-09', fen: '8/8/8/8/8/8/P7/1R1K3k w - - 0 1',
    goal: 'win', difficulty: 2, category: 'rook',
    idea: 'Ладья на второй линии поддерживает пешку. Марш к превращению.',
  },
  {
    id: 're-10', fen: '8/8/8/8/3k4/8/3P4/3K1R2 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'rook',
    idea: 'Ладья по горизонтали отрезает вражеского короля. Пешка решает партию.',
  },

  // ═══ LIGHT PIECES ═══
  {
    id: 'lp-07', fen: '8/8/8/8/3n4/3k4/8/3KB3 w - - 0 1',
    goal: 'draw', difficulty: 2, category: 'light_pieces',
    idea: 'Конь против слона без пешек — теоретическая ничья.',
  },

  // ═══ QUEEN VS PAWN ═══
  {
    id: 'qp-01', fen: '8/8/8/8/8/5Q2/4p3/4k1K1 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'queen_vs_pawn',
    idea: 'Ферзь легко останавливает центральную пешку. Подведи короля и добей.',
  },
  {
    id: 'qp-03', fen: 'Q7/8/8/8/8/8/p7/k5K1 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'queen_vs_pawn',
    idea: 'Ладейная пешка на 2-й горизонтали — пат-ловушка. Король перед пешкой!',
  },
  {
    id: 'qp-04', fen: 'Q7/8/8/8/8/8/2p5/2k3K1 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'queen_vs_pawn',
    idea: 'Слоновая пешка на 2-й горизонтали: та же ничейная идея с патом.',
  },
  {
    id: 'qp-06', fen: '8/8/8/8/8/3Q4/3p4/3k1K2 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'queen_vs_pawn',
    idea: 'Ферзь атакует пешку. Центральные пешки не спасают от потери.',
  },
  {
    id: 'qp-07', fen: 'K6Q/8/8/8/8/8/7p/7k w - - 0 1',
    goal: 'draw', difficulty: 3, category: 'queen_vs_pawn',
    idea: 'h-пешка на 2-й горизонтали: теоретическая ничья — пат в углу h1.',
  },
  {
    id: 'qp-08', fen: '8/8/8/8/8/8/3p4/3k2KQ w - - 0 1',
    goal: 'win', difficulty: 2, category: 'queen_vs_pawn',
    idea: 'Ферзь и король атакуют пешку и одинокого короля. Мат неизбежен.',
  },
];

export const CATEGORY_LABELS: Record<EndgameCategory, string> = {
  king_pawn: 'Король и пешка',
  rook: 'Ладейные',
  light_pieces: 'Лёгкие фигуры',
  queen_vs_pawn: 'Ферзь против пешки',
};
