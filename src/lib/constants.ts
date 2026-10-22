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
  1:  'Висячие фигуры — размен «что сколько стоит»',
  2:  'Вилка',
  3:  'Связка',
  4:  'Открытое нападение и открытый шах',
  5:  'Сквозной удар, отвлечение',
  6:  'Базовые маты: ферзём, ладьёй, двумя ладьями',
  7:  'Лёгкий день',
  8:  'Принципы дебюта: центр, развитие, рокировка до 10-го хода',
  9:  'Гамбит Эванса: жертва пешки за быструю атаку',
  10: 'Чёрные против 1.e4: защита двух коней, атака на f2',
  11: 'Чёрные против 1.d4: контргамбит Альбина и ловушка Ласкера',
  12: 'Ловушки в твоих дебютах (ставишь ты и ставят тебе)',
  13: 'Маты в 2 + жертвы на f7 и h7 (греческий дар)',
  14: 'Лёгкий день',
  15: 'Нет угроз? Улучши худшую фигуру',
  16: 'Вскрытие линий к королю: жертва ради атаки',
  17: 'Слабые поля и форпост для коня',
  18: 'Пешечная структура: куда двигать пешки',
  19: 'Атака на короля по партиям Таля: жертвы на e6, f7, h7',
  20: 'Размены: впереди по материалу — меняй фигуры, не пешки',
  21: 'Лёгкий день',
  22: 'Король и пешка: оппозиция, правило квадрата',
  23: 'Пешечные эндшпили: проходная пешка',
  24: 'Ладейный эндшпиль: позиция Лусены (как выиграть)',
  25: 'Ладейный эндшпиль: позиция Филидора (как сделать ничью)',
  26: 'Реализация лишней фигуры / пешки',
  27: 'Повтор 3 слабых тем из тетради',
  28: 'Лёгкий день',
  29: 'Турнирный день',
  30: 'Финал',
};

export const DAY_DATES: Record<number, string> = {
  1:  '21 окт', 2:  '22 окт', 3:  '23 окт', 4:  '24 окт', 5:  '25 окт',
  6:  '26 окт', 7:  '27 окт', 8:  '28 окт', 9:  '29 окт', 10: '30 окт',
  11: '31 окт', 12: '1 ноя',  13: '2 ноя',  14: '3 ноя',  15: '4 ноя',
  16: '5 ноя',  17: '6 ноя',  18: '7 ноя',  19: '8 ноя',  20: '9 ноя',
  21: '10 ноя', 22: '11 ноя', 23: '12 ноя', 24: '13 ноя', 25: '14 ноя',
  26: '15 ноя', 27: '16 ноя', 28: '17 ноя', 29: '18 ноя', 30: '19 ноя',
};

export const DAY_SPECIAL_TASKS: Record<number, string | null> = {
  1:  'Выучи чек-лист наизусть. Играй медленно.',
  2:  'Найди вилки в своих прошлых партиях (Game Review).',
  3:  null,
  4:  null,
  5:  null,
  6:  'Drills против компьютера, пока не поставишь мат без ошибок.',
  7:  'Puzzle Rush (3 попытки). Insights: где теряешь очки.',
  8:  'Запиши свой репертуар: за белых, за чёрных против e4 и d4.',
  9:  'Выучи первые 6-8 ходов Гамбита Эванса и план после них.',
  10: 'Выучи первые 6-8 ходов Защиты двух коней и план после них.',
  11: 'Выучи первые ходы Контргамбита Альбина и ловушку Ласкера.',
  12: null,
  13: null,
  14: 'Проверь дебюты по Insights / Opening Explorer: где ошибаешься.',
  15: 'В каждой партии 1 раз спроси: «какая моя фигура сейчас худшая?»',
  16: null,
  17: null,
  18: null,
  19: null,
  20: null,
  21: 'Перечитай тетрадь ошибок: 3 самые частые — в фокус недели 4.',
  22: 'Drills: выиграй каждую позицию 3 раза.',
  23: null,
  24: null,
  25: null,
  26: 'Сыграй с ботом из выигранной позиции до мата.',
  27: null,
  28: 'Отдых перед финалом.',
  29: '5-6 партий, каждую разобрать.',
  30: '5 партий, итог месяца, план на следующий месяц.',
};

