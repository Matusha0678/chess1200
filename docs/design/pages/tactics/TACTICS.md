# «Тактика» и «метод дятла» — `/tactics`

Задачи Lichess по темам, «мои слабые темы», маты и «метод дятла» (один набор задач по кругу, каждый круг быстрее). Макета нет — раскладка как у `/mistakes` и `/threats` (`TrainerLayout`). Ветка `feat/tactics`. Пункт меню «Тактика» в группе «Тренироваться» первым, иконка `zap`.

## 1. Данные — `supabase/32-puzzles.sql`
```sql
-- safe to re-run
CREATE TABLE IF NOT EXISTS puzzles (
  id         text PRIMARY KEY,          -- id задачи Lichess
  fen_start  text NOT NULL,             -- до последнего хода соперника
  last_move  text NOT NULL,             -- UCI
  fen        text NOT NULL,             -- позиция задачи (ход решающего)
  solution   text[] NOT NULL,           -- UCI
  themes     text[] NOT NULL,
  rating     integer,
  plays      integer,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS puzzle_sets (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  puzzle_ids text[] NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  puzzle_id text NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  set_id    uuid REFERENCES puzzle_sets(id) ON DELETE SET NULL,
  cycle     integer,
  ok        boolean NOT NULL,
  seconds   numeric,
  played_at timestamptz DEFAULT now()
);
-- RLS «allow all» и индексы: puzzles (themes) GIN, puzzle_attempts (puzzle_id), (set_id, cycle)
```
Задачи берутся через `/api/lichess/puzzles` (задача 4 в `NIGHT.md`), сохраняются `upsert` по `id`. Один запрос за раз, только по нажатию пользователя; на `429` — подождать минуту и сказать об этом.

## 2. Режимы (список в левой колонке, `data-ui="session-list"`)
1. **«По темам»** — список тем (ниже). Выбор темы: если нерешённых задач этой темы в базе меньше 10 — кнопка «Загрузить 50 задач» (`nb=50`, `difficulty=normal`).
2. **«Мои слабые темы»** — 3 темы по тегам `mistake_cards` за 60 дней: `hanging` → `hangingPiece`; `missed_tactic` → `fork`, `pin`, `discoveredAttack`; `missed_check` → `mateIn2`, `backRankMate`. Карточек нет — `mix`. Подпись строки: «по твоим ошибкам: вилки, связки…».
3. **«Маты»** — `mateIn1`, `mateIn2`, `mateIn3`, `backRankMate`, `smotheredMate`, `anastasiaMate`, `arabianMate`, `bodenMate`, `hookMate`, `dovetailMate`, `doubleBishopMate`.
4. **«Метод дятла»** — раздел 4.

Темы и подписи (ключи проверены по списку Lichess `puzzleTheme.xml`):
`fork` Вилка · `pin` Связка · `skewer` Сквозной удар · `discoveredAttack` Вскрытое нападение · `doubleCheck` Двойной шах · `hangingPiece` Незащищённая фигура · `trappedPiece` Ловля фигуры · `deflection` Отвлечение · `attraction` Завлечение · `clearance` Освобождение поля · `interference` Перекрытие · `intermezzo` Промежуточный ход · `quietMove` Тихий ход · `sacrifice` Жертва · `capturingDefender` Уничтожение защиты · `xRayAttack` Рентген · `zugzwang` Цугцванг · `kingsideAttack` Атака на короля · `attackingF2F7` Атака на f2/f7 · `promotion` Превращение · `advancedPawn` Проходная пешка · `endgame` Эндшпиль · `mateIn1` Мат в 1 · `mateIn2` Мат в 2 · `mateIn3` Мат в 3 · `backRankMate` Мат по последней горизонтали · `smotheredMate` Спёртый мат · `anastasiaMate` Мат Анастасии · `arabianMate` Арабский мат · `bodenMate` Мат Бодена · `hookMate` Мат крюком · `dovetailMate` Мат «ласточкин хвост» · `doubleBishopMate` Мат двумя слонами · `mix` Смесь.

## 3. Как решается задача
1. Доска — `fen_start`, решающий снизу. Через 400 мс анимация `last_move` (подсветка последнего хода) → позиция задачи.
2. Пользователь ходит (`Board` с `interactive`, `movableColor` = решающий). Ход верный, если равен `solution[k]` (UCI, с превращением) **или** ставит мат (Lichess принимает любой мат).
3. Верно и ходы ещё есть → через 300 мс ответ соперника `solution[k+1]` (анимация), дальше снова пользователь.
4. Всё решено → зелёная карточка «Решено за 0:12» (+ значок `best` на последнем сыгранном ходе), `puzzle_attempts` (`ok = true`, `seconds`).
5. Неверно → ход отменяется, доска — позиция до него; зелёная пунктирная стрелка верного хода (`role: 'best'`), без значков; красная карточка «Не то. Здесь {SAN верного хода}»; попытка `ok = false`. Кнопки «Ещё раз» (не считается) и «Дальше».
6. «Показать решение» — проиграть оставшиеся ходы по 900 мс (как ▶ в «Жертвах»), попытка — `ok = false`.

