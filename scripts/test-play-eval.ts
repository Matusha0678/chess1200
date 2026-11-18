/**
 * Test suite for play/page.tsx eval helpers
 * Run: npx tsx scripts/test-play-eval.ts
 */

import { classifyMove } from '../src/lib/classify.ts';

let passed = 0, failed = 0;
function assert(label: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ✓  ${label}`); passed++; }
  else { console.log(`  ✗  ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

// Inline lineToWhiteCp since it's inside the component file
function lineToWhiteCp(l: { cp: number | null; mate: number | null }): number {
  if (l.mate !== null) return l.mate > 0 ? 9900 : -9900;
  return l.cp ?? 0;
}

console.log('\n── test-play-eval.ts ──\n');

// ── 1. lineToWhiteCp ─────────────────────────────────────────────────────────
console.log('1. lineToWhiteCp');
assert('cp=990 mate=null → 990',      lineToWhiteCp({ cp: 990, mate: null }) === 990);
assert('cp=-440 mate=null → -440',    lineToWhiteCp({ cp: -440, mate: null }) === -440);
assert('cp=null mate=3 → 9900',       lineToWhiteCp({ cp: null, mate: 3 }) === 9900);
assert('cp=null mate=-2 → -9900',     lineToWhiteCp({ cp: null, mate: -2 }) === -9900);
assert('cp=null mate=null → 0',       lineToWhiteCp({ cp: null, mate: null }) === 0);

// ── 2. classifyMove — no inaccuracy/mistake/blunder for small drop ────────────
console.log('\n2. classifyMove — small drop should not be error');
const r = classifyMove({
  evalBefore: 1080, evalAfter: 990, color: 'w',
  isEngineMove: false, plyNumber: 1, phase: 'opening',
});
assert(`1080→990 white opening is not inaccuracy (got ${r})`,
  r !== 'inaccuracy' && r !== 'mistake' && r !== 'blunder');

// ── 3. classifyMove — obvious blunder ─────────────────────────────────────────
console.log('\n3. classifyMove — big drop should be blunder');
const r2 = classifyMove({
  evalBefore: 500, evalAfter: -500, color: 'w',
  isEngineMove: false, plyNumber: 10, phase: 'middlegame',
});
assert(`500→-500 white middlegame is blunder/mistake (got ${r2})`,
  r2 === 'blunder' || r2 === 'mistake');

// ── 4. classifyMove — engine move ─────────────────────────────────────────────
console.log('\n4. classifyMove — engine move never blunder');
const r3 = classifyMove({
  evalBefore: 500, evalAfter: 300, color: 'w',
  isEngineMove: true, plyNumber: 10, phase: 'middlegame',
});
assert(`engine move is not blunder (got ${r3})`, r3 !== 'blunder' && r3 !== 'mistake');

// ── 5. mate for black = -9900 ────────────────────────────────────────────────
console.log('\n5. lineToWhiteCp mate for black');
// Engine returns mate=-1 (from white's perspective, black is mated in 1 → positive)
// But if engine returns mate=-1 (black mates white in 1), that's negative
assert('mate=1 (white mates) → 9900',   lineToWhiteCp({ cp: null, mate: 1 }) === 9900);
assert('mate=-1 (black mates) → -9900', lineToWhiteCp({ cp: null, mate: -1 }) === -9900);

console.log(`\n${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
