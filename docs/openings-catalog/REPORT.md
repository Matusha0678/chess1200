# /openings catalog — отчёт

Ветка `feat/openings-catalog`, 3 коммита, **в main не слито и не запушено**.

## Что сделано

- Переписан `src/app/openings/page.tsx` (ТЗ §1–6):
  - Убрана левая панель. «Повторить всё», «Дебют Рандом», подсказка про Stockfish и 4 счётчика → в hero-блок `op-hero` под заголовком.
  - Шапка: eyebrow «Учиться» → h1 «Дебюты» (Playfair 46px) → meta «Твой репертуар: N дебютов · M линий · освоено K» → поиск 300×40 (с `/` kbd) + контурная «+ Добавить дебют» справа.
  - Hero «На повтор сегодня»: крупное число (76px, курсив, золото) + «N линий ждут повторения» (serif), причина/тайминг, золотая «Повторить всё · N →» + контурная «Дебют Рандом», подсказка; справа доска топ-дебюта (232px, рамка 1px hairline-2, под ней название курсивом и последний ход моно-шрифтом). 4 ячейки снизу через линии: Повторить, Изучаю, Освоено (с «из M»), Новых.
  - Состояние «Всё повторено»: кнопка `op-review-all` становится неактивной с текстом «Всё повторено».
  - Состояние «Нет дебютов»: карточка «Добавь первый дебют» + CTA.
  - Фильтры и категории в одну строку: `op-categories` слева (вкладки с подсветкой золотой линией снизу), `op-filters` справа (две сегментные группы «Цвет» и «Показать», общая рамка 1px).
  - Карточка: номер «NN» (курсив, золото) + чип «АВТОРСКИЙ», название (Playfair 18px, 2 строки, фиксированная высота 45px), «♔ Белыми · 76 линий», первые ходы моно 13px, 2px прогресс-полоса (mastered + learning), снизу «освоено 0 из 76 — Повторить N →» (gold когда есть due).
  - Карточка «Новый дебют» в конце сетки убрана; hover-overlay и круглая галочка — убраны.
  - Cleanup названия: regex `/^\s*(📚\s*)?авторск\S*\s*[•·—-]\s*/i` для показа; в базе не меняется.
  - Skeleton: 8 пустых карточек-рамок во время загрузки, без надписи «Загрузка…».
- `src/app/globals.css`: добавлены все `.opcat-*` классы (header, hero, segmented filters, grid, card). Только CSS-переменные, как в теме Executive.
- `src/lib/plural.ts`: добавлены `pluralOpenings`, `pluralMinutes`.
- `docs/design/check-design.mjs`: в `LIST_PAGES['/openings']` `'eg-left'` заменён на `'op-hero'` + `'op-categories'`; минимум колонок на 1440 поднят с 3 до 4 (ТЗ §5).
- `docs/openings-catalog/DECISIONS.md` — журнал решений.

## Коммиты

```
f7267d7 chore(openings-catalog): drop dead var + update check-design.mjs
17d0b2d feat(openings-catalog): rewrite /openings page in Executive style
a5b4d37 feat(openings-catalog): spec + decisions + pluralOpenings/pluralMinutes
```

## Проверки (ТЗ §8)

- `npx tsc --noEmit` — 0 ошибок.
- `npx eslint src/app/openings/page.tsx src/lib/plural.ts` — 0 ошибок.
- Dev `/openings?demo=1` на 1920×950 и 1440×800: шапка, hero, фильтры и сетка стоят «линия в линию» с эталоном `docs/openings-catalog/catalog-reference.html` (разница только в цифрах — демо-данные другие).
- Фильтры в localStorage (`op-filters`) и `?q=` — логика не трогалась.

## Что проверить руками

1. `git checkout feat/openings-catalog && npm run dev` → `/openings` и `/openings?demo=1`.
2. Вкладки «Все/Авторские/Гамбиты/Защиты/Классика/Острые» переключают сетку; счётчик у каждой — tabular-nums.
3. Оба сегмента (Цвет, Показать) сохраняются между перезагрузками.
4. Поиск и клавиша `/` работают; карточка — ссылка в тренажёр.
5. «Повторить всё → N» и «Дебют Рандом» ведут в `/openings/review` и `/openings/random`; «+ Добавить дебют» — в `/openings/new`.
6. При `totalDue === 0` кнопка становится «Всё повторено» (disabled) — проверка `op-review-all` на неё продолжает натыкаться.
7. `node docs/design/check-design.mjs http://localhost:3000 /openings` — должно пройти без ошибок (при dev-сервере на :3000 передайте явный URL).

## Ветка не пушится

`main` не трогал. Как подтвердишь визуально — fast-forward пушну `feat/openings-catalog → main`, Vercel автодеплоит.
