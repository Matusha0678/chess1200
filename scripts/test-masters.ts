/**
 * Test suite for src/lib/masters.ts
 * Run: npx tsx scripts/test-masters.ts
 * Based on masters-ref.cjs tests.
 */
import {
  parseGame, prepareItems, selectMoments, scoreGuess, userCp,
  resultArrows, evalWhite, sanNo, lineText, explain, plural,
  defaultSide, surname,
} from '../src/lib/masters.ts';
import type { AnalysisEntry } from '../src/lib/masters.ts';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const demo = require('../docs/design/pages/masters/masters-demo.json');

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const moves = parseGame(demo.game.pgn);
const items = prepareItems(moves, demo.analysis as AnalysisEntry[]);

// ── тест 1 ────────────────────────────────────────────────────────────────────
console.log('--- партия: 77 полуходов, Tal белыми ---');
assert('77 полуходов', moves.length === 77, `${moves.length}`);
assert('Tal белыми', surname(demo.game.white) === 'Tal');
assert('defaultSide white', defaultSide(demo.game, demo.libraryNames) === 'white');
assert('defaultSide black', defaultSide({ white: 'Gonzalez, R.', black: 'Tal, Mihail', result: '0-1' }, demo.libraryNames) === 'black');
assert('defaultSide по результату', defaultSide({ white: 'A', black: 'B', result: '0-1' }, []) === 'black');
assert('defaultSide ничья → белые', defaultSide({ white: 'A', black: 'B', result: '1/2-1/2' }, []) === 'white');

// ── тест 2 ────────────────────────────────────────────────────────────────────
console.log('--- признаки ходов ---');
const bh6 = items.find(x => x.san === 'Bh6')!;
assert('Bh6 — жертва', bh6.traits.sac);
const rxh5 = items.find(x => x.san === 'Rxh5')!;
assert('Rxh5 — отыгрыш', rxh5.traits.recapture);
const rf6 = items.find(x => x.san === 'Rf6+')!;
assert('Rf6+ — шах и жертва', rf6.traits.check && rf6.traits.sac);

// ── тест 3 ────────────────────────────────────────────────────────────────────
console.log('--- ключевые моменты Таля ---');
const key = selectMoments(items, { mode: 'key', side: 'white', skip: 10 });
assert('keyWhite совпадают', deepEq(key.map(m => m.san), demo.expect.keyWhite), JSON.stringify(key.map(m => m.san)));
assert('не больше 12', key.length <= 12);
assert('32. Bg5 не в ключевых', !key.some((m: { san: string; ply: number }) => m.san === 'Bg5' && m.ply === 63));
const sac = selectMoments(items, { mode: 'sac', side: 'white', skip: 10 });
assert('sacWhite совпадают', deepEq(sac.map(m => m.san), demo.expect.sacWhite));
const all = selectMoments(items, { mode: 'all', side: 'white', skip: 10 });
assert('all 29 ходов', all.length === 29, `${all.length}`);
assert('all skip=0 → 39', selectMoments(items, { mode: 'all', side: 'white', skip: 0 }).length === 39);

// ── тест 4 ────────────────────────────────────────────────────────────────────
console.log('--- очки ---');
const rg1 = items.find(x => x.san === 'Rg1')!;
assert('Rg1 → master 2', deepEq(scoreGuess(rg1, rg1.uci), { pts: 2, verdict: 'master' }));
assert('Rg1 с подсказкой → 1', deepEq(scoreGuess(rg1, rg1.uci, null, true), { pts: 1, verdict: 'master' }));
assert('b5e8 → miss 0', deepEq(scoreGuess(rg1, 'b5e8'), { pts: 0, verdict: 'miss' }));
const e5 = items.find(x => x.san === 'e5')!;
assert('e5 топ → better 2', deepEq(scoreGuess(e5, e5.top[0].uci), { pts: 2, verdict: 'better' }));
const g6 = items[28];
assert('g6 ход верный', g6.san === 'g6');
assert('c1b1 → engine 1', deepEq(scoreGuess(g6, 'c1b1', userCp(g6, 'c1b1', demo.userEvals)), { pts: 1, verdict: 'engine' }));
assert('f1b5 → miss 0', deepEq(scoreGuess(g6, 'f1b5', userCp(g6, 'f1b5', demo.userEvals)), { pts: 0, verdict: 'miss' }));
assert('a2a3 null → miss', deepEq(scoreGuess(g6, 'a2a3', null), { pts: 0, verdict: 'miss' }));

// ── тест 5 ────────────────────────────────────────────────────────────────────
console.log('--- стрелки ---');
assert('miss → played+best', deepEq(resultArrows(rg1, 'b5e8', 'miss').map((a: { role: string }) => a.role), ['played', 'best']));
assert('master → []', deepEq(resultArrows(rg1, rg1.uci, 'master'), []));
assert('miss e5 → played+best+plan', deepEq(resultArrows(e5, 'h1h2', 'miss').map((a: { role: string }) => a.role), ['played', 'best', 'plan']));
const arrMiss = resultArrows(rg1, 'b5e8', 'miss');
assert('best arrow has label М', arrMiss.find((a: { role: string }) => a.role === 'best')?.label === 'М');

// ── тест 6 ────────────────────────────────────────────────────────────────────
console.log('--- тексты ---');
assert('sanNo 51 → 26. Rg1', sanNo(rg1.ply, rg1.san) === '26. Rg1');
assert('sanNo 48 → 24... Rf7', sanNo(48, 'Rf7') === '24... Rf7');
assert('evalWhite w+', evalWhite(298, 'w') === '+2.98');
assert('evalWhite b-', evalWhite(52, 'b') === '−0.52');
assert('evalWhite mate', evalWhite(9990, 'w') === '#');
assert('lineText', lineText(51, ['Rg1', 'Ra7', 'Nd4']) === '26. Rg1 Ra7 27. Nd4');
assert('explain rg1', deepEq(explain(rg1), ['Тихий ход, но остальные ходы заметно хуже.', 'Это и лучший ход движка.']));
assert('explain bh6', explain(bh6)[0] === 'Жертва слона.');

// ── тест 7 ────────────────────────────────────────────────────────────────────
console.log('--- анализ в формате базы ---');
assert('items.length 77', items.length === 77);
assert('rg1 top[0].san = Rg1', rg1.top[0].san === 'Rg1');
assert('lineText rg1 pv', lineText(rg1.ply, rg1.top[0].pvSan.slice(0, 3)) === '26. Rg1 Ng4 27. fxg4');
assert('userCp b5e8 → 0 (из топ-3)', userCp(rg1, 'b5e8', demo.userEvals) === 0);
assert('userCp c1b1 → число', typeof userCp(rg1, 'c1b1', demo.userEvals) === 'number');
assert('userCp a2a3 → null', userCp(rg1, 'a2a3', {}) === null);

// ── тест 8 ────────────────────────────────────────────────────────────────────
console.log('--- пометки и комментарии ---');
const g2 = parseGame('1. e4! {Хорошо.} e5 2. Nf3!! (2. Bc4) Nc6 *');
assert('marks', deepEq(g2.map((x: { mark: string | null }) => x.mark), ['!', null, '!!', null]));
assert('comment', g2[0].comment === 'Хорошо.');
assert('plural 12', plural(12, 'момент', 'момента', 'моментов') === 'моментов');

// ── итог ─────────────────────────────────────────────────────────────────────
console.log('');
if (failed > 0) {
  console.error(`ПРОВАЛЕНО: ${failed} тестов из ${passed + failed}`);
  process.exit(1);
} else {
  console.log(`все тесты: OK (${passed})`);
}
