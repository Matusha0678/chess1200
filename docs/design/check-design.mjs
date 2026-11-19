#!/usr/bin/env node
// Автопроверка страниц-тренажёров Chess 1200 (DESIGN-SPEC.md, раздел 14; pages/README.md).
// Версия 2: + проверка структуры (метки data-ui), левая колонка видна, правая панель на всю ширину,
//           запрещённые старые элементы.
// Версия 3: + ответы на демо-позициях (pages/BOARD-EXPLAIN.md): значки, стрелки, наведение, тексты.
// Версия 3.1: + страницы-каталоги без большой доски (/endgames, pages/endgames/ENDGAMES.md); флаг --no-answers.
// Версия 3.2: + /play в проверке структуры (pages/play/PLAY.md).
// Версия 3.3: «Жертвы» — ответ (pages/sac/FIX-ANSWER.md): оба ответа «1» и «2», позиция после жертвы на доске,
//             значок на фигуре жертвующей стороны, 4 заголовка, ходы только в SAN, просмотр варианта по ходам.
// Версия 3.4: + проигрывание варианта по кнопке ▶ (ходы идут по очереди, а не прыжком в конец).
// Версия 3.5: + /repertoire «Дебюты в партиях» (pages/repertoire/REPERTOIRE.md): структура и демо ?demo=1.
// Версия 3.6: /endgames — карточка не должна обрезать доску и название (сплющенные ряды сетки).
// Версия 3.7: на страницах-тренажёрах в правой панели нет ходов в UCI (e2e4) — только SAN.
// Версия 3.8: тренажёр дебютов (pages/openings/OPENINGS.md): каталог /openings и переход в дебют, тренажёр
//             /openings/demo — проходы «Повторять», «Учить», «Экзамен» по ходам, /openings/review;
//             у каждого пункта меню есть иконка; демо-проходы «Тактики» и «Расчёта вслепую» (TACTICS.md, BLIND.md);
//             колонки каталога считаются по сетке (а не по первому ряду).
// Версия 3.9: «Ловушки» (pages/traps/TRAPS.md), «Идеи позиций» (pages/plans/IDEAS.md), «Дебютный спринт»
//             (pages/sprint/SPRINT.md): структура и демо-проходы; «Угадай дебют» убран из меню.
// Версия 4.0: страница урока курса (pages/course/COURSE-LESSON.md): структура /courses/<курс>/<урок>,
//             демо /courses/demo/2 — вступление → линия → ход 8... d5 (значок и стрелки автора) → вариант →
//             «Сыграй сам»; «Проверь себя» — вопрос с вариантами и задача на доске (?step=6).
//
// Запуск (dev-сервер должен работать):
//   node docs/design/check-design.mjs                                  # http://localhost:3001, все тренажёры + ответы
//   node docs/design/check-design.mjs http://localhost:3001 /mistakes /threats /sac
//   node docs/design/check-design.mjs --answers-only                   # только ответы (быстро)
//   node docs/design/check-design.mjs http://localhost:3001 /endgames --no-answers   # одна страница, без ответов
//   node docs/design/check-design.mjs http://localhost:3001 /repertoire               # страница + её демо
//   node docs/design/check-design.mjs http://localhost:3001 /openings /openings/demo  # дебюты: каталог, тренажёр, демо-проходы
//   node docs/design/check-design.mjs http://localhost:3001 /traps /plans /sprint      # ловушки, идеи, спринт + их демо
//   node docs/design/check-design.mjs http://localhost:3001 /courses/demo/2            # урок курса + демо-проходы
//
// Скриншоты: docs/design/shots/<окно>/<страница>.png
// Код выхода: 0 — всё хорошо, 1 — есть ошибки.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';

const rawArgs = process.argv.slice(2);
const ANSWERS_ONLY = rawArgs.includes('--answers-only');
const NO_ANSWERS = rawArgs.includes('--no-answers');
const args = rawArgs.filter(a => a !== '--answers-only' && a !== '--no-answers');
const base = args[0] && /^(https?|file):/.test(args[0]) ? args.shift().replace(/\/$/, '') : 'http://localhost:3001';
const EXPLICIT = args.length > 0;   // страницы указаны — ответы проверяем только для них
const PAGES = args.length ? args : [
  '/mistakes', '/threats', '/sac', '/play', '/repertoire', '/endgames', '/guess-opening', '/traps',
  '/plans', '/evaluate', '/warmup', '/openings/random',
  '/stats', '/convert', '/tactics', '/blind',
  '/openings', '/openings?demo=1', '/openings/demo?mode=review', '/openings/review?demo=1',
  '/traps?demo=1', '/plans?demo=1', '/sprint', '/sprint?demo=1',
  '/courses/demo/2', '/courses/demo/2?step=6',
];
const SIZES = [
  { w: 1920, h: 950, minBoard: 760, needSession: true },
  { w: 1440, h: 800, minBoard: 620, needSession: false },
];

// Страницы, у которых проверяется структура (метки data-ui). Остальные — только техника.
const STRUCTURE = ['/mistakes', '/threats', '/sac', '/play', '/repertoire', '/stats', '/tactics', '/blind',
  '/openings/demo', '/openings/[id]', '/openings/review', '/traps', '/plans', '/sprint', '/courses/lesson'];
const COMMON_UI = ['player-top', 'player-bottom', 'panel', 'panel-header', 'panel-title', 'panel-actions'];
const SESSION_UI = ['session', 'session-stats', 'session-list'];
// «a|b» — достаточно любой из меток (разные состояния страницы)
const PAGE_UI = {
  '/play': ['play-moves', 'play-coach|play-review'],
  '/repertoire': ['rep-opening|rep-empty', 'rep-insight|rep-empty'],
  '/threats': ['threat-task|threat-card', 'threat-rules|threat-marks', 'threat-marked|threat-defense'],
  '/sac': [
    'sac-offer|sac-feedback|sac-empty|sac-prep-progress',
    'sac-weigh|sac-gave-got|sac-empty|sac-prep-progress',
    'sac-choice|sac-feedback|sac-empty|sac-prep-progress',
  ],
  '/stats': ['stats-row|stats-empty', 'stats-insight|stats-empty'],
  '/tactics': ['tactics-feedback|tactics-sets|tactics-empty'],
  '/blind': ['blind-line', 'blind-feedback|blind-task'],
  // v3.8: тренажёр дебютов (OPENINGS.md, раздел 9)
  '/openings/demo': ['op-modes', 'op-line', 'op-task|op-feedback|op-summary|op-exam-setup|op-exam-result',
    'op-steps|op-summary|op-exam-setup|op-exam-result', 'op-moves|op-summary|op-exam-setup|op-exam-result'],
  '/openings/[id]': ['op-modes', 'op-line|op-empty', 'op-task|op-feedback|op-summary|op-exam-setup|op-exam-result|op-empty',
    'op-steps|op-summary|op-exam-setup|op-exam-result|op-empty', 'op-moves|op-summary|op-exam-setup|op-exam-result|op-empty'],
  '/openings/review': ['op-line|op-summary', 'op-task|op-feedback|op-summary', 'op-steps|op-summary', 'op-moves|op-summary'],
  // v3.9
  '/traps': ['trap-filter', 'trap-row', 'trap-line', 'trap-task|trap-feedback|trap-story'],
  '/plans': ['idea-modes', 'idea-row|idea-empty', 'idea-moves|idea-feedback|idea-token|idea-empty'],
  '/sprint': ['sprint-time', 'sprint-openings', 'sprint-start|sprint-timer|sprint-result'],
  // v4.0: урок курса (COURSE-LESSON.md, раздел 10)
  '/courses/lesson': ['lesson-stepper', 'lesson-comment|lesson-text|lesson-quiz|lesson-play|lesson-end',
    'lesson-nav|lesson-next-step|lesson-quiz-next|lesson-test|lesson-play-actions'],
};
// v4.0: метки левой колонки — только когда она видна (1920)
const PAGE_UI_SESSION = {
  '/courses/lesson': ['lesson-row', 'lesson-step'],
};
// старый тренажёр дебютов (практика/учёба/экзамен до OPENINGS.md)
const OP_OLD = ['Прогресс сессии', 'Текущая линия', 'Вы играете', 'всё сделано', 'N — следующая', 'Пробел — подсказка', 'правильный выделен золотым'];
// Старые элементы, которых быть не должно
const FORBIDDEN = {
  '/play': ['Оценка · выкл', 'Оценка · вкл', 'Начать заново', 'Играть с позиции', 'Главные потери', 'Выбери фору'],
  '/threats': ['XP заработано', '← Сегодня'],
  '/sac': ['← Мастера', 'В стиле Таля', 'Следующая позиция', 'Подготовить позиции →'],
  '/openings/demo': OP_OLD, '/openings/[id]': OP_OLD, '/openings/review': OP_OLD,
  '/traps': ['Ловушек пока нет', 'Добавьте в курс секции'],
  '/plans': ['Нет идей в курсах'],
  '/sprint': ['Угадай дебют'],
  // старый просмотрщик урока (LessonViewer до COURSE-LESSON.md)
  '/courses/lesson': ['ANIM', 'УГАДАЙ', 'ОТКЛ', 'ОБЪЯСНИ', 'Комментарий к ходу', 'ЧТО ЗНАЧАТ ЗНАЧКИ', 'ВАРИАНТ'],
};

