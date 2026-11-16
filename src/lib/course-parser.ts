// Parser for course format v1 (see src/lib/course-format-spec.ts).
//
// A course is one Markdown file: YAML header, "# Урок N: …" lessons, "## …" sections.
// Lines are PGN with comments {…}, one level of variations (…) and arrows [%cal …] / [%csl …].
// parseCourse() never throws: it returns the compiled course (or null) plus errors and warnings.

import { Chess } from 'chess.js';
import { parse as parseYaml } from 'yaml';
import type { Course, CourseLessonMove, LessonBlock, QuizItem } from '@/types/courses';

export const MAX_MAIN_MOVES = 12;
export const MAX_VAR_MOVES = 8;

// ── Public types ────────────────────────────────────────────────────────────

export interface ParsedLine {
  title: string;
  intro_md: string;
  outro_md: string;
  moves: CourseLessonMove[];
}

export interface ParsedQuestion {
  fen: string;
  question: string;
  answer: string;
  why: string;
  order: number;
}

export interface ParsedLesson {
  title: string;
  /** 0-based position in the course */
  order: number;
  goal: string;
  /** Full lesson content in reading order. This is the main data for the lesson viewer. */
  blocks: LessonBlock[];
  // Flat copies for the pages that still read the old columns (summary/plan/mistakes/trap, lesson_lines, lesson_questions)
  lines: ParsedLine[];
  summary: string;
  plan: string;
  mistakes: string;
  trap: string;
  /** "puzzle" quiz items only (they have a FEN) */
  questions: ParsedQuestion[];
}

export interface ParsedCourse {
  meta: Omit<Course, 'id' | 'created_at'>;
  lessons: ParsedLesson[];
}

export interface ParseResult {
  course: ParsedCourse | null;
  errors: string[];
  warnings: string[];
}

// ── Report ──────────────────────────────────────────────────────────────────

class Report {
  errors: string[] = [];
  warnings: string[] = [];
  err(where: string, msg: string) { this.errors.push(`${where}: ${msg}`); }
  warn(where: string, msg: string) { this.warnings.push(`${where}: ${msg}`); }
}

// ── Small helpers ───────────────────────────────────────────────────────────

const LESSON_RE = /^#\s+(?:Урок|Lesson)\s+(\d+)\s*:\s*(.+?)\s*$/;
const SECTION_RE = /^##\s+(.+?)\s*$/;
const CMD_RE = /\[%[^\]]*\]/g;
const GOOD_CMD_RE = /^\[%(cal|csl)\s+(?:[GRYB][a-h][1-8](?:[a-h][1-8])?,?)+\]$/;
const ARROW_CMD_RE = /\[%(cal|csl)\s+([^\]]*)\]/g;
const COLORS: Record<string, string> = { G: 'green', R: 'red', Y: 'yellow', B: 'blue' };
const MARK_NAG: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };

type SectionKind = 'line' | 'plan' | 'mistakes' | 'trap' | 'summary' | 'quiz' | 'text';
const KINDS: [SectionKind, string[]][] = [
  ['line', ['линия', 'line']],
  ['plan', ['план', 'plan']],
  ['mistakes', ['ошибки', 'mistakes']],
  ['trap', ['ловушка', 'trap']],
  ['summary', ['итог', 'summary']],
  ['quiz', ['проверь себя', 'quiz']],
];

