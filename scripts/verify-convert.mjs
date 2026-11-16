/**
 * Verify convert.ts positions: chess.js FEN validity + Stockfish depth-14 check.
 * Pass criterion: eval > +300 cp for White (the side to move).
 *
 * Usage: node scripts/verify-convert.mjs
 *
 * Failing positions are listed at the end. Remove them from convert.ts manually.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = resolve(__dirname, '../node_modules/stockfish/bin/stockfish-19.js');

const { Chess } = require('chess.js');

// ── Candidate positions (from src/data/convert.ts) ───────────────────────────

const CANDIDATES = [
  { id: 'cv-01', fen: '1K1k4/1P6/8/8/8/8/r7/4R3 w - - 0 1' },
  { id: 'cv-02', fen: '5Q2/8/5K2/8/8/5k2/8/5r2 w - - 0 1' },
  { id: 'cv-03', fen: '8/PP6/8/8/5k2/5K2/8/8 w - - 0 1' },
  { id: 'cv-04', fen: '8/8/PP6/8/5k2/5K2/8/8 w - - 0 1' },
  { id: 'cv-05', fen: '8/8/8/PP6/8/5k2/5K2/8 w - - 0 1' },
  { id: 'cv-06', fen: '8/8/4k3/8/8/4K3/8/3r1RR1 w - - 0 1' },
  { id: 'cv-07', fen: '8/8/4Pk2/8/8/5K2/8/4R3 w - - 0 1' },
  { id: 'cv-08', fen: '1K1k4/2P5/2K5/8/8/8/8/R7 w - - 0 1' },
  { id: 'cv-09', fen: '8/8/8/4k3/8/8/4NP1P/5K2 w - - 0 1' },
  { id: 'cv-10', fen: '8/8/8/4k3/8/8/4BP1P/5K2 w - - 0 1' },
  { id: 'cv-11', fen: '8/8/8/5k1p/4P3/4NK2/8/8 w - - 0 1' },
  { id: 'cv-12', fen: '8/8/8/5k1p/4P3/4BK2/8/8 w - - 0 1' },
  { id: 'cv-13', fen: '8/8/5k2/5PP1/8/8/8/4RK1r w - - 0 1' },
  { id: 'cv-14', fen: '8/8/8/8/5k2/5P2/5KP1/8 w - - 0 1' },
  { id: 'cv-15', fen: '8/5k2/8/5Q2/8/5K2/5r2/8 w - - 0 1' },
];

// ── Stockfish engine ──────────────────────────────────────────────────────────

let engine = null;
let onLineCallback = null;

function initEngine() {
  return new Promise((resolve) => {
    engine = require(ENGINE_PATH)();
    engine.listener = (line) => { if (onLineCallback) onLineCallback(line); };

    onLineCallback = (line) => {
      if (line === 'readyok') { onLineCallback = null; resolve(); }
    };

    setTimeout(() => {
      engine.processCommand('uci');
      engine.processCommand('isready');
    }, 800);
  });
}

function evalPosition(fen, depth = 14) {
  return new Promise((resolve) => {
    let lastDepthResult = null;
    let timer = null;

    const analysisCallback = (line) => {
      if (line.startsWith('info depth ')) {
        const mateMatch = line.match(/score mate (-?\d+)/);
        const cpMatch   = line.match(/score cp (-?\d+)/);
        if (mateMatch) {
          lastDepthResult = { type: 'mate', value: parseInt(mateMatch[1], 10) };
        } else if (cpMatch) {
          lastDepthResult = { type: 'cp', value: parseInt(cpMatch[1], 10) };
        }
      }
      if (line.startsWith('bestmove')) {
        clearTimeout(timer);
        onLineCallback = null;
        resolve(lastDepthResult);
      }
    };

    onLineCallback = (line) => {
      if (line === 'readyok') {
        onLineCallback = analysisCallback;
        timer = setTimeout(() => { onLineCallback = null; resolve(lastDepthResult); }, 90000);
        engine.processCommand(`position fen ${fen}`);
        engine.processCommand(`go depth ${depth}`);
      }
    };

    engine.processCommand('stop');
    engine.processCommand('ucinewgame');
    engine.processCommand('isready');
  });
}

// ── FEN validation ────────────────────────────────────────────────────────────

function checkFen(fen) {
  try {
    const chess = new Chess(fen);
    const board = chess.board();
    let wk = null, bk = null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p?.type === 'k') { if (p.color === 'w') wk = [r, c]; else bk = [r, c]; }
      }
    }
    if (wk && bk && Math.abs(wk[0] - bk[0]) <= 1 && Math.abs(wk[1] - bk[1]) <= 1) return false;
    const justMoved = chess.turn() === 'w' ? 'b' : 'w';
    const parts = fen.split(' ');
    parts[1] = justMoved; parts[3] = '-';
    try { const c2 = new Chess(parts.join(' ')); if (c2.inCheck()) return false; } catch { /* ok */ }
    return true;
  } catch { return false; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const THRESHOLD_CP = 300; // +3 pawns or more for White

async function main() {
  const passed = [];
  const failed = [];
  const DEPTH = 14;

  console.log(`Verifying ${CANDIDATES.length} convert positions at depth ${DEPTH}...\n`);
  await initEngine();
  console.log('Engine ready.\n');

  for (const pos of CANDIDATES) {
    process.stdout.write(`  ${pos.id} … `);

    if (!checkFen(pos.fen)) {
      console.log('FAIL — invalid FEN');
      failed.push({ id: pos.id, reason: 'invalid FEN' });
      continue;
    }

    const chess = new Chess(pos.fen);
    if (chess.turn() !== 'w') {
      console.log('FAIL — not White to move');
      failed.push({ id: pos.id, reason: 'not White to move' });
      continue;
    }

    let evalResult;
    try {
      evalResult = await evalPosition(pos.fen, DEPTH);
    } catch (e) {
      console.log(`FAIL — engine error: ${e.message}`);
      failed.push({ id: pos.id, reason: 'engine error' });
      continue;
    }

    if (!evalResult) {
      console.log('FAIL — no eval');
      failed.push({ id: pos.id, reason: 'no eval returned' });
      continue;
    }

    // For White to move: cp is from White's perspective directly.
    // mate > 0 = White mates. mate < 0 = Black mates (fail).
    let pass = false;
    let evalStr = '';

    if (evalResult.type === 'mate') {
      pass = evalResult.value > 0;
      evalStr = `mate ${evalResult.value}`;
    } else {
      // cp is from side-to-move perspective from Stockfish (we're always White here)
      pass = evalResult.value >= THRESHOLD_CP;
      evalStr = `cp ${evalResult.value}`;
    }

    if (pass) {
      console.log(`PASS  [${evalStr}]`);
      passed.push(pos);
    } else {
      console.log(`FAIL  [${evalStr}] — need >= +${THRESHOLD_CP} cp`);
      failed.push({ id: pos.id, reason: `eval ${evalStr} below threshold` });
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`PASSED: ${passed.length}  FAILED: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed IDs (remove from src/data/convert.ts):');
    for (const f of failed) console.log(`  ✗  ${f.id}: ${f.reason}`);
  }

  console.log('\nPassing IDs:', passed.map(p => p.id).join(', '));
}

main().catch(console.error);
