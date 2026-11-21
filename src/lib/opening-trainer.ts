// Логика тренажёра дебютов. Порт docs/design/pages/openings/opening-ref.cjs.
// Имена и поведение совпадают — тесты берутся из той же логики в scripts/test-pages2.ts.
import { Chess } from 'chess.js';

export interface ChessMove {
  san: string;
  from: string;
  to: string;
  fen: string;
  color: 'w' | 'b';
}

export type RunMode = 'review' | 'learn' | 'exam' | 'drill';
export type RunPhase = 'play' | 'consolidate' | 'done';

export interface Mistake { ply: number; kind: string; }
export interface WrongMove { ply: number; from: string; to: string; }
export interface RunEffect { type: string; key?: string; ply?: number; }

export interface Run {
  moves: ChessMove[];
  myColor: 'w' | 'b';
  mode: RunMode;
  startPly: number;
  endPly: number;
  ply: number;
  phase: RunPhase;
  mistakes: Mistake[];
  wrong: WrongMove | null;
  hint: number;
  consolidate: number[];
  failed: boolean;
  effects: RunEffect[];
}

export interface LessonProg {
  mastery: number;
  next_review: string;
  correct_count?: number;
  incorrect_count?: number;
}

export interface LineWithProg {
  id: string;
  index: number;
  prog: LessonProg | null;
}

export interface HardRow {
  line_id: string;
  move_index: number;
  incorrect_count: number;
  last_missed_at?: string | null;
}

export interface HardLineInfo {
  moves: ChessMove[];
  myColor: 'w' | 'b';
}

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DAY = 86400000;
export const DAYS = [1, 3, 7, 14, 30, 60];
export const MASTERED = 4;
const FIRST_REVIEW_DAYS = 1;
const XP_PERFECT = 5;

// ── ходы и подписи ───────────────────────────────────────────────────────────
export function toMoves(sans: string): ChessMove[] {
  const c = new Chess();
  return sans.split(/\s+/).filter(Boolean).map(s => {
    const m = c.move(s);
    return { san: m.san, from: m.from, to: m.to, fen: c.fen(), color: m.color as 'w' | 'b' };
  });
}

export const fenBefore = (moves: ChessMove[], k: number): string => (k === 0 ? START : moves[k - 1].fen);
const moveNo = (k: number) => Math.floor(k / 2) + 1;

export function numSan(moves: ChessMove[], k: number): string {
  return moves[k].color === 'w' ? `${moveNo(k)}. ${moves[k].san}` : `${moveNo(k)}... ${moves[k].san}`;
}

export function fmtMoves(moves: ChessMove[], a: number, b: number): string {
  const out: string[] = [];
  for (let k = a; k < Math.min(b, moves.length); k++) {
    if (k === a) out.push(numSan(moves, k));
    else out.push(moves[k].color === 'w' ? `${moveNo(k)}. ${moves[k].san}` : moves[k].san);
  }
  return out.join(' ');
}

export function lcp(a: ChessMove[], b: ChessMove[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i].san === b[i].san) i++;
  return i;
}

interface LineForLabel { id?: string; moves: ChessMove[]; }

export function lineLabels(lines: LineForLabel[], myColor: 'w' | 'b' | null = null): string[] {
  return lines.map((L, i) => {
    let p = 0;
    lines.forEach((M, j) => { if (j !== i) p = Math.max(p, lcp(L.moves, M.moves)); });
    const n = L.moves.length;
    if (!myColor) {
      const start = p >= n ? Math.max(0, n - 3) : p;
      return fmtMoves(L.moves, start, start + 3);
    }
    const opp = (k: number) => L.moves[k].color !== myColor;
    const ks: number[] = [];
    if (p >= n) {
      for (let k = n - 1; k >= 0 && ks.length < 2; k--) if (opp(k)) ks.unshift(k);
    } else {
      if (!opp(p)) ks.push(p);
      let c = 0;
      for (let k = p; k < n && c < 2; k++) if (opp(k)) { ks.push(k); c++; }
    }
    const segs: [number, number][] = [];
    for (const k of ks) {
      const last = segs[segs.length - 1];
      if (last && last[1] === k) last[1] = k + 1;
      else segs.push([k, k + 1]);
    }
    return segs.map(([a, b]) => fmtMoves(L.moves, a, b)).join(' … ');
  });
}

export interface LineGroup { label: string; ids: string[]; }

