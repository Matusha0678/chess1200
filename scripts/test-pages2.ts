/**
 * Тесты для src/lib/opening-trainer.ts, src/lib/traps.ts, src/lib/sprint.ts, src/lib/ideas.ts.
 * Эталон — docs/design/pages/pages2-ref.cjs (и docs/design/pages/openings/opening-ref.cjs для opening-trainer).
 * Запуск: npx tsx scripts/test-pages2.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Chess } from 'chess.js';
import {
  DAYS,
  toMoves,
  fenBefore,
  numSan,
  fmtMoves,
  lineLabels,
  lineGroups,
  commonStart,
  cardPly,
  lineStatus,
  countStatuses,
  dueText,
  inDays,
  applyResult,
  reviewQueue,
  learnQueue,
  hardQueue,
  sessionStart,
  learnStart,
  createRun,
  needsAuto,
  isMyTurn,
  auto,
  move,
  hint,
  result,
  view,
  steps,
  moveItems,
} from '../src/lib/opening-trainer';
import { loadTraps, trapsForRepertoire, matchTrap, punishRun, avoidVerdict, type TrapLibEntry } from '../src/lib/traps';
import { sprintItems, sprintOrder, sprintCheck, rng } from '../src/lib/sprint';
import { endPositions, moveStats, ideaVerdict } from '../src/lib/ideas';
import type { Run } from '../src/lib/opening-trainer';

let fails = 0;
function eq(a: unknown, b: unknown, msg: string): void {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    fails++;
    console.log(`✗ ${msg}\n    есть:  ${JSON.stringify(a)}\n    нужно: ${JSON.stringify(b)}`);
  } else {
    console.log(`✓ ${msg}`);
  }
}

const NOW = Date.parse('2026-11-19T09:00:00Z');
const DAY = 86400000;

// ══════════════════════════════════════════════════════════════════════════
// Тесты opening-trainer (из opening-ref.cjs)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── opening-trainer ──');

const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const later = (d: number) => new Date(NOW + d * DAY).toISOString();

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
eq(lineLabels(lines, 'b'), [
  '5. Nxc6 … 6. Qd4', '5. c4 … 6. Nc3', '6. Be3 … 7. Bc4', '6. Nb3 … 7. Be2', '3. Bb5 … 4. Bxc6', '2. c3 … 3. e5',
], 'подписи линий дракона — только ходы соперника');
eq(lineLabels(lines, null)[1], '5. c4 Nf6 6. Nc3', 'дебют за обе стороны — 3 полухода подряд');
const scotch = [
  { moves: toMoves('e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nxc6 Qf6 Qd2 dxc6 Nc3') },
  { moves: toMoves('e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4') },
];
eq(lineLabels(scotch, 'w'), ['4... Bc5 … 5... Qf6', '4... Nf6 … 5... bxc6'], 'белыми: подписи — ходы чёрных');
eq(lineLabels([{ moves: toMoves('e4 e5 Nf3') }, { moves: toMoves('e4 e5 Nf3 Nc6 Bb5') }], 'w'), ['1... e5', '2... Nc6'], 'линия — начало другой');
eq(lineLabels([{ moves: toMoves('e4 c5 Nf3 d6 d4 cxd4 Nxd4') }, { moves: toMoves('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4') }], 'b'),
  ['2... d6 3. d4 … 4. Nxd4', '2... Nc6 3. d4 … 4. Nxd4'], 'расходятся моим ходом — он первым');
eq(fmtMoves(byId.L2.moves, 0, commonStart(lines)), '1. e4 c5', 'общее начало всех линий');

const P8 = 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 ';
const many = ['Nxc6 bxc6 Bc4 Bg7', 'Nxc6 bxc6 Qd4 Nf6', 'Nxc6 bxc6 Bd3 Bg7', 'Nxc6 bxc6 Nc3 Bg7', 'c4 Nf6 Nc3 d6', 'c4 Bg7 Be3 Nf6',
  'c4 Nf6 Nc3 Nxd4', 'Nc3 Bg7 Be3 Nf6', 'Nc3 Bg7 Nb3 Nf6', 'Nc3 Bg7 Nde2 Nf6'].map((t, i) => ({ id: 'M' + i, moves: toMoves(P8 + t) }));
eq(lineGroups(many), [
  { label: '5. Nxc6', ids: ['M0', 'M1', 'M2', 'M3'] }, { label: '5. c4', ids: ['M4', 'M5', 'M6'] }, { label: '5. Nc3', ids: ['M7', 'M8', 'M9'] },
], 'больше 8 линий — группы по ходу соперника');
eq(lineGroups(lines), null, '6 линий — без групп');
eq(lineLabels(many, 'b').slice(0, 2), ['6. Bc4', '6. Qd4'], 'подписи внутри группы — с места расхождения');

eq(commonStart(lines.slice(0, 4)), 8, 'общее начало L1–L4 — 8 полуходов');
eq(cardPly(lines), { k: 8, lineIdx: 0 }, 'позиция карточки — после 4... g6 (у 4 из 6 линий)');
eq(cardPly([lines[4]]).k, 12, 'одна линия — 12 полуходов');

// 2. статусы, сроки, итог прогона
const P: Record<string, { mastery: number; next_review: string; correct_count: number; incorrect_count: number }> = {
  L1: { mastery: 4, next_review: later(20), correct_count: 4, incorrect_count: 1 },
  L2: { mastery: 2, next_review: ago(1), correct_count: 2, incorrect_count: 1 },
  L3: { mastery: 1, next_review: ago(3), correct_count: 1, incorrect_count: 0 },
  L4: { mastery: 2, next_review: later(4), correct_count: 2, incorrect_count: 0 },
};
eq(lines.map(l => lineStatus(P[l.id] || null, NOW)), ['mastered', 'due', 'due', 'learning', 'new', 'new'], 'статусы линий');
eq(lines.map(l => dueText(P[l.id] || null, NOW)), ['освоена', 'сегодня', 'сегодня', 'через 4 дн.', 'новая', 'новая'], 'подписи сроков');
eq(countStatuses(lines.map(l => P[l.id] || null), NOW), { total: 6, new: 2, due: 2, learning: 1, mastered: 1 }, 'счёт для левой колонки');
eq(lineStatus({ mastery: 5, next_review: ago(1) }, NOW), 'due', 'уровень 5 тоже повторяется, когда подошёл срок');

const r1 = applyResult(P.L2, false, NOW);
eq([r1.row.mastery, r1.days, r1.xp, r1.row.incorrect_count, inDays(r1.days)], [2, 3, 0, 2, 'через 3 дня'], 'с ошибкой: уровень тот же, интервал по уровню − 1');
const r2 = applyResult(P.L3, true, NOW);
eq([r2.row.mastery, r2.days, r2.xp, r2.row.correct_count, inDays(r2.days)], [2, 7, 5, 2, 'через 7 дней'], 'без ошибок: уровень +1, +5 XP');
eq([applyResult(null, true, NOW, { afterLearn: true }).days, applyResult(null, true, NOW).days, applyResult(null, false, NOW).row.mastery], [1, 3, 0], 'новая линия');
eq(applyResult({ mastery: 5, next_review: ago(1), correct_count: 9, incorrect_count: 0 }, true, NOW).row.mastery, 5, 'уровень не выше 5');
eq([inDays(1), inDays(21), inDays(30)], ['завтра', 'через 21 день', 'через 30 дней'], 'склонение дней');

// 3. очереди
const withProg = lines.map(l => ({ id: l.id, index: l.index, prog: P[l.id] || null }));
eq(reviewQueue(withProg, NOW), ['L3', 'L2'], 'повторять: самая просроченная первой');
eq(reviewQueue(withProg, NOW, { freshDev: new Set(['L2']) }), ['L2', 'L3'], 'повторять: линия с ошибкой в партии первой');
eq(reviewQueue(withProg, NOW, { forceLineId: 'L4' }), ['L4', 'L3', 'L2'], '?line= — первой, даже без срока');
eq(learnQueue(withProg), ['L5', 'L6'], 'учить: новые по порядку');
const hard = hardQueue([
  { line_id: 'L3', move_index: 13, incorrect_count: 1, last_missed_at: ago(2) },
  { line_id: 'L2', move_index: 7, incorrect_count: 2, last_missed_at: ago(9) },
  { line_id: 'L1', move_index: 11, incorrect_count: 1, last_missed_at: ago(1) },
  { line_id: 'L1', move_index: 10, incorrect_count: 3, last_missed_at: ago(1) },
  { line_id: 'L4', move_index: 5, incorrect_count: 0, last_missed_at: ago(1) },
], Object.fromEntries(lines.map(l => [l.id, { moves: l.moves, myColor: 'b' as const }])));
eq(hard, [{ lineId: 'L2', ply: 7 }, { lineId: 'L1', ply: 11 }, { lineId: 'L3', ply: 13 }], 'трудные ходы');

// 4. прогон «Повторять»
const L2 = byId.L2.moves;
let r: Run = createRun(L2, 'b', 'review');
const okSet = new Set<string>();
const take = (x: Run): Run => { for (const e of x.effects) if (e.type === 'ok' && e.key) okSet.add(e.key); return x; };
const autoAll = (x: Run): Run => { while (needsAuto(x)) x = take(auto(x)); return x; };
r = autoAll(r);
eq([r.ply, view(r).title], [1, 'Твой ход'], 'после 1. e4 — мой ход');
for (const [f, t] of [['c7', 'c5'], ['b8', 'c6'], ['c5', 'd4']]) r = autoAll(take(move(r, f, t)));
eq(r.ply, 7, 'дошли до 4-го хода чёрных');
eq(moveItems(r).map(i => i.text).join(' '), '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 ?', 'строка ходов без будущих ходов');
r = take(move(r, 'g8', 'f6'));
let v = view(r);
eq([v.title, v.feedback!.result], ['Не тот ход', 'fail'], 'неверный ход — «Не тот ход»');
eq(v.feedback!.text, 'Ты сыграл 4... Nf6. В твоей линии здесь 4... g6 — сыграй его на доске.', 'текст карточки ошибки');
eq(v.fen, L2[6].fen, 'на доске позиция до ошибки (ход отменён)');
eq(v.arrows.map(a => `${a.role}:${a.from}${a.to}`), ['played:g8f6', 'best:g7g6'], 'стрелки: сыгранный и верный');
eq(r.effects, [{ type: 'mistake', ply: 7 }], 'ошибка записана один раз');
r = take(move(r, 'b8', 'a6'));
eq(r.effects, [], 'повторная ошибка на том же ходу не пишется второй раз');
eq(steps(r).label, 'Ход 4 из 10', 'полоса шагов');
r = autoAll(take(move(r, 'g7', 'g6')));
eq([r.ply, r.wrong, view(r).arrows.length], [9, null, 0], 'после верного хода — дальше, стрелок нет');
for (const [f, t] of [['g8', 'f6'], ['d7', 'd6'], ['c6', 'd4'], ['f8', 'g7'], ['e8', 'g8'], ['c8', 'e6']]) r = autoAll(take(move(r, f, t)));
v = view(r);
eq([r.phase, r.consolidate, v.title, v.fen, v.arrows.length], ['consolidate', [7], 'Закрепим ошибку', L2[6].fen, 0], 'конец линии — закрепляем ход с ошибкой');
r = take(move(r, 'g7', 'g6'));
eq([r.phase, result(r), view(r).title], ['done', { perfect: false, mistakes: 1, failed: false }, 'Линия пройдена с ошибками'], 'итог линии с ошибкой');
eq(okSet.size, 9, 'в okSet — 9 ходов, сыгранных верно с первой попытки');

// 5. следующая линия стартует с места, где ещё не было верного ответа
const L3 = byId.L3.moves;
const s3 = sessionStart(L3, 'b', okSet);
eq(s3, 7, 'L3 начинается с 4... g6');
const r3 = createRun(L3, 'b', 'review', { startPly: s3 });
eq([view(r3).fen, steps(r3).label, needsAuto(r3)], [L3[6].fen, 'Ход 1 из 6', false], 'L3: позиция после 4. Nxd4');

// 6. подсказка
let rh = autoAll(createRun(L3, 'b', 'review'));
rh = hint(rh);
eq([rh.hint, Object.keys(view(rh).rings), rh.mistakes], [1, ['c7'], [{ ply: 1, kind: 'hint' }]], 'H: кольцо на фигуре, считается ошибкой');
rh = hint(rh);
eq(view(rh).arrows.map(a => a.role), ['best'], 'H второй раз: стрелка');
eq(steps(rh).items[0].state, 'hint', 'шаг с подсказкой — оранжевый');

// 7. учить
const L5 = byId.L5.moves;
const st5 = learnStart(L5, [byId.L1, byId.L2, byId.L3, byId.L4]);
eq(st5, 4, 'L5 учим с 3. Bb5');
let rl = createRun(L5, 'b', 'learn', { startPly: st5 });
eq(needsAuto(rl), true, 'сначала автоход 3. Bb5');
rl = auto(rl);
v = view(rl);
eq([v.title, v.arrows.map(a => `${a.role}:${a.from}${a.to}`)], ['Сыграй 3... g6', ['best:g7g6']], 'учить: заголовок и стрелка хода');
eq(moveItems(rl).slice(4, 8).map(i => `${i.text}:${i.state}`), ['3. Bb5:opp', 'g6:now', '4. Bxc6:future', 'dxc6:future'], 'учить: вся линия, будущие ходы серые');
rl = move(rl, 'b7', 'b6');
v = view(rl);
eq([v.feedback!.result, rl.mistakes.length, v.arrows.map(a => a.role)], ['info', 0, ['played', 'best']], 'учить: неверный ход не ошибка');
rl = move(rl, 'g7', 'g6');
while (rl.phase !== 'done') {
  if (needsAuto(rl)) rl = auto(rl);
  else { const e = L5[rl.ply]; rl = move(rl, e.from, e.to); }
}
eq([view(rl).title, view(rl).feedback!.text], ['Линия пройдена', 'Теперь сыграй её по памяти — без стрелок.'], 'учить: конец линии');

// 8. экзамен
let re = autoAll(createRun(L2, 'b', 'exam'));
re = hint(re);
eq(re.hint, 0, 'экзамен: подсказок нет');
re = move(re, 'e7', 'e6');
v = view(re);
eq([re.phase, result(re), v.title, v.feedback!.text], ['done', { perfect: false, mistakes: 1, failed: true }, 'Ошибка в линии', 'Ты сыграл 1... e6, в линии 1... c5.'], 'экзамен: ошибка завершает линию');
eq([v.fen, v.arrows.map(a => a.role)], [L2[0].fen, ['played', 'best']], 'экзамен: позиция до ошибки и две стрелки');

// 9. трудный ход
let rd = createRun(L2, 'b', 'drill', { startPly: 7, endPly: 8 });
eq([view(rd).fen, needsAuto(rd)], [L2[6].fen, false], 'трудный ход: позиция перед ним');
rd = move(rd, 'g7', 'g6');
eq([rd.phase, result(rd).perfect], ['done', true], 'трудный ход: верно');

// 10. белыми
const sc = scotch[0].moves;
let rw = createRun(sc, 'w', 'review');
eq([needsAuto(rw), isMyTurn(rw), view(rw).title], [false, true, 'Твой ход'], 'белыми — сразу мой ход');
rw = move(rw, 'd2', 'd4');
eq(view(rw).feedback!.text, 'Ты сыграл 1. d4. В твоей линии здесь 1. e4 — сыграй его на доске.', 'номер хода белых в тексте');

// ══════════════════════════════════════════════════════════════════════════
// Тесты для pages2-ref: traps, sprint, ideas
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── traps ──');

const trapsLibPath = join(process.cwd(), 'docs/design/pages/traps/traps-library.json');
const lib = JSON.parse(readFileSync(trapsLibPath, 'utf8')) as TrapLibEntry[];
const traps = loadTraps(lib);

eq(traps.length, 17, '17 ловушек');
eq(
  traps.every(t => t.moves[t.mistakePly].color !== t.setter && t.moves[t.mistakePly + 1].color === t.setter),
  true,
  'ошибка — ход жертвы, дальше ходит ставящий',
);
const mates = traps.filter(t => { const c = new Chess(t.moves[t.moves.length - 1].fen); return c.isCheckmate(); }).map(t => t.id);
eq(mates, ['stafford-bg5', 'blackburne', 'legal', 'scholar', 'caro-nd6', 'siberian', 'englund', 'kieninger'], 'ловушки, которые кончаются матом');

// 2. подбор к репертуару
const op = (id: string, color: 'white' | 'black' | 'both', sans: string[]) =>
  ({ id, color, lines: sans.map(s => toMoves(s)) });
const REP = [
  op('italian', 'white', ['e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7']),
  op('stafford', 'black', ['e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5', 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 e5 Ne4 d4 Qh4 g3 Nxg3']),
  op('dragon', 'black', ['e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6']),
  op('caro', 'black', ['e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5']),
];
const { mine, other } = trapsForRepertoire(traps, REP);
eq(mine.map(m => `${m.trap.id}:${m.openingId}:${m.role}`), [
  'blackburne:italian:victim', 'legal:italian:setter', 'petrov-nc6:italian:setter',
  'stafford-bg5:stafford:setter', 'stafford-d3:stafford:setter', 'scholar:stafford:victim',
  'siberian:dragon:setter', 'caro-nd6:caro:victim',
], 'ловушки в твоих дебютах: кто ставит и где');
eq(other.length, 9, 'остальные — «Другие ловушки»');

const DEMO_ORDER = [REP[1], REP[0], REP[2], REP[3]];
eq(trapsForRepertoire(traps, DEMO_ORDER).mine.map(m => m.trap.id),
  ['stafford-bg5', 'stafford-d3', 'scholar', 'blackburne', 'legal', 'petrov-nc6', 'siberian', 'caro-nd6'],
  'порядок в демо: по дебютам, глубже совпадение — выше');
eq(matchTrap(traps.find(t => t.id === 'petrov-nc6')!, REP[0])!.k, 3, 'Русская партия подходит к Итальянской: 2...Nf6 — ход соперника');
eq(matchTrap(traps.find(t => t.id === 'petrov-nc6')!, REP[1]), null, 'Русская партия не подходит к Стаффорду');
eq(matchTrap(traps.find(t => t.id === 'noah')!, REP[0]), null, 'Испанская не подходит к Итальянской');

// 3. «Накажи» — Стаффорд
const st = traps.find(t => t.id === 'stafford-bg5')!;
let rp = punishRun(st);
eq([view(rp).fen, isMyTurn(rp), view(rp).lastMove], [st.moves[10].fen, true, { from: 'c1', to: 'g5' }], 'позиция после 6.Bg5, ходят чёрные');
rp = move(rp, 'f6', 'e4'); rp = auto(rp);
rp = move(rp, 'c5', 'f2'); rp = auto(rp);
rp = move(rp, 'c8', 'g4');
eq([rp.phase, result(rp).perfect], ['done', true], 'наказал без ошибок — мат');

const r2p = move(punishRun(st), 'c5', 'f2');
eq([view(r2p).arrows.map(a => a.role), r2p.mistakes.length], [['played', 'best'], 1], 'другой ход — стрелки и ошибка');

// 4. «Не попадись» — Блэкберн
const bb = traps.find(t => t.id === 'blackburne')!;
eq(fenBefore(bb.moves, bb.mistakePly).split(' ')[0], 'r1b1kbnr/pppp1ppp/8/4N1q1/2BnP3/8/PPPP1PPP/RNBQK2R', 'позиция перед 5.Nxf7');
eq([avoidVerdict(bb, 'e5', 'f7'), avoidVerdict(bb, 'e1', 'g1'), avoidVerdict(bb, 'c4', 'f7'), avoidVerdict(bb, 'd2', 'd3')], ['trap', 'safe', 'safe', 'other'], 'попался / безопасно / проверить движком');

// ── sprint ──
console.log('\n── sprint ──');
const Ds = {
  L1: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nxc6 bxc6 Qd4 Nf6 e5 Nd5 e6 f6',
  L2: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Nf6 Nc3 d6 Be2 Nxd4 Qxd4 Bg7 Be3 O-O Qd2 Be6',
  L3: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 Qa5 O-O O-O Bb3 d6',
};
const Ps: Record<string, { mastery: number; next_review: string } | null> = {
  L1: { mastery: 4, next_review: new Date(NOW + 20 * DAY).toISOString() },
  L2: { mastery: 2, next_review: new Date(NOW - DAY).toISOString() },
  L3: null,
};
const sLines = Object.entries(Ds).map(([id, s]) => ({ id, moves: toMoves(s), myColor: 'b' as const, prog: Ps[id] }));
const items = sprintItems(sLines, NOW, new Set(['L3:13']));
eq(items.length, 18, '18 позиций: общие ходы — по одному разу');
eq(items.filter(i => i.san === 'g6').map(i => [i.lineId, i.w]), [['L2', 3]], '4... g6 — один раз, вес линии к повторению');
eq(items.find(i => i.san === 'Qa5')!.w, 3, 'трудный ход ×3');
eq(items.find(i => i.san === 'Nd5')!.w, 0.5, 'освоенная линия ×0.5');
const order1 = sprintOrder(items, rng(7)).slice(0, 3).map(i => i.san);
eq(sprintOrder(items, rng(7)).slice(0, 3).map(i => i.san), order1, 'порядок с одним зерном повторяется');
eq(sprintCheck(items[0], items[0].from, items[0].to), true, 'проверка хода');

// ── ideas ──
console.log('\n── ideas ──');
const ends = endPositions(sLines.map(l => ({ ...l, openingId: 'dragon' })));
eq(ends.map(e => e.last), ['8... f6', '10... Be6', '9... d6'], 'конечные позиции линий');
const stats = {
  moves: [
    { san: 'O-O', uci: 'e1g1', white: 30, draws: 40, black: 20 },
    { san: 'f3', uci: 'f2f3', white: 12, draws: 15, black: 8 },
    { san: 'Rc1', uci: 'a1c1', white: 10, draws: 12, black: 9 },
    { san: 'b3', uci: 'b2b3', white: 2, draws: 3, black: 1 },
    { san: 'h3', uci: 'h2h3', white: 0, draws: 1, black: 1 },
  ],
};
const ms = moveStats(stats);
eq([ms[0].games, Math.round(ms[0].share * 100), ms[0].white, ms[0].draws, ms[0].black], [90, 55, 33, 44, 22], 'доля и результат хода');
eq(
  [ideaVerdict(stats, 'O-O').ok, ideaVerdict(stats, 'Rc1').ok, ideaVerdict(stats, 'b3').ok, ideaVerdict(stats, 'h3').ok, ideaVerdict(stats, 'a3').ok],
  [true, true, false, false, false],
  'как мастер: топ-3 или ≥ 10% партий',
);
eq(ideaVerdict(stats, 'a3').top.map(m => m.san), ['O-O', 'f3', 'Rc1'], 'подсказка — три самых частых хода');

// Проверка DAYS
eq(DAYS, [1, 3, 7, 14, 30, 60], 'DAYS константа');

if (fails) {
  console.log(`\nОшибок: ${fails}`);
  process.exit(1);
} else {
  console.log('\nвсе тесты: OK');
  process.exit(0);
}
