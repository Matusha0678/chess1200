// src/lib/lesson.ts
// Port of docs/design/pages/course/lesson-ref.cjs (COURSE-LESSON.md §2.1).

import { Chess } from 'chess.js';
import type { CourseLessonMove } from '@/types/courses';

export type LabelKind = '!!' | '!' | '!?' | 'best' | 'book' | 'good' | '?!' | '?' | 'miss' | '??';
export type BadgeKind2 = 'brilliant' | 'great' | 'interesting' | 'best' | 'book' | 'good' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';

export interface LessonMove {
  san: string;
  color: 'w' | 'b';
  from: string;
  to: string;
  fen: string;
  comment?: string;
  arrows?: Array<{ from: string; to: string; color: string }>;
  squares?: Array<{ square: string; color: string }>;
  nags?: number[];
  variations?: LessonMove[][];
  label?: string;
}

export interface LessonLine {
  title?: string;
  intro_md?: string;
  outro_md?: string;
  moves: LessonMove[];
  start_fen?: string | null;
}

export interface LessonStepText { kind: 'text'; title: string; md: string }
export interface LessonStepLine { kind: 'line'; title: string; line: number }
export interface LessonStepPlan { kind: 'plan' | 'mistakes' | 'trap'; title: string; md: string }
export interface LessonStepQuiz { kind: 'quiz' | 'idea'; title: string; items: QuizItem[] }
export interface LessonStepSummary { kind: 'summary'; title: string; md: string }
export type LessonStep =
  | LessonStepText
  | LessonStepLine
  | LessonStepPlan
  | LessonStepQuiz
  | LessonStepSummary;

export interface QuizItem {
  type: 'choice' | 'puzzle' | 'reveal';
  question: string;
  answer: string;
  why?: string;
  fen?: string;
  options?: Record<string, string>;
}

export interface PlayState {
  color: 'w' | 'b';
  ply: number;
  attempts: number;
  firstTry: number;
  mine: number;
  mistakes: boolean;
  done: boolean;
}

// ── Значки ходов ────────────────────────────────────────────────────────────
export const NAG_LABEL: Record<number, string> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

/** Значок хода: поле label, иначе первый NAG (как getEffectiveLabel в LessonViewer). */
export function moveLabel(m: LessonMove | CourseLessonMove | null | undefined): string | null {
  if (!m) return null;
  if (m.label) return m.label;
  return NAG_LABEL[(m.nags ?? [])[0]] ?? null;
}

/** Значок → BadgeKind для Board (картинки public/icons/move-classes). '!?' — новый вид 'interesting'. */
export const LABEL_KIND: Record<string, string> = {
  '!!': 'brilliant', '!': 'great', best: 'best', book: 'book', good: 'good',
  '?!': 'inaccuracy', '?': 'mistake', miss: 'miss', '??': 'blunder', '!?': 'interesting',
};

export const LABEL_NAME: Record<string, string> = {
  '!!': 'Блестящий ход', '!': 'Сильный ход', '!?': 'Интересный ход',
  best: 'Лучший ход', book: 'Книжный ход', good: 'Хороший ход',
  '?!': 'Неточность', '?': 'Ошибка', miss: 'Упущенный шанс', '??': 'Зевок',
};

// ── Стрелки и клетки автора курса ([%cal], [%csl]) ──────────────────────────
export const ARROW_COLOR: Record<string, string> = {
  green: '#7FB24A', red: '#D9534A', yellow: '#E8B53A', blue: '#4A90E2',
};
export const TINT: Record<string, string> = {
  green: 'rgba(129,182,76,.45)', red: 'rgba(224,87,74,.45)',
  yellow: 'rgba(240,194,74,.45)', blue: 'rgba(74,144,226,.45)',
};

