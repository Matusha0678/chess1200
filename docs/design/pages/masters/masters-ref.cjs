// Эталон логики «Угадай ход» на странице партии мастера (MASTERS.md).
// Запуск: node docs/design/pages/masters/masters-ref.cjs  →  «все тесты: OK»
// Перенеси в src/lib/masters.ts, тесты — в scripts/test-masters.ts (добавь в test:logic).
'use strict';
const path = require('path');
let Chess;
try { ({ Chess } = require('chess.js')); } catch { ({ Chess } = require(path.resolve('node_modules/chess.js'))); }

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE = { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля' };
const PIECE_ACC = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };

// ── Признаки хода ───────────────────────────────────────────────────────────
/** Сколько выигрывает сторона, которая ходит, разменами на поле sq (по самому дешёвому нападающему). */
function see(fen, sq) {
  const c = new Chess(fen);
  const target = c.get(sq);
  if (!target) return 0;
  const att = c.moves({ verbose: true }).filter(m => m.to === sq && m.captured);
  if (!att.length) return 0;
  att.sort((a, b) => VAL[a.piece] - VAL[b.piece]);
  const m = att[0];
  c.move({ from: m.from, to: m.to, promotion: 'q' });
  return Math.max(0, VAL[target.type] - see(c.fen(), sq));
}
/**
 * Признаки хода uci из позиции fen. prevTo — поле, куда пришёл прошлый ход соперника (для «отыгрыша»).
 * sac — соперник выигрывает разменом на поле хода больше, чем мы взяли: фигура — от 2, пешка — от 1.
 * recapture — взятие на поле, куда только что пришёл соперник (обычный отыгрыш, не спрашиваем).
 */
function moveTraits(fen, uci, prevTo = null) {
  const c = new Chess(fen);
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  const check = c.inCheck(), mate = c.isCheckmate();
  const took = m.captured ? VAL[m.captured] : 0;
  const loss = see(c.fen(), m.to);
  const sac = !mate && loss - took >= (m.piece === 'p' ? 1 : 2);
  return { san: m.san, piece: m.piece, captured: m.captured || null, check, mate, capture: !!m.captured, sac,
    recapture: !!m.captured && prevTo === m.to };
}

// ── Партия ──────────────────────────────────────────────────────────────────
/** Ходы партии с позициями до хода, пометками !/!! и комментариями. */
function parseGame(pgn) {
  const g = new Chess();
  g.loadPgn(pgn);
  const hist = g.history({ verbose: true });
  // пометки и комментарии по порядку ходов основной линии
  let t = pgn.replace(/\[[^\]]*\]/g, ' ');
  const comments = [];
  t = t.replace(/\{([^}]*)\}/g, (_, c) => { comments.push(c.trim()); return ` {${comments.length - 1}} `; });
  for (let i = 0; i < 4; i++) t = t.replace(/\([^()]*\)/g, ' ');
  const toks = t.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(x => x && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(x));
  const marks = [], notes = [];
  let k = -1;
  for (const tok of toks) {
    const cm = tok.match(/^\{(\d+)\}$/);
    if (cm) { if (k >= 0) notes[k] = comments[+cm[1]]; continue; }
    k++;
    marks[k] = /!!$/.test(tok) ? '!!' : /(^|[^?])!$/.test(tok) ? '!' : null;
  }
  const rep = new Chess();
  return hist.map((m, i) => {
    const fen = rep.fen();
    rep.move({ from: m.from, to: m.to, promotion: m.promotion });
    return { ply: i + 1, color: m.color, san: m.san, uci: m.from + m.to + (m.promotion || ''), fen, fenAfter: rep.fen(),
      mark: marks[i] || null, comment: notes[i] || null };
  });
}
/** Короткое имя из PGN: «Tal, Mihail» → «Tal». */
const surname = name => String(name || '').split(',')[0].trim() || '?';
/**
 * За кого играть по умолчанию: «мастер» библиотеки (игрок, который встречается чаще всех), если он в этой партии;
 * иначе победитель; ничья или «*» — белые.
 */
function defaultSide(game, libraryNames = []) {
  const cnt = {};
  for (const n of libraryNames) cnt[surname(n)] = (cnt[surname(n)] || 0) + 1;
  const master = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (master && surname(game.white) === master) return 'white';
  if (master && surname(game.black) === master) return 'black';
  if (game.result === '0-1') return 'black';
  return 'white';
}

