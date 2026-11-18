'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { PieceDropHandlerArgs, SquareRenderer } from 'react-chessboard';
import { ClassIcon } from '@/components/ClassIcon';
import type { MoveClass } from '@/lib/classify';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
import { PlayButton } from '@/components/PlayButton';
import { Board } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import {
  type MistakeCard, type MistakeTag, type GamePhase,
  TAG_LABEL, PHASE_LABEL, nextReviewDate,
} from '@/lib/mistakes';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addXp(amount: number) {
  if (amount <= 0) return;
  const { data } = await supabase
    .from('user_xp').select('total_xp').eq('id', 1).maybeSingle();
  const current = (data as { total_xp: number } | null)?.total_xp ?? 0;
  await supabase.from('user_xp').upsert({ id: 1, total_xp: current + amount });
}

async function updateCard(card: MistakeCard, correct: boolean) {
  const newMastery = correct
    ? Math.min(card.mastery + 1, 5)
    : Math.max(card.mastery - 1, 0);
  const now = new Date().toISOString();
  await supabase.from('mistake_cards').update({
    mastery: newMastery,
    correct_count: card.correct_count + (correct ? 1 : 0),
    incorrect_count: card.incorrect_count + (correct ? 0 : 1),
    last_practiced: now,
    next_review: correct ? nextReviewDate(newMastery) : nextReviewDate(0),
  }).eq('id', card.id);
}

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const result = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length === 5 ? uci[4] as 'q' | 'r' | 'b' | 'n' : undefined,
    });
    return result?.san ?? uci;
  } catch { return uci; }
}

