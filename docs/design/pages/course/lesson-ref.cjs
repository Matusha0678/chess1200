// Эталон логики страницы урока (COURSE-LESSON.md).
// Запуск: node docs/design/pages/course/lesson-ref.cjs  →  «все тесты: OK»
// Перенеси функции в src/lib/lesson.ts, тесты — в scripts/test-lesson.ts (добавь в test:logic).
'use strict';
const path = require('path');
let Chess;
try { ({ Chess } = require('chess.js')); } catch { ({ Chess } = require(path.resolve('node_modules/chess.js'))); }

// ── Значки ходов ────────────────────────────────────────────────────────────
const NAG_LABEL = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };
/** Значок хода: поле label, иначе первый NAG (как getEffectiveLabel в LessonViewer). */
function moveLabel(m) {
  if (!m) return null;
  if (m.label) return m.label;
  return NAG_LABEL[(m.nags || [])[0]] || null;
}
/** Значок → BadgeKind для Board (картинки public/icons/move-classes). '!?' — новый вид 'interesting'. */
const LABEL_KIND = { '!!': 'brilliant', '!': 'great', best: 'best', book: 'book', good: 'good', '?!': 'inaccuracy', '?': 'mistake', miss: 'miss', '??': 'blunder', '!?': 'interesting' };
const LABEL_NAME = { '!!': 'Блестящий ход', '!': 'Сильный ход', '!?': 'Интересный ход', best: 'Лучший ход', book: 'Книжный ход', good: 'Хороший ход', '?!': 'Неточность', '?': 'Ошибка', miss: 'Упущенный шанс', '??': 'Зевок' };

// ── Стрелки и клетки автора курса ([%cal], [%csl]) ──────────────────────────
const ARROW_COLOR = { green: '#7FB24A', red: '#D9534A', yellow: '#E8B53A', blue: '#4A90E2' };
const TINT = { green: 'rgba(129,182,76,.45)', red: 'rgba(224,87,74,.45)', yellow: 'rgba(240,194,74,.45)', blue: 'rgba(74,144,226,.45)' };
/** Что рисовать на доске после хода m (режим «Смотреть»). */
function boardMarks(m) {
  if (!m) return { arrows: [], tints: {}, badges: {}, lastMove: null };
  const arrows = (m.arrows || []).map(a => ({ from: a.from, to: a.to, color: ARROW_COLOR[a.color] || ARROW_COLOR.yellow, role: 'note', opacity: 0.85 }));
  const tints = {};
  for (const s of (m.squares || [])) tints[s.square] = TINT[s.color] || TINT.yellow;
  const label = moveLabel(m);
  const badges = label ? { [m.to]: LABEL_KIND[label] } : {};
  return { arrows, tints, badges, lastMove: { from: m.from, to: m.to } };
}

// ── Номера ходов ────────────────────────────────────────────────────────────
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Номер и цвет полухода ply (1 — первый ход линии) от позиции startFen. */
function plyNo(startFen, ply) {
  const f = (startFen || START).split(' ');
  const turn = f[1] || 'w', full = Number(f[5] || 1);
  const k = ply - 1 + (turn === 'b' ? 1 : 0);
  return { n: full + Math.floor(k / 2), color: k % 2 === 0 ? 'w' : 'b' };
}
/** «8... d5» / «9. exd5» */
function sanNo(startFen, ply, san) {
  const { n, color } = plyNo(startFen, ply);
  return color === 'w' ? `${n}. ${san}` : `${n}... ${san}`;
}
/** Строка ходов с номерами, первый ход — полуход firstPly: «11... Qxd2+ 12. Bxd2 bxc6 13. O-O-O» */
function movesText(startFen, firstPly, sans) {
  return sans.map((san, i) => {
    const ply = firstPly + i, { n, color } = plyNo(startFen, ply);
    if (i === 0) return sanNo(startFen, ply, san);
    return color === 'w' ? `${n}. ${san}` : san;
  }).join(' ');
}
/** Вариант к ходу ply (заменяет этот ход, начинается из той же позиции). */
function variationText(startFen, ply, variation) { return movesText(startFen, ply, variation.map(m => m.san)); }

