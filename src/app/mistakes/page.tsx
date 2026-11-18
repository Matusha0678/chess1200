'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs, SquareRenderer } from 'react-chessboard';
import { ClassIcon } from '@/components/ClassIcon';
import type { MoveClass } from '@/lib/classify';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { useStockfish } from '@/hooks/useStockfish';
import { PlayButton } from '@/components/PlayButton';
import {
  type MistakeCard, type MistakeTag, type GamePhase,
  TAG_LABEL, PHASE_LABEL, nextReviewDate,
} from '@/lib/mistakes';

// ── Design tokens ─────────────────────────────────────────────────────────────

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.16em',
  color: 'var(--muted)', textTransform: 'uppercase',
};

const SEL: React.CSSProperties = {
  height: 36, padding: '0 10px', fontSize: 13,
  background: 'var(--surface)', color: 'var(--ivory)',
  border: '1px solid var(--hairline)', cursor: 'pointer', outline: 'none',
};

// ── XP helper ─────────────────────────────────────────────────────────────────

async function addXp(amount: number) {
  if (amount <= 0) return;
  const { data } = await supabase
    .from('user_xp')
    .select('total_xp')
    .eq('id', 1)
    .maybeSingle();
  const current = (data as { total_xp: number } | null)?.total_xp ?? 0;
  await supabase
    .from('user_xp')
    .upsert({ id: 1, total_xp: current + amount });
}

// ── SR update ─────────────────────────────────────────────────────────────────

async function updateCard(card: MistakeCard, correct: boolean) {
  const oldMastery = card.mastery;
  const newMastery = correct ? Math.min(oldMastery + 1, 5) : Math.max(oldMastery - 1, 0);
  const now = new Date().toISOString();
  await supabase.from('mistake_cards').update({
    mastery: newMastery,
    correct_count: card.correct_count + (correct ? 1 : 0),
    incorrect_count: card.incorrect_count + (correct ? 0 : 1),
    last_practiced: now,
    next_review: correct ? nextReviewDate(newMastery) : nextReviewDate(0),
  }).eq('id', card.id);
}

