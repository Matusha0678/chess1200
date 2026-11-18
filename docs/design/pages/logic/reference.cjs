/*
 * Эталонная реализация умной логики «Жертв» и «Проверки угроз» (LOGIC.md).
 * Это образец для переноса в TypeScript (src/lib/see.ts, sac-logic.ts, threat-logic.ts).
 * Код намеренно простой: одна функция = один пункт LOGIC.md.
 *
 * Запуск из корня проекта:
 *   node docs/design/pages/logic/reference.cjs            — все тесты (S1–S6, D1–D2, T1–T4, G1–G2)
 *   node docs/design/pages/logic/reference.cjs --only S1,T1
 *   node docs/design/pages/logic/reference.cjs --depth 16 — быстрее, но числа чуть другие
 * Параметры: --engine <путь к stockfish-19-lite-single.js>, --chess <путь к chess.js>
 * Время: около 1 минуты на глубине 18. Выход: 0 — все тесты прошли, 1 — нет.
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ───────────────────────── параметры ─────────────────────────
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const DEPTH = Number(arg('--depth', 18));
const ONLY = arg('--only', '') ? arg('--only').split(',') : null;
const ENGINE = arg('--engine', [
  path.join(process.cwd(), 'node_modules/stockfish/bin/stockfish-19-lite-single.js'),
  path.join(process.cwd(), 'public/stockfish/stockfish-19-lite-single.js'),
].find(p => fs.existsSync(p)));
const { Chess } = require(arg('--chess', 'chess.js'));

// ───────────────────────── движок ─────────────────────────
// analyse() возвращает линии, оценки — С ТОЧКИ ЗРЕНИЯ БЕЛЫХ: { move, pv[], cp | null, mate | null }
class Engine {
  constructor(file) {
    this.p = spawn(process.execPath, [file], { cwd: path.dirname(file), stdio: ['pipe', 'pipe', 'inherit'] });
    this.buf = ''; this.lines = []; this.waiter = null;
    this.p.stdout.on('data', d => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        this.lines.push(l);
        if (this.waiter && this.waiter.re.test(l)) { const w = this.waiter; this.waiter = null; w.resolve(this.lines); this.lines = []; }
      }
    });
  }
  send(c) { this.p.stdin.write(c + '\n'); }
  until(re) { return new Promise(resolve => { this.waiter = { re, resolve }; }); }
  async init() {
    this.send('uci'); await this.until(/^uciok/);
    this.send('setoption name Skill Level value 20');
    this.send('setoption name Hash value 32');
  }
  async analyse(fen, { multipv = 1, depth = DEPTH, searchmoves = null } = {}) {
    this.send('ucinewgame');                         // чистый хеш → результат не зависит от прошлых расчётов
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send('isready'); await this.until(/^readyok/);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}` + (searchmoves ? ` searchmoves ${searchmoves.join(' ')}` : ''));
    const out = await this.until(/^bestmove/);
    const stm = fen.split(' ')[1];
    const last = {};
    for (const l of out) {
      if (!l.startsWith('info ') || !l.includes(' pv ') || / (upper|lower)bound /.test(l)) continue;
      const d = Number(l.match(/ depth (\d+)/)[1]);
      const k = Number((l.match(/ multipv (\d+)/) || [0, 1])[1]);
      if (!last[k] || d >= last[k].d) last[k] = { d, l };
    }
    return Object.keys(last).sort((a, b) => a - b).map(k => {
      const l = last[k].l;
      const sc = l.match(/score (cp|mate) (-?\d+)/);
      const sgn = stm === 'w' ? 1 : -1;
      const pv = l.split(' pv ')[1].trim().split(/\s+/);
      return { move: pv[0], pv, cp: sc[1] === 'cp' ? sgn * Number(sc[2]) : null, mate: sc[1] === 'mate' ? sgn * Number(sc[2]) : null };
    });
  }
  quit() { this.send('quit'); }
}

// Оценка в пешках за сторону side. Мат в N = ±(100 − N), чтобы разница между матами считалась.
const pawnsWhite = s => (s.mate !== null ? Math.sign(s.mate) * (100 - Math.abs(s.mate)) : s.cp / 100);
const forSide = (s, side) => (side === 'w' ? 1 : -1) * pawnsWhite(s);
const isMateFor = (s, side) => s.mate !== null && Math.sign(s.mate) === (side === 'w' ? 1 : -1);
// Шансы на победу 0..1 за сторону side (та же формула, что в классификации ходов).
const wp = (s, side) => (s.mate !== null ? (isMateFor(s, side) ? 1 : 0) : 1 / (1 + Math.exp(-0.00368208 * (side === 'w' ? s.cp : -s.cp))));
const fmt = (s, side) => (s.mate !== null ? `${isMateFor(s, side) ? '' : '−'}M${Math.abs(s.mate)}` : forSide(s, side).toFixed(2));

// ───────────────────────── шахматные помощники ─────────────────────────
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const other = c => (c === 'w' ? 'b' : 'w');

function material(fen, side) {
  let s = 0;
  for (const row of new Chess(fen).board()) for (const q of row) if (q) s += (q.color === side ? 1 : -1) * VAL[q.type];
  return s;
}
function squaresOf(chess, color, types) {
  const out = [];
  for (const row of chess.board()) for (const q of row) if (q && q.color === color && types.includes(q.type)) out.push(q.square);
  return out;
}
function kingSquare(chess, color) { return squaresOf(chess, color, ['k'])[0]; }
function dist(a, b) { return Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1]))); }
function nullFen(fen) { const p = fen.split(' '); p[1] = other(p[1]); p[3] = '-'; return p.join(' '); }
function uciOf(m) { return m.from + m.to + (m.promotion || ''); }

// Проиграть линию UCI. Возвращает позиции (fens[0] — старт) и ходы chess.js (verbose).
function play(fen, ucis, n = ucis.length) {
  const c = new Chess(fen);
  const fens = [c.fen()], moves = [];
  for (const u of ucis.slice(0, n)) {
    let m = null;
    try { m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); } catch { m = null; }
    if (!m) break;
    moves.push(m); fens.push(c.fen());
  }
  return { fens, moves, sans: moves.map(m => m.san) };
}

// SEE: сколько чистого материала выигрывает сторона, ЧЕЙ ХОД, если начнёт брать на sq
// (бьём всегда самой дешёвой фигурой, каждая сторона может остановиться). 0 — брать невыгодно или нечем.
// Только легальные взятия → связки и шахи учтены, дальнобойные «рентгены» открываются сами.
function see(fen, sq) {
  const c = new Chess(fen);
  const target = c.get(sq);
  if (!target) return 0;
  const cost = t => (t === 'k' ? 100 : VAL[t]);
  const gains = [];
  let onSquare = VAL[target.type], d = 0;
  for (;;) {
    const caps = c.moves({ verbose: true }).filter(m => m.to === sq && m.captured);
    if (!caps.length) break;
    caps.sort((a, b) => cost(a.piece) - cost(b.piece));
    gains[d] = onSquare - (d ? gains[d - 1] : 0);
    onSquare = VAL[caps[0].promotion || caps[0].piece];
    c.move(caps[0]);
    d++;
  }
  if (!d) return 0;
  while (--d > 0) gains[d - 1] = -Math.max(-gains[d - 1], gains[d]);
  return Math.max(0, gains[0]);
}

// ═════════════════════════ 1. ЖЕРТВЫ ═════════════════════════

// 1.1 А, шаги 1–4: быстрый фильтр без движка.
function quickSac(fen, uci) {
  const c = new Chess(fen);
  const S = c.turn();
  const piece = c.get(uci.slice(0, 2));
  if (!piece || piece.color !== S) return { ok: false, reason: 'нет фигуры' };
  if (piece.type === 'p') return { ok: false, reason: 'ход пешкой' };
  if (piece.type === 'k') return { ok: false, reason: 'ход королём' };
  const victim = c.get(uci.slice(2, 4));
  const took = victim ? VAL[victim.type] : 0;
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  if (c.isCheckmate()) return { ok: false, reason: 'это сразу мат, а не жертва' };
  const fenAfter = c.fen();
  // какую мою фигуру (не пешку) соперник может забрать с выгодой
  let best = null;
  for (const sq of squaresOf(c, S, ['n', 'b', 'r', 'q'])) {
    const gain = see(fenAfter, sq);
    if (gain < 2) continue;
    const d2 = took - VAL[c.get(sq).type];          // я взял − у меня забирают
    if (d2 > -2) continue;
    const better = !best || VAL[c.get(sq).type] > VAL[c.get(best.sq).type] || (VAL[c.get(sq).type] === VAL[c.get(best.sq).type] && sq === m.to);
    if (better) best = { sq, gain, d2 };
  }
  if (!best) return { ok: false, reason: took ? 'размен или выгодное взятие' : 'соперник ничего не выигрывает' };
  // шаг 4: «отчаянная» фигура — её и так уже выигрывают, а уйти ей некуда
  const origin = best.sq === m.to ? m.from : best.sq;
  if (doomed(fen, origin, uci)) return { ok: false, reason: 'фигура и так погибала (атакована, уйти некуда)' };
  return { ok: true, S, san: m.san, move: m, fenAfter, sacSquare: best.sq, sacPiece: c.get(best.sq).type, took };
}

// Материал после «успокоения»: 10 полуходов, дальше — пока последний ход был взятием (до 14).
function settledDelta(fen, line, side) {
  const p = play(fen, line, 14);
  let k = Math.min(10, p.moves.length);
  while (k < p.moves.length && k < 14 && p.moves[k - 1].captured) k++;
  return material(p.fens[k], side) - material(fen, side);
}

// 1.1 шаг 4: фигура обречена, если соперник уже может её выиграть (SEE при его ходе ≥ 2)
// и ни один её ход (кроме самой жертвы) не уводит её на безопасное поле.
function doomed(fen, sq, sacUci) {
  if (see(nullFen(fen), sq) < 2) return false;
  for (const m of new Chess(fen).moves({ square: sq, verbose: true })) {
    if (uciOf(m) === sacUci) continue;
    const c = new Chess(fen); c.move(m);
    if (see(c.fen(), m.to) < 2) return false;
  }
  return true;
}

// 1.1 Б (шаги 5–8), 1.2–1.6: полный анализ одного кандидата.
async function analyseSac(engine, fen, uci, { fromMaster = true, before = null } = {}) {
  const q = quickSac(fen, uci);
  if (!q.ok) return { isSac: false, stage: 'фильтр', reason: q.reason };
  const { S, fenAfter, sacSquare, sacPiece } = q;
  const O = other(S);

  before = before || await engine.analyse(fen, { multipv: 2 });
  const best = before[0];
  const alt = best.move === uci ? before[1] : best;  // лучший ход БЕЗ жертвы
  if (!alt) return { isSac: false, stage: 'движок', reason: 'единственный ход' };
  // оценка самой жертвы — тем же корневым расчётом, что и best (иначе числа несравнимы)
  const cand = best.move === uci ? best : (await engine.analyse(fen, { multipv: 1, searchmoves: [uci] }))[0];
  const afterLines = await engine.analyse(fenAfter, { multipv: 2 }); // 2 главных ответа соперника — для текста

  // шаг 5: линия «жертву приняли» — соперник ОБЯЗАТЕЛЬНО берёт (лучшее из взятий на клетке жертвы)
  const caps = new Chess(fenAfter).moves({ verbose: true }).filter(m => m.to === sacSquare && m.captured).map(uciOf);
  if (!caps.length) return { isSac: false, stage: 'движок', reason: 'жертву нельзя взять' };
  const acc = (await engine.analyse(fenAfter, { multipv: 1, searchmoves: caps }))[0];
  const accLine = [uci, ...acc.pv];
  const accPlay = play(fen, accLine, 12);
  const d = k => material(accPlay.fens[Math.min(k, accPlay.fens.length - 1)], S) - material(fen, S);
  const accMate = isMateFor(acc, S);
  const res = {
    S, san: q.san, sacSquare, sacPiece,
    best: fmt(best, S), bestSan: play(fen, [best.move]).sans[0],
    alt: fmt(alt, S), altSan: play(fen, [alt.move]).sans[0],
    after: fmt(cand, S), accepted: accPlay.sans.slice(0, 8).join(' '),
    deltas: accPlay.fens.slice(1, 11).map((f, i) => d(i + 1)).join(' '),
  };
  // шаг 7
  if (d(2) > -2) return { isSac: false, stage: 'движок', reason: 'после взятия материал не отдан', ...res };
  // шаг 8: через ход материал снова поровну (0 или +1) — это размен, а не жертва.
  // (если d(4) ≥ +2 — соперник, взяв, теряет ещё больше: это комбинация, оставляем)
  if (!accMate && d(4) >= 0 && d(4) <= 1) return { isSac: false, stage: 'движок', reason: 'материал сразу возвращается — это размен', ...res };

  // ── дальше это точно жертва; ниже — годится ли она для тренажёра ──

  // 1.2 тип: мат (форсированный или если взять) → комбинация (материал вернулся) → настоящая жертва
  const mateForced = isMateFor(cand, S) && Math.abs(cand.mate) <= 6;
  const mateIfTaken = accMate && Math.abs(acc.mate) + 1 <= 6;
  const mate_in = mateForced ? Math.abs(cand.mate) : mateIfTaken ? Math.abs(acc.mate) + 1 : null;
  const settled = settledDelta(fen, accLine, S);
  const type = mate_in ? 'mate' : settled >= 0 ? 'combination' : 'real';

  // 1.3 работает или нет — по шансам на победу (как классификация ходов), а не по пешкам
  const wBest = wp(best, S), wCand = wp(cand, S), wAlt = wp(alt, S);
  let kind = null;
  if (wBest - wCand <= 0.02 && wCand - wAlt >= 0.05 && wCand >= 0.45) kind = 'works';
  else if (wBest - wCand >= 0.10 && wCand <= 0.55) kind = 'fails';

  // 1.4 годится ли для тренажёра
  let notKept = null;
  if (isMateFor(alt, S) && !(isMateFor(cand, S) && Math.abs(cand.mate) < Math.abs(alt.mate))) notKept = 'без жертвы есть мат не дольше';
  else if (kind === null) notKept = 'спорно: жертва не явно лучше и не явно хуже';

  // 1.5 название идеи
  const c0 = new Chess(fen);
  const oppKing = kingSquare(c0, O);
  const givesCheck = q.move.san.includes('+') || q.move.san.includes('#');
  const given = -d(2);
  let pattern = 'other';
  if (sacPiece === 'b' && q.move.to === (S === 'w' ? 'h7' : 'h2') && oppKing === (S === 'w' ? 'g8' : 'g1') && givesCheck) pattern = 'greek_gift';
  else if (q.move.to === (S === 'w' ? 'f7' : 'f2') && dist(q.move.to, oppKing) <= 1) pattern = 'f7';
  else if (sacPiece === 'q') pattern = 'queen';
  else if (sacPiece === 'r' && given === 2) pattern = 'exchange';
  else if (dist(sacSquare, oppKing) <= 2) pattern = 'king_attack';

  // 1.6 интересность
  const myChecks = accPlay.moves.slice(0, 6).filter((m, i) => i % 2 === 0 && /[+#]/.test(m.san)).length;
  const quiet = !q.move.captured && !givesCheck;
  const pieces = col => squaresOf(c0, col, ['n', 'b', 'r', 'q']);
  const endgame = squaresOf(c0, 'w', ['q']).length + squaresOf(c0, 'b', ['q']).length === 0 && pieces('w').length <= 2 && pieces('b').length <= 2;
  const score = 10 * given + (type === 'mate' ? 25 : 0) + (pattern !== 'other' ? 10 : 0) + (dist(sacSquare, oppKing) <= 2 ? 10 : 0)
    + 5 * Math.min(3, myChecks) + (quiet ? 10 : 0) + (type === 'real' ? 10 : 0) + (fromMaster ? 5 : 0) - (endgame ? 15 : 0);

  return {
    isSac: true, type, kind, pattern, given, score, settled,
    mate_in, mate_forced: mateForced,
    keep: !notKept && score >= 30, notKept: notKept || (score < 30 ? 'неинтересно (score < 30)' : null),
    defenses: afterLines.map(l => play(fenAfter, l.pv, 5).sans.join(' ')),
    ...res,
  };
}

// 1.7: соблазнительные ходы для приманок — взятия и шахи фигурой (не пешкой) рядом с королём
// соперника (≤ 2 клетки), которые проходят быстрый фильтр жертвы. Без движка.
function temptingMoves(fen) {
  const c = new Chess(fen);
  const k = kingSquare(c, other(c.turn()));
  return c.moves({ verbose: true })
    .filter(m => 'nbrq'.includes(m.piece) && (m.captured || /[+#]/.test(m.san)) && dist(m.to, k) <= 2)
    .map(uciOf)
    .filter(u => quickSac(fen, u).ok);
}

// ═════════════════════════ 2. УГРОЗЫ ═════════════════════════

// 2.1–2.4: угроза в позиции, где ход мой (соперник только что сходил).
async function analyseThreat(engine, fen) {
  const c = new Chess(fen);
  const me = c.turn(), opp = other(me);
  if (c.inCheck()) return { usable: false, reason: 'мне шах — не берём' };
  const cur = (await engine.analyse(fen))[0];
  const nf = nullFen(fen);
  const nul = (await engine.analyse(nf))[0];
  const gain = forSide(nul, opp) - forSide(cur, opp);   // обе оценки — ЗА СОПЕРНИКА
  const mateNul = isMateFor(nul, opp);
  const line = play(nf, nul.pv, 6);
  const T = line.moves[0];
  if (!T) return { usable: false, reason: 'у соперника нет ходов' };
  const base = { cur: fmt(cur, me), nul: fmt(nul, opp), gain: Number(gain.toFixed(2)), line: line.sans.join(' ') };
  const big = gain >= 1.5 || mateNul;
  if (!big) return { usable: true, hasThreat: false, decoyOk: gain < 0.5, ...base };

  const matGain3 = material(line.fens[Math.min(3, line.fens.length - 1)], opp) - material(nf, opp);
  const concrete = !!T.captured || /[+#]/.test(T.san) || mateNul || matGain3 >= 2;
  if (!concrete) return { usable: false, reason: 'угроза не конкретная (позиционная)', ...base };

  // 2.2 цели. Следим, где оказались мои фигуры, чтобы назвать исходную клетку.
  const where = {};                                  // текущая клетка → исходная
  for (const row of new Chess(nf).board()) for (const q of row) if (q && q.color === me) where[q.square] = q.square;
  const captured = [];                               // { ply, sq, type }
  line.moves.forEach((m, i) => {
    if (m.color === me) { if (where[m.from]) { where[m.to] = where[m.from]; delete where[m.from]; } return; }
    if (m.captured) {
      const capSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
      if (where[capSq]) { captured.push({ ply: i + 1, sq: where[capSq], type: m.captured }); delete where[capSq]; }
    }
  });
  const required = new Set(), optional = new Set();
  const cNull = new Chess(nf);
  const c1 = new Chess(line.fens[1]);                // после хода-угрозы (ход снова мой)
  const myKing = kingSquare(c1, me);

  // (1) то, что бьёт сам ход-угроза
  if (T.captured) required.add(T.to);
  // (2) вилка: сходившая фигура бьёт ≥ 2 ценные цели (король считается)
  const attackedByT = squaresOf(c1, me, ['n', 'b', 'r', 'q', 'k']).filter(sq => c1.attackers(sq, opp).includes(T.to));
  const winnable = attackedByT.filter(sq => {
    const t = c1.get(sq).type;
    if (t === 'k') return true;
    return c1.attackers(sq, me).length === 0 || VAL[t] > VAL[T.piece];
  });
  const fork = winnable.length >= 2 && winnable.some(sq => c1.get(sq).type !== 'k');
  if (fork) for (const sq of winnable) if (c1.get(sq).type !== 'k') required.add(sq);
  // (3) ход-угроза ничего не берёт → ценные фигуры, которые соперник забирает 2-м ходом (вскрытое, связка, ловля…)
  for (const x of captured) {
    if (x.ply !== 3) continue;
    if (!T.captured && matGain3 >= 2 && VAL[x.type] >= 3) required.add(x.sq);
  }
  // (4) мат — король
  if (mateNul) required.add(myKing);
  // необязательные: король при шахе; фигуры, взятые 2-м ходом и не попавшие в обязательные
  if (/[+]/.test(T.san) && !required.has(myKing)) optional.add(myKing);
  for (const x of captured) if (x.ply === 3 && !required.has(x.sq)) optional.add(x.sq);
  if (!required.size) return { usable: false, reason: 'нечего отмечать', ...base };

  // 2.3 мотив
  const backRank = me === 'w' ? '1' : '8';
  const lastMate = line.moves.find(m => m.san.includes('#'));
  let motif;
  const targetsAfter = [...required].filter(sq => sq !== T.to);
  const newAttack = sq => c1.attackers(sq, opp).some(a => a !== T.to && !cNull.attackers(sq, opp).includes(a));
  if (mateNul && lastMate && lastMate.to[1] === backRank && myKing[1] === backRank && 'rq'.includes(lastMate.piece)) motif = 'back_rank';
  else if (mateNul) motif = 'mate';
  else if (fork) motif = 'fork';
  else if (targetsAfter.some(newAttack) || (/[+]/.test(T.san) && newAttack(myKing))) motif = 'discovered';
  else if (targetsAfter.some(sq => isSkewered(c1, T, sq, me))) motif = 'skewer';
  else if (targetsAfter.some(sq => isPinned(c1, sq, me))) motif = 'pin';
  else if (targetsAfter.some(sq => isTrapped(c1, sq, opp))) motif = 'trapped';
  else if (T.captured && cNull.attackers(T.to, me).length === 0) motif = 'hanging';
  else if (T.captured && VAL[T.captured] > VAL[T.piece]) motif = 'cheaper';
  else motif = 'material';

  // 2.4 сложность
  const quietT = !T.captured && !/[+#]/.test(T.san);
  let difficulty = 2;
  if (['hanging', 'cheaper'].includes(motif) || (mateNul && Math.abs(nul.mate) === 1)) difficulty = 1;
  if ((mateNul && Math.abs(nul.mate) >= 2) || quietT) difficulty = 3;

  return {
    usable: true, hasThreat: true, T: T.san, attacker: T.from,
    targets: [...required].sort(), optional: [...optional].sort(),
    motif, title: motifTitle(motif, T), difficulty,
    mate_in: mateNul ? Math.abs(nul.mate) : null, ...base,
  };
}

// Связка: если убрать фигуру, моего короля/ферзя атакуют.
function isPinned(c1, sq, me) {
  const c = new Chess(c1.fen());
  const piece = c.remove(sq);
  if (!piece) return false;
  const opp = other(me);
  const k = kingSquare(c, me);
  if (c.attackers(k, opp).length > new Chess(c1.fen()).attackers(k, opp).length) return true;
  return squaresOf(c, me, ['q']).some(qs => qs !== sq && c.attackers(qs, opp).length > new Chess(c1.fen()).attackers(qs, opp).length);
}
// Сквозной удар: дальнобойная фигура хода-угрозы бьёт короля/ферзя, за ним на той же линии — цель.
function isSkewered(c1, T, sq, me) {
  if (!'brq'.includes(T.piece)) return false;
  for (const front of squaresOf(c1, me, ['k', 'q'])) {
    if (!c1.attackers(front, other(me)).includes(T.to)) continue;
    const df = Math.sign(front.charCodeAt(0) - T.to.charCodeAt(0)), dr = Math.sign(Number(front[1]) - Number(T.to[1]));
    let f = front.charCodeAt(0) + df, r = Number(front[1]) + dr;
    while (f >= 97 && f <= 104 && r >= 1 && r <= 8) {
      const s = String.fromCharCode(f) + r;
      const p = c1.get(s);
      if (p) return s === sq && p.color === me;
      f += df; r += dr;
    }
  }
  return false;
}
// Ловля: фигуру атакуют, а все её ходы — на битые поля.
function isTrapped(c1, sq, opp) {
  if (!c1.attackers(sq, opp).length) return false;
  const moves = c1.moves({ square: sq, verbose: true });
  return moves.every(m => { const c = new Chess(c1.fen()); c.move(m); return c.attackers(m.to, opp).length > 0; });
}
function motifTitle(motif, T) {
  const INSTR = { p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём' };
  const GEN = { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля' };
  const ACC = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };
  switch (motif) {
    case 'back_rank': return 'Мат по последней горизонтали';
    case 'mate': return 'Угроза мата';
    case 'fork': return `Вилка ${INSTR[T.piece]}`;
    case 'discovered': return 'Вскрытое нападение';
    case 'skewer': return 'Сквозной удар';
    case 'pin': return 'Связка';
    case 'trapped': return 'Ловля фигуры';
    case 'hanging': return `Зевок ${GEN[T.captured]}`;
    case 'cheaper': return `Нападение на ${ACC[T.captured]}`;
    default: return 'Выигрыш материала';
  }
}

// ═════════════════════════ тесты ═════════════════════════
const SAC_TESTS = [
  { id: 'S1', name: 'греческая жертва', fen: 'r1bq1rk1/pppnbppp/2n1p3/3pP3/3P3P/2NB1N2/PPP2PP1/R1BQK2R w KQ - 0 8', move: 'd3h7',
    expect: { isSac: true, type: 'combination', kind: 'works', pattern: 'greek_gift', given: 2 } },
  { id: 'S2', name: 'Bxh7+, когда конь f6 защищает', fen: 'r1bq1rk1/ppp1bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 0 7', move: 'd3h7',
    expect: { isSac: true, kind: 'fails', pattern: 'greek_gift' } },
  { id: 'S3', name: 'размен Bxc6', fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4', move: 'b5c6',
    expect: { isSac: false } },
  { id: 'S4', name: 'ход пешкой c4', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2', move: 'c2c4',
    expect: { isSac: false } },
  { id: 'S5', name: 'ферзь за ладью с матом', fen: 'r3r1k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1', move: 'e2e8',
    expect: { isSac: true, type: 'mate', kind: 'works', mate_in: 2, pattern: 'queen' } },
  { id: 'S6', name: 'запертый слон берёт пешку', fen: 'r3k2r/B1p2ppp/1p6/8/8/8/1PP2PPP/3RK2R w - - 0 1', move: 'a7b6',
    expect: { isSac: false } },
];
// D: генератор приманок (без движка)
const DECOY_TESTS = [
  { id: 'D1', name: 'соблазн Bxh7+ в позиции S2', fen: 'r1bq1rk1/ppp1bppp/2n1pn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 0 7', expect: ['d3h7'] },
  { id: 'D2', name: 'после 1.e4 e5 2.Nf3 Nc6 соблазнов нет', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', expect: [] },
];
const THREAT_TESTS = [
  { id: 'T1', name: 'вилка Nxc7+', fen: 'r3k2r/ppp2pb1/5q2/1N1P2pp/2B1P3/3Q1b2/PP3P2/R3K1R1 b - - 0 20',
    expect: { hasThreat: true, T: 'Nxc7+', targets: ['a8', 'c7'], optional: ['e8'], motif: 'fork', difficulty: 2 } },
  { id: 'T2', name: 'ферзь под конём (1.e4 d5 2.exd5 Qxd5 3.Nc3)', fen: 'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3',
    expect: { hasThreat: true, T: 'Nxd5', targets: ['d5'], motif: 'hanging', difficulty: 1 } },
  { id: 'T3', name: 'мат по последней горизонтали', fen: '6k1/5ppp/8/8/8/8/r4PPP/4R1K1 b - - 0 1',
    expect: { hasThreat: true, T: 'Re8#', targets: ['g8'], motif: 'back_rank', difficulty: 1 } },
  { id: 'T4', name: 'нет угрозы (после 1.e4)', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    expect: { hasThreat: false } },
];
// G1, G2: партии-образцы. Детектор должен найти ровно эти жертвы (обе стороны) и ничего больше.
const GAME_TESTS = [
  { id: 'G1', name: 'Морфи — герцог и граф, 1858',
    pgn: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#',
    expectSacs: ['10. Nxb5', '13. Rxd7', '16. Qb8+'] },
  { id: 'G2', name: 'Андерсен — Дюфрень, 1852 («Вечнозелёная»)',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#',
    expectSacs: ['17. Nf6+', '20. Rxe7+', '21. Qxd7+'] },
];

function check(got, expect) {
  const bad = [];
  for (const [k, v] of Object.entries(expect)) {
    const g = got[k];
    const same = Array.isArray(v) ? JSON.stringify(g) === JSON.stringify(v) : g === v;
    if (!same) bad.push(`${k}: ждали ${JSON.stringify(v)}, получили ${JSON.stringify(g)}`);
  }
  return bad;
}
const want = id => !ONLY || ONLY.includes(id);

(async () => {
  if (!ENGINE) { console.error('Не найден stockfish-19-lite-single.js — укажи --engine'); process.exit(2); }
  const engine = new Engine(ENGINE);
  await engine.init();
  console.log(`Глубина ${DEPTH}\n`);
  let pass = 0, total = 0;
  const t0 = Date.now();

  for (const t of SAC_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const r = await analyseSac(engine, t.fen, t.move);
    const bad = check(r, t.expect);
    if (!bad.length) pass++;
    console.log(`${bad.length ? '✗' : '✓'} ${t.id} ${t.name}: ${r.isSac ? `жертва · тип ${r.type} · ${r.kind ?? 'спорно'} · ${r.pattern} · отдал ${r.given}${r.mate_in ? ` · мат за ${r.mate_in}${r.mate_forced ? '' : ' (если взять)'}` : ''} · score ${r.score} · ${r.keep ? 'в тренажёр' : `не берём (${r.notKept})`}` : `не жертва — ${r.reason}`}`);
    if (r.best) console.log(`    лучший ${r.bestSan} ${r.best} · без жертвы ${r.altSan} ${r.alt} · после хода ${r.after}`);
    if (r.accepted) console.log(`    приняли: ${r.accepted}\n    материал по полуходам: ${r.deltas}`);
    for (const b of bad) console.log(`    ОШИБКА ${b}`);
  }
  for (const t of DECOY_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const got = temptingMoves(t.fen);
    const ok = JSON.stringify(got) === JSON.stringify(t.expect);
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} ${t.id} ${t.name}: ${got.join(', ') || 'нет'}${ok ? '' : `\n    ОШИБКА ждали ${t.expect.join(', ') || 'нет'}`}`);
  }
  for (const t of THREAT_TESTS) {
    if (!want(t.id)) continue;
    total++;
    const r = await analyseThreat(engine, t.fen);
    const bad = check(r, t.expect);
    if (!bad.length) pass++;
    console.log(`${bad.length ? '✗' : '✓'} ${t.id} ${t.name}: ${r.hasThreat ? `угроза ${r.T} · цели ${r.targets.join(',')}${r.optional.length ? ` (+можно ${r.optional.join(',')})` : ''} · ${r.title} · сложность ${r.difficulty}` : r.usable === false ? `не берём — ${r.reason}` : 'угрозы нет'}`);
    console.log(`    сейчас ${r.cur} (за ходящего) · нулевой ход ${r.nul} (за соперника) · gain ${r.gain} · линия ${r.line}`);
    for (const b of bad) console.log(`    ОШИБКА ${b}`);
  }
  for (const G of GAME_TESTS) {
    if (!want(G.id)) continue;
    total++;
    const g = new Chess(); g.loadPgn(G.pgn);
    const hist = g.history({ verbose: true });
    const found = [], rejected = [];
    for (let i = 0; i < hist.length; i++) {
      const m = hist[i];
      const label = `${Math.floor(i / 2) + 1}.${i % 2 ? '..' : ''} ${m.san}`;
      if (!quickSac(m.before, uciOf(m)).ok) continue;   // быстрый фильтр без движка
      const r = await analyseSac(engine, m.before, uciOf(m));
      if (r.isSac) found.push({ label, r }); else rejected.push({ label, r });
    }
    const labels = found.map(x => x.label);
    const ok = !G.expectSacs || JSON.stringify(labels) === JSON.stringify(G.expectSacs);
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} ${G.id} ${G.name}: жертвы — ${labels.join(', ') || 'нет'}`);
    for (const { label, r } of found) console.log(`    ${label}: тип ${r.type} · ${r.kind ?? 'спорно'} · ${r.pattern} · отдал ${r.given}${r.mate_in ? ` · мат за ${r.mate_in}${r.mate_forced ? '' : ' (если взять)'}` : ''} · score ${r.score} · ${r.keep ? 'в тренажёр' : `не берём (${r.notKept})`}\n      лучший ${r.bestSan} ${r.best} · без жертвы ${r.altSan} ${r.alt} · после ${r.after}\n      приняли: ${r.accepted}`);
    for (const { label, r } of rejected) console.log(`    отсеяно ${label}: ${r.reason}${r.best ? `\n      лучший ${r.bestSan} ${r.best} · без жертвы ${r.altSan} ${r.alt} · после ${r.after}\n      приняли: ${r.accepted}` : ''}`);
    if (!ok) console.log(`    ОШИБКА ждали ${G.expectSacs.join(', ')}`);
  }
  console.log(`\nИтог: ${pass} из ${total} · ${Math.round((Date.now() - t0) / 1000)} с`);
  engine.quit();
  setTimeout(() => process.exit(pass === total ? 0 : 1), 200);
})();
