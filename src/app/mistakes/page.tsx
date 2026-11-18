'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { PieceDropHandlerArgs, SquareRenderer, Arrow } from 'react-chessboard';
import { ClassIcon } from '@/components/ClassIcon';
import type { MoveClass } from '@/lib/classify';
import { supabase } from '@/lib/supabase';
import { useStockfish } from '@/hooks/useStockfish';
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

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  } catch { return ''; }
}

const TIME_CLASS_RU: Record<string, string> = {
  rapid: 'рапид', blitz: 'блиц', bullet: 'пуля', daily: 'дейли',
};

function evalToPercent(cp: number): number {
  return Math.max(5, Math.min(95, 50 + 50 * Math.tanh(cp / 500)));
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

interface GameInfo {
  opp_name: string;
  time_class: string;
  played_at: string;
  url: string;
  color: string;
}

const TAG_RULE: Record<string, string> = {
  hanging:        'Перед ходом спроси: что хочет сделать соперник? Проверь, не осталась ли фигура без защиты.',
  missed_check:   'Всегда проверяй, есть ли шах или взятие, прежде чем делать другой ход.',
  missed_tactic:  'Ищи тактические удары: вилки, связки, отвлечения — перед каждым ходом.',
  positional:     'Оцени пешечную структуру и активность фигур перед ходом.',
  deviation:      'Выучи линию точно: каждое отклонение даёт сопернику преимущество.',
};

// ── Styled select ─────────────────────────────────────────────────────────────

function StyledSelect({ value, onChange, children }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', height: 38, borderRadius: 'var(--radius-btn)',
          background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)',
          color: 'var(--ivory)', fontSize: 14, padding: '0 32px 0 12px',
          appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
          fontFamily: 'inherit', outline: 'none',
        }}
      >
        {children}
      </select>
      {/* chevron */}
      <svg
        viewBox="0 0 24 24" width={14} height={14}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted)' }}
        fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

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
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const { getMultiPV, evalPosition, setSkillLevel, isReady } = useStockfish();
  const cardLinesRef = useRef<ComputedLine[] | null>(null);

  // load player username once
  useEffect(() => {
    supabase.from('games_sync_state').select('username').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data) setPlayerName((data as { username: string }).username);
      });
  }, []);

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

  // load game info when card changes
  useEffect(() => {
    const currentCard = cards[index] ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!currentCard?.game_id) { setGameInfo(null); return; }
    supabase
      .from('games')
      .select('opp_name, time_class, played_at, url, color')
      .eq('id', currentCard.game_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setGameInfo(data as GameInfo);
        else setGameInfo(null);
      });
    // reset hint/answer
    setShowHint(false);
    setShowAnswer(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards[index]?.id]);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const currentCard = cards[index] ?? null;
      if (e.key === 'h' || e.key === 'H') { if (!answered && currentCard) setShowHint(true); }
      if (e.key === 'a' || e.key === 'A') { if (!answered && currentCard) { setShowHint(true); setShowAnswer(true); } }
      if (e.key === 's' || e.key === 'S') { if (!answered && currentCard) skipCard(); }
      if (e.key === ' ') { e.preventDefault(); if (answered) goNext(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, cards, index]);

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

  function skipCard() {
    setAnswered(null);
    setShowHint(false);
    setShowAnswer(false);
    const next = index + 1;
    setIndex(next);
    if (cards[next]) setCurrentFen(cards[next].fen_before);
  }

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
    setShowHint(false);
    setShowAnswer(false);
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

  // hint / show answer highlights
  if (!answered && card && card.best_move?.length >= 4) {
    const fromSq = card.best_move.slice(0, 2);
    const toSq = card.best_move.slice(2, 4);
    if (showHint) squareStyles[fromSq] = { background: 'rgba(129,182,76,0.38)' };
    if (showAnswer) {
      squareStyles[fromSq] = { background: 'rgba(129,182,76,0.45)' };
      squareStyles[toSq] = { background: 'rgba(129,182,76,0.6)' };
    }
  }

  // arrows: show answer arrow
  const arrows: Arrow[] = [];
  if (!answered && showAnswer && card && card.best_move?.length >= 4) {
    arrows.push({
      startSquare: card.best_move.slice(0, 2),
      endSquare: card.best_move.slice(2, 4),
      color: '#81B64C',
    });
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

  // ── Eval bar ──────────────────────────────────────────────────────────────

  const evalCp = answered && card ? (card.eval_before ?? 0) : 0;
  const evalPct = evalToPercent(evalCp);
  const evalLabel = answered && card
    ? (Math.abs(evalCp) >= 900 ? '♟' : fmtEval(evalCp))
    : '';

  const evalBar = (
    <div style={{
      width: 24,
      height: '100%',
      borderRadius: 5,
      overflow: 'hidden',
      background: '#403D3A',
      position: 'relative',
      opacity: answered ? 1 : 0,
      transition: 'opacity 0.3s',
    }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: '#EDEBE7',
        height: `${evalPct}%`,
        transition: 'height 0.5s ease',
      }} />
      {evalLabel && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 5,
          textAlign: 'center', fontSize: 9, fontWeight: 700,
          color: evalCp >= 0 ? '#3A3835' : '#EDEBE7',
          lineHeight: 1,
        }}>
          {evalLabel}
        </div>
      )}
    </div>
  );

  // ── Player strips ─────────────────────────────────────────────────────────

  const isWhite = boardOrientation === 'white';

  const topPlayer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: 'var(--track)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 16 }}>{isWhite ? '♟' : '♙'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
          {gameInfo?.opp_name || '—'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {isWhite ? 'чёрные' : 'белые'}
        </span>
      </div>
    </div>
  );

  const bottomPlayer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: 'var(--track)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 16 }}>{isWhite ? '♙' : '♟'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
          {playerName || 'ты'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {isWhite ? 'ты · белые' : 'ты · чёрные'}
        </span>
      </div>
    </div>
  );

  // ── Layout slots ──────────────────────────────────────────────────────────

  const total = cards.length;

  // ── Session panel ─────────────────────────────────────────────────────────

  const sessionPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--ivory)' }}>Сессия</span>
        {!loading && total > 0 && (
          <span style={{ fontSize: 14, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            осталось {Math.max(0, total - index)}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
        margin: '0 20px',
        border: '1px solid var(--hairline)',
        borderRadius: 10, overflow: 'hidden',
        flexShrink: 0,
      }}>
        {[
          { label: 'верно', value: session.correct, color: '#81B64C' },
          { label: 'ошибок', value: session.incorrect, color: '#E0574A' },
          { label: 'серия', value: session.streak, color: 'var(--ivory)' },
        ].map(({ label, value, color }, i) => (
          <div key={label} style={{
            padding: '10px 0', textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--hairline)' : 'none',
          }}>
            <b style={{ display: 'block', fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              {value}
            </b>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '14px 20px 6px', flexShrink: 0 }}>
        <StyledSelect value={filters.tag} onChange={v => setFilters(f => ({ ...f, tag: v as MistakeTag | '' }))}>
          <option value="">Все типы</option>
          {(Object.entries(TAG_LABEL) as [MistakeTag, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </StyledSelect>
        <StyledSelect value={filters.phase} onChange={v => setFilters(f => ({ ...f, phase: v as GamePhase | '' }))}>
          <option value="">Все фазы</option>
          {(Object.entries(PHASE_LABEL) as [GamePhase, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </StyledSelect>
      </div>

      {/* Queue header */}
      <div style={{ margin: '14px 20px 6px', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Очередь</span>
        {!loading && total > 0 && (
          <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            {Math.min(index + 1, total)} / {total}
          </span>
        )}
      </div>

      {/* Queue list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
        {!loading && cards.map((c, i) => {
          const isCur = i === index;
          const isDone = i < index;

          return (
            <div key={c.id} style={{
              display: 'grid',
              gridTemplateColumns: '26px 1fr auto',
              alignItems: 'center',
              gap: 8,
              height: 50,
              padding: '0 10px',
              borderRadius: 10,
              position: 'relative',
              background: isCur ? 'var(--track)' : 'transparent',
              opacity: isDone ? 0.5 : 1,
            }}>
              {/* left indicator */}
              {isCur && (
                <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#81B64C' }} />
              )}
              {/* index / check / x */}
              <div style={{ display: 'grid', placeItems: 'center', fontSize: 13, color: isCur ? '#81B64C' : 'var(--control)', fontWeight: isCur ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                {isDone ? (
                  <span style={{ color: '#81B64C', fontSize: 15 }}>✓</span>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              {/* title + phase */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: isDone ? 'var(--control)' : 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {TAG_LABEL[c.tag]}
                </div>
                <div style={{ fontSize: 13, color: 'var(--control)', marginTop: 1 }}>{PHASE_LABEL[c.phase]}</div>
              </div>
              {/* loss */}
              {c.eval_loss > 0 && (
                <span style={{ fontSize: 14, color: '#D88A80', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  −{(c.eval_loss / 100).toFixed(1)}
                </span>
              )}
            </div>
          );
        })}
        {!loading && cards.length === 0 && (
          <div style={{ padding: '14px 10px', fontSize: 14, color: 'var(--muted)' }}>Нет карточек</div>
        )}
      </div>

      {/* Footer: build mini-course */}
      <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
        <button
          onClick={() => void buildMiniCourse()}
          disabled={buildingCourse}
          style={{
            width: '100%', height: 44, fontSize: 15, fontWeight: 600,
            background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)',
            color: 'var(--ivory)', cursor: 'pointer', fontFamily: 'inherit',
            borderRadius: 'var(--radius-btn)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {buildingCourse ? 'Собираем…' : 'Собрать мини-курс'}
        </button>
        {buildError && (
          <span style={{ display: 'block', marginTop: 6, fontSize: 13, color: '#E0574A' }}>{buildError}</span>
        )}
      </div>
    </div>
  );

  // ── Board content ─────────────────────────────────────────────────────────

  const boardContent = (
    <Board
      position={loading ? 'start' : (currentFen || 'start')}
      orientation={boardOrientation}
      allowDragging={!answered && !checking && !loading && !!card}
      onPieceDrop={card && !answered && !checking ? handlePieceDrop : undefined}
      squareStyles={squareStyles}
      squareRenderer={squareRenderer}
      arrows={arrows}
      cacheKey={`${boardOrientation}-${card?.id ?? 'none'}`}
    />
  );

  // ── Task panel ────────────────────────────────────────────────────────────

  const bestMoveSan = card ? uciToSan(card.fen_before, card.best_move) : '';

  const taskPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <span>Тренировка · Ошибки</span>
          {!loading && total > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.min(index + 1, total)} / {total}
              {session.xp > 0 && (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#81B64C', background: 'rgba(129,182,76,.14)', borderRadius: 6, padding: '2px 7px', fontVariantNumeric: 'tabular-nums' }}>
                  +{session.xp} XP
                </span>
              )}
            </span>
          )}
        </div>
        {/* Progress bar */}
        {!loading && total > 0 && (
          <div style={{ height: 4, borderRadius: 4, background: '#3A3835', marginTop: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#81B64C', borderRadius: 4,
              width: `${Math.max(2, Math.min(100, (index / total) * 100))}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}
        {/* Title */}
        {card && index < total && (
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
            {showAnswer ? 'Вот лучший ход' : 'Найди лучший ход'}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: '0 24px 20px' }}>
            <span style={{ fontSize: 15, color: 'var(--muted)' }}>Загрузка…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && cards.length === 0 && (
          <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--ivory)' }}>Всё готово на сегодня!</span>
            <span style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
              {filters.tag || filters.phase
                ? 'Нет карточек по выбранным фильтрам.'
                : 'Нет карточек для повторения. Проанализируй партии, чтобы добавить ошибки.'}
            </span>
            <Link href="/games/analyze" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 20px', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600, borderRadius: 'var(--radius-btn)', textDecoration: 'none' }}>
              Анализировать партии
            </Link>
          </div>
        )}

        {/* Session complete */}
        {!loading && cards.length > 0 && index >= cards.length && (
          <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--ivory)' }}>Всё готово на сегодня!</span>
            <span style={{ fontSize: 15, color: 'var(--muted)' }}>Повторено {cards.length} карточек</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[{ label: 'верно', value: session.correct, color: '#81B64C' },
                { label: 'ошибок', value: session.incorrect, color: '#E0574A' },
                { label: 'XP', value: `+${session.xp}`, color: 'var(--ivory)' }].map(s => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 20px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)' }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: s.color as string, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.label}</span>
                  </div>
              ))}
            </div>
            <button onClick={() => void loadCards()} style={{ alignSelf: 'flex-start', height: 44, padding: '0 20px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', fontSize: 15, cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}>
              Обновить
            </button>
          </div>
        )}

        {/* Active card */}
        {card && index < cards.length && (
          <>
            {/* Chips */}
            <div style={{ padding: '0 24px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ height: 28, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 8, background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', fontSize: 13, fontWeight: 500, color: 'var(--ivory)' }}>
                {TAG_LABEL[card.tag]}
              </span>
              <span style={{ height: 28, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 8, background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', fontSize: 13, fontWeight: 500, color: 'var(--ivory)' }}>
                {PHASE_LABEL[card.phase]}
              </span>
              {card.eval_loss > 0 && (
                <span style={{ height: 28, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 8, background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', fontSize: 13, fontWeight: 500, color: '#E59A8F', fontVariantNumeric: 'tabular-nums' }}>
                  −{(card.eval_loss / 100).toFixed(2)}
                </span>
              )}
            </div>

            {/* Game context block */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--hairline)', marginTop: 12 }}>
              {gameInfo ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                    Из твоей партии · против {gameInfo.opp_name} · {fmtDate(gameInfo.played_at)} · {TIME_CLASS_RU[gameInfo.time_class] ?? gameInfo.time_class}
                  </div>
                  <div style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5 }}>
                    Ты сыграл{' '}
                    <span style={{ background: 'rgba(255,255,255,.06)', borderRadius: 6, padding: '2px 7px', color: 'var(--ivory)', fontWeight: 500 }}>
                      {card.my_move}
                    </span>
                    {' '}и потерял{' '}
                    <span style={{ color: '#E59A8F', fontVariantNumeric: 'tabular-nums' }}>
                      {(card.eval_loss / 100).toFixed(1)} п.
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {boardOrientation === 'white' ? '♙ Вы играете белыми' : '♟ Вы играете чёрными'}
                  {TAG_RULE[card.tag] && !answered && (
                    <div style={{ marginTop: 8, fontSize: 14, color: 'var(--control)', lineHeight: 1.5 }}>
                      {TAG_RULE[card.tag]}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Checking indicator */}
            {checking && (
              <div style={{ padding: '0 24px 16px' }}>
                <span style={{ fontSize: 15, color: 'var(--muted)' }}>Проверяем…</span>
              </div>
            )}

            {/* Answer feedback */}
            {answered && (
              <div style={{ margin: '0 24px', borderRadius: 12, padding: '16px 18px', border: answered.correct ? '1px solid rgba(129,182,76,.32)' : '1px solid var(--hairline)', background: answered.correct ? 'rgba(129,182,76,.09)' : 'rgba(0,0,0,.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {answered.correct
                    ? <ClassIcon cls={answered.alternate ? 'good' : 'best'} size={28} />
                    : <ClassIcon cls={userMoveCls ?? 'blunder'} size={28} />
                  }
                  <b style={{ fontSize: 19, color: answered.correct ? '#81B64C' : '#E0574A' }}>
                    {answered.correct ? (answered.alternate ? 'Хороший ход!' : 'Верно! Лучший ход') : 'Не то'}
                    {answered.xpEarned > 0 && (
                      <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 10, color: 'var(--muted)' }}>
                        +{answered.xpEarned} XP
                      </span>
                    )}
                  </b>
                </div>
                {bestMoveSan && (
                  <p style={{ marginTop: 8, fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5 }}>
                    <span style={{ background: 'rgba(255,255,255,.06)', borderRadius: 6, padding: '2px 7px', color: '#81B64C', fontWeight: 500 }}>
                      {bestMoveSan}
                    </span>
                    {answered.alternate && ' — тоже хороший ход'}
                  </p>
                )}
                {/* Evals grid */}
                {(answered.evalMyMoveCp !== undefined || answered.evalBestCp !== undefined) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    <div style={{ background: 'rgba(0,0,0,.18)', borderRadius: 8, padding: '8px 12px' }}>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                        {answered.correct ? 'твой ход' : 'в партии'}
                      </span>
                      <b style={{ fontSize: 18, color: answered.correct ? '#81B64C' : '#E59A8F', fontVariantNumeric: 'tabular-nums' }}>
                        {answered.evalMyMoveCp !== undefined ? fmtEval(answered.evalMyMoveCp) : '—'}
                      </b>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,.18)', borderRadius: 8, padding: '8px 12px' }}>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>
                        {answered.correct ? 'в партии' : 'лучший ход'}
                      </span>
                      <b style={{ fontSize: 18, color: '#81B64C', fontVariantNumeric: 'tabular-nums' }}>
                        {answered.evalBestCp !== undefined ? fmtEval(answered.evalBestCp) : (card.eval_before !== null ? fmtEval(card.eval_before) : '—')}
                      </b>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mastery bar */}
            {answered && (
              <div style={{ padding: '20px 24px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Карточка выучена</span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ivory)' }}>
                    {card.mastery} / 5
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(lvl => (
                    <div key={lvl} style={{ height: 6, borderRadius: 3, background: lvl <= card.mastery ? '#81B64C' : '#3A3835' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Mark correct manually */}
            {answered && !answered.correct && (
              <div style={{ padding: '12px 24px 0' }}>
                <button
                  onClick={() => void handleCorrectManual()}
                  style={{ height: 36, padding: '0 14px', fontSize: 14, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}
                >
                  Мой ход тоже хороший
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: action buttons */}
      <div style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {card && index < cards.length && answered ? (
          <>
            {/* Primary: Next */}
            <button
              onClick={goNext}
              style={{
                height: 52, fontSize: 18, fontWeight: 700,
                background: '#81B64C',
                boxShadow: '0 4px 0 #5E8C35',
                color: '#fff', border: 'none', cursor: 'pointer',
                borderRadius: 'var(--radius-btn)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                fontFamily: 'inherit',
              }}
            >
              Дальше
              <span style={{ fontSize: 13, fontWeight: 600, background: 'rgba(0,0,0,.18)', borderRadius: 6, padding: '2px 7px' }}>
                Пробел
              </span>
            </button>
            {/* Secondary: 2-column */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => card && router.push(`/play?fen=${encodeURIComponent(card.fen_before)}&color=${card.fen_before.split(' ')[1] as 'w' | 'b'}&level=10&mode=free`)}
                style={{ height: 44, fontSize: 15, fontWeight: 600, background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', color: 'var(--ivory)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}
              >
                Сыграть отсюда
              </button>
              {card.game_id ? (
                <Link
                  href={gameInfo?.url || `/games/${card.game_id}`}
                  target={gameInfo?.url ? '_blank' : undefined}
                  style={{ height: 44, fontSize: 15, fontWeight: 600, background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', color: 'var(--ivory)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                >
                  Открыть партию
                </Link>
              ) : (
                <button disabled style={{ height: 44, fontSize: 15, fontWeight: 600, background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', color: 'var(--control)', cursor: 'default', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit', opacity: 0.5 }}>
                  Открыть партию
                </button>
              )}
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--control)' }}>
              ← → смотреть ходы · H подсказка · Пробел дальше
            </div>
          </>
        ) : card && index < cards.length ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setShowHint(true)}
                disabled={showHint}
                style={{ height: 44, fontSize: 15, fontWeight: 600, background: showHint ? 'var(--track)' : 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', color: showHint ? 'var(--control)' : 'var(--ivory)', cursor: showHint ? 'default' : 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <span>Подсказка</span>
                <span style={{ fontSize: 13, color: 'var(--control)' }}>H</span>
              </button>
              <button
                onClick={() => { setShowHint(true); setShowAnswer(true); }}
                disabled={showAnswer}
                style={{ height: 44, fontSize: 15, fontWeight: 600, background: showAnswer ? 'var(--track)' : 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', color: showAnswer ? 'var(--control)' : 'var(--ivory)', cursor: showAnswer ? 'default' : 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <span>Показать ответ</span>
                <span style={{ fontSize: 13, color: 'var(--control)' }}>A</span>
              </button>
              <button
                onClick={skipCard}
                style={{ height: 44, fontSize: 15, fontWeight: 600, background: 'var(--st-b0)', border: '1px solid rgba(255,255,255,.11)', color: 'var(--ivory)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <span>Пропустить</span>
                <span style={{ fontSize: 13, color: 'var(--control)' }}>S</span>
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--control)' }}>
              H подсказка · A ответ · S пропустить
            </div>
          </>
        ) : !loading && cards.length === 0 ? (
          <Link href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, fontSize: 15, fontWeight: 600, background: 'var(--st-b0)', border: '1px solid var(--hairline)', color: 'var(--muted)', borderRadius: 'var(--radius-btn)', textDecoration: 'none' }}>
            На главную
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <TrainerLayout
      sessionPanel={sessionPanel}
      topPlayer={topPlayer}
      evalBar={evalBar}
      boardContent={boardContent}
      bottomPlayer={bottomPlayer}
      taskPanel={taskPanel}
    />
  );
}
