/**
 * Эталон логики нового тренажёра дебютов (OPENINGS.md, раздел 4).
 * Запуск из корня проекта: node docs/design/pages/openings/opening-ref.cjs   → «все тесты: OK».
 * Перенеси в TypeScript: src/lib/opening-trainer.ts (те же имена и поведение) и тесты — scripts/test-openings.ts.
 *
 * Ходы линии — ChessMove[] как в opening_lines.moves: { san, from, to, fen (после хода), color: 'w'|'b' }.
 * Полуход k — индекс в moves (0 = первый ход белых).
 */
import { Chess } from './vendor/chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DAY = 86400000;
const DAYS = [1, 3, 7, 14, 30, 60];   // интервал по уровню 0–5 (как nextReviewDate в старом practice)
const MASTERED = 4;                   // «освоена» — уровень ≥ 4 (как в старом списке дебютов)
const FIRST_REVIEW_DAYS = 1;          // после «Учить» + «Сыграть по памяти» первое повторение — завтра
const XP_PERFECT = 5;

// ── ходы и подписи ───────────────────────────────────────────────────────────
/** SAN-строка → ChessMove[] (для тестов и демо). */
function toMoves(sans) {
  const c = new Chess();
  return sans.split(/\s+/).filter(Boolean).map(s => {
    const m = c.move(s);
    return { san: m.san, from: m.from, to: m.to, fen: c.fen(), color: m.color };
  });
}
const fenBefore = (moves, k) => (k === 0 ? START : moves[k - 1].fen);
const moveNo = k => Math.floor(k / 2) + 1;
/** «5. c4» для хода белых, «4... g6» для хода чёрных. */
function numSan(moves, k) {
  return moves[k].color === 'w' ? `${moveNo(k)}. ${moves[k].san}` : `${moveNo(k)}... ${moves[k].san}`;
}
/** Полуходы [a, b) с номерами: «5. c4 Nf6 6. Nc3», «4... Bc5 5. Nxc6 Qf6». */
function fmtMoves(moves, a, b) {
  const out = [];
  for (let k = a; k < Math.min(b, moves.length); k++) {
    if (k === a) out.push(numSan(moves, k));
    else out.push(moves[k].color === 'w' ? `${moveNo(k)}. ${moves[k].san}` : moves[k].san);
  }
  return out.join(' ');
}
function lcp(a, b) { let i = 0; while (i < a.length && i < b.length && a[i].san === b[i].san) i++; return i; }

/**
 * Подпись линии в списке — ходы СОПЕРНИКА с места, где линия расходится с ближайшей другой (2 хода соперника):
 * «5. c4 … 6. Nc3». Мои ходы не показываем, чтобы список не подсказывал ответ в «Повторять».
 * Если линии расходятся моим ходом (у тебя два варианта) — он идёт первым, иначе их не различить.
 * Линия — начало другой (или копия) → 2 последних хода соперника.
 * myColor = null (дебют «за обе стороны») → 3 полухода подряд: «5. c4 Nf6 6. Nc3».
 */
function lineLabels(lines, myColor = null) {
  return lines.map((L, i) => {
    let p = 0;
    lines.forEach((M, j) => { if (j !== i) p = Math.max(p, lcp(L.moves, M.moves)); });
    const n = L.moves.length;
    if (!myColor) {
      const start = p >= n ? Math.max(0, n - 3) : p;
      return fmtMoves(L.moves, start, start + 3);
    }
    const opp = k => L.moves[k].color !== myColor;
    const ks = [];
    if (p >= n) {
      for (let k = n - 1; k >= 0 && ks.length < 2; k--) if (opp(k)) ks.unshift(k);
    } else {
      if (!opp(p)) ks.push(p);
      let c = 0;
      for (let k = p; k < n && c < 2; k++) if (opp(k)) { ks.push(k); c++; }
    }
    const segs = [];
    for (const k of ks) {
      const last = segs[segs.length - 1];
      if (last && last[1] === k) last[1] = k + 1; else segs.push([k, k + 1]);
    }
    return segs.map(([a, b]) => fmtMoves(L.moves, a, b)).join(' … ');
  });
}
/**
 * Группы в списке линий — только если линий больше 8: по ходу в месте, где линии впервые расходятся
 * («5. Nxc6 · 8 линий»). Групп больше, чем половина линий, — не группируем.
 * Возвращает null или [{ label, ids }] в порядке line_index.
 */
