#!/usr/bin/env node
/**
 * Эталон библиотек для будущих страниц (NIGHT.md, задача 6).
 * Запуск из корня проекта: node docs/night/night-ref.cjs   → должно быть «все тесты: OK».
 * Перенеси в TypeScript: src/lib/clock.ts, src/lib/game-insights.ts, src/lib/convert-positions.ts, src/lib/lichess-puzzles.ts.
 */
const path = require('path');
let Chess;
try { ({ Chess } = require(path.join(process.cwd(), 'node_modules/chess.js'))); }
catch { ({ Chess } = require('chess.js')); }

// ── clock.ts ────────────────────────────────────────────────────────────────
/** Остаток времени (сек) после каждого полухода — из комментариев {[%clk 0:09:58.5]} PGN chess.com. */
function parseClocks(pgn) {
  const out = []; const re = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g; let m;
  while ((m = re.exec(pgn))) out.push(+m[1] * 3600 + +m[2] * 60 + +m[3]);
  return out;
}
/** [TimeControl "600+5"] → { base: 600, inc: 5 }; "600" → inc 0; дневные ("1/86400") → null. */
function parseTimeControl(pgn) {
  const m = pgn.match(/\[TimeControl\s+"(\d+)(?:\+(\d+))?"\]/);
  return m ? { base: +m[1], inc: m[2] ? +m[2] : 0 } : null;
}
/** Сколько секунд ушло на каждый полуход: своё прошлое время − текущее + добавка. */
function timeSpent(clocks, tc) {
  return clocks.map((c, i) => Math.max(0, +((i >= 2 ? clocks[i - 2] : tc.base) - c + tc.inc).toFixed(1)));
}

// ── game-insights.ts ────────────────────────────────────────────────────────
// rows — строки game_analysis одной партии: { move_number, color:'w'|'b', san, fen_before, eval_before, eval_after,
//        classification, win_before, win_after (шанс белых 0–1), loss (потеря шансов ходившего 0–1) }
function detectPhase(fen, moveNumber) {           // как detectPhase в src/lib/mistakes.ts
  if (moveNumber <= 6) return 'opening';
  let n = 0; for (const row of new Chess(fen).board()) for (const sq of row) if (sq && sq.type !== 'p' && sq.type !== 'k') n++;
  return n <= 6 ? 'endgame' : 'middlegame';
}
const plyOf = r => (r.move_number - 1) * 2 + (r.color === 'w' ? 0 : 1);
const mine = (rows, C) => rows.filter(r => r.color === C).sort((a, b) => a.move_number - b.move_number);
const myWin = (r, C) => (C === 'w' ? +r.win_before : 1 - +r.win_before);
const myWinAfter = (r, C) => (C === 'w' ? +r.win_after : 1 - +r.win_after);

/**
 * Итоги одной партии для «Где я теряю очки».
 * decisive — переломный ход: первый мой ход, после которого шанс упал с ≥ 0.40 до ≤ 0.25;
 *            нет такого и партия проиграна — мой ход с наибольшей потерей (если потеря ≥ 0.10); победа — null.
 * missedWin — два моих хода подряд с шансом ≥ 0.75, а партия не выиграна.
 */
function gameInsight({ color, result, pgn }, rows) {
  const C = color === 'white' ? 'w' : 'b';
  const my = mine(rows, C);
  const clocks = parseClocks(pgn || ''); const tc = parseTimeControl(pgn || '');
  const spent = tc && clocks.length ? timeSpent(clocks, tc) : [];
  let d = null;
  if (result !== 'win') {
    d = my.find(r => myWin(r, C) >= 0.40 && myWinAfter(r, C) <= 0.25) || null;
    if (!d && result === 'loss') { const m = [...my].sort((a, b) => +b.loss - +a.loss)[0]; if (m && +m.loss >= 0.10) d = m; }
  }
  const decisive = d && {
    moveNumber: d.move_number, san: d.san, phase: detectPhase(d.fen_before, d.move_number), loss: +d.loss, cls: d.classification,
    clockLeft: clocks.length > plyOf(d) ? clocks[plyOf(d)] : null,
  };
  let missedWin = false;
  for (let i = 0; i + 1 < my.length; i++) if (myWin(my[i], C) >= 0.75 && myWin(my[i + 1], C) >= 0.75) { missedWin = result !== 'win'; break; }
  const errorsByPhase = { opening: 0, middlegame: 0, endgame: 0 };
  const timeByPhase = { opening: [], middlegame: [], endgame: [] };
  for (const r of my) {
    const ph = detectPhase(r.fen_before, r.move_number);
    if (r.classification === 'mistake' || r.classification === 'blunder') errorsByPhase[ph]++;
    if (spent.length > plyOf(r)) timeByPhase[ph].push(spent[plyOf(r)]);
  }
  const avg = a => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : null);
  return {
    myColor: C, result, decisive, missedWin,
    maxMyWin: my.length ? Math.max(...my.map(r => myWin(r, C))) : null,
    errorsByPhase,
    timeTrouble: !!(decisive && decisive.clockLeft != null && decisive.clockLeft < 60),
    avgTimeByPhase: { opening: avg(timeByPhase.opening), middlegame: avg(timeByPhase.middlegame), endgame: avg(timeByPhase.endgame) },
  };
}

