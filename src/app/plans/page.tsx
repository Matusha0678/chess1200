'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { COURSE_FORMAT_SPEC } from '@/lib/course-format-spec';
import { nextReviewDate } from '@/lib/mistakes';
import type { LessonBlock, IdeaItem } from '@/types/courses';

interface IdeaCard {
  key: string;
  courseId: string;
  courseName: string;
  opening: string;
  lessonId: string;
  lessonTitle: string;
  item: IdeaItem;
  mastery: number;
  nextReview: string | null;
}

type Phase = 'loading' | 'list' | 'practice' | 'done' | 'empty';

const LABEL: React.CSSProperties = {
  margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
  color: 'var(--ivory)', textTransform: 'uppercase',
};

const SECTION_HEADER: React.CSSProperties = {
  borderTop: '2px solid var(--ivory)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  minHeight: 48,
};

export default function PlansPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [allCards, setAllCards] = useState<IdeaCard[]>([]);
  const [dueCards, setDueCards] = useState<IdeaCard[]>([]);
  const [practiceCards, setPracticeCards] = useState<IdeaCard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [openingFilter, setOpeningFilter] = useState('all');
  const [boardWidth, setBoardWidth] = useState(400);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const update = () => setBoardWidth(Math.min(400, window.innerWidth - 48));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    async function load() {
      const now = new Date().toISOString();

      const [
        { data: courses },
        { data: lessons },
        { data: progress },
      ] = await Promise.all([
        supabase.from('courses').select('id, name, opening'),
        supabase.from('course_lessons').select('id, course_id, title, blocks'),
        supabase.from('idea_progress').select('idea_key, mastery, next_review'),
      ]);

      const courseMap = new Map(
        (courses ?? []).map((c: { id: string; name: string; opening: string }) => [c.id, c]),
      );
      const progressMap = new Map(
        (progress ?? []).map((p: { idea_key: string; mastery: number; next_review: string }) =>
          [p.idea_key, p],
        ),
      );

      const cards: IdeaCard[] = [];

      for (const lesson of (lessons ?? [])) {
        const course = courseMap.get(lesson.course_id);
        if (!course) continue;
        const blocks = (lesson.blocks as LessonBlock[] | null) ?? [];
        let ideaIdx = 0;
        for (const block of blocks) {
          if (block.type !== 'idea') continue;
          for (const item of block.items) {
            const key = `${lesson.id}:idea:${ideaIdx++}`;
            const prog = progressMap.get(key);
            cards.push({
              key,
              courseId: lesson.course_id,
              courseName: (course as { name: string }).name,
              opening: (course as { opening: string }).opening ?? '',
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              item,
              mastery: prog?.mastery ?? 0,
              nextReview: prog?.next_review ?? null,
            });
          }
        }
      }

      setAllCards(cards);

      if (cards.length === 0) {
        setPhase('empty');
        return;
      }

      const due = cards.filter(c => !c.nextReview || c.nextReview <= now);
      setDueCards(due);
      setPhase('list');
    }

    load();
  }, []);

  const openings = [...new Set(allCards.map(c => c.opening).filter(Boolean))];

  const filteredDue = openingFilter === 'all'
    ? dueCards
    : dueCards.filter(c => c.opening === openingFilter);

  const currentCard = practiceCards[currentIdx] ?? null;

  const startPractice = useCallback(() => {
    const cards = openingFilter === 'all'
      ? dueCards
      : dueCards.filter(c => c.opening === openingFilter);
    if (cards.length === 0) return;
    setPracticeCards(cards);
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setPhase('practice');
  }, [openingFilter, dueCards]);

  const handleAnswer = useCallback(async (answer: string) => {
    if (!currentCard || selectedAnswer !== null) return;
    setSelectedAnswer(answer);

    const correct = answer === currentCard.item.answer;
    const newMastery = correct
      ? Math.min(5, currentCard.mastery + 1)
      : Math.max(0, currentCard.mastery - 1);
    const nextReview = nextReviewDate(newMastery);

    await supabase.from('idea_progress').upsert({
      idea_key: currentCard.key,
      mastery: newMastery,
      next_review: nextReview,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: 'idea_key' });
  }, [currentCard, selectedAnswer]);

  const handleNext = useCallback(() => {
    if (currentIdx + 1 >= practiceCards.length) {
      setPhase('done');
    } else {
      setCurrentIdx(prev => prev + 1);
      setSelectedAnswer(null);
    }
  }, [currentIdx, practiceCards.length]);

  const copySpec = useCallback(async () => {
    await navigator.clipboard.writeText(COURSE_FORMAT_SPEC);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ height: 32, width: 100, background: 'var(--surface)', marginBottom: 32 }} className="animate-pulse" />
        <div style={{ height: 400, background: 'var(--surface)' }} className="animate-pulse" />
      </div>
    );
  }

  // ── Empty: no courses with idea blocks ───────────────────────────────────────

  if (phase === 'empty') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <div style={SECTION_HEADER}>
          <h1 style={LABEL}>Планы</h1>
        </div>
        <div style={{ paddingTop: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ fontSize: 15, color: 'var(--ivory)', margin: 0, fontWeight: 600 }}>
            Нет идей в курсах
          </p>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            Добавь раздел <code style={{ fontSize: 13, color: 'var(--ivory)' }}>## Идея позиции</code> в любой курс.
            Скопируй инструкцию и попроси ИИ добавить раздел с блоками <code style={{ fontSize: 13, color: 'var(--ivory)' }}>idea</code>.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => void copySpec()}
              style={{
                height: 40, padding: '0 20px',
                background: 'var(--ivory)', color: 'var(--ink)',
                border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {copied ? 'Скопировано!' : 'Копировать инструкцию для ИИ'}
            </button>
            <Link
              href="/courses"
              style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 20px', border: '1px solid var(--hairline)', fontSize: 14, color: 'var(--muted)' }}
            >
              Курсы →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <div style={SECTION_HEADER}>
          <h1 style={LABEL}>Планы</h1>
        </div>
        <div style={{ paddingTop: 40, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
          <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--ivory)', margin: 0, letterSpacing: '-0.02em' }}>
            Готово!
          </p>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            {practiceCards.length === 1
              ? '1 идея проработана сегодня.'
              : `${practiceCards.length} идей проработано сегодня.`}
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Link
              href="/"
              style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}
            >
              На главную
            </Link>
            <button
              onClick={() => { setPhase('list'); }}
              style={{ height: 40, padding: '0 20px', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }}
            >
              Ещё раз
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── List ─────────────────────────────────────────────────────────────────────

  if (phase === 'list') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <div style={SECTION_HEADER}>
          <h1 style={LABEL}>Планы</h1>
        </div>

        {/* Opening filter */}
        {openings.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 16 }}>
            {['all', ...openings].map(op => (
              <button
                key={op}
                onClick={() => setOpeningFilter(op)}
                style={{
                  height: 32, padding: '0 14px',
                  background: openingFilter === op ? 'var(--ivory)' : 'transparent',
                  color: openingFilter === op ? 'var(--ink)' : 'var(--muted)',
                  border: openingFilter === op ? 'none' : '1px solid var(--hairline)',
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                {op === 'all' ? 'Все' : op}
              </button>
            ))}
          </div>
        )}

        <div style={{ paddingTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{
              fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
              fontWeight: 700, fontSize: 44, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              color: 'var(--ivory)',
            }}>
              {filteredDue.length}
            </span>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>
              {filteredDue.length === 0
                ? 'нет идей для повторения сегодня'
                : filteredDue.length === 1
                  ? 'идея на сегодня'
                  : filteredDue.length < 5
                    ? 'идеи на сегодня'
                    : 'идей на сегодня'}
            </span>
          </div>

          {filteredDue.length > 0 && (
            <button
              onClick={startPractice}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 48, padding: '0 24px',
                background: 'var(--ivory)', color: 'var(--ink)',
                border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Начать
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
            </button>
          )}
        </div>

        {filteredDue.length === 0 && allCards.length > 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 24 }}>
            Все идеи изучены — загляни завтра.
          </p>
        )}
      </div>
    );
  }

  // ── Practice ─────────────────────────────────────────────────────────────────

  if (phase === 'practice' && currentCard) {
    const optionKeys = Object.keys(currentCard.item.options).sort();
    const answered = selectedAnswer !== null;
    const isCorrect = selectedAnswer === currentCard.item.answer;
    const orientation: 'white' | 'black' = currentCard.item.fen.split(' ')[1] === 'b' ? 'black' : 'white';

    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={() => setPhase('list')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>
            Выход
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            {currentIdx + 1} / {practiceCards.length}
          </span>
        </div>

        {/* Meta */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
            {currentCard.courseName}
            {currentCard.opening ? ` · ${currentCard.opening}` : ''}
          </span>
        </div>

        {/* Board */}
        <div style={{ marginBottom: 20 }}>
          <Chessboard options={{
            position: currentCard.item.fen,
            boardOrientation: orientation,
            allowDragging: false,
            boardStyle: { width: boardWidth, height: boardWidth },
          }} />
        </div>

        {/* Question */}
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
          {currentCard.item.question}
        </p>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {optionKeys.map(k => {
            let bg = 'transparent';
            let border = '1px solid var(--control)';
            let color = 'var(--ivory)';

            if (answered) {
              if (k === currentCard.item.answer) {
                bg = 'rgba(242,239,231,0.08)';
                border = '1px solid var(--ivory)';
                color = 'var(--ivory)';
              } else if (k === selectedAnswer) {
                bg = 'rgba(100,50,50,0.12)';
                border = '1px solid #6B4040';
                color = 'var(--muted)';
              } else {
                color = 'var(--muted)';
                border = '1px solid var(--hairline)';
              }
            }

            return (
              <button
                key={k}
                onClick={() => void handleAnswer(k)}
                disabled={answered}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 16px', background: bg, border, color,
                  textAlign: 'left', fontSize: 14, lineHeight: 1.4, cursor: answered ? 'default' : 'pointer',
                  transition: 'border-color 0.1s',
                }}
              >
                <span style={{ fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{k}</span>
                <span>{currentCard.item.options[k]}</span>
              </button>
            );
          })}
        </div>

        {/* Result + Why */}
        {answered && (
          <div style={{
            padding: '14px 16px', marginBottom: 20,
            background: isCorrect ? 'rgba(242,239,231,0.06)' : 'rgba(100,50,50,0.1)',
            border: `1px solid ${isCorrect ? 'var(--control)' : '#6B4040'}`,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)', margin: '0 0 8px 0' }}>
              {isCorrect ? '✓ Верно!' : `✗ Неверно — правильный ответ: ${currentCard.item.answer}`}
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              {currentCard.item.why}
            </p>
          </div>
        )}

        {/* Next button */}
        {answered && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleNext}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 44, padding: '0 24px',
                background: 'var(--ivory)', color: 'var(--ink)',
                border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {currentIdx + 1 >= practiceCards.length ? 'Завершить' : 'Следующая'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