**Панель:** шапка «Тренировка · Тактика», заголовок «Найди лучший ход» (для `mateInN` — «Мат в N»), чипы: до 3 тем по-русски, «Рейтинг {rating}», «Ход белых | чёрных»; таймер задачи; карточка результата (`data-ui="tactics-feedback"`, `data-result="ok|fail"`); низ (`panel-actions`): «Подсказка» (`H`, кольцо на клетке фигуры, которой ходить), «Показать решение», «Дальше» (`Пробел` / `Enter`).
**Слева:** `SessionPanel` «Тактика»: счёт «решено / ошибок / серия»; режимы; при «По темам» — список тем с числом решённых «12 / 50».

## 4. «Метод дятла»
- В панели — список наборов (`data-ui="tactics-sets"`): «Набор 1 · 100 задач · круг 3 · лучший круг 41 мин». Кнопка «Новый набор»: размер 50 / 100 / 200 / 300, сложность «Легче» (`easier`) / «Как я» (`normal`), темы «Смесь» / «Мои слабые темы». Загрузка пачками по 50, строго по одной, прогресс «Загружаю 150 из 300»; порядок задач перемешать один раз и сохранить в `puzzle_ids`.
- Круг: все задачи набора по порядку; `puzzle_attempts` с `set_id` и `cycle`. Сверху панели: «Круг 2 · 37 / 100 · 18:42 · 94%».
- Конец круга — итог (`data-ui="tactics-cycle"`): «Круг 2: 100 задач · 94% · 48 мин (прошлый — 1 ч 12 мин)» и таблица всех кругов. Цель — каждый круг быстрее прошлого, точность не ниже 85%.

## 5. Демо `/tactics?demo=1`
Без базы и запросов. Три настоящие задачи из документации Lichess (проверены, разбор — `parsePuzzle` из `docs/night/night-ref.cjs`), порядок в демо — `0NNEG`, `0haqU`, ежедневная:
- `0haqU` (рейтинг 1167, решают чёрные): `pgn` и `solution` — в тестах `night-ref.cjs`; решение d3+ Nxc5 dxc2 Nxb7 c1=Q+;
- `0NNEG` (1102, `fork`, решают белые): pgn `d4 Nf6 Bf4 d6 e3 Nbd7 Nf3 g6 Be2 Bg7 c4 O-O Nc3 a6 h3 b6 O-O Bb7 a4 Qe8 d5 h6 Re1 Nh5 Bh2 e5 e4 Nf4 Bxf4 exf4 Nd4 Ne5 b3 Bc8 Rc1 Bd7 Rc2 Qc8 Bd3 g5 Rce2 g4 Nf5 f3`, `initialPly 43`, решение `f5e7 g8h8 e7c8` (Ne7+ Kh8 Nxc8);
- ежедневная (1957, `hangingPiece`, белые): pgn `d4 Nf6 Bg5 d5 Nf3 e6 e3 Nbd7 Bd3 Bd6 O-O O-O Nbd2 c6 Rc1 Re8 c3 e5 dxe5 Nxe5 Nxe5 Bxe5 Bb1 Bxh2+`, `initialPly 23`, решение `g1h2 f6g4 d1g4 c8g4 g5d8` (Kxh2 Ng4+ Qxg4 Bxg4 Bxd8).

У `[data-ui="panel"]` — `data-demo="tactics"`.

## 6. Проверка
`/tactics` в `STRUCTURE`, `PAGE_UI`: `'tactics-feedback|tactics-sets|tactics-empty'`. Демо-проход в `ANSWER_FLOWS` (старые не ослаблять): `/tactics?demo=1` → первая задача `0NNEG`: клики `f5`, `e7` → ждать ответ соперника (`g8h8`) → клики `e7`, `c8` → `data-result="ok"`; «Дальше» → в `0haqU` неверный ход (клики `g6`, `g5`) → `data-result="fail"` и стрелка `best`. `npx tsc --noEmit`, `npx eslint src`, `npm run test:logic`, скриншоты: задача, ошибка, итог круга.
