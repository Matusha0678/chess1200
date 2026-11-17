# Design Log — ветка design-pass

## Коммиты

### `948c518` — design(pass-1)
- Сайдбар: иконки для 14 пунктов навигации (`NavIcon.tsx`)
- Сайдбар: collapsible группы с шевроном, localStorage состояние
- Мобильный bottom bar: 4 фиксированных пункта + «Ещё»
- `/openings` — полная перепись: `page-title`, `ui-btn`, `ui-search`, `ui-chip`
- `/courses` — полная перепись: `DiffBadge` вместо кружков, `ui-tabs`, `progress-track`
- CSS: soft-theme overrides для `.stat-label`, `.ui-eyebrow`, `.page-title`, `.app-sidebar-link-active`

### `151e4d5` — design(pass-2)
- `/games` — h1 inline → `page-title`, SECTION_HEAD → `borderBottom`, sync кнопки → `ui-btn`
- `/traps` — `div.page`, loading skeletons с `animate-pulse`, filters → `ui-search`+`ui-chip`
- `/threats` — `div.page`, done state → `stat-grid`/`stat-card`
- `/mistakes` — `div.page`, loading → `ui-card animate-pulse`
- `/evaluate` — `div.page`, mode selector → `ui-segmented`

### `0c43f90` — design(pass-3)
- `/play` — `div.page`, handicap-selector → `ui-btn`, header → `page-head`/`page-title`
- `/games/analyze` — `div.page`, 48px h1 → `page-title`, progress → `progress-track`
- `/games/courses` — `div.page`, 36px h1 → `page-title`, cards → `ui-card`
- `/games/[id]` — `div.page`, 40px h1 → `page-title`, sections → без uppercase
- `/courses/[courseId]` — `div.page`, 56px h1 → `page-title`, lessons → `ui-card`+`ui-btn`
- `/courses/[courseId]/[lessonId]` — `div.page`, loading/error states
- `/courses/notes` — `div.page`, filters → `ui-input`, cards → `ui-card`
- `/openings/[id]` — `<main>` → `<div className="page">`
- `/openings/[id]/exam` — `div.page`, setup → `ui-segmented`, done → `stat-grid`
- CSS: soft-theme override для `.ui-h1` (масштабируется до 32px)

### `d464770` — design(pass-4)
- Удалены ВСЕ оставшиеся `<main>` теги (16 файлов)
- `/sac`, `/guess-opening`, `/masters` — `page-wrap` class сохранён, тег изменён на `<div>`
- `/games` — loading skeleton → `div.page animate-pulse`
- `/courses/[courseId]/cheatsheet` — `div.page`, header → `page-head`, title → `page-title`
- `/courses/path` — `div.page`, header → `page-head`/`page-title`, form → `ui-card`+`ui-input`
- `/courses/path/[pathId]` — `div.page`, header → `page-head`/`page-title`, buttons → `ui-btn`
- `/courses/import` — `div.page`, header → `page-head`/`page-title`, удалён `HEADING`
- `/courses/[courseId]/[lessonId]/practice` — `<main>` → `<div>`
- Все opening sub-pages (study, edit, practice, stats, new, random) — `<main>` → `<div>`
- `masters/[id]` — `<main>` → `<div>`

## Осталось для следующего прохода

### Tailwind hardcoded hex цвета (не адаптированы к soft-теме)
- `openings/[id]/*` — ActionCard, линии, masteryDots используют `#0D0D0D`, `#262626` etc.
- `openings/random` — board practice
- Эти страницы работают в тёмной теме, но не адаптируются к `soft-light`

### Board layout
- Нет единого `board-layout` хука с размером доски
- Каждая страница с доской задаёт размер независимо (420px, 480px, etc.)

### Качество (Step 5)
- Анимации transitions проверить против `prefers-reduced-motion`
- Контраст ≥ 4.5:1 для мелкого текста не проверен формально
- Touch targets ≥ 40px — частично (ui-btn высота 40px)
- Light theme (`soft-light`) не проверен визуально
