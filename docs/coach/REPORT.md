# Тренер Таль — отчёт

Ветка: `feat/coach`. В main **не слито**, по требованию ТЗ §0.4.

## Что сделано

- `supabase/41-coach.sql` — таблицы `coach_plans`, `coach_item_marks`, `coach_settings` + расширение `tal_chat` (`kind`, `plan_id`).
- `src/lib/coach/plan.ts` — типы `PlanItem`, `Plan`, `PatchOp`, `validatePlan`, `validatePatch`, `applyPatch`, `buildFallbackPlan`.
- `src/lib/coach/context.ts` — `loadCoachContext(date)`: рейтинг, причины поражений (через `generateInsights`), вчерашняя партия, прогресс сегодня (puzzle_attempts, threat_log, opening_practice_log, endgame_log, sac_log, mistake_cards, game_analysis для `play`), ручные отметки, серия, дисциплина за 30 дней, неделя пн-вс.
- `src/lib/coach/prompt.ts` — промпты для OpenRouter (строгий JSON, `response_format: json_object`, Claude 3.5 Sonnet), `buildPlanPrompt`, `buildTalkPrompt`, `callOpenRouter`.
- `src/app/api/coach/plan/route.ts` — GET/POST плана; POST создаёт при первом открытии (AI + 2 попытки → fallback), пишет morning-сообщение в `tal_chat` и `coach_plan_minutes` в `tal_daily_log`.
- `src/app/api/tal/route.ts` — ответ Таля в JSON (reply + опциональный `plan_patch`), применяет патч → новая версия плана, пишет `plan_update` в чат.
- Компоненты в `src/components/coach/`: `ChatHeader`, `Message`, `Composer`, `PlanCard`, `TodayCard`, `FormCard`, `LeaksCard`, `ChangesCard`, `WeekCard`.
- `src/app/tal/page.tsx` переписан: два столбца; история `tal_chat` за 48 ч; оптимистичная отправка; refresh при `visibilitychange`; ручные отметки через `coach_item_marks`; занятие № = distinct дат в `coach_plans` до сегодня включительно.
- `src/app/globals.css` — блок `.coach-*` на CSS-переменных; новый токен `--text-2`.

Коммиты в `feat/coach`:
```
3c5c45d chore(coach): lint fixes
9217c8f feat(coach): chat history + Composer + /api/tal with plan_patch
c6e60d1 feat(coach): POST/GET /api/coach/plan + OpenRouter JSON prompt
*** 4 коммита на вёрстку/типы/sql ***
```

## Как запустить (ты запускаешь сам)

### 1. SQL — порядок

В Supabase SQL Editor, безопасно для повторного запуска:

1. `supabase/40-tal-trainer.sql` — если ещё не выполнен (создаёт `tal_chat`, `tal_daily_log`).
2. `supabase/41-coach.sql` — **новый, обязательно для /tal**.

### 2. Переменные окружения

В `.env.local` (локально) и в Vercel → Settings → Environment Variables:

| Переменная | Нужна? | Что делает |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | обязательно (уже есть) | доступ к базе |
| `OPENROUTER_API_KEY` | опционально | без неё план строится fallback-ом (ТЗ §5.4); в чат пишется «Таль молчит — проверь OPENROUTER_API_KEY» |

В Supabase: `coach_settings` уже содержит дефолтную строку (`id=1`). Руками можно заполнить (ТЗ §6):
- `daily_minutes` (по умолчанию 120),
- `goal_rating`, `big_goal_rating`,
- `book_title`, `book_page`,
- `videos` (JSONB array `[{"title": "...", "url": "..."}]`).

### 3. Что проверить руками (ТЗ §9)

1. `npm run dev` → `/tal`. План создаётся при первом открытии за день. Виден утренний plan + сайдбар.
2. Ручная отметка книги/видео: клик «Отметить» → перезагрузка → отметка на месте.
3. Если `OPENROUTER_API_KEY` задан: написать «Разбери вчерашнюю партию» — Таль ответит, партия вчерашняя из `games`+`game_insights` подтянется.
4. Написать «вечером гости — остался час» — Таль пришлёт `plan_patch`, появится строка «Обновлён в …» в заголовке плана и «план изменён» в чате.
5. `npx tsc --noEmit` — 0 ошибок.
6. `npx eslint src` — 0 ошибок.

## Что не делалось (по ТЗ)

- Форма для `coach_settings` — ТЗ §6 явно говорит «не делай, я заполню руками».
- Промпт модели не включает чудо-магию Таля с цитатами 1959 года — только короткий persona из ТЗ §5 без фиксированного плана.
- **Ветка НЕ смержена в main, НЕ запушена** — жду твоей проверки.

## Стали/остались в силе

- `tal_chat` и `tal_daily_log` — данные сохранились, таблицы расширены, не переделаны.
- Старый `/api/tal` переписан (JSON вместо текста). Старые сообщения в `tal_chat` остаются — просто рендерятся как `kind='text'` (дефолт колонки).
- Старая страница `/tal` полностью заменена. Доступ из сайдбара тот же.