function sectionKind(title: string): SectionKind {
  const low = title.toLowerCase();
  for (const [kind, names] of KINDS) {
    if (names.some(n => low.startsWith(n))) return kind;
  }
  return 'text';
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const firstLine = (s: string) => s.split('\n')[0];
const yamlHint = (e: unknown) =>
  `YAML не читается (${firstLine(errText(e))}). Если в тексте есть двоеточие, возьми значение в кавычки "…"`;

function cleanComment(raw: string): string {
  return raw.replace(CMD_RE, '').replace(/\s+/g, ' ').trim();
}

/** Remove an outer ``` / ```` fence if the whole file was pasted inside one. */
function unwrapFence(md: string): string {
  const m = /^(`{3,})[a-zA-Z]*\n([\s\S]*)\n\1\s*$/.exec(md.trim());
  return m && m[2].trimStart().startsWith('---') ? m[2] : md;
}

// ── Markdown blocks (text and ```lang fences) ───────────────────────────────

type Part = { kind: string; body: string };

function parseBlocks(lines: string[]): Part[] {
  const out: Part[] = [];
  let buf: string[] = [];
  let i = 0;
  const flush = () => {
    if (buf.length) out.push({ kind: 'text', body: buf.join('\n').trim() });
    buf = [];
  };
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith('```')) {
      flush();
      const lang = ln.slice(3).trim().toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { body.push(lines[i]); i++; }
      out.push({ kind: lang || 'code', body: body.join('\n') });
    } else {
      buf.push(ln);
    }
    i++;
  }
  flush();
  return out.filter(p => p.body.trim());
}

// ── PGN: tokens ─────────────────────────────────────────────────────────────

type Tok =
  | { t: 'move'; san: string; nag: number | null }
  | { t: 'comment'; text: string }
  | { t: 'nag'; n: number }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'result' };

class PgnError extends Error {}

function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{') {
      const end = text.indexOf('}', i);
      if (end === -1) throw new PgnError('не закрыта скобка { — у комментария нет закрывающей }');
      toks.push({ t: 'comment', text: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === '}') throw new PgnError('лишняя скобка }');
    if (c === ';') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      toks.push({ t: 'comment', text: text.slice(i + 1, end) });
      i = end;
      continue;
    }
    if (c === '(') { toks.push({ t: 'open' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'close' }); i++; continue; }
    if (c === '*') { toks.push({ t: 'result' }); i++; continue; }
    if (c === '$') {
      const m = /^\$(\d+)/.exec(text.slice(i));
      if (m) { toks.push({ t: 'nag', n: Number(m[1]) }); i += m[0].length; continue; }
    }

    let j = i;
    while (j < n && !/[\s{}();]/.test(text[j])) j++;
    let w = text.slice(i, j).replace(/…/g, '...');
    i = j;

    if (/^(1-0|0-1|1\/2-1\/2)$/.test(w)) { toks.push({ t: 'result' }); continue; }
    w = w.replace(/^\d+\.{1,3}/, '');           // move number: "1." "12..." "5..."
    if (/^\.+$/.test(w) || w === '') continue;
    if (w === '0-0') w = 'O-O';
    if (w === '0-0-0') w = 'O-O-O';
    let nag: number | null = null;
    const mark = /([!?]{1,2})$/.exec(w);
    if (mark) { nag = MARK_NAG[mark[1]] ?? null; w = w.slice(0, -mark[1].length); }
    if (w === '') continue;
    toks.push({ t: 'move', san: w, nag });
  }
  return toks;
}

// ── PGN: tree ───────────────────────────────────────────────────────────────

