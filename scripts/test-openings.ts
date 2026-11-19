/**
 * Test suite for src/lib/opening-trainer.ts
 * Port of docs/design/pages/openings/opening-ref.cjs tests.
 * Run: npx tsx scripts/test-openings.ts
 */

import * as assert from 'assert';
import {
  toMoves, fmtMoves, lineLabels, lineGroups, commonStart, cardPly,
  lineStatus, dueText, countStatuses, inDays, applyResult,
  reviewQueue, learnQueue, hardQueue,
  sessionStart, learnStart,
  createRun, needsAuto, isMyTurn, auto, move, hint, result, view, steps, moveItems,
} from '../src/lib/opening-trainer.ts';

const DAY = 86400000;
const NOW = Date.parse('2026-11-19T09:00:00Z');
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const later = (d: number) => new Date(NOW + d * DAY).toISOString();

let n = 0;
let failed = 0;

function t(name: string, fn: () => void) {
  try {
    fn();
    n++;
    console.log('✓', name);
  } catch (e) {
    failed++;
    console.log('✗', name, String(e));
  }
}

console.log('\n── opening-trainer.ts test suite ──\n');

// Demo lines «Ускоренный дракон» (чёрными) — те же, что в макете
const D = {
  L1: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nxc6 bxc6 Qd4 Nf6 e5 Nd5 e6 f6',
  L2: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O Qd2 Be6',
  L3: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 Qa5 O-O O-O Bb3 d6',
  L4: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Nb3 Nf6 Be2 O-O O-O d6',
  L5: 'e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3 Bg7 h3 Nf6 Nc3 O-O',
  L6: 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6',
};

const lines = Object.entries(D).map(([id, s], i) => ({ id, index: i, moves: toMoves(s) }));
const byId = Object.fromEntries(lines.map(l => [l.id, l]));

// 1. подписи линий
t('подписи линий дракона — только ходы соперника', () => {
  assert.deepStrictEqual(lineLabels(lines, 'b'), [
    '5. Nxc6 … 6. Qd4', '5. c4 … 6. Nc3', '6. Be3 … 7. Bc4', '6. Nb3 … 7. Be2', '3. Bb5 … 4. Bxc6', '2. c3 … 3. e5',
  ]);
});

t('дебют за обе стороны — 3 полухода подряд', () => {
  assert.strictEqual(lineLabels(lines, null)[1], '5. c4 Nf6 6. Nc3');
});

const scotch = [
  { moves: toMoves('e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nxc6 Qf6 Qd2 dxc6 Nc3') },
  { moves: toMoves('e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4') },
];
t('белыми: подписи — ходы чёрных', () => {
  assert.deepStrictEqual(lineLabels(scotch, 'w'), ['4... Bc5 … 5... Qf6', '4... Nf6 … 5... bxc6']);
});

t('линия — начало другой', () => {
  assert.deepStrictEqual(
    lineLabels([{ moves: toMoves('e4 e5 Nf3') }, { moves: toMoves('e4 e5 Nf3 Nc6 Bb5') }], 'w'),
    ['1... e5', '2... Nc6'],
  );
});

