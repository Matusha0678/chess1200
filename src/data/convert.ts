export interface ConvertPosition {
  id: string;
  fen: string;
  idea: string;
}

// Verified by scripts/verify-convert.mjs (depth 14, threshold +300 cp).
// All positions: White to move, eval ≥ +300 cp.
export const CONVERT_POSITIONS: ConvertPosition[] = [
  {
    id: 'cv-01',
    fen: '1K1k4/1P6/8/8/8/8/r7/4R3 w - - 0 1',
    idea: 'Позиция Лусены: «строй мост» — ладья на пятой, выведи короля из-под шахов.',
  },
  {
    id: 'cv-06',
    fen: '8/8/4k3/8/8/4K3/8/3r1RR1 w - - 0 1',
    idea: 'Лишняя ладья: комбинируй две ладьи для мата или выигрыша ладьи противника.',
  },
  {
    id: 'cv-07',
    fen: '8/8/4Pk2/8/8/5K2/8/4R3 w - - 0 1',
    idea: 'Ладья и проходная пешка на 6-й против одинокого короля — техника ограничения.',
  },
  {
    id: 'cv-09',
    fen: '8/8/8/4k3/8/8/4NP1P/5K2 w - - 0 1',
    idea: 'Конь и две пешки против голого короля — проведи пешку при поддержке коня.',
  },
  {
    id: 'cv-10',
    fen: '8/8/8/4k3/8/8/4BP1P/5K2 w - - 0 1',
    idea: 'Слон и две пешки против голого короля — проведи пешку под прикрытием слона.',
  },
  {
    id: 'cv-14',
    fen: '8/8/8/8/5k2/5P2/5KP1/8 w - - 0 1',
    idea: 'Две пешки против голого короля — одна пройдёт в ферзи.',
  },
];
