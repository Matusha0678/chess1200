# Отчёт по разделу 13 (Порядок работы)

Дата: 2026-11-18  
Ветка: `design/trainers`

## Шаги 1–3: Подготовка

- Прочитан `DESIGN-SPEC.md` целиком.
- Создан `docs/design/DECISIONS.md`.
- В `CLAUDE.md` правило 9 обновлено: мобильная проверка заменена на `1920×950` и `1440×800`.

## Шаг 4: CSS-токены

Добавлены в `globals.css` для всех трёх семей тем:
`--surface-2`, `--row`, `--hairline-2`, `--faint`, `--accent-press`,
`--c-bad`, `--c-warn`, `--c-mark`, `--c-plan`, `--c-brill`

## Шаг 5: Компонент Board

`src/components/board/Board.tsx` переписан:
- Новый API: `fen`, `size` (обязательные), `tints`, `rings`, `badges`, `arrows`, `checkSquare`, `dimmed`, `interactive`, `onMove`.
- Убран `squareRenderer` (причина мелких фигур); все подсветки через `squareStyles`.
- Оверлей-слой для SVG-стрелок и бейджей (`ClassIcon`).
- Выбор фигуры хранится в `selState: {fen, sq, targets}` — сброс при смене FEN без `useEffect`.
- `reducedMotion` через lazy initializer.
- Экспортирован тип `BoardArrow`.

## Шаг 5: Хук useTrainerGeometry

`src/hooks/useTrainerGeometry.ts`:
- S: кратное 8, `≤900`, вычисляется из высоты карточки.
- `showLeft`: true если хватает места для левой колонки 280px.
- `rightWidth`: зажато в `[420, 600]`.
- Слушает `resize` и `chess1200-sidebar-toggle`.
- 1920×950 → S=768, 1440×800 → S=624 ✓

## Шаг 5: TrainerLayout

`src/components/trainer/TrainerLayout.tsx` переписан под новый API:
`session?`, `topBar`, `board`, `evalBar?`, `bottomBar`, `panel`.  
Левая колонка 280px скрывается если `showLeft=false`.

## Шаг 5: Dropdown

`src/components/ui/Dropdown.tsx` — кастомный дропдаун вместо `<select>`:
высота 38px, клавиатура (↑↓ Enter Esc), фокус-ринг `--accent`.

## Шаг 5: ClassIcon

`src/components/ClassIcon.tsx` переписан как чистый SVG:
brilliant, great, inaccuracy, mistake, blunder, best, miss + found/missed/wrong.
Иконки lucide (ThumbsUp, BookOpen) через div-обёртку.

## Шаг 6: Перевод страниц

| Страница | Статус |
|---|---|
| `/mistakes` | ✅ Board + TrainerLayout + Dropdown |
| `/threats` | ✅ Board + TrainerLayout |
| `/sac` | ✅ Board + TrainerLayout |

## Шаг 6: SQL-миграция

`supabase/27-sac-context.sql` — контекстные поля для `sac_positions`:
`game_id`, `ply`, `san`, `eval_no_sac`, `best_no_sac`, `pv`, `defenses`.

## Шаг 7: Проверка

```
npx tsc --noEmit    → 0 ошибок
npx eslint src      → 0 ошибок
check-design.mjs    → 0 ошибок (6/6 страниц)
```

Результат check-design.mjs:
```
✓ 1920×950 /mistakes  (доска 768px)
✓ 1920×950 /threats   (доска 768px)
✓ 1920×950 /sac       (доска 768px)
✓ 1440×800 /mistakes  (доска 624px)
✓ 1440×800 /threats   (доска 624px)
✓ 1440×800 /sac       (доска 624px)
```

## Шаг 8: Коммиты (10 штук)

```
213079a style(tokens): CSS-токены тренажёров для всех тем
d31113e refactor(ClassIcon): чистый SVG + lucide
899dfd4 feat(Board): новый API, overlay layer
8520ac5 feat(hooks): useTrainerGeometry
c3d2f6b feat(TrainerLayout): 3 колонки с геометрией
144adff feat(ui/Dropdown): замена native <select>
60eafc1 feat(mistakes): миграция на Board/TrainerLayout
aa91105 feat(threats): миграция на Board/TrainerLayout
4880bc1 feat(sac): миграция + SQL-миграция
3ac82b6 docs(design): DESIGN-SPEC, DECISIONS, check-design.mjs
```

## Нереализованные пункты (scope вне трёх страниц)

- Пункт 4.3 спека: кнопка сворачивания сайдбара (AppShell) — не затронуто.
- Страницы `/endgames`, `/guess-opening`, `/traps`, `/plans`, `/evaluate`, `/warmup`, `/openings` — не мигрированы (спек 13.7 помечает их как «при наличии времени»).
- ESLint-правило `no-restricted-imports` для `react-chessboard` — не добавлено.