// ── Шаги урока ──────────────────────────────────────────────────────────────
const DEFAULT_TITLE = { plan: 'План', mistakes: 'Ошибки', trap: 'Ловушка', summary: 'Итог' };
/**
 * Шаги урока по порядку. Источник — lesson.blocks (формат v1); если блоков нет — старые поля
 * (lesson_lines, summary/plan/mistakes/trap, lesson_questions).
 * Правила: «Итог» всегда последний шаг (это экран конца урока); если есть цель, а первого текста нет — «Вступление».
 */
function buildSteps(lesson, lines = [], questions = []) {
  const steps = [];
  let summaryMd = [];
  if (lesson.blocks && lesson.blocks.length) {
    let li = 0;
    for (const b of lesson.blocks) {
      if (b.type === 'text') steps.push({ kind: 'text', title: b.title || (steps.length === 0 ? 'Вступление' : 'Заметка'), md: b.md || '' });
      else if (b.type === 'line') { steps.push({ kind: 'line', title: b.title || `Линия ${li + 1}`, line: li }); li++; }
      else if (b.type === 'summary') summaryMd.push(b.md || '');
      else if (b.type === 'plan' || b.type === 'mistakes' || b.type === 'trap') steps.push({ kind: b.type, title: b.title || DEFAULT_TITLE[b.type], md: b.md || '' });
      else if (b.type === 'quiz') steps.push({ kind: 'quiz', title: b.title || 'Проверь себя', items: b.items || [] });
      else if (b.type === 'idea') steps.push({ kind: 'idea', title: b.title || 'Идея позиции', items: (b.items || []).map(it => ({ type: 'choice', ...it })) });
    }
  } else {
    lines.forEach((l, i) => steps.push({ kind: 'line', title: l.title || `Линия ${i + 1}`, line: i }));
    for (const k of ['plan', 'mistakes', 'trap']) if ((lesson[k] || '').trim()) steps.push({ kind: k, title: DEFAULT_TITLE[k], md: lesson[k] });
    if (questions.length) steps.push({ kind: 'quiz', title: 'Проверь себя', items: questions.map(q => ({ type: 'puzzle', fen: q.fen, question: q.question, answer: q.answer, why: q.why || '' })) });
    if ((lesson.summary || '').trim()) summaryMd.push(lesson.summary);
  }
  if (lesson.goal && (!steps.length || steps[0].kind !== 'text')) steps.unshift({ kind: 'text', title: 'Вступление', md: '' });
  steps.push({ kind: 'summary', title: 'Итог', md: summaryMd.join('\n\n') });
  return steps;
}
/** Линии урока: из блоков 'line' (в них есть всё) или из lesson_lines. */
function lessonLines(lesson, lines = []) {
  const fromBlocks = (lesson.blocks || []).filter(b => b.type === 'line');
  if (fromBlocks.length) return fromBlocks.map(b => ({ title: b.title, intro_md: b.intro_md || '', outro_md: b.outro_md || '', moves: b.moves || [], start_fen: b.start_fen || null }));
  return lines.map(l => ({ title: l.title || '', intro_md: l.intro_md || '', outro_md: l.outro_md || '', moves: l.moves || [], start_fen: l.start_fen || null }));
}
/** Какую позицию показать на шаге без своей доски: конец ближайшей линии слева; если линий слева нет — начало первой линии. */
function stepFen(steps, idx, lines) {
  for (let i = idx; i >= 0; i--) {
    if (steps[i].kind === 'line') { const l = lines[steps[i].line]; return l.moves.length ? l.moves[l.moves.length - 1].fen : (l.start_fen || START); }
  }
  return lines[0] ? (lines[0].start_fen || START) : START;
}
/** Начальное состояние по адресу: ?step=N (с 1), ?line=K (с 1) и ?ply=P, ?mode=play. */
function initialState(steps, query, doneSteps = []) {
  let step = 0;
  if (query.line) { const k = Number(query.line) - 1; const i = steps.findIndex(s => s.kind === 'line' && s.line === k); if (i >= 0) step = i; }
  else if (query.step) step = Math.min(Math.max(Number(query.step) - 1, 0), steps.length - 1);
  else { const i = steps.findIndex((_, j) => !doneSteps.includes(j + 1)); step = i >= 0 ? i : 0; }
  return { step, ply: query.ply ? Number(query.ply) : 0, mode: query.mode === 'play' ? 'play' : 'watch' };
}

