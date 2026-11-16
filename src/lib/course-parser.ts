import { Chess } from 'chess.js';
import type { Course, Arrow, CourseLessonMove } from '@/types/courses';

// ── Exported types ──────────────────────────────────────────────────────────

export interface ParsedQuestion {
  fen: string;
  question: string;
  answer: string;
  order: number;
}

export interface ParsedLesson {
  title: string;
  order: number;
  moves: CourseLessonMove[];
  summary: string;
  plan: string;
  mistakes: string;
  trap: string;
  questions: ParsedQuestion[];
}

export interface ParsedCourse {
  meta: Omit<Course, 'id' | 'created_at'>;
  lessons: ParsedLesson[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function slugify(str: string): string {
  const cyrillic: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
    я: 'ya',
  };
  return str
    .toLowerCase()
    .split('')
    .map(ch => cyrillic[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractArrows(comment: string): { text: string; arrows: Arrow[] } {
  const arrows: Arrow[] = [];
  const arrowRe = /→([a-h][1-8])-([a-h][1-8])/g;
  let m: RegExpExecArray | null;
  while ((m = arrowRe.exec(comment)) !== null) {
    arrows.push({ from: m[1], to: m[2] });
  }
  const text = comment.replace(/→[a-h][1-8]-[a-h][1-8]/g, '').trim();
  return { text, arrows };
}

// SAN regex — must match the longest alternative first (castling before piece moves)
const SAN_RE = /^(O-O-O[+#]?|O-O[+#]?|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)/;

export function parseLine(lineText: string): CourseLessonMove[] {
  const chess = new Chess();
  const moves: CourseLessonMove[] = [];

  // Tokenise: produce a flat list of tokens
  type Token = { type: 'san'; san: string } | { type: 'comment'; text: string };
  const tokens: Token[] = [];

  let pos = 0;
  while (pos < lineText.length) {
    // Skip whitespace
    if (/\s/.test(lineText[pos])) { pos++; continue; }

    // Skip move numbers like "1." "1..." "12."
    if (/[0-9]/.test(lineText[pos])) {
      const numEnd = lineText.indexOf('.', pos);
      if (numEnd !== -1) {
        pos = numEnd + 1;
        // Skip any subsequent dots (for "1...")
        while (pos < lineText.length && lineText[pos] === '.') pos++;
        continue;
      }
    }

    // Comment block {…}
    if (lineText[pos] === '{') {
      const end = lineText.indexOf('}', pos);
      if (end === -1) { pos = lineText.length; break; }
      tokens.push({ type: 'comment', text: lineText.slice(pos + 1, end).trim() });
      pos = end + 1;
      continue;
    }

    // Try to match a SAN
    const rest = lineText.slice(pos);
    const sanMatch = SAN_RE.exec(rest);
    if (sanMatch) {
      tokens.push({ type: 'san', san: sanMatch[1] });
      pos += sanMatch[1].length;
      continue;
    }

    // Unrecognised character — skip
    pos++;
  }

  // Build moves: each SAN may be followed by a comment
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== 'san') continue;

    let comment: string | null = null;
    let arrows: Arrow[] = [];

    // Check if the very next token is a comment
    if (i + 1 < tokens.length && tokens[i + 1].type === 'comment') {
      const raw = (tokens[i + 1] as { type: 'comment'; text: string }).text;
      const extracted = extractArrows(raw);
      comment = extracted.text || null;
      arrows = extracted.arrows;
      i++; // consume comment
    }

    let result;
    try {
      result = chess.move(tok.san);
    } catch {
      // Unplayable SAN — skip
      continue;
    }

    moves.push({
      san: result.san,
      from: result.from,
      to: result.to,
      fen: chess.fen(),
      color: result.color as 'w' | 'b',
      comment,
      arrows,
    });
  }

  return moves;
}

export function parseQuestions(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  // Split on "### Задача N"
  const blocks = text.split(/###\s+Задача\s+\d+/);
  blocks.shift(); // drop everything before first block

  blocks.forEach((block, idx) => {
    const fenMatch = /FEN:\s*(.+)/i.exec(block);
    const questionMatch = /Вопрос:\s*(.+)/i.exec(block);
    const answerMatch = /Ответ:\s*([\s\S]+?)(?=###|$)/i.exec(block);

    if (fenMatch && questionMatch && answerMatch) {
      questions.push({
        fen: fenMatch[1].trim(),
        question: questionMatch[1].trim(),
        answer: answerMatch[1].trim(),
        order: idx,
      });
    }
  });

  return questions;
}

export function parseLesson(text: string, order: number): ParsedLesson {
  // Extract the title from "# Урок N: Title"
  const titleMatch = /^#\s+Урок\s+\d+[:\s]+(.+)/m.exec(text);
  const title = titleMatch ? titleMatch[1].trim() : `Урок ${order + 1}`;

  // Split into ## sections
  const sectionRe = /^##\s+(.+)$/m;
  const parts = text.split(/^##\s+/m);
  // parts[0] is the content before first ##

  let moves: CourseLessonMove[] = [];
  let summary = '';
  let plan = '';
  let mistakes = '';
  let trap = '';
  let questions: ParsedQuestion[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const newlineIdx = part.indexOf('\n');
    const sectionHeader = newlineIdx !== -1 ? part.slice(0, newlineIdx).trim() : part.trim();
    const sectionBody = newlineIdx !== -1 ? part.slice(newlineIdx + 1).trim() : '';

    const header = sectionHeader.toLowerCase();

    if (header === 'линия' || header.startsWith('линия')) {
      moves = parseLine(sectionBody);
    } else if (header === 'итог' || header.startsWith('итог')) {
      summary = sectionBody;
    } else if (header === 'план' || header.startsWith('план')) {
      plan = sectionBody;
    } else if (header === 'ошибки' || header.startsWith('ошибк')) {
      mistakes = sectionBody;
    } else if (header === 'ловушка' || header.startsWith('ловушк')) {
      trap = sectionBody;
    } else if (header === 'задачи' || header.startsWith('задач')) {
      questions = parseQuestions(sectionBody);
    }
  }

  // If we didn't find a ## Линия section, try to find the line in the preamble
  // (content before the first ## heading that looks like PGN)
  if (moves.length === 0 && parts[0]) {
    const preamble = parts[0];
    if (/\d+\./.test(preamble)) {
      moves = parseLine(preamble);
    }
  }

  return { title, order, moves, summary, plan, mistakes, trap, questions };
}

// ── Frontmatter parser ───────────────────────────────────────────────────────

export function parseFrontmatter(text: string): {
  meta: Record<string, string>;
  body: string;
} {
  const fmRe = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = fmRe.exec(text);
  if (!match) return { meta: {}, body: text };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    meta[key] = value;
  }

  return { meta, body: match[2] };
}

// ── Main exported function ───────────────────────────────────────────────────

export function parseCourse(mdText: string): ParsedCourse {
  const { meta, body } = parseFrontmatter(mdText);

  const name = meta['name'] ?? 'Без названия';
  const color = (['white', 'black', 'both'].includes(meta['color'] ?? ''))
    ? (meta['color'] as 'white' | 'black' | 'both')
    : 'white';
  const opening = meta['opening'] ?? '';
  const description = meta['description'] ?? '';
  const difficulty = Math.min(5, Math.max(1, parseInt(meta['difficulty'] ?? '2', 10) || 2));
  const slug = meta['slug'] ?? slugify(name);

  // Split body by "# Урок" headers
  const lessonBlocks = body.split(/^(?=#\s+Урок\s+\d+)/m).filter(b => b.trim().length > 0);

  const lessons: ParsedLesson[] = lessonBlocks.map((block, idx) => parseLesson(block, idx));

  return {
    meta: { slug, name, color, opening, description, difficulty },
    lessons,
  };
}
