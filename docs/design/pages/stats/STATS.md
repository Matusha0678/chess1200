# «Где я теряю очки» — `/stats`

Страница показывает, где пользователь теряет очки в своих партиях, даёт примеры на доске и кнопку в нужный тренажёр. Макета нет — дизайн из готовых частей (см. `docs/NIGHT.md`, раздел 0), раскладка как у `/repertoire`. Ветка `feat/stats`. Пункт меню «Где я теряю очки» в группе «Партии» после «Дебюты в партиях».

## 1. Данные — `supabase/31-game-insights.sql`
```sql
-- safe to re-run, run after 30-game-openings.sql
CREATE TABLE IF NOT EXISTS game_insights (
  game_id              uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  my_color             text NOT NULL CHECK (my_color IN ('w','b')),
  result               text NOT NULL,
  decisive_move_number integer,
  decisive_san         text,
  decisive_phase       text,
  decisive_loss        numeric,
  decisive_cls         text,
  decisive_fen         text,      -- позиция до переломного хода
  decisive_best        text,      -- лучший ход (UCI) из game_analysis.best_move
  clock_left           numeric,   -- сек на часах после переломного хода
  time_trouble         boolean NOT NULL DEFAULT false,
  missed_win           boolean NOT NULL DEFAULT false,
  max_my_win           numeric,
  errors_opening       integer NOT NULL DEFAULT 0,
  errors_middlegame    integer NOT NULL DEFAULT 0,
  errors_endgame       integer NOT NULL DEFAULT 0,
  avg_time_opening     numeric,
  avg_time_middlegame  numeric,
  avg_time_endgame     numeric,
  convert_fen          text,      -- для «Дожми свою партию»
  convert_move_number  integer,
  convert_eval         integer,   -- cp за белых
  convert_my_win       numeric,
  version              integer NOT NULL DEFAULT 1,
  computed_at          timestamptz DEFAULT now()
);
ALTER TABLE game_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON game_insights;
CREATE POLICY "allow all" ON game_insights FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS game_insights_result_idx ON game_insights (result);
```

**Подсчёт** (общая функция `ensureInsights()` в `src/lib/insights-store.ts` — её же вызывает `/convert`): партии с `analysis_version ≥ 2` без строки или с `version < 1` → строки `game_analysis` (запросы `.in('game_id', 50 id)`, постранично `.range()` по 1000 строк) → `gameInsight` и `findConvertPosition` из задачи 4 → `upsert` пачками по 100. Слева — «Считаю партии: 40 из 120». Ошибки базы — как везде («Ошибка базы: …»).

## 2. Куда ушли очки
Проигрыш — 1 очко, ничья при `missed_win` — 0,5. Каждая такая партия попадает в одну группу (по порядку):
1. `time_trouble` → «Цейтнот»;
2. `decisive_phase = 'opening'` и в `game_openings` статус `deviation` → «Отход от своих линий»;
3. `decisive_phase` → «Ошибки в дебюте» / «Ошибки в миттельшпиле» / «Ошибки в эндшпиле»;
4. нет переломного хода → в группы не входит.

Отдельно (не вместо): «Не дожал» — партии с `missed_win` (очки так же). Группы сортируются по потерянным очкам. У каждой — кнопка «Тренировать»:
- ошибки в дебюте / миттельшпиле → `/mistakes?phase=opening|middlegame` (если фильтра по стадии в «Ошибках» нет — добавь параметр `phase`);
- ошибки в эндшпиле → `/endgames`;
- отход от линий → `/repertoire`;
- не дожал → `/convert`;
- цейтнот → раздел «Время» на этой же странице.

## 3. Раскладка (`TrainerLayout`)
**Слева** (`SessionPanel`, заголовок «Мои очки», справа «{N} партий»):
- счёт из 3 ячеек: «очков» (% очков, зелёный), «поражений» (красный), «не дожал» (оранжевый);
- фильтры: период «30 дней / 90 дней / Всё», цвет «Белыми / Чёрными / Все», контроль «Рапид / Блиц / Все» (`games.time_class`) — в `localStorage` (`stats-filters`);
- разделы (`data-ui="session-list"`): «Где теряю очки», «Стадии партии», «Время», «Дебюты», «Рейтинг»;
- внизу: «Посчитано {N} партий» и «Пересчитать».

**Доска:** пример выбранной строки — `decisive_fen` (позиция **до** переломного хода), снизу мой цвет; красная стрелка — сыгранный ход (`played`), зелёная пунктирная — лучший (`best`, `decisive_best`); значков нет. Над доской справа: «{соперник} · {дата} · {N}-й ход».

**Справа:**
- шапка: «Партии · Где я теряю очки», заголовок — название раздела, чипы фильтров;
- **«Где теряю очки»**: строка «Главное» (`data-ui="stats-insight"`, оформление как на `/repertoire`): «Больше всего очков уходит на {группа}: −{X} из {всего} ({доля}%)»; строки групп (`data-ui="stats-row"`): иконка, название 15/600, под ним 13px «−{X} очков · {N} партий», полоска доли, справа кнопка «Тренировать» (`data-ui="stats-train"`). Выбранная строка — примеры на доске: «‹ Пример 2 из 9 ›» (`data-ui="stats-examples"`) и «Открыть партию»;
- **«Стадии партии»**: дебют / миттельшпиль / эндшпиль — ошибок за партию и среднее время на ход;
- **«Время»**: среднее время на ход по стадиям, «в цейтноте проиграно {N} партий», сколько было на часах в момент переломного хода (больше 3 мин / 1–3 мин / меньше 1 мин). Подсказка, если в дебюте больше 20 сек на ход: «В дебюте ты думаешь {X} сек на ход — свои линии играй быстрее»;
- **«Дебюты»**: таблица — дебют, партий, очки %, «по линии» % (из `game_openings`); от 3 партий; худший — красным;
- **«Рейтинг»** (`data-ui="stats-rating"`): график `games.rating_me` по датам (recharts, уже установлен), линия цели 2000 пунктиром, справа сейчас и изменение за 30 дней.

## 4. Демо `/stats?demo=1`
`DEMO_STATS` в `src/lib/demo-positions.ts`: 12 партий с готовыми инсайтами (разные группы, 2 «не дожал», 1 цейтнот), 3 дебюта и 20 точек рейтинга. Позиции — настоящие (проверь chess.js), лучший ход — легальный. В базу не пишет, у `[data-ui="panel"]` — `data-demo="stats"`.

## 5. Проверка
`/stats` в `STRUCTURE` и `PAGE_UI` (`'stats-row|stats-empty'`, `'stats-insight|stats-empty'`); `node docs/design/check-design.mjs http://localhost:3001 /stats` — 0 ошибок; скриншоты всех разделов в демо; `npx tsc --noEmit`, `npx eslint src`, `npm run test:logic`.
