export const CHESS_USERNAME = 'rozt1shka';
export const APP_START_DATE = '2026-10-21';
export const START_RATING = 823;
export const TARGET_RATING = 1200;

export const RATING_CHECKPOINTS: Record<number, [number, number]> = {
  7:  [880, 920],
  14: [960, 1000],
  21: [1050, 1100],
  30: [1150, 1200],
};

export const LIGHT_DAYS = [7, 14, 21, 28];

export const DAY_THEMES: Record<number, string> = {
  1:  'Висячие фигуры и их ценность',
  2:  'Вилка',
  3:  'Связка',
  4:  'Скрытый удар и скрытый шах',
  5:  'Рентген и отвлечение',
  6:  'Основные маты (Ф, Л, две ладьи)',
  7:  'Лёгкий день — Puzzle Rush + Анализ',
  8:  'Принципы дебюта — запиши репертуар',
  9:  'Итальянская партия (белые)',
  10: 'Чёрные против 1.e4 (1...e5)',
  11: 'Чёрные против 1.d4 (ФГД)',
  12: 'Ловушки в моих дебютах',
  13: 'Мат в 2 хода — задние ряды, задушенный мат',
  14: 'Лёгкий день — проверь дебюты в Insights',
  15: 'Улучши худшую фигуру',
  16: 'Ладьи на открытых линиях',
  17: 'Слабые поля и форпосты коня',
  18: 'Пешечная структура',
  19: 'Атака на короля',
  20: 'Размен при перевесе',
  21: 'Лёгкий день — топ-3 ошибки из тетради',
  22: 'Король + пешка, оппозиция, правило квадрата',
  23: 'Пешечные окончания, проходная пешка',
  24: 'Позиция Лусены',
  25: 'Позиция Филидора',
  26: 'Реализация лишнего материала против бота',
  27: 'Повтори 3 слабые темы',
  28: 'Лёгкий день',
  29: 'Турнирный день — 5-6 партий',
  30: 'Финал — 5 партий + итоги месяца',
};

export const LEVELS = [
  { name: 'Пешка',  min: 0    },
  { name: 'Конь',   min: 100  },
  { name: 'Слон',   min: 250  },
  { name: 'Ладья',  min: 500  },
  { name: 'Ферзь',  min: 900  },
  { name: 'Король', min: 1500 },
];

export const BADGE_DEFINITIONS = [
  { key: 'first_day',   label: 'Первый день',           description: 'Завершил первый день' },
  { key: 'streak_7',    label: '7 дней подряд',          description: '7 дней подряд без пропусков' },
  { key: 'clean_week',  label: 'Чистая неделя',          description: 'Неделя без блица и пули' },
  { key: 'castle_10',   label: 'Рокировка вовремя ×10',  description: 'Рокировал до 10-го хода в 10 партиях' },
  { key: 'mate_master', label: 'Мастер мата в 2',        description: 'Завершил тему "мат в 2"' },
  { key: 'plus_100',    label: '+100 рейтинга',           description: 'Набрал 100 очков рейтинга' },
  { key: 'rating_1000', label: '1000!',                   description: 'Достиг рейтинга 1000' },
  { key: 'rating_1100', label: '1100!',                   description: 'Достиг рейтинга 1100' },
  { key: 'rating_1200', label: '1200!',                   description: 'Достиг рейтинга 1200 — цель!' },
];

export const MISTAKE_TAGS = [
  'зевок_ферзя',
  'зевок_фигуры',
  'упустил_мат',
  'время',
  'эндшпиль',
  'дебют',
];

export const CHESS_LINKS = {
  puzzles:    'https://www.chess.com/puzzles',
  lessons:    'https://www.chess.com/lessons',
  play:       'https://www.chess.com/play/online?timeControl=rapid&time=10&increment=0',
  review:     'https://www.chess.com/analysis',
  puzzleRush: 'https://www.chess.com/puzzles/rush',
  insights:   'https://www.chess.com/insights',
};