// ── convert-positions.ts ────────────────────────────────────────────────────
/** «Дожми свою партию»: первая позиция, где у меня два хода подряд шанс ≥ 0.75, а партия не выиграна. */
function findConvertPosition({ color, result }, rows) {
  if (result === 'win') return null;
  const C = color === 'white' ? 'w' : 'b'; const my = mine(rows, C);
  for (let i = 0; i + 1 < my.length; i++) {
    if (myWin(my[i], C) >= 0.75 && myWin(my[i + 1], C) >= 0.75) {
      return { fen: my[i].fen_before, moveNumber: my[i].move_number, myColor: C, myWin: +myWin(my[i], C).toFixed(3), evalCp: my[i].eval_before };
    }
  }
  return null;
}

// ── lichess-puzzles.ts ──────────────────────────────────────────────────────
/**
 * Задача из ответа /api/puzzle/batch/{angle}: game.pgn — ходы SAN до задачи включительно (initialPly + 1 полуходов).
 * Последний ход pgn делает соперник — его показываем анимацией; потом решает сторона, чей ход. solution — UCI, ходы решающего на чётных местах.
 */
function parsePuzzle(p) {
  const sans = p.game.pgn.trim().split(/\s+/);
  if (p.puzzle.initialPly + 1 !== sans.length) throw new Error(`initialPly ${p.puzzle.initialPly} не совпадает с pgn (${sans.length} полуходов)`);
  const ch = new Chess();
  for (const s of sans.slice(0, -1)) ch.move(s);
  const fenStart = ch.fen();
  const last = ch.move(sans[sans.length - 1]);
  const fen = ch.fen();
  const check = new Chess(fen);
  for (const u of p.puzzle.solution) check.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); // бросит, если ход невозможен
  return {
    id: p.puzzle.id, rating: p.puzzle.rating, plays: p.puzzle.plays, themes: p.puzzle.themes,
    fenStart, lastMoveUci: last.from + last.to + (last.promotion || ''), fen, solverColor: ch.turn(), solution: p.puzzle.solution,
  };
}

