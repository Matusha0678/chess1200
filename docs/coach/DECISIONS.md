# Coach — решения по ходу реализации

Каждая строка — одно решение одной фразой (ТЗ §0.5).

## Этапы работы (ТЗ §8)

1. SQL + типы + context.ts (бесплатные цифры)
2. Вёрстка page.tsx + компонентов coach/* по эталону, на реальных данных + fallback-план
3. `/api/coach/plan` (GET/POST с ИИ)
4. `/api/tal` переписать с `plan_patch`
5. Прогресс из логов + ручные отметки + серия/неделя
6. Проверка (ТЗ §9)

## Решения

- Convert-прогресс: нет ручной метки найдено в `/convert` — считаю `convert` ручным заданием (`coach_item_marks`).
- Герб МТ: inline-SVG не нужен, используем CSS-рамку с текстом «МТ» через font-serif.
- Клиент/сервер: страница `/tal` — client-component (чат, живой прогресс). API-роуты — server, пишут в Supabase через `supabase-server.ts` (service-role key если нужен; иначе anon с RLS allow-all как в соседних таблицах).
- Форма (рейтинг) — из `games.rating_me` последней записи с `time_class='rapid'`; линия за 14 дней — список точек `(date, rating)`.
- Serial/дисциплина/неделя: считаем из `tal_daily_log` по ключам `coach_minutes` (сделано) и `coach_plan_minutes` (план); старые ключи (`rapid`, `analysis`, …) не трогаем.
- «Где я теряю очки» — берём `generateInsights()` из `insights-analyzer.ts`, маппим типы на ключи заданий (`tactics/threats/mistakes/convert/openings/endgames`).
- AI JSON — просим `response_format: { type: 'json_object' }` в OpenRouter; если модель не поддерживает — парсим `JSON.parse` с `try/catch` и валидируем zod-подобной схемой руками (без доп. пакета).
- Date — дата «сегодня» определяется клиентом (`localDateStr`), передаётся в API как `?date=YYYY-MM-DD`.