// ── Анализ партии (формат master_games.analysis) ────────────────────────────
// analysis[i] = { ply, uci, master_cp, top: [{ uci, cp, pv: [uci, …до 6] }] } — cp со стороны того, кто ходит.
/** SAN для хода в UCI из позиции fen. */
function uciSan(fen, uci) { try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }).san; } catch { return uci; } }
/** Вариант в UCI → SAN. */
function pvSan(fen, pv) { const c = new Chess(fen), out = []; for (const u of pv || []) { try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }).san); } catch { break; } } return out; }
/** Ходы партии + анализ → элементы для выбора моментов и ответов. */
function prepareItems(moves, analysis) {
  const byPly = new Map((analysis || []).map(a => [a.ply, a]));
  return moves.filter(m => byPly.has(m.ply)).map(m => {
    const a = byPly.get(m.ply), i = m.ply - 1;
    return { ...m, masterCp: a.master_cp,
      top: a.top.map(t => ({ ...t, san: uciSan(m.fen, t.uci), pvSan: pvSan(m.fen, t.pv) })),
      traits: moveTraits(m.fen, m.uci, i ? moves[i - 1].uci.slice(2, 4) : null) };
  });
}

// ── Ключевые моменты ────────────────────────────────────────────────────────
// item — из prepareItems: { ply, color, san, uci, fen, mark, comment, masterCp, top: [{ uci, san, cp, pv, pvSan }], traits }
const KEY_MAX = 12;
function gapOf(it) { const b = it.top[0]?.cp ?? 0; return b - (it.top[1]?.cp ?? b); }
function kindOf(it) {
  const t = it.traits;
  if (t.sac) return 'sac';
  if (it.mark || it.comment) return 'annotated';
  if (t.check) return 'check';
  if (t.capture) return 'capture';
  return 'quiet';
}
/** Мастер упустил перевес: его ход хуже лучшего на 1.5+ и после него нет перевеса +1.5 — такой момент не спрашиваем. */
function masterThrows(it) { const b = it.top[0]?.cp ?? 0; return it.masterCp < b - 150 && it.masterCp < 150; }
/**
 * Моменты для режима: 'key' — ключевые, 'sac' — только жертвы, 'all' — каждый ход.
 * side — 'white' | 'black', skip — сколько первых ходов каждой стороны пропустить.
 */
function selectMoments(items, { mode = 'key', side = 'white', skip = 10 } = {}) {
  const col = side === 'white' ? 'w' : 'b';
  const mine = items.filter(it => it.color === col && it.ply > skip * 2);
  const withKind = it => ({ ...it, kind: kindOf(it), gap: gapOf(it) });
  if (mode === 'all') return mine.map(withKind);
  const pick = (cc, quiet) => mine.filter(it => {
    if (masterThrows(it)) return false;
    const t = it.traits, gap = gapOf(it);
    if (t.sac || it.mark || it.comment) return true;
    if (t.check || t.capture) return !t.recapture && gap >= cc;
    return gap >= quiet;
  }).map(withKind);
  let found = pick(80, 150);
  if (found.length < 3) found = pick(50, 100);
  if (mode === 'sac') return found.filter(m => m.kind === 'sac');
  if (found.length > KEY_MAX) {
    const pri = m => (m.kind === 'sac' || m.kind === 'annotated' ? 100000 : 0) + m.gap;
    found = [...found].sort((a, b) => pri(b) - pri(a)).slice(0, KEY_MAX).sort((a, b) => a.ply - b.ply);
  }
  return found;
}

// ── Очки за ответ ───────────────────────────────────────────────────────────
/**
 * Очки за ответ. ucp — оценка хода ученика (cp со стороны того, кто ходит; см. userCp).
 * 2 «master» — ход мастера;
 * 2 «better» — ход не хуже лучшего хода движка на 0.2, а лучший ход сильнее хода мастера на 0.5+ («сильнее, чем в партии»);
 * 1 «engine» — ход не хуже лучшего на 0.5; 0 «miss» — другой ход или оценки нет. С подсказкой — не больше 1.
 */
function scoreGuess(it, userUci, ucp = null, hintUsed = false) {
  const u = userUci.slice(0, 4), best = it.top[0];
  let pts = 0, verdict = 'miss';
  const cp = ucp != null ? ucp : (it.top.find(t => t.uci.slice(0, 4) === u) || {}).cp;
  if (u === it.uci.slice(0, 4)) { pts = 2; verdict = 'master'; }
  else if (best && cp != null && cp >= best.cp - 20 && best.cp - it.masterCp >= 50) { pts = 2; verdict = 'better'; }
  else if (best && cp != null && cp >= best.cp - 50) { pts = 1; verdict = 'engine'; }
  if (hintUsed && pts > 1) pts = 1;
  return { pts, verdict };
}
/**
 * Оценка хода ученика (cp со стороны того, кто ходит): из топ-3 анализа; иначе из evals (демо: userEvals «ply:uci»);
 * иначе null — тогда страница считает сама (getEval после хода, глубина 12), а в демо пишет без цифры.
 */
