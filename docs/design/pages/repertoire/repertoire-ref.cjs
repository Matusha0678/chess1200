#!/usr/bin/env node
/**
 * Эталон проверки «Дебюты в моих партиях» (REPERTOIRE.md, разделы 2–3).
 * Запуск из корня проекта: node docs/design/pages/repertoire/repertoire-ref.cjs
 * Нужен только chess.js (уже есть в проекте).
 *
 * Перенеси логику в src/lib/repertoire.ts (TypeScript), а тесты ниже — в scripts/test-repertoire.ts.
 */
const path = require('path');
let Chess;
try { ({ Chess } = require(path.join(process.cwd(), 'node_modules/chess.js'))); }
catch { ({ Chess } = require('chess.js')); }

// ── ключ позиции: расстановка + чей ход + рокировки (без взятия на проходе и счётчиков) ──
function posKey(fen) {
  const [placement, turn, castling] = fen.split(' ');
  return `${placement} ${turn} ${castling}`;
}
const START = new Chess().fen();

/**
 * Индекс репертуара для одного цвета C ('w' | 'b').
 * openings: [{ id, name, color: 'white'|'black'|'both' }]
 * lines:    [{ id, opening_id, moves: [{ san, from, to, fen, color }] }]  — как opening_lines.moves
 * mine[key]   = Map<san, { openingIds:Set, lineIds:Set }>  — мои ходы из этой позиции
 * theirs[key] = Map<san, { openingIds:Set, lineIds:Set }>  — ходы соперника, которые есть в моих линиях
 */
function buildIndex(openings, lines, C) {
  const want = C === 'w' ? 'white' : 'black';
  const byId = new Map(openings.map(o => [o.id, o]));
  const mine = new Map(), theirs = new Map();
  const add = (map, key, san, o, l) => {
    if (!map.has(key)) map.set(key, new Map());
    const m = map.get(key);
    if (!m.has(san)) m.set(san, { openingIds: new Set(), lineIds: new Set() });
    m.get(san).openingIds.add(o); m.get(san).lineIds.add(l);
  };
  for (const line of lines) {
    const op = byId.get(line.opening_id);
    if (!op || !(op.color === want || op.color === 'both')) continue;
    let fen = START;
    for (const mv of line.moves) {
      add(mv.color === C ? mine : theirs, posKey(fen), mv.san, op.id, line.id);
      fen = mv.fen;
    }
  }
  return { mine, theirs, byId };
}

const MAX_PLY = 30;   // дальше 15-го хода не ищем
const LOOKAHEAD = 4; // перестановка: вернулась ли партия в мои линии за 4 полухода

/**
 * Проверка одной партии.
 * moves: SAN по порядку (из PGN), C: мой цвет.
 * Возвращает { status, ply, moveNumber, color, fenBefore, played, expected[], openingId, lineIds[], bookPlies, first }
 *  status: 'in_line' | 'deviation' | 'other' | 'hole' | 'none'
 */
function checkGame(moves, C, index) {
  const ch = new Chess();
  const inIndex = fen => { const k = posKey(fen); return index.mine.has(k) || index.theirs.has(k); };
  let inBook = false, bookPlies = 0, lastOpening = null, resumeAt = -1;
  const n = Math.min(moves.length, MAX_PLY);
  for (let ply = 0; ply < n; ply++) {
    const fenBefore = ch.fen();
    const mover = ch.turn();
    let played;
    try { played = ch.move(moves[ply]).san; } catch { break; }
    if (ply < resumeAt) continue;                       // идём по перестановке до возврата в линии
    const known = (mover === C ? index.mine : index.theirs).get(posKey(fenBefore));
    if (!known) {
      if (inBook) return { status: 'in_line', bookPlies, openingId: lastOpening, ply: null };   // линия закончилась
      continue;                                          // ещё не вошли в свои линии — ищем дальше
    }
    if (known.has(played)) {
      inBook = true; bookPlies = ply + 1; lastOpening = [...known.get(played).openingIds][0];
      continue;
    }
    // ход не из линий — может, это перестановка и партия вернётся в мои позиции?
    const back = (() => {
      if (inIndex(ch.fen())) return ply + 1;
      const c2 = new Chess(ch.fen());
      for (let j = ply + 1; j < Math.min(n, ply + 1 + LOOKAHEAD); j++) {
        try { c2.move(moves[j]); } catch { return -1; }
        if (inIndex(c2.fen())) return j + 1;
      }
      return -1;
    })();
    if (back > 0) { inBook = true; resumeAt = back; continue; }
    const all = [...known.values()];
    const openingIds = [...new Set(all.flatMap(i => [...i.openingIds]))];
    const lineIds = [...new Set(all.flatMap(i => [...i.lineIds]))];
    const first = ply <= 1;                              // первый ход этой стороны в партии
    const ev = { ply, moveNumber: Math.floor(ply / 2) + 1, color: mover, fenBefore, played, expected: [...known.keys()], openingId: openingIds[0], lineIds, bookPlies, first };
    return mover === C ? { ...ev, status: first ? 'other' : 'deviation' } : { ...ev, status: 'hole' };
  }
  return inBook ? { status: 'in_line', bookPlies, openingId: lastOpening, ply: null } : { status: 'none', bookPlies: 0, ply: null };
}

