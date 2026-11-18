/**
 * Tests for clock.ts, game-insights.ts, convert-positions.ts, lichess-puzzles.ts.
 * Run: node --no-warnings scripts/test-insights.ts
 */

import { parseClocks, parseTimeControl, timeSpent } from '../src/lib/clock.ts';
import { gameInsight } from '../src/lib/game-insights.ts';
import { findConvertPosition } from '../src/lib/convert-positions.ts';
import { parsePuzzle } from '../src/lib/lichess-puzzles.ts';

let passed = 0;
let failed = 0;

function eq(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }

function t(name: string, got: unknown, want: unknown) {
  const ok = eq(got, want);
  if (ok) {
    console.log(`  ✓  ${name}`);
    passed++;
  } else {
    console.log(`  ✗  ${name}\n    получили ${JSON.stringify(got)}\n    нужно    ${JSON.stringify(want)}`);
    failed++;
  }
}

// ── clock.ts ─────────────────────────────────────────────────────────────────

console.log('\nclock.ts');
const PGN = '[Event "Live Chess"]\n[TimeControl "600"]\n\n1. e4 {[%clk 0:09:58.5]} 1... e5 {[%clk 0:09:57.1]} 2. Nf3 {[%clk 0:09:50]} 2... Nc6 {[%clk 0:09:40.2]} *';
t('parseClocks', parseClocks(PGN), [598.5, 597.1, 590, 580.2]);
t('parseTimeControl 600', parseTimeControl(PGN), { base: 600, inc: 0 });
t('parseTimeControl 180+2', parseTimeControl('[TimeControl "180+2"]'), { base: 180, inc: 2 });
t('parseTimeControl daily', parseTimeControl('[TimeControl "1/86400"]'), null);
t('timeSpent', timeSpent([598.5, 597.1, 590, 580.2], { base: 600, inc: 0 }), [1.5, 2.9, 8.5, 16.9]);
t('timeSpent +5', timeSpent([598.5, 597.1, 590, 580.2], { base: 600, inc: 5 }), [6.5, 7.9, 13.5, 21.9]);

// ── game-insights.ts ─────────────────────────────────────────────────────────

console.log('\ngame-insights.ts');
const F_MID = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 9';
const F_END = '8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40';
const rows = [
  { move_number: 18, color: 'w' as const, san: 'Nd5', fen_before: F_MID, eval_before: 320, eval_after: 330, classification: 'best', win_before: 0.76, win_after: 0.77, loss: 0.0 },
  { move_number: 18, color: 'b' as const, san: 'Rc8', fen_before: F_MID, eval_before: 330, eval_after: 340, classification: 'good', win_before: 0.77, win_after: 0.78, loss: 0.01 },
  { move_number: 19, color: 'w' as const, san: 'Qe2', fen_before: F_MID, eval_before: 340, eval_after: 300, classification: 'good', win_before: 0.78, win_after: 0.75, loss: 0.03 },
  { move_number: 19, color: 'b' as const, san: 'Qc7', fen_before: F_MID, eval_before: 300, eval_after: 300, classification: 'best', win_before: 0.75, win_after: 0.75, loss: 0.0 },
  { move_number: 20, color: 'w' as const, san: 'Rd1', fen_before: F_MID, eval_before: 300, eval_after: -450, classification: 'blunder', win_before: 0.75, win_after: 0.16, loss: 0.59 },
  { move_number: 40, color: 'w' as const, san: 'Rd7', fen_before: F_END, eval_before: -500, eval_after: -520, classification: 'good', win_before: 0.14, win_after: 0.13, loss: 0.01 },
];
const pgnClk = '[TimeControl "600"]\n\n' + Array.from({ length: 80 }, (_, i) => `{[%clk 0:0${i < 38 ? 5 : 0}:${String(i < 38 ? 30 : 45).padStart(2, '0')}]}`).join(' ');
const g = gameInsight({ color: 'white', result: 'loss', pgn: pgnClk }, rows);
t('decisive', g.decisive, { moveNumber: 20, san: 'Rd1', phase: 'middlegame', loss: 0.59, cls: 'blunder', clockLeft: 45 });
t('missedWin', g.missedWin, true);
t('timeTrouble', g.timeTrouble, true);
t('errorsByPhase', g.errorsByPhase, { opening: 0, middlegame: 1, endgame: 0 });

// ── convert-positions.ts ─────────────────────────────────────────────────────

console.log('\nconvert-positions.ts');
t('convert', findConvertPosition({ color: 'white', result: 'loss' }, rows), { fen: F_MID, moveNumber: 18, myColor: 'w', myWin: 0.76, evalCp: 320 });
t('convert: победа → null', findConvertPosition({ color: 'white', result: 'win' }, rows), null);
const gb = gameInsight({ color: 'black', result: 'win', pgn: '' }, rows);
t('чёрные выиграли: decisive null', gb.decisive, null);

// ── lichess-puzzles.ts ───────────────────────────────────────────────────────

console.log('\nlichess-puzzles.ts');
const P = {
  game: { pgn: 'e4 c5 c3 e6 d4 d5 dxc5 Bxc5 exd5 exd5 Bb5+ Nc6 Nf3 Nf6 O-O O-O Bg5 h6 Bh4 a6 Bd3 Bg4 h3 Bh5 Nbd2 Re8 Qb3 b5 a4 Na5 Qc2 Nc4 b3 Ne5 Nxe5 Rxe5 axb5 axb5 Rxa8 Qxa8 Bxf6 gxf6 Bxb5 Rg5 Re1 Qb7 Be2 Bxe2 Rxe2 d4 Ne4 Rg6 f3' },
  puzzle: { id: '0haqU', rating: 1167, plays: 24912, solution: ['d4d3', 'e4c5', 'd3c2', 'c5b7', 'c2c1q'], themes: ['endgame', 'advancedPawn', 'crushing', 'long', 'promotion', 'discoveredAttack'], initialPly: 52 },
};
const pz = parsePuzzle(P);
t('puzzle fen', pz.fen, '6k1/1q3p2/5prp/2b5/3pN3/1PP2P1P/2Q1R1P1/6K1 b - - 0 27');
t('puzzle lastMove + solver', [pz.lastMoveUci, pz.solverColor], ['f2f3', 'b']);

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
if (failed > 0) process.exit(1);