function userCp(it, userUci, evals = {}) {
  const u = userUci.slice(0, 4);
  const t = it.top.find(x => x.uci.slice(0, 4) === u);
  if (t) return t.cp;
  const v = evals[`${it.ply}:${u}`];
  return v == null ? null : v;
}
/** Стрелки после ответа (позиция до хода): ход ученика, ход мастера, лучший ход движка, если он другой. */
function resultArrows(it, userUci, verdict) {
  if (verdict === 'master') return [];
  const a = [];
  a.push({ from: userUci.slice(0, 2), to: userUci.slice(2, 4), role: 'played', color: verdict === 'miss' ? '#E0574A' : '#F0A43A' });
  a.push({ from: it.uci.slice(0, 2), to: it.uci.slice(2, 4), role: 'best', color: '#81B64C' });
  const b = it.top[0];
  if (b && b.uci.slice(0, 4) !== it.uci.slice(0, 4) && b.uci.slice(0, 4) !== userUci.slice(0, 4)) a.push({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), role: 'plan', color: '#4A90E2', label: 'Д' });
  return a;
}

// ── Тексты ──────────────────────────────────────────────────────────────────
/** Оценка со стороны белых: «+2.98», «−0.52», «#». cp — со стороны того, кто ходит. */
function evalWhite(cp, color) {
  if (cp == null) return '—';
  const w = color === 'w' ? cp : -cp;
  if (Math.abs(w) >= 9000) return w > 0 ? '#' : '−#';
  return (w > 0 ? '+' : w < 0 ? '−' : '') + (Math.abs(w) / 100).toFixed(2);
}
/** «24. Bh6» / «24... Bh6» */
function sanNo(ply, san) { const n = Math.ceil(ply / 2); return ply % 2 ? `${n}. ${san}` : `${n}... ${san}`; }
/** Строка варианта с номерами от полухода ply: «26. Rg1 Ra7 27. ...» */
function lineText(ply, sans) {
  return sans.map((s, i) => { const p = ply + i, n = Math.ceil(p / 2); return i === 0 ? sanNo(p, s) : p % 2 ? `${n}. ${s}` : s; }).join(' ');
}
/** Пункты объяснения хода мастера (без придуманных слов — только факты хода и движка). */
function explain(it) {
  const t = it.traits, out = [];
  if (t.mate) out.push('Мат.');
  else if (t.sac) out.push(`Жертва ${PIECE[t.piece]}.`);
  else if (t.check) out.push(t.capture ? `Шах и взятие ${PIECE[t.captured]}.` : 'Шах.');
  else if (t.capture) out.push(`Берёт ${PIECE_ACC[t.captured]}.`);
  else if (gapOf(it) >= 150) out.push('Тихий ход, но остальные ходы заметно хуже.');
  if (it.mark) out.push(`Автор отметил ход знаком «${it.mark}».`);
  const b = it.top[0];
  if (b && b.uci.slice(0, 4) === it.uci.slice(0, 4)) out.push('Это и лучший ход движка.');
  else if (b) out.push(`Движок предпочитает ${sanNo(it.ply, b.san)} (${evalWhite(b.cp, it.color)}).`);
  return out;
}

const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; };

module.exports = { see, moveTraits, parseGame, uciSan, pvSan, prepareItems, userCp, surname, defaultSide, KEY_MAX, gapOf, kindOf, masterThrows, selectMoments, scoreGuess, resultArrows, evalWhite, sanNo, lineText, explain, plural };