function buildTree(toks: Tok[], rep: Report, where: string): CourseLessonMove[] {
  let pos = 0;
  const raw = new Map<CourseLessonMove, string[]>();

  function skipBalanced() {
    let depth = 1;
    while (pos < toks.length && depth > 0) {
      const t = toks[pos++];
      if (t.t === 'open') depth++;
      else if (t.t === 'close') depth--;
    }
  }

  // `owner` = the move this variation is an alternative to (undefined for the main line)
  function seq(startFen: string, depth: number, owner?: CourseLessonMove): CourseLessonMove[] {
    const moves: CourseLessonMove[] = [];
    const befores: string[] = [];
    const chess = new Chess(startFen);
    while (pos < toks.length) {
      const t = toks[pos];
      if (t.t === 'close') {
        if (depth === 0) { rep.err(where, 'лишняя закрывающая скобка )'); pos++; continue; }
        return moves;                            // the caller consumes ")"
      }
      if (t.t === 'open') {
        pos++;
        const last = moves[moves.length - 1];
        if (!last) { rep.err(where, 'вариант в скобках стоит до первого хода'); skipBalanced(); continue; }
        if (depth >= 1) {
          // "(5... Ne4 (5... Nxe5) 6. Qe2)": an alternative to the FIRST move of a variation is
          // just one more alternative to the move the variation belongs to. Anything deeper is nesting.
          if (moves.length === 1 && owner) {
            const alt: CourseLessonMove[] = [];
            (owner.variations ??= []).push(alt);
            alt.push(...seq(befores[0], depth, owner));
            if (toks[pos]?.t === 'close') pos++;
            else rep.err(where, 'не закрыта круглая скобка ( у варианта');
            if (!alt.length) rep.err(where, `пустой вариант после хода ${last.san}`);
            continue;
          }
          rep.err(where, 'скобки внутри скобок не поддерживаются');
          skipBalanced();
          continue;
        }
        const variation: CourseLessonMove[] = [];
        (last.variations ??= []).push(variation);
        variation.push(...seq(befores[befores.length - 1], depth + 1, last));
        if (toks[pos]?.t === 'close') pos++;
        else rep.err(where, 'не закрыта круглая скобка ( у варианта');
        if (!variation.length) rep.err(where, `пустой вариант после хода ${last.san}`);
        continue;
      }
      if (t.t === 'comment') {
        pos++;
        const last = moves[moves.length - 1];
        if (last) raw.get(last)!.push(t.text);
        else rep.warn(where, 'комментарий до первого хода не показывается');
        continue;
      }
      if (t.t === 'nag') {
        pos++;
        const last = moves[moves.length - 1];
        if (last) (last.nags ??= []).push(t.n);
        continue;
      }
      if (t.t === 'result') { pos++; continue; }

      // move
      pos++;
      const before = chess.fen();
      let res;
      try {
        res = chess.move(t.san);
      } catch {
        const prev = moves[moves.length - 1];
        throw new PgnError(
          `нелегальный или непонятный ход «${t.san}»` + (prev ? ` после ${prev.san}` : ' (первый ход)')
        );
      }
      const node: CourseLessonMove = {
        san: res.san,
        color: res.color,
        from: res.from,
        to: res.to,
        fen: chess.fen(),
        comment: null,
        arrows: [],
        squares: [],
        nags: t.nag ? [t.nag] : [],
        variations: [],
      };
      raw.set(node, []);
      moves.push(node);
      befores.push(before);
    }
    return moves;
  }

  const main = seq(new Chess().fen(), 0);

  // Turn the raw comments into text + arrows + marked squares
  const finish = (ms: CourseLessonMove[]) => {
    for (const m of ms) {
      const text = (raw.get(m) ?? []).join(' ');
      for (const cmd of text.match(CMD_RE) ?? []) {
        if (!GOOD_CMD_RE.test(cmd) && !/^\[%(clk|eval)/.test(cmd)) {
          rep.err(where, `странная команда ${cmd} (разрешены [%cal …] и [%csl …])`);
        }
      }
      for (const cmd of text.matchAll(ARROW_CMD_RE)) {
        for (const item of cmd[2].split(',').map(s => s.trim()).filter(Boolean)) {
          const a = /^([GRYB])([a-h][1-8])([a-h][1-8])?$/.exec(item);
          if (!a) continue;
          const color = COLORS[a[1]];
          if (!a[3] || a[3] === a[2]) m.squares!.push({ square: a[2], color });
          else m.arrows.push({ from: a[2], to: a[3], color });
        }
      }
      const clean = cleanComment(text);
      if (/[[\]]/.test(clean)) rep.err(where, `в комментарии к ${m.san} есть квадратные скобки`);
      m.comment = clean || null;
      for (const v of m.variations ?? []) finish(v);
    }
  };
  finish(main);
  return main;
}

// ── PGN: checks ─────────────────────────────────────────────────────────────

function checkPgn(text: string, where: string, learner: 'w' | 'b', rep: Report): CourseLessonMove[] | null {
  const rows = text.split('\n');
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].trimStart().startsWith('[')) {
      rep.err(where, `строка ${k + 1} начинается с «[» — заголовки PGN не пишем, а [%cal] ставим внутрь {…}`);
      return null;
    }
  }
  if (!text.trimEnd().endsWith('*')) rep.warn(where, 'блок pgn лучше заканчивать знаком *');

  let moves: CourseLessonMove[];
  try {
    moves = buildTree(tokenize(text), rep, where);
  } catch (e) {
    rep.err(where, errText(e));
    return null;
  }
  if (moves.length === 0) { rep.err(where, 'в блоке pgn нет ходов'); return null; }

  const plies = moves.length;
  const fullMoves = Math.floor((plies + 1) / 2);
  if (fullMoves > MAX_MAIN_MOVES) {
    rep.err(where, `основная линия ${fullMoves} ходов, максимум ${MAX_MAIN_MOVES}`);
  }
  const missing = moves.filter(m => m.color === learner && !m.comment).map(m => m.san);
  if (missing.length) rep.err(where, `нет объяснения к ходам ученика: ${missing.join(', ')}`);
  const oppMissing = moves.filter(m => m.color !== learner && !m.comment).length;
  if (oppMissing > Math.floor(Math.floor(plies / 2) / 2)) {
    rep.warn(where, `у соперника без объяснения ${oppMissing} ходов (лучше коротко объяснять большинство)`);
  }
  for (const m of moves) {
    for (const v of m.variations ?? []) {
      if (Math.floor((v.length + 1) / 2) > MAX_VAR_MOVES) {
        rep.err(where, `вариант после ${m.san} длиннее ${MAX_VAR_MOVES} ходов`);
      }
    }
  }
  return moves;
}

