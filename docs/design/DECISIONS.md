# Решения по дизайну — Chess 1200

## Общее

- **Мобильные устройства**: Согласно разделу 1 DESIGN-SPEC, поддержка только компьютера (1920×950 и 1440×800). Правило CLAUDE.md обновлено.
- **Ветка**: `design/trainers`

## Шаг 1 — Токены

- Добавлены новые переменные в `globals.css` (soft-dark, soft-light, газетный): `--surface-2`, `--row`, `--hairline-2`, `--faint`, `--accent-press`, `--c-bad`, `--c-warn`, `--c-mark`, `--c-plan`, `--c-brill`.
- Газетная тема: новые переменные через fallback к нулевым радиусам и старым цветам.
- В Inter Tight добавлен weight 400 (не было нужного weight 700 — он там есть).
- Размеры текста CLAUDE.md: заменено «390px» на «1920×950 и 1440×800».

## Шаг 2 — Board

- `squareRenderer` убран полностью: все подсветки через `squareStyles`, значки и стрелки — в отдельном слое `position:absolute` поверх доски.
- `BadgeKind` добавлен `'found' | 'missed' | 'wrong'` для угроз.
- Пропс `position` переименован в `fen` согласно новому интерфейсу.
- Пропс `overlays` убран — заменён на `badges` + `arrows` + `tints`/`rings` через squareStyles.
- `dimmed` реализован через слой `rgba(38,37,34,.55)`.
- Ключ монтирования: только `${boardThemeId}-${pieceStyleId}-${orientation}` без `fen`.

## Шаг 3 — ClassIcon

- PNG-иконки chess.com заменены на собственные SVG-компоненты (круг + знак).
- `lucide-react` уже есть в зависимостях — используется для `thumbs-up` и `book-open`.

## Шаг 4 — TrainerLayout / useTrainerGeometry

- Хук `useTrainerGeometry` возвращает `{ S, showLeft, rightWidth, sidebarW }`.
- Коллапс меню: состояние в `localStorage` ключ `chess1200-sidebar-collapsed`.
- При отсутствии левой колонки счёт сессии показывается одной строкой под прогресс-баром в `TaskPanel`.

## Шаг 5–7 — Страницы

- `/mistakes`: логика проверки хода через `evalPositionMultiPV(fen, 3, 400)` — 3 лучшие линии.
- `/threats`: угрозы через `nullMoveFen` + движок вместо текущих атак.
- `/sac`: SQL-файл `supabase/27-sac-context.sql` создан; подготовка позиций через Skill 20.
- Остальные страницы (11.4): логика не тронута, только обёртка в `TrainerLayout`.
