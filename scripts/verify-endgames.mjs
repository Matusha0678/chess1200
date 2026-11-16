/**
 * Verify endgame positions: chess.js FEN validity + Stockfish depth-20 goal check.
 *
 * Usage: node scripts/verify-endgames.mjs
 *
 * Pass criteria:
 *   goal:'win'  → eval > +100 cp for the side to move (or mate announced)
 *   goal:'draw' → |eval| ≤ 60 cp
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = resolve(__dirname, '../node_modules/stockfish/bin/stockfish-19.js');

const { Chess } = require('chess.js');

// ── Candidate positions (40) ──────────────────────────────────────────────────

const CANDIDATES = [

  // ═══ KING AND PAWN ═══

  { id: 'kp-01', fen: '8/4P3/4K3/8/8/8/8/5k2 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'king_pawn',
    idea: 'Пешка на 7-й, король на 6-й. Одним ходом пешку в ферзи.' },

  { id: 'kp-02', fen: '8/8/8/8/8/8/4P3/4K1k1 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'king_pawn',
    idea: 'Выведи короля на e3–e4–e5, сопровождая пешку к превращению.' },

  { id: 'kp-03', fen: '8/8/8/p7/1k6/8/8/7K b - - 0 1',
    goal: 'win', difficulty: 1, category: 'king_pawn',
    idea: 'Правило квадрата: белый король вне зоны перехвата. Веди пешку к превращению.' },

  { id: 'kp-04', fen: '8/8/8/8/8/k7/p7/7K b - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Уведи короля с дороги пешки, а затем продвигай её к превращению.' },

  { id: 'kp-05', fen: '8/8/5K2/5P2/8/5k2/8/8 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король на 6-й горизонтали — ключевое поле занято. Поддержи пешку.' },

  { id: 'kp-06', fen: '8/8/8/4K3/8/4P3/8/4k3 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король далеко впереди пешки. Держи оппозицию и веди пешку.' },

  { id: 'kp-07', fen: '8/8/8/8/8/8/3P4/3K1k2 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Марш на ключевое поле перед пешкой определяет победу.' },

  { id: 'kp-08', fen: '8/8/8/8/8/8/5P2/5K1k w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Захвати ключевые поля f3–f4 и веди пешку при поддержке короля.' },

  // Opposition draw — black defends
  { id: 'kp-09', fen: '8/8/8/8/4k3/4P3/4K3/8 b - - 0 1',
    goal: 'draw', difficulty: 2, category: 'king_pawn',
    idea: 'Чёрный король перед пешкой — классическая ничья. Держи оппозицию.' },

  // Rook pawn stalemate draw
  { id: 'kp-10', fen: '8/8/8/8/8/k7/p7/K7 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'king_pawn',
    idea: 'Ладейная пешка заблокирована: любой ход короля даёт белым взять пешку. Ничья.' },

  // Wrong-rook-pawn draw (white has h-pawn + bishop wrong color)
  { id: 'kp-11', fen: '8/8/8/8/1P6/8/8/1K3k2 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король опередил — веди к ключевому полю b5, пешка следует за ним.' },

  { id: 'kp-12', fen: '8/8/8/3K4/8/3P4/8/3k4 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'king_pawn',
    idea: 'Король опередил чёрного. Оппозиция и ключевые поля d5–e5.' },

  // ═══ ROOK ENDGAMES ═══

  // Rook + King vs King
  { id: 're-01', fen: '8/8/8/8/4k3/8/8/4KR2 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'rook',
    idea: 'Ладья и король матуют одинокого короля: оттесняй к краю.' },

  // Rook + Pawn vs lone king (easy)
  { id: 're-02', fen: '8/8/8/8/8/8/3P4/3RK2k w - - 0 1',
    goal: 'win', difficulty: 1, category: 'rook',
    idea: 'Ладья отрезает короля по горизонтали. Пешка свободно продвигается.' },

  // Lucena
  { id: 're-03', fen: '1K1k4/1P6/8/8/8/8/r7/4R3 w - - 0 1',
    goal: 'win', difficulty: 3, category: 'rook',
    idea: 'Позиция Лусены: «строй мост» ладьёй, чтобы прикрыть короля от шахов.' },

  // Lucena variant — c-pawn
  { id: 're-04', fen: '2k5/2P5/2K5/8/8/8/8/R7 w - - 0 1',
    goal: 'win', difficulty: 3, category: 'rook',
    idea: 'Ладья на первой горизонтали, пешка рвётся в ферзи. Маневр для укрытия.' },

  // Philidor draw (black defends)
  { id: 're-05', fen: '8/8/r7/6k1/4P3/4K3/8/4R3 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'rook',
    idea: 'Метод Филидора: ладья на 6-й горизонтали. После Ke5 — на 1-ю для шахов.' },

  // Rook cuts off king — win for white
  { id: 're-06', fen: '8/8/8/8/3R4/8/3P4/3K3k w - - 0 1',
    goal: 'win', difficulty: 2, category: 'rook',
    idea: 'Ладья по горизонтали отрезает вражеского короля. Пешка проходит без помех.' },

  // Rook behind passed pawn
  { id: 're-07', fen: '8/8/8/8/8/P7/R7/K6k w - - 0 1',
    goal: 'win', difficulty: 1, category: 'rook',
    idea: 'Ладья позади проходной пешки — классический принцип Нимцовича.' },

  // R+P vs K — pawn about to queen
  { id: 're-08', fen: '8/8/8/8/8/8/3p1K2/r6k b - - 0 1',
    goal: 'win', difficulty: 2, category: 'rook',
    idea: 'Пешка d2 на пороге превращения. Дай шах ладьёй и проведи в ферзи.' },

  // Rook supports pawn advance
  { id: 're-09', fen: '8/8/8/8/8/8/P7/1R1K3k w - - 0 1',
    goal: 'win', difficulty: 2, category: 'rook',
    idea: 'Ладья на второй линии поддерживает пешку. Марш к превращению.' },

  // Active rook win (rook cuts off king by rank)
  { id: 're-10', fen: '8/8/8/8/3k4/8/3P4/3K1R2 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'rook',
    idea: 'Ладья по горизонтали отрезает вражеского короля. Пешка решает партию.' },

  // ═══ LIGHT PIECES ═══

  // B+P vs K — easy win
  { id: 'lp-01', fen: '8/8/8/8/8/5k2/4p3/4KB2 b - - 0 1',
    goal: 'win', difficulty: 2, category: 'light_pieces',
    idea: 'Слон контролирует поле превращения. Оттесни короля и проведи пешку.' },

  // Knight + Pawn vs K — win
  { id: 'lp-02', fen: '8/8/8/8/8/5k2/4p3/4KN2 b - - 0 1',
    goal: 'win', difficulty: 2, category: 'light_pieces',
    idea: 'Конь хуже слона в борьбе с пешкой. Отрежь вражеского короля королём.' },

  // Wrong-color bishop + rook pawn = draw
  { id: 'lp-03', fen: '8/8/8/8/8/8/6pB/5k1K b - - 0 1',
    goal: 'draw', difficulty: 2, category: 'light_pieces',
    idea: 'Слон не того цвета и ладейная пешка — классическая ничья: иди в угол h1.' },

  // Opposite-color bishops + pawn — draw
  { id: 'lp-04', fen: '8/8/8/8/3p4/8/4B3/3K1k2 b - - 0 1',
    goal: 'win', difficulty: 2, category: 'light_pieces',
    idea: 'Разноцветные слоны сложны, но пешка+король могут решить исход.' },

  // B + P vs B (same color = draw)
  { id: 'lp-05', fen: '8/8/8/8/8/8/p7/bk4KB b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'light_pieces',
    idea: 'Одноцветные слоны: белый слон контролирует поле превращения. Ищи пат или ничью.' },

  // N vs P endgame — win for pawn side
  { id: 'lp-06', fen: '8/8/8/8/8/5k2/6p1/5KN1 b - - 0 1',
    goal: 'win', difficulty: 2, category: 'light_pieces',
    idea: 'Конь не успевает остановить пешку при активном короле.' },

  // Bishop vs Knight — draw
  { id: 'lp-07', fen: '8/8/8/8/3n4/3k4/8/3KB3 w - - 0 1',
    goal: 'draw', difficulty: 2, category: 'light_pieces',
    idea: 'Конь против слона без пешек — теоретическая ничья.' },

  // ═══ QUEEN VS PAWN ═══

  // Queen wins easily vs central pawn
  { id: 'qp-01', fen: '8/8/8/8/8/5Q2/4p3/4k1K1 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'queen_vs_pawn',
    idea: 'Ферзь легко останавливает центральную пешку. Подведи короля и добей.' },

  // Queen vs e-pawn (win)
  { id: 'qp-02', fen: '8/8/8/8/8/8/4p3/4kQK1 w - - 0 1',
    goal: 'win', difficulty: 2, category: 'queen_vs_pawn',
    idea: 'Ферзь блокирует пешку. Техника: шаги к матуют при приближении белого короля.' },

  // Queen vs rook-pawn (a-pawn) — draw for weaker side
  { id: 'qp-03', fen: 'Q7/8/8/8/8/8/p7/k5K1 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'queen_vs_pawn',
    idea: 'Ладейная пешка на 2-й горизонтали — пат-ловушка. Король перед пешкой!' },

  // Queen vs c-pawn — draw for weaker side
  { id: 'qp-04', fen: 'Q7/8/8/8/8/8/2p5/2k3K1 b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'queen_vs_pawn',
    idea: 'Слоновая пешка на 2-й горизонтали: та же ничейная идея с патом.' },

  // Queen vs f-pawn — draw
  { id: 'qp-05', fen: 'Q7/8/8/8/8/8/5p2/5k1K b - - 0 1',
    goal: 'draw', difficulty: 3, category: 'queen_vs_pawn',
    idea: 'Слоновая пешка «f» на 2-й горизонтали — ещё один ничейный узор.' },

  // Queen easily wins vs d-pawn
  { id: 'qp-06', fen: '8/8/8/8/8/3Q4/3p4/3k1K2 w - - 0 1',
    goal: 'win', difficulty: 1, category: 'queen_vs_pawn',
    idea: 'Ферзь атакует пешку. Центральные пешки не спасают от потери.' },

  // Queen vs rook-pawn — draw from starting position
  { id: 'qp-07', fen: 'K6Q/8/8/8/8/8/7p/7k w - - 0 1',
    goal: 'draw', difficulty: 3, category: 'queen_vs_pawn',
    idea: 'h-пешка на 2-й горизонтали: теоретическая ничья — пат в углу h1.' },

  // Queen vs pawn — win with central pawn
  { id: 'qp-08', fen: '8/8/8/8/8/8/3p4/3k2KQ w - - 0 1',
    goal: 'win', difficulty: 2, category: 'queen_vs_pawn',
    idea: 'Ферзь и король атакуют пешку и одинокого короля. Мат неизбежен.' },
];

// ── Stockfish — single engine instance, sequential queue ─────────────────────

let engine = null;
let onLineCallback = null; // current position's line handler

function initEngine() {
  return new Promise((resolve) => {
    engine = require(ENGINE_PATH)();

    // The engine delivers all UCI output via engine.listener
    engine.listener = (line) => { if (onLineCallback) onLineCallback(line); };

    // Wait for readyok
    onLineCallback = (line) => {
      if (line === 'readyok') { onLineCallback = null; resolve(); }
    };

    // Give WASM ~800 ms to boot before sending UCI commands
    setTimeout(() => {
      engine.processCommand('uci');
      engine.processCommand('isready');
    }, 800);
  });
}

function evalPosition(fen, depth = 20) {
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

    // Send stop+ucinewgame first, then wait for readyok before starting analysis.
    // This prevents stray output from a previous evaluation triggering this callback.
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

// ── Verification ──────────────────────────────────────────────────────────────

function checkFen(fen) {
  try {
    const chess = new Chess(fen);
    // Adjacent kings check (chess.js doesn't catch this)
    const board = chess.board();
    let wk = null, bk = null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p?.type === 'k') { if (p.color === 'w') wk = [r, c]; else bk = [r, c]; }
      }
    }
    if (wk && bk && Math.abs(wk[0] - bk[0]) <= 1 && Math.abs(wk[1] - bk[1]) <= 1) return false;
    // The side that just moved (opposite of to-move) must not be in check
    const justMoved = chess.turn() === 'w' ? 'b' : 'w';
    const parts2 = fen.split(' ');
    parts2[1] = justMoved;
    parts2[3] = '-';
    try {
      const c2 = new Chess(parts2.join(' '));
      if (c2.inCheck()) return false;
    } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}

function evalMatchesGoal(evalResult, goal, sideToMove) {
  if (!evalResult) return false;

  if (evalResult.type === 'mate') {
    // mate N > 0 means the side to move is mating in N (win)
    // mate N < 0 means the side to move is being mated in N moves (lose)
    return goal === 'win' ? evalResult.value > 0 : false;
  }

  // cp is from WHITE's perspective
  const cpForSideToMove = sideToMove === 'w'
    ? evalResult.value
    : -evalResult.value;

  if (goal === 'win') return cpForSideToMove > 100;
  if (goal === 'draw') return Math.abs(cpForSideToMove) <= 60;
  return false;
}

async function main() {
  const passed = [];
  const failed = [];

  const DEPTH = 14;
  console.log(`Verifying ${CANDIDATES.length} positions at depth ${DEPTH}...\n`);
  await initEngine();
  console.log('Engine ready.\n');

  for (const pos of CANDIDATES) {
    process.stdout.write(`  ${pos.id} (${pos.goal}) … `);

    // Step 1: chess.js FEN validation
    if (!checkFen(pos.fen)) {
      console.log('FAIL — invalid FEN');
      failed.push({ id: pos.id, reason: 'invalid FEN' });
      continue;
    }

    const chess = new Chess(pos.fen);
    const sideToMove = chess.turn();

    // Step 2: Stockfish
    let evalResult;
    try {
      evalResult = await evalPosition(pos.fen, DEPTH);
    } catch (e) {
      console.log(`FAIL — engine error: ${e.message}`);
      failed.push({ id: pos.id, reason: 'engine error' });
      continue;
    }

    const ok = evalMatchesGoal(evalResult, pos.goal, sideToMove);
    const evalStr = evalResult
      ? (evalResult.type === 'mate'
          ? `mate ${evalResult.value}`
          : `cp ${evalResult.value} (for side=${sideToMove}: ${sideToMove === 'w' ? evalResult.value : -evalResult.value})`)
      : 'null';

    if (ok) {
      console.log(`PASS  [${evalStr}]`);
      passed.push(pos);
    } else {
      console.log(`FAIL  [${evalStr}] — goal=${pos.goal}`);
      failed.push({ id: pos.id, reason: `eval ${evalStr} doesn't match goal=${pos.goal}` });
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`PASSED: ${passed.length}  FAILED: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed positions (removed from dataset):');
    for (const f of failed) {
      console.log(`  ✗  ${f.id}: ${f.reason}`);
    }
  }

  console.log('\nPassing IDs:', passed.map(p => p.id).join(', '));

  // Output passing positions as TypeScript-ready JSON
  console.log('\n━━━ EXPORT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(JSON.stringify(passed, null, 2));
}

main().catch(console.error);
