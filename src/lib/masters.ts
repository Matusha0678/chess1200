// Логика «Угадай ход» для страницы партии мастера (MASTERS.md).
// TypeScript-порт masters-ref.cjs.
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

export const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE: Record<string, string> = { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля' };
const PIECE_ACC: Record<string, string> = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };

// ── Признаки хода ─────────────────────────────────────────────────────────────

/** Сколько выигрывает сторона на поле sq по самому дешёвому нападающему. */
export function see(fen: string, sq: string): number {
  const c = new Chess(fen);
  const target = c.get(sq as Square);
  if (!target) return 0;
  const att = c.moves({ verbose: true }).filter(m => m.to === sq && m.captured);
  if (!att.length) return 0;
  att.sort((a, b) => VAL[a.piece] - VAL[b.piece]);
  const m = att[0];
  c.move({ from: m.from, to: m.to, promotion: 'q' });
  return Math.max(0, VAL[target.type] - see(c.fen(), sq));
}

export interface MoveTraits {
  san: string;
  piece: string;
  captured: string | null;
  check: boolean;
  mate: boolean;
  capture: boolean;
  sac: boolean;
  recapture: boolean;
}

export function moveTraits(fen: string, uci: string, prevTo: string | null = null): MoveTraits {
  const c = new Chess(fen);
  const m = c.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] as 'q' | 'r' | 'b' | 'n') || undefined });
  const check = c.inCheck();
  const mate = c.isCheckmate();
  const took = m.captured ? VAL[m.captured] : 0;
  const loss = see(c.fen(), m.to);
  const sac = !mate && loss - took >= (m.piece === 'p' ? 1 : 2);
  return {
    san: m.san, piece: m.piece, captured: m.captured || null, check, mate,
    capture: !!m.captured, sac,
    recapture: !!m.captured && prevTo === m.to,
  };
}

// ── Партия ────────────────────────────────────────────────────────────────────

export interface ParsedMove {
  ply: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  fen: string;      // FEN до хода
  fenAfter: string; // FEN после хода
  mark: '!' | '!!' | null;
  comment: string | null;
}

/** Ходы партии с позициями до/после хода, пометками !/!! и комментариями. */
export function parseGame(pgn: string): ParsedMove[] {
  const g = new Chess();
  g.loadPgn(pgn);
  const hist = g.history({ verbose: true });
  let t = pgn.replace(/\[[^\]]*\]/g, ' ');
  const comments: string[] = [];
  t = t.replace(/\{([^}]*)\}/g, (_, c: string) => { comments.push(c.trim()); return ` {${comments.length - 1}} `; });
  for (let i = 0; i < 4; i++) t = t.replace(/\([^()]*\)/g, ' ');
  const toks = t.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(x => x && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(x));
  const marks: (null | '!' | '!!')[] = [];
  const notes: (string | null)[] = [];
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
    return {
      ply: i + 1, color: m.color as 'w' | 'b',
      san: m.san, uci: m.from + m.to + (m.promotion || ''),
      fen, fenAfter: rep.fen(),
      mark: marks[i] || null,
      comment: notes[i] || null,
    };
  });
}

/** «Tal, Mihail» → «Tal» */
export const surname = (name: string): string => String(name || '').split(',')[0].trim() || '?';

export function defaultSide(game: { white: string; black: string; result: string }, libraryNames: string[]): 'white' | 'black' {
  const cnt: Record<string, number> = {};
  for (const n of libraryNames) { const s = surname(n); cnt[s] = (cnt[s] || 0) + 1; }
  const master = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (master && surname(game.white) === master) return 'white';
  if (master && surname(game.black) === master) return 'black';
  if (game.result === '0-1') return 'black';
  return 'white';
}

// ── Анализ ────────────────────────────────────────────────────────────────────

export interface TopMove {
  uci: string;
  cp: number;
  pv: string[];
  san: string;
  pvSan: string[];
}

export interface AnalysisEntry {
  ply: number;
  uci: string;
  master_cp: number;
  top: TopMove[];
}

export interface PreparedItem extends ParsedMove {
  masterCp: number;
  top: TopMove[];
  traits: MoveTraits;
  kind?: MomentKind;
  gap?: number;
}

