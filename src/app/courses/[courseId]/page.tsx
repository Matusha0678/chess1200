'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Course, CourseLesson, LessonProgress, LessonLine, TestQuestion } from '@/types/courses';
import { LessonTest } from '@/components/LessonTest';

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

interface Props {
  params: Promise<{ courseId: string }>;
}

interface LessonWithMeta extends CourseLesson {
  moveCount: number;
  progress?: LessonProgress;
}

interface WeakSpot { q: TestQuestion; count: number; }

function DifficultyDots({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{
          display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
          background: i < value ? 'var(--ivory)' : 'var(--track)',
        }} />
      ))}
    </div>
  );
}

function ColorLabel({ color }: { color: 'white' | 'black' | 'both' }) {
  const labels: Record<string, string> = { white: '♚ Белые', black: '♟ Чёрные', both: '♚♟ Оба цвета' };
  return <span style={{ fontSize: 13, color: 'var(--muted)' }}>{labels[color] ?? color}</span>;
}

export default function CourseOverviewPage({ params }: Props) {
  const { courseId } = use(params);

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<LessonWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [weakSpots, setWeakSpots] = useState<WeakSpot[]>([]);
  const [latestTestMap, setLatestTestMap] = useState<Record<string, { score: number; max: number; pct: number }>>({});
  const [showWeakTest, setShowWeakTest] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (!courseData) { setLoading(false); return; }
      setCourse(courseData as Course);

      const { data: lessonsData } = await supabase
        .from('course_lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('lesson_order', { ascending: true });

      const lessonList = (lessonsData ?? []) as CourseLesson[];

      if (lessonList.length === 0) {
        setLessons([]);
        setLoading(false);
        return;
      }

      const lessonIds = lessonList.map(l => l.id);

      // Fetch line move counts
      const { data: linesData } = await supabase
        .from('lesson_lines')
        .select('lesson_id, moves')
        .in('lesson_id', lessonIds);

      // Fetch progress
      const { data: progressData } = await supabase
        .from('lesson_progress')
        .select('*')
        .in('lesson_id', lessonIds);

      const progressMap: Record<string, LessonProgress> = {};
      (progressData ?? []).forEach((p: LessonProgress) => { progressMap[p.lesson_id] = p; });

      // Fetch test results (latest per lesson)
      const { data: testsData } = await supabase
        .from('lesson_tests')
        .select('lesson_id, score, max, taken_at')
        .in('lesson_id', lessonIds)
        .order('taken_at', { ascending: false });

      // Fetch wrong records for weak spots
      const { data: wrongData } = await supabase
        .from('lesson_tests')
        .select('lesson_id, wrong')
        .in('lesson_id', lessonIds);

      // Build latestTestMap — first (latest) result per lesson
      const latestMap: Record<string, { score: number; max: number; pct: number }> = {};
      (testsData ?? []).forEach((t: { lesson_id: string; score: number; max: number }) => {
        if (!latestMap[t.lesson_id]) {
          const pct = t.max > 0 ? Math.round((t.score / t.max) * 100) : 0;
          latestMap[t.lesson_id] = { score: t.score, max: t.max, pct };
        }
      });
      setLatestTestMap(latestMap);

      // Build weak spots: collect all wrong records, group by question
      const questionCounts: Map<string, { q: TestQuestion; count: number }> = new Map();
      (wrongData ?? []).forEach((row: { wrong: TestQuestion[] }) => {
        const wrongArr: TestQuestion[] = Array.isArray(row.wrong) ? row.wrong : [];
        for (const wr of wrongArr) {
          if (!wr?.question) continue;
          const existing = questionCounts.get(wr.question);
          if (existing) {
            existing.count += 1;
          } else {
            questionCounts.set(wr.question, { q: wr, count: 1 });
          }
        }
      });
      const sortedWeak = Array.from(questionCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setWeakSpots(sortedWeak);

      // Count moves per lesson (from first line)
      const moveCountMap: Record<string, number> = {};
      (linesData ?? []).forEach((line: Pick<LessonLine, 'lesson_id' | 'moves'>) => {
        if (!moveCountMap[line.lesson_id]) {
          moveCountMap[line.lesson_id] = Array.isArray(line.moves) ? line.moves.length : 0;
        }
      });

      const withMeta: LessonWithMeta[] = lessonList.map(lesson => ({
        ...lesson,
        moveCount: moveCountMap[lesson.id] ?? 0,
        progress: progressMap[lesson.id],
      }));

      setLessons(withMeta);
      setLoading(false);
    }

    load();
  }, [courseId]);

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ height: 14, width: 80, background: 'var(--track)' }} />
          <div style={{ height: 52, width: '55%', background: 'var(--track)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 72, background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <Link href="/courses" style={{ fontSize: 13, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          ← Курсы
        </Link>
        <p style={{ color: 'var(--muted)', marginTop: 32 }}>Курс не найден.</p>
      </main>
    );
  }

  const completedCount = lessons.filter(l => l.progress?.completed).length;

  return (
    <main style={{
      maxWidth: 900, margin: '0 auto',
      padding: '40px 48px 72px',
      display: 'flex', flexDirection: 'column', gap: 32,
      boxSizing: 'border-box',
    }}>
      {/* Breadcrumb */}
      <Link
        href="/courses"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, color: 'var(--muted)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Курсы
      </Link>

      {/* Course header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ ...HEADING, margin: 0, fontSize: 56, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {course.name}
        </h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <ColorLabel color={course.color} />
          {course.opening && (
            <span style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {course.opening}
            </span>
          )}
          <DifficultyDots value={course.difficulty} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Пройдено {completedCount} / {lessons.length}
            </span>
            <div style={{ height: 2, background: 'var(--track)', width: '100%', maxWidth: 200 }}>
              <div style={{ height: '100%', width: `${lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0}%`, background: 'var(--ivory)' }} />
            </div>
          </div>
        </div>
        {course.description && (
          <p style={{ margin: 0, fontSize: 15, color: 'var(--muted)', lineHeight: 1.6 }}>
            {course.description}
          </p>
        )}
      </div>

      {/* Lessons list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ borderTop: '2px solid var(--ivory)', marginBottom: 16 }} />

        {lessons.length === 0 ? (
          <p style={{ margin: 0, fontSize: 15, color: 'var(--muted)' }}>Нет уроков в этом курсе</p>
        ) : (
          lessons.map((lesson, idx) => {
            const done = lesson.progress?.completed ?? false;
            return (
              <div
                key={lesson.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 20px',
                  border: '1px solid var(--hairline)',
                  background: 'var(--surface)',
                  marginBottom: 8,
                }}
              >
                {/* Number */}
                <span style={{
                  fontSize: 12, color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0, minWidth: 24, textAlign: 'right',
                }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>

                {/* Completion indicator */}
                {done ? (
                  <span style={{
                    flexShrink: 0, width: 20, height: 20,
                    borderRadius: '50%', background: 'var(--ivory)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                ) : (
                  <span style={{
                    flexShrink: 0, width: 20, height: 20,
                    borderRadius: '50%', border: '1px solid var(--control)',
                  }} />
                )}

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)', lineHeight: 1.2 }}>
                    {lesson.title}
                  </span>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                    <span>{lesson.moveCount} ходов</span>
                    {done && <span style={{ color: 'var(--ivory)' }}>✓ Пройден</span>}
                    {latestTestMap[lesson.id] !== undefined && (
                      <span style={{ color: latestTestMap[lesson.id].pct >= 80 ? 'rgba(130,220,100,0.95)' : 'var(--muted)' }}>
                        {latestTestMap[lesson.id].pct}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <Link
                    href={`/courses/${courseId}/${lesson.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      height: 36, padding: '0 16px',
                      border: '1px solid var(--control)', background: 'transparent',
                      color: 'var(--ivory)', fontSize: 13, fontWeight: 500,
                    }}
                  >
                    Изучить
                  </Link>
                  <Link
                    href={`/courses/${courseId}/${lesson.id}/practice`}
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      height: 36, padding: '0 16px',
                      background: 'var(--ivory)', color: 'var(--ink)',
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Тренировать
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Weak spots */}
      {weakSpots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ borderTop: '2px solid var(--ivory)', paddingTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>Слабые места</h2>
            <button
              onClick={() => setShowWeakTest(true)}
              style={{ height: 36, padding: '0 16px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Повторить слабые места ({weakSpots.length})
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {weakSpots.slice(0, 5).map((ws, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 20, textAlign: 'right' }}>
                  ×{ws.count}
                </span>
                <span style={{ fontSize: 14, color: 'var(--ivory)', flex: 1, minWidth: 0 }}>{ws.q.question}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showWeakTest && (
        <LessonTest
          forcedQuestions={weakSpots.map(ws => ws.q)}
          courseId={courseId}
          title="Слабые места"
          onClose={() => setShowWeakTest(false)}
        />
      )}
    </main>
  );
}