// ── UCI to SAN helper ─────────────────────────────────────────────────────────

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length === 5 ? uci[4] as 'q' | 'r' | 'b' | 'n' : undefined;
    const result = chess.move({ from, to, promotion });
    return result?.san ?? uci;
  } catch {
    return uci;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface ComputedLine {
  uci: string;
  evalWhite: number; // centipawns, always white's perspective
}

interface AnswerState {
  correct: boolean;
  alternate: boolean;
  userSan: string;
  xpEarned: number;
  evalMyMoveCp?: number;  // centipawns, user's perspective
  evalBestCp?: number;    // centipawns, user's perspective
}

function fmtEval(cp: number): string {
  const s = cp >= 0 ? '+' : '';
  return `${s}${(cp / 100).toFixed(2)}`;
}

interface Filters {
  tag: MistakeTag | '';
  phase: GamePhase | '';
}

// ── Tag rules (шаблоны для мини-курса) ──────────────────────────────────────

const TAG_RULE: Record<string, string> = {
  hanging:        'Перед ходом спроси: что хочет сделать соперник? Проверь, не осталась ли фигура без защиты.',
  missed_check:   'Всегда проверяй, есть ли шах или взятие, прежде чем делать другой ход.',
  missed_tactic:  'Ищи тактические удары: вилки, связки, отвлечения — перед каждым ходом.',
  positional:     'Оцени пешечную структуру и активность фигур перед ходом.',
  deviation:      'Выучи линию точно: каждое отклонение даёт сопернику преимущество.',
};

export default function MistakesPage() {
  const router = useRouter();
  const [cards, setCards] = useState<MistakeCard[]>([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<AnswerState | null>(null);
  const [filters, setFilters] = useState<Filters>({ tag: '', phase: '' });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [currentFen, setCurrentFen] = useState<string>('');
  const [buildingCourse, setBuildingCourse] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const { boardTheme, customPieces, showNotation: notationEnabled, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();
  const { getMultiPV, evalPosition, setSkillLevel, isReady } = useStockfish();
  const cardLinesRef = useRef<ComputedLine[] | null>(null);

  useEffect(() => {
    void loadCards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Precompute top-3 lines for the current card (Skill Level 20, depth 14)
  useEffect(() => {
    const currentCard = cards[index] ?? null;
    if (!currentCard || !isReady) return;
    cardLinesRef.current = null;
    setSkillLevel(20);
    const sideToMove = currentCard.fen_before.split(' ')[1] ?? 'w';
    getMultiPV(currentCard.fen_before, 14, 3, (lines) => {
      cardLinesRef.current = lines.map(l => {
        let evalWhite: number;
        if (l.mate !== undefined) {
          const absVal = l.mate > 0 ? 9000 : -9000;
          evalWhite = sideToMove === 'b' ? -absVal : absVal;
        } else {
          evalWhite = sideToMove === 'b' ? -(l.cp ?? 0) : (l.cp ?? 0);
        }
        return { uci: l.move, evalWhite };
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards[index]?.id, isReady]);

  async function loadCards() {
    setLoading(true);
    const now = new Date().toISOString();
    let query = supabase
      .from('mistake_cards')
      .select('*')
      .lte('next_review', now)
      .order('next_review');
    if (filters.tag) query = query.eq('tag', filters.tag);
    if (filters.phase) query = query.eq('phase', filters.phase);
    const { data } = await query.limit(50);
    const loaded = (data ?? []) as MistakeCard[];
    setCards(loaded);
    setIndex(0);
    setAnswered(null);
    if (loaded.length > 0) {
      setCurrentFen(loaded[0].fen_before);
    }
    setLoading(false);
  }

  async function buildMiniCourse() {
    setBuildingCourse(true);
    setBuildError(null);
    try {
      // Get top-10 cards by eval_loss for selected tag (or all)
      let q = supabase.from('mistake_cards').select('*').order('eval_loss', { ascending: false }).limit(10);
      if (filters.tag) q = q.eq('tag', filters.tag);
      const { data: topCards } = await q;
      const selectedCards = (topCards ?? []) as MistakeCard[];
      if (selectedCards.length === 0) {
        setBuildError('Нет карточек для курса.');
        setBuildingCourse(false);
        return;
      }

      const tagKey = filters.tag || 'hanging';
      const tagLabel = TAG_LABEL[tagKey as keyof typeof TAG_LABEL] ?? 'Ошибки';
      const rule = TAG_RULE[tagKey] ?? TAG_RULE.hanging;
      const slug = `personal-mistakes-${Date.now()}`;

      // Create course
      const { data: courseRow, error: courseErr } = await supabase.from('courses').insert({
        slug,
        name: `Мини-курс: ${tagLabel}`,
        color: 'both',
        opening: '',
        kind: 'personal',
        description: `Курс из ${selectedCards.length} твоих ошибок по теме «${tagLabel}».`,
        difficulty: 3,
      }).select('id').single();

      if (courseErr || !courseRow) {
        // If kind constraint fails
        if (courseErr?.message?.includes('kind')) {
          setBuildError('Выполни supabase/19-courses-personal.sql, затем повтори.');
        } else {
          setBuildError(courseErr?.message ?? 'Не удалось создать курс.');
        }
        setBuildingCourse(false);
        return;
      }

      const courseId: string = (courseRow as { id: string }).id;

      // Create one lesson per card
      for (let i = 0; i < selectedCards.length; i++) {
        const c = selectedCards[i];
        const chess = new Chess(c.fen_before);
        const bestSan = (() => {
          if (!c.best_move || c.best_move.length < 4) return '';
          try {
            const from = c.best_move.slice(0, 2) as Square;
            const to   = c.best_move.slice(2, 4) as Square;
            const prom = c.best_move.length === 5 ? c.best_move[4] as 'q'|'r'|'b'|'n' : undefined;
            const mv   = chess.move({ from, to, promotion: prom });
            return mv?.san ?? '';
          } catch { return ''; }
        })();

        const lessonTitle = `Зевок ${i + 1}: ${tagLabel.toLowerCase()}${bestSan ? ` (${bestSan})` : ''}`;
        const summary = `Позиция после моего хода ${c.my_move}. Лучший ход: ${bestSan || c.best_move}.`;
        const plan    = rule;
        const mistakes = `Мой ход: ${c.my_move}. Потеря: ${c.eval_loss} сотых пешки.`;

        const { data: lessonRow, error: lessonErr } = await supabase.from('course_lessons').insert({
          course_id: courseId,
          lesson_order: i,
          title: lessonTitle,
          summary,
          plan,
          mistakes,
          trap: '',
          blocks: [
            { type: 'text', md: `**Запомни:** ${rule}` },
            {
              type: 'puzzle',
              fen: c.fen_before,
              question: 'Найди лучший ход',
              answer: bestSan || c.best_move,
              why: `Лучший ход: ${bestSan || c.best_move}. Потеря составила ${c.eval_loss} сотых пешки.`,
            },
          ],
        }).select('id').single();

        if (lessonErr || !lessonRow) continue;

        // Add empty line (position before my move)
        await supabase.from('lesson_lines').insert({
          lesson_id: (lessonRow as { id: string }).id,
          line_order: 0,
          moves: [],
          start_fen: c.fen_before,
        });
      }

      setBuildingCourse(false);
      router.push(`/courses/${courseId}`);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'Ошибка');
      setBuildingCourse(false);
    }
  }

  const card = cards[index] ?? null;

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!card || answered || checking) return false;
    if (!targetSquare) return false;

    const chess = new Chess(card.fen_before);
    let moveResult;
    try {
      moveResult = chess.move({ from: sourceSquare as Square, to: targetSquare as Square });
    } catch { return false; }
    if (!moveResult) return false;

    const userSan = moveResult.san;
    const userUci = sourceSquare + targetSquare + (moveResult.promotion ?? '');
    const newFen = chess.fen();
    setCurrentFen(newFen);

    const userColor = card.fen_before.split(' ')[1] as 'w' | 'b';

    // Exact best move — instant correct
    if (userUci === card.best_move) {
      void handleCorrect(userSan, false);
      return true;
    }

    // Fast path: check against precomputed top-3 lines
    const lines = cardLinesRef.current;
    if (lines && lines.length > 0) {
      const bestEvalUser = userColor === 'w' ? lines[0].evalWhite : -lines[0].evalWhite;
      const match = lines.find(l => l.uci === userUci);
      if (match) {
        const lineEvalUser = userColor === 'w' ? match.evalWhite : -match.evalWhite;
        const loss = bestEvalUser - lineEvalUser;
        if (loss <= 80 || (bestEvalUser > 500 && lineEvalUser > 400)) {
          void handleCorrect(userSan, true, lineEvalUser, bestEvalUser);
          return true;
        }
      }
    }

    // Async fallback: evalPosition on resulting position (~1 s, Skill 20)
    if (!isReady) {
      void handleWrong(userSan, undefined, undefined);
      return true;
    }
    setChecking(true);

    const evalBeforeWhite = card.eval_before ?? 0;
    const evalBeforeUser = userColor === 'w' ? evalBeforeWhite : -evalBeforeWhite;
    const bestEvalUser = lines && lines.length > 0
      ? (userColor === 'w' ? lines[0].evalWhite : -lines[0].evalWhite)
      : evalBeforeUser;

    void (async () => {
      try {
        const { cp: evalAfterWhite } = await evalPosition(newFen, 1000);
        const evalAfterUser = userColor === 'w' ? evalAfterWhite : -evalAfterWhite;
        const evalLoss = evalBeforeUser - evalAfterUser;
        setChecking(false);
        if (evalLoss <= 80 || evalAfterUser > 500) {
          void handleCorrect(userSan, true, evalAfterUser, bestEvalUser);
        } else {
          void handleWrong(userSan, evalAfterUser, bestEvalUser);
        }
      } catch {
        setChecking(false);
        void handleWrong(userSan, undefined, undefined);
      }
    })();

    return true;
  }

  async function handleCorrect(userSan: string, alternate: boolean, evalMyMoveCp?: number, evalBestCp?: number) {
    if (!card) return;
    const xp = alternate ? 5 : 10;
    setAnswered({ correct: true, alternate, userSan, xpEarned: xp, evalMyMoveCp, evalBestCp });
    await updateCard(card, true);
    await addXp(xp);
  }

  async function handleWrong(userSan: string, evalMyMoveCp?: number, evalBestCp?: number) {
    if (!card) return;
    setAnswered({ correct: false, alternate: false, userSan, xpEarned: 0, evalMyMoveCp, evalBestCp });
    await updateCard(card, false);
  }

  async function handleCorrectManual() {
    if (!card || !answered || answered.correct) return;
    setAnswered(prev => prev ? { ...prev, correct: true, alternate: true, xpEarned: 5 } : prev);
    await updateCard(card, true);
    await addXp(5);
  }

  function goNext() {
    const nextIndex = index + 1;
    setAnswered(null);
    setIndex(nextIndex);
    if (cards[nextIndex]) {
      setCurrentFen(cards[nextIndex].fen_before);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-pulse">
          <div style={{ height: 40, width: 180, background: 'var(--surface)', borderRadius: 'var(--radius-btn)' }} />
          <div className="ui-card" style={{ height: 480 }} />
        </div>
      </div>
    );
  }

  const remaining = cards.length - index;
  const boardOrientation = card
    ? (card.fen_before.split(' ')[1] === 'w' ? 'white' : 'black')
    : 'white';

  // Square styles for answered state
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (answered && card) {
    // Highlight user's move in orange
    // We need to get from/to squares from the user's move in fen_before
    try {
      const chess = new Chess(card.fen_before);
      const userMoveResult = chess.move(answered.userSan);
      if (userMoveResult) {
        squareStyles[userMoveResult.from] = { background: 'rgba(230, 160, 60, 0.6)' };
        squareStyles[userMoveResult.to] = { background: 'rgba(230, 160, 60, 0.6)' };
      }
    } catch { /* ignore */ }

    // Highlight best_move in green
    if (card.best_move && card.best_move.length >= 4) {
      const fromSq = card.best_move.slice(0, 2);
      const toSq = card.best_move.slice(2, 4);
      squareStyles[fromSq] = { background: 'rgba(100, 200, 120, 0.55)' };
      squareStyles[toSq] = { background: 'rgba(60, 180, 90, 0.75)' };
    }
  }

  // Compute destination squares and classification badge for answered state
  let userMoveToSq: string | null = null;
  let bestMoveToSq: string | null = null;
  let userMoveCls: MoveClass | null = null;

  if (answered && card) {
    try {
      const chess = new Chess(card.fen_before);
      const mv = chess.move(answered.userSan);
      if (mv) userMoveToSq = mv.to;
    } catch { /* ignore */ }

    if (card.best_move && card.best_move.length >= 4) {
      bestMoveToSq = card.best_move.slice(2, 4);
    }

    if (!answered.correct) {
      // Determine severity by eval loss
      const loss = answered.evalBestCp !== undefined && answered.evalMyMoveCp !== undefined
        ? answered.evalBestCp - answered.evalMyMoveCp
        : card.eval_loss;
      userMoveCls = loss > 150 ? 'blunder' : loss > 70 ? 'mistake' : 'inaccuracy';
    } else {
      userMoveCls = answered.alternate ? 'good' : 'best';
    }
  }

  const squareRenderer: SquareRenderer = ({ square, children }) => {
    const isUserTo = square === userMoveToSq;
    const isBestTo = square === bestMoveToSq && answered && !answered.correct;
    if (!isUserTo && !isBestTo) return <>{children}</>;
    const cls: MoveClass = isBestTo ? 'best' : (userMoveCls ?? 'blunder');
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {children}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 2, left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10, pointerEvents: 'none',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
          }}
        >
          <ClassIcon cls={cls} size={30} />
        </div>
      </div>
    );
  };

  const boardKey = `${boardThemeId}-${pieceStyleId}-${boardOrientation}-${card?.id ?? 'none'}`;

  return (
    <div className="page" style={{ maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1 className="page-title">Ошибки</h1>
          {!loading && (
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>
              Осталось: <span style={{ color: 'var(--ivory)', fontWeight: 600 }}>{remaining > 0 ? remaining : 0}</span>
            </span>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
          <select
            style={SEL}
            value={filters.tag}
            onChange={e => setFilters(f => ({ ...f, tag: e.target.value as MistakeTag | '' }))}
          >
            <option value="">Все типы</option>
            {(Object.entries(TAG_LABEL) as [MistakeTag, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            style={SEL}
            value={filters.phase}
            onChange={e => setFilters(f => ({ ...f, phase: e.target.value as GamePhase | '' }))}
          >
            <option value="">Все фазы</option>
            {(Object.entries(PHASE_LABEL) as [GamePhase, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {(filters.tag || filters.phase) && (
            <button
              onClick={() => setFilters({ tag: '', phase: '' })}
              style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              × Сбросить
            </button>
          )}
          <button
            onClick={() => void buildMiniCourse()}
            disabled={buildingCourse}
            style={{ height: 36, padding: '0 14px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}
            title="Собрать мини-курс из ошибок выбранного типа"
          >
            {buildingCourse ? 'Собираем…' : 'Собрать мини-курс'}
          </button>
          {buildError && (
            <span style={{ fontSize: 12, color: 'rgba(220,80,60,0.9)' }}>{buildError}</span>
          )}
        </div>
      </div>

      {/* No cards */}
      {cards.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '40px 0' }}>
          <span style={{ ...HEADING, fontSize: 24, fontWeight: 600, color: 'var(--ivory)' }}>
            Всё готово на сегодня!
          </span>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            {filters.tag || filters.phase
              ? 'Нет карточек по выбранным фильтрам.'
              : 'Нет карточек для повторения. Проанализируй партии, чтобы добавить ошибки.'}
          </span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8 }}>
            <Link
              href="/games/analyze"
              style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}
            >
              Анализировать партии
            </Link>
          </div>
        </div>
      )}

      {/* Completion screen when all cards done */}
      {cards.length > 0 && index >= cards.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '40px 0' }}>
          <span style={{ ...HEADING, fontSize: 24, fontWeight: 600, color: 'var(--ivory)' }}>
            Всё готово на сегодня!
          </span>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            Повторено {cards.length} карточек
          </span>
          <button
            onClick={() => void loadCards()}
            style={{ alignSelf: 'flex-start', height: 44, padding: '0 24px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', fontSize: 13, cursor: 'pointer' }}
          >
            Обновить
          </button>
        </div>
      )}

      {/* Card practice */}
      {card && index < cards.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start' }}>

          {/* Board area */}
          <div style={{ flex: '1 1 480px', maxWidth: 520 }}>
            {/* Card meta */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 8px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--muted)' }}>
                {TAG_LABEL[card.tag]}
              </span>
              <span style={{ padding: '3px 8px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--muted)' }}>
                {PHASE_LABEL[card.phase]}
              </span>
              {card.eval_loss > 0 && (
                <span style={{ padding: '3px 8px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--control)' }}>
                  -{card.eval_loss}cp
                </span>
              )}
              <span style={{ padding: '3px 8px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--muted)' }}>
                {index + 1}/{cards.length}
              </span>
            </div>

            {/* Chess board */}
            <div style={{ width: '100%', aspectRatio: '1', borderRadius: 4, overflow: 'hidden', border: '1px solid #262626' }}>
              <Chessboard
                key={boardKey}
                options={{
                  position: currentFen,
                  boardOrientation,
                  onPieceDrop: answered ? undefined : handlePieceDrop,
                  squareStyles,
                  squareRenderer,
                  allowDragging: !answered && !checking,
                  boardStyle: { borderRadius: '0', width: '100%', height: '100%' },
                  darkSquareStyle: { backgroundColor: boardTheme.dark },
                  lightSquareStyle: { backgroundColor: boardTheme.light },
                  pieces: customPieces,
                  showNotation: notationEnabled,
                  animationDurationInMs: animationMs,
                  darkSquareNotationStyle: { color: '#C8C8C8' },
                  lightSquareNotationStyle: { color: '#505050' },
                  alphaNotationStyle: { fontSize: '11px', fontWeight: '700' },
                  numericNotationStyle: { fontSize: '11px', fontWeight: '700' },
                }}
              />
            </div>
          </div>

          {/* Feedback panel */}
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 44 }}>

            {/* Mastery */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={SECTION_LABEL}>УРОВЕНЬ</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2,3,4,5].map(level => (
                  <span
                    key={level}
                    style={{
                      width: 24, height: 4,
                      background: level <= card.mastery ? 'var(--ivory)' : 'var(--track)',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{card.mastery}/5</span>
            </div>

            {/* Prompt / feedback */}
            {!answered && !checking && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)' }}>
                  Найди лучший ход
                </span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {boardOrientation === 'white' ? '♙ Вы играете белыми' : '♟ Вы играете чёрными'}
                </span>
              </div>
            )}

            {checking && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>
                  Проверяем…
                </span>
              </div>
            )}

            {answered && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {answered.correct ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#6DC77A' }}>
                      Верно!
                      {answered.xpEarned > 0 && (
                        <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 8, color: 'var(--muted)' }}>
                          +{answered.xpEarned} XP
                        </span>
                      )}
                    </span>
                    {answered.alternate && (
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                        Не лучший, но приемлемый ход
                      </span>
                    )}
                    {card.best_move && (
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={SECTION_LABEL}>ЛУЧШИЙ ХОД</span>
                        <span style={{ fontSize: 16, fontWeight: 600, color: '#6DC77A', fontFamily: 'monospace' }}>
                          {uciToSan(card.fen_before, card.best_move)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--control)' }}>
                      Неверно
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={SECTION_LABEL}>ВАШ ХОД</span>
                      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--control)', fontFamily: 'monospace' }}>
                        {answered.userSan}
                      </span>
                    </div>
                    {card.best_move && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={SECTION_LABEL}>ЛУЧШИЙ ХОД</span>
                        <span style={{ fontSize: 16, fontWeight: 600, color: '#6DC77A', fontFamily: 'monospace' }}>
                          {uciToSan(card.fen_before, card.best_move)}
                        </span>
                      </div>
                    )}
                    {answered.evalMyMoveCp !== undefined && answered.evalBestCp !== undefined && (
                      <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        Твой ход: {fmtEval(answered.evalMyMoveCp)} · лучший: {fmtEval(answered.evalBestCp)}
                      </span>
                    )}
                    <button
                      onClick={() => void handleCorrectManual()}
                      style={{
                        alignSelf: 'flex-start', height: 32, padding: '0 14px',
                        fontSize: 12, fontWeight: 500,
                        background: 'transparent', color: 'var(--muted)',
                        border: '1px solid var(--hairline)', cursor: 'pointer',
                      }}
                    >
                      Мой ход тоже хороший
                    </button>
                  </div>
                )}

                {/* Explanation */}
                <div style={{ padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {TAG_LABEL[card.tag]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {PHASE_LABEL[card.phase]} · потеря {card.eval_loss}cp
                  </span>
                </div>

                {/* Play from this position */}
                <PlayButton
                  fen={card.fen_before}
                  color={card.fen_before.split(' ')[1] as 'w' | 'b'}
                  label="Играть отсюда"
                />

                {/* Next button */}
                <button
                  onClick={goNext}
                  style={{
                    height: 48, padding: '0 28px', fontSize: 14, fontWeight: 600,
                    background: 'var(--ivory)', color: 'var(--ink)',
                    border: 'none', cursor: 'pointer', alignSelf: 'flex-start',
                  }}
                >
                  Следующая →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
