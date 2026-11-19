/**
 * Test suite for src/lib/lesson.ts
 * Port of docs/design/pages/course/lesson-ref.cjs tests.
 * Run: npx tsx scripts/test-lesson.ts
 */

import * as assert from 'assert';
import {
  moveLabel, LABEL_KIND, LABEL_NAME, boardMarks,
  sanNo, variationText, buildSteps, lessonLines, stepFen, initialState,
  playStart, playMove, playHint, progressAfterRun,
  puzzleVerdict, choiceVerdict,
  plural, movesWord,
} from '../src/lib/lesson.ts';
import type { LessonLine, LessonStep } from '../src/lib/lesson.ts';

// Load demo course
import demoJson from '../docs/design/pages/course/demo-course.json' assert { type: 'json' };

const demo = demoJson as {
  lessons: Array<{
    n: number;
    content: {
      blocks?: Array<Record<string, unknown>>;
      goal?: string;
      summary?: string;
      plan?: string;
      mistakes?: string;
      trap?: string;
    };
  }>;
};

const L2 = demo.lessons[1];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lines: LessonLine[] = lessonLines(L2.content as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const steps: LessonStep[] = buildSteps(L2.content as any);

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

console.log('\n── lesson.ts test suite ──\n');

t('шаги урока 2', () => {
  assert.deepStrictEqual(steps.map(s => s.kind), ['text', 'line', 'line', 'plan', 'mistakes', 'quiz', 'summary']);
  assert.strictEqual(steps[0].title, 'Вступление');
  assert.strictEqual(steps[1].title, 'Схема f3 и Qd2 — удар 8...d5!');
  assert.strictEqual((steps[5] as { items: unknown[] }).items.length, 3);
  assert.ok((steps[6] as { md: string }).md.startsWith('Пока пешка d стоит на d7'));
});

t('линии из блоков', () => {
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].moves.length, 22);
  assert.ok(lines[0].intro_md?.includes('Be3, f3, Qd2'));
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
  assert.strictEqual(LABEL_KIND[moveLabel(lines[0].moves[1])!], 'book');
});

t('вариант к 11... Qxc6', () => {
  const m = lines[0].moves[21];
  assert.strictEqual(m.san, 'Qxc6');
  assert.strictEqual(variationText(null, 22, m.variations![0]), '11... Qxd2+ 12. Bxd2 bxc6 13. O-O-O');
  assert.strictEqual(variationText(null, 17, lines[1].moves[16].variations![0]), '9. Nxc6 bxc6 10. e5 Ne8 11. f4 f6');
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
  assert.strictEqual(st.ply, 1);  // 1. e4 сыгран сам
  let r = playMove(st, line, 'c7', 'c5'); st = r.st;
  assert.strictEqual(r.result, 'ok'); assert.strictEqual(st.ply, 3);
  r = playMove(st, line, 'e7', 'e6'); st = r.st;
  assert.strictEqual(r.result, 'fail'); assert.deepStrictEqual(r.arrows!.map(a => a.role), ['played']);
  r = playMove(st, line, 'd7', 'd6'); st = r.st;
  assert.deepStrictEqual(r.arrows!.map(a => a.role), ['played', 'best']);
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
  assert.deepStrictEqual(
    progressAfterRun({ guess_total: 1, guess_correct: 1, completed: false }, { ...st, mistakes: true }, true),
    { guess_total: 2, guess_correct: 1, completed: true }
  );
});

t('«Проверь себя»', () => {
  const items = (steps[5] as { items: Array<{ type: string; fen?: string; question: string; answer: string; why?: string; options?: Record<string, string> }> }).items;
  const [q1, q2, q3] = items;
  assert.deepStrictEqual(choiceVerdict(q1, 'A'), { result: 'ok' });
  assert.deepStrictEqual(choiceVerdict(q1, 'B'), { result: 'fail', correct: 'A' });
  assert.strictEqual(puzzleVerdict(q2, 'd7', 'd5').result, 'ok');
  assert.deepStrictEqual(puzzleVerdict(q2, 'd7', 'd6').arrows!.map((a: { role: string }) => a.role), ['played', 'best']);
  assert.strictEqual(puzzleVerdict(q3, 'd8', 'd5').result, 'ok');
  assert.strictEqual(puzzleVerdict({ type: 'puzzle', fen: q2.fen, answer: 'ударить в центр', question: '' }, 'd7', 'd5').result, 'reveal');
});

t('старый урок без блоков', () => {
  const old = { title: 'Старый', summary: 'Итог', plan: 'План', mistakes: '', trap: '' };
  const s = buildSteps(old, [{ title: '', moves: [] }], [{ type: 'puzzle' as const, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', question: '?', answer: 'e4', why: '' }]);
  assert.deepStrictEqual(s.map(x => x.kind), ['line', 'plan', 'quiz', 'summary']);
  assert.strictEqual(s[0].title, 'Линия 1');
});

t('склонения', () => {
  assert.strictEqual(movesWord(11), '11 ходов'); assert.strictEqual(movesWord(22), '22 хода'); assert.strictEqual(movesWord(1), '1 ход');
});

console.log(`\n${failed > 0 ? '✗ FAILED' : 'все тесты: OK'} (${n}/${n + failed})\n`);
if (failed > 0) process.exit(1);