// v3.1: каталоги без большой доски. Ключ — путь страницы (совпадает и с «/endgames.html» для макета).
const LIST_PAGES = {
  '/endgames': {
    ui: ['eg-left', 'eg-sections', 'eg-next', 'eg-grid', 'eg-card', 'eg-board', 'eg-card-title'],
    minCols: { 1920: 5, 1440: 3 }, minBoard: 230,
    forbidden: ['Любая сложность', 'Отыгрывай типовые позиции'],
    titleNotIn: ['Король и пешка', 'Ладейные', 'Лёгкие фигуры', 'Ферзь против пешки'],
  },
  '/convert': {
    ui: ['eg-left', 'eg-next', 'eg-grid', 'eg-card', 'eg-board', 'eg-card-title'],
    minCols: { 1920: 5, 1440: 3 }, minBoard: 230,
    forbidden: [],
    titleNotIn: [],
  },
  // v3.8: каталог дебютов (OPENINGS.md, раздел 2) — метки как в каталоге «Эндшпилей»
  '/openings': {
    ui: ['eg-left', 'eg-grid', 'eg-card', 'eg-board', 'eg-card-title', 'op-review-all', 'op-filters', 'op-search'],
    minCols: { 1920: 5, 1440: 3 }, minBoard: 230,
    forbidden: ['Репертуар и тренировка дебютных линий', 'Играй против Stockfish — он тренирует'],
    titleNotIn: [],
    // демо ?demo=1: 5 дебютов, сортировка «к повторению» → «новые» → «освоено»
    demo: { cards: 5, status: { due: 2, new: 2, mastered: 1 }, firstTitle: 'Ускоренный дракон', text: { 'op-review-all': ['3'] } },
    // клик по карточке открывает тренажёр — проверяем его структуру (на 1920)
    open: { click: '[data-ui="eg-card"]', as: '/openings/[id]', demoAs: '/openings/demo' },
  },
};
const listKeyOf = pp => Object.keys(LIST_PAGES).find(k => pp === k || pp.startsWith(k + '.'));

// v3: ответы на демо-позициях (BOARD-EXPLAIN.md). Роли стрелок — data-role у [data-ui="board-arrow"].
const SAC_FORBIDDEN_ANSWER = ['Правильно!', 'Оценка до', 'Оценка после', 'реальная жертва', 'ложная жертва', 'Компенсация достаточна'];
const clickSquare = async (page, sq) => {
  const id = await page.getAttribute('[id$="-board"]', 'id');
  await page.click(`[id="${id.slice(0, -'-board'.length)}-square-${sq}"]`);
};
// Демо-позиции (BOARD-EXPLAIN.md, раздел 4): расстановка до и после жертвы Bxh7+ (белые жертвуют, клетка h7)
const SAC_POS = {
  works: {
    before: 'r1bq1rk1/pppnbppp/2n1p3/3pP3/3P3P/2NB1N2/PPP2PP1/R1BQK2R',
    after: 'r1bq1rk1/pppnbppB/2n1p3/3pP3/3P3P/2N2N2/PPP2PP1/R1BQK2R',
    step00: 'r1bq1r2/pppnbppk/2n1p3/3pP3/3P3P/2N2N2/PPP2PP1/R1BQK2R',     // + Kxh7
    step01: 'r1bq1r2/pppnbppk/2n1p3/3pP1N1/3P3P/2N5/PPP2PP1/R1BQK2R',   // + Ng5+
    step02: 'r1bq1r2/pppnbpp1/2n1p1k1/3pP1N1/3P3P/2N5/PPP2PP1/R1BQK2R', // + Kg6
    step03: 'r1bq1r2/pppnbpp1/2n1p1k1/3pP1NP/3P4/2N5/PPP2PP1/R1BQK2R',  // + h5+
  },
  fails: {
    before: 'r1bq1rk1/ppp1bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R',
    after: 'r1bq1rk1/ppp1bppB/2n1pn2/3p4/3P4/2N1PN2/PPP2PPP/R1BQK2R',
  },
};
const SAC_TITLES = {
  'works:1': 'Верно! Жертва работает', 'works:2': 'Неверно — жертва работает',
  'fails:1': 'Неверно — жертва не работает', 'fails:2': 'Верно — жертва не работает',
};
const sacFlow = (demo, key) => {
  const works = demo === 'works';
  const title = SAC_TITLES[`${demo}:${key}`];
  const wrongTitles = Object.values(SAC_TITLES).filter(t => t !== title);
  return {
    url: `/sac?demo=${demo}`, demo, key, name: `sac_demo_${demo}_${key}`, wait: 'sac-feedback',
    answer: async page => { await page.keyboard.press(key); },
    expect: {
      fen: SAC_POS[demo].after, badgeOn: { sq: 'h7', color: 'w' }, noUci: true,
      badges: [works ? 'brilliant' : 'blunder|mistake'],
      roles: works ? { 'line-opp': 1, plan: 1 } : { threat: 1 },
      labels: works ? ['1', '2'] : [],
      check: true,
      ui: ['eval-bar', 'sac-feedback', 'sac-gave-got', 'sac-eval-no', 'sac-eval-after', 'sac-line'],
      text: works
        ? { 'sac-feedback': [title], 'sac-gave-got': ['Отдал', 'Получил', 'слона за пешку'], 'sac-eval-no': ['без жертвы', 'Rh3'], 'sac-eval-after': ['после', 'Bxh7+'], 'sac-line': ['Kxh7', 'Ng5+', 'Kg6', 'h5+'] }
        : { 'sac-feedback': [title], 'sac-gave-got': ['Отдал', 'Получил', 'ничего'], 'sac-eval-no': ['без жертвы', 'O-O'], 'sac-line': ['Nxh7', 'h4', 'Bb4', 'Ng5'] },
      textNot: { 'sac-feedback': wrongTitles, 'sac-gave-got': ['пешки)', 'пешек)'] },
      result: { 'sac-feedback': works ? 'works' : 'fails' },
    },
    forbidden: SAC_FORBIDDEN_ANSWER,
    hover: [
      ...(works ? [{ sel: '[data-ui="sac-line"]', shot: 'line', roles: { 'line-opp|line-me': 2 }, labels: ['1', '2'], fen: SAC_POS[demo].after }] : []),
      { sel: '[data-ui="sac-eval-no"]', shot: 'nosac', roles: { best: 1 }, fen: SAC_POS[demo].before, noBadges: true },
    ],
    // просмотр варианта по ходам (FIX-ANSWER.md, раздел 4) — только в одном прогоне
    steps: works && key === '1' ? [
      { click: '[data-ui="sac-line-move"][data-line="0"][data-ply="1"]', shot: 'step', fen: SAC_POS.works.step01, ui: ['sac-step'], text: { 'sac-step': ['2'] }, noBadges: true, maxArrows: 0 },
      { key: 'ArrowRight', fen: SAC_POS.works.step02, ui: ['sac-step'], noBadges: true },
      { key: 'Escape', fen: SAC_POS.works.after, badges: ['brilliant'], badgeOn: { sq: 'h7', color: 'w' }, roles: { 'line-opp': 1, plan: 1 }, noUi: ['sac-step'] },
    ] : [],
    // проигрывание варианта (FIX-ANSWER.md, раздел 5): ходы по очереди, ~900 мс между ходами
    play: works && key === '1' ? {
      click: '[data-ui="sac-line-play"][data-line="0"]',
      seq: [SAC_POS.works.step00, SAC_POS.works.step01, SAC_POS.works.step02, SAC_POS.works.step03],
      after: SAC_POS.works.after,
    } : null,
  };
};
// ── v3.8: ходы на доске для демо-проходов ─────────────────────────────────────
const placement = fen => fen.split(' ')[0];
async function waitPlacement(page, pl, timeout = 7000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = await page.evaluate(() => document.querySelector('[data-board-fen]')?.getAttribute('data-board-fen') || '');
    if (placement(f) === pl) return true;
    await page.waitForTimeout(80);
  }
  return false;
}
async function clickMove(page, from, to) { await clickSquare(page, from); await page.waitForTimeout(120); await clickSquare(page, to); }
/** Линия из SAN (от начальной позиции или от fen): для каждого полухода — клетки и расстановка до/после. */
function lineMoves(sans, fen) {
  const c = fen ? new Chess(fen) : new Chess();
  return sans.split(' ').map(san => { const before = placement(c.fen()); const mv = c.move(san); return { from: mv.from, to: mv.to, color: mv.color, before, after: placement(c.fen()) }; });
}
/** Сыграть свои ходы с from по to (не включая), дожидаясь позиции перед каждым (ответ соперника — автоматически). */
async function playMine(page, moves, color, from, to) {
  for (let k = from; k < to; k++) {
    if (moves[k].color !== color) continue;
    if (!(await waitPlacement(page, moves[k].before))) throw new Error(`не дождался позиции перед полуходом ${k + 1}`);
    await page.waitForTimeout(150);
    await clickMove(page, moves[k].from, moves[k].to);
  }
}
// демо-линии тренажёра дебютов — те же, что в docs/design/pages/openings/opening-ref.cjs
const OPL = {
  L2: lineMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O Qd2 Be6'),
  L3: lineMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 Qa5 O-O O-O Bb3 d6'),
  L5: lineMoves('e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3 Bg7 h3 Nf6 Nc3 O-O'),
};
// задачи «Тактики» и «Расчёта вслепую» (TACTICS.md, раздел 5)
const PZ = {
  nneg: lineMoves('Ne7+ Kh8 Nxc8', 'r1q2rk1/2pb1pb1/pp1p3p/3PnN2/P1P1P1p1/1PNB1p1P/4RPP1/3QR1K1 w - - 0 23'),
  haqu: lineMoves('d3+ Nxc5 dxc2 Nxb7 c1=Q+', '6k1/1q3p2/5prp/2b5/3pN3/1PP2P1P/2Q1R1P1/6K1 b - - 0 27'),
};

