'use client';

import { useState, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import Link from 'next/link';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { supabase } from '@/lib/supabase';
import type { CourseLesson, CourseLessonMove, TestQuestion, WrongRecord } from '@/types/courses';

// ── Constants ──────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

const PRIMARY: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 40,
  padding: '0 20px',
  background: 'var(--ivory)',
  color: 'var(--ink)',
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'inherit',
  textDecoration: 'none',
};

const SECONDARY: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 40,
  padding: '0 20px',
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--hairline)',
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'inherit',
};

const PRIMARY_LINK: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 40,
  padding: '0 20px',
  background: 'var(--ivory)',
  color: 'var(--ink)',
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  textDecoration: 'none',
};

// ── Question builder ───────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildTestQuestions(
  lesson?: CourseLesson,
  moves?: CourseLessonMove[],
): TestQuestion[] {
  const pool: TestQuestion[] = [];

  if (lesson?.blocks) {
    // Quiz blocks — type: 'choice'
    for (const block of lesson.blocks) {
      if (block.type === 'quiz') {
        for (const item of block.items) {
          if (item.type === 'choice') {
            const opts = Object.values(item.options);
            const correctVal = item.options[item.answer];
            const answerIdx = opts.indexOf(correctVal);
            if (answerIdx !== -1) {
              pool.push({
                question: item.question,
                options: opts,
                answerIdx,
                why: item.why,
              });
            }
          }
        }
      }
      // Idea blocks
      if (block.type === 'idea') {
        for (const item of block.items) {
          const opts = Object.values(item.options);
          const correctVal = item.options[item.answer];
          const answerIdx = opts.indexOf(correctVal);
          if (answerIdx !== -1) {
            pool.push({
              question: item.question,
              options: opts,
              answerIdx,
              why: item.why,
              fen: item.fen,
            });
          }
        }
      }
    }
  }

  // Auto-questions from annotated moves
  if (moves && moves.length >= 1) {
    const annotated = moves
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => (m.nags?.length ?? 0) > 0 || (m.arrows?.length ?? 0) > 0);

    const candidates = annotated.map(({ i }) => i);

    // If fewer than 2 annotated moves and total moves >= 4, include random moves too
    if (candidates.length < 2 && moves.length >= 4) {
      const annotatedSet = new Set(candidates);
      const extra = moves
        .map((_, i) => i)
        .filter(i => !annotatedSet.has(i));
      const shuffledExtra = shuffle(extra);
      // Add enough to have ~4 candidates total
      for (const idx of shuffledExtra) {
        if (candidates.length >= 4) break;
        candidates.push(idx);
      }
    }

    for (const i of candidates) {
      const m = moves[i];
      if (!m) continue;
      const prevFen = i === 0 ? INITIAL_FEN : moves[i - 1].fen;
      try {
        const chess = new Chess(prevFen);
        const legal = chess.moves({ verbose: true });
        const otherMoves = legal.filter(lm => lm.san !== m.san);
        if (otherMoves.length < 3) continue;

        // Pick 3 random different moves
        const shuffledOthers = shuffle(otherMoves);
        const distractors = shuffledOthers.slice(0, 3).map(lm => lm.san);
        const allOptions = shuffle([m.san, ...distractors]);
        const answerIdx = allOptions.indexOf(m.san);

        const colorWord = m.color === 'w' ? 'белых' : 'чёрных';
        pool.push({
          question: `Какой ход здесь у ${colorWord}?`,
          options: allOptions,
          answerIdx,
          fen: prevFen,
        });
      } catch {
        // skip bad FEN
      }
    }
  }

  return shuffle(pool).slice(0, 10);
}

// ── Overlay wrapper ────────────────────────────────────────────────────────────

