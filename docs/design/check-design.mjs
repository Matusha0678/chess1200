#!/usr/bin/env node
// Автопроверка страниц-тренажёров Chess 1200 (см. DESIGN-SPEC.md, раздел 14).
//
// Запуск (dev-сервер должен работать):
//   node docs/design/check-design.mjs                       # http://localhost:3001, все тренажёры
//   node docs/design/check-design.mjs http://localhost:3001 /mistakes /threats /sac
//
// Скриншоты: docs/design/shots/<окно>/<страница>.png
// Код выхода: 0 — всё хорошо, 1 — есть ошибки.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const base = args[0] && /^(https?|file):/.test(args[0]) ? args.shift().replace(/\/$/, '') : 'http://localhost:3001';
const PAGES = args.length ? args : [
  '/mistakes', '/threats', '/sac', '/endgames', '/guess-opening', '/traps',
  '/plans', '/evaluate', '/warmup', '/openings/random',
];
const SIZES = [
  { w: 1920, h: 950, minBoard: 760 },
  { w: 1440, h: 800, minBoard: 620 },
];
const OUT = path.resolve('docs/design/shots');

const report = [];
const colorsBySize = {};

function slug(p) {
  return (p.replace(/^\//, '').replace(/[\/?#=&]+/g, '_') || 'root');
}

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
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
      await page.waitForTimeout(900); // анимации и шрифты

      const m = await page.evaluate(() => {
        const res = {};
        const se = document.scrollingElement || document.documentElement;
        res.scrollY = se.scrollHeight - innerHeight;
        res.scrollX = se.scrollWidth - innerWidth;
        res.selects = document.querySelectorAll('select').length;

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

          // Обрезка: доска выходит за окно или за предка с overflow != visible
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

          // Фигуры: svg/img внутри [data-piece] должны быть размером с клетку
          res.pieces = [...board.querySelectorAll('[data-piece]')].map(pc => {
            const g = pc.querySelector('svg, img') || pc;
            const r = g.getBoundingClientRect();
            return { t: pc.getAttribute('data-piece'), w: Math.round(r.width), h: Math.round(r.height) };
          });

          // Цвета клеток: самая светлая и самая тёмная (по яркости)
          const toLum = c => {
            const m = c.match(/\d+(\.\d+)?/g);
            if (!m) return null;
            const [r, g, b] = m.map(Number);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const bgs = squares.map(s => getComputedStyle(s).backgroundColor).filter(c => c && c !== 'rgba(0, 0, 0, 0)');
          const uniq = [...new Set(bgs)].map(c => ({ c, l: toLum(c) })).filter(x => x.l !== null).sort((a, b) => a.l - b.l);
          res.colors = uniq.length ? `${uniq[0].c} / ${uniq[uniq.length - 1].c}` : '';
        }

        // Мелкий текст и капс с разрядкой (кроме доски, меню сайта и data-allow-small)
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
          const ex = wrong.slice(0, 4).map(pc => `${pc.t} ${pc.w}×${pc.h}`).join(', ');
          errors.push(`фигуры не в размер клетки (${Math.round(sq)}px): ${wrong.length} шт., например ${ex}`);
        }
        colorsBySize[size.w][p] = m.colors;
      }
      if (m.scrollY > 1) errors.push(`страница прокручивается по вертикали на ${m.scrollY}px`);
      if (m.scrollX > 1) errors.push(`страница прокручивается по горизонтали на ${m.scrollX}px`);
      if (m.selects) errors.push(`системные <select>: ${m.selects} шт.`);
      if (m.badText.length) errors.push(`мелкий текст или капс (${m.badText.length}): ${m.badText.slice(0, 6).join('; ')}`);

      const dir = path.join(OUT, `${size.w}x${size.h}`);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, slug(p) + '.png') });

      report.push({ label, errors, board: m.hasBoard ? Math.round(m.board.w) : 0 });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

// Цвета доски одинаковые на всех страницах
const colorErrors = [];
for (const [w, map] of Object.entries(colorsBySize)) {
  const vals = [...new Set(Object.values(map).filter(Boolean))];
  if (vals.length > 1) {
    colorErrors.push(`${w}px: разные цвета доски — ` + Object.entries(map).map(([p, c]) => `${p}: ${c}`).join(' | '));
  }
}

let fails = 0;
console.log('\nПроверка дизайна тренажёров\n');
for (const r of report) {
  if (r.errors.length) {
    fails++;
    console.log(`✗ ${r.label}  (доска ${r.board}px)`);
    for (const e of r.errors) console.log(`    – ${e}`);
  } else {
    console.log(`✓ ${r.label}  (доска ${r.board}px)`);
  }
}
for (const e of colorErrors) { fails++; console.log(`✗ ${e}`); }
console.log(`\nСтраниц с ошибками: ${fails}. Скриншоты: ${path.relative(process.cwd(), OUT)}/\n`);
process.exit(fails ? 1 : 0);
