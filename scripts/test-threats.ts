/**
 * Test suite for src/lib/threats.ts
 * Run: npx ts-node --project tsconfig.json -e "require('./scripts/test-threats.ts')"
 * Or:  node --loader ts-node/esm scripts/test-threats.ts
 *
 * Uses ts-node so we can import TypeScript directly.
 */

import { findThreats, materialGain, getSquareAttackers } from '../src/lib/threats';
import type { Threat } from '../src/lib/threats';

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

function hasType(threats: Threat[], type: string, sq?: string) {
  return threats.some(t => t.type === type && (!sq || t.square === sq));
}

function notHasType(threats: Threat[], type: string, sq?: string) {
  return !hasType(threats, type, sq);
}

console.log('\n── threats.ts test suite ──\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Hanging knight — white pawn e3 attacks black knight d4, no defenders
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('1. Hanging knight (undefended)');
  const fen = '4k3/8/8/8/3n4/4P3/8/4K3 w - - 0 1';
  const t = findThreats(fen, 'b');
  assert('d4 is hanging', hasType(t, 'hanging', 'd4'));
  assert('gain = 300 cp (pawn takes knight free)', t.find(x => x.square === 'd4')?.gainCp === 300);
  assert('no king hanging', notHasType(t, 'hanging', 'e8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Defended pawn — NOT hanging (pawn × pawn = 0 net)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('2. Defended pawn — not hanging');
  // e7 pawn defends f6 pawn; white pawn e5 attacks f6
  const fen = '4k3/4p3/5p2/4P3/8/8/8/4K3 b - - 0 1';
  const gain = materialGain(fen, 'f6', 'w');
  assert('gain on defended pawn = 0', gain === 0, `got ${gain}`);
  const t = findThreats(fen, 'b');
  assert('f6 NOT in hanging list', notHasType(t, 'hanging', 'f6'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Hanging rook — pawn attacks undefended rook (profitable)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('3. Hanging rook (pawn × rook, undefended)');
  const fen = '4k3/8/4r3/3P4/8/8/8/4K3 b - - 0 1';
  const t = findThreats(fen, 'b');
  assert('e6 rook is hanging', hasType(t, 'hanging', 'e6'));
  assert('gain = 500 cp (free rook)', t.find(x => x.square === 'e6')?.gainCp === 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Piece attacked by cheaper piece — gain = target - attacker
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('4. Queen attacked by pawn (defended by queen), gain = 900-100 = 800');
  // Black queen d6, white pawn e5 attacks d6, black pawn c7 defends d6
  const fen = '4k3/2p5/3q4/4P3/8/8/8/4K3 b - - 0 1';
  const gain = materialGain(fen, 'd6', 'w');
  assert('gain = 800 (queen - pawn)', gain === 800, `got ${gain}`);
  const t = findThreats(fen, 'b');
  assert('d6 queen is hanging (800 ≥ 100)', hasType(t, 'hanging', 'd6'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. No threats — starting position
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('5. No threats in starting position');
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const t = findThreats(fen, 'w');
  assert('no hanging pieces for white', t.filter(x => x.type === 'hanging').length === 0, JSON.stringify(t));
  assert('no check for white', notHasType(t, 'check'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Check — white queen on e-file attacks black king e8
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('6. Check detection');
  const fen = '4k3/8/8/8/8/8/8/4QK2 b - - 0 1';
  const t = findThreats(fen, 'b');
  assert('check on e8', hasType(t, 'check', 'e8'));
  assert('king NOT in hanging list', notHasType(t, 'hanging', 'e8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Fork — white knight c7 attacks black rook a8 AND black king e8
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('7. Fork (knight c7 → rook a8 + king e8)');
  const fen = 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1';
  const t = findThreats(fen, 'b');
  assert('fork detected', hasType(t, 'fork'));
  // Also a check since knight attacks king
  assert('check detected (knight checks king)', hasType(t, 'check', 'e8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. King never appears as "hanging"
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('8. King never in hanging list');
  // White queen attacks black king (check, not hanging)
  const fen = '4k3/8/8/8/8/8/8/4QK2 b - - 0 1';
  const t = findThreats(fen, 'b');
  const kingHanging = t.filter(x => x.type === 'hanging' && x.square === 'e8');
  assert('king not in hanging list', kingHanging.length === 0, JSON.stringify(kingHanging));
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. materialGain returns 0 when no one attacks the square
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('9. No attacker → materialGain = 0');
  // Black rook on a8, no white pieces threatening it
  const fen = 'r3k3/8/8/8/8/8/8/4K3 b - - 0 1';
  const gain = materialGain(fen, 'a8', 'w');
  assert('materialGain = 0 when unattacked', gain === 0, `got ${gain}`);
  const t = findThreats(fen, 'b');
  assert('a8 rook NOT hanging', notHasType(t, 'hanging', 'a8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Hanging pawn — attacked by pawn, undefended
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('10. Hanging pawn (white pawn f5 attacked by black pawn e6)');
  const fen = '4k3/8/4p3/5P2/8/8/8/4K3 b - - 0 1';
  const t = findThreats(fen, 'w');
  assert('f5 pawn is hanging', hasType(t, 'hanging', 'f5'), JSON.stringify(t));
  assert('gain = 100 cp (pawn for free)', t.find(x => x.square === 'f5')?.gainCp === 100);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