// ── Quiz and puzzle ─────────────────────────────────────────────────────────

function readYamlMap(body: string, where: string, rep: Report): Record<string, unknown> | null {
  let q: unknown;
  try {
    q = parseYaml(body) ?? {};
  } catch (e) {
    rep.err(where, yamlHint(e));
    return null;
  }
  if (typeof q !== 'object' || q === null || Array.isArray(q)) {
    rep.err(where, 'ожидались строки вида «поле: значение»');
    return null;
  }
  return q as Record<string, unknown>;
}

function checkQuiz(body: string, where: string, rep: Report): QuizItem | null {
  const q = readYamlMap(body, where, rep);
  if (!q) return null;
  for (const key of ['question', 'answer', 'why']) {
    if (!q[key]) rep.err(where, `нет поля ${key}`);
  }
  const type = q.type ?? 'choice';
  if (type !== 'choice') { rep.err(where, `неизвестный type: ${String(type)}`); return null; }
  const opts = q.options;
  const optMap: Record<string, string> = {};
  if (typeof opts !== 'object' || opts === null || Array.isArray(opts) || Object.keys(opts).length < 2) {
    rep.err(where, 'нужно options: минимум 2 варианта (A, B, …)');
  } else {
    for (const [k, v] of Object.entries(opts as Record<string, unknown>)) optMap[k] = String(v);
    if (!(String(q.answer) in optMap)) rep.err(where, 'answer не совпадает ни с одним вариантом');
  }
  return {
    type: 'choice',
    question: String(q.question ?? ''),
    options: optMap,
    answer: String(q.answer ?? ''),
    why: String(q.why ?? ''),
  };
}

function checkPuzzle(body: string, where: string, rep: Report): QuizItem | null {
  const q = readYamlMap(body, where, rep);
  if (!q) return null;
  for (const key of ['fen', 'question', 'answer', 'why']) {
    if (!q[key]) rep.err(where, `нет поля ${key}`);
  }
  let answer = String(q.answer ?? '');
  try {
    const chess = new Chess(String(q.fen));
    answer = chess.move(answer).san;
  } catch (e) {
    rep.err(where, `fen или answer неверный: ${errText(e)}`);
  }
  return {
    type: 'puzzle',
    fen: String(q.fen ?? ''),
    question: String(q.question ?? ''),
    answer,
    why: String(q.why ?? ''),
  };
}

