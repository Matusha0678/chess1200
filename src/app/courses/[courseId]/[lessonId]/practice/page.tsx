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
  // Shown as an overlay after the opponent plays a move that has a comment
  const [pausedComment, setPausedComment] = useState<string | null>(null);

  // Derived early so it's available in callbacks (course may be null during load → default 'w')
  const playerColor = course?.color === 'black' ? 'b' : 'w';

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
    setPausedComment(null); // clear previous pause on every new move
    if (moveIndex > 0 && lessonMoves[moveIndex - 1]?.comment) {
      const lastMove = lessonMoves[moveIndex - 1];
      setCurrentComment(lastMove.comment!);
      // Pause after opponent's move so the user can read the idea
      if (lastMove.color !== playerColor) {
        setPausedComment(lastMove.comment!);
      }
    } else {
      setCurrentComment(null);
    }
  }, [lessonMoves, playerColor]);

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
    setPausedComment(null);
    setBoardKey(k => k + 1);
  }

  const boardSizeVar = 'min(calc(100vh - 220px), calc(100vw - 376px))';

  if (loading) {
    return (
      <div style={{ height: 'calc(100vh - 66px)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="animate-pulse"
          style={{ width: boardSizeVar, height: boardSizeVar, background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        />
      </div>
    );
  }

  if (!course || !lesson || !line || chessMoves.length === 0) {
    return (
      <div className="page">
        <Link href={`/courses/${courseId}/${lessonId}`} className="page-back">
          ← Урок
        </Link>
        <p style={{ color: 'var(--muted)', marginTop: 32 }}>
          Нет данных для тренировки. Добавьте линию к уроку.
        </p>
      </div>
    );
  }

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
    ? 'rgba(80,200,80,0.08)'
    : bf === 'wrong'
      ? 'rgba(220,60,60,0.08)'
      : 'var(--surface)';
  const feedbackBorder = bf === 'correct'
    ? 'rgba(80,200,80,0.3)'
    : bf === 'wrong'
      ? 'rgba(220,60,60,0.3)'
      : 'var(--hairline)';

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
              className="ui-btn ui-btn-outline"
            >
              ← К уроку
            </Link>
            {nextLesson && (
              <Link
                href={`/courses/${courseId}/${nextLesson.id}/practice`}
                className="ui-btn ui-btn-primary"
              >
                Следующий урок →
              </Link>
            )}
            <button
              onClick={handleRepeat}
              className="ui-btn ui-btn-outline"
            >
              Повторить
            </button>
          </div>
        </div>
      )}

      <div style={{
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
              <div style={{ width: boardSizeVar, height: boardSizeVar, flexShrink: 0, position: 'relative' }}>
                <ChessBoardWrapper
                  key={boardKey}
                  line={chessMoves}
                  playerColor={playerColor}
                  onComplete={handleComplete}
                  onMovesChange={handleMovesChange}
                  onStatusChange={setBoardStatus}
                />

                {/* Pause overlay: shown after opponent plays a move with a comment */}
                {pausedComment && !completed && (
                  <div
                    style={{
                      position: 'absolute', inset: 0, zIndex: 10,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'flex-end',
                      padding: '0 12px 12px',
                      background: 'rgba(0,0,0,0.6)',
                    }}
                    onClick={() => setPausedComment(null)}
                  >
                    <div
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 'var(--radius-card)',
                        padding: '14px 16px',
                        width: '100%',
                        display: 'flex', flexDirection: 'column', gap: 10,
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ivory)' }}>
                        {pausedComment}
                      </p>
                      <button
                        onClick={() => setPausedComment(null)}
                        className="ui-btn ui-btn-primary ui-btn-sm"
                        style={{ alignSelf: 'flex-end' }}
                      >
                        Мой ход →
                      </button>
                    </div>
                  </div>
                )}
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
                color: bf === 'correct' ? 'var(--ivory)' : 'var(--muted)',
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
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-card)',
              padding: 20,
              display: 'flex', flexDirection: 'column', gap: 16,
              overflowY: 'auto',
              maxHeight: `calc(${boardSizeVar} + 98px)`,
            }}>
              {/* Back link + title */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Link
                  href={`/courses/${courseId}/${lessonId}`}
                  className="page-back"
                  style={{ marginBottom: 0 }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                  Урок
                </Link>
                <span style={{ fontSize: 18, color: 'var(--ivory)', fontWeight: 600, lineHeight: 1.2 }}>
                  {lesson.title}
                </span>
              </div>

              <div style={{ height: 1, background: 'var(--hairline)' }} />

              {/* Comment panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                  Комментарий
                </span>
                <div style={{
                  minHeight: 60, padding: 10,
                  background: 'var(--bg)', border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-btn)', fontSize: 13, lineHeight: 1.5,
                  color: currentComment ? 'var(--ivory)' : 'var(--muted)',
                }}>
                  {currentComment ?? 'Сделайте ход, чтобы увидеть комментарий'}
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--hairline)' }} />

              {/* Move list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                  Ходы
                </span>
                <MoveListPanel moves={playedMoves} currentIndex={currentMoveIdx} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
