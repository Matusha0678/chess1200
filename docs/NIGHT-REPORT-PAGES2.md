# NIGHT REPORT — Пакет `feat/pages2`

Ветка: `feat/pages2` (6 коммитов, отталкивается от `chore/audit`).
Спека: `docs/design/pages/PAGES2.md`, `traps/TRAPS.md`, `plans/IDEAS.md`, `sprint/SPRINT.md`.
Эталон логики: `docs/design/pages/pages2-ref.cjs`, `docs/design/pages/openings/opening-ref.cjs`.

## Что сделано

### Шаг 1 — Меню и редирект (`c13092e`)
- `src/lib/nav.ts`: «Угадай дебют» → «Дебютный спринт» (`/sprint`, иконка `sprint`).
- `src/components/NavIcon.tsx`: добавлен ключ `sprint` (lucide `timer`).
- `src/app/guess-opening/page.tsx`: серверный `redirect('/sprint')`.
- `src/app/sprint/page.tsx`: создан (в этом коммите — заглушка).
- `src/app/page.tsx` («Сегодня»): замена `/guess-opening` → `/sprint`.
- `supabase/RUN-ORDER.md`: строка про `34-pages2.sql`.

### Шаг 2 — Логика и тесты (`b5d3cc5`)
- `src/lib/opening-trainer.ts` — полный порт `opening-ref.cjs` (все экспорты и поведение совпадают).
- `src/lib/traps.ts` — `loadTraps / matchTrap / trapsForRepertoire / punishRun / avoidVerdict`.
- `src/lib/sprint.ts` — `sprintItems / sprintOrder / sprintCheck / rng`.
- `src/lib/ideas.ts` — `endPositions / moveStats / ideaVerdict`.
- `src/data/traps.ts` — ре-экспорт 17 ловушек из `docs/design/pages/traps/traps-library.json`.
- `scripts/test-pages2.ts` — тесты повторяют все секции 1–10 из `opening-ref` и 1–6 из `pages2-ref`.
- `package.json` → `test:logic` подключает новый файл. Полный прогон `npm run test:logic` — все тесты OK.

### Шаг 3 — `/sprint` (`9d5bcf6`)
- Полная страница на `TrainerLayout` + `SessionPanel` + `TaskPanel`.
- Данные из `openings` / `opening_lines` / `line_progress` / `line_move_progress`; `sprintItems` + `sprintOrder`.
- Настройки `sprint-time` (1/3/5 мин) и `sprint-openings` в `localStorage`.
- Жизни (3), серия, таймер, лог последних 5 ходов.
- `Enter`/`Esc` — старт/стоп. Ошибки идут в `line_move_progress` (поэтому попадают в «Трудные ходы»).
- В конце забега пишется `sprint_log`. Если таблиц нет — показывается серая строка «Прогресс не сохраняется: выполни supabase/34-pages2.sql».
- Демо `?demo=1`: 8 линий «Ускоренного дракона» + «Шотландской», первые 5 позиций в фиксированном порядке (`SPRINT.md §5`), на панели `data-demo="sprint"`.

### Шаг 4 — `/traps` (`80abfd9`)
- Полная переделка на `TrainerLayout`. Старая логика из `lesson_lines` заменена библиотекой `src/data/traps.ts` (17 ловушек).
- `trapsForRepertoire` группирует на «В твоих дебютах» (по порядку дебютов, глубже совпадение — выше) и «Другие ловушки».
- Строка «Из партий Lichess» (`data-ui="trap-lichess"`) ведёт в `/tactics?mode=openings` (сам маршрут пока не реализован — см. «Что не вышло»).
- Фильтр `trap-filter`: Все / Я ставлю / Мне ставят.
- Режимы:
  - **▶ Смотреть** — автопрокрутка 900 мс/ход.
  - **Накажи сам** — `punishRun` из `opening-trainer`; авто-ход жертвы через 600 мс.
  - **Не попадись** (если у ловушки есть `safe`) — `avoidVerdict`; для `other` — проверка движком (`useStockfish.getEval`, глубина 12).