// ── Header ──────────────────────────────────────────────────────────────────

function splitFrontMatter(text: string, rep: Report): { meta: Record<string, unknown>; body: string } {
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n([\s\S]*)$/.exec(text + '\n');
  if (!m) {
    rep.err('шапка', 'файл должен начинаться с блока --- … ---');
    return { meta: {}, body: text };
  }
  let meta: unknown = {};
  try {
    meta = parseYaml(m[1]) ?? {};
  } catch (e) {
    rep.err('шапка', yamlHint(e));
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    rep.err('шапка', 'в шапке ожидались строки вида «поле: значение»');
    meta = {};
  }
  return { meta: meta as Record<string, unknown>, body: m[2] };
}

function difficultyFrom(meta: Record<string, unknown>): number {
  const d = Number(meta.difficulty);
  if (Number.isInteger(d) && d >= 1 && d <= 5) return d;
  const nums = (String(meta.level ?? '').match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return 2;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return avg < 600 ? 1 : avg < 1000 ? 2 : avg < 1400 ? 3 : avg < 1800 ? 4 : 5;
}

// ── Main ────────────────────────────────────────────────────────────────────

export function parseCourse(mdText: string): ParseResult {
  const rep = new Report();
  const text = unwrapFence(mdText.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim());
  const { meta, body } = splitFrontMatter(text, rep);

  for (const key of ['title', 'slug', 'color']) {
    if (!meta[key]) rep.err('шапка', `нет поля ${key}`);
  }
  const color = String(meta.color ?? '').toLowerCase();
  if (color !== 'white' && color !== 'black') rep.err('шапка', 'color должен быть white или black');
  const learner: 'w' | 'b' = color === 'white' ? 'w' : 'b';
  const slug = String(meta.slug ?? '');
  if (slug && !/^[a-z0-9][a-z0-9-]*$/.test(slug)) rep.err('шапка', 'slug: только латиница, цифры и дефис');

  // Split into lessons
  type RawLesson = { index: number; title: string; lines: string[] };
  const rawLessons: RawLesson[] = [];
  let cur: RawLesson | null = null;
  for (const ln of body.split('\n')) {
    const m = LESSON_RE.exec(ln);
    if (m) { cur = { index: Number(m[1]), title: m[2], lines: [] }; rawLessons.push(cur); continue; }
    if (cur) cur.lines.push(ln);
  }
  if (!rawLessons.length) rep.err('курс', 'нет уроков: заголовок должен быть «# Урок 1: Название»');
  rawLessons.forEach((les, i) => {
    if (les.index !== i + 1) rep.err(`урок ${les.index}`, `номера уроков должны идти подряд, ожидался ${i + 1}`);
  });

  const lessons: ParsedLesson[] = [];
  for (const les of rawLessons) {
    const w = `Урок ${les.index}`;

    // Split into intro + sections
    type Section = { title: string; kind: SectionKind; lines: string[] };
    const sections: Section[] = [];
    const head: string[] = [];
    let sec: Section | null = null;
    for (const ln of les.lines) {
      const m = SECTION_RE.exec(ln);
      if (m) { sec = { title: m[1], kind: sectionKind(m[1]), lines: [] }; sections.push(sec); continue; }
      (sec ? sec.lines : head).push(ln);
    }

    let goal = '';
    let headText = head.join('\n').trim();
    const gm = /^>\s*(?:Цель|Goal)\s*:\s*(.+)$/m.exec(headText);
    if (gm) { goal = gm[1].trim(); headText = headText.replace(gm[0], '').trim(); }
    if (!headText) rep.warn(w, 'нет вступления');

    const blocks: LessonBlock[] = headText ? [{ type: 'text', md: headText }] : [];
    const lines: ParsedLine[] = [];
    const questions: ParsedQuestion[] = [];
    let nLines = 0;

    for (const s of sections) {
      const sw = `${w} / ${s.title}`;
      const parts = parseBlocks(s.lines);

      if (s.kind === 'line') {
        const pgnIdx = parts.map((p, k) => (p.kind === 'pgn' ? k : -1)).filter(k => k >= 0);
        if (pgnIdx.length !== 1) {
          rep.err(sw, `в разделе «Линия» нужен ровно один блок pgn, найдено ${pgnIdx.length}`);
          continue;
        }
        const idx = pgnIdx[0];
        const intro = parts.slice(0, idx).filter(p => p.kind === 'text').map(p => p.body).join('\n\n');
        const outro = parts.slice(idx + 1).filter(p => p.kind === 'text').map(p => p.body).join('\n\n');
        const moves = checkPgn(parts[idx].body, sw, learner, rep);
        if (!outro) rep.warn(sw, 'нет «Итога линии» после блока pgn');
        if (moves) {
          const title = s.title.replace(/^(?:Линия|Line)\s*:\s*/i, '');
          blocks.push({ type: 'line', title, intro_md: intro, moves, outro_md: outro });
          lines.push({ title, intro_md: intro, outro_md: outro, moves });
          nLines++;
        }
      } else if (s.kind === 'quiz') {
        const items: QuizItem[] = [];
        for (const p of parts) {
          if (p.kind === 'quiz') { const q = checkQuiz(p.body, sw, rep); if (q) items.push(q); }
          else if (p.kind === 'puzzle') { const q = checkPuzzle(p.body, sw, rep); if (q) items.push(q); }
          else if (p.kind === 'text') { /* explanation text between questions is ignored */ }
          else rep.err(sw, `неизвестный блок \`\`\`${p.kind}`);
        }
        if (items.length < 2) rep.warn(sw, 'лучше хотя бы 2 вопроса');
        for (const it of items) {
          if (it.type === 'puzzle') {
            questions.push({ fen: it.fen, question: it.question, answer: it.answer, why: it.why, order: questions.length });
          }
        }
        blocks.push({ type: 'quiz', title: s.title, items });
      } else {
        const md: string[] = [];
        for (const p of parts) {
          if (p.kind === 'text') md.push(p.body);
          else if (p.kind === 'pgn' && s.kind === 'trap') {
            const mv = checkPgn(p.body, sw, learner, rep);
            if (mv) {
              const intro = md.join('\n\n');
              blocks.push({ type: 'line', title: s.title, intro_md: intro, moves: mv, outro_md: '' });
              lines.push({ title: s.title, intro_md: intro, outro_md: '', moves: mv });
              md.length = 0;
            }
          } else {
            md.push('```' + p.kind + '\n' + p.body + '\n```');
          }
        }
        if (md.length) {
          blocks.push({ type: s.kind as 'plan' | 'mistakes' | 'trap' | 'summary' | 'text', title: s.title, md: md.join('\n\n') });
        }
      }
    }
    if (nLines === 0) rep.warn(w, 'в уроке нет ни одной линии');

    const joinMd = (type: string) =>
      blocks.filter(b => b.type === type).map(b => ('md' in b ? b.md : '')).join('\n\n');
    // Old "Итог" tab = line outros + "## Итог" sections, in reading order
    const summary = blocks
      .map(b => (b.type === 'line' ? b.outro_md : b.type === 'summary' ? b.md : ''))
      .filter(Boolean)
      .join('\n\n');

    lessons.push({
      title: les.title,
      order: les.index - 1,
      goal,
      blocks,
      lines,
      summary,
      plan: joinMd('plan'),
      mistakes: joinMd('mistakes'),
      trap: joinMd('trap'),
      questions,
    });
  }

  const ok = rep.errors.length === 0;
  const course: ParsedCourse | null = ok
    ? {
        meta: {
          slug,
          name: String(meta.title),
          color: color as 'white' | 'black',
          opening: String(meta.opening ?? ''),
          description: String(meta.description ?? ''),
          difficulty: difficultyFrom(meta),
          level: String(meta.level ?? ''),
          language: String(meta.language ?? 'ru'),
          source_md: text,
        },
        lessons,
      }
    : null;
  return { course, errors: rep.errors, warnings: rep.warnings };
}