/** Что рисовать на доске после хода m (режим «Смотреть»). */
export function boardMarks(m: LessonMove | CourseLessonMove | null | undefined) {
  if (!m) return { arrows: [], tints: {}, badges: {}, lastMove: null };
  const arrows = ((m.arrows ?? []) as Array<{ from: string; to: string; color: string }>).map(a => ({
    from: a.from, to: a.to,
    color: ARROW_COLOR[a.color] ?? ARROW_COLOR.yellow,
    role: 'note' as const,
    opacity: 0.85,
  }));
  const tints: Record<string, string> = {};
  for (const s of ((m.squares ?? []) as Array<{ square: string; color: string }>)) {
    tints[s.square] = TINT[s.color] ?? TINT.yellow;
  }
  const label = moveLabel(m);
  const badges: Record<string, string> = label ? { [m.to]: LABEL_KIND[label] } : {};
  return { arrows, tints, badges, lastMove: { from: m.from, to: m.to } };
}

// ── Номера ходов ────────────────────────────────────────────────────────────
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Номер и цвет полухода ply (1 — первый ход линии) от позиции startFen. */
export function plyNo(startFen: string | null | undefined, ply: number): { n: number; color: 'w' | 'b' } {
  const f = (startFen ?? START).split(' ');
  const turn = f[1] ?? 'w', full = Number(f[5] ?? 1);
  const k = ply - 1 + (turn === 'b' ? 1 : 0);
  return { n: full + Math.floor(k / 2), color: k % 2 === 0 ? 'w' : 'b' };
}

/** «8... d5» / «9. exd5» */
export function sanNo(startFen: string | null | undefined, ply: number, san: string): string {
  const { n, color } = plyNo(startFen, ply);
  return color === 'w' ? `${n}. ${san}` : `${n}... ${san}`;
}

/** Строка ходов с номерами, первый ход — полуход firstPly: «11... Qxd2+ 12. Bxd2 bxc6 13. O-O-O» */
export function movesText(startFen: string | null | undefined, firstPly: number, sans: string[]): string {
  return sans.map((san, i) => {
    const ply = firstPly + i;
    const { n, color } = plyNo(startFen, ply);
    if (i === 0) return sanNo(startFen, ply, san);
    return color === 'w' ? `${n}. ${san}` : san;
  }).join(' ');
}

/** Вариант к ходу ply (заменяет этот ход, начинается из той же позиции). */
export function variationText(
  startFen: string | null | undefined,
  ply: number,
  variation: Array<{ san: string }>
): string {
  return movesText(startFen, ply, variation.map(m => m.san));
}

// ── Шаги урока ──────────────────────────────────────────────────────────────
const DEFAULT_TITLE: Record<string, string> = { plan: 'План', mistakes: 'Ошибки', trap: 'Ловушка', summary: 'Итог' };

/**
 * Шаги урока по порядку. Источник — lesson.blocks (формат v1); если блоков нет — старые поля
 * (lesson_lines, summary/plan/mistakes/trap, lesson_questions).
 * Правила: «Итог» всегда последний шаг (это экран конца урока); если есть цель, а первого текста нет — «Вступление».
 */
export function buildSteps(
  lesson: {
    goal?: string;
    blocks?: Array<{ type: string; title?: string; md?: string; items?: QuizItem[]; moves?: LessonMove[]; intro_md?: string; outro_md?: string; start_fen?: string }>;
    summary?: string;
    plan?: string;
    mistakes?: string;
    trap?: string;
  },
  lines: LessonLine[] = [],
  questions: QuizItem[] = []
): LessonStep[] {
  const steps: LessonStep[] = [];
  const summaryMd: string[] = [];

  if (lesson.blocks && lesson.blocks.length) {
    let li = 0;
    for (const b of lesson.blocks) {
      if (b.type === 'text') {
        steps.push({ kind: 'text', title: b.title ?? (steps.length === 0 ? 'Вступление' : 'Заметка'), md: b.md ?? '' });
      } else if (b.type === 'line') {
        steps.push({ kind: 'line', title: b.title ?? `Линия ${li + 1}`, line: li });
        li++;
      } else if (b.type === 'summary') {
        summaryMd.push(b.md ?? '');
      } else if (b.type === 'plan' || b.type === 'mistakes' || b.type === 'trap') {
        steps.push({ kind: b.type as 'plan' | 'mistakes' | 'trap', title: b.title ?? DEFAULT_TITLE[b.type], md: b.md ?? '' });
      } else if (b.type === 'quiz') {
        steps.push({ kind: 'quiz', title: b.title ?? 'Проверь себя', items: b.items ?? [] });
      } else if (b.type === 'idea') {
        steps.push({
          kind: 'idea',
          title: b.title ?? 'Идея позиции',
          items: (b.items ?? []).map(it => ({ ...it, type: 'choice' as const })),
        });
      }
    }
  } else {
    lines.forEach((l, i) => steps.push({ kind: 'line', title: l.title || `Линия ${i + 1}`, line: i }));
    for (const k of ['plan', 'mistakes', 'trap'] as const) {
      if ((lesson[k] ?? '').trim()) steps.push({ kind: k, title: DEFAULT_TITLE[k], md: lesson[k]! });
    }
    if (questions.length) {
      steps.push({
        kind: 'quiz',
        title: 'Проверь себя',
        items: questions.map(q => ({ type: 'puzzle' as const, fen: q.fen ?? '', question: q.question, answer: q.answer, why: q.why ?? '' })),
      });
    }
    if ((lesson.summary ?? '').trim()) summaryMd.push(lesson.summary!);
  }

  if (lesson.goal && (!steps.length || steps[0].kind !== 'text')) {
    steps.unshift({ kind: 'text', title: 'Вступление', md: '' });
  }
  steps.push({ kind: 'summary', title: 'Итог', md: summaryMd.join('\n\n') });
  return steps;
}