// ── демо-данные (те же, что в src/lib/demo-positions.ts → DEMO_REPERTOIRE) ──
function mkLine(id, opening_id, sans) {
  const ch = new Chess(); const moves = [];
  for (const s of sans.split(' ')) { const r = ch.move(s); moves.push({ san: r.san, from: r.from, to: r.to, fen: ch.fen(), color: r.color }); }
  return { id, opening_id, moves };
}
const DEMO_OPENINGS = [
  { id: 'op-scotch', name: 'Шотландская партия', color: 'white' },
  { id: 'op-stafford', name: 'Гамбит Стаффорда', color: 'black' },
];
const DEMO_LINES = [
  mkLine('l-sc-1', 'op-scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nxc6 Qf6 Qd2 dxc6 Nc3'),
  mkLine('l-sc-2', 'op-scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4'),
  mkLine('l-st-1', 'op-stafford', 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5'),
];
const DEMO_GAMES = [
  { id: 'g1', color: 'w', result: 'loss', opp: 'Ivan_88',  date: '2026-11-12', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nf5 d5 Nxg7+ Kf8 Nh5 Qh4' },
  { id: 'g2', color: 'w', result: 'loss', opp: 'petr_k',   date: '2026-11-10', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nf5 g6 Ng3 Nf6' },
  { id: 'g3', color: 'w', result: 'draw', opp: 'Mira2010', date: '2026-11-08', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7' },
  { id: 'g4', color: 'w', result: 'win',  opp: 'kostya',   date: '2026-11-07', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Qh4 Nc3 Bb4 Be2' },
  { id: 'g5', color: 'w', result: 'win',  opp: 'Alex_K',   date: '2026-11-05', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Nb6 Nd2' },
  { id: 'g6', color: 'b', result: 'loss', opp: 'd4_only',  date: '2026-11-04', moves: 'd4 d5 c4 e6 Nc3 Nf6' },
  { id: 'g7', color: 'b', result: 'win',  opp: 'Sasha',    date: '2026-11-03', moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5 Nc3 Ng4' },
];

if (require.main === module) {
  const idx = { w: buildIndex(DEMO_OPENINGS, DEMO_LINES, 'w'), b: buildIndex(DEMO_OPENINGS, DEMO_LINES, 'b') };
  const expect = {
    g1: ['deviation', 'Nf5', ['Nxc6'], 5], g2: ['deviation', 'Nf5', ['Nxc6'], 5], g3: ['deviation', 'Be3', ['Nxc6'], 5],
    g4: ['hole', 'Qh4', ['Bc5', 'Nf6'], 4], g5: ['in_line', null, null, null], g6: ['hole', 'd4', ['e4'], 1], g7: ['in_line', null, null, null],
  };
  let ok = 0, n = 0;
  for (const g of DEMO_GAMES) {
    const r = checkGame(g.moves.split(' '), g.color, idx[g.color]);
    const [st, played, exp, mn] = expect[g.id];
    const pass = r.status === st && (played == null || r.played === played) && (exp == null || JSON.stringify(r.expected) === JSON.stringify(exp)) && (mn == null || r.moveNumber === mn);
    n++; if (pass) ok++;
    console.log(`${pass ? '✓' : '✗'} ${g.id}: ${r.status}${r.played ? ` · ход ${r.moveNumber}${r.color === 'b' ? '...' : '.'} ${r.played}` : ''}${r.expected ? ` · в линиях: ${r.expected.join(', ')}` : ''}${r.first ? ' · first' : ''} · по линии ${r.bookPlies} пх`);
  }
  // перестановка ходов: та же позиция другим порядком — всё ещё по линии
  const tr = checkGame('e4 e5 d4 exd4 Nf3 Nc6 Nxd4 Bc5 Nxc6'.split(' '), 'w', idx.w);
  n++; if (tr.status === 'in_line' || (tr.status !== 'deviation' && tr.status !== 'other')) ok++;
  console.log(`${tr.status !== 'deviation' && tr.status !== 'other' ? '✓' : '✗'} перестановка: ${tr.status} · по линии ${tr.bookPlies} пх`);
  // другой первый ход белыми — «другой дебют», а не отклонение
  const ot = checkGame('d4 d5 c4'.split(' '), 'w', idx.w);
  n++; if (ot.status === 'other') ok++;
  console.log(`${ot.status === 'other' ? '✓' : '✗'} 1.d4 белыми: ${ot.status}`);
  // два разных хода в одной позиции из разных линий — оба «по линии»
  const both = buildIndex([{ id: 'a', name: 'A', color: 'white' }], [mkLine('x1', 'a', 'e4 e5 Nf3'), mkLine('x2', 'a', 'e4 e5 Bc4')], 'w');
  const r1 = checkGame('e4 e5 Bc4 Nf6'.split(' '), 'w', both);
  n++; if (r1.status === 'in_line') ok++;
  console.log(`${r1.status === 'in_line' ? '✓' : '✗'} две линии (Nf3 и Bc4), сыграл Bc4: ${r1.status}`);
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
}

module.exports = { posKey, buildIndex, checkGame, DEMO_OPENINGS, DEMO_LINES, DEMO_GAMES };