function fmtEval(cp: number): string {
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComputedLine { uci: string; evalWhite: number; }

interface AnswerState {
  correct: boolean;
  alternate: boolean;
  userSan: string;
  xpEarned: number;
  evalMyMoveCp?: number;
  evalBestCp?: number;
}

interface SessionScore { correct: number; incorrect: number; streak: number; xp: number; }
interface Filters { tag: MistakeTag | ''; phase: GamePhase | ''; }

const TAG_RULE: Record<string, string> = {
  hanging:        'Перед ходом спроси: что хочет сделать соперник? Проверь, не осталась ли фигура без защиты.',
  missed_check:   'Всегда проверяй, есть ли шах или взятие, прежде чем делать другой ход.',
  missed_tactic:  'Ищи тактические удары: вилки, связки, отвлечения — перед каждым ходом.',
  positional:     'Оцени пешечную структуру и активность фигур перед ходом.',
  deviation:      'Выучи линию точно: каждое отклонение даёт сопернику преимущество.',
};

// ── Main page ─────────────────────────────────────────────────────────────────

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
  const [session, setSession] = useState<SessionScore>({ correct: 0, incorrect: 0, streak: 0, xp: 0 });

  const { getMultiPV, evalPosition, setSkillLevel, isReady } = useStockfish();
  const cardLinesRef = useRef<ComputedLine[] | null>(null);

  useEffect(() => {
    void loadCards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

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
      .from('mistake_cards').select('*')
      .lte('next_review', now).order('next_review');
    if (filters.tag) query = query.eq('tag', filters.tag);
    if (filters.phase) query = query.eq('phase', filters.phase);
    const { data } = await query.limit(50);
    const loaded = (data ?? []) as MistakeCard[];
    setCards(loaded);
    setIndex(0);
    setAnswered(null);
    if (loaded.length > 0) setCurrentFen(loaded[0].fen_before);
    setLoading(false);
  }

  async function buildMiniCourse() {
    setBuildingCourse(true);
    setBuildError(null);
    try {
      let q = supabase.from('mistake_cards').select('*').order('eval_loss', { ascending: false }).limit(10);
      if (filters.tag) q = q.eq('tag', filters.tag);
      const { data: topCards } = await q;
      const selectedCards = (topCards ?? []) as MistakeCard[];
      if (selectedCards.length === 0) { setBuildError('Нет карточек для курса.'); setBuildingCourse(false); return; }

      const tagKey = filters.tag || 'hanging';
      const tagLabel = TAG_LABEL[tagKey as keyof typeof TAG_LABEL] ?? 'Ошибки';
      const rule = TAG_RULE[tagKey] ?? TAG_RULE.hanging;
      const slug = `personal-mistakes-${Date.now()}`;

      const { data: courseRow, error: courseErr } = await supabase.from('courses').insert({
        slug, name: `Мини-курс: ${tagLabel}`, color: 'both', opening: '',
        kind: 'personal', description: `Курс из ${selectedCards.length} твоих ошибок по теме «${tagLabel}».`,
        difficulty: 3,
      }).select('id').single();

      if (courseErr || !courseRow) {
        setBuildError(courseErr?.message?.includes('kind')
          ? 'Выполни supabase/19-courses-personal.sql, затем повтори.'
          : (courseErr?.message ?? 'Не удалось создать курс.'));
        setBuildingCourse(false);
        return;
      }

      const courseId: string = (courseRow as { id: string }).id;

      for (let i = 0; i < selectedCards.length; i++) {
        const c = selectedCards[i];
        const chess = new Chess(c.fen_before);
        const bestSan = (() => {
          if (!c.best_move || c.best_move.length < 4) return '';
          try {
            const mv = chess.move({
              from: c.best_move.slice(0, 2) as Square,
              to: c.best_move.slice(2, 4) as Square,
              promotion: c.best_move.length === 5 ? c.best_move[4] as 'q'|'r'|'b'|'n' : undefined,
            });
            return mv?.san ?? '';
          } catch { return ''; }
        })();

        const { data: lessonRow } = await supabase.from('course_lessons').insert({
          course_id: courseId, lesson_order: i,
          title: `Зевок ${i + 1}: ${tagLabel.toLowerCase()}${bestSan ? ` (${bestSan})` : ''}`,
          summary: `Позиция после моего хода ${c.my_move}. Лучший ход: ${bestSan || c.best_move}.`,
          plan: rule, mistakes: `Мой ход: ${c.my_move}. Потеря: ${c.eval_loss} сотых пешки.`, trap: '',
          blocks: [
            { type: 'text', md: `**Запомни:** ${rule}` },
            { type: 'puzzle', fen: c.fen_before, question: 'Найди лучший ход',
              answer: bestSan || c.best_move,
              why: `Лучший ход: ${bestSan || c.best_move}. Потеря составила ${c.eval_loss} сотых пешки.` },
          ],
        }).select('id').single();
        if (!lessonRow) continue;
        await supabase.from('lesson_lines').insert({
          lesson_id: (lessonRow as { id: string }).id, line_order: 0, moves: [], start_fen: c.fen_before,
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
    try { moveResult = chess.move({ from: sourceSquare as Square, to: targetSquare as Square }); }
    catch { return false; }
    if (!moveResult) return false;

    const userSan = moveResult.san;
    const userUci = sourceSquare + targetSquare + (moveResult.promotion ?? '');
    const newFen = chess.fen();
    setCurrentFen(newFen);

    const userColor = card.fen_before.split(' ')[1] as 'w' | 'b';
    if (userUci === card.best_move) { void handleCorrect(userSan, false); return true; }

    const lines = cardLinesRef.current;
    if (lines && lines.length > 0) {
      const bestEvalUser = userColor === 'w' ? lines[0].evalWhite : -lines[0].evalWhite;
      const match = lines.find(l => l.uci === userUci);
      if (match) {
        const lineEvalUser = userColor === 'w' ? match.evalWhite : -match.evalWhite;
        if (bestEvalUser - lineEvalUser <= 80 || (bestEvalUser > 500 && lineEvalUser > 400)) {
          void handleCorrect(userSan, true, lineEvalUser, bestEvalUser);
          return true;
        }
      }
    }

    if (!isReady) { void handleWrong(userSan, undefined, undefined); return true; }
    setChecking(true);
    const evalBeforeUser = (() => {
      const ew = card.eval_before ?? 0;
      return userColor === 'w' ? ew : -ew;
    })();
    const bestEvalUser = lines && lines.length > 0
      ? (userColor === 'w' ? lines[0].evalWhite : -lines[0].evalWhite)
      : evalBeforeUser;

    void (async () => {
      try {
        const { cp: evalAfterWhite } = await evalPosition(newFen, 1000);
        const evalAfterUser = userColor === 'w' ? evalAfterWhite : -evalAfterWhite;
        setChecking(false);
        if (evalAfterUser > 500 || evalBeforeUser - evalAfterUser <= 80) {
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
    setSession(s => ({ ...s, correct: s.correct + 1, streak: s.streak + 1, xp: s.xp + xp }));
    await updateCard(card, true);
    await addXp(xp);
  }

  async function handleWrong(userSan: string, evalMyMoveCp?: number, evalBestCp?: number) {
    if (!card) return;
    setAnswered({ correct: false, alternate: false, userSan, xpEarned: 0, evalMyMoveCp, evalBestCp });
    setSession(s => ({ ...s, incorrect: s.incorrect + 1, streak: 0 }));
    await updateCard(card, false);
  }

  async function handleCorrectManual() {
    if (!card || !answered || answered.correct) return;
    setAnswered(prev => prev ? { ...prev, correct: true, alternate: true, xpEarned: 5 } : prev);
    setSession(s => ({ ...s, correct: s.correct + 1, streak: s.streak + 1, xp: s.xp + 5 }));
    await updateCard(card, true);
    await addXp(5);
  }

  function goNext() {
    setAnswered(null);
    const next = index + 1;
    setIndex(next);
    if (cards[next]) setCurrentFen(cards[next].fen_before);
  }

  // ── Board config ──────────────────────────────────────────────────────────

  const boardOrientation: 'white' | 'black' = card
    ? (card.fen_before.split(' ')[1] === 'w' ? 'white' : 'black')
    : 'white';

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (answered && card) {
    try {
      const chess = new Chess(card.fen_before);
      const mv = chess.move(answered.userSan);
      if (mv) {
        squareStyles[mv.from] = { background: 'rgba(230,160,60,0.6)' };
        squareStyles[mv.to] = { background: 'rgba(230,160,60,0.6)' };
      }
    } catch { /* ignore */ }
    if (card.best_move?.length >= 4) {
      squareStyles[card.best_move.slice(0, 2)] = { background: 'rgba(100,200,120,0.55)' };
      squareStyles[card.best_move.slice(2, 4)] = { background: 'rgba(60,180,90,0.75)' };
    }
  }

  let userMoveToSq: string | null = null;
  let bestMoveToSq: string | null = null;
  let userMoveCls: MoveClass | null = null;

  if (answered && card) {
    try { const mv = new Chess(card.fen_before).move(answered.userSan); if (mv) userMoveToSq = mv.to; }
    catch { /* ignore */ }
    if (card.best_move?.length >= 4) bestMoveToSq = card.best_move.slice(2, 4);
    if (!answered.correct) {
      const loss = answered.evalBestCp !== undefined && answered.evalMyMoveCp !== undefined
        ? answered.evalBestCp - answered.evalMyMoveCp : card.eval_loss;
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
        <div aria-hidden="true" style={{
          position: 'absolute', top: 2, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10, pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
        }}>
          <ClassIcon cls={cls} size={30} />
        </div>
      </div>
    );
  };

  // ── Layout slots ─────────────────────────────────────────────────────────

  const total = cards.length;

  const SEL: React.CSSProperties = {
    height: 30, padding: '0 7px', fontSize: 11,
    background: 'var(--surface)', color: 'var(--ivory)',
    border: '1px solid var(--hairline)', cursor: 'pointer', outline: 'none',
    flex: '1 1 90px', minWidth: 0,
  };

  const sessionPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '44px 14px 10px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
          Сессия
        </div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
          {[
            { label: 'верно', value: session.correct, color: '#6DC77A' },
            { label: 'ошибок', value: session.incorrect, color: 'var(--control)' },
            { label: 'серия', value: session.streak, color: 'var(--ivory)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em' }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <select style={SEL} value={filters.tag} onChange={e => setFilters(f => ({ ...f, tag: e.target.value as MistakeTag | '' }))}>
            <option value="">Все типы</option>
            {(Object.entries(TAG_LABEL) as [MistakeTag, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select style={SEL} value={filters.phase} onChange={e => setFilters(f => ({ ...f, phase: e.target.value as GamePhase | '' }))}>
            <option value="">Все фазы</option>
            {(Object.entries(PHASE_LABEL) as [GamePhase, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {!loading && cards.map((c, i) => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 14px', gap: 8,
            background: i === index ? 'var(--surface)' : 'transparent',
            borderLeft: `2px solid ${i === index ? 'var(--ivory)' : 'transparent'}`,
            opacity: i < index ? 0.4 : 1,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {TAG_LABEL[c.tag]}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{PHASE_LABEL[c.phase]}</span>
            </div>
            {c.eval_loss > 0 && (
              <span style={{ fontSize: 10, color: 'var(--control)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                -{c.eval_loss}
              </span>
            )}
          </div>
        ))}
        {!loading && cards.length === 0 && (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>Нет карточек</div>
        )}
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--hairline)' }}>
        <button
          onClick={() => void buildMiniCourse()} disabled={buildingCourse}
          style={{ width: '100%', height: 30, fontSize: 11, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {buildingCourse ? 'Собираем…' : 'Собрать мини-курс'}
        </button>
        {buildError && (
          <span style={{ display: 'block', marginTop: 5, fontSize: 10, color: 'rgba(220,80,60,0.9)' }}>{buildError}</span>
        )}
      </div>
    </div>
  );

  const boardContent = (
    <Board
      position={loading ? 'start' : (currentFen || 'start')}
      orientation={boardOrientation}
      allowDragging={!answered && !checking && !loading && !!card}
      onPieceDrop={card && !answered && !checking ? handlePieceDrop : undefined}
      squareStyles={squareStyles}
      squareRenderer={squareRenderer}
      cacheKey={`${boardOrientation}-${card?.id ?? 'none'}`}
    />
  );

  const taskPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--muted)', textTransform: 'uppercase' }}>
            Тренировка · Ошибки
          </span>
          {!loading && total > 0 && (
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>
              {Math.min(index + 1, total)}/{total}
              {session.xp > 0 && <span style={{ color: '#6DC77A', marginLeft: 8 }}>+{session.xp} XP</span>}
            </span>
          )}
        </div>
        {!loading && total > 0 && (
          <div style={{ marginTop: 10, height: 3, background: 'var(--track)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--accent)',
              width: `${Math.min(100, (index / total) * 100)}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {loading && (
          <span style={{ fontSize: 14, color: 'var(--muted)', paddingTop: 20 }}>Загрузка…</span>
        )}

        {!loading && cards.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 20 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--ivory)' }}>Всё готово на сегодня!</span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>
              {filters.tag || filters.phase
                ? 'Нет карточек по выбранным фильтрам.'
                : 'Нет карточек для повторения. Проанализируй партии, чтобы добавить ошибки.'}
            </span>
            <Link href="/games/analyze" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
              Анализировать партии
            </Link>
          </div>
        )}

        {!loading && cards.length > 0 && index >= cards.length && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 20 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--ivory)' }}>Всё готово на сегодня!</span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>Повторено {cards.length} карточек</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[{ label: 'верно', value: session.correct, color: '#6DC77A' },
                { label: 'ошибок', value: session.incorrect, color: 'var(--control)' },
                { label: 'XP', value: `+${session.xp}`, color: 'var(--ivory)' }].map(s => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '12px 20px', border: '1px solid var(--hairline)' }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: s.color as string, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</span>
                  </div>
              ))}
            </div>
            <button onClick={() => void loadCards()} style={{ alignSelf: 'flex-start', height: 40, padding: '0 20px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', fontSize: 13, cursor: 'pointer' }}>
              Обновить
            </button>
          </div>
        )}

        {card && index < cards.length && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ivory)' }}>
                Найди лучший ход
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {boardOrientation === 'white' ? '♙ Вы играете белыми' : '♟ Вы играете чёрными'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 8px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--muted)' }}>
                {TAG_LABEL[card.tag]}
              </span>
              <span style={{ padding: '3px 8px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--muted)' }}>
                {PHASE_LABEL[card.phase]}
              </span>
              {card.eval_loss > 0 && (
                <span style={{ padding: '3px 8px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--control)' }}>
                  -{(card.eval_loss / 100).toFixed(2)}
                </span>
              )}
            </div>

            {!answered && !checking && TAG_RULE[card.tag] && (
              <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                {TAG_RULE[card.tag]}
              </span>
            )}

            {checking && <span style={{ fontSize: 14, color: 'var(--muted)' }}>Проверяем…</span>}

            {answered && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {answered.correct ? (
                  <div style={{ padding: '14px 16px', background: 'rgba(109,199,122,0.08)', border: '1px solid rgba(109,199,122,0.3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#6DC77A' }}>
                      Верно!
                      {answered.xpEarned > 0 && <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 8, color: 'var(--muted)' }}>+{answered.xpEarned} XP</span>}
                    </span>
                    {answered.alternate && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Не лучший, но приемлемый ход</span>}
                    {card.best_move && (
                      <span style={{ fontSize: 14, fontFamily: 'monospace', color: '#6DC77A', fontWeight: 600 }}>
                        {uciToSan(card.fen_before, card.best_move)}
                      </span>
                    )}
                    {answered.evalBestCp !== undefined && (
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        Оценка: {fmtEval(answered.evalBestCp)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '14px 16px', background: 'rgba(110,106,97,0.1)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--control)' }}>Неверно</span>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>Ваш ход</span>
                        <span style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--control)' }}>{answered.userSan}</span>
                      </div>
                      {card.best_move && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>Лучший ход</span>
                          <span style={{ fontSize: 14, fontFamily: 'monospace', color: '#6DC77A' }}>{uciToSan(card.fen_before, card.best_move)}</span>
                        </div>
                      )}
                    </div>
                    {answered.evalMyMoveCp !== undefined && answered.evalBestCp !== undefined && (
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        Ваш: {fmtEval(answered.evalMyMoveCp)} · лучший: {fmtEval(answered.evalBestCp)}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4 }}>Уровень</span>
                  {[0, 1, 2, 3, 4, 5].map(lvl => (
                    <span key={lvl} style={{ width: 20, height: 3, background: lvl <= card.mastery ? 'var(--ivory)' : 'var(--track)' }} />
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{card.mastery}/5</span>
                </div>

                {!answered.correct && (
                  <button onClick={() => void handleCorrectManual()} style={{ alignSelf: 'flex-start', height: 30, padding: '0 12px', fontSize: 11, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', cursor: 'pointer' }}>
                    Мой ход тоже хороший
                  </button>
                )}

                <PlayButton fen={card.fen_before} color={card.fen_before.split(' ')[1] as 'w' | 'b'} label="Играть отсюда" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {card && index < cards.length && answered && (
          <button
            onClick={goNext}
            style={{ width: '100%', height: 44, fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Дальше →
          </button>
        )}
        {!loading && cards.length === 0 && (
          <Link href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, fontSize: 14, fontWeight: 600, background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--hairline)' }}>
            На главную
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <TrainerLayout
      sessionPanel={sessionPanel}
      boardContent={boardContent}
      taskPanel={taskPanel}
    />
  );
}
