#!/usr/bin/env node
// Автопроверка страниц-тренажёров Chess 1200 (DESIGN-SPEC.md, раздел 14; pages/README.md).
// Версия 2: + проверка структуры (метки data-ui), левая колонка видна, правая панель на всю ширину,
//           запрещённые старые элементы.
// Версия 3: + ответы на демо-позициях (pages/BOARD-EXPLAIN.md): значки, стрелки, наведение, тексты.
//
// Запуск (dev-сервер должен работать):
//   node docs/design/check-design.mjs                                  # http://localhost:3001, все тренажёры + ответы
//   node docs/design/check-design.mjs http://localhost:3001 /mistakes /threats /sac
//   node docs/design/check-design.mjs --answers-only                   # только ответы (быстро)
//
// Скриншоты: docs/design/shots/<окно>/<страница>.png
// Код выхода: 0 — всё хорошо, 1 — есть ошибки.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const rawArgs = process.argv.slice(2);
const ANSWERS_ONLY = rawArgs.includes('--answers-only');
const args = rawArgs.filter(a => a !== '--answers-only');
const base = args[0] && /^(https?|file):/.test(args[0]) ? args.shift().replace(/\/$/, '') : 'http://localhost:3001';
const PAGES = args.length ? args : [
  '/mistakes', '/threats', '/sac', '/endgames', '/guess-opening', '/traps',
  '/plans', '/evaluate', '/warmup', '/openings/random',
];
const SIZES = [
  { w: 1920, h: 950, minBoard: 760, needSession: true },
  { w: 1440, h: 800, minBoard: 620, needSession: false },
];

// Страницы, у которых проверяется структура (метки data-ui). Остальные — только техника.
const STRUCTURE = ['/mistakes', '/threats', '/sac'];
const COMMON_UI = ['player-top', 'player-bottom', 'panel', 'panel-header', 'panel-title', 'panel-actions'];
const SESSION_UI = ['session', 'session-stats', 'session-list'];
// «a|b» — достаточно любой из меток (разные состояния страницы)
const PAGE_UI = {
  '/threats': ['threat-task|threat-card', 'threat-rules|threat-marks', 'threat-marked|threat-defense'],
  '/sac': [
    'sac-offer|sac-feedback|sac-empty|sac-prep-progress',
    'sac-weigh|sac-gave-got|sac-empty|sac-prep-progress',
    'sac-choice|sac-feedback|sac-empty|sac-prep-progress',
  ],
};
// Старые элементы, которых быть не должно
const FORBIDDEN = {
  '/threats': ['XP заработано', '← Сегодня'],
  '/sac': ['← Мастера', 'В стиле Таля', 'Следующая позиция', 'Подготовить позиции →'],
};

// v3: ответы на демо-позициях (BOARD-EXPLAIN.md). Роли стрелок — data-role у [data-ui="board-arrow"].
const SAC_FORBIDDEN_ANSWER = ['Правильно!', 'Оценка до', 'Оценка после', 'реальная жертва', 'ложная жертва', 'Компенсация достаточна'];
const clickSquare = async (page, sq) => {
  const id = await page.getAttribute('[id$="-board"]', 'id');
  await page.click(`[id="${id.slice(0, -'-board'.length)}-square-${sq}"]`);
};
const ANSWER_FLOWS = [
  { url: '/sac?demo=works', demo: 'works', name: 'sac_demo_works', wait: 'sac-feedback',
    answer: async page => { await page.keyboard.press('1'); },
    expect: {
      badges: ['brilliant'], roles: { plan: 1 }, check: true,
      ui: ['eval-bar', 'sac-feedback', 'sac-gave-got', 'sac-eval-no', 'sac-eval-after', 'sac-line'],
      text: { 'sac-gave-got': ['Отдал', 'Получил'], 'sac-eval-no': ['без жертвы'], 'sac-eval-after': ['после'] },
      result: { 'sac-feedback': 'works' },
    },
    forbidden: SAC_FORBIDDEN_ANSWER,
    hover: [
      { sel: '[data-ui="sac-line"]', shot: 'line', roles: { 'line-opp|line-me': 2 }, labels: ['1', '2'] },
      { sel: '[data-ui="sac-eval-no"]', shot: 'nosac', roles: { best: 1 } },
    ] },
  { url: '/sac?demo=fails', demo: 'fails', name: 'sac_demo_fails', wait: 'sac-feedback',
    answer: async page => { await page.keyboard.press('1'); },
    expect: {
      badges: ['blunder|mistake'], roles: { threat: 1 }, check: true,
      ui: ['eval-bar', 'sac-feedback', 'sac-gave-got', 'sac-eval-no', 'sac-eval-after', 'sac-line'],
      text: { 'sac-gave-got': ['Отдал', 'Получил', 'ничего'] },
      result: { 'sac-feedback': 'fails' },
    },
    forbidden: SAC_FORBIDDEN_ANSWER,
    hover: [{ sel: '[data-ui="sac-eval-no"]', shot: 'nosac', roles: { best: 1 } }] },
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
      if (!m.hasBoard) {
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
      const pp = pathOf(p);
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
  for (const flow of ANSWER_FLOWS) {
    const label = `1920×950 ${flow.url} → ответ`;
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
        await page.waitForTimeout(700);
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
          checkOverlay(ob, { roles: flow.expect.roles }, errors, `после ухода мыши с ${h.sel} доска не вернулась: `);
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
console.log('\nПроверка дизайна тренажёров (v3)\n');
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
