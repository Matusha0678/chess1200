'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import type {
  Course,
  CourseLesson,
  LessonLine,
  LessonQuestion,
  LessonProgress,
  CourseLessonMove,
} from '@/types/courses';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

type ActiveTab = 'moves' | 'summary' | 'plan' | 'mistakes' | 'trap' | 'questions';

interface Props {
  params: Promise<{ courseId: string; lessonId: string }>;
}

function QuestionBlock({ q, idx }: { q: LessonQuestion; idx: number }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>Задача {idx + 1}</span>
      <code style={{ fontSize: 11, color: 'var(--control)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{q.fen}</code>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ivory)', fontWeight: 500 }}>{q.question}</p>
      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          style={{
            alignSelf: 'flex-start', height: 32, padding: '0 14px',
            border: '1px solid var(--control)', background: 'transparent',
            color: 'var(--muted)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Показать ответ
        </button>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {q.answer}
        </p>
      )}
    </div>
  );
}

function MoveListPanel({
  moves,
  currentIndex,
  onMoveClick,
}: {
  moves: CourseLessonMove[];
  currentIndex: number;
  onMoveClick: (idx: number) => void;
}) {
  if (moves.length === 0) {
    return <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Нет ходов</p>;
  }

  const pairs = Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => ({
    w: moves[i * 2],
    b: moves[i * 2 + 1],
    wIdx: i * 2,
    bIdx: i * 2 + 1,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {pairs.map(({ w, b, wIdx, bIdx }) => (
        <div
          key={wIdx}
          style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 1fr',
            gap: '0 6px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {Math.floor(wIdx / 2) + 1}.
          </span>
          <button
            onClick={() => onMoveClick(wIdx + 1)}
            style={{
              padding: '3px 6px', fontSize: 13, fontFamily: 'monospace',
              textAlign: 'left', cursor: 'pointer', border: 'none',
              background: wIdx + 1 === currentIndex ? 'var(--track)' : 'transparent',
              color: wIdx < currentIndex ? 'var(--ivory)' : 'var(--muted)',
              fontWeight: wIdx + 1 === currentIndex ? 700 : 400,
              borderRadius: 2,
            }}
          >
            {w.san}
          </button>
          {b && (
            <button
              onClick={() => onMoveClick(bIdx + 1)}
              style={{
                padding: '3px 6px', fontSize: 13, fontFamily: 'monospace',
                textAlign: 'left', cursor: 'pointer', border: 'none',
                background: bIdx + 1 === currentIndex ? 'var(--track)' : 'transparent',
                color: bIdx < currentIndex ? 'var(--ivory)' : 'var(--muted)',
                fontWeight: bIdx + 1 === currentIndex ? 700 : 400,
                borderRadius: 2,
              }}
            >
              {b.san}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function LessonViewerPage({ params }: Props) {
  const { courseId, lessonId } = use(params);
  const { boardTheme, customPieces, showNotation, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();

  const [course, setCourse] = useState<Course | null>(null);
  const [lesson, setLesson] = useState<CourseLesson | null>(null);
  const [line, setLine] = useState<LessonLine | null>(null);
  const [questions, setQuestions] = useState<LessonQuestion[]>([]);
  const [prevLesson, setPrevLesson] = useState<CourseLesson | null>(null);
  const [nextLesson, setNextLesson] = useState<CourseLesson | null>(null);
  const [loading, setLoading] = useState(true);

  // Viewer state
  const [moveIndex, setMoveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('moves');

  const moves: CourseLessonMove[] = (line?.moves as CourseLessonMove[]) ?? [];

  // Derived FEN
  const currentFen = moveIndex === 0
    ? INITIAL_FEN
    : (moves[moveIndex - 1]?.fen ?? INITIAL_FEN);

  // Last move highlights
  const squareStyles: Record<string, React.CSSProperties> = (() => {
    if (moveIndex === 0) return {};
    const m = moves[moveIndex - 1];
    if (!m) return {};
    return {
      [m.from]: { background: 'rgba(255,255,255,0.12)' },
      [m.to]: { background: 'rgba(255,255,255,0.25)' },
    };
  })();

  // Arrows for current move - typed as react-chessboard Arrow[]
  const currentArrows: { startSquare: string; endSquare: string; color: string }[] = (() => {
    if (moveIndex === 0) return [];
    const m = moves[moveIndex - 1];
    if (!m?.arrows) return [];
    return m.arrows.map(a => ({ startSquare: a.from, endSquare: a.to, color: 'rgba(255, 176, 32, 0.85)' }));
  })();

  // Current comment
  const currentComment = moveIndex > 0 ? (moves[moveIndex - 1]?.comment ?? null) : null;

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [{ data: courseData }, { data: lessonData }] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('course_lessons').select('*').eq('id', lessonId).single(),
      ]);

      if (!courseData || !lessonData) { setLoading(false); return; }
      setCourse(courseData as Course);
      const lessonObj = lessonData as CourseLesson;
      setLesson(lessonObj);

      // Fetch all lessons for prev/next
      const { data: allLessons } = await supabase
        .from('course_lessons')
        .select('id, lesson_order, title, course_id, summary, plan, mistakes, trap, created_at')
        .eq('course_id', courseId)
        .order('lesson_order', { ascending: true });

      if (allLessons) {
        const idx = allLessons.findIndex((l: { id: string }) => l.id === lessonId);
        if (idx > 0) setPrevLesson(allLessons[idx - 1] as CourseLesson);
        if (idx < allLessons.length - 1) setNextLesson(allLessons[idx + 1] as CourseLesson);
      }

      // Fetch line + questions in parallel
      const [{ data: linesData }, { data: questionsData }] = await Promise.all([
        supabase.from('lesson_lines').select('*').eq('lesson_id', lessonId).order('line_order', { ascending: true }).limit(1),
        supabase.from('lesson_questions').select('*').eq('lesson_id', lessonId).order('question_order', { ascending: true }),
      ]);

      if (linesData && linesData.length > 0) setLine(linesData[0] as LessonLine);
      setQuestions((questionsData ?? []) as LessonQuestion[]);

      setLoading(false);
    }
    load();
  }, [courseId, lessonId]);

  // Keyboard navigation
  const goToMove = useCallback((idx: number) => {
    setMoveIndex(Math.max(0, Math.min(idx, moves.length)));
  }, [moves.length]);

  const handlePrev = useCallback(() => goToMove(moveIndex - 1), [goToMove, moveIndex]);
  const handleNext = useCallback(() => goToMove(moveIndex + 1), [goToMove, moveIndex]);

  const handleNextRef = useRef(handleNext);
  const handlePrevRef = useRef(handlePrev);
  useEffect(() => { handleNextRef.current = handleNext; }, [handleNext]);
  useEffect(() => { handlePrevRef.current = handlePrev; }, [handlePrev]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNextRef.current(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); handlePrevRef.current(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) {
    return (
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ height: 14, width: 80, background: 'var(--track)' }} />
          <div style={{ height: 40, width: '50%', background: 'var(--track)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>
            <div style={{ aspectRatio: '1', background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
            <div style={{ height: 400, background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
          </div>
        </div>
      </main>
    );
  }

  if (!course || !lesson) {
    return (
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <Link href={`/courses/${courseId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>← Курс</Link>
        <p style={{ color: 'var(--muted)', marginTop: 32 }}>Урок не найден.</p>
      </main>
    );
  }

  const boardOrientation = course.color === 'black' ? 'black' : 'white';
  const boardKey = `${boardThemeId}-${pieceStyleId}-${boardOrientation}`;

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'moves', label: 'Ходы' },
    { id: 'summary', label: 'Итог' },
    { id: 'plan', label: 'План' },
    { id: 'mistakes', label: 'Ошибки' },
    ...(lesson.trap ? [{ id: 'trap' as ActiveTab, label: 'Ловушка' }] : []),
    ...(questions.length > 0 ? [{ id: 'questions' as ActiveTab, label: `Задачи (${questions.length})` }] : []),
  ];

  return (
    <main style={{
      maxWidth: 1400, margin: '0 auto',
      padding: '32px 48px 80px',
      display: 'flex', flexDirection: 'column', gap: 32,
      boxSizing: 'border-box',
    }}>
      {/* Breadcrumb */}
      <Link
        href={`/courses/${courseId}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, color: 'var(--muted)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        {course.name}
      </Link>

      {/* 2-column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gap: 32,
        alignItems: 'start',
      }}>
        {/* LEFT — board */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Board */}
          <div style={{
            width: '100%',
            maxWidth: 560,
            aspectRatio: '1',
            border: '1px solid var(--board-border)',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <Chessboard
              key={boardKey}
              options={{
                position: currentFen,
                boardOrientation,
                allowDragging: false,
                squareStyles,
                arrows: currentArrows,
                boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
                darkSquareStyle: { backgroundColor: boardTheme.dark },
                lightSquareStyle: { backgroundColor: boardTheme.light },
                pieces: customPieces,
                showNotation,
                animationDurationInMs: animationMs,
              }}
            />
          </div>

          {/* Comment box */}
          <div style={{
            minHeight: 44,
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            fontSize: 14,
            color: currentComment ? 'var(--ivory)' : 'var(--muted)',
            lineHeight: 1.5,
          }}>
            {currentComment ?? 'Комментарий к ходу'}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handlePrev}
              disabled={moveIndex === 0}
              style={{
                height: 40, padding: '0 16px',
                border: '1px solid var(--control)', background: 'transparent',
                color: 'var(--ivory)', fontSize: 13, cursor: 'pointer',
                opacity: moveIndex === 0 ? 0.4 : 1,
              }}
            >
              ← Пред.
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)', flex: 1, textAlign: 'center' }}>
              {moveIndex} / {moves.length}
            </span>
            <button
              onClick={handleNext}
              disabled={moveIndex >= moves.length}
              style={{
                height: 40, padding: '0 16px',
                border: '1px solid var(--control)', background: 'transparent',
                color: 'var(--ivory)', fontSize: 13, cursor: 'pointer',
                opacity: moveIndex >= moves.length ? 0.4 : 1,
              }}
            >
              След. →
            </button>
          </div>
        </div>

        {/* RIGHT — panel */}
        <div style={{
          border: '1px solid var(--hairline)',
          background: 'var(--surface)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Lesson title */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
            <h2 style={{ ...HEADING, margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
              {lesson.title}
            </h2>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--hairline)',
            overflowX: 'auto',
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 14px',
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--ivory)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--ivory)' : 'var(--muted)',
                  fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
                  cursor: 'pointer', flexShrink: 0,
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: 20, overflowY: 'auto', maxHeight: 480 }}>
            {activeTab === 'moves' && (
              <MoveListPanel
                moves={moves}
                currentIndex={moveIndex}
                onMoveClick={goToMove}
              />
            )}
            {activeTab === 'summary' && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {lesson.summary || 'Нет данных'}
              </p>
            )}
            {activeTab === 'plan' && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {lesson.plan || 'Нет данных'}
              </p>
            )}
            {activeTab === 'mistakes' && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {lesson.mistakes || 'Нет данных'}
              </p>
            )}
            {activeTab === 'trap' && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {lesson.trap || 'Нет данных'}
              </p>
            )}
            {activeTab === 'questions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {questions.map((q, i) => <QuestionBlock key={q.id} q={q} idx={i} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
        paddingTop: 24, borderTop: '1px solid var(--hairline)',
      }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          {prevLesson && (
            <Link
              href={`/courses/${courseId}/${prevLesson.id}`}
              style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, color: 'var(--muted)' }}
            >
              <span style={{ fontSize: 11, letterSpacing: '0.08em' }}>← ПРЕДЫДУЩИЙ</span>
              <span style={{ fontSize: 14, color: 'var(--ivory)' }}>{prevLesson.title}</span>
            </Link>
          )}
        </div>

        <Link
          href={`/courses/${courseId}/${lessonId}/practice`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            height: 48, padding: '0 28px',
            background: 'var(--ivory)', color: 'var(--ink)',
            fontSize: 15, fontWeight: 600,
            flexShrink: 0,
          }}
        >
          Тренировать
        </Link>

        <div style={{ flex: 1, minWidth: 120, display: 'flex', justifyContent: 'flex-end' }}>
          {nextLesson && (
            <Link
              href={`/courses/${courseId}/${nextLesson.id}`}
              style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, color: 'var(--muted)', textAlign: 'right' }}
            >
              <span style={{ fontSize: 11, letterSpacing: '0.08em' }}>СЛЕДУЮЩИЙ →</span>
              <span style={{ fontSize: 14, color: 'var(--ivory)' }}>{nextLesson.title}</span>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