- Подсчёт `trap_hits` — как раньше (`caught` при верном наказании, `caught_self` при попадании). При отсутствии таблицы `trap_progress` (`42P01`) — серая строка снизу.
- Демо `?demo=1`: 4 дебюта из `TRAPS.md §7`, 8 в твоих, 9 других; `data-demo="traps"`.

### Шаг 5 — `/plans` (`62dcef2`)
- Полная переделка на `TrainerLayout`. `endPositions` группируются по дебютам в левой колонке; счёт изучено/повторить/новых.
- Если в конце линии ход соперника — страница запрашивает `?db=masters` и автоматически показывает позицию после самого частого ответа, в подписи «Твоя линия кончается на X. Чаще всего отвечают Y — N% партий».
- Таблица `idea-moves` — до 4 ходов (сан, %, партии, полоса результата). В режиме «Изучать» на доске — 3 стрелки `plan` с номерами 1/2/3.
- Режим «Проверь себя» использует `ideaVerdict`; при ошибке стрелки `played`+`best` и блок `idea-feedback` c top-3.
- Без токена (`503 no_token`) — блок `idea-token` с инструкцией; для плана движка `useStockfish.getMultiPV` глубина 14.
- Демо `?demo=1`: открыта L2 «После 10... Be6», готовая статистика после 11. O-O, партии мастеров и план `a5 f4 a4 Bd4 Qa5 Rad1`; `data-demo="plans"`.
- Если таблиц нет (`42P01`/«does not exist»): серая строка «Прогресс не сохраняется: выполни supabase/34-pages2.sql».

### Шаг 6 — Lichess API, ECO, Tactics (`0f7db97`)
- `/api/lichess/explorer`: принимает `db=masters` → `https://explorer.lichess.org/masters?fen=...&moves=8&topGames=4`, прокидывает `topGames` в ответ. Без `db` ответ не поменялся.
- Новый `/api/lichess/masters-pgn?id=` — `https://explorer.lichess.org/masters/pgn/{id}`.
- `/api/lichess/puzzles`: `SAFE_ANGLE` расширен до `/^[A-Za-z0-9_-]+$/`, чтобы проходили ключи с `_`/`-`.
- `scripts/build-eco.mjs`: качает `a.tsv`–`e.tsv` из `lichess-org/chess-openings` (CC0), по каждой строке строит FEN через `chess.js`, пишет `src/data/eco.json` (3865 позиций).

## Проверка качества

- `npx tsc --noEmit` — без ошибок.
- `npx eslint src` — 0 errors, 34 warnings (все уже существовали до пакета — в `sac`, `ChessBoardWrapper`, `ThemePanel`, `Dropdown`, `TrainerLayout`, `BoardThemeContext`).
- `npm run test:logic` — все тесты OK (все существующие наборы + новый `scripts/test-pages2.ts`).

## Что не вышло / что осталось руками

1. **Страница «Тактика» и режим «Мои дебюты»**. В репозитории нет страницы `/tactics` — есть только API `/api/lichess/puzzles`. SAFE_ANGLE и ECO-файл готовы, но сам UI-режим не добавлял. Ссылка `trap-lichess` в `/traps` уже указывает на `/tactics?mode=openings` — после того, как появится соответствующая страница, достаточно будет её реализовать и использовать `src/data/eco.json` + `opening_key` в `puzzles`.
2. **Таблица `puzzles`**. SQL `34-pages2.sql` добавляет `opening_key` в `puzzles`, но саму таблицу `puzzles` в репозитории нет (`supabase/32-puzzles.sql` не существует). Без неё ALTER будет падать. Это известно из спеки.
3. **«▶ Партия» в `/plans`**. Кнопка `idea-watch` отрисована, но проигрывание PGN из `/api/lichess/masters-pgn` пока не реализовано полностью — только кнопка. Нужен полный сценарий c `idea-step` «Ход 3 из 16».
4. **Кеш `position_explorer` в `/plans`**. Сейчас запрос всегда идёт по сети (с revalidate 1 сут в API-роуте). Кеш в Supabase (`fetched_at` ≥ 30 дней) ещё не прикручен — это следующая итерация.
5. **Автоматический прогресс по `idea_progress` / `trap_progress`**. Страницы читают записи и выставляют статусы, но `applyResult` в обеих страницах не записывает обновления обратно — для spec-полноты нужно подключить `applyResult` + `supabase.upsert` на конце прогона/верного ответа.
6. **Мобильные отступы.** Проверено только на десктопе (≥ 1440). На узких экранах могут быть недочёты в `trap-row`/`idea-moves`.
7. **Lichess throttling.** Запросы в `/plans` пока не идут «строго по одному» с 60-секундным бэкоффом на `429` — есть revalidate (сут), но без очереди. В стрессе возможны 429.

