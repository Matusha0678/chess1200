'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LessonPage } from '@/components/course/LessonPage';
import { buildSteps, lessonLines, initialState, type LessonLine, type QuizItem } from '@/lib/lesson';
import type { Course, CourseLesson, LessonLine as DBLessonLine, LessonQuestion, LessonProgress } from '@/types/courses';
import Link from 'next/link';

interface Props {
  params: Promise<{ courseId: string; lessonId: string }>;
}

// Demo course notes (pre-populated per spec)
const DEMO_NOTES = [
  {
    id: 'demo-note-1',
    lesson_id: '2', // lesson n=2
    line_order: 0,
    ply: 16,
    body: 'Сравнить с обычным драконом: там d5 готовят долго.',
    kind: 'note' as const,
  },
  {
    id: 'demo-confused-1',
    lesson_id: '2',
    line_order: 0,
    ply: 19,
    body: '(не понял)',
    kind: 'confused' as const,
  },
];

export default function LessonViewerPage({ params }: Props) {
  const { courseId, lessonId } = use(params);
  const searchParams = useSearchParams();

  const isDemo = courseId === 'demo';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data loaded from DB or demo
  const [courseData, setCourseData] = useState<{ id: string; name: string; color: 'white' | 'black' | 'both' } | null>(null);
  const [allLessons, setAllLessons] = useState<Array<{ id: string; lesson_order: number; title: string }>>([]);
  const [lessonData, setLessonData] = useState<{
    id: string; title: string; goal?: string; blocks?: unknown[];
    summary?: string; plan?: string; mistakes?: string; trap?: string;
  } | null>(null);
  const [lines, setLines] = useState<LessonLine[]>([]);
  const [questions, setQuestions] = useState<QuizItem[]>([]);
  const [lessonProgress, setLessonProgress] = useState<Record<string, { completed: boolean; guess_total?: number; guess_correct?: number }>>({});
  const [lessonTests, setLessonTests] = useState<Record<string, { score: number; max: number }>>({});
  const [lessonNotes, setLessonNotes] = useState<Array<{ id: string; lesson_id: string; line_order: number; ply: number; body: string; kind: 'note' | 'confused' }>>([]);
  const [confusedCount, setConfusedCount] = useState(0);

  const [initialStepIdx, setInitialStepIdx] = useState(0);
  const [initialPlyVal, setInitialPlyVal] = useState(0);
  const [initialModeVal, setInitialModeVal] = useState<'watch' | 'play'>('watch');

  const loadDemo = useCallback(async () => {
    setLoading(true);
    try {
      // Dynamic import to avoid SSR issues
      const demoJson = (await import('@/data/demo-course.json')).default as {
        course: { id: string; name: string; color: 'white' | 'black' | 'both'; slug: string; opening: string; kind: string; level: string; description: string };
        stats: { lessonsDone: number; lessonsTotal: number; testsPct: number; confused: number };
        lessons: Array<{
          n: number; title: string; status: string; linesCount: number;
          test?: { score: number; max: number };
          content: { title: string; goal?: string; blocks?: unknown[]; summary?: string; plan?: string; mistakes?: string; trap?: string };
        }>;
      };

      const course = demoJson.course;
      const demoLessonNum = Number(lessonId);
      const lesson = demoJson.lessons.find(l => l.n === demoLessonNum);

      if (!lesson) {
        setError('Урок не найден в демо-курсе.');
        setLoading(false);
        return;
      }

      setCourseData({ id: 'demo', name: course.name, color: course.color });

      // All lessons list
      setAllLessons(demoJson.lessons.map(l => ({
        id: String(l.n),
        lesson_order: l.n,
        title: l.title,
      })));

      setLessonData({
        id: String(lesson.n),
        title: lesson.title,
        goal: lesson.content.goal,
        blocks: lesson.content.blocks,
        summary: lesson.content.summary,
        plan: lesson.content.plan,
        mistakes: lesson.content.mistakes,
        trap: lesson.content.trap,
      });

      // Build lines from content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lLines = lessonLines(lesson.content as any);
      setLines(lLines);
      setQuestions([]);

      // Demo progress: lesson 1 done, lesson 2 current
      const progress: Record<string, { completed: boolean }> = {};
      demoJson.lessons.forEach(l => {
        if (l.status === 'done') progress[String(l.n)] = { completed: true };
      });
      setLessonProgress(progress);

      // Demo tests
      const tests: Record<string, { score: number; max: number }> = {};
      demoJson.lessons.forEach(l => {
        if (l.test) tests[String(l.n)] = l.test;
      });
      setLessonTests(tests);

      // Demo notes — only for lesson 2
      if (demoLessonNum === 2) {
        setLessonNotes(DEMO_NOTES.filter(n => n.lesson_id === '2'));
      } else {
        setLessonNotes([]);
      }
      setConfusedCount(demoJson.stats.confused);

      // Compute initial state from query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const steps = buildSteps(lesson.content as any);
      const query: Record<string, string> = {};
      searchParams.forEach((v, k) => { query[k] = v; });
      // Demo always starts at step 1 unless ?step specified
      const ist = initialState(steps, query, []);
      setInitialStepIdx(ist.step);
      setInitialPlyVal(ist.ply);
      setInitialModeVal(ist.mode);

    } catch (e) {
      setError('Ошибка загрузки демо-курса: ' + String(e));
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId]);

  const loadFromDB = useCallback(async () => {
    setLoading(true);
    try {
      const [courseRes, lessonRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('course_lessons').select('*').eq('id', lessonId).single(),
      ]);

      if (!courseRes.data || !lessonRes.data) {
        setError('Курс или урок не найден.');
        setLoading(false);
        return;
      }

      const course = courseRes.data as Course;
      const lesson = lessonRes.data as CourseLesson;

      setCourseData({ id: course.id, name: course.name, color: course.color });
      setLessonData({
        id: lesson.id,
        title: lesson.title,
        goal: lesson.goal,
        blocks: lesson.blocks as unknown[],
        summary: lesson.summary,
        plan: lesson.plan,
        mistakes: lesson.mistakes,
        trap: lesson.trap,
      });

      // Load all data in parallel
      const [
        allLessonsRes,
        linesRes,
        questionsRes,
        notesRes,
      ] = await Promise.all([
        supabase.from('course_lessons').select('id, lesson_order, title').eq('course_id', courseId).order('lesson_order', { ascending: true }),
        supabase.from('lesson_lines').select('*').eq('lesson_id', lessonId).order('line_order', { ascending: true }),
        supabase.from('lesson_questions').select('*').eq('lesson_id', lessonId).order('question_order', { ascending: true }),
        supabase.from('lesson_notes').select('*').eq('lesson_id', lessonId).eq('resolved', false),
      ]);

      const lessonsArr = (allLessonsRes.data ?? []) as Array<{ id: string; lesson_order: number; title: string }>;
      setAllLessons(lessonsArr);

      // Now load progress for all lessons in course
      const lessonIds = lessonsArr.map(l => l.id);
      const [allProgressRes, allTestsRes, confusedRes] = await Promise.all([
        supabase.from('lesson_progress').select('*').in('lesson_id', lessonIds),
        supabase.from('lesson_tests').select('lesson_id, score, max, taken_at').in('lesson_id', lessonIds).order('taken_at', { ascending: false }),
        supabase.from('lesson_notes').select('id').in('lesson_id', lessonIds).eq('kind', 'confused').eq('resolved', false),
      ]);

      const progMap: Record<string, { completed: boolean; guess_total?: number; guess_correct?: number }> = {};
      (allProgressRes.data ?? []).forEach((p: LessonProgress) => {
        progMap[p.lesson_id] = { completed: p.completed, guess_total: p.guess_total, guess_correct: p.guess_correct };
      });
      setLessonProgress(progMap);

      const testMap: Record<string, { score: number; max: number }> = {};
      (allTestsRes.data ?? []).forEach((t: { lesson_id: string; score: number; max: number }) => {
        if (!testMap[t.lesson_id]) testMap[t.lesson_id] = { score: t.score, max: t.max };
      });
      setLessonTests(testMap);

      // Lines
      const dbLines = (linesRes.data ?? []) as DBLessonLine[];
      const processedLines: LessonLine[] = dbLines.map(l => ({
        title: l.title ?? '',
        intro_md: l.intro_md ?? '',
        outro_md: l.outro_md ?? '',
        moves: l.moves as LessonLine['moves'],
        start_fen: l.start_fen ?? null,
      }));
      setLines(processedLines);

      // Questions
      const dbQ = (questionsRes.data ?? []) as LessonQuestion[];
      const qi: QuizItem[] = dbQ.map(q => ({
        type: 'puzzle' as const,
        fen: q.fen,
        question: q.question,
        answer: q.answer,
        why: q.why ?? '',
      }));
      setQuestions(qi);

      // Notes
      const rawNotes = (notesRes.data ?? []) as Array<{ id: string; lesson_id: string; ply: number; body: string; kind: string; line_order?: number }>;
      setLessonNotes(rawNotes.map(n => ({
        id: n.id,
        lesson_id: n.lesson_id,
        line_order: n.line_order ?? 0,
        ply: n.ply,
        body: n.body,
        kind: (n.kind === 'confused' ? 'confused' : 'note') as 'note' | 'confused',
      })));

      setConfusedCount((confusedRes.data ?? []).length);

      // Initial state
      const steps = buildSteps(lesson as unknown as Parameters<typeof buildSteps>[0], processedLines, qi);
      const doneStepsArr = (() => {
        try {
          const raw = localStorage.getItem(`chess1200-lesson-steps:${lessonId}`);
          if (raw) return JSON.parse(raw) as number[];
        } catch { /* ignore */ }
        return [];
      })();
      const query: Record<string, string> = {};
      searchParams.forEach((v, k) => { query[k] = v; });
      const ist = initialState(steps, query, doneStepsArr);
      setInitialStepIdx(ist.step);
      setInitialPlyVal(ist.ply);
      setInitialModeVal(ist.mode);

    } catch (e) {
      setError('Ошибка загрузки: ' + String(e));
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId]);

  useEffect(() => {
    if (isDemo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDemo();
    } else {
      loadFromDB();
    }
  }, [isDemo, loadDemo, loadFromDB]);

  if (loading) {
    return (
      <div style={{ height: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-pulse" style={{ width: 560, height: 560, background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
      </div>
    );
  }

  if (error || !courseData || !lessonData) {
    return (
      <div className="page">
        <Link href={`/courses/${courseId}`} className="page-back">← Курс</Link>
        <p style={{ color: 'var(--muted)' }}>{error ?? 'Урок не найден.'}</p>
      </div>
    );
  }

  return (
    <LessonPage
      courseId={courseId}
      lessonId={lessonId}
      isDemo={isDemo}
      course={courseData}
      allLessons={allLessons}
      lesson={lessonData}
      lines={lines}
      questions={questions}
      lessonProgress={lessonProgress}
      lessonTests={lessonTests}
      lessonNotes={lessonNotes}
      deviationLog={[]}
      confusedCount={confusedCount}
      initialStep={initialStepIdx}
      initialPly={initialPlyVal}
      initialMode={initialModeVal}
    />
  );
}
