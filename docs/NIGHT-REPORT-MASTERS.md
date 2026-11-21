# Night Report: /masters/[id] — Угадай ход

Ветка: `feat/masters`  
Коммит: `05c7dbb`

## Что сделано

### 1. `src/lib/masters.ts`
Вся логика «Угадай ход» перенесена из `masters-ref.cjs`:
- `see()` — статический обмен (SEE) для определения жертв
- `parseGame()` — разбор PGN, `fen` = до хода, `fenAfter` = после
- `prepareItems()` — соединяет ходы с анализом (top-3, pvSan, traits)
- `selectMoments()` — режимы key/sac/all, лимит KEY_MAX=12
- `scoreGuess()` — 2/1/0 очков (master/engine/miss)
- `resultArrows()` — стрелки: played, best (label «М»), plan
- `explain()`, `evalWhite()`, `sanNo()`, `plural()` и др.

### 2. `scripts/test-masters.ts`
44 теста — все OK. Добавлен в `npm run test:logic`.

### 3. `src/data/masters-demo.json`
Демо-данные: Tal–Koblents 1957, 77 ходов, полный анализ Stockfish 19 lite (глубина 16), userEvals для 9 позиций, история (2 попытки, рекорд 19).

### 4. Компоненты (TrainerLayout)

**`src/components/masters/GuessPage.tsx`** — основной оркестратор:
- 5 фаз: overview → watch → ask → result → done
- Фоновый анализ всей партии через Stockfish (getMultiPV depth 10, top-3)
- Автопрогрыш с таймером 800ms + 2000ms для комментариев
- Стрелки и бейджи на доске через `resultArrows()`
- EvalBar: `data-ui="eval-hidden"` во время ask
- Настройки: mode/side/skip из localStorage `masters-guess-settings`
- defaultSide определяет кого играть по именам библиотеки
- Запись в `guess_log` с mode/skip/moments

**`src/components/masters/GuessPanel.tsx`** — правая панель (TaskPanel):
- overview: `data-ui="master-setup"`, `data-ui="master-moves"`, `data-ui="master-start"`
- watch: `data-ui="master-watch"`, `data-ui="master-watch-actions"`, `data-ui="master-jump"`
- ask: `data-ui="master-task"`, `data-ui="master-ask-actions"`, `data-ui="master-hint"`, `data-ui="master-skip-moment"`
- result: `data-ui="master-feedback"`, `data-ui="master-pv"`, `data-ui="master-next"`
- done: `data-ui="master-result"`, `data-ui="master-log"`, `data-ui="master-again"`

**`src/components/masters/GuessSidebar.tsx`** — левая панель (SessionPanel):
- Статистика: очки / как мастер / рекорд
- `data-ui="master-mode"`, `data-ui="master-side"`, `data-ui="master-skip"`
- Список `data-ui="master-moment"` с `data-ply` и `data-result`

### 5. Страницы

**`src/app/masters/demo/page.tsx`** — загружает `masters-demo.json`, `isDemo=true`, `panelDemoAttr="masters"`.

**`src/app/masters/[id]/page.tsx`** — загружает из Supabase: `master_games` (с анализом или без — детектирует `analysisMissing`), `guess_log` (история), все имена из `master_games` (для defaultSide).

### 6. `supabase/38-masters-analysis.sql`
Добавляет:
- `master_games.analysis JSONB` — хранит анализ версии 2
- `master_games.analysis_version INT2`
- `master_games.analysis_at TIMESTAMPTZ`
- `guess_log.mode TEXT` — режим (key/sac/all)
- `guess_log.skip INT2` — пропуск дебюта
- `guess_log.moments JSONB` — детали ходов

### 7. `docs/design/check-design.mjs` v4.1
Уже был в архиве. Добавляет проверки `/masters/demo` (демо-проход всех вердиктов).

## Результаты проверок

- `npx tsc --noEmit` — ✓ без ошибок
- `npx eslint src` — ✓ без новых ошибок
- `npm run test:logic` — ✓ все тесты: OK (44)
- `node docs/design/check-design.mjs http://localhost:3001 /masters/demo` — ✓ **0 ошибок**

## Что проверить руками

1. **`/masters/demo`** — открыть, нажать «▶ Начать», дойти до первого момента (ход 29 g6), ввести ход. Проверить стрелки, счёт и переход к следующему моменту.
2. **`/masters/[id]`** — открыть реальную партию (нужен Supabase). После выполнения `supabase/38-masters-analysis.sql` проверить фоновый анализ и запись в `guess_log`.
3. **SQL** — выполнить `supabase/38-masters-analysis.sql` в Supabase SQL Editor. Файл безопасен для повторного запуска.
4. **Режим «Каждый ход»** — проверить что `selectMoments` не падает на длинных партиях.
5. **Мобильная отзывчивость** — не требуется по CLAUDE.md (только 1920×950 и 1440×800).
