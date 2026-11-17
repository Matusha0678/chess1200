// Static opening definitions used by Guess-the-Opening.
// All move sequences are standard SAN and verified against chess.js rules.
export interface OpeningDef {
  id: string;
  name: string;
  eco?: string;
  moves: string[];
}

export const STATIC_OPENINGS: OpeningDef[] = [
  // ── e4 openings ──────────────────────────────────────────────────────────────
  { id: 'sicilian',             name: 'Сицилианская защита',                   eco: 'B20', moves: ['e4','c5'] },
  { id: 'sicilian-najdorf',     name: 'Сицилианская — Найдорф',                eco: 'B90', moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6'] },
  { id: 'sicilian-dragon',      name: 'Сицилианская — дракон',                 eco: 'B70', moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','g6'] },
  { id: 'sicilian-scheveningen',name: 'Сицилианская — Шевенинген',             eco: 'B80', moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','e6'] },
  { id: 'sicilian-classical',   name: 'Сицилианская — классический вариант',   eco: 'B56', moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4'] },
  { id: 'sicilian-kan',         name: 'Сицилианская — вариант Кана',           eco: 'B41', moves: ['e4','c5','Nf3','e6','d4','cxd4','Nxd4','a6'] },
  { id: 'french',               name: 'Французская защита',                    eco: 'C00', moves: ['e4','e6'] },
  { id: 'caro-kann',            name: 'Защита Каро-Канн',                      eco: 'B10', moves: ['e4','c6'] },
  { id: 'pirc',                 name: 'Защита Пирца-Уфимцева',                 eco: 'B07', moves: ['e4','d6','d4','Nf6','Nc3','g6'] },
  { id: 'alekhine',             name: 'Защита Алёхина',                        eco: 'B02', moves: ['e4','Nf6'] },
  { id: 'scandinavian',         name: 'Скандинавская защита',                  eco: 'B01', moves: ['e4','d5','exd5','Qxd5'] },
  { id: 'modern',               name: 'Современная защита',                    eco: 'B06', moves: ['e4','g6'] },
  { id: 'nimzowitsch',          name: 'Защита Нимцовича',                      eco: 'B00', moves: ['e4','Nc6'] },
  { id: 'ruy-lopez',            name: 'Испанская партия (Руи Лопес)',           eco: 'C60', moves: ['e4','e5','Nf3','Nc6','Bb5'] },
  { id: 'italian',              name: 'Итальянская партия',                    eco: 'C50', moves: ['e4','e5','Nf3','Nc6','Bc4'] },
  { id: 'giuoco-piano',         name: 'Джуоко Пьяно',                          eco: 'C54', moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5'] },
  { id: 'two-knights',          name: 'Защита двух коней',                     eco: 'C55', moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6'] },
  { id: 'evans-gambit',         name: 'Гамбит Эванса',                         eco: 'C51', moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5','b4'] },
  { id: 'scotch',               name: 'Шотландская партия',                    eco: 'C45', moves: ['e4','e5','Nf3','Nc6','d4'] },
  { id: 'four-knights',         name: 'Четырёх коней игра',                    eco: 'C47', moves: ['e4','e5','Nf3','Nc6','Nc3','Nf6'] },
  { id: 'three-knights',        name: 'Игра трёх коней',                       eco: 'C46', moves: ['e4','e5','Nf3','Nc6','Nc3'] },
  { id: 'kings-gambit',         name: 'Королевский гамбит',                    eco: 'C30', moves: ['e4','e5','f4'] },
  { id: 'kings-gambit-accepted',name: 'Королевский гамбит — принятый',         eco: 'C34', moves: ['e4','e5','f4','exf4'] },
  { id: 'vienna',               name: 'Венская партия',                        eco: 'C20', moves: ['e4','e5','Nc3'] },
  { id: 'bishops-opening',      name: 'Дебют слона',                           eco: 'C23', moves: ['e4','e5','Bc4'] },
  { id: 'petroff',              name: 'Русская партия (Петрова)',               eco: 'C42', moves: ['e4','e5','Nf3','Nf6'] },
  { id: 'philidor',             name: 'Защита Филидора',                       eco: 'C41', moves: ['e4','e5','Nf3','d6'] },
  { id: 'ponziani',             name: 'Дебют Понциани',                        eco: 'C44', moves: ['e4','e5','Nf3','Nc6','c3'] },
  // ── d4 openings ──────────────────────────────────────────────────────────────
  { id: 'queens-gambit',        name: 'Ферзевый гамбит',                       eco: 'D06', moves: ['d4','d5','c4'] },
  { id: 'qgd',                  name: 'Ферзевый гамбит — отказанный',          eco: 'D30', moves: ['d4','d5','c4','e6'] },
  { id: 'qga',                  name: 'Ферзевый гамбит — принятый',            eco: 'D20', moves: ['d4','d5','c4','dxc4'] },
  { id: 'slav',                 name: 'Славянская защита',                     eco: 'D10', moves: ['d4','d5','c4','c6'] },
  { id: 'nimzo-indian',         name: 'Защита Нимцовича-Индийская',            eco: 'E20', moves: ['d4','Nf6','c4','e6','Nc3','Bb4'] },
  { id: 'queens-indian',        name: 'Ферзево-индийская защита',              eco: 'E12', moves: ['d4','Nf6','c4','e6','Nf3','b6'] },
  { id: 'kings-indian',         name: 'Королевско-индийская защита',           eco: 'E60', moves: ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6'] },
  { id: 'gruenfeld',            name: 'Защита Грюнфельда',                     eco: 'D80', moves: ['d4','Nf6','c4','g6','Nc3','d5'] },
  { id: 'benoni',               name: 'Защита Бенони',                         eco: 'A60', moves: ['d4','Nf6','c4','c5','d5','e6'] },
  { id: 'benko',                name: 'Гамбит Бенко',                          eco: 'A57', moves: ['d4','Nf6','c4','c5','d5','b5'] },
  { id: 'budapest',             name: 'Будапештский гамбит',                   eco: 'A51', moves: ['d4','Nf6','c4','e5'] },
  { id: 'dutch',                name: 'Голландская защита',                    eco: 'A80', moves: ['d4','f5'] },
  { id: 'london',               name: 'Лондонская система',                    eco: 'D02', moves: ['d4','d5','Nf3','Nf6','Bf4'] },
  { id: 'colle',                name: 'Система Колле',                         eco: 'D05', moves: ['d4','d5','Nf3','Nf6','e3'] },
  { id: 'trompowsky',           name: 'Атака Тромповского',                    eco: 'A45', moves: ['d4','Nf6','Bg5'] },
  // ── Other first moves ────────────────────────────────────────────────────────
  { id: 'english',              name: 'Английское начало',                     eco: 'A10', moves: ['c4'] },
  { id: 'reti',                 name: 'Дебют Рети',                            eco: 'A09', moves: ['Nf3','d5','c4'] },
  { id: 'catalan',              name: 'Каталонское начало',                    eco: 'E00', moves: ['d4','Nf6','c4','e6','g3'] },
];

// Scoring: points = max(1, 10 - 2 * movesSeen)
export function guessScore(movesSeen: number): number {
  return Math.max(1, 10 - 2 * movesSeen);
}

// Simple LCG seeded PRNG (Knuth's multiplicative method)
export function seededRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function dateToSeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Pick the target opening for a given day seed, from the full pool
export function pickDailyOpening(pool: OpeningDef[], seed: number): OpeningDef {
  const rng = seededRNG(seed);
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}

// Build the initial 8 options (target + 7 distractors), seeded
export function buildInitialOptions(
  pool: OpeningDef[],
  target: OpeningDef,
  seed: number,
): OpeningDef[] {
  const rng = seededRNG(seed + 1);
  const others = pool.filter(o => o.id !== target.id).sort(() => rng() - 0.5).slice(0, 7);
  return [...others, target].sort(() => rng() - 0.5);
}

// Filter options down: keep only those whose moves match revealedMoves prefix
export function filterOptions(options: OpeningDef[], revealedMoves: string[]): OpeningDef[] {
  if (revealedMoves.length === 0) return options;
  return options.filter(o =>
    revealedMoves.every((m, i) => o.moves[i] === m),
  );
}