function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(10,10,8,0.82)',
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px 60px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          padding: 28,
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
            color: 'var(--ivory)',
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--hairline)',
              color: 'var(--muted)',
              fontSize: 16,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface LessonTestProps {
  lesson?: CourseLesson;
  moves?: CourseLessonMove[];
  lessonId?: string;
  courseId: string;
  nextLesson?: { id: string; title: string } | null;
  title?: string;
  forcedQuestions?: TestQuestion[];
  extraQuestions?: TestQuestion[];
  onClose: () => void;
  onPassed?: () => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function LessonTest({
  lesson,
  moves,
  lessonId,
  courseId,
  nextLesson,
  title,
  forcedQuestions,
  extraQuestions,
  onClose,
  onPassed,
}: LessonTestProps) {
  const { boardTheme } = useBoardTheme();

  const makeQuestions = useCallback(() => {
    if (forcedQuestions) return forcedQuestions;
    const base = buildTestQuestions(lesson, moves) ?? [];
    if (extraQuestions?.length) return shuffle([...base, ...extraQuestions]);
    return base;
  }, [forcedQuestions, extraQuestions, lesson, moves]);

  const [questions, setQuestions] = useState<TestQuestion[]>(() => makeQuestions());
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    Array(makeQuestions().length).fill(null)
  );
  const [phase, setPhase] = useState<'quiz' | 'done'>('quiz');

  const q = questions[qIdx];
  const answered = answers[qIdx] !== null;

  // ── select ──────────────────────────────────────────────────────────────────

  function select(optIdx: number) {
    if (answers[qIdx] !== null) return;
    setAnswers(prev => {
      const next = [...prev];
      next[qIdx] = optIdx;
      return next;
    });
  }

  // ── next ────────────────────────────────────────────────────────────────────

  function next() {
    if (qIdx === questions.length - 1) {
      // Save and finish
      const finalScore = answers.filter((a, i) => a !== null && a === questions[i]?.answerIdx).length;
      const finalPct = questions.length > 0 ? Math.round((finalScore / questions.length) * 100) : 0;
      const wrongRecs: WrongRecord[] = questions
        .map((q, i) => {
          const ua = answers[i];
          if (ua !== null && ua !== q.answerIdx) {
            return { ...q, userAnswerIdx: ua };
          }
          return null;
        })
        .filter((x): x is WrongRecord => x !== null);

      if (lessonId) {
        supabase
          .from('lesson_tests')
          .insert({ lesson_id: lessonId, score: finalScore, max: questions.length, wrong: wrongRecs })
          .then(async () => {
            if (finalPct >= 80) {
              await supabase
                .from('lesson_progress')
                .upsert(
                  {
                    lesson_id: lessonId,
                    completed: true,
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'lesson_id' },
                );
              onPassed?.();
            }
          });
      }

      setPhase('done');
    } else {
      setQIdx(i => i + 1);
    }
  }

  // ── restart ─────────────────────────────────────────────────────────────────

  function restart() {
    const newQ = makeQuestions();
    setQuestions(newQ);
    setAnswers(Array(newQ.length).fill(null));
    setQIdx(0);
    setPhase('quiz');
  }

  // ── Derived for done phase ───────────────────────────────────────────────────

  const finalScore = answers.filter((a, i) => a !== null && a === questions[i]?.answerIdx).length;
  const finalPct = questions.length > 0 ? Math.round((finalScore / questions.length) * 100) : 0;
  const passed = finalPct >= 80;

  // ── Overlay title ────────────────────────────────────────────────────────────

  const overlayTitle = title ?? lesson?.title ?? 'Тест';

  // ── Empty questions case ─────────────────────────────────────────────────────

  if (questions.length === 0) {
    return (
      <Overlay title={overlayTitle} onClose={onClose}>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--muted)' }}>
          Нет вопросов для теста.
        </p>
        <button onClick={onClose} style={SECONDARY}>Закрыть</button>
      </Overlay>
    );
  }

  // ── Done phase ───────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <Overlay title={overlayTitle} onClose={onClose}>
        {/* Score */}
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1,
            color: passed ? 'rgba(130,220,100,0.95)' : 'var(--ivory)',
            fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
            letterSpacing: '-0.03em',
          }}>
            {finalPct}%
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
            {finalScore} / {questions.length} правильно
          </div>
        </div>

        {/* Result box */}
        {lessonId && (
          <div style={{
            padding: '12px 16px',
            marginBottom: 20,
            border: `1px solid ${passed ? 'rgba(80,200,80,0.35)' : 'rgba(220,60,60,0.35)'}`,
            background: passed ? 'rgba(80,200,80,0.06)' : 'rgba(220,60,60,0.06)',
            fontSize: 13,
            color: passed ? 'rgba(130,220,100,0.95)' : 'rgba(220,100,80,0.9)',
          }}>
            {passed ? '✓ Урок пройден' : 'Нужно 80%+ для прохождения'}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onClose} style={SECONDARY}>Закрыть</button>
          <button onClick={restart} style={SECONDARY}>Повторить</button>
          {passed && nextLesson && lessonId && (
            <Link
              href={`/courses/${courseId}/${nextLesson.id}`}
              onClick={onClose}
              style={PRIMARY_LINK}
            >
              {nextLesson.title} →
            </Link>
          )}
        </div>
      </Overlay>
    );
  }

  // ── Quiz phase ───────────────────────────────────────────────────────────────

  const total = questions.length;
  const progressPct = total > 0 ? (qIdx / total) * 100 : 0;
  const isLast = qIdx === questions.length - 1;

  return (
    <Overlay title={overlayTitle} onClose={onClose}>
      {/* Progress */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qIdx + 1} / {total}</span>
        </div>
        <div style={{ height: 2, background: 'var(--track)', width: '100%' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: 'var(--ivory)',
            transition: 'width 0.2s ease',
          }} />
        </div>
      </div>

      {/* Board */}
      {q?.fen && (
        <div style={{ maxWidth: 260, aspectRatio: '1', margin: '0 auto 20px', border: '1px solid var(--hairline)' }}>
          <Chessboard
            options={{
              position: q.fen,
              boardOrientation: 'white',
              allowDragging: false,
              boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
              darkSquareStyle: { backgroundColor: boardTheme.dark },
              lightSquareStyle: { backgroundColor: boardTheme.light },
              showNotation: false,
              animationDurationInMs: 0,
              showAnimations: false,
            }}
          />
        </div>
      )}

      {/* Question */}
      <p style={{
        margin: '0 0 16px',
        fontSize: 16,
        fontWeight: 700,
        color: 'var(--ivory)',
        lineHeight: 1.4,
        fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
      }}>
        {q?.question}
      </p>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {(q?.options ?? []).map((opt, oi) => {
          const isCorrectOpt = oi === q?.answerIdx;
          const isSelected = answers[qIdx] === oi;

          let borderColor = 'var(--hairline)';
          let bg = 'transparent';
          let color = 'var(--muted)';

          if (answered) {
            if (isCorrectOpt) {
              borderColor = 'rgba(80,200,80,0.6)';
              bg = 'rgba(80,200,80,0.08)';
              color = 'rgba(130,220,100,0.95)';
            } else if (isSelected) {
              borderColor = 'rgba(220,60,60,0.5)';
              bg = 'rgba(220,60,60,0.06)';
              color = 'rgba(220,100,80,0.9)';
            }
          }

          return (
            <button
              key={oi}
              onClick={() => select(oi)}
              disabled={answered}
              style={{
                textAlign: 'left',
                padding: '9px 12px',
                border: `1px solid ${borderColor}`,
                background: bg,
                color,
                fontSize: 13,
                fontFamily: 'inherit',
                cursor: answered ? 'default' : 'pointer',
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontWeight: 700, marginRight: 8 }}>{OPTION_LABELS[oi]}.</span>
              {opt}
            </button>
          );
        })}
      </div>

      {/* Why */}
      {answered && q?.why && (
        <p style={{
          margin: '0 0 16px',
          fontSize: 13,
          color: 'var(--muted)',
          lineHeight: 1.6,
          borderLeft: '2px solid var(--hairline)',
          paddingLeft: 12,
        }}>
          {q.why}
        </p>
      )}

      {/* Next button */}
      {answered && (
        <button onClick={next} style={PRIMARY}>
          {isLast ? 'Завершить тест' : 'Следующий →'}
        </button>
      )}
    </Overlay>
  );
}