export const TAL_GAMES = [
  { white: 'Таль', black: 'Ларсен',    year: 1965, note: '6-я партия матча' },
  { white: 'Таль', black: 'Смыслов',   year: 1959, note: 'Кандидатский турнир' },
  { white: 'Таль', black: 'Ботвинник', year: 1960, note: '6-я партия матча' },
  { white: 'Таль', black: 'Хеккерт',   year: 1958, note: '' },
  { white: 'Таль', black: 'Котов',     year: 1964, note: '' },
];

export const GRANDMASTER_QUOTES = [
  { text: 'You must take your opponent into a deep dark forest where 2+2=5, and the path leading out is only wide enough for one.', author: 'Михаил Таль' },
  { text: 'Chess is life in miniature. Chess is struggle, chess is battles.', author: 'Гарри Каспаров' },
  { text: 'Chess is war over the board. The object is to crush the opponent\'s mind.', author: 'Роберт Фишер' },
  { text: 'In order to improve your game, you must study the endgame before everything else.', author: 'Хосе Рауль Капабланка' },
  { text: 'The tactician knows what to do when there is something to do; it takes a strategist to know what to do when there is nothing to do.', author: 'Савелли Тартаковер' },
  { text: 'Chess is the art of analysis.', author: 'Михаил Ботвинник' },
  { text: 'Not all artists are chess players, but all chess players are artists.', author: 'Марсель Дюшан' },
  { text: 'Chess is everything — art, science, and sport.', author: 'Анатолий Карпов' },
  { text: 'When you see a good move, look for a better one.', author: 'Эмануэль Ласкер' },
  { text: 'Every chess master was once a beginner.', author: 'Ирвинг Чернев' },
  { text: 'One bad move nullifies forty good ones.', author: 'Савелий Тартаковер' },
  { text: 'The blunders are all there on the board, waiting to be made.', author: 'Савелий Тартаковер' },
  { text: 'Chess is the gymnasium of the mind.', author: 'Блез Паскаль' },
  { text: 'Pawns are the soul of chess.', author: 'Франсуа-Андре Данникан Филидор' },
  { text: 'It is not a move, even the best move, that you must seek, but a realisable plan.', author: 'Эжен Зноско-Боровский' },
  { text: 'A chess player who sees only one move ahead is already lost.', author: 'Рудольф Шпильман' },
  { text: 'Give me a difficult positional game, I will play it. But totally won positions, I cannot stand them.', author: 'Михаил Таль' },
  { text: 'The most important thing in chess is the next move.', author: 'Саймон Уэббер' },
  { text: 'Half the variations which are calculated in a tournament game turn out to be superfluous.', author: 'Михаил Таль' },
  { text: 'First restrain, then blockade, then destroy.', author: 'Арон Нимцович' },
  { text: 'Chess is not about winning; it is about understanding.', author: 'Шахматная мудрость' },
  { text: 'The pin is mightier than the sword.', author: 'Фред Рейнфельд' },
  { text: 'A good player is always lucky.', author: 'Хосе Рауль Капабланка' },
  { text: 'Avoid the crowd. Do your own thinking independently. Be the chess player, not the chess piece.', author: 'Ральф Чарелл' },
  { text: 'No price is too great for the scalp of an enemy King.', author: 'Аарон Нимцович' },
  { text: 'Chess holds its master in its own bonds, shaking the mind and brain so that the inner freedom of the very strongest must suffer.', author: 'Альберт Эйнштейн' },
  { text: 'Tactics flow from a superior position.', author: 'Бобби Фишер' },
  { text: 'The winner of the game is the player who makes the next-to-last mistake.', author: 'Савелий Тартаковер' },
  { text: 'All that matters on the chessboard is good moves.', author: 'Бобби Фишер' },
  { text: 'Chess is beautiful enough to waste your life for.', author: 'Ганс Ree' },
];

export const MONTH_RULES = [
  'Только рапид 10 мин. Блиц и пулю не играй — они учат делать ходы без проверки.',
  'Проиграл 2 партии подряд — стоп. Дальше только задачи и разбор.',
  'Каждую партию разбирай. Партия без разбора — потерянное время.',
  'Не играй уставшим или злым.',
  'Тетрадь: после каждой партии — «главная ошибка» и «что делать вместо».',
  'Держи 2-3 минуты на часах. Первые 10 ходов — быстро; время трать в миттельшпиле.',
  'Рокировка до 10-го хода. Всегда, если нет прямого выигрыша.',
  'Ферзя не выводить рано — сначала кони и слоны.',
  'За белых: Итальянская + Гамбит Эванса. За чёрных: против 1.e4 — Защита двух коней; против 1.d4 — Контргамбит Альбина. Венскую не играй.',
];