// ── «Сыграй сам» ────────────────────────────────────────────────────────────
/** Новый прогон линии за цвет color ('w' | 'b'). */
function playStart(line, color) { return { color, ply: 0, attempts: 0, firstTry: 0, mine: 0, mistakes: false, done: false, ...autoOpp(line, color, 0) }; }
/** Сколько ходов соперника сыграть сами (с ply), пока не очередь ученика. */
function autoOpp(line, color, ply) { let p = ply; while (p < line.moves.length && line.moves[p].color !== color) p++; return { ply: p, done: p >= line.moves.length }; }
/** Ход ученика (from, to). Возвращает новое состояние и что показать. */
function playMove(st, line, from, to) {
  const exp = line.moves[st.ply];
  if (!exp || st.done) return { st, result: 'none' };
  if (exp.from === from && exp.to === to) {
    const first = st.attempts === 0;
    const nx = { ...st, firstTry: st.firstTry + (first ? 1 : 0), mine: st.mine + 1, attempts: 0, mistakes: st.mistakes || !first };
    const after = autoOpp(line, st.color, st.ply + 1);
    return { st: { ...nx, ply: after.ply, done: after.done }, result: 'ok', arrows: [], played: exp };
  }
  const attempts = st.attempts + 1;
  const arrows = [{ from, to, role: 'played' }];
  if (attempts >= 2) arrows.push({ from: exp.from, to: exp.to, role: 'best' });
  return { st: { ...st, attempts, mistakes: true }, result: 'fail', arrows };
}
/** Подсказка H: стрелка верного хода, ход уже не «с первой попытки». */
function playHint(st, line) { const exp = line.moves[st.ply]; return { st: { ...st, attempts: Math.max(st.attempts, 2), mistakes: true }, arrows: exp ? [{ from: exp.from, to: exp.to, role: 'best' }] : [] }; }
/** Запись в lesson_progress после прогона линии до конца (как было на /practice). */
function progressAfterRun(prev, st, allLinesPlayed) {
  return {
    guess_total: (prev?.guess_total || 0) + 1,
    guess_correct: (prev?.guess_correct || 0) + (st.mistakes ? 0 : 1),
    completed: Boolean(prev?.completed) || allLinesPlayed,
  };
}