// v3.9: позиции демо «Ловушек», «Идей», «Спринта»
const TRAP = {
  staff: lineMoves('e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#'),
  bb: lineMoves('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#'),
};
const IDEA = { after11: lineMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O Qd2 Be6 O-O')[20].after };
// v4.0: демо-урок (docs/design/pages/course/demo-course.json, урок 2, линия 1)
const LES = {
  l1: lineMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 f3 O-O Qd2 d5 exd5 Nxd5 Nxd5 Qxd5 Nxc6 Qxc6'),
  v11: lineMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 f3 O-O Qd2 d5 exd5 Nxd5 Nxd5 Qxd5 Nxc6 Qxd2+'),
  start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
};
const SPR = {
  p1: lineMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6')[7].before,
  p2: lineMoves('e4 c5 Nf3 Nc6 Bb5 g6')[5].before,
};

const ANSWER_FLOWS = [
  // v4.0: урок курса — демо (COURSE-LESSON.md, раздел 10)
  { url: '/courses/demo/2', demo: 'course', name: 'course_lesson', wait: 'lesson-text', title: 'вступление → линия → 8... d5 → вариант → «Сыграй сам»',
    answer: async () => {},
    expect: { fen: LES.start, maxArrows: 0, noBadges: true, noUci: true, ui: ['lesson-stepper', 'lesson-next-step', 'lesson-step', 'lesson-row'],
      text: { 'panel-title': ['Вступление'], 'panel-header': ['Идея дебюта и удар'], 'lesson-text': ['d5 сразу'] } },
    forbidden: ['ANIM', 'УГАДАЙ', 'ОТКЛ', 'Комментарий к ходу'],
    steps: [
      { name: '«Дальше» → линия 1', click: '[data-ui="lesson-next-step"]', waitUi: 'lesson-comment', fen: LES.start, maxArrows: 0,
        ui: ['lesson-moves', 'lesson-nav', 'lesson-modes'], text: { 'panel-title': ['Схема f3'], 'lesson-comment': ['Be3, f3, Qd2'] } },
      { name: 'клика по ходу 8... d5', click: '[data-ui="lesson-move"][data-ply="16"]', waitFen: LES.l1[15].after, shot: 'line',
        badges: ['great'], badgeOn: { sq: 'd5', color: 'b' }, roles: { note: 2 }, maxArrows: 2,
        text: { 'lesson-comment': ['8... d5', 'Сильный ход', 'Главный удар'], 'lesson-moves': ['Qxc6'], 'lesson-notes': ['готовят долго'] } },
      { name: 'клавиши →', key: 'ArrowRight', waitFen: LES.l1[16].after, noBadges: true, maxArrows: 0, text: { 'lesson-comment': ['9. exd5'] } },
      { name: 'клика по ходу 11... Qxc6', click: '[data-ui="lesson-move"][data-ply="22"]', waitFen: LES.l1[21].after, shot: 'variants',
        ui: ['lesson-variants', 'lesson-outro', 'lesson-next-step'], roles: { note: 1 }, text: { 'lesson-variants': ['11... Qxd2+', '13. O-O-O'] } },
      { name: '«Смотреть» вариант', click: '[data-ui="lesson-variant-open"]', waitUi: 'lesson-variant-bar', fen: LES.l1[21].before,
        text: { 'lesson-variant-bar': ['Вариант'] } },
      { name: 'клавиши → в варианте', key: 'ArrowRight', waitFen: LES.v11[21].after, text: { 'lesson-comment': ['11... Qxd2+'] } },
      { name: 'V — назад к линии', key: 'v', waitFen: LES.l1[21].after, noUi: ['lesson-variant-bar'] },
      { name: '«Сыграй сам»', click: '[data-ui="lesson-mode-play"]', waitFen: LES.l1[0].after, waitUi: 'lesson-play', maxArrows: 0, noBadges: true,
        result: { 'lesson-play': 'info' }, text: { 'panel-title': ['Твой ход'] }, textNot: { 'lesson-moves': ['Nf3', 'Qxc6'] } },
      { name: 'верного 1... c5', act: page => clickMove(page, 'c7', 'c5'), waitFen: LES.l1[2].after, pause: 400 },
      { name: 'неверного 2... e6', act: page => clickMove(page, 'e7', 'e6'), waitUi: 'lesson-play', pause: 300, shot: 'play',
        fen: LES.l1[2].after, roles: { played: 1 }, maxArrows: 1, result: { 'lesson-play': 'fail' }, text: { 'lesson-play': ['2... e6'], 'panel-title': ['Не тот ход'] } },
      { name: 'второй ошибки 2... d6', act: page => clickMove(page, 'd7', 'd6'), pause: 300, fen: LES.l1[2].after, roles: { played: 1, best: 1 }, result: { 'lesson-play': 'fail' } },
      { name: 'верного 2... Nc6', act: page => clickMove(page, 'b8', 'c6'), waitFen: LES.l1[4].after, maxArrows: 0 },
    ] },
  { url: '/courses/demo/2?step=6', demo: 'course', name: 'course_quiz', wait: 'lesson-quiz', title: '«Проверь себя»: вопрос с вариантами и задача на доске',
    answer: async () => {},
    expect: { ui: ['lesson-quiz', 'lesson-option'], noUci: true, text: { 'panel-title': ['Проверь себя'], 'lesson-quiz': ['не спешат играть d6'] } },
    steps: [
      { name: 'ответа B', click: '[data-ui="lesson-option"][data-key="B"]', waitUi: 'lesson-quiz-feedback', result: { 'lesson-quiz-feedback': 'fail' },
        text: { 'lesson-quiz-feedback': ['d5'] } },
      { name: 'Enter — задача на доске', key: 'Enter', waitFen: LES.l1[14].after, maxArrows: 0, noUi: ['lesson-quiz-feedback'], text: { 'lesson-quiz': ['8. Qd2'] } },
      { name: 'хода 8... d5', act: page => clickMove(page, 'd7', 'd5'), waitUi: 'lesson-quiz-feedback', pause: 400, shot: 'quiz',
        result: { 'lesson-quiz-feedback': 'ok' }, text: { 'lesson-quiz-feedback': ['d5'] } },
    ] },
  // v3.9: «Ловушки», «Идеи позиций», «Дебютный спринт» — демо (PAGES2.md, раздел 4)
  { url: '/traps?demo=1', demo: 'traps', name: 'traps_demo', wait: 'trap-feedback', title: 'Накажи: «Ой, мой ферзь» → мат; Не попадись: Блэкберн',
    answer: async page => {
      const T = TRAP.staff;
      if (!(await waitPlacement(page, T[11].before))) throw new Error('не дождался позиции после 6. Bg5');
      await page.waitForTimeout(200);
      await clickMove(page, 'f6', 'e4');
      if (!(await waitPlacement(page, T[13].before))) throw new Error('нет ответа 7. Bxd8');
      await page.waitForTimeout(200);
      await clickMove(page, 'c5', 'f2');
      if (!(await waitPlacement(page, T[15].before))) throw new Error('нет ответа 8. Ke2');
      await page.waitForTimeout(200);
      await clickMove(page, 'c8', 'g4');
    },
    expect: { result: { 'trap-feedback': 'ok' }, text: { 'trap-feedback': ['Мат'] }, ui: ['trap-row', 'trap-line', 'trap-story'], noBadges: true, noUci: true,
      textNot: { 'session-list': ['Ловушек пока нет'] } },
    steps: [
      { name: 'клика по «Блэкберну»', click: '[data-ui="trap-row"][data-trap="blackburne"]', waitFen: TRAP.bb[8].before, maxArrows: 0,
        text: { 'panel-title': ['Блэкберн'] } },
      { name: 'хода в ловушку 5. Nxf7', act: page => clickMove(page, 'e5', 'f7'), waitUi: 'trap-feedback', shot: 'avoid',
        fen: TRAP.bb[8].before, roles: { played: 1, best: 1 }, result: { 'trap-feedback': 'fail' }, text: { 'trap-feedback': ['Nxf7', 'Nf3#', 'O-O'], 'panel-title': ['Попался'] } },
    ] },
  { url: '/plans?demo=1', demo: 'plans', name: 'plans_demo', wait: 'idea-moves', title: 'ходы мастеров и «Проверь себя»',
    answer: async page => { if (!(await waitPlacement(page, IDEA.after11))) throw new Error('не дождался позиции после 11. O-O'); },
    expect: { fen: IDEA.after11, roles: { plan: 3 }, labels: ['1', '2', '3'], noBadges: true, noUci: true,
      ui: ['idea-context', 'idea-moves', 'idea-plan', 'idea-games', 'idea-row'],
      text: { 'idea-context': ['10... Be6', '11. O-O'], 'idea-moves': ['Qa5', '40%', 'a5', 'Rc8'], 'idea-plan': ['a5', 'f4', 'Bd4'], 'panel-title': ['11. O-O'] } },
    steps: [
      { name: '«Проверь себя»', click: '[data-ui="idea-quiz"]', fen: IDEA.after11, maxArrows: 0, text: { 'panel-title': ['как мастер'] } },
      { name: 'хода 11... h6', act: page => clickMove(page, 'h7', 'h6'), waitUi: 'idea-feedback', shot: 'quiz',
        fen: IDEA.after11, roles: { played: 1, best: 1 }, result: { 'idea-feedback': 'fail' }, text: { 'idea-feedback': ['h6', 'Qa5', '40%'] } },
      { name: 'хода 11... Qa5', act: page => clickMove(page, 'd8', 'a5'), waitUi: 'idea-feedback', result: { 'idea-feedback': 'ok' }, text: { 'idea-feedback': ['40%'] } },
    ] },
  { url: '/sprint?demo=1', demo: 'sprint', name: 'sprint_demo', wait: 'sprint-start', title: 'старт → верно → ошибка',
    answer: async () => {},
    expect: { ui: ['sprint-start', 'sprint-time', 'sprint-openings'], noUci: true },
    steps: [
      { name: '«Старт»', click: '[data-ui="sprint-start"]', waitFen: SPR.p1, ui: ['sprint-timer', 'sprint-score', 'sprint-lives'], maxArrows: 0 },
      { name: 'верного 4... g6', act: page => clickMove(page, 'g7', 'g6'), waitFen: SPR.p2, pause: 300, text: { 'sprint-score': ['1 очко'], 'sprint-lives': ['3 из 3'] } },
      { name: 'неверного 3... e6', act: page => clickMove(page, 'e7', 'e6'), pause: 250, shot: 'miss',
        fen: SPR.p2, roles: { played: 1, best: 1 }, text: { 'sprint-lives': ['2 из 3'], 'sprint-log': ['3... g6'] } },
    ] },
  // v3.8: тренажёр дебютов, демо (OPENINGS.md, раздел 9)
  { url: '/openings/demo?mode=review', demo: 'openings', name: 'openings_review', wait: 'op-feedback', title: 'Повторять: ошибка → закрепление → следующая линия',
    answer: async page => {
      await playMine(page, OPL.L2, 'b', 0, 7);
      if (!(await waitPlacement(page, OPL.L2[7].before))) throw new Error('не дождался 4. Nxd4');
      await page.waitForTimeout(150);
      await clickMove(page, 'g8', 'f6');
    },
    expect: {
      fen: OPL.L2[7].before, roles: { played: 1, best: 1 }, maxArrows: 2, noBadges: true, noUci: true,
      ui: ['op-feedback', 'op-steps', 'op-moves', 'op-game-note', 'op-line'],
      result: { 'op-feedback': 'fail' },
      text: { 'op-feedback': ['4... Nf6', '4... g6'], 'op-game-note': ['petr_k'], 'op-steps': ['Ход 4 из 10'], 'panel-title': ['Не тот ход'] },
      textNot: { 'op-moves': ['Bg7', 'Be6', 'Qd2'], 'session-list': ['Nf6'] },
    },
    forbidden: OP_OLD,
    steps: [
      { name: 'верного хода 4... g6', act: page => clickMove(page, 'g7', 'g6'), waitFen: OPL.L2[8].after, maxArrows: 0, noBadges: true, noUi: ['op-feedback'] },
      { name: 'всей линии до конца', act: page => playMine(page, OPL.L2, 'b', 9, 20), waitFen: OPL.L2[7].before, shot: 'consolidate',
        maxArrows: 0, noBadges: true, text: { 'panel-title': ['Закрепим'] } },
      { name: 'закрепления 4... g6', act: page => clickMove(page, 'g7', 'g6'), waitUi: 'op-next', shot: 'done',
        result: { 'op-feedback': 'done' }, text: { 'panel-title': ['с ошибками'], 'op-feedback': ['через 3 дня'] } },
      { name: 'Enter — следующая линия', key: 'Enter', waitFen: OPL.L3[7].before, shot: 'next',
        maxArrows: 0, text: { 'op-task': ['уже сыграл сегодня'], 'op-steps': ['Ход 1 из 6'], 'panel-header': ['2 / 2'] } },
    ] },
  { url: '/openings/demo?mode=learn', demo: 'openings', name: 'openings_learn', wait: 'op-task', title: 'Учить: ход по стрелке → «Сыграть по памяти»',
    answer: async page => { if (!(await waitPlacement(page, OPL.L5[5].before))) throw new Error('не дождался 3. Bb5'); },
    expect: {
      fen: OPL.L5[5].before, roles: { best: 1 }, maxArrows: 1, noBadges: true, noUci: true,
      ui: ['op-task', 'op-steps', 'op-moves', 'op-line'],
      text: { 'panel-title': ['3... g6'], 'op-task': ['2... Nc6'], 'op-steps': ['Ход 1 из 5'], 'op-moves': ['Bb5', 'Bxc6', 'O-O'] },
    },
    forbidden: OP_OLD,
    steps: [
      { name: 'неверного хода 3... b6', act: page => clickMove(page, 'b7', 'b6'), fen: OPL.L5[5].before, roles: { played: 1, best: 1 }, result: { 'op-feedback': 'info' } },
      { name: 'хода по стрелке 3... g6', act: page => clickMove(page, 'g7', 'g6'), waitFen: OPL.L5[7].before, roles: { best: 1 }, maxArrows: 1, text: { 'panel-title': ['4... dxc6'] } },
      { name: 'всей линии по стрелкам', act: page => playMine(page, OPL.L5, 'b', 7, 14), waitUi: 'op-recall', shot: 'learned', text: { 'panel-title': ['Линия пройдена'] } },
      { name: '«Сыграть по памяти»', click: '[data-ui="op-recall"]', waitFen: OPL.L5[5].before, maxArrows: 0, noBadges: true, text: { 'panel-title': ['Твой ход'] } },
    ] },
  { url: '/openings/demo?mode=exam', demo: 'openings', name: 'openings_exam', wait: 'op-exam-setup', title: 'Экзамен: ошибка — линия не засчитана',
    answer: async () => {},
    expect: { ui: ['op-exam-setup', 'op-exam-start'], text: { 'op-exam-setup': ['6'] }, noUci: true },
    forbidden: OP_OLD,
    steps: [
      { name: '«Начать экзамен»', click: '[data-ui="op-exam-start"]', waitFen: OPL.L2[1].before, ui: ['op-timer'], maxArrows: 0, text: { 'panel-header': ['1 / 6'] } },
      { name: 'неверного хода 1... e6', act: page => clickMove(page, 'e7', 'e6'), pause: 300, fen: OPL.L2[1].before,
        roles: { played: 1, best: 1 }, result: { 'op-feedback': 'fail' }, text: { 'op-feedback': ['1... e6', '1... c5'] } },
      { name: 'паузы — следующая линия', act: page => page.waitForTimeout(2200), text: { 'panel-header': ['2 / 6'] }, maxArrows: 0 },
      { name: '«Закончить экзамен»', click: '[data-ui="op-exam-finish"]', waitUi: 'op-exam-result', text: { 'op-exam-result': ['0 из 1'] } },
    ] },
  // v3.8: «Тактика» и «Расчёт вслепую», демо (TACTICS.md, раздел 6; BLIND.md, раздел 4)
  { url: '/tactics?demo=1', demo: 'tactics', name: 'tactics_demo', wait: 'tactics-feedback', title: 'задача 0NNEG решена, ошибка в 0haqU',
    answer: async page => {
      if (!(await waitPlacement(page, PZ.nneg[0].before))) throw new Error('не дождался позиции задачи 0NNEG');
      await page.waitForTimeout(300);
      await clickMove(page, 'f5', 'e7');
      if (!(await waitPlacement(page, PZ.nneg[2].before))) throw new Error('нет ответа соперника Kh8');
      await page.waitForTimeout(200);
      await clickMove(page, 'e7', 'c8');
    },
    expect: { result: { 'tactics-feedback': 'ok' }, noUci: true },
    steps: [
      { name: '«Дальше» (Enter)', key: 'Enter', waitFen: PZ.haqu[0].before, maxArrows: 0 },
      { name: 'неверного хода в 0haqU', act: page => clickMove(page, 'g6', 'g5'), waitUi: 'tactics-feedback',
        fen: PZ.haqu[0].before, roles: { best: 1 }, noBadges: true, result: { 'tactics-feedback': 'fail' } },
    ] },
  { url: '/blind?demo=1', demo: 'blind', name: 'blind_demo', wait: 'blind-feedback', title: 'ответ d3 → c2 верный',
    answer: async page => {
      if (!(await waitPlacement(page, PZ.haqu[0].before))) throw new Error('не дождался позиции задачи 0haqU');
      await page.waitForTimeout(300);
      await clickSquare(page, 'd3'); await page.waitForTimeout(150); await clickSquare(page, 'c2');
    },
    expect: { result: { 'blind-feedback': 'ok' }, noUci: true, ui: ['blind-line'], text: { 'blind-line': ['d3+', 'Nxc5'] } },
    steps: [
      { name: '«Дальше» (Enter)', key: 'Enter', pause: 1200, noUi: ['blind-feedback'], ui: ['blind-line'] },
      { name: 'неверного ответа', act: async page => { await clickSquare(page, 'a1'); await page.waitForTimeout(150); await clickSquare(page, 'a2'); },
        waitUi: 'blind-feedback', pause: 4500, roles: { best: 1 }, noBadges: true, result: { 'blind-feedback': 'fail' } },
    ] },
  sacFlow('works', '1'), sacFlow('works', '2'), sacFlow('fails', '1'), sacFlow('fails', '2'),
  // v3.5: «Дебюты в партиях», демо (REPERTOIRE.md, раздел 10)
  { url: '/repertoire?demo=1', demo: 'repertoire', name: 'repertoire_demo', wait: 'rep-deviations', title: 'демо',
    answer: async () => {},
    expect: {
      fen: 'r1bqk1nr/pppp1ppp/2n5/2b5/3NP3/8/PPP2PPP/RNBQKB1R', noBadges: true, noUci: true,
      roles: { played: 1, best: 1 },
      ui: ['session', 'session-stats', 'session-list', 'rep-opening', 'rep-insight', 'rep-deviations', 'rep-holes', 'rep-nolines', 'rep-repeat'],
      text: { 'rep-dev': ['Nf5', 'Nxc6', '2 раза'], 'rep-insight': ['Главное', 'Nf5'], 'rep-hole': ['Qh4'], 'rep-nolines': ['d4'] },
      textRe: { 'session-stats': /2[^0-9]*по линии[^0-9]*3[^0-9]*отклонил[^0-9]*2[^0-9]*дыр/ },
    },
    steps: [
      { click: '[data-ui="rep-hole"]', shot: 'hole', fen: 'r1b1kbnr/pppp1ppp/2n5/8/3NP2q/8/PPP2PPP/RNBQKB1R', roles: { best: 1 }, noBadges: true, noUci: true,
        ui: ['rep-explorer', 'rep-add'], text: { 'rep-explorer': ['Nc3'], 'rep-add': ['Nc3'] } },
      { click: '[data-ui="rep-nolines"]', shot: 'nolines', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR', noBadges: true },
    ] },
  { url: '/threats?demo=fork', demo: 'fork', name: 'threats_demo_fork', wait: 'threat-card',
    answer: async page => { await clickSquare(page, 'c7'); await clickSquare(page, 'f3'); await page.keyboard.press('Enter'); },
    expect: {
      badges: ['found', 'missed', 'wrong'], roles: { threat: 1, fork: 1 }, rings: 3,
      ui: ['threat-card', 'threat-marks', 'threat-line'],
      text: { 'threat-card': ['Угроза', 'Nxc7+'] },
      result: { 'threat-card': 'threat' },
    },
    forbidden: ['XP заработано'],
    hover: [{ sel: '[data-ui="threat-line"]', shot: 'line', roles: { 'line-opp|line-me': 2 }, labels: ['1', '2'] }] },
];
async function readOverlay(page) {
  return page.evaluate(() => {
    const vis = el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const ui = {}, res = {};
    for (const el of document.querySelectorAll('[data-ui]')) {
      if (!vis(el) && el.tagName.toLowerCase() !== 'g') continue;
      const k = el.getAttribute('data-ui');
      if (!(k in ui)) { ui[k] = el.innerText || el.textContent || ''; res[k] = el.getAttribute('data-result') || ''; }
    }
    const board = document.querySelector('[id$="-board"]');
    const sqs = board ? [...board.querySelectorAll('[id*="-square-"] *')] : [];
    return {
      arrows: [...document.querySelectorAll('[data-ui="board-arrow"]')].map(a => ({ role: a.getAttribute('data-role') || '', label: a.getAttribute('data-label') || '' })),
      badges: [...document.querySelectorAll('[data-ui="board-badge"]')].map(b => b.getAttribute('data-kind') || ''),
      badgeSq: [...document.querySelectorAll('[data-ui="board-badge"]')].map(b => b.getAttribute('data-square')),
      fen: document.querySelector('[data-board-fen]')?.getAttribute('data-board-fen') ?? null,
      rings: sqs.filter(d => /inset/.test(d.style?.boxShadow || '') && /4px/.test(d.style?.boxShadow || '')).length,
      check: sqs.some(d => /radial-gradient/.test(d.style?.background || '') && /232, ?64, ?52|e84034/i.test(d.style?.background || '')),
      ui, res,
      panelText: document.querySelector('[data-ui="panel"]')?.innerText || '',
    };
  });
}
function checkOverlay(o, ex, errors, pre) {
  for (const spec of (ex.badges || [])) {
    if (!o.badges.some(k => spec.split('|').includes(k))) errors.push(`${pre}нет значка ${spec} на доске (есть: ${o.badges.join(', ') || 'ничего'})`);
  }
  for (const [spec, n] of Object.entries(ex.roles || {})) {
    const c = o.arrows.filter(a => spec.split('|').includes(a.role)).length;
    if (c < n) errors.push(`${pre}стрелок ${spec}: ${c}, нужно ≥ ${n} (есть: ${o.arrows.map(a => a.role || '?').join(', ') || 'ничего'})`);
  }
  for (const l of (ex.labels || [])) if (!o.arrows.some(a => a.label === l)) errors.push(`${pre}нет стрелки с номером ${l}`);
  if (ex.rings && o.rings < ex.rings) errors.push(`${pre}рамок на клетках ${o.rings}, нужно ≥ ${ex.rings}`);
  if (ex.check && !o.check) errors.push(`${pre}нет свечения шаха под королём (checkSquare)`);
  for (const k of (ex.ui || [])) if (!(k in o.ui)) errors.push(`${pre}нет блока data-ui="${k}"`);
  for (const [k, words] of Object.entries(ex.text || {})) {
    for (const w of words) if (k in o.ui && !o.ui[k].includes(w)) errors.push(`${pre}в data-ui="${k}" нет текста «${w}» — метка не на том блоке?`);
  }
  for (const [k, v] of Object.entries(ex.result || {})) if (k in o.res && o.res[k] !== v) errors.push(`${pre}data-ui="${k}": data-result="${o.res[k]}", нужно "${v}"`);
  // v3.3
  for (const [k, re] of Object.entries(ex.textRe || {})) {
    if (k in o.ui && !re.test(o.ui[k].replace(/\s+/g, ' '))) errors.push(`${pre}в data-ui="${k}" текст не такой: «${o.ui[k].replace(/\s+/g, ' ').slice(0, 80)}»`);
  }
  for (const [k, words] of Object.entries(ex.textNot || {})) {
    for (const w of words) if (k in o.ui && o.ui[k].includes(w)) errors.push(`${pre}в data-ui="${k}" лишний текст «${w}»`);
  }
  for (const k of (ex.noUi || [])) if (k in o.ui) errors.push(`${pre}блок data-ui="${k}" должен исчезнуть`);
  if (ex.maxArrows != null && o.arrows.length > ex.maxArrows) errors.push(`${pre}стрелок ${o.arrows.length}, нужно ≤ ${ex.maxArrows}`);
  const placement = o.fen ? o.fen.split(' ')[0] : null;
  if (ex.fen || ex.badgeOn) {
    if (o.fen == null) errors.push(`${pre}у доски нет атрибута data-board-fen (FIX-ANSWER.md, раздел 6)`);
    else if (ex.fen && placement !== ex.fen) errors.push(`${pre}на доске не та позиция: ${placement}, нужно ${ex.fen}`);
  }
  if (ex.noBadges && o.badges.length) errors.push(`${pre}на доске лишние значки: ${o.badges.join(', ')}`);
  if (ex.badgeOn) {
    if (o.badgeSq.some(x => x == null)) errors.push(`${pre}у значка нет атрибута data-square (FIX-ANSWER.md, раздел 6)`);
    else if (!o.badgeSq.includes(ex.badgeOn.sq)) errors.push(`${pre}значок на клетке ${o.badgeSq.join(', ') || '—'}, нужно на ${ex.badgeOn.sq} (клетка «куда» жертвы)`);
    else if (placement) {
      const rows = placement.split('/'); const f = 'abcdefgh'.indexOf(ex.badgeOn.sq[0]); const r = 8 - Number(ex.badgeOn.sq[1]);
      let col = 0, piece = null;
      for (const ch of rows[r] || '') { if (/\d/.test(ch)) col += +ch; else { if (col === f) piece = ch; col++; } }
      const color = piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null;
      if (color !== ex.badgeOn.color) errors.push(`${pre}под значком на ${ex.badgeOn.sq} ${piece ? 'чужая фигура' : 'пусто'} — значок должен стоять на фигуре, которая пожертвовала (ход сыгран на доске)`);
    }
  }
  if (ex.noUci) {
    const m = o.panelText.match(/(^|[^a-z0-9])([a-h][1-8][a-h][1-8][qrbn]?)(?![a-z0-9])/);
    if (m) errors.push(`${pre}в панели ход в формате UCI «${m[2]}» — нужен SAN`);
  }
}

const OUT = path.resolve('docs/design/shots');
const report = [];
const colorsBySize = {};
const slug = p => (p.replace(/^\//, '').replace(/[\/?#=&]+/g, '_') || 'root');
const pathOf = p => p.split(/[?#]/)[0];

// ── v3.8: проверки вынесены в функции (их зовёт и переход из каталога) ─────────
const navChecked = {};
const structKey = p => {
  const pp = pathOf(p).replace(/\.html$/, '');
  if (/^\/courses\/(demo\/\d+|[0-9a-f-]{36}\/[0-9a-f-]{36})$/.test(pp)) return '/courses/lesson';   // v4.0
  return /^\/openings\/[0-9a-f-]{36}$/.test(pp) ? '/openings/[id]' : pp;
};
function listErrors(m, size, listKey, p, errors) {
  const L = LIST_PAGES[listKey];
  const missing = L.ui.filter(k => !m.ui[k]);
  if (missing.length) errors.push(`нет блоков (data-ui): ${missing.join(', ')}`);
  if (m.eg.length) {
    const row1 = m.eg.filter(c => Math.abs(c.top - m.eg[0].top) < 3).length;
    const cols = m.egCols || row1;
    const need = L.minCols[size.w] || 3;
    if (cols < need) errors.push(`в сетке ${cols} колонок, нужно ≥ ${need}`);
    const notSquare = m.eg.filter(c => Math.abs(c.bw - c.bh) > 1).length;
    if (notSquare) errors.push(`доски в карточках не квадратные: ${notSquare} шт.`);
    const small = m.eg.filter(c => c.bw < L.minBoard).length;
    if (small) errors.push(`доски в карточках меньше ${L.minBoard}px: ${small} шт.`);
    const clipped = m.eg.filter(c => c.h < c.bh + 30);
    if (clipped.length) errors.push(`карточки обрезают доску: ${clipped.length} шт., видно ${Math.round(Math.min(...clipped.map(c => c.h)))}px из ${Math.round(clipped[0].bh)}px — ряды сетки сплющены, нужен grid-auto-rows: max-content (ENDGAMES.md, раздел 2)`);
    const hiddenTitles = m.eg.filter(c => !c.titleVisible).length;
    if (hiddenTitles) errors.push(`у ${hiddenTitles} карточек не видно названия под доской`);
    const badTitles = m.eg.filter(c => L.titleNotIn.includes(c.title)).length;
    if (badTitles) errors.push(`у ${badTitles} карточек заголовок — название раздела, нужны свои названия (ENDGAMES.md, раздел 4)`);
  }
  if (m.ui['eg-left']) {
    const w = Math.round(m.ui['eg-left'].w);
    if (w < 270 || w > 290) errors.push(`левая колонка ${w}px, нужно 280`);
  }
  if (size.w === 1920 && m.egGridRight && m.egGridRight < size.w - 26) errors.push(`справа пустое место ${Math.round(size.w - m.egGridRight)}px — сетка не на всю ширину`);
  for (const t of L.forbidden) if (m.text.includes(t)) errors.push(`старый элемент на странице: «${t}»`);
  // v3.8: демо каталога
  if (L.demo && /demo=1/.test(p)) {
    const D = L.demo;
    if (m.eg.length !== D.cards) errors.push(`демо: карточек ${m.eg.length}, нужно ${D.cards}`);
    for (const [st, n] of Object.entries(D.status || {})) {
      const c = m.egStatus.filter(x => x === st).length;
      if (c !== n) errors.push(`демо: карточек с data-status="${st}" ${c}, нужно ${n}`);
    }
    if (D.firstTitle && m.eg[0] && m.eg[0].title !== D.firstTitle) errors.push(`демо: первая карточка «${m.eg[0].title}», нужно «${D.firstTitle}» (сначала дебюты с линиями к повторению)`);
    for (const [k, words] of Object.entries(D.text || {})) for (const w of words) {
      if (!(k in m.uiText)) errors.push(`демо: нет блока data-ui="${k}"`);
      else if (!m.uiText[k].includes(w)) errors.push(`демо: в data-ui="${k}" нет «${w}»`);
    }
  }
}
function boardErrors(m, size, errors) {
  if (!m.hasBoard) { errors.push('нет доски ([id$="-board"]) — страница не переведена на Board?'); return; }
  if (m.squareCount !== 64) errors.push(`клеток ${m.squareCount}, нужно 64`);
  if (Math.abs(m.board.w - m.board.h) > 1) errors.push(`доска не квадратная: ${Math.round(m.board.w)}×${Math.round(m.board.h)}`);
  if (m.board.w < size.minBoard) errors.push(`доска ${Math.round(m.board.w)}px, нужно ≥ ${size.minBoard}`);
  if (m.sqMax - m.sqMin > 1) errors.push(`клетки разного размера: ${m.sqMin.toFixed(1)}–${m.sqMax.toFixed(1)}px`);
  if (m.clipped) errors.push('доска обрезана (выходит за окно или за родителя с overflow)');
  const sq = m.sqMin;
  const wrong = m.pieces.filter(pc => Math.abs(pc.w - sq) > 2 || Math.abs(pc.h - sq) > 2);
  if (wrong.length) {
    errors.push(`фигуры не в размер клетки (${Math.round(sq)}px): ${wrong.length} шт., например ` +
      wrong.slice(0, 4).map(pc => `${pc.t} ${pc.w}×${pc.h}`).join(', '));
  }
}
function commonErrors(m, errors) {
  if (m.scrollY > 1) errors.push(`страница прокручивается по вертикали на ${m.scrollY}px`);
  if (m.scrollX > 1) errors.push(`страница прокручивается по горизонтали на ${m.scrollX}px`);
  if (m.selects) errors.push(`системные <select>: ${m.selects} шт.`);
  if (m.badText.length) errors.push(`мелкий текст или капс (${m.badText.length}): ${m.badText.slice(0, 6).join('; ')}`);
}
function structureErrors(m, size, pp, errors) {
  if (!STRUCTURE.includes(pp)) return;
  const need = [...COMMON_UI, ...(size.needSession ? [...SESSION_UI, ...(PAGE_UI_SESSION[pp] || [])] : []), ...(PAGE_UI[pp] || [])];
  const missing = need.filter(spec => !spec.split('|').some(n => m.ui[n]));
  if (missing.length) errors.push(`нет блоков (data-ui): ${missing.join(', ')}`);
  if (size.needSession && m.ui.session) {
    const w = Math.round(m.ui.session.w);
    if (w < 270 || w > 290) errors.push(`левая колонка ${w}px, нужно 280`);
  }
  if (m.ui.panel) {
    const pw = Math.round(m.ui.panel.w);
    if (size.w === 1920 && pw < 500) errors.push(`правая панель ${pw}px, нужно ~520`);
    if (size.w === 1920 && m.ui.panel.right < size.w - 26) {
      errors.push(`справа пустое место ${Math.round(size.w - m.ui.panel.right)}px — сетка не на всю ширину`);
    }
    if (m.hasBoard && m.ui['player-top'] && m.ui['player-bottom']) {
      const top = m.ui['player-top'], bot = m.ui['player-bottom'];
      if (top.bottom > m.board.top + 2 || bot.top < m.board.bottom - 2) errors.push('полоски игроков не над и не под доской');
    }
  }
  for (const t of (FORBIDDEN[pp] || [])) {
    if (m.text.includes(t)) errors.push(`старый элемент на странице: «${t}»`);
  }
  const uci = (m.panelText || '').match(/(^|[^a-z0-9])([a-h][1-8][a-h][1-8][qrbn]?)(?![a-z0-9])/);
  if (uci) errors.push(`в панели ход в формате UCI «${uci[2]}» — нужен SAN`);
}

// Замеры страницы (выполняется в браузере)
const MEASURE = () => {
  const res = {};
  const se = document.scrollingElement || document.documentElement;
  res.scrollY = se.scrollHeight - innerHeight;
  res.scrollX = se.scrollWidth - innerWidth;
  res.selects = document.querySelectorAll('select').length;
  res.text = document.body.innerText || '';
  res.panelText = document.querySelector('[data-ui="panel"]')?.innerText || '';

  // Метки data-ui: видимые элементы и их размеры
  res.ui = {};
  for (const el of document.querySelectorAll('[data-ui]')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    res.ui[el.getAttribute('data-ui')] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  }

  const board = document.querySelector('[id$="-board"]');
  res.hasBoard = !!board;
  if (board) {
    const br = board.getBoundingClientRect();
    res.board = { w: br.width, h: br.height, top: br.top, left: br.left, bottom: br.bottom, right: br.right };
    const squares = [...board.querySelectorAll('[id*="-square-"]')];
    res.squareCount = squares.length;
    const dims = squares.map(s => s.getBoundingClientRect());
    res.sqMin = dims.length ? Math.min(...dims.map(r => Math.min(r.width, r.height))) : 0;
    res.sqMax = dims.length ? Math.max(...dims.map(r => Math.max(r.width, r.height))) : 0;
    let clipped = br.bottom > innerHeight + 1 || br.right > innerWidth + 1 || br.top < -1 || br.left < -1;
    let el = board.parentElement;
    while (!clipped && el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/(hidden|clip|auto|scroll)/.test(cs.overflow + ' ' + cs.overflowX + ' ' + cs.overflowY)) {
        const r = el.getBoundingClientRect();
        if (br.bottom > r.bottom + 1 || br.right > r.right + 1 || br.top < r.top - 1 || br.left < r.left - 1) clipped = true;
      }
      el = el.parentElement;
    }
    res.clipped = clipped;
    res.pieces = [...board.querySelectorAll('[data-piece]')].map(pc => {
      const g = pc.querySelector('svg, img') || pc;
      const r = g.getBoundingClientRect();
      return { t: pc.getAttribute('data-piece'), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const toLum = c => {
      const mm = c.match(/\d+(\.\d+)?/g);
      if (!mm) return null;
      const [r, g, b] = mm.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bgs = squares.map(s => getComputedStyle(s).backgroundColor).filter(c => c && c !== 'rgba(0, 0, 0, 0)');
    const uniq = [...new Set(bgs)].map(c => ({ c, l: toLum(c) })).filter(x => x.l !== null).sort((a, b) => a.l - b.l);
    res.colors = uniq.length ? `${uniq[0].c} / ${uniq[uniq.length - 1].c}` : '';
  }

  res.eg = [...document.querySelectorAll('[data-ui="eg-card"]')].map(c => {
    const r = c.getBoundingClientRect();
    const b = c.querySelector('[data-ui="eg-board"]');
    const br = b ? b.getBoundingClientRect() : null;
    const t = c.querySelector('[data-ui="eg-card-title"]');
    const tr = t ? t.getBoundingClientRect() : null;
    return {
      top: r.top, w: r.width, h: r.height, bw: br ? br.width : 0, bh: br ? br.height : 0,
      title: (t?.textContent || '').trim(),
      titleVisible: !!tr && tr.height > 0 && tr.bottom <= r.bottom + 1 && tr.top >= r.top - 1,
    };
  });
  res.egGridRight = document.querySelector('[data-ui="eg-grid"]')?.getBoundingClientRect().right || 0;
  // v3.8: колонки сетки каталога, статусы карточек, тексты меток, пункты меню без иконок
  const grid = document.querySelector('[data-ui="eg-grid"]');
  const gtc = grid ? getComputedStyle(grid).gridTemplateColumns : '';
  res.egCols = gtc && gtc !== 'none' ? gtc.split(' ').filter(Boolean).length : 0;
  res.egStatus = [...document.querySelectorAll('[data-ui="eg-card"]')].map(c => c.getAttribute('data-status') || '');
  res.uiText = {};
  for (const el of document.querySelectorAll('[data-ui]')) {
    const k = el.getAttribute('data-ui');
    if (!(k in res.uiText) && el.getBoundingClientRect().width > 0) res.uiText[k] = el.innerText || '';
  }
  const navLinks = [...document.querySelectorAll('.app-sidebar .app-sidebar-link')].filter(a => a.getBoundingClientRect().width > 0);
  res.navCount = navLinks.length;
  res.navNoIcon = navLinks.filter(a => !a.querySelector('svg')).map(a => (a.textContent || '').trim());
  const bad = [];
  const skip = el => el.closest('[id$="-board"], .app-topbar, .app-sidebar, .app-bottom-bar, .app-sidebar-overlay, [data-allow-small]');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const txt = (node.textContent || '').trim();
    if (!txt) continue;
    const el = node.parentElement;
    if (!el || skip(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const fs = parseFloat(cs.fontSize);
    if (fs < 13) bad.push(`${fs}px «${txt.slice(0, 40)}»`);
    else if (cs.textTransform === 'uppercase' && parseFloat(cs.letterSpacing || '0') > 0.5) bad.push(`капс «${txt.slice(0, 40)}»`);
  }
  res.badText = [...new Set(bad)];
  return res;
      };

const browser = await chromium.launch();
try {
  for (const size of (ANSWERS_ONLY ? [] : SIZES)) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
    const page = await ctx.newPage();
    colorsBySize[size.w] = {};

    for (const p of PAGES) {
      const label = `${size.w}×${size.h} ${p}`;
      const errors = [];
      try {
        await page.goto(base + p, { waitUntil: 'networkidle', timeout: 30000 });
      } catch {
        await page.goto(base + p, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      }
      await page.waitForSelector('[id$="-board"]', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(900);

      const m = await page.evaluate(MEASURE);

      // ── Техника ────────────────────────────────────────────────────────────
      const listKey = listKeyOf(pathOf(p));
      if (listKey) {
        listErrors(m, size, listKey, p, errors);
      } else {
        boardErrors(m, size, errors);
        if (m.hasBoard) colorsBySize[size.w][p] = m.colors;
      }
      commonErrors(m, errors);

      // ── Структура (только для STRUCTURE) ───────────────────────────────────
      structureErrors(m, size, structKey(p), errors);

      // v3.8: иконки в меню — один раз на размер окна
      if (!navChecked[size.w] && m.navCount) {
        navChecked[size.w] = true;
        report.push({ label: `${size.w}×${size.h} меню`, errors: m.navNoIcon.length ? [`у пунктов меню нет иконки: ${m.navNoIcon.join(', ')} (NavIcon.tsx)`] : [], board: 0 });
      }

      const dir = path.join(OUT, `${size.w}x${size.h}`);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, slug(p) + '.png') });
      report.push({ label, errors, board: m.hasBoard ? Math.round(m.board.w) : 0 });

      // v3.8: каталог → клик по карточке → тренажёр (структура как у тренажёра)
      const L = listKey && LIST_PAGES[listKey];
      if (L && L.open && size.w === 1920) {
        const e2 = [];
        const card = await page.$(L.open.click);
        if (!card) e2.push('нет карточки для перехода');
        else {
          await card.click();
          await page.waitForSelector('[id$="-board"]', { timeout: 15000 }).catch(() => e2.push('после клика по карточке не открылся тренажёр с доской'));
          await page.waitForTimeout(1200);
          const m2 = await page.evaluate(MEASURE);
          const key = /demo=1/.test(p) ? L.open.demoAs : L.open.as;
          boardErrors(m2, size, e2);
          commonErrors(m2, e2);
          structureErrors(m2, size, key, e2);
          await page.screenshot({ path: path.join(dir, slug(p) + '_open.png') });
        }
        report.push({ label: `${size.w}×${size.h} ${p} → клик по карточке`, errors: e2, board: 0 });
      }
    }
    await ctx.close();
  }
  // ── v3: ответы на демо-позициях и объяснения на доске ───────────────────
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 950 } });
  const page = await ctx.newPage();
  for (const flow of (NO_ANSWERS ? [] : ANSWER_FLOWS.filter(f => !EXPLICIT || PAGES.some(pg => pathOf(pg) === pathOf(f.url))))) {
    const label = `1920×950 ${flow.url} → ${flow.title || 'ответ'}${flow.key ? ` «${flow.key}»` : ''}`;
    const errors = [];
    try {
      await page.goto(base + flow.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(base + flow.url, { waitUntil: 'load', timeout: 30000 }));
      await page.waitForSelector('[id$="-board"]', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(900);
      const demo = await page.evaluate(() => document.querySelector('[data-ui="panel"]')?.getAttribute('data-demo') || '');
      if (demo !== flow.demo) {
        errors.push(`демо-режим не сделан: у [data-ui="panel"] нет data-demo="${flow.demo}" (BOARD-EXPLAIN.md, раздел 4)`);
      } else {
        await flow.answer(page);
        const ok = await page.waitForSelector(`[data-ui="${flow.wait}"]`, { timeout: 10000 }).then(() => true).catch(() => false);
        if (!ok) errors.push(`после ответа не появился блок data-ui="${flow.wait}"`);
        await page.waitForTimeout(900);
        const o = await readOverlay(page);
        checkOverlay(o, flow.expect, errors, '');
        for (const t of (flow.forbidden || [])) if (o.panelText.includes(t)) errors.push(`старый текст в ответе: «${t}»`);
        const dir = path.join(OUT, '1920x950');
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${flow.name}_answer.png`) });
        for (const h of (flow.hover || [])) {
          const el = await page.$(h.sel);
          if (!el) { errors.push(`нет элемента для наведения ${h.sel}`); continue; }
          await el.hover();
          await page.waitForTimeout(400);
          const oh = await readOverlay(page);
          checkOverlay(oh, h, errors, `при наведении на ${h.sel}: `);
          await page.screenshot({ path: path.join(dir, `${flow.name}_hover_${h.shot}.png`) });
          await page.mouse.move(4, 4);
          await page.waitForTimeout(400);
          const ob = await readOverlay(page);
          checkOverlay(ob, { roles: flow.expect.roles, fen: flow.expect.fen }, errors, `после ухода мыши с ${h.sel} доска не вернулась: `);
        }
        for (const st of (flow.steps || [])) {
          const what = st.name || (st.click ? `клика по ${st.click}` : `клавиши ${st.key}`);
          try {
            if (st.act) await st.act(page);
            else if (st.click) {
              const el = await page.$(st.click);
              if (!el) { errors.push(`нет кнопки ${st.click}`); break; }
              await el.click();
            } else {
              await page.mouse.move(4, 4);
              await page.keyboard.press(st.key);
            }
          } catch (e) { errors.push(`во время ${what}: ${e.message.split('\n')[0]}`); break; }
          if (st.waitFen && !(await waitPlacement(page, st.waitFen, st.timeout || 7000))) errors.push(`после ${what}: на доске не появилась позиция ${st.waitFen}`);
          if (st.waitUi && !(await page.waitForSelector(`[data-ui="${st.waitUi}"]`, { timeout: st.timeout || 7000 }).then(() => true).catch(() => false))) errors.push(`после ${what}: не появился блок data-ui="${st.waitUi}"`);
          await page.waitForTimeout(st.pause ?? 700);
          const os = await readOverlay(page);
          checkOverlay(os, st, errors, `после ${what}: `);
          if (st.shot) await page.screenshot({ path: path.join(dir, `${flow.name}_${st.shot}.png`) });
        }
        if (flow.play) {
          const btn = await page.$(flow.play.click);
          if (!btn) errors.push(`нет кнопки ▶ ${flow.play.click} (FIX-ANSWER.md, раздел 5)`);
          else {
            await btn.click();
            const t0 = Date.now(), seen = []; let stepBar = false;
            while (Date.now() - t0 < 5000) {
              const r = await page.evaluate(() => ({
                fen: document.querySelector('[data-board-fen]')?.getAttribute('data-board-fen') || '',
                bar: !!document.querySelector('[data-ui="sac-step"]'),
              }));
              const pl = r.fen.split(' ')[0];
              if (!seen.length || seen[seen.length - 1].pl !== pl) seen.push({ pl, t: Date.now() - t0 });
              stepBar = stepBar || r.bar;
              await page.waitForTimeout(80);
            }
            const idx = flow.play.seq.map(pl => seen.findIndex(x => x.pl === pl));
            const missing = idx.map((v, i) => v < 0 ? i + 1 : 0).filter(Boolean);
            if (missing.length) errors.push(`после ▶ на доске не было позиций после ходов ${missing.join(', ')} — вариант должен проигрываться по ходу (видели ${seen.length} позиций)`);
            else if (idx.some((v, i) => i && v < idx[i - 1])) errors.push('после ▶ ходы шли не по порядку');
            else {
              const span = seen[idx[idx.length - 1]].t - seen[idx[0]].t;
              if (span < 1500) errors.push(`после ▶ вариант проигран за ${span} мс — слишком быстро, нужно ~900 мс на ход`);
            }
            if (!stepBar) errors.push('во время проигрывания нет строки data-ui="sac-step"');
            await page.screenshot({ path: path.join(dir, `${flow.name}_play_end.png`) });
            await page.mouse.move(4, 4);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(600);
            const oe = await readOverlay(page);
            checkOverlay(oe, { fen: flow.play.after, noUi: ['sac-step'] }, errors, 'после Esc в конце проигрывания: ');
          }
        }
      }
    } catch (e) {
      errors.push('ошибка проверки: ' + e.message.split('\n')[0]);
    }
    report.push({ label, errors, board: 0 });
  }
  await ctx.close();
} finally {
  await browser.close();
}

const colorErrors = [];
for (const [w, map] of Object.entries(colorsBySize)) {
  const vals = [...new Set(Object.values(map).filter(Boolean))];
  if (vals.length > 1) colorErrors.push(`${w}px: разные цвета доски — ` + Object.entries(map).map(([p, c]) => `${p}: ${c}`).join(' | '));
}

let fails = 0;
console.log('\nПроверка дизайна тренажёров (v4.0)\n');
for (const r of report) {
  if (r.errors.length) {
    fails++;
    console.log(`✗ ${r.label}${r.board ? `  (доска ${r.board}px)` : ''}`);
    for (const e of r.errors) console.log(`    – ${e}`);
  } else {
    console.log(`✓ ${r.label}${r.board ? `  (доска ${r.board}px)` : ''}`);
  }
}
for (const e of colorErrors) { fails++; console.log(`✗ ${e}`); }
console.log(`\nСтраниц с ошибками: ${fails}. Скриншоты: ${path.relative(process.cwd(), OUT)}/\n`);
process.exit(fails ? 1 : 0);