export function uciSan(fen: string, uci: string): string {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] as 'q') || undefined }).san;
  } catch { return uci; }
}

export function pvSan(fen: string, pv: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv || []) {
    try { out.push(c.move({ from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square, promotion: (u[4] as 'q') || undefined }).san); }
    catch { break; }
  }
  return out;
}

export function prepareItems(moves: ParsedMove[], analysis: AnalysisEntry[]): PreparedItem[] {
  const byPly = new Map(analysis.map(a => [a.ply, a]));
  return moves.filter(m => byPly.has(m.ply)).map(m => {
    const a = byPly.get(m.ply)!;
    const i = m.ply - 1;
    return {
      ...m,
      masterCp: a.master_cp,
      top: a.top.map(t => ({ ...t, san: uciSan(m.fen, t.uci), pvSan: pvSan(m.fen, t.pv) })),
      traits: moveTraits(m.fen, m.uci, i > 0 ? moves[i - 1].uci.slice(2, 4) : null),
    };
  });
}

// ── Ключевые моменты ──────────────────────────────────────────────────────────

export type MomentKind = 'sac' | 'annotated' | 'check' | 'capture' | 'quiet';
export type MomentItem = PreparedItem & { kind: MomentKind; gap: number };

const KEY_MAX = 12;
export { KEY_MAX };

export function gapOf(it: PreparedItem): number {
  const b = it.top[0]?.cp ?? 0;
  return b - (it.top[1]?.cp ?? b);
}

export function kindOf(it: PreparedItem): MomentKind {
  const t = it.traits;
  if (t.sac) return 'sac';
  if (it.mark || it.comment) return 'annotated';
  if (t.check) return 'check';
  if (t.capture) return 'capture';
  return 'quiet';
}

export function masterThrows(it: PreparedItem): boolean {
  const b = it.top[0]?.cp ?? 0;
  return it.masterCp < b - 150 && it.masterCp < 150;
}

export function selectMoments(
  items: PreparedItem[],
  { mode = 'key', side = 'white', skip = 10 }: { mode?: 'key' | 'sac' | 'all'; side?: 'white' | 'black'; skip?: number } = {},
): MomentItem[] {
  const col = side === 'white' ? 'w' : 'b';
  const mine = items.filter(it => it.color === col && it.ply > skip * 2);
  const withKind = (it: PreparedItem): MomentItem => ({ ...it, kind: kindOf(it), gap: gapOf(it) });
  if (mode === 'all') return mine.map(withKind);
  const pick = (cc: number, quiet: number): MomentItem[] => mine.filter(it => {
    if (masterThrows(it)) return false;
    const t = it.traits;
    const gap = gapOf(it);
    if (t.sac || it.mark || it.comment) return true;
    if (t.check || t.capture) return !t.recapture && gap >= cc;
    return gap >= quiet;
  }).map(withKind);
  let found = pick(80, 150);
  if (found.length < 3) found = pick(50, 100);
  if (mode === 'sac') return found.filter(m => m.kind === 'sac');
  if (found.length > KEY_MAX) {
    const pri = (m: MomentItem) => (m.kind === 'sac' || m.kind === 'annotated' ? 100000 : 0) + m.gap;
    found = [...found].sort((a, b) => pri(b) - pri(a)).slice(0, KEY_MAX).sort((a, b) => a.ply - b.ply);
  }
  return found;
}

// ── Очки за ответ ─────────────────────────────────────────────────────────────

export type Verdict = 'master' | 'better' | 'engine' | 'miss';

export interface GuessResult {
  pts: 0 | 1 | 2;
  verdict: Verdict;
}

export function scoreGuess(it: PreparedItem, userUci: string, ucp: number | null = null, hintUsed = false): GuessResult {
  const u = userUci.slice(0, 4);
  const best = it.top[0];
  let pts: 0 | 1 | 2 = 0;
  let verdict: Verdict = 'miss';
  const cp = ucp != null ? ucp : (it.top.find(t => t.uci.slice(0, 4) === u) || null)?.cp ?? null;
  if (u === it.uci.slice(0, 4)) { pts = 2; verdict = 'master'; }
  else if (best && cp != null && cp >= best.cp - 20 && best.cp - it.masterCp >= 50) { pts = 2; verdict = 'better'; }
  else if (best && cp != null && cp >= best.cp - 50) { pts = 1; verdict = 'engine'; }
  if (hintUsed && pts > 1) pts = 1;
  return { pts, verdict };
}

