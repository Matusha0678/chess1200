'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ChessBoardWrapper from '@/components/ChessBoardWrapper';
import type {
  Course,
  CourseLesson,
  LessonLine,
  LessonProgress,
  CourseLessonMove,
} from '@/types/courses';
import type { ChessMove } from '@/types/openings';

interface Props {
  params: Promise<{ courseId: string; lessonId: string }>;
}

function MoveListPanel({ moves, currentIndex }: { moves: string[]; currentIndex: number }) {
  if (moves.length === 0) {
    return <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ходы пока не сделаны</span>;
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
          style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: '0 6px', alignItems: 'center' }}
        >
          <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {Math.floor(wIdx / 2) + 1}.
          </span>
          <span style={{
            padding: '3px 6px', fontSize: 13, fontFamily: 'monospace',
            background: wIdx + 1 === currentIndex ? 'var(--track)' : 'transparent',
            color: wIdx < currentIndex ? 'var(--ivory)' : 'var(--muted)',
            fontWeight: wIdx + 1 === currentIndex ? 700 : 400,
            borderRadius: 2,
          }}>
            {w ?? ''}
          </span>
          {b !== undefined && (
            <span style={{
              padding: '3px 6px', fontSize: 13, fontFamily: 'monospace',
              background: bIdx + 1 === currentIndex ? 'var(--track)' : 'transparent',
              color: bIdx < currentIndex ? 'var(--ivory)' : 'var(--muted)',
              fontWeight: bIdx + 1 === currentIndex ? 700 : 400,
              borderRadius: 2,
            }}>
              {b}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function LessonPracticePage({ params }: Props) {
  const { courseId, lessonId } = use(params);

  const [course, setCourse] = useState<Course | null>(null);
  const [lesson, setLesson] = useState<CourseLesson | null>(null);
  const [line, setLine] = useState<LessonLine | null>(null);
  const [existingProgress, setExistingProgress] = useState<LessonProgress | null>(null);
  const [nextLesson, setNextLesson] = useState<CourseLesson | null>(null);
  const [loading, setLoading] = useState(true);

  // Practice state
  const [boardKey, setBoardKey] = useState(0);
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);
  const [currentMoveIdx, setCurrentMoveIdx] = useState(0);
  const [currentComment, setCurrentComment] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [guessCorrect, setGuessCorrect] = useState(0);
  const [guessTotal, setGuessTotal] = useState(0);
  const [boardStatus, setBoardStatus] = useState<{
    feedback: 'correct' | 'wrong' | null;
    isPlayerTurn: boolean;
    isComplete: boolean;
    reviewsRemaining: number;
  }>({ feedback: null, isPlayerTurn: false, isComplete: false, reviewsRemaining: 0 });

  const lessonMoves = (line?.moves as CourseLessonMove[]) ?? [];

  // Convert CourseLessonMove[] to ChessMove[] for ChessBoardWrapper
  const chessMoves: ChessMove[] = lessonMoves.map(m => ({
    san: m.san,
    from: m.from,
    to: m.to,
    fen: m.fen,
    color: m.color,
  }));

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [{ data: courseData }, { data: lessonData }] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('course_lessons').select('*').eq('id', lessonId).single(),
      ]);

      if (!courseData || !lessonData) { setLoading(false); return; }
      setCourse(courseData as Course);
      setLesson(lessonData as CourseLesson);

      // Fetch all lessons for next lesson
      const { data: allLessons } = await supabase
        .from('course_lessons')
        .select('id, lesson_order, title, course_id, summary, plan, mistakes, trap, created_at')
        .eq('course_id', courseId)
        .order('lesson_order', { ascending: true });

      if (allLessons) {
        const idx = allLessons.findIndex((l: { id: string }) => l.id === lessonId);
        if (idx < allLessons.length - 1) setNextLesson(allLessons[idx + 1] as CourseLesson);
      }

      const [{ data: linesData }, { data: progressData }] = await Promise.all([
        supabase.from('lesson_lines').select('*').eq('lesson_id', lessonId).order('line_order').limit(1),
        supabase.from('lesson_progress').select('*').eq('lesson_id', lessonId).maybeSingle(),
      ]);

      if (linesData && linesData.length > 0) setLine(linesData[0] as LessonLine);
      if (progressData) setExistingProgress(progressData as LessonProgress);

      setLoading(false);
    }
    load();
  }, [courseId, lessonId]);

  const handleMovesChange = useCallback((moves: string[], moveIndex: number) => {
    setPlayedMoves(moves);
    setCurrentMoveIdx(moveIndex);
    // Update comment from lesson line
    if (moveIndex > 0 && lessonMoves[moveIndex - 1]?.comment) {
      setCurrentComment(lessonMoves[moveIndex - 1].comment);
    } else {
      setCurrentComment(null);
    }
  }, [lessonMoves]);

  const handleComplete = useCallback(async (correct: boolean, hadMistakes: boolean) => {
    if (!correct) return;

    const newCorrect = !hadMistakes ? (existingProgress?.guess_correct ?? 0) + 1 : (existingProgress?.guess_correct ?? 0);
    const newTotal = (existingProgress?.guess_total ?? 0) + 1;
    setGuessCorrect(newCorrect);
    setGuessTotal(newTotal);
    setCompleted(true);

    const now = new Date().toISOString();
    const progressPayload = {
      lesson_id: lessonId,
      completed: true,
      guess_correct: newCorrect,
      guess_total: newTotal,
      completed_at: now,
      updated_at: now,
    };

    if (existingProgress) {
      await supabase.from('lesson_progress').update(progressPayload).eq('id', existingProgress.id);
    } else {
      await supabase.from('lesson_progress').insert(progressPayload);
    }
  }, [existingProgress, lessonId]);

  function handleRepeat() {
    setCompleted(false);
    setPlayedMoves([]);
    setCurrentMoveIdx(0);
    setCurrentComment(null);
    setBoardKey(k => k + 1);
  }

  const boardSizeVar = 'min(calc(100vh - 220px), calc(100vw - 376px))';

  if (loading) {
    return (
      <main style={{ height: 'calc(100vh - 66px)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="animate-pulse"
          style={{ width: boardSizeVar, height: boardSizeVar, background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        />
      </main>
    );
  }

  if (!course || !lesson || !line || chessMoves.length === 0) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px', boxSizing: 'border-box' }}>
        <Link href={`/courses/${courseId}/${lessonId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
          ← Урок
        </Link>
        <p style={{ color: 'var(--muted)', marginTop: 32 }}>
          Нет данных для тренировки. Добавьте линию к уроку.
        </p>
      </main>
    );
  }

  const playerColor = course.color === 'black' ? 'b' : 'w';

  const { feedback: bf, isPlayerTurn: bpt, isComplete: bic, reviewsRemaining: brev } = boardStatus;
  const feedbackText = bf === 'correct'
    ? 'Верно!'
    : bf === 'wrong'
      ? 'Неверный ход — правильный выделен золотым'
      : brev > 0
        ? `Повтори ход${brev > 1 ? ` (${brev} осталось)` : ''}`
        : bic
          ? 'Линия завершена!'
          : bpt
            ? 'Ваш ход'
            : 'Соперник думает…';
  const feedbackBg = bf === 'correct'
    ? '#141414'
    : bf === 'wrong'
      ? '#1A1A1A'
      : '#0D0D0D';
  const feedbackBorder = bf === 'correct'
    ? '#303030'
    : bf === 'wrong'
      ? '#404040'
      : '#262626';

  return (
    <>
      {/* Completion overlay */}
      {completed && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,5,5,0.95)',
          gap: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 72, lineHeight: 1 }}>✓</div>
          <div>
            <div style={{
              fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
              fontSize: 40, fontWeight: 700, color: 'var(--ivory)', marginBottom: 8,
            }}>
              Урок пройден!
            </div>
            <div style={{ fontSize: 16, color: 'var(--muted)' }}>
              {guessTotal > 0 ? `Результат: ${guessCorrect} / ${guessTotal}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
              href={`/courses/${courseId}/${lessonId}`}
              style={{
                display: 'inline-flex', alignItems: 'center',
                height: 48, padding: '0 24px',
                border: '1px solid var(--control)', background: 'transparent',
                color: 'var(--ivory)', fontSize: 14, fontWeight: 500,
              }}
            >
              ← К уроку
            </Link>
            {nextLesson && (
              <Link
                href={`/courses/${courseId}/${nextLesson.id}/practice`}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  height: 48, padding: '0 24px',
                  background: 'var(--ivory)', color: 'var(--ink)',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                Следующий урок →
              </Link>
            )}
            <button
              onClick={handleRepeat}
              style={{
                height: 48, padding: '0 24px',
                border: '1px solid var(--control)', background: 'transparent',
                color: 'var(--muted)', fontSize: 14, cursor: 'pointer',
              }}
            >
              Повторить
            </button>
          </div>
        </div>
      )}

      <main style={{
        height: 'calc(100vh - 66px)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        padding: '20px 40px 24px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center',
          justifyContent: 'center', minHeight: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 36 }}>

            {/* Board column */}
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, width: boardSizeVar }}>
              {/* Player indicator */}
              <div style={{
                height: 44, display: 'flex', alignItems: 'center',
                fontSize: 13, color: 'var(--muted)',
              }}>
                {playerColor === 'w'
                  ? <span>♙ Вы играете белыми</span>
                  : <span>♟ Вы играете чёрными</span>}
              </div>

              <div style={{ height: 10, flexShrink: 0 }} />

              {/* Board */}
              <div style={{ width: boardSizeVar, height: boardSizeVar, flexShrink: 0 }}>
                <ChessBoardWrapper
                  key={boardKey}
                  line={chessMoves}
                  playerColor={playerColor}
                  onComplete={handleComplete}
                  onMovesChange={handleMovesChange}
                  onStatusChange={setBoardStatus}
                />
              </div>

              {/* Feedback bar */}
              <div style={{
                height: 44, flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 16px', marginTop: 2,
                background: feedbackBg,
                border: `1px solid ${feedbackBorder}`,
                borderRadius: 12,
                fontSize: 15, fontWeight: 500,
                color: bf === 'correct' ? '#D0D0D0' : '#A0A0A0',
              }}>
                {bf === 'correct' && <span style={{ fontWeight: 700 }}>✓</span>}
                {bf === 'wrong' && <span style={{ fontWeight: 700 }}>✗</span>}
                {!bf && <span style={{ opacity: 0.6 }}>{bpt ? '○' : bic ? '✓' : '…'}</span>}
                <span>{feedbackText}</span>
              </div>
            </div>

            {/* Sidebar */}
            <div style={{
              flexShrink: 0, width: 260,
              background: '#0A0A0A',
              border: '1px solid #1E1E1E',
              borderRadius: 20,
              padding: 20,
              display: 'flex', flexDirection: 'column', gap: 16,
              overflowY: 'auto',
              maxHeight: `calc(${boardSizeVar} + 98px)`,
            }}>
              {/* Back link + title */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Link
                  href={`/courses/${courseId}/${lessonId}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: '#404040',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                  Урок
                </Link>
                <span style={{ fontSize: 18, color: '#E0E0E0', fontWeight: 500, lineHeight: 1.2 }}>
                  {lesson.title}
                </span>
              </div>

              <div style={{ height: 1, background: '#1E1E1E' }} />

              {/* Comment panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#505050' }}>
                  Комментарий
                </span>
                <div style={{
                  minHeight: 60, padding: 10,
                  background: '#141414', border: '1px solid #262626',
                  borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                  color: currentComment ? '#D0D0D0' : '#404040',
                }}>
                  {currentComment ?? 'Сделайте ход, чтобы увидеть комментарий'}
                </div>
              </div>

              <div style={{ height: 1, background: '#1E1E1E' }} />

              {/* Move list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#505050' }}>
                  Ходы
                </span>
                <MoveListPanel moves={playedMoves} currentIndex={currentMoveIdx} />
              </div>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