export const LEVELS = [
  { name: 'Пешка',  min: 0    },
  { name: 'Конь',   min: 100  },
  { name: 'Слон',   min: 250  },
  { name: 'Ладья',  min: 500  },
  { name: 'Ферзь',  min: 900  },
  { name: 'Король', min: 1500 },
];

export const BADGE_DEFINITIONS = [
  // Дисциплина
  { key: 'first_day',      label: 'Первый шаг',           description: 'Завершил первый день тренировок' },
  { key: 'streak_7',       label: 'Неделя воли',           description: '7 дней подряд без пропусков' },
  { key: 'streak_14',      label: 'Две недели',            description: '14 дней подряд — уже привычка' },
  { key: 'streak_30',      label: 'Месяц без пропусков',   description: 'Все 30 дней программы выполнены' },
  { key: 'clean_week',     label: 'Чистая неделя',         description: 'Неделя без блица и пули' },
  { key: 'full_month',     label: 'Марафонец',             description: 'Закончил программу Chess 1200' },
  // Тактика
  { key: 'castle_10',      label: 'Рокировка x10',         description: 'Рокировал до 10-го хода в 10 партиях подряд' },
  { key: 'mate_master',    label: 'Мастер мата в 2',       description: 'Завершил тему «Маты в 2»' },
  { key: 'tactics_week',   label: 'Тактик недели',         description: 'Завершил первую неделю (дни 1–7)' },
  { key: 'endgame_student',label: 'Студент эндшпиля',      description: 'Завершил блок эндшпилей (дни 22–26)' },
  // Дебюты
  { key: 'debut_first',    label: 'Теоретик',              description: 'Добавил первый дебют в репертуар' },
  { key: 'debut_practiced',label: 'Знаток дебютов',        description: 'Сыграл 25 линий в тренажёре дебютов' },
  { key: 'debut_mastered', label: 'Мастер вариаций',       description: 'Довёл хотя бы одну линию до mastery 5' },
  { key: 'repertoire_3',   label: 'Репертуар',             description: '3 дебюта в репертуаре' },
  // Таль
  { key: 'tal_magic_5',    label: 'Ученик Таля',           description: 'Выполнил «Магию дня» 5 раз' },
  { key: 'tal_magic_15',   label: 'Последователь Таля',    description: 'Выполнил «Магию дня» 15 раз' },
  { key: 'tal_disciple',   label: 'Адепт Риги',            description: 'Выполнил «Магию дня» все 30 раз' },
  // Рейтинг
  { key: 'plus_50',        label: '+50 рейтинга',          description: 'Первые 50 очков прироста' },
  { key: 'plus_100',       label: '+100 рейтинга',         description: '100 очков прироста за месяц' },
  { key: 'plus_200',       label: '+200 рейтинга',         description: 'Невероятный прогресс за месяц' },
  { key: 'rating_900',     label: '900',                   description: 'Рейтинг перешагнул 900' },
  { key: 'rating_1000',    label: '1000',                  description: 'Рейтинг 1000 — середина пути' },
  { key: 'rating_1100',    label: '1100',                  description: 'Рейтинг 1100 — почти у цели' },
  { key: 'rating_1200',    label: '1200',                  description: 'Цель достигнута. Chess 1200.' },
  // Уровни XP
  { key: 'level_knight',   label: 'Уровень: Конь',         description: 'Набрал 100 XP' },
  { key: 'level_bishop',   label: 'Уровень: Слон',         description: 'Набрал 250 XP' },
  { key: 'level_rook',     label: 'Уровень: Ладья',        description: 'Набрал 500 XP' },
  { key: 'level_queen',    label: 'Уровень: Ферзь',        description: 'Набрал 900 XP' },
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
  openings:   'https://www.chess.com/openings',
  games:      'https://www.chess.com/analysis/game/pgn',
  archive:    'https://www.chess.com/games/archive/' + CHESS_USERNAME,
  profile:    'https://www.chess.com/member/' + CHESS_USERNAME,
  explorer:   'https://www.chess.com/explorer',
  practice:   'https://www.chess.com/practice',
  drills:     'https://www.chess.com/drills',
  coaches:    'https://www.chess.com/coaches',
  study:      'https://www.chess.com/learn',
  clubhouse:  'https://www.chess.com/club',
};
