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
      <div className="page animate-pulse">
        <div style={{ height: 14, width: 80, background: 'var(--track)', borderRadius: 4 }} />
        <div style={{ height: 40, width: '50%', background: 'var(--track)', borderRadius: 'var(--radius-card)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>
          <div style={{ aspectRatio: '1', background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
          <div style={{ height: 400, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
        </div>
      </div>
    );
  }

  if (!course || !lesson) {
    return (
      <div className="page">
        <Link href={`/courses/${courseId}`} className="page-back">← Курс</Link>
        <p style={{ color: 'var(--muted)' }}>Урок не найден.</p>
      </div>
    );
  }

  const moves: CourseLessonMove[] = (line?.moves as CourseLessonMove[]) ?? [];
  const boardOrientation = course.color === 'black' ? 'black' : 'white';

  const hasRichData = moves.some(m =>
    (m.arrows?.length ?? 0) > 0 || (m.squares?.length ?? 0) > 0 || (m.nags?.length ?? 0) > 0
  );

  return (
    <div className="page">
      {/* Breadcrumb */}
      <Link href={`/courses/${courseId}`} className="page-back">← {course.name}</Link>

      {/* Notice if no rich data */}
      {!hasRichData && moves.length > 0 && (
        <div className="ui-card" style={{ fontSize: 13, color: 'var(--muted)' }}>
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
    </div>
  );
}
