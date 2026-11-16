'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
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

interface AnswerState {
  correct: boolean;
  alternate: boolean;
  userSan: string;
  xpEarned: number;
}

interface Filters {
  tag: MistakeTag | '';
  phase: GamePhase | '';
}

export default function MistakesPage() {
  const [cards, setCards] = useState<MistakeCard[]>([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<AnswerState | null>(null);
  const [filters, setFilters] = useState<Filters>({ tag: '', phase: '' });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [currentFen, setCurrentFen] = useState<string>('');

  const { boardTheme, customPieces, showNotation: notationEnabled, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();
  const { startAnalysis, stopAnalysis, isReady } = useStockfish();
  const lastEvalRef = useRef<number>(0);

  useEffect(() => {
    void loadCards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

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

  const card = cards[index] ?? null;

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!card || answered || checking) return false;
    if (!targetSquare) return false;

    // Validate move
    const chess = new Chess(card.fen_before);
    let moveResult;
    try {
      moveResult = chess.move({ from: sourceSquare as Square, to: targetSquare as Square });
    } catch {
      return false;
    }
    if (!moveResult) return false;

    const userSan = moveResult.san;
    const userUci = sourceSquare + targetSquare + (moveResult.promotion ?? '');
    const newFen = chess.fen();
    setCurrentFen(newFen);

    // Check if exact best move
    if (userUci === card.best_move) {
      void handleCorrect(userSan, false);
      return true;
    }

    // Run Stockfish analysis to check close-enough
    setChecking(true);
    lastEvalRef.current = 0;

    if (!isReady) {
      void handleWrong(userSan);
      return true;
    }

    startAnalysis(newFen, (info) => {
      if (info.cp !== undefined) lastEvalRef.current = info.cp;
    });

    setTimeout(() => {
      stopAnalysis();
      setChecking(false);

      const userColor = card.fen_before.split(' ')[1] as 'w' | 'b';
      const evalLoss = userColor === 'w'
        ? (card.eval_before ?? 0) - lastEvalRef.current
        : lastEvalRef.current - (card.eval_before ?? 0);

      if (evalLoss <= 50) {
        void handleCorrect(userSan, true);
      } else {
        void handleWrong(userSan);
      }
    }, 800);

    return true;
  }

  async function handleCorrect(userSan: string, alternate: boolean) {
    if (!card) return;
    const xp = alternate ? 5 : 10;
    setAnswered({ correct: true, alternate, userSan, xpEarned: xp });
    await updateCard(card, true);
    await addXp(xp);
  }

  async function handleWrong(userSan: string) {
    if (!card) return;
    setAnswered({ correct: false, alternate: false, userSan, xpEarned: 0 });
    await updateCard(card, false);
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
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-pulse">
          <div style={{ height: 60, width: 220, background: 'var(--surface)' }} />
          <div style={{ height: 480, background: 'var(--surface)' }} />
        </div>
      </main>
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

  const boardKey = `${boardThemeId}-${pieceStyleId}-${boardOrientation}-${card?.id ?? 'none'}`;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
          <h1 style={{ ...HEADING, margin: 0, fontSize: 48, fontWeight: 700, lineHeight: 0.92, letterSpacing: '-0.02em' }}>
            Ошибки
          </h1>
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
    </main>
  );
}