// ── Тесты (на демо-партии из masters-demo.json) ─────────────────────────────
if (require.main === module) {
  const assert = require('assert');
  const demo = require('./masters-demo.json');
  const moves = parseGame(demo.game.pgn);
  const items = prepareItems(moves, demo.analysis);
  let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

  t('партия: 77 полуходов, Tal белыми', () => {
    assert.strictEqual(moves.length, 77);
    assert.strictEqual(surname(demo.game.white), 'Tal');
    assert.strictEqual(defaultSide(demo.game, demo.libraryNames), 'white');
    assert.strictEqual(defaultSide({ white: 'Gonzalez, R.', black: 'Tal, Mihail', result: '0-1' }, demo.libraryNames), 'black');
    assert.strictEqual(defaultSide({ white: 'A', black: 'B', result: '0-1' }, []), 'black');
    assert.strictEqual(defaultSide({ white: 'A', black: 'B', result: '1/2-1/2' }, []), 'white');
  });
  t('признаки ходов', () => {
    const bh6 = items.find(x => x.san === 'Bh6');
    assert.ok(bh6.traits.sac, 'Bh6 — жертва');
    const rxh5 = items.find(x => x.san === 'Rxh5');
    assert.ok(rxh5.traits.recapture, 'Rxh5 — отыгрыш на h5');
    const rf6 = items.find(x => x.san === 'Rf6+');
    assert.ok(rf6.traits.check && rf6.traits.sac);
  });
  t('ключевые моменты Таля', () => {
    const key = selectMoments(items, { mode: 'key', side: 'white', skip: 10 });
    assert.deepStrictEqual(key.map(m => m.san), demo.expect.keyWhite);
    assert.ok(key.length <= KEY_MAX);
    assert.ok(!key.some(m => m.san === 'Bg5' && m.ply === 63), '32. Bg5 — Таль упустил перевес, не спрашиваем');
    const sac = selectMoments(items, { mode: 'sac', side: 'white', skip: 10 });
    assert.deepStrictEqual(sac.map(m => m.san), demo.expect.sacWhite);
    const all = selectMoments(items, { mode: 'all', side: 'white', skip: 10 });
    assert.strictEqual(all.length, 29);
    assert.strictEqual(selectMoments(items, { mode: 'all', side: 'white', skip: 0 }).length, 39);
  });
  t('очки', () => {
    const rg1 = items.find(x => x.san === 'Rg1');
    assert.deepStrictEqual(scoreGuess(rg1, rg1.uci), { pts: 2, verdict: 'master' });
    assert.deepStrictEqual(scoreGuess(rg1, rg1.uci, null, true), { pts: 1, verdict: 'master' });
    assert.deepStrictEqual(scoreGuess(rg1, 'b5e8'), { pts: 0, verdict: 'miss' });
    const e5 = items.find(x => x.san === 'e5');
    assert.deepStrictEqual(scoreGuess(e5, e5.top[0].uci), { pts: 2, verdict: 'better' });
    const g6 = items[28];
    assert.strictEqual(g6.san, 'g6');
    assert.deepStrictEqual(scoreGuess(g6, 'c1b1', userCp(g6, 'c1b1', demo.userEvals)), { pts: 1, verdict: 'engine' });  // +0.57 при лучшем +0.59
    assert.deepStrictEqual(scoreGuess(g6, 'f1b5', userCp(g6, 'f1b5', demo.userEvals)), { pts: 0, verdict: 'miss' });    // −5.01
    assert.deepStrictEqual(scoreGuess(g6, 'a2a3', null), { pts: 0, verdict: 'miss' });                                   // оценки нет
  });
  t('стрелки после ответа', () => {
    const rg1 = items.find(x => x.san === 'Rg1');
    assert.deepStrictEqual(resultArrows(rg1, 'b5e8', 'miss').map(a => a.role), ['played', 'best']);
    assert.deepStrictEqual(resultArrows(rg1, rg1.uci, 'master'), []);
    const e5 = items.find(x => x.san === 'e5');
    assert.deepStrictEqual(resultArrows(e5, 'h1h2', 'miss').map(a => a.role), ['played', 'best', 'plan']);
  });
  t('тексты', () => {
    const rg1 = items.find(x => x.san === 'Rg1');
    assert.strictEqual(sanNo(rg1.ply, rg1.san), '26. Rg1');
    assert.strictEqual(sanNo(48, 'Rf7'), '24... Rf7');
    assert.strictEqual(evalWhite(298, 'w'), '+2.98');
    assert.strictEqual(evalWhite(52, 'b'), '−0.52');
    assert.strictEqual(evalWhite(9990, 'w'), '#');
    assert.strictEqual(lineText(51, ['Rg1', 'Ra7', 'Nd4']), '26. Rg1 Ra7 27. Nd4');
    assert.deepStrictEqual(explain(rg1), ['Тихий ход, но остальные ходы заметно хуже.', 'Это и лучший ход движка.']);
    const bh6 = items.find(x => x.san === 'Bh6');
    assert.strictEqual(explain(bh6)[0], 'Жертва слона.');
  });
  t('анализ в формате базы', () => {
    assert.strictEqual(items.length, 77);
    const rg1 = items.find(x => x.san === 'Rg1');
    assert.strictEqual(rg1.top[0].san, 'Rg1');
    assert.strictEqual(lineText(rg1.ply, rg1.top[0].pvSan.slice(0, 3)), '26. Rg1 Ng4 27. fxg4');
    assert.strictEqual(userCp(rg1, 'b5e8', demo.userEvals), 0);          // из топ-3
    assert.strictEqual(typeof userCp(rg1, 'c1b1', demo.userEvals), 'number'); // из userEvals
    assert.strictEqual(userCp(rg1, 'a2a3', {}), null);
  });
  t('пометки и комментарии из PGN', () => {
    const g = parseGame('1. e4! {Хорошо.} e5 2. Nf3!! (2. Bc4) Nc6 *');
    assert.deepStrictEqual(g.map(x => x.mark), ['!', null, '!!', null]);
    assert.strictEqual(g[0].comment, 'Хорошо.');
    assert.strictEqual(plural(12, 'момент', 'момента', 'моментов'), 'моментов');
  });
  console.log(`\nвсе тесты: OK (${n})`);
}