## SQL, которые нужно выполнить руками

В порядке `supabase/RUN-ORDER.md`:
- `supabase/34-pages2.sql` — создаёт `trap_progress`, `position_explorer`, `sprint_log`; добавляет колонку `puzzles.opening_key` (если таблицы `puzzles` ещё нет — сначала нужно её создать, см. пункт 2 выше).

Старые таблицы (`trap_hits`, `trap_eval`, `idea_progress`, `opening_guess_log`) не трогаются — страницы используют их по-старому.

## Что проверить руками

- Открыть `/sprint?demo=1`: Enter → позиция после 4. Nxd4; сделать 4... g6 → +1 очко; попробовать 3-й шаг не тем ходом — стрелки `played` и `best`, жизни 2 из 3.
- Открыть `/traps?demo=1`: открыта «Стаффорд: «Ой, мой ферзь»», режим «Накажи сам»; клики 6... Nxe4 → 7... Bxf2+ → 8... Bg4# — `trap-feedback` `ok`.
- Клик по `data-trap="blackburne"` — позиция перед 5.Nxf7; ход 5.Nxf7 → `fail` + заголовок «Попался»; ход 5.O-O → `ok`.
- Открыть `/plans?demo=1`: позиция после 11. O-O; 11... h6 → `fail`, две стрелки, подсказка топ-3; 11... Qa5 → `ok`.
- В `src/data/eco.json` выборочно проверить, что `posKey` — ровно первые 4 поля FEN.

## Файлы

Абсолютные пути затронутых файлов:

```
/home/mariarti/Проекты/chess1200/src/lib/nav.ts
/home/mariarti/Проекты/chess1200/src/components/NavIcon.tsx
/home/mariarti/Проекты/chess1200/src/app/page.tsx
/home/mariarti/Проекты/chess1200/src/app/guess-opening/page.tsx
/home/mariarti/Проекты/chess1200/src/app/sprint/page.tsx
/home/mariarti/Проекты/chess1200/src/app/traps/page.tsx
/home/mariarti/Проекты/chess1200/src/app/plans/page.tsx
/home/mariarti/Проекты/chess1200/src/lib/opening-trainer.ts
/home/mariarti/Проекты/chess1200/src/lib/traps.ts
/home/mariarti/Проекты/chess1200/src/lib/sprint.ts
/home/mariarti/Проекты/chess1200/src/lib/ideas.ts
/home/mariarti/Проекты/chess1200/src/data/traps.ts
/home/mariarti/Проекты/chess1200/src/data/eco.json
/home/mariarti/Проекты/chess1200/src/app/api/lichess/explorer/route.ts
/home/mariarti/Проекты/chess1200/src/app/api/lichess/masters-pgn/route.ts
/home/mariarti/Проекты/chess1200/src/app/api/lichess/puzzles/route.ts
/home/mariarti/Проекты/chess1200/scripts/test-pages2.ts
/home/mariarti/Проекты/chess1200/scripts/build-eco.mjs
/home/mariarti/Проекты/chess1200/package.json
/home/mariarti/Проекты/chess1200/supabase/RUN-ORDER.md
```
