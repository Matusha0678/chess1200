#!/usr/bin/env node
/**
 * Эталон логики «Ловушек», «Идей позиций» и «Дебютного спринта» (TRAPS.md, IDEAS.md, SPRINT.md).
 * Запуск из корня проекта: node docs/design/pages/pages2-ref.cjs   → «все тесты: OK».
 * Нужен пакет дебютов: берёт общие функции из docs/design/pages/openings/opening-ref.cjs
 * (в коде — из src/lib/opening-trainer.ts).
 * Перенеси в TypeScript: src/lib/traps.ts, src/lib/sprint.ts, src/lib/ideas.ts; тесты — scripts/test-pages2.ts.
 */
const path = require('path');
const fs = require('fs');
const R = require('./openings/opening-ref.cjs');
let Chess;
try { ({ Chess } = require(path.join(process.cwd(), 'node_modules/chess.js'))); }
catch { ({ Chess } = require('chess.js')); }

const posKey = fen => fen.split(' ').slice(0, 4).join(' ');

// ══ Ловушки ══════════════════════════════════════════════════════════════════
/** Библиотека (traps-library.json) → ловушки с ходами: moves = line + punish, mistakePly — ошибка жертвы. */
function loadTraps(lib) {
  return lib.map(t => {
    const moves = R.toMoves(`${t.line} ${t.punish}`);
    return { ...t, key: `lib:${t.id}`, moves, mistakePly: t.line.split(' ').length - 1 };
  });
}
/**
 * Подходит ли ловушка к дебюту пользователя. opening = { id, color: 'white'|'black'|'both', lines: [ChessMove[]] }.
 * Идём по ходам ловушки, пока позиции есть в линиях дебюта (по позиции, не по номеру хода).
 * Подходит, если первым из линий ушёл СОПЕРНИК (тебе не надо менять репертуар) и общее начало ≥ 2 полуходов,
 * или если линии пользователя доходят до самой ошибки.
 * Возвращает { openingId, role: 'setter' (ты ставишь) | 'victim' (тебе ставят), k } или null.
 */
function matchTrap(trap, opening) {
  const keys = new Set([posKey(R.START)]);
  for (const L of opening.lines) for (const m of L) keys.add(posKey(m.fen));
  const colors = opening.color === 'white' ? ['w'] : opening.color === 'black' ? ['b'] : ['w', 'b'];
  for (const me of colors) {
    let k = 0;
    while (k < trap.moves.length && keys.has(posKey(trap.moves[k].fen))) k++;
    const reached = k > trap.mistakePly;
    if (reached || (k >= 2 && trap.moves[k].color !== me)) {
      return { openingId: opening.id, role: trap.setter === me ? 'setter' : 'victim', k };
    }
  }
  return null;
}
/** Разложить ловушки: «в твоих дебютах» (по порядку дебютов, глубже совпадение — выше) и «другие». */
function trapsForRepertoire(traps, openings) {
  const mine = [], other = [];
  for (const t of traps) {
    let best = null;
    openings.forEach((o, oi) => { const m = matchTrap(t, o); if (m && (!best || m.k > best.k)) best = { ...m, oi }; });
    if (best) mine.push({ trap: t, ...best }); else other.push(t);
  }
  mine.sort((a, b) => a.oi - b.oi || b.k - a.k);
  return { mine, other };
}
/** «Накажи»: позиция после ошибки жертвы, ходит ставящий; прогон как «Трудные ходы» (без закрепления). */
const punishRun = t => R.createRun(t.moves, t.setter, 'drill', { startPly: t.mistakePly + 1 });
/** «Не попадись»: позиция перед ошибкой, ходит жертва. 'trap' — попался; 'safe' — ход из списка safe; 'other' — проверить движком. */
function avoidVerdict(t, from, to) {
  const c = new Chess(R.fenBefore(t.moves, t.mistakePly));
  let san;
  try { san = c.move({ from, to, promotion: 'q' }).san; } catch { return 'illegal'; }
  if (san === t.moves[t.mistakePly].san) return 'trap';
  return t.safe.includes(san) ? 'safe' : 'other';
}