export function lineGroups(lines: Array<{ id: string; moves: ChessMove[] }>): LineGroup[] | null {
  if (lines.length <= 8) return null;
  const k = commonStart(lines);
  const groups: LineGroup[] = [];
  for (const L of lines) {
    const label = k < L.moves.length ? numSan(L.moves, k) : 'Основная линия';
    let g = groups.find(x => x.label === label);
    if (!g) { g = { label, ids: [] }; groups.push(g); }
    g.ids.push(L.id);
  }
  return groups.length > lines.length / 2 ? null : groups;
}

export function commonStart(lines: Array<{ moves: ChessMove[] }>): number {
  if (lines.length < 2) return 0;
  return lines.slice(1).reduce((p, L) => Math.min(p, lcp(lines[0].moves, L.moves)), lines[0].moves.length);
}

export function cardPly(lines: Array<{ moves: ChessMove[] }>, max = 12): { k: number; lineIdx: number } {
  if (!lines.length) return { k: 0, lineIdx: -1 };
  const need = Math.ceil(lines.length / 2);
  let best = { k: 0, lineIdx: 0 };
  for (let k = 1; k <= max; k++) {
    const groups = new Map<string, number[]>();
    lines.forEach((L, i) => {
      if (L.moves.length < k) return;
      const key = L.moves.slice(0, k).map(m => m.san).join(' ');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    const g = [...groups.values()].find(v => v.length >= need);
    if (!g) break;
    best = { k, lineIdx: g[0] };
  }
  return best;
}

// ── статусы и интервалы ──────────────────────────────────────────────────────
export type LineStatus = 'new' | 'due' | 'learning' | 'mastered';

export function lineStatus(prog: LessonProg | null, now: number): LineStatus {
  if (!prog) return 'new';
  if (Date.parse(prog.next_review) <= now) return 'due';
  return prog.mastery >= MASTERED ? 'mastered' : 'learning';
}

export interface StatusCounts { total: number; new: number; due: number; learning: number; mastered: number; }

export function countStatuses(progs: Array<LessonProg | null>, now: number): StatusCounts {
  const c: StatusCounts = { total: progs.length, new: 0, due: 0, learning: 0, mastered: 0 };
  for (const p of progs) c[lineStatus(p, now)]++;
  return c;
}

function plural(n: number, a: string, b: string, c: string): string {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return a;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return b;
  return c;
}

export const inDays = (d: number): string => (d <= 1 ? 'завтра' : `через ${d} ${plural(d, 'день', 'дня', 'дней')}`);

export function dueText(prog: LessonProg | null, now: number): string {
  const s = lineStatus(prog, now);
  if (s === 'new') return 'новая';
  if (s === 'due') return 'сегодня';
  if (s === 'mastered') return 'освоена';
  const d = Math.max(1, Math.ceil((Date.parse(prog!.next_review) - now) / DAY));
  return d === 1 ? 'завтра' : `через ${d} дн.`;
}

export interface ApplyResult {
  row: {
    correct_count: number;
    incorrect_count: number;
    mastery: number;
    next_review: string;
    last_practiced: string;
  };
  masteryBefore: number;
  masteryAfter: number;
  days: number;
  xp: number;
}

export function applyResult(prog: LessonProg | null, perfect: boolean, now: number, opts: { afterLearn?: boolean } = {}): ApplyResult {
  const m0 = prog ? prog.mastery : 0;
  let mastery: number, days: number;
  if (!prog) {
    mastery = perfect ? 1 : 0;
    days = perfect ? (opts.afterLearn ? FIRST_REVIEW_DAYS : DAYS[1]) : DAYS[0];
  } else if (perfect) {
    mastery = Math.min(m0 + 1, 5);
    days = DAYS[mastery];
  } else {
    mastery = m0;
    days = DAYS[Math.max(0, m0 - 1)];
  }
  return {
    row: {
      correct_count: (prog ? prog.correct_count || 0 : 0) + (perfect ? 1 : 0),
      incorrect_count: (prog ? prog.incorrect_count || 0 : 0) + (perfect ? 0 : 1),
      mastery,
      next_review: new Date(now + days * DAY).toISOString(),
      last_practiced: new Date(now).toISOString(),
    },
    masteryBefore: m0,
    masteryAfter: mastery,
    days,
    xp: perfect ? XP_PERFECT : 0,
  };
}

// ── очереди ──────────────────────────────────────────────────────────────────
export function reviewQueue(
  lines: LineWithProg[],
  now: number,
  { freshDev = new Set<string>(), forceLineId = null as string | null } = {},
): string[] {
  const due = lines.filter(l => lineStatus(l.prog, now) === 'due' || l.id === forceLineId);
  due.sort((a, b) =>
    (b.id === forceLineId ? 1 : 0) - (a.id === forceLineId ? 1 : 0) ||
    (freshDev.has(b.id) ? 1 : 0) - (freshDev.has(a.id) ? 1 : 0) ||
    Date.parse(a.prog ? a.prog.next_review : '1970-01-01T00:00:00Z') - Date.parse(b.prog ? b.prog.next_review : '1970-01-01T00:00:00Z') ||
    a.index - b.index);
  return due.map(l => l.id);
}

export function learnQueue(
  lines: LineWithProg[],
  { forceLineId = null as string | null } = {},
): string[] {
  return lines.filter(l => !l.prog || l.id === forceLineId)
    .sort((a, b) =>
      (b.id === forceLineId ? 1 : 0) - (a.id === forceLineId ? 1 : 0) ||
      a.index - b.index)
    .map(l => l.id);
}

export function weight(prog: LessonProg | null, now: number): number {
  if (!prog || prog.mastery === 0) return 100;
  if (Date.parse(prog.next_review) <= now) return 80;
  if (prog.mastery <= 2) return 30;
  if (prog.mastery <= 4) return 15;
  return 5;
}

export function hardQueue(rows: HardRow[], linesById: Record<string, HardLineInfo>): Array<{ lineId: string; ply: number }> {
  return rows
    .filter(r => r.incorrect_count > 0 && linesById[r.line_id] &&
      r.move_index < linesById[r.line_id].moves.length &&
      linesById[r.line_id].moves[r.move_index].color === linesById[r.line_id].myColor)
    .sort((a, b) => b.incorrect_count - a.incorrect_count ||
      Date.parse(b.last_missed_at || '1970-01-01T00:00:00Z') - Date.parse(a.last_missed_at || '1970-01-01T00:00:00Z'))
    .slice(0, 20)
    .map(r => ({ lineId: r.line_id, ply: r.move_index }));
}

// ── с какого хода начинать ───────────────────────────────────────────────────
const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const okKey = (moves: ChessMove[], k: number) => `${posKey(fenBefore(moves, k))}|${moves[k].from}${moves[k].to}`;

export function sessionStart(moves: ChessMove[], myColor: 'w' | 'b', okSet: Set<string>): number {
  let k = 0;
  while (k < moves.length) {
    if (moves[k].color !== myColor || okSet.has(okKey(moves, k))) { k++; continue; }
    break;
  }
  if (k >= moves.length || k <= 1) return 0;
  return k;
}

export function learnStart(moves: ChessMove[], knownLines: Array<{ moves: ChessMove[] }>): number {
  let p = 0;
  for (const L of knownLines) p = Math.max(p, lcp(moves, L.moves));
  return p >= moves.length || p <= 1 ? 0 : p;
}

// ── прогон одной линии ───────────────────────────────────────────────────────
export function createRun(
  moves: ChessMove[],
  myColor: 'w' | 'b',
  mode: RunMode,
  { startPly = 0, endPly }: { startPly?: number; endPly?: number } = {},
): Run {
  return {
    moves, myColor, mode,
    startPly,
    endPly: endPly ?? moves.length,
    ply: startPly,
    phase: 'play',
    mistakes: [],
    wrong: null,
    hint: 0,
    consolidate: [],
    failed: false,
    effects: [],
  };
}

const curPly = (r: Run) => (r.phase === 'consolidate' ? r.consolidate[0] : r.ply);
export const isMyTurn = (r: Run) => r.phase !== 'done' && curPly(r) < r.endPly && r.moves[curPly(r)].color === r.myColor;
export const needsAuto = (r: Run) => r.phase === 'play' && r.ply < r.endPly && r.moves[r.ply].color !== r.myColor;

function finish(r: Run): void {
  if (r.mode === 'review' && r.mistakes.length && r.phase === 'play') {
    r.phase = 'consolidate';
    r.consolidate = [...new Set(r.mistakes.map(m => m.ply))].sort((a, b) => a - b);
  } else {
    r.phase = 'done';
  }
}

function addMistake(r: Run, ply: number, kind: string): void {
  if (r.mistakes.some(m => m.ply === ply)) return;
  r.mistakes.push({ ply, kind });
  r.effects.push({ type: 'mistake', ply });
}

export function auto(r0: Run): Run {
  const r: Run = { ...r0, effects: [] };
  if (!needsAuto(r)) return r;
  r.ply++;
  if (r.ply >= r.endPly) finish(r);
  return r;
}

export function move(r0: Run, from: string, to: string): Run {
  const r: Run = { ...r0, mistakes: [...r0.mistakes], consolidate: [...r0.consolidate], effects: [] };
  if (!isMyTurn(r)) return r;
  const k = curPly(r);
  const exp = r.moves[k];

  // Illegal move (not a valid chess move in this position) → snap piece back silently
  const legal = new Chess(fenBefore(r.moves, k)).moves({ verbose: true });
  if (!legal.some(m => m.from === from && m.to === to)) return r0;
  if (from === exp.from && to === exp.to) {
    r.wrong = null;
    r.hint = 0;
    if (r.phase === 'consolidate') {
      r.consolidate.shift();
      if (!r.consolidate.length) r.phase = 'done';
    } else {
      if (!r.mistakes.some(m => m.ply === k)) r.effects.push({ type: 'ok', key: okKey(r.moves, k) });
      r.ply++;
      if (r.ply >= r.endPly) finish(r);
    }
    return r;
  }
  r.wrong = { ply: k, from, to };
  if (r.mode === 'exam') {
    addMistake(r, k, 'wrong');
    r.failed = true;
    r.phase = 'done';
  } else if (r.mode !== 'learn' && r.phase === 'play') {
    addMistake(r, k, 'wrong');
  }
  return r;
}

export function hint(r0: Run): Run {
  const r: Run = { ...r0, mistakes: [...r0.mistakes], effects: [] };
  if (!isMyTurn(r) || r.mode === 'learn' || r.mode === 'exam' || r.wrong) return r;
  r.hint = Math.min(2, r.hint + 1);
  if (r.phase === 'play') addMistake(r, r.ply, 'hint');
  return r;
}

export function restart(r0: Run): Run {
  if (r0.mode === 'exam') return r0;
  return { ...r0, ply: r0.startPly, phase: 'play', wrong: null, hint: 0, consolidate: [], effects: [] };
}

export function result(r: Run): { perfect: boolean; mistakes: number; failed: boolean } {
  return {
    perfect: r.phase === 'done' && !r.failed && r.mistakes.length === 0,
    mistakes: r.mistakes.length,
    failed: r.failed,
  };
}

export function playedSan(moves: ChessMove[], k: number, from: string, to: string): string {
  const c = new Chess(fenBefore(moves, k));
  try {
    return c.move({ from, to, promotion: 'q' }).san;
  } catch {
    return `${from}–${to}`;
  }
}

function playedNum(moves: ChessMove[], k: number, from: string, to: string): string {
  const san = playedSan(moves, k, from, to);
  return moves[k].color === 'w' ? `${moveNo(k)}. ${san}` : `${moveNo(k)}... ${san}`;
}

export interface ArrowDesc { from: string; to: string; role: string; style?: string; }
export interface Feedback { result: string; text: string; }
export interface RunView {
  fen: string;
  lastMove: { from: string; to: string } | null;
  arrows: ArrowDesc[];
  rings: Record<string, string>;
  title: string;
  feedback: Feedback | null;
}

export function view(r: Run): RunView {
  const k = curPly(r);
  const showPly = r.phase === 'done' ? r.ply : k;
  const fen = r.phase === 'done' && r.failed ? fenBefore(r.moves, r.wrong!.ply) : fenBefore(r.moves, showPly);
  const lm = (r.phase === 'done' && r.failed ? r.wrong!.ply : showPly) - 1;
  const lastMove = lm >= 0 ? { from: r.moves[lm].from, to: r.moves[lm].to } : null;
  const arrows: ArrowDesc[] = [];
  const rings: Record<string, string> = {};
  const exp = k < r.moves.length ? r.moves[k] : null;
  if (r.wrong && (r.phase !== 'done' || r.failed)) {
    const e = r.moves[r.wrong.ply];
    arrows.push({ from: r.wrong.from, to: r.wrong.to, role: 'played' });
    arrows.push({ from: e.from, to: e.to, role: 'best', style: 'dashed' });
  } else if (isMyTurn(r) && (r.mode === 'learn' || r.hint === 2) && exp) {
    arrows.push({ from: exp.from, to: exp.to, role: 'best', style: 'dashed' });
  } else if (isMyTurn(r) && r.hint === 1 && exp) {
    rings[exp.from] = '#81B64C';
  }
  let title: string;
  let feedback: Feedback | null = null;
  if (r.phase === 'done') {
    if (r.failed) {
      title = 'Ошибка в линии';
      feedback = { result: 'fail', text: `Ты сыграл ${playedNum(r.moves, r.wrong!.ply, r.wrong!.from, r.wrong!.to)}, в линии ${numSan(r.moves, r.wrong!.ply)}.` };
    } else if (r.mode === 'learn') {
      title = 'Линия пройдена';
      feedback = { result: 'info', text: 'Теперь сыграй её по памяти — без стрелок.' };
    } else if (!r.mistakes.length) {
      title = 'Линия без ошибок';
      feedback = { result: 'ok', text: '' };
    } else {
      title = 'Линия пройдена с ошибками';
      feedback = { result: 'done', text: '' };
    }
  } else if (r.phase === 'consolidate') {
    title = 'Закрепим ошибку';
    feedback = r.wrong
      ? { result: 'fail', text: `Здесь ${numSan(r.moves, k)} — сыграй его.` }
      : { result: 'info', text: `Здесь ты ошибся. Сыграй ход из линии по памяти.` };
  } else if (r.wrong) {
    if (r.mode === 'learn') {
      title = `Сыграй ${numSan(r.moves, k)}`;
      feedback = { result: 'info', text: `По линии здесь ${numSan(r.moves, k)} — ход показан стрелкой.` };
    } else {
      title = 'Не тот ход';
      feedback = { result: 'fail', text: `Ты сыграл ${playedNum(r.moves, k, r.wrong.from, r.wrong.to)}. В твоей линии здесь ${numSan(r.moves, k)} — сыграй его на доске.` };
    }
  } else if (isMyTurn(r)) {
    title = r.mode === 'learn' ? `Сыграй ${numSan(r.moves, k)}` : 'Твой ход';
    if (r.hint) feedback = { result: 'hint', text: r.hint === 1 ? 'Ходит фигура в кольце. Ещё раз H — покажу ход.' : `Ход: ${numSan(r.moves, k)}.` };
  } else {
    title = 'Соперник ходит…';
  }
  return { fen, lastMove, arrows, rings, title, feedback };
}

export interface StepItem { ply: number; state: string; current: boolean; }
export interface StepsResult { items: StepItem[]; label: string; }

export function steps(r: Run): StepsResult {
  const k = curPly(r);
  const out: StepItem[] = [];
  for (let p = r.startPly; p < r.endPly; p++) {
    if (r.moves[p].color !== r.myColor) continue;
    const m = r.mistakes.find(x => x.ply === p);
    const bad = m ? (m.kind === 'hint' ? 'hint' : 'fail') : null;
    const current = r.phase !== 'done' && p === k;
    let state: string;
    if (current) state = bad || 'now';
    else if (p < r.ply || r.phase !== 'play') state = bad || 'ok';
    else state = 'todo';
    out.push({ ply: p, state, current });
  }
  const i = out.findIndex(s => s.current);
  return { items: out, label: i >= 0 ? `Ход ${i + 1} из ${out.length}` : `${out.length} ${plural(out.length, 'ход', 'хода', 'ходов')}` };
}

export interface MoveItem { ply: number; text: string; state: string; }

export function moveItems(r: Run): MoveItem[] {
  const k = curPly(r);
  const end = r.mode === 'learn' ? r.moves.length : (r.phase === 'done' ? r.ply : k);
  const items: MoveItem[] = [];
  for (let p = 0; p < end; p++) {
    const m = r.mistakes.find(x => x.ply === p);
    const state = p >= k && r.mode === 'learn' && r.phase !== 'done'
      ? (p === k ? 'now' : 'future')
      : r.moves[p].color !== r.myColor
        ? 'opp'
        : m
          ? m.kind
          : 'ok';
    items.push({ ply: p, text: p === 0 || r.moves[p].color === 'w' ? numSan(r.moves, p) : r.moves[p].san, state });
  }
  if (r.mode !== 'learn' && r.phase !== 'done' && isMyTurn(r)) {
    items.push({ ply: k, text: r.moves[k].color === 'w' ? `${moveNo(k)}. ?` : '?', state: 'now' });
  }
  return items;
}
