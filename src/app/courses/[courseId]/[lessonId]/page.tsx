'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { LessonViewer } from '@/components/LessonViewer';
import type { Course, CourseLesson, LessonLine, LessonQuestion, CourseLessonMove } from '@/types/courses';


interface Props {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default function LessonViewerPage({ params }: Props) {
  const { courseId, lessonId } = use(params);
  const { boardTheme, customPieces, showNotation, animationMs, boardThemeId, pieceStyleId } = useBoardTheme();

  const [course, setCourse]       = useState<Course | null>(null);
  const [lesson, setLesson]       = useState<CourseLesson | null>(null);
  const [line,   setLine]         = useState<LessonLine | null>(null);
  const [questions, setQuestions] = useState<LessonQuestion[]>([]);
  const [prevLesson, setPrevLesson] = useState<CourseLesson | null>(null);
  const [nextLesson, setNextLesson] = useState<CourseLesson | null>(null);
  const [loading, setLoading]     = useState(true);

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

      const [{ data: linesData }, { data: questionsData }] = await Promise.all([
        supabase.from('lesson_lines').select('*').eq('lesson_id', lessonId).order('line_order').limit(1),
        supabase.from('lesson_questions').select('*').eq('lesson_id', lessonId).order('question_order'),
      ]);

      if (linesData?.[0]) setLine(linesData[0] as LessonLine);
      setQuestions((questionsData ?? []) as LessonQuestion[]);
      setLoading(false);
    }
    load();
  }, [courseId, lessonId]);

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

  const moves: CourseLessonMove[] = (line?.moves as CourseLessonMove[]) ?? [];
  const boardOrientation = course.color === 'black' ? 'black' : 'white';

  const hasRichData = moves.some(m =>
    (m.arrows?.length ?? 0) > 0 || (m.squares?.length ?? 0) > 0 || (m.nags?.length ?? 0) > 0
  );

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 48px 80px', boxSizing: 'border-box' }}>
      {/* Breadcrumb */}
      <Link href={`/courses/${courseId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        {course.name}
      </Link>

      {/* Notice if no rich data */}
      {!hasRichData && moves.length > 0 && (
        <div style={{ marginBottom: 20, padding: '10px 16px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 13, color: 'var(--muted)' }}>
          Стрелки и пометки появятся после повторного импорта этого курса (курс загружен в старом формате).
        </div>
      )}

      <LessonViewer
        moves={moves}
        startFen={line?.start_fen ?? undefined}
        boardOrientation={boardOrientation}
        boardTheme={boardTheme}
        customPieces={customPieces}
        animationMs={animationMs}
        showNotation={showNotation}
        boardThemeId={boardThemeId}
        pieceStyleId={pieceStyleId}
        lesson={lesson}
        questions={questions}
        courseId={courseId}
        lessonId={lessonId}
        prevLesson={prevLesson}
        nextLesson={nextLesson}
      />
    </main>
  );
}