export function userCp(it: PreparedItem, userUci: string, evals: Record<string, number> = {}): number | null {
  const u = userUci.slice(0, 4);
  const t = it.top.find(x => x.uci.slice(0, 4) === u);
  if (t) return t.cp;
  const v = evals[`${it.ply}:${u}`];
  return v == null ? null : v;
}

// ── Стрелки ──────────────────────────────────────────────────────────────────

export interface ResultArrow {
  from: string;
  to: string;
  role: 'played' | 'best' | 'plan';
  color: string;
  label?: string;
}

export function resultArrows(it: PreparedItem, userUci: string, verdict: Verdict): ResultArrow[] {
  if (verdict === 'master') return [];
  const a: ResultArrow[] = [];
  a.push({ from: userUci.slice(0, 2), to: userUci.slice(2, 4), role: 'played', color: verdict === 'miss' ? '#E0574A' : '#F0A43A' });
  a.push({ from: it.uci.slice(0, 2), to: it.uci.slice(2, 4), role: 'best', color: '#81B64C', label: 'М' });
  const b = it.top[0];
  if (b && b.uci.slice(0, 4) !== it.uci.slice(0, 4) && b.uci.slice(0, 4) !== userUci.slice(0, 4))
    a.push({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), role: 'plan', color: '#4A90E2', label: 'Д' });
  return a;
}

// ── Тексты ───────────────────────────────────────────────────────────────────

export function evalWhite(cp: number | null, color: 'w' | 'b'): string {
  if (cp == null) return '—';
  const w = color === 'w' ? cp : -cp;
  if (Math.abs(w) >= 9000) return w > 0 ? '#' : '−#';
  return (w > 0 ? '+' : w < 0 ? '−' : '') + (Math.abs(w) / 100).toFixed(2);
}

export function sanNo(ply: number, san: string): string {
  const n = Math.ceil(ply / 2);
  return ply % 2 ? `${n}. ${san}` : `${n}... ${san}`;
}

export function lineText(ply: number, sans: string[]): string {
  return sans.map((s, i) => {
    const p = ply + i;
    const n = Math.ceil(p / 2);
    return i === 0 ? sanNo(p, s) : p % 2 ? `${n}. ${s}` : s;
  }).join(' ');
}

export function explain(it: PreparedItem): string[] {
  const t = it.traits;
  const out: string[] = [];
  if (t.mate) out.push('Мат.');
  else if (t.sac) out.push(`Жертва ${PIECE[t.piece]}.`);
  else if (t.check) out.push(t.capture ? `Шах и взятие ${PIECE[t.captured!]}.` : 'Шах.');
  else if (t.capture) out.push(`Берёт ${PIECE_ACC[t.captured!]}.`);
  else if (gapOf(it) >= 150) out.push('Тихий ход, но остальные ходы заметно хуже.');
  if (it.mark) out.push(`Автор отметил ход знаком «${it.mark}».`);
  const b = it.top[0];
  if (b && b.uci.slice(0, 4) === it.uci.slice(0, 4)) out.push('Это и лучший ход движка.');
  else if (b) out.push(`Движок предпочитает ${sanNo(it.ply, b.san)} (${evalWhite(b.cp, it.color)}).`);
  return out;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function hintText(kind: MomentKind): string {
  if (kind === 'sac') return 'Здесь есть жертва.';
  if (kind === 'annotated') return 'Автор отметил этот ход.';
  if (kind === 'check') return 'Здесь есть шах.';
  if (kind === 'capture') return 'Здесь есть взятие.';
  return 'Тихий ход: остальные заметно хуже.';
}

export function kindLabel(kind: MomentKind): string {
  if (kind === 'sac') return 'жертва';
  if (kind === 'annotated') return 'пометка';
  if (kind === 'check') return 'шах';
  if (kind === 'capture') return 'взятие';
  return 'тихий ход';
}