// ══ Дебютный спринт ══════════════════════════════════════════════════════════
/**
 * Позиции для спринта: все мои ходы в линиях начиная с 3-го полухода (k ≥ 2), без повторов (позиция + ход).
 * Вес: 1; линия к повторению ×3; трудный ход (line_move_progress) ×3; освоенная линия ×0.5.
 * lines: [{ id, moves, myColor, prog }], hard: Set('lineId:ply').
 */
function sprintItems(lines, now, hard = new Set()) {
  const byKey = new Map();
  for (const L of lines) {
    const st = R.lineStatus(L.prog, now);
    for (let k = 2; k < L.moves.length; k++) {
      const m = L.moves[k];
      if (m.color !== L.myColor) continue;
      let w = st === 'due' ? 3 : st === 'mastered' ? 0.5 : 1;
      if (hard.has(`${L.id}:${k}`)) w *= 3;
      const key = `${posKey(R.fenBefore(L.moves, k))}|${m.from}${m.to}`;
      const old = byKey.get(key);
      if (!old || old.w < w) byKey.set(key, { key, lineId: L.id, ply: k, fen: R.fenBefore(L.moves, k), from: m.from, to: m.to, san: m.san, myColor: L.myColor, w });
    }
  }
  return [...byKey.values()];
}
/** Детерминированный ГПСЧ (mulberry32) — для демо и тестов. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Порядок позиций: взвешенное перемешивание без повторов (ключ −log(u)/w). */
function sprintOrder(items, rand = Math.random) {
  return items.map(it => ({ it, s: -Math.log(1 - rand()) / it.w })).sort((a, b) => a.s - b.s).map(x => x.it);
}
/** Ход в спринте: верно, если from/to совпали (превращение не сравниваем). */
const sprintCheck = (item, from, to) => item.from === from && item.to === to;

// ══ Идеи позиций ═════════════════════════════════════════════════════════════
/** Конечные позиции линий (без повторов по позиции). Подпись — последний ход линии. */
function endPositions(lines) {
  const map = new Map();
  for (const L of lines) {
    const k = L.moves.length - 1;
    const fen = L.moves[k].fen, key = posKey(fen);
    if (!map.has(key)) map.set(key, { key, fen, lineIds: [], openingId: L.openingId, last: R.numSan(L.moves, k), myColor: L.myColor });
    map.get(key).lineIds.push(L.id);
  }
  return [...map.values()];
}
/** Доли и результат хода из ответа explorer (moves[]: { san, white, draws, black }). */
function moveStats(stats) {
  const total = stats.moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);
  return stats.moves.map(m => {
    const n = m.white + m.draws + m.black;
    return { san: m.san, uci: m.uci, games: n, share: total ? n / total : 0,
      white: n ? Math.round(m.white / n * 100) : 0, draws: n ? Math.round(m.draws / n * 100) : 0, black: n ? Math.round(m.black / n * 100) : 0 };
  });
}
/** «Сыграй как мастер»: верно, если ход среди первых трёх или его играли в ≥ 10% партий (и партий ≥ 3). */
function ideaVerdict(stats, san) {
  const ms = moveStats(stats);
  const i = ms.findIndex(m => m.san === san);
  const m = i >= 0 ? ms[i] : null;
  const ok = !!m && m.games >= 3 && (i < 3 || m.share >= 0.10);
  return { ok, share: m ? m.share : 0, games: m ? m.games : 0, top: ms.slice(0, 3) };
}