// ── «Проверь себя» ──────────────────────────────────────────────────────────
const cleanSan = s => String(s || '').trim().replace(/[+#!?]+$/g, '');
/** Можно ли решать задачу ходом на доске (ответ — легальный SAN в позиции). Иначе — «Показать ответ». */
function puzzleMove(item) {
  try { const c = new Chess(item.fen); const m = c.move(cleanSan(item.answer)); return m ? { from: m.from, to: m.to, san: m.san } : null; } catch { return null; }
}
function puzzleVerdict(item, from, to) {
  const ans = puzzleMove(item);
  if (!ans) return { result: 'reveal' };
  if (ans.from === from && ans.to === to) return { result: 'ok', arrows: [] };
  return { result: 'fail', arrows: [{ from, to, role: 'played' }, { from: ans.from, to: ans.to, role: 'best' }] };
}
function choiceVerdict(item, key) { return key === item.answer ? { result: 'ok' } : { result: 'fail', correct: item.answer }; }

// ── Склонения ───────────────────────────────────────────────────────────────
function plural(n, one, few, many) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }
const movesWord = n => `${n} ${plural(n, 'ход', 'хода', 'ходов')}`;

module.exports = { moveLabel, LABEL_KIND, LABEL_NAME, boardMarks, plyNo, sanNo, movesText, variationText, buildSteps, lessonLines, stepFen, initialState,
  playStart, playMove, playHint, progressAfterRun, puzzleMove, puzzleVerdict, choiceVerdict, plural, movesWord, ARROW_COLOR, TINT };

// ── Тесты ───────────────────────────────────────────────────────────────────
if (require.main === module) {
  const assert = require('assert');
  const demo = require('./demo-course.json');
  const L2 = demo.lessons[1];
  const lines = lessonLines(L2.content);
  const steps = buildSteps(L2.content);
  let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

  t('шаги урока 2', () => {
    assert.deepStrictEqual(steps.map(s => s.kind), ['text', 'line', 'line', 'plan', 'mistakes', 'quiz', 'summary']);
    assert.strictEqual(steps[0].title, 'Вступление');
    assert.strictEqual(steps[1].title, 'Схема f3 и Qd2 — удар 8...d5!');
    assert.strictEqual(steps[5].items.length, 3);
    assert.ok(steps[6].md.startsWith('Пока пешка d стоит на d7'));
  });
  t('линии из блоков', () => {
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].moves.length, 22);
    assert.ok(lines[0].intro_md.includes('Be3, f3, Qd2'));
  });
  t('номера ходов', () => {
    assert.strictEqual(sanNo(null, 16, 'd5'), '8... d5');
    assert.strictEqual(sanNo(null, 17, 'exd5'), '9. exd5');
    assert.strictEqual(sanNo('r1bq1rk1/pp2ppbp/2n2np1/3p4/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 0 9', 1, 'exd5'), '9. exd5');
    assert.strictEqual(sanNo('r1bq1rk1/pp1pppbp/2n2np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R b KQ - 2 8', 1, 'd5'), '8... d5');
  });
  t('значок 8...d5 — «Сильный ход» на d5', () => {
    const m = lines[0].moves[15];
    assert.strictEqual(moveLabel(m), '!');
    const bm = boardMarks(m);
    assert.deepStrictEqual(bm.badges, { d5: 'great' });
    assert.strictEqual(bm.arrows.length, 2);
    assert.ok(bm.arrows.every(a => a.role === 'note'));
    assert.strictEqual(LABEL_NAME['!'], 'Сильный ход');
    assert.deepStrictEqual(boardMarks(lines[0].moves[16]).badges, {});
  });
  t('книжные ходы', () => {
    assert.strictEqual(moveLabel(lines[0].moves[1]), 'book');
    assert.strictEqual(LABEL_KIND[moveLabel(lines[0].moves[1])], 'book');
  });
  t('вариант к 11... Qxc6', () => {
    const m = lines[0].moves[21];
    assert.strictEqual(m.san, 'Qxc6');
    assert.strictEqual(variationText(null, 22, m.variations[0]), '11... Qxd2+ 12. Bxd2 bxc6 13. O-O-O');
    assert.strictEqual(variationText(null, 17, lines[1].moves[16].variations[0]), '9. Nxc6 bxc6 10. e5 Ne8 11. f4 f6');
  });
  t('доска на текстовых шагах', () => {
    assert.strictEqual(stepFen(steps, 0, lines), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    assert.strictEqual(stepFen(steps, 3, lines).split(' ')[0], 'r1b2rk1/pp2ppbp/2n3p1/8/2qN4/4BB2/PPP2PPP/R2Q1RK1');
  });
  t('адрес ?line=1&ply=16 и ?step=6', () => {
    assert.deepStrictEqual(initialState(steps, { line: '1', ply: '16' }), { step: 1, ply: 16, mode: 'watch' });
    assert.deepStrictEqual(initialState(steps, { step: '6' }), { step: 5, ply: 0, mode: 'watch' });
    assert.deepStrictEqual(initialState(steps, {}, [1]), { step: 1, ply: 0, mode: 'watch' });
    assert.deepStrictEqual(initialState(steps, { mode: 'play', line: '2' }), { step: 2, ply: 0, mode: 'play' });
  });
  t('«Сыграй сам»: соперник ходит сам, две ошибки — стрелка', () => {
    const line = lines[0];
    let st = playStart(line, 'b');
    assert.strictEqual(st.ply, 1);                      // 1. e4 сыгран сам
    let r = playMove(st, line, 'c7', 'c5'); st = r.st;
    assert.strictEqual(r.result, 'ok'); assert.strictEqual(st.ply, 3);
    r = playMove(st, line, 'e7', 'e6'); st = r.st;
    assert.strictEqual(r.result, 'fail'); assert.deepStrictEqual(r.arrows.map(a => a.role), ['played']);
    r = playMove(st, line, 'd7', 'd6'); st = r.st;
    assert.deepStrictEqual(r.arrows.map(a => a.role), ['played', 'best']);
    r = playMove(st, line, 'b8', 'c6'); st = r.st;
    assert.strictEqual(r.result, 'ok'); assert.strictEqual(st.firstTry, 1); assert.strictEqual(st.mine, 2);
    const h = playHint(st, line);
    assert.deepStrictEqual(h.arrows, [{ from: 'c5', to: 'd4', role: 'best' }]);
  });
  t('прогон до конца и запись прогресса', () => {
    const line = lines[0];
    let st = playStart(line, 'b');
    while (!st.done) { const m = line.moves[st.ply]; st = playMove(st, line, m.from, m.to).st; }
    assert.strictEqual(st.firstTry, 11); assert.strictEqual(st.mine, 11); assert.strictEqual(st.mistakes, false);
    assert.deepStrictEqual(progressAfterRun(null, st, false), { guess_total: 1, guess_correct: 1, completed: false });
    assert.deepStrictEqual(progressAfterRun({ guess_total: 1, guess_correct: 1, completed: false }, { ...st, mistakes: true }, true), { guess_total: 2, guess_correct: 1, completed: true });
  });
  t('«Проверь себя»', () => {
    const [q1, q2, q3] = steps[5].items;
    assert.deepStrictEqual(choiceVerdict(q1, 'A'), { result: 'ok' });
    assert.deepStrictEqual(choiceVerdict(q1, 'B'), { result: 'fail', correct: 'A' });
    assert.strictEqual(puzzleVerdict(q2, 'd7', 'd5').result, 'ok');
    assert.deepStrictEqual(puzzleVerdict(q2, 'd7', 'd6').arrows.map(a => a.role), ['played', 'best']);
    assert.strictEqual(puzzleVerdict(q3, 'd8', 'd5').result, 'ok');
    assert.strictEqual(puzzleVerdict({ fen: q2.fen, answer: 'ударить в центр' }, 'd7', 'd5').result, 'reveal');
  });
  t('старый урок без блоков', () => {
    const old = { title: 'Старый', summary: 'Итог', plan: 'План', mistakes: '', trap: '' };
    const s = buildSteps(old, [{ title: '', moves: [] }], [{ fen: START, question: '?', answer: 'e4' }]);
    assert.deepStrictEqual(s.map(x => x.kind), ['line', 'plan', 'quiz', 'summary']);
    assert.strictEqual(s[0].title, 'Линия 1');
  });
  t('склонения', () => {
    assert.strictEqual(movesWord(11), '11 ходов'); assert.strictEqual(movesWord(22), '22 хода'); assert.strictEqual(movesWord(1), '1 ход');
  });
  console.log(`\nвсе тесты: OK (${n})`);
}