/** Линии урока: из блоков 'line' (в них есть всё) или из lesson_lines. */
export function lessonLines(
  lesson: {
    blocks?: Array<{ type: string; title?: string; intro_md?: string; outro_md?: string; moves?: LessonMove[]; start_fen?: string }>;
  },
  lines: LessonLine[] = []
): LessonLine[] {
  const fromBlocks = (lesson.blocks ?? []).filter(b => b.type === 'line');
  if (fromBlocks.length) {
    return fromBlocks.map(b => ({
      title: b.title,
      intro_md: b.intro_md ?? '',
      outro_md: b.outro_md ?? '',
      moves: (b.moves ?? []) as LessonMove[],
      start_fen: b.start_fen ?? null,
    }));
  }
  return lines.map(l => ({
    title: l.title ?? '',
    intro_md: l.intro_md ?? '',
    outro_md: l.outro_md ?? '',
    moves: l.moves as LessonMove[],
    start_fen: l.start_fen ?? null,
  }));
}

/** Какую позицию показать на шаге без своей доски: конец ближайшей линии слева; если линий слева нет — начало первой линии. */
export function stepFen(steps: LessonStep[], idx: number, lines: LessonLine[]): string {
  for (let i = idx; i >= 0; i--) {
    if (steps[i].kind === 'line') {
      const lineIdx = (steps[i] as LessonStepLine).line;
      const l = lines[lineIdx];
      if (l) return l.moves.length ? l.moves[l.moves.length - 1].fen : (l.start_fen ?? START);
    }
  }
  return lines[0] ? (lines[0].start_fen ?? START) : START;
}

/** Начальное состояние по адресу: ?step=N (с 1), ?line=K (с 1) и ?ply=P, ?mode=play. */
export function initialState(
  steps: LessonStep[],
  query: { step?: string; line?: string; ply?: string; mode?: string },
  doneSteps: number[] = []
): { step: number; ply: number; mode: 'watch' | 'play' } {
  let step = 0;
  if (query.line) {
    const k = Number(query.line) - 1;
    const i = steps.findIndex(s => s.kind === 'line' && (s as LessonStepLine).line === k);
    if (i >= 0) step = i;
  } else if (query.step) {
    step = Math.min(Math.max(Number(query.step) - 1, 0), steps.length - 1);
  } else {
    const i = steps.findIndex((_, j) => !doneSteps.includes(j + 1));
    step = i >= 0 ? i : 0;
  }
  return {
    step,
    ply: query.ply ? Number(query.ply) : 0,
    mode: query.mode === 'play' ? 'play' : 'watch',
  };
}

// ── «Сыграй сам» ────────────────────────────────────────────────────────────

/** Сколько ходов соперника сыграть сами (с ply), пока не очередь ученика. */
function autoOpp(line: LessonLine, color: 'w' | 'b', ply: number): { ply: number; done: boolean } {
  let p = ply;
  while (p < line.moves.length && line.moves[p].color !== color) p++;
  return { ply: p, done: p >= line.moves.length };
}

