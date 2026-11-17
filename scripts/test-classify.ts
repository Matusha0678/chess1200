/**
 * Test suite for src/lib/classify.ts
 * Run: node --no-warnings scripts/test-classify.ts
 */

import { winProb, computeAccuracy, classifyMove } from '../src/lib/classify.ts';

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

function near(a: number, b: number, eps = 0.001) { return Math.abs(a - b) < eps; }

console.log('\n── classify.ts test suite ──\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. winProb basics
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('1. winProb basics');
  assert('winProb(0) ≈ 0.5',   near(winProb(0), 0.5));
  assert('winProb(500) > 0.85', winProb(500) > 0.85);
  assert('winProb(-500) < 0.15',winProb(-500) < 0.15);
  assert('winProb(9000) > 0.99',winProb(9000) > 0.99);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeAccuracy
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('2. computeAccuracy');
  assert('no losses → 100', computeAccuracy([]) === 100);
  const acc0 = computeAccuracy([0, 0, 0]);
  assert('all-zero losses → ≥95', acc0 >= 95, `got ${acc0.toFixed(1)}`);
  const accHigh = computeAccuracy([0.3, 0.3, 0.3]);
  assert('high losses → <50', accHigh < 50, `got ${accHigh.toFixed(1)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Blunder: white loses queen (evalBefore=50, evalAfter=-850)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('3. Blunder detection');
  // White drops a queen: loss > 0.20
  const cls = classifyMove({
    evalBefore: 50, evalAfter: -850,
    color: 'w', isEngineMove: false,
    plyNumber: 20, phase: 'middlegame',
  });
  assert('blunder classified', cls === 'blunder', `got ${cls}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mistake: white loses the exchange (evalBefore=+100, evalAfter=-100)
//    winProb(100)≈0.591, winProb(-100)≈0.409, loss≈0.182 → 0.10<loss≤0.20
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('4. Mistake detection');
  const cls = classifyMove({
    evalBefore: 100, evalAfter: -100,
    color: 'w', isEngineMove: false,
    plyNumber: 20, phase: 'middlegame',
  });
  assert('mistake classified', cls === 'mistake', `got ${cls}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Inaccuracy: evalBefore=+150, evalAfter=+80
//    winProb(150)≈0.635, winProb(80)≈0.573, loss≈0.062 → 0.05<loss≤0.10
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('5. Inaccuracy detection');
  const cls = classifyMove({
    evalBefore: 150, evalAfter: 80,
    color: 'w', isEngineMove: false,
    plyNumber: 20, phase: 'middlegame',
  });
  assert('inaccuracy classified', cls === 'inaccuracy', `got ${cls}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Best move (is engine move)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('6. Best move');
  const cls = classifyMove({
    evalBefore: 50, evalAfter: 50,
    color: 'w', isEngineMove: true,
    plyNumber: 20, phase: 'middlegame',
  });
  assert('best classified', cls === 'best', `got ${cls}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Book move: plyNumber ≤ 8, tiny loss
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('7. Book move');
  const cls = classifyMove({
    evalBefore: 10, evalAfter: 8,  // near-zero loss
    color: 'w', isEngineMove: false,
    plyNumber: 5, phase: 'opening',
  });
  assert('book classified for ply ≤ 8', cls === 'book', `got ${cls}`);

  // ply 9 with same loss → NOT book
  const cls2 = classifyMove({
    evalBefore: 10, evalAfter: 8,
    color: 'w', isEngineMove: false,
    plyNumber: 9, phase: 'opening',
  });
  assert('ply 9 NOT book', cls2 !== 'book', `got ${cls2}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Miss: opponent blundered, I didn't capitalise
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('8. Miss detection');
  // Opponent blundered giving me +700 cp advantage (moverWpBefore ≈ 0.93)
  // But I replied badly, still holding advantage but smaller
  const cls = classifyMove({
    evalBefore: 700,  // best gives me ~93% win prob
    evalAfter:  350,  // I played badly but still better
    color: 'w', isEngineMove: false,
    plyNumber: 18, phase: 'middlegame',
    opponentPrevLoss: 0.25,  // opponent had big blunder
  });
  assert('miss classified', cls === 'miss', `got ${cls}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Great: only good move (2nd best much worse)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('9. Great move detection');
  // Best line is +150 cp, 2nd best is -100 cp — huge gap
  // Balanced position (mWpBefore = winProb(150) ≈ 0.57)
  const cls = classifyMove({
    evalBefore: 150, evalAfter: 148,  // actually played best
    evalSecondBest: -100,              // 2nd best is much worse
    color: 'w', isEngineMove: true,
    plyNumber: 22, phase: 'middlegame',
    isRecapture: false, isOnlyLegalMove: false,
  });
  assert('great classified', cls === 'great', `got ${cls}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Brilliant: sacrifice + balanced position + engine move
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('10. Brilliant move detection');
  // Balanced position, player sacrificed piece (hanging ≥300), played best move
  const cls = classifyMove({
    evalBefore: 50, evalAfter: 48,  // near-zero loss (objective sacrifice)
    color: 'w', isEngineMove: true,
    plyNumber: 20, phase: 'middlegame',
    hasRealSacrifice: true,  // piece left hanging ≥300 cp
  });
  assert('brilliant classified', cls === 'brilliant', `got ${cls}`);

  // Already winning (mWpBefore > 0.90): winProb(700)≈0.929 → NOT brilliant
  const cls2 = classifyMove({
    evalBefore: 700, evalAfter: 698,
    color: 'w', isEngineMove: true,
    plyNumber: 20, phase: 'middlegame',
    hasRealSacrifice: true,
  });
  assert('no brilliant when already winning', cls2 !== 'brilliant', `got ${cls2}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Black's move classification
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('11. Black move classification');
  // Black drops a rook: evalBefore=-100 (black slightly better), evalAfter=400 (white winning)
  // Black's loss = (1 - winProb(-100)) - (1 - winProb(400)) = winProb(400) - winProb(-100)
  const cls = classifyMove({
    evalBefore: -100, evalAfter: 400,
    color: 'b', isEngineMove: false,
    plyNumber: 24, phase: 'middlegame',
  });
  assert('black blunder classified', cls === 'blunder', `got ${cls}`);

  // Black plays engine move
  const cls2 = classifyMove({
    evalBefore: -100, evalAfter: -102,
    color: 'b', isEngineMove: true,
    plyNumber: 24, phase: 'middlegame',
  });
  assert('black best classified', cls2 === 'best', `got ${cls2}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Phase strictness: endgame is stricter
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('12. Phase strictness');
  // A move with middlegame-"good" loss might be "inaccuracy" in endgame
  // Endgame strictness = 0.7, so inaccuracy threshold shrinks to 0.07
  // Create a loss right around 0.08:
  //   good in middlegame (≤0.05) — no, let's use loss ~0.08
  //   good threshold: middlegame 0.05, endgame 0.05*0.7=0.035
  //   inaccuracy threshold: middlegame 0.10, endgame 0.07
  //   So 0.08 loss → good in middlegame but NOT in endgame? No:
  //     middlegame good: 0.05 < 0.08 ≤ 0.10 → inaccuracy
  //   Let's find a loss that's "good" in opening but "inaccuracy" in middlegame:
  //     opening good: ≤0.05*1.5=0.075, middlegame good: ≤0.05
  //   So loss = 0.06 → "good" in opening, "inaccuracy" in middlegame

  // evalBefore=100, evalAfter=20:
  //   winProb(100)≈0.591, winProb(20)≈0.518, loss≈0.073
  //   middlegame inaccuracy threshold = 0.10, good = 0.05 → 0.073 > 0.05 → inaccuracy ✓
  //   opening good threshold = 0.05 × 1.5 = 0.075 → 0.073 ≤ 0.075 → good ✓
  const cls_opening = classifyMove({
    evalBefore: 100, evalAfter: 20,
    color: 'w', isEngineMove: false,
    plyNumber: 20, phase: 'opening',
  });
  const cls_middlegame = classifyMove({
    evalBefore: 100, evalAfter: 20,
    color: 'w', isEngineMove: false,
    plyNumber: 20, phase: 'middlegame',
  });
  assert('opening more lenient than middlegame',
    (cls_opening === 'good' || cls_opening === 'excellent') && cls_middlegame === 'inaccuracy',
    `opening=${cls_opening} middle=${cls_middlegame}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