// ── тесты ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  let fails = 0;
  const eq = (a, b, msg) => {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    if (!ok) { fails++; console.log(`✗ ${msg}\n    есть:  ${JSON.stringify(a)}\n    нужно: ${JSON.stringify(b)}`); }
    else console.log(`✓ ${msg}`);
  };
  const NOW = Date.parse('2026-11-19T09:00:00Z'), DAY = 86400000;
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, 'traps/traps-library.json'), 'utf8'));
  const traps = loadTraps(lib);

  // 1. библиотека: все ходы легальны, ошибка — ход жертвы, наказание — ход ставящего
  eq(traps.length, 17, '17 ловушек');
  eq(traps.every(t => t.moves[t.mistakePly].color !== t.setter && t.moves[t.mistakePly + 1].color === t.setter), true, 'ошибка — ход жертвы, дальше ходит ставящий');
  const mates = traps.filter(t => { const c = new Chess(t.moves[t.moves.length - 1].fen); return c.isCheckmate(); }).map(t => t.id);
  eq(mates, ['stafford-bg5', 'blackburne', 'legal', 'scholar', 'caro-nd6', 'siberian', 'englund', 'kieninger'], 'ловушки, которые кончаются матом');

  // 2. подбор к репертуару (демо: TRAPS.md, раздел 7)
  const op = (id, color, lines) => ({ id, color, lines: lines.map(s => R.toMoves(s)) });
  const REP = [
    op('italian', 'white', ['e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7']),
    op('stafford', 'black', ['e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5', 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 e5 Ne4 d4 Qh4 g3 Nxg3']),
    op('dragon', 'black', ['e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6']),
    op('caro', 'black', ['e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5']),
  ];
  const { mine, other } = trapsForRepertoire(traps, REP);
  eq(mine.map(m => `${m.trap.id}:${m.openingId}:${m.role}`), [
    'blackburne:italian:victim', 'legal:italian:setter', 'petrov-nc6:italian:setter',
    'stafford-bg5:stafford:setter', 'stafford-d3:stafford:setter', 'scholar:stafford:victim',
    'siberian:dragon:setter', 'caro-nd6:caro:victim',
  ], 'ловушки в твоих дебютах: кто ставит и где');
  eq(other.length, 9, 'остальные — «Другие ловушки»');
  const DEMO_ORDER = [REP[1], REP[0], REP[2], REP[3]];   // порядок дебютов в демо /traps?demo=1: Стаффорд, Итальянская, Дракон, Каро-Канн
  eq(trapsForRepertoire(traps, DEMO_ORDER).mine.map(m => m.trap.id),
    ['stafford-bg5', 'stafford-d3', 'scholar', 'blackburne', 'legal', 'petrov-nc6', 'siberian', 'caro-nd6'], 'порядок в демо: по дебютам, глубже совпадение — выше');
  eq(matchTrap(traps.find(t => t.id === 'petrov-nc6'), REP[0]).k, 3, 'Русская партия подходит к Итальянской: 2...Nf6 — ход соперника');
  eq(matchTrap(traps.find(t => t.id === 'petrov-nc6'), REP[1]), null, 'Русская партия не подходит к Стаффорду: ушёл ты сам (3...Nxe4)');
  eq(matchTrap(traps.find(t => t.id === 'noah'), REP[0]), null, 'Испанская не подходит к Итальянской: 3.Bb5 — твой ход');

  // 3. «Накажи» — Стаффорд «Ой, мой ферзь»
  const st = traps.find(t => t.id === 'stafford-bg5');
  let r = punishRun(st);
  eq([R.view(r).fen, R.isMyTurn(r), R.view(r).lastMove], [st.moves[10].fen, true, { from: 'c1', to: 'g5' }], 'позиция после 6.Bg5, ходят чёрные');
  r = R.move(r, 'f6', 'e4'); r = R.auto(r);
  r = R.move(r, 'c5', 'f2'); r = R.auto(r);
  r = R.move(r, 'c8', 'g4');
  eq([r.phase, R.result(r).perfect], ['done', true], 'наказал без ошибок — мат');
  let r2 = R.move(punishRun(st), 'c5', 'f2');
  eq([R.view(r2).arrows.map(a => a.role), r2.mistakes.length], [['played', 'best'], 1], 'другой ход — стрелки и ошибка (если движок не подтвердит, что он тоже выигрывает)');

  // 4. «Не попадись» — Блэкберн
  const bb = traps.find(t => t.id === 'blackburne');
  eq(R.fenBefore(bb.moves, bb.mistakePly).split(' ')[0], 'r1b1kbnr/pppp1ppp/8/4N1q1/2BnP3/8/PPPP1PPP/RNBQK2R', 'позиция перед 5.Nxf7');
  eq([avoidVerdict(bb, 'e5', 'f7'), avoidVerdict(bb, 'e1', 'g1'), avoidVerdict(bb, 'c4', 'f7'), avoidVerdict(bb, 'd2', 'd3')], ['trap', 'safe', 'safe', 'other'], 'попался / безопасно / проверить движком');

  // 5. спринт
  const D = {
    L1: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nxc6 bxc6 Qd4 Nf6 e5 Nd5 e6 f6',
    L2: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O Qd2 Be6',
    L3: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 Qa5 O-O O-O Bb3 d6',
  };
  const P = { L1: { mastery: 4, next_review: new Date(NOW + 20 * DAY).toISOString() }, L2: { mastery: 2, next_review: new Date(NOW - DAY).toISOString() }, L3: null };
  const lines = Object.entries(D).map(([id, s]) => ({ id, moves: R.toMoves(s), myColor: 'b', prog: P[id] }));
  const items = sprintItems(lines, NOW, new Set(['L3:13']));
  eq(items.length, 18, '18 позиций: общие ходы (2... Nc6, 3... cxd4, 4... g6) — по одному разу');
  eq(items.filter(i => i.san === 'g6').map(i => [i.lineId, i.w]), [['L2', 3]], '4... g6 — один раз, вес линии к повторению');
  eq(items.find(i => i.san === 'Qa5').w, 3, 'трудный ход ×3');
  eq(items.find(i => i.san === 'Nd5').w, 0.5, 'освоенная линия ×0.5');
  const order1 = sprintOrder(items, rng(7)).slice(0, 3).map(i => i.san);
  eq(sprintOrder(items, rng(7)).slice(0, 3).map(i => i.san), order1, 'порядок с одним зерном повторяется');
  eq(sprintCheck(items[0], items[0].from, items[0].to), true, 'проверка хода');

  // 6. идеи позиций
  const ends = endPositions(lines.map(l => ({ ...l, openingId: 'dragon' })));
  eq(ends.map(e => e.last), ['8... f6', '10... Be6', '9... d6'], 'конечные позиции линий');
  const stats = { moves: [
    { san: 'O-O', uci: 'e1g1', white: 30, draws: 40, black: 20 }, { san: 'f3', uci: 'f2f3', white: 12, draws: 15, black: 8 },
    { san: 'Rc1', uci: 'a1c1', white: 10, draws: 12, black: 9 }, { san: 'b3', uci: 'b2b3', white: 2, draws: 3, black: 1 },
    { san: 'h3', uci: 'h2h3', white: 0, draws: 1, black: 1 },
  ] };
  const ms = moveStats(stats);
  eq([ms[0].games, Math.round(ms[0].share * 100), ms[0].white, ms[0].draws, ms[0].black], [90, 55, 33, 44, 22], 'доля и результат хода');
  eq([ideaVerdict(stats, 'O-O').ok, ideaVerdict(stats, 'Rc1').ok, ideaVerdict(stats, 'b3').ok, ideaVerdict(stats, 'h3').ok, ideaVerdict(stats, 'a3').ok],
    [true, true, false, false, false], 'как мастер: топ-3 или ≥ 10% партий');
  eq(ideaVerdict(stats, 'a3').top.map(m => m.san), ['O-O', 'f3', 'Rc1'], 'подсказка — три самых частых хода');

  console.log(fails ? `\nОшибок: ${fails}` : '\nвсе тесты: OK');
  process.exit(fails ? 1 : 0);
}

module.exports = { loadTraps, matchTrap, trapsForRepertoire, punishRun, avoidVerdict, sprintItems, sprintOrder, sprintCheck, rng, endPositions, moveStats, ideaVerdict };