function lineGroups(lines) {
  if (lines.length <= 8) return null;
  const k = commonStart(lines);
  const groups = [];
  for (const L of lines) {
    const label = k < L.moves.length ? numSan(L.moves, k) : 'Основная линия';
    let g = groups.find(x => x.label === label);
    if (!g) groups.push(g = { label, ids: [] });
    g.ids.push(L.id);
  }
  return groups.length > lines.length / 2 ? null : groups;
}
/** Сколько полуходов общие у ВСЕХ линий (для строки «Общее начало»; < 2 — строку не показываем). */
function commonStart(lines) {
  if (lines.length < 2) return 0;
  return lines.slice(1).reduce((p, L) => Math.min(p, lcp(lines[0].moves, L.moves)), lines[0].moves.length);
}
/**
 * Позиция для карточки в каталоге: самое длинное начало (≤ 12 полуходов), общее хотя бы у половины линий.
 * Возвращает k — показываем fenBefore(moves, k) любой линии из этой группы (у первой по line_index).
 */
function cardPly(lines, max = 12) {
  if (!lines.length) return { k: 0, lineIdx: -1 };
  const need = Math.ceil(lines.length / 2);
  let best = { k: 0, lineIdx: 0 };
  for (let k = 1; k <= max; k++) {
    const groups = new Map();
    lines.forEach((L, i) => {
      if (L.moves.length < k) return;
      const key = L.moves.slice(0, k).map(m => m.san).join(' ');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    const g = [...groups.values()].find(v => v.length >= need);
    if (!g) break;
    best = { k, lineIdx: g[0] };
  }
  return best;
}

// ── статусы и интервалы ──────────────────────────────────────────────────────
/** 'new' — ещё не тренировал; 'due' — срок подошёл (включая уровень 5); 'mastered' — уровень ≥ 4; иначе 'learning'. */
function lineStatus(prog, now) {
  if (!prog) return 'new';
  if (Date.parse(prog.next_review) <= now) return 'due';
  return prog.mastery >= MASTERED ? 'mastered' : 'learning';
}
function countStatuses(progs, now) {
  const c = { total: progs.length, new: 0, due: 0, learning: 0, mastered: 0 };
  for (const p of progs) c[lineStatus(p, now)]++;
  return c;
}
function plural(n, a, b, c) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return a;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return b;
  return c;
}
/** «завтра», «через 3 дня», «через 14 дней». */
const inDays = d => (d <= 1 ? 'завтра' : `через ${d} ${plural(d, 'день', 'дня', 'дней')}`);
/** Подпись срока в списке линий. */
function dueText(prog, now) {
  const s = lineStatus(prog, now);
  if (s === 'new') return 'новая';
  if (s === 'due') return 'сегодня';
  if (s === 'mastered') return 'освоена';
  const d = Math.max(1, Math.ceil((Date.parse(prog.next_review) - now) / DAY));
  return d === 1 ? 'завтра' : `через ${d} дн.`;
}

/**
 * Итог прогона линии → новая строка line_progress и XP.
 * Без ошибок: уровень +1 (макс. 5), интервал DAYS[новый уровень], correct_count +1, +5 XP.
 * С ошибками (или с подсказкой): уровень не меняется, интервал DAYS[max(0, уровень − 1)], incorrect_count +1.
 * Строки ещё нет: без ошибок → уровень 1 (через 3 дня, а сразу после «Учить» — через 1 день); с ошибками → уровень 0, через 1 день.
 */
function applyResult(prog, perfect, now, opts = {}) {
  const m0 = prog ? prog.mastery : 0;
  let mastery, days;
  if (!prog) {
    mastery = perfect ? 1 : 0;
    days = perfect ? (opts.afterLearn ? FIRST_REVIEW_DAYS : DAYS[1]) : DAYS[0];
  } else if (perfect) {
    mastery = Math.min(m0 + 1, 5); days = DAYS[mastery];
  } else {
    mastery = m0; days = DAYS[Math.max(0, m0 - 1)];
  }
  return {
    row: {
      correct_count: (prog ? prog.correct_count || 0 : 0) + (perfect ? 1 : 0),
      incorrect_count: (prog ? prog.incorrect_count || 0 : 0) + (perfect ? 0 : 1),
      mastery,
      next_review: new Date(now + days * DAY).toISOString(),
      last_practiced: new Date(now).toISOString(),
    },
    masteryBefore: m0, masteryAfter: mastery, days, xp: perfect ? XP_PERFECT : 0,
  };
}

// ── очереди ──────────────────────────────────────────────────────────────────
/**
 * «Повторять»: линии со сроком. Сначала — где ты отошёл от линии в партии после последней тренировки (freshDev),
 * потом самые просроченные, потом по line_index. ?line= ставит линию первой (даже без срока).
 * lines: [{ id, index, prog }], freshDev: Set(id).
 */
function reviewQueue(lines, now, { freshDev = new Set(), forceLineId = null } = {}) {
  const due = lines.filter(l => lineStatus(l.prog, now) === 'due' || l.id === forceLineId);
  due.sort((a, b) =>
    (b.id === forceLineId) - (a.id === forceLineId) ||
    freshDev.has(b.id) - freshDev.has(a.id) ||
    Date.parse(a.prog ? a.prog.next_review : 0) - Date.parse(b.prog ? b.prog.next_review : 0) ||
    a.index - b.index);
  return due.map(l => l.id);
}
/** «Учить»: новые линии по line_index; ?line= — первой. */
function learnQueue(lines, { forceLineId = null } = {}) {
  return lines.filter(l => !l.prog || l.id === forceLineId)
    .sort((a, b) => (b.id === forceLineId) - (a.id === forceLineId) || a.index - b.index)
    .map(l => l.id);
}
/** Вес для «Свободной тренировки» — как getWeight в старом practice. */
function weight(prog, now) {
  if (!prog || prog.mastery === 0) return 100;
  if (Date.parse(prog.next_review) <= now) return 80;
  if (prog.mastery <= 2) return 30;
  if (prog.mastery <= 4) return 15;
  return 5;
}
/** «Трудные ходы»: строки line_move_progress с incorrect_count > 0 (только мои ходы), max 20. */
function hardQueue(rows, linesById) {
  return rows
    .filter(r => r.incorrect_count > 0 && linesById[r.line_id] &&
      r.move_index < linesById[r.line_id].moves.length &&
      linesById[r.line_id].moves[r.move_index].color === linesById[r.line_id].myColor)
    .sort((a, b) => b.incorrect_count - a.incorrect_count || Date.parse(b.last_missed_at || 0) - Date.parse(a.last_missed_at || 0))
    .slice(0, 20)
    .map(r => ({ lineId: r.line_id, ply: r.move_index }));
}

// ── с какого хода начинать ───────────────────────────────────────────────────
const posKey = fen => fen.split(' ').slice(0, 4).join(' ');
const okKey = (moves, k) => `${posKey(fenBefore(moves, k))}|${moves[k].from}${moves[k].to}`;
/**
 * «Повторять»: мои ходы, которые в этой сессии уже были сыграны верно с первой попытки (okSet), не спрашиваем
 * второй раз — начало линии проигрывается быстро. Возвращает полуход старта (≤ 1 → 0: обычный старт).
 */
function sessionStart(moves, myColor, okSet) {
  let k = 0;
  while (k < moves.length) {
    if (moves[k].color !== myColor || okSet.has(okKey(moves, k))) { k++; continue; }
    break;
  }
  if (k >= moves.length || k <= 1) return 0;
  return k;
}
/** «Учить»: начало, общее с уже изученными линиями, проигрывается быстро; учим с места расхождения. */
function learnStart(moves, knownLines) {
  let p = 0;
  for (const L of knownLines) p = Math.max(p, lcp(moves, L.moves));
  return p >= moves.length || p <= 1 ? 0 : p;
}

// ── прогон одной линии ───────────────────────────────────────────────────────
/**
 * mode: 'review' (Повторять и «Сыграть по памяти»), 'learn' (Учить), 'exam' (Экзамен), 'drill' (Трудные ходы).
 * phase: 'play' → ('consolidate' — только review, если были ошибки) → 'done'.
 */
function createRun(moves, myColor, mode, { startPly = 0, endPly = moves.length } = {}) {
  return { moves, myColor, mode, startPly, endPly, ply: startPly, phase: 'play',
    mistakes: [], wrong: null, hint: 0, consolidate: [], failed: false, effects: [] };
}
const curPly = r => (r.phase === 'consolidate' ? r.consolidate[0] : r.ply);
const isMyTurn = r => r.phase !== 'done' && curPly(r) < r.endPly && r.moves[curPly(r)].color === r.myColor;
/** Нужен автоход соперника (страница делает его через 300 мс; в «Учить» — 600 мс). */
const needsAuto = r => r.phase === 'play' && r.ply < r.endPly && r.moves[r.ply].color !== r.myColor;

function finish(r) {
  if (r.mode === 'review' && r.mistakes.length && r.phase === 'play') {
    r.phase = 'consolidate';
    r.consolidate = [...new Set(r.mistakes.map(m => m.ply))].sort((a, b) => a - b);
  } else r.phase = 'done';
}
function addMistake(r, ply, kind) {
  if (r.mistakes.some(m => m.ply === ply)) return;
  r.mistakes.push({ ply, kind });
  r.effects.push({ type: 'mistake', ply });          // → line_move_progress (recordMoveMistake)
}
/** Автоход соперника. */
function auto(r0) {
  const r = { ...r0, effects: [] };
  if (!needsAuto(r)) return r;
  r.ply++;
  if (r.ply >= r.endPly) finish(r);
  return r;
}
/** Ход пользователя (from, to — клетки; превращение не сравниваем). */
function move(r0, from, to) {
  const r = { ...r0, mistakes: [...r0.mistakes], consolidate: [...r0.consolidate], effects: [] };
  if (!isMyTurn(r)) return r;
  const k = curPly(r), exp = r.moves[k];
  if (from === exp.from && to === exp.to) {
    r.wrong = null; r.hint = 0;
    if (r.phase === 'consolidate') {
      r.consolidate.shift();
      if (!r.consolidate.length) r.phase = 'done';
    } else {
      if (!r.mistakes.some(m => m.ply === k)) r.effects.push({ type: 'ok', key: okKey(r.moves, k) });  // → okSet сессии
      r.ply++;
      if (r.ply >= r.endPly) finish(r);
    }
    return r;
  }
  r.wrong = { ply: k, from, to };
  if (r.mode === 'exam') { addMistake(r, k, 'wrong'); r.failed = true; r.phase = 'done'; }
  else if (r.mode !== 'learn' && r.phase === 'play') addMistake(r, k, 'wrong');
  return r;
}
/** Подсказка (H): 1 — кольцо на фигуре, 2 — стрелка. Засчитывается как ошибка. Нет в «Учить» и «Экзамене». */
function hint(r0) {
  const r = { ...r0, mistakes: [...r0.mistakes], effects: [] };
  if (!isMyTurn(r) || r.mode === 'learn' || r.mode === 'exam' || r.wrong) return r;
  r.hint = Math.min(2, r.hint + 1);
  if (r.phase === 'play') addMistake(r, r.ply, 'hint');
  return r;
}
/** «Заново» (R): линия с начала; ошибки этого прогона остаются. */
function restart(r0) {
  if (r0.mode === 'exam') return r0;
  return { ...r0, ply: r0.startPly, phase: 'play', wrong: null, hint: 0, consolidate: [], effects: [] };
}
function result(r) {
  return { perfect: r.phase === 'done' && !r.failed && r.mistakes.length === 0, mistakes: r.mistakes.length, failed: r.failed };
}

/** SAN хода пользователя в позиции перед ним (для текста «Ты сыграл …»). */
function playedSan(moves, k, from, to) {
  const c = new Chess(fenBefore(moves, k));
  try { return c.move({ from, to, promotion: 'q' }).san; } catch { return `${from}–${to}`; }
}
function playedNum(moves, k, from, to) {
  const san = playedSan(moves, k, from, to);
  return moves[k].color === 'w' ? `${moveNo(k)}. ${san}` : `${moveNo(k)}... ${san}`;
}

/** Что показать: позиция, стрелки, кольца, заголовок, карточка. Тексты — как в OPENINGS.md, раздел 6. */
function view(r) {
  const k = curPly(r);
  const showPly = r.phase === 'done' ? r.ply : k;
  const fen = r.phase === 'done' && r.failed ? fenBefore(r.moves, r.wrong.ply) : fenBefore(r.moves, showPly);
  const lm = (r.phase === 'done' && r.failed ? r.wrong.ply : showPly) - 1;
  const lastMove = lm >= 0 ? { from: r.moves[lm].from, to: r.moves[lm].to } : null;
  const arrows = [], rings = {};
  const exp = k < r.moves.length ? r.moves[k] : null;
  if (r.wrong && (r.phase !== 'done' || r.failed)) {
    const e = r.moves[r.wrong.ply];
    arrows.push({ from: r.wrong.from, to: r.wrong.to, role: 'played' });
    arrows.push({ from: e.from, to: e.to, role: 'best', style: 'dashed' });
  } else if (isMyTurn(r) && (r.mode === 'learn' || r.hint === 2)) {
    arrows.push({ from: exp.from, to: exp.to, role: 'best', style: 'dashed' });
  } else if (isMyTurn(r) && r.hint === 1) {
    rings[exp.from] = '#81B64C';
  }
  let title, feedback = null;
  if (r.phase === 'done') {
    if (r.failed) {
      title = 'Ошибка в линии';
      feedback = { result: 'fail', text: `Ты сыграл ${playedNum(r.moves, r.wrong.ply, r.wrong.from, r.wrong.to)}, в линии ${numSan(r.moves, r.wrong.ply)}.` };
    } else if (r.mode === 'learn') {
      title = 'Линия пройдена';
      feedback = { result: 'info', text: 'Теперь сыграй её по памяти — без стрелок.' };
    } else if (!r.mistakes.length) {
      title = 'Линия без ошибок';
      feedback = { result: 'ok', text: '' };   // текст с уровнем и сроком — из applyResult (раздел 6)
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

/** Полоса шагов: мои ходы линии от startPly. state: ok | fail | hint | now | todo; current — ход, который ждём сейчас. */
function steps(r) {
  const k = curPly(r), out = [];
  for (let p = r.startPly; p < r.endPly; p++) {
    if (r.moves[p].color !== r.myColor) continue;
    const m = r.mistakes.find(x => x.ply === p);
    const bad = m ? (m.kind === 'hint' ? 'hint' : 'fail') : null;
    const current = r.phase !== 'done' && p === k;
    let state;
    if (current) state = bad || 'now';
    else if (p < r.ply || r.phase !== 'play') state = bad || 'ok';
    else state = 'todo';
    out.push({ ply: p, state, current });
  }
  const i = out.findIndex(s => s.current);
  return { items: out, label: i >= 0 ? `Ход ${i + 1} из ${out.length}` : `${out.length} ${plural(out.length, 'ход', 'хода', 'ходов')}` };
}

/** Строка ходов: «Повторять»/«Экзамен» — только сыгранные (и «?» на месте хода); «Учить» — вся линия, будущие серые. */
function moveItems(r) {
  const k = curPly(r);
  const end = r.mode === 'learn' ? r.moves.length : (r.phase === 'done' ? r.ply : k);
  const items = [];
  for (let p = 0; p < end; p++) {
    const m = r.mistakes.find(x => x.ply === p);
    const state = p >= k && r.mode === 'learn' && r.phase !== 'done' ? (p === k ? 'now' : 'future')
      : r.moves[p].color !== r.myColor ? 'opp' : m ? m.kind : 'ok';
    items.push({ ply: p, text: p === 0 || r.moves[p].color === 'w' ? numSan(r.moves, p) : r.moves[p].san, state });
  }
  if (r.mode !== 'learn' && r.phase !== 'done' && isMyTurn(r)) items.push({ ply: k, text: r.moves[k].color === 'w' ? `${moveNo(k)}. ?` : '?', state: 'now' });
  return items;
}

export {
  START, DAYS, MASTERED, toMoves, fenBefore, numSan, fmtMoves, lcp, lineLabels, lineGroups, commonStart, cardPly,
  lineStatus, countStatuses, dueText, inDays, applyResult, reviewQueue, learnQueue, weight, hardQueue,
  sessionStart, learnStart, createRun, needsAuto, isMyTurn, auto, move, hint, restart, result, view, steps, moveItems, playedSan,
};
