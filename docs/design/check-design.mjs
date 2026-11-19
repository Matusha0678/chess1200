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
//
// Запуск (dev-сервер должен работать):
//   node docs/design/check-design.mjs                                  # http://localhost:3001, все тренажёры + ответы
//   node docs/design/check-design.mjs http://localhost:3001 /mistakes /threats /sac
//   node docs/design/check-design.mjs --answers-only                   # только ответы (быстро)
//   node docs/design/check-design.mjs http://localhost:3001 /endgames --no-answers   # одна страница, без ответов
//   node docs/design/check-design.mjs http://localhost:3001 /repertoire               # страница + её демо
//
// Скриншоты: docs/design/shots/<окно>/<страница>.png
// Код выхода: 0 — всё хорошо, 1 — есть ошибки.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

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
];
const SIZES = [
  { w: 1920, h: 950, minBoard: 760, needSession: true },
  { w: 1440, h: 800, minBoard: 620, needSession: false },
];

// Страницы, у которых проверяется структура (метки data-ui). Остальные — только техника.
const STRUCTURE = ['/mistakes', '/threats', '/sac', '/play', '/repertoire', '/stats', '/tactics', '/blind'];
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
};
// Старые элементы, которых быть не должно
const FORBIDDEN = {
  '/play': ['Оценка · выкл', 'Оценка · вкл', 'Начать заново', 'Играть с позиции', 'Главные потери', 'Выбери фору'],
  '/threats': ['XP заработано', '← Сегодня'],
  '/sac': ['← Мастера', 'В стиле Таля', 'Следующая позиция', 'Подготовить позиции →'],
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
const ANSWER_FLOWS = [
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

      const m = await page.evaluate(() => {
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
      });

      // ── Техника ────────────────────────────────────────────────────────────
      const listKey = listKeyOf(pathOf(p));
      if (listKey) {
        const L = LIST_PAGES[listKey];
        const missing = L.ui.filter(k => !m.ui[k]);
        if (missing.length) errors.push(`нет блоков (data-ui): ${missing.join(', ')}`);
        if (m.eg.length) {
          const row1 = m.eg.filter(c => Math.abs(c.top - m.eg[0].top) < 3).length;
          const need = L.minCols[size.w] || 3;
          if (row1 < need) errors.push(`в первом ряду ${row1} карточек, нужно ≥ ${need}`);
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
      } else if (!m.hasBoard) {
        errors.push('нет доски ([id$="-board"]) — страница не переведена на Board?');
      } else {
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
        colorsBySize[size.w][p] = m.colors;
      }
      if (m.scrollY > 1) errors.push(`страница прокручивается по вертикали на ${m.scrollY}px`);
      if (m.scrollX > 1) errors.push(`страница прокручивается по горизонтали на ${m.scrollX}px`);
      if (m.selects) errors.push(`системные <select>: ${m.selects} шт.`);
      if (m.badText.length) errors.push(`мелкий текст или капс (${m.badText.length}): ${m.badText.slice(0, 6).join('; ')}`);

      // ── Структура (только для STRUCTURE) ───────────────────────────────────
      const pp = pathOf(p).replace(/\.html$/, '');
      if (STRUCTURE.includes(pp)) {
        const need = [...COMMON_UI, ...(size.needSession ? SESSION_UI : []), ...(PAGE_UI[pp] || [])];
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

      const dir = path.join(OUT, `${size.w}x${size.h}`);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, slug(p) + '.png') });
      report.push({ label, errors, board: m.hasBoard ? Math.round(m.board.w) : 0 });
    }
    await ctx.close();
  }
  // ── v3: ответы на демо-позициях и объяснения на доске ───────────────────
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 950 } });
  const page = await ctx.newPage();
  for (const flow of (NO_ANSWERS ? [] : ANSWER_FLOWS.filter(f => !EXPLICIT || PAGES.includes(pathOf(f.url))))) {
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
          const what = st.click ? `клика по ${st.click}` : `клавиши ${st.key}`;
          if (st.click) {
            const el = await page.$(st.click);
            if (!el) { errors.push(`нет кнопки хода ${st.click} (FIX-ANSWER.md, раздел 4)`); break; }
            await el.click();
          } else {
            await page.mouse.move(4, 4);
            await page.keyboard.press(st.key);
          }
          await page.waitForTimeout(700);
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
console.log('\nПроверка дизайна тренажёров (v3.7)\n');
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