/** Новый прогон линии за цвет color ('w' | 'b'). */
export function playStart(line: LessonLine, color: 'w' | 'b'): PlayState {
  const auto = autoOpp(line, color, 0);
  return { color, ply: auto.ply, attempts: 0, firstTry: 0, mine: 0, mistakes: false, done: auto.done };
}

/** Ход ученика (from, to). Возвращает новое состояние и что показать. */
export function playMove(
  st: PlayState,
  line: LessonLine,
  from: string,
  to: string
): { st: PlayState; result: 'ok' | 'fail' | 'none'; arrows?: Array<{ from: string; to: string; role: string }>; played?: LessonMove } {
  const exp = line.moves[st.ply];
  if (!exp || st.done) return { st, result: 'none' };
  if (exp.from === from && exp.to === to) {
    const first = st.attempts === 0;
    const nx: PlayState = { ...st, firstTry: st.firstTry + (first ? 1 : 0), mine: st.mine + 1, attempts: 0, mistakes: st.mistakes || !first };
    const after = autoOpp(line, st.color, st.ply + 1);
    return { st: { ...nx, ply: after.ply, done: after.done }, result: 'ok', arrows: [], played: exp };
  }
  const attempts = st.attempts + 1;
  const arrows: Array<{ from: string; to: string; role: string }> = [{ from, to, role: 'played' }];
  if (attempts >= 2) arrows.push({ from: exp.from, to: exp.to, role: 'best' });
  return { st: { ...st, attempts, mistakes: true }, result: 'fail', arrows };
}

/** Подсказка H: стрелка верного хода, ход уже не «с первой попытки». */
export function playHint(st: PlayState, line: LessonLine): { st: PlayState; arrows: Array<{ from: string; to: string; role: string }> } {
  const exp = line.moves[st.ply];
  return {
    st: { ...st, attempts: Math.max(st.attempts, 2), mistakes: true },
    arrows: exp ? [{ from: exp.from, to: exp.to, role: 'best' }] : [],
  };
}

/** Запись в lesson_progress после прогона линии до конца (как было на /practice). */
export function progressAfterRun(
  prev: { guess_total?: number; guess_correct?: number; completed?: boolean } | null | undefined,
  st: PlayState,
  allLinesPlayed: boolean
): { guess_total: number; guess_correct: number; completed: boolean } {
  return {
    guess_total: (prev?.guess_total ?? 0) + 1,
    guess_correct: (prev?.guess_correct ?? 0) + (st.mistakes ? 0 : 1),
    completed: Boolean(prev?.completed) || allLinesPlayed,
  };
}

// ── «Проверь себя» ──────────────────────────────────────────────────────────
const cleanSan = (s: string): string => String(s ?? '').trim().replace(/[+#!?]+$/g, '');

/** Можно ли решать задачу ходом на доске (ответ — легальный SAN в позиции). Иначе — «Показать ответ». */
export function puzzleMove(item: QuizItem): { from: string; to: string; san: string } | null {
  if (!item.fen) return null;
  try {
    const c = new Chess(item.fen);
    const m = c.move(cleanSan(item.answer));
    return m ? { from: m.from, to: m.to, san: m.san } : null;
  } catch {
    return null;
  }
}

export function puzzleVerdict(
  item: QuizItem,
  from: string,
  to: string
): { result: 'ok' | 'fail' | 'reveal'; arrows?: Array<{ from: string; to: string; role: string }> } {
  const ans = puzzleMove(item);
  if (!ans) return { result: 'reveal' };
  if (ans.from === from && ans.to === to) return { result: 'ok', arrows: [] };
  return { result: 'fail', arrows: [{ from, to, role: 'played' }, { from: ans.from, to: ans.to, role: 'best' }] };
}

export function choiceVerdict(
  item: QuizItem,
  key: string
): { result: 'ok' | 'fail'; correct?: string } {
  return key === item.answer ? { result: 'ok' } : { result: 'fail', correct: item.answer };
}

// ── Склонения ───────────────────────────────────────────────────────────────
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const movesWord = (n: number): string => `${n} ${plural(n, 'ход', 'хода', 'ходов')}`;
