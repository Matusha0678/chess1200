# Design Audit — chess1200

Ветка: `design-pass`

## Проблемы найдены

### Газетный стиль в «Мягкой» теме (исправлено)

| Проблема | Страницы | Статус |
|---|---|---|
| `<main>` с inline `maxWidth`/`padding` вместо `div.page` | Все страницы (16+) | ✅ Исправлено |
| 48–72px заголовки h1 через inline `fontSize` | games, analyze, courses/[id], openings/exam | ✅ Исправлено |
| `SECTION_LABEL` константа с `textTransform: uppercase` / `letterSpacing` | games/analyze, games/[id], courses/[courseId] | ✅ Исправлено |
| `HEADING` константы (font-family inline) | courses/import, path, path/[pathId] | ✅ Исправлено |
| `borderTop: '2px solid var(--ivory)'` делители | games, games/[id], threats | ✅ Исправлено |
| `DifficultyDots` кружки как индикаторы | courses/page.tsx | ✅ Заменено на `DiffBadge` |
| Прогресс-бар: custom inline → `progress-track`/`progress-fill` | games, courses, openings/exam | ✅ Исправлено |
| Кнопки без `border-radius` / без `ui-btn` классов | play, analyze, games/[id], courses | ✅ Исправлено |
| Uppercase eyebrow текст без soft-override | ui-eyebrow класс | ✅ CSS override добавлен |
| `ui-h1` (40px) без soft-override | sac, guess-opening, masters | ✅ CSS override добавлен (масштабируется до 32px) |

### Страницы с Tailwind hardcoded hex цветами (частично)

Следующие страницы используют Tailwind с hardcoded hex (`#0D0D0D`, `#262626`, etc.):
- `openings/[id]/page.tsx` — ActionCard, линии, MasteryDots
- `openings/[id]/practice/page.tsx`
- `openings/[id]/study/page.tsx`
- `openings/[id]/edit/page.tsx`
- `openings/[id]/stats/page.tsx`
- `openings/random/page.tsx`

Эти страницы адаптированы под тёмную тему и визуально совместимы с `dark`/`midnight`, но не реагируют на CSS-переменные soft-темы. `<main>` заменены на `<div>` для структурного единообразия.

## Классы используемые в дизайне

### Контейнеры
- `.page` — основной контейнер страницы (max-width 1200, padding, flex column)
- `.page-wrap` — альтернативный контейнер для страниц с другим layout (max-width 1600)
- `.page-head` — заголовок страницы (flex row, space-between)
- `.page-head-text` — левая часть заголовка
- `.page-title` — h1 (38px, 32px в soft)
- `.page-lead` — подзаголовок/описание
- `.page-back` — хлебные крошки / кнопка назад
- `.page-crumbs` — breadcrumb текст

### Карточки
- `.ui-card` — карточка (border, bg, padding, border-radius)
- `.list-card` / `.list-card-board` / `.list-card-body` — карточки с доской

### Кнопки
- `.ui-btn` `.ui-btn-primary` / `.ui-btn-outline` / `.ui-btn-sm` — кнопки
- `.ui-chip` / `.ui-chip-active` — фильтр-чипы
- `.ui-segmented` / `.ui-segment` / `.ui-segment-active` — сегментированный контрол

### Прогресс
- `.progress-track` / `.progress-fill` — прогресс-бары (soft: скруглённые, accent цвет)
- `.stat-grid` / `.stat-card` / `.stat-value` / `.stat-label` — статистика

### Пустые состояния
- `.empty-state` / `.empty-state-icon` / `.empty-state-title` / `.empty-state-text`

### Формы
- `.ui-input` / `.ui-search-wrap` / `.ui-search` — поля ввода

### Скелетоны
- `animate-pulse` — анимация загрузки

### Дополнительно
- `.diff-pill .diff-easy/.diff-mid/.diff-hard` — бейджи сложности
- `.chip-row` — ряд фильтр-чипов
- `.card-grid` — сетка карточек
