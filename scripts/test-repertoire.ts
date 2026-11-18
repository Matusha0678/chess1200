/**
 * Test suite for src/lib/repertoire.ts
 * Run: npx tsx scripts/test-repertoire.ts
 */

import { buildIndex, checkGameFull, repHash, parsePgnMoves, posKey } from '../src/lib/repertoire.ts';
import { DEMO_OPENINGS, DEMO_LINES, DEMO_GAMES } from '../src/lib/demo-positions.ts';

let passed = 0, failed = 0;
function assert(label: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ✓  ${label}`); passed++; }
  else { console.log(`  ✗  ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n── repertoire.ts test suite ──\n');

const idx = {
  w: buildIndex(DEMO_OPENINGS, DEMO_LINES, 'w'),
  b: buildIndex(DEMO_OPENINGS, DEMO_LINES, 'b'),
};

// ── 1. 7 demo games ──────────────────────────────────────────────────────────
console.log('1. Demo games');
const expect: Record<string, [string, string | null, string[] | null, number | null]> = {
  g1: ['deviation', 'Nf5', ['Nxc6'], 5],
  g2: ['deviation', 'Nf5', ['Nxc6'], 5],
  g3: ['deviation', 'Be3', ['Nxc6'], 5],
  g4: ['hole', 'Qh4', ['Bc5', 'Nf6'], 4],
  g5: ['in_line', null, null, null],
  g6: ['hole', 'd4', ['e4'], 1],
  g7: ['in_line', null, null, null],
};
for (const g of DEMO_GAMES) {
  const r = checkGameFull(g.moves.split(' '), g.color, idx[g.color]);
  const [st, played, exp, mn] = expect[g.id];
  const pass =
    r.status === st &&
    (played == null || r.played === played) &&
    (exp == null || JSON.stringify(r.expected) === JSON.stringify(exp)) &&
    (mn == null || r.moveNumber === mn);
  assert(`${g.id}: ${r.status}${r.played ? ` · ${r.moveNumber}${r.color === 'b' ? '...' : '. '}${r.played}` : ''} · book ${r.bookPlies}`, pass,
    `expected ${st}${played ? ' · ' + played : ''}`);
}

// ── 2. UCIs present for deviation ───────────────────────────────────────────
console.log('\n2. UCIs for g1 deviation');
const r1 = checkGameFull('e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nf5'.split(' '), 'w', idx.w);
assert('status = deviation', r1.status === 'deviation');
assert('played_uci = d4f5', r1.playedUci === 'd4f5', `got ${r1.playedUci}`);
assert('expected_uci[0] = d4c6', r1.expectedUci?.[0] === 'd4c6', `got ${r1.expectedUci?.[0]}`);
assert('prev_uci = f8c5', r1.prevUci === 'f8c5', `got ${r1.prevUci}`);

// ── 3. Transpositional moves ─────────────────────────────────────────────────
console.log('\n3. Transposition');
const tr = checkGameFull('e4 e5 d4 exd4 Nf3 Nc6 Nxd4 Bc5 Nxc6'.split(' '), 'w', idx.w);
assert(`transposition is not deviation/other (got ${tr.status})`, tr.status !== 'deviation' && tr.status !== 'other');

// ── 4. First move → other, not deviation ─────────────────────────────────────
console.log('\n4. First move "other"');
const ot = checkGameFull('d4 d5 c4'.split(' '), 'w', idx.w);
assert(`1.d4 white → other (got ${ot.status})`, ot.status === 'other');

// ── 5. Two lines in same position → both in-line ─────────────────────────────
console.log('\n5. Two lines same position');
const bothIdx = buildIndex([{ id: 'a', name: 'A', color: 'white' }], [
  { id: 'x1', opening_id: 'a', moves: (() => { const { Chess } = require('chess.js'); const ch = new Chess(); const mvs = []; for (const s of ['e4','e5','Nf3']) { const r = ch.move(s); mvs.push({ san: r.san, from: r.from, to: r.to, fen: ch.fen(), color: r.color }); } return mvs; })() },
  { id: 'x2', opening_id: 'a', moves: (() => { const { Chess } = require('chess.js'); const ch = new Chess(); const mvs = []; for (const s of ['e4','e5','Bc4']) { const r = ch.move(s); mvs.push({ san: r.san, from: r.from, to: r.to, fen: ch.fen(), color: r.color }); } return mvs; })() },
], 'w');
const r5 = checkGameFull('e4 e5 Bc4 Nf6'.split(' '), 'w', bothIdx);
assert(`two lines (Nf3/Bc4), played Bc4 → in_line (got ${r5.status})`, r5.status === 'in_line');

// ── 6. repHash changes when line is added ────────────────────────────────────
console.log('\n6. repHash changes on line add');
const h1 = repHash(DEMO_OPENINGS, DEMO_LINES);
const extraLine = { id: 'extra', opening_id: 'op-scotch', moves: (() => { const { Chess } = require('chess.js'); const ch = new Chess(); const mvs = []; for (const s of ['e4','e5']) { const r = ch.move(s); mvs.push({ san: r.san, from: r.from, to: r.to, fen: ch.fen(), color: r.color }); } return mvs; })() };
const h2 = repHash(DEMO_OPENINGS, [...DEMO_LINES, extraLine]);
assert(`hash changes when line added (${h1} → ${h2})`, h1 !== h2);
assert('hash is stable (same input)', h1 === repHash(DEMO_OPENINGS, DEMO_LINES));

// ── 7. parsePgnMoves ─────────────────────────────────────────────────────────
console.log('\n7. parsePgnMoves');
const pgn = `[Event "Live Chess"]\n[White "Me"]\n[Black "You"]\n\n1. e4 e5 2. Nf3 Nc6 3. d4 exd4 1/2-1/2`;
const moves = parsePgnMoves(pgn);
assert('extracts 6 moves', moves.length === 6, `got ${moves.length}`);
assert('first move e4', moves[0] === 'e4');
assert('last move exd4', moves[5] === 'exd4');

// FEN header → empty
const fenPgn = `[FEN "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4"]\n\n1. d3 1-0`;
assert('FEN header → []', parsePgnMoves(fenPgn).length === 0);

// chess.com format with %clk and %eval annotations
const chesscomPgn = `[Event "Live Chess"]\n[TimeControl "600"]\n\n1. e4 {[%eval 0.21] [%clk 0:09:58]} 1... c5 {[%eval 0.35] [%clk 0:09:55]} 2. Nf3 {[%eval 0.28] [%clk 0:09:50]} 2... Nc6 {[%eval 0.30] [%clk 0:09:45]} *`;
const chesscomMoves = parsePgnMoves(chesscomPgn);
assert('chess.com annotations: 4 moves', chesscomMoves.length === 4);
assert('chess.com first move e4', chesscomMoves[0] === 'e4');
assert('chess.com last move Nc6', chesscomMoves[3] === 'Nc6');

// ── 8. g6 hole first=true ────────────────────────────────────────────────────
console.log('\n8. g6 hole first=true');
const r6 = checkGameFull(DEMO_GAMES[5].moves.split(' '), DEMO_GAMES[5].color, idx[DEMO_GAMES[5].color]);
assert('g6 status = hole', r6.status === 'hole');
assert('g6 first = true', r6.first === true);
assert('g6 moveNumber = 1', r6.moveNumber === 1);

console.log(`\n${passed + failed === 0 ? '(no tests)' : `${passed}/${passed + failed}`}`);
process.exit(failed > 0 ? 1 : 0);
