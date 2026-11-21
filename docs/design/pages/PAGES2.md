# Пакет «Ловушки, Идеи позиций, Дебютный спринт»

Три страницы, которые были пустыми или бесполезными:

| Страница | Было | Стало | Спека |
|---|---|---|---|
| «Ловушки» `/traps` | пусто без разделов «## Ловушка» в курсах | 17 проверенных ловушек, подобранных к твоим дебютам; режимы «Накажи сам» и «Не попадись»; задачи Lichess из твоих дебютов | `traps/TRAPS.md` |
| «Идеи позиций» `/plans` | пусто без блоков `idea` в курсах | где кончаются твои линии: ходы мастеров, план движка, партии мастеров; «Проверь себя» | `plans/IDEAS.md` |
| «Угадай дебют» → «Дебютный спринт» `/sprint` | угадывать название дебюта по первым ходам | свои ходы из линий на время, 3 жизни, рекорды; ошибки идут в «Трудные ходы» | `sprint/SPRINT.md` |

**Сначала должен быть сделан пакет дебютов** (`docs/design/pages/openings/OPENINGS.md`). Всем трём страницам нужны `src/lib/opening-trainer.ts` (прогон линии, `applyResult`, подписи линий) и демо-линии из `src/lib/demo-openings.ts`.
Ветка `feat/pages2`.

## 1. Общее
- **Эталон логики** — `docs/design/pages/pages2-ref.cjs`: `node docs/design/pages/pages2-ref.cjs` → «все тесты: OK». Перенеси в `src/lib/traps.ts`, `src/lib/sprint.ts`, `src/lib/ideas.ts`, тесты — в `scripts/test-pages2.ts` (добавь в `test:logic`).
- **Библиотека ловушек** — `docs/design/pages/traps/traps-library.json` → `src/data/traps.ts`. Ходы проверены Stockfish, не меняй их без проверки движком.
- **Раскладка** всех трёх страниц — `TrainerLayout` (как в тренажёре дебютов): слева `SessionPanel`, в центре `Board`, справа `TaskPanel`.
- Значков на доске нет. Ходы — только SAN. Неверный ход — стрелки `played` и `best`.
- Макеты: `docs/design/mockups/traps.html` (`#avoid`), `plans.html` (`#quiz`), `sprint.html` (`#end`). Картинки `target-*.png` — в папках страниц.

## 2. Меню
- «Угадай дебют» → «Дебютный спринт», `/sprint`, иконка `sprint` (`SPRINT.md`, раздел 1).
- `/guess-opening` перенаправляет на `/sprint`.

## 3. SQL — `supabase/34-pages2.sql` (сам не запускай; выполнять после 32)
Файл уже в архиве. Создаёт `trap_progress`, `position_explorer`, `sprint_log` и добавляет колонку `puzzles.opening_key`.
Строка в `RUN-ORDER.md`: `| 34-pages2.sql | trap_progress, position_explorer, sprint_log, puzzles.opening_key — ловушки, идеи, спринт |`.
Пока таблиц нет, страницы работают, но прогресс не сохраняется. Покажи серую строку «Прогресс не сохраняется: выполни supabase/34-pages2.sql» (код ошибки `42P01` или «does not exist»).

## 4. Проверка — `docs/design/check-design.mjs` v3.9 (в архиве)
`node docs/design/check-design.mjs http://localhost:3001 /traps /plans /sprint` — 0 ошибок. Потом полный прогон без ошибок (старые проверки не ослабляй).

**Структура:**
- **`/traps`** — `trap-filter`, `trap-row`, `trap-line`, `trap-task | trap-feedback | trap-story`. Старого текста «Ловушек пока нет» быть не должно.
- **`/plans`** — `idea-modes`, `idea-row | idea-empty`, `idea-moves | idea-feedback | idea-token | idea-empty`.
- **`/sprint`** — `sprint-time`, `sprint-openings`, `sprint-start | sprint-timer | sprint-result`. На странице нет текста «Угадай дебют», и в меню тоже.

**Демо-проходы:**
- **`/traps?demo=1`:**
  - открыта «Стаффорд: «Ой, мой ферзь»», режим «Накажи сам»;
  - клики 6... Nxe4 → ответ 7. Bxd8 → 7... Bxf2+ → ответ 8. Ke2 → 8... Bg4#; ждём `trap-feedback` `ok` с текстом «Мат»;
  - клик по строке `[data-ui="trap-row"][data-trap="blackburne"]` → позиция перед 5. Nxf7, стрелок нет, в заголовке «Блэкберн»;
  - ход 5. Nxf7 → `fail`, стрелки `played` и `best`, в тексте «Nxf7», «Nf3#», «O-O», заголовок «Попался».
- **`/plans?demo=1`:**
  - позиция после 11. O-O, 3 стрелки `plan` с номерами 1 / 2 / 3;
  - тексты: «10... Be6», «11. O-O», «Qa5», «40%», «a5», «Rc8»; план с «a5», «f4», «Bd4»;
  - «Проверь себя» (`idea-quiz`) → стрелок нет, в заголовке «как мастер»;
  - 11... h6 → `idea-feedback` `fail`, две стрелки, «h6», «Qa5», «40%»;
  - 11... Qa5 → `ok`, «40%».
- **`/sprint?demo=1`:**
  - `sprint-start` → позиция после 4. Nxd4;
  - 4... g6 → позиция после 3. Bb5, «1 очко», «3 из 3»;
  - 3... e6 → стрелки `played` и `best`, «2 из 3», в журнале «3... g6».

**Скриншоты** (1920×950 и 1440×800):
- «Ловушки»: «Накажи», «Попался», «Смотреть», итог сессии;
- «Идеи»: «Изучать», «Проверь себя» (ошибка и верно), «▶ Партия», режим без токена (`idea-token`);
- «Спринт»: старт, забег, ошибка, итог;
- «Тактика» в режиме «Мои дебюты».

Ещё: `npx tsc --noEmit`, `npx eslint src`, `npm run test:logic`.

## 5. Порядок работы
1. Меню и перенаправление `/guess-opening` (раздел 2).
2. `src/lib/traps.ts`, `sprint.ts`, `ideas.ts` и тесты.
3. «Дебютный спринт»: демо → база.
4. «Ловушки»: демо → база → режим «Мои дебюты» в «Тактике» (`TRAPS.md`, раздел 6; `src/data/eco.json`).
5. «Идеи позиций»: демо → маршруты explorer `db=masters` и `masters-pgn` → кеш → режим без токена.
6. Проверка (раздел 4), отчёт `docs/NIGHT-REPORT-PAGES2.md`: что сделано, что не вышло, скриншоты, что проверить руками.

## 6. Правила
- SQL сам не запускай: только файлы в `supabase/` и строка в `RUN-ORDER.md`.
- Не открывай `.env` и `.env.local`. `LICHESS_TOKEN` — только на сервере.
- Lichess: запросы строго по одному, на `429` ждать минуту.
- Без `git push --force`.
- Старые таблицы и данные не трогаем: `trap_hits`, `trap_eval`, `idea_progress`, `opening_guess_log` остаются.