// ── тесты ───────────────────────────────────────────────────────────────────
if (require.main === module) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let fails = 0;
  const t = (name, got, want) => { const ok = eq(got, want); if (!ok) fails++; console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    получили ${JSON.stringify(got)}\n    нужно    ${JSON.stringify(want)}`}`); };

  const PGN = '[Event "Live Chess"]\n[TimeControl "600"]\n\n1. e4 {[%clk 0:09:58.5]} 1... e5 {[%clk 0:09:57.1]} 2. Nf3 {[%clk 0:09:50]} 2... Nc6 {[%clk 0:09:40.2]} *';
  t('parseClocks', parseClocks(PGN), [598.5, 597.1, 590, 580.2]);
  t('parseTimeControl 600', parseTimeControl(PGN), { base: 600, inc: 0 });
  t('parseTimeControl 180+2', parseTimeControl('[TimeControl "180+2"]'), { base: 180, inc: 2 });
  t('parseTimeControl daily', parseTimeControl('[TimeControl "1/86400"]'), null);
  t('timeSpent', timeSpent([598.5, 597.1, 590, 580.2], { base: 600, inc: 0 }), [1.5, 2.9, 8.5, 16.9]);
  t('timeSpent +5', timeSpent([598.5, 597.1, 590, 580.2], { base: 600, inc: 5 }), [6.5, 7.9, 13.5, 21.9]);

  // синтетическая партия белыми: был выигрыш (+), потом зевок на 20-м ходу при 0:45 на часах, поражение
  const F_MID = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 9';   // миттельшпиль
  const F_END = '8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40';                              // эндшпиль
  const rows = [
    { move_number: 18, color: 'w', san: 'Nd5', fen_before: F_MID, eval_before: 320, eval_after: 330, classification: 'best', win_before: 0.76, win_after: 0.77, loss: 0.0 },
    { move_number: 18, color: 'b', san: 'Rc8', fen_before: F_MID, eval_before: 330, eval_after: 340, classification: 'good', win_before: 0.77, win_after: 0.78, loss: 0.01 },
    { move_number: 19, color: 'w', san: 'Qe2', fen_before: F_MID, eval_before: 340, eval_after: 300, classification: 'good', win_before: 0.78, win_after: 0.75, loss: 0.03 },
    { move_number: 19, color: 'b', san: 'Qc7', fen_before: F_MID, eval_before: 300, eval_after: 300, classification: 'best', win_before: 0.75, win_after: 0.75, loss: 0.0 },
    { move_number: 20, color: 'w', san: 'Rd1', fen_before: F_MID, eval_before: 300, eval_after: -450, classification: 'blunder', win_before: 0.75, win_after: 0.16, loss: 0.59 },
    { move_number: 40, color: 'w', san: 'Rd7', fen_before: F_END, eval_before: -500, eval_after: -520, classification: 'good', win_before: 0.14, win_after: 0.13, loss: 0.01 },
  ];
  const pgnClk = '[TimeControl "600"]\n\n' + Array.from({ length: 80 }, (_, i) => `{[%clk 0:0${i < 38 ? 5 : 0}:${String(i < 38 ? 30 : 45).padStart(2, '0')}]}`).join(' ');
  const g = gameInsight({ color: 'white', result: 'loss', pgn: pgnClk }, rows);
  t('decisive', g.decisive, { moveNumber: 20, san: 'Rd1', phase: 'middlegame', loss: 0.59, cls: 'blunder', clockLeft: 45 });
  t('missedWin', g.missedWin, true);
  t('timeTrouble', g.timeTrouble, true);
  t('errorsByPhase', g.errorsByPhase, { opening: 0, middlegame: 1, endgame: 0 });
  t('convert', findConvertPosition({ color: 'white', result: 'loss' }, rows), { fen: F_MID, moveNumber: 18, myColor: 'w', myWin: 0.76, evalCp: 320 });
  t('convert: победа → null', findConvertPosition({ color: 'white', result: 'win' }, rows), null);
  // та же партия чёрными (их ходы): шанс чёрных = 1 − win_before
  const gb = gameInsight({ color: 'black', result: 'win', pgn: '' }, rows);
  t('чёрные выиграли: decisive null', gb.decisive, null);

  // задача из документации Lichess (puzzles-getMultiplePuzzlesAtOnce)
  const P = {
    game: { pgn: 'e4 c5 c3 e6 d4 d5 dxc5 Bxc5 exd5 exd5 Bb5+ Nc6 Nf3 Nf6 O-O O-O Bg5 h6 Bh4 a6 Bd3 Bg4 h3 Bh5 Nbd2 Re8 Qb3 b5 a4 Na5 Qc2 Nc4 b3 Ne5 Nxe5 Rxe5 axb5 axb5 Rxa8 Qxa8 Bxf6 gxf6 Bxb5 Rg5 Re1 Qb7 Be2 Bxe2 Rxe2 d4 Ne4 Rg6 f3' },
    puzzle: { id: '0haqU', rating: 1167, plays: 24912, solution: ['d4d3', 'e4c5', 'd3c2', 'c5b7', 'c2c1q'], themes: ['endgame', 'advancedPawn', 'crushing', 'long', 'promotion', 'discoveredAttack'], initialPly: 52 },
  };
  const pz = parsePuzzle(P);
  t('puzzle fen', pz.fen, '6k1/1q3p2/5prp/2b5/3pN3/1PP2P1P/2Q1R1P1/6K1 b - - 0 27');
  t('puzzle lastMove + solver', [pz.lastMoveUci, pz.solverColor], ['f2f3', 'b']);
  console.log(fails ? `\nОШИБОК: ${fails}` : '\nвсе тесты: OK');
  process.exit(fails ? 1 : 0);
}

module.exports = { parseClocks, parseTimeControl, timeSpent, gameInsight, findConvertPosition, parsePuzzle };