t('расходятся моим ходом — он первым', () => {
  assert.deepStrictEqual(
    lineLabels([
      { moves: toMoves('e4 c5 Nf3 d6 d4 cxd4 Nxd4') },
      { moves: toMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4') },
    ], 'b'),
    ['2... d6 3. d4 … 4. Nxd4', '2... Nc6 3. d4 … 4. Nxd4'],
  );
});

t('общее начало всех линий', () => {
  assert.strictEqual(fmtMoves(byId.L2.moves, 0, commonStart(lines)), '1. e4 c5');
});

const P8 = 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 ';
const many = [
  'Nxc6 bxc6 Bc4 Bg7', 'Nxc6 bxc6 Qd4 Nf6', 'Nxc6 bxc6 Bd3 Bg7', 'Nxc6 bxc6 Nc3 Bg7',
  'c4 Nf6 Nc3 d6', 'c4 Bg7 Be3 Nf6',
  'c4 Nf6 Nc3 Nxd4', 'Nc3 Bg7 Be3 Nf6', 'Nc3 Bg7 Nb3 Nf6', 'Nc3 Bg7 Nde2 Nf6',
].map((t, i) => ({ id: 'M' + i, moves: toMoves(P8 + t) }));

t('больше 8 линий — группы по ходу соперника', () => {
  assert.deepStrictEqual(lineGroups(many), [
    { label: '5. Nxc6', ids: ['M0', 'M1', 'M2', 'M3'] },
    { label: '5. c4', ids: ['M4', 'M5', 'M6'] },
    { label: '5. Nc3', ids: ['M7', 'M8', 'M9'] },
  ]);
});

t('6 линий — без групп', () => {
  assert.strictEqual(lineGroups(lines), null);
});

t('подписи внутри группы — с места расхождения', () => {
  assert.deepStrictEqual(lineLabels(many, 'b').slice(0, 2), ['6. Bc4', '6. Qd4']);
});

t('общее начало L1–L4 — 8 полуходов', () => {
  assert.strictEqual(commonStart(lines.slice(0, 4)), 8);
});

t('позиция карточки — после 4... g6 (у 4 из 6 линий)', () => {
  assert.deepStrictEqual(cardPly(lines), { k: 8, lineIdx: 0 });
});

t('одна линия — 12 полуходов', () => {
  assert.strictEqual(cardPly([lines[4]]).k, 12);
});

// 2. статусы, сроки, итог прогона
const P: Record<string, { mastery: number; next_review: string; correct_count: number; incorrect_count: number }> = {
  L1: { mastery: 4, next_review: later(20), correct_count: 4, incorrect_count: 1 },
  L2: { mastery: 2, next_review: ago(1),   correct_count: 2, incorrect_count: 1 },
  L3: { mastery: 1, next_review: ago(3),   correct_count: 1, incorrect_count: 0 },
  L4: { mastery: 2, next_review: later(4), correct_count: 2, incorrect_count: 0 },
};

t('статусы линий', () => {
  assert.deepStrictEqual(
    lines.map(l => lineStatus(P[l.id] || null, NOW)),
    ['mastered', 'due', 'due', 'learning', 'new', 'new'],
  );
});

t('подписи сроков', () => {
  assert.deepStrictEqual(
    lines.map(l => dueText(P[l.id] || null, NOW)),
    ['освоена', 'сегодня', 'сегодня', 'через 4 дн.', 'новая', 'новая'],
  );
});

t('счёт для левой колонки', () => {
  assert.deepStrictEqual(
    countStatuses(lines.map(l => P[l.id] || null), NOW),
    { total: 6, new: 2, due: 2, learning: 1, mastered: 1 },
  );
});

t('уровень 5 тоже повторяется, когда подошёл срок', () => {
  assert.strictEqual(lineStatus({ mastery: 5, next_review: ago(1) }, NOW), 'due');
});

t('с ошибкой: уровень тот же, интервал по уровню − 1', () => {
  const r1 = applyResult(P.L2, false, NOW);
  assert.deepStrictEqual([r1.row.mastery, r1.days, r1.xp, r1.row.incorrect_count, inDays(r1.days)], [2, 3, 0, 2, 'через 3 дня']);
});

t('без ошибок: уровень +1, +5 XP', () => {
  const r2 = applyResult(P.L3, true, NOW);
  assert.deepStrictEqual([r2.row.mastery, r2.days, r2.xp, r2.row.correct_count, inDays(r2.days)], [2, 7, 5, 2, 'через 7 дней']);
});

t('новая линия', () => {
  assert.deepStrictEqual(
    [applyResult(null, true, NOW, { afterLearn: true }).days, applyResult(null, true, NOW).days, applyResult(null, false, NOW).row.mastery],
    [1, 3, 0],
  );
});

t('уровень не выше 5', () => {
  assert.strictEqual(
    applyResult({ mastery: 5, next_review: ago(1), correct_count: 9, incorrect_count: 0 }, true, NOW).row.mastery, 5,
  );
});

t('склонение дней', () => {
  assert.deepStrictEqual([inDays(1), inDays(21), inDays(30)], ['завтра', 'через 21 день', 'через 30 дней']);
});

// 3. очереди
const withProg = lines.map(l => ({ id: l.id, index: l.index, prog: P[l.id] || null }));
t('повторять: самая просроченная первой', () => {
  assert.deepStrictEqual(reviewQueue(withProg, NOW), ['L3', 'L2']);
});

t('повторять: линия с ошибкой в партии первой', () => {
  assert.deepStrictEqual(reviewQueue(withProg, NOW, { freshDev: new Set(['L2']) }), ['L2', 'L3']);
});

t('?line= — первой, даже без срока', () => {
  assert.deepStrictEqual(reviewQueue(withProg, NOW, { forceLineId: 'L4' }), ['L4', 'L3', 'L2']);
});

t('учить: новые по порядку', () => {
  assert.deepStrictEqual(learnQueue(withProg), ['L5', 'L6']);
});

t('трудные ходы', () => {
  const hard = hardQueue([
    { line_id: 'L3', move_index: 13, incorrect_count: 1, last_missed_at: ago(2) },
    { line_id: 'L2', move_index: 7,  incorrect_count: 2, last_missed_at: ago(9) },
    { line_id: 'L1', move_index: 11, incorrect_count: 1, last_missed_at: ago(1) },
    { line_id: 'L1', move_index: 10, incorrect_count: 3, last_missed_at: ago(1) }, // ход белых — не мой
    { line_id: 'L4', move_index: 5,  incorrect_count: 0, last_missed_at: ago(1) },
  ], Object.fromEntries(lines.map(l => [l.id, { ...l, myColor: 'b' as const }])));
  assert.deepStrictEqual(hard, [
    { lineId: 'L2', ply: 7 },
    { lineId: 'L1', ply: 11 },
    { lineId: 'L3', ply: 13 },
  ]);
});

// 4. прогон «Повторять» — ровно как демо-проход
const L2 = byId.L2.moves;
let r = createRun(L2, 'b', 'review');
const okSet = new Set<string>();
const take = (x: ReturnType<typeof createRun>) => {
  for (const e of x.effects) if (e.type === 'ok' && e.key) okSet.add(e.key);
  return x;
};
const autoAll = (x: ReturnType<typeof createRun>): ReturnType<typeof createRun> => {
  while (needsAuto(x)) x = take(auto(x));
  return x;
};
r = autoAll(r);

t('после 1. e4 — мой ход', () => {
  assert.deepStrictEqual([r.ply, view(r).title], [1, 'Твой ход']);
});

for (const [f, t2] of [['c7', 'c5'] as const, ['b8', 'c6'] as const, ['c5', 'd4'] as const]) r = autoAll(take(move(r, f, t2)));

t('дошли до 4-го хода чёрных', () => {
  assert.strictEqual(r.ply, 7);
});

t('строка ходов без будущих ходов', () => {
  assert.strictEqual(moveItems(r).map(i => i.text).join(' '), '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 ?');
});

r = take(move(r, 'g8', 'f6'));
let v = view(r);

t('неверный ход — «Не тот ход»', () => {
  assert.deepStrictEqual([v.title, v.feedback!.result], ['Не тот ход', 'fail']);
});

t('текст карточки ошибки', () => {
  assert.strictEqual(v.feedback!.text, 'Ты сыграл 4... Nf6. В твоей линии здесь 4... g6 — сыграй его на доске.');
});

t('на доске позиция до ошибки (ход отменён)', () => {
  assert.strictEqual(v.fen, L2[6].fen);
});

t('стрелки: сыгранный (красная) и верный (зелёная пунктирная)', () => {
  assert.deepStrictEqual(v.arrows.map(a => `${a.role}:${a.from}${a.to}`), ['played:g8f6', 'best:g7g6']);
});

t('ошибка записана один раз', () => {
  assert.deepStrictEqual(r.effects, [{ type: 'mistake', ply: 7 }]);
});

r = take(move(r, 'b8', 'a6'));
t('повторная ошибка на том же ходу не пишется второй раз', () => {
  assert.deepStrictEqual(r.effects, []);
});

t('полоса шагов', () => {
  assert.strictEqual(steps(r).label, 'Ход 4 из 10');
});

r = autoAll(take(move(r, 'g7', 'g6')));
t('после верного хода — дальше, стрелок нет', () => {
  assert.deepStrictEqual([r.ply, r.wrong, view(r).arrows.length], [9, null, 0]);
});

for (const [f, t2] of [
  ['g8','f6'] as const,['d7','d6'] as const,['c6','d4'] as const,
  ['f8','g7'] as const,['e8','g8'] as const,['c8','e6'] as const,
]) r = autoAll(take(move(r, f, t2)));

v = view(r);
t('конец линии — закрепляем ход с ошибкой', () => {
  assert.deepStrictEqual([r.phase, r.consolidate, v.title, v.fen, v.arrows.length], ['consolidate', [7], 'Закрепим ошибку', L2[6].fen, 0]);
});

r = take(move(r, 'g7', 'g6'));
t('итог линии с ошибкой', () => {
  assert.deepStrictEqual([r.phase, result(r), view(r).title], ['done', { perfect: false, mistakes: 1, failed: false }, 'Линия пройдена с ошибками']);
});

t('в okSet — 9 ходов, сыгранных верно с первой попытки (без 4... g6)', () => {
  assert.strictEqual(okSet.size, 9);
});

// 5. следующая линия этой сессии начинается с места, где ещё не было верного ответа
const L3 = byId.L3.moves;
const s3 = sessionStart(L3, 'b', okSet);
t('L3 начинается с 4... g6 (начало проиграно быстро)', () => {
  assert.strictEqual(s3, 7);
});

let r3 = createRun(L3, 'b', 'review', { startPly: s3 });
t('L3: позиция после 4. Nxd4, первый спрашиваемый ход', () => {
  assert.deepStrictEqual([view(r3).fen, steps(r3).label, needsAuto(r3)], [L3[6].fen, 'Ход 1 из 6', false]);
});

// 6. подсказка
let rh = autoAll(createRun(L3, 'b', 'review'));
rh = hint(rh);
t('H: кольцо на фигуре, считается ошибкой', () => {
  assert.deepStrictEqual([rh.hint, Object.keys(view(rh).rings), rh.mistakes], [1, ['c7'], [{ ply: 1, kind: 'hint' }]]);
});

rh = hint(rh);
t('H второй раз: стрелка', () => {
  assert.deepStrictEqual(view(rh).arrows.map(a => a.role), ['best']);
});

t('шаг с подсказкой — оранжевый', () => {
  assert.strictEqual(steps(rh).items[0].state, 'hint');
});

// 7. «Учить»: общее начало с изученными линиями проигрывается быстро, ход — по стрелке
const L5 = byId.L5.moves;
const st5 = learnStart(L5, [byId.L1, byId.L2, byId.L3, byId.L4]);
t('L5 учим с 3. Bb5', () => {
  assert.strictEqual(st5, 4);
});

let rl = createRun(L5, 'b', 'learn', { startPly: st5 });
t('сначала автоход 3. Bb5', () => {
  assert.strictEqual(needsAuto(rl), true);
});

rl = auto(rl);
v = view(rl);
t('учить: заголовок и стрелка хода', () => {
  assert.deepStrictEqual([v.title, v.arrows.map(a => `${a.role}:${a.from}${a.to}`)], ['Сыграй 3... g6', ['best:g7g6']]);
});

t('учить: вся линия, будущие ходы серые', () => {
  assert.deepStrictEqual(
    moveItems(rl).slice(4, 8).map(i => `${i.text}:${i.state}`),
    ['3. Bb5:opp', 'g6:now', '4. Bxc6:future', 'dxc6:future'],
  );
});

rl = move(rl, 'b7', 'b6');
v = view(rl);
t('учить: неверный ход не ошибка', () => {
  assert.deepStrictEqual([v.feedback!.result, rl.mistakes.length, v.arrows.map(a => a.role)], ['info', 0, ['played', 'best']]);
});

rl = move(rl, 'g7', 'g6');
while (rl.phase !== 'done') {
  if (needsAuto(rl)) rl = auto(rl);
  else { const e = L5[rl.ply]; rl = move(rl, e.from, e.to); }
}
t('учить: конец линии → «Сыграть по памяти»', () => {
  assert.deepStrictEqual([view(rl).title, view(rl).feedback!.text], ['Линия пройдена', 'Теперь сыграй её по памяти — без стрелок.']);
});

// 8. экзамен: одна ошибка — линия не засчитана, без подсказок и закрепления
let re = autoAll(createRun(L2, 'b', 'exam'));
re = hint(re);
t('экзамен: подсказок нет', () => {
  assert.strictEqual(re.hint, 0);
});

re = move(re, 'e7', 'e6');
v = view(re);
t('экзамен: ошибка завершает линию', () => {
  assert.deepStrictEqual([re.phase, result(re), v.title, v.feedback!.text], ['done', { perfect: false, mistakes: 1, failed: true }, 'Ошибка в линии', 'Ты сыграл 1... e6, в линии 1... c5.']);
});

t('экзамен: позиция до ошибки и две стрелки', () => {
  assert.deepStrictEqual([v.fen, v.arrows.map(a => a.role)], [L2[0].fen, ['played', 'best']]);
});

// 9. трудный ход — один ход и дальше
let rd = createRun(L2, 'b', 'drill', { startPly: 7, endPly: 8 });
t('трудный ход: позиция перед ним', () => {
  assert.deepStrictEqual([view(rd).fen, needsAuto(rd)], [L2[6].fen, false]);
});

rd = move(rd, 'g7', 'g6');
t('трудный ход: верно', () => {
  assert.deepStrictEqual([rd.phase, result(rd).perfect], ['done', true]);
});

// 10. белыми: ход соперника не ждём на первом ходу
const sc = scotch[0].moves;
let rw = createRun(sc, 'w', 'review');
t('белыми — сразу мой ход', () => {
  assert.deepStrictEqual([needsAuto(rw), isMyTurn(rw), view(rw).title], [false, true, 'Твой ход']);
});

rw = move(rw, 'd2', 'd4');
t('номер хода белых в тексте', () => {
  assert.strictEqual(view(rw).feedback!.text, 'Ты сыграл 1. d4. В твоей линии здесь 1. e4 — сыграй его на доске.');
});

console.log(`\n${failed > 0 ? '✗ FAILED' : 'все тесты: OK'} (${n}/${n + failed})\n`);
if (failed > 0) process.exit(1);
