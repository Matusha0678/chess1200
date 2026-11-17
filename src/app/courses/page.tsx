'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Course, CourseKind, LessonProgress } from '@/types/courses';

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};
const EYEBROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
  color: 'var(--muted)', textTransform: 'uppercase',
};
const EYEBROW_LINE: React.CSSProperties = {
  width: 48, height: 1, background: 'var(--eyebrow-line)', flexShrink: 0,
};

interface CourseWithStats extends Course {
  lessonsTotal: number;
  lessonsCompleted: number;
}

function DifficultyDots({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: i < value ? 'var(--ivory)' : 'var(--track)',
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );
}

function ColorIcon({ color }: { color: 'white' | 'black' | 'both' }) {
  if (color === 'white') {
    return (
      <span
        aria-hidden="true"
        style={{
          fontFamily: "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','DejaVu Sans',sans-serif",
          fontSize: 24, lineHeight: 1, color: 'var(--ivory)',
        }}
      >♚</span>
    );
  }
  if (color === 'black') {
    return (
      <span
        aria-hidden="true"
        style={{
          fontFamily: "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','DejaVu Sans',sans-serif",
          fontSize: 24, lineHeight: 1, color: 'var(--ink)',
          WebkitTextStroke: '0.8px var(--ivory)',
        }}
      >♚</span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 24, lineHeight: 1 }}
    >
      <span style={{ color: 'var(--ivory)' }}>♚</span>
      <span style={{ marginLeft: -6, color: 'var(--ink)', WebkitTextStroke: '0.8px var(--ivory)' }}>♚</span>
    </span>
  );
}

function CourseCard({ course }: { course: CourseWithStats }) {
  const pct = course.lessonsTotal > 0
    ? Math.min(100, (course.lessonsCompleted / course.lessonsTotal) * 100)
    : 0;

  return (
    <div
      className="opening-card-link"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 24,
        border: '1px solid var(--hairline)',
        background: 'var(--surface)',
        boxSizing: 'border-box',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{
          flexShrink: 0,
          width: 44,
          height: 44,
          border: '1px solid var(--control)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <ColorIcon color={course.color} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{
            ...HEADING,
            margin: 0, fontSize: 22, fontWeight: 700,
            lineHeight: 1.1, letterSpacing: '-0.02em',
            color: 'var(--ivory)',
          }}>
            {course.name}
          </h2>
          {course.opening && (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--muted)',
            }}>
              {course.opening}
            </span>
          )}
        </div>

        <DifficultyDots value={course.difficulty} />
      </div>

      {/* Description */}
      {course.description && (
        <p style={{
          margin: 0, fontSize: 14, color: 'var(--muted)',
          lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {course.description}
        </p>
      )}

      {/* Progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {course.lessonsCompleted} / {course.lessonsTotal} уроков
          </span>
          {course.lessonsCompleted === course.lessonsTotal && course.lessonsTotal > 0 && (
            <span style={{ fontSize: 12, color: 'var(--ivory)', fontWeight: 600 }}>✓ Пройден</span>
          )}
        </div>
        <div style={{ height: 3, background: 'var(--track)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--ivory)', borderRadius: 99, width: `${pct}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Action button */}
      <div>
        <Link
          href={`/courses/${course.id}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            height: 44, padding: '0 20px',
            background: 'var(--ivory)', color: 'var(--ink)',
            fontSize: 14, fontWeight: 600,
            boxSizing: 'border-box',
          }}
        >
          Начать
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="animate-pulse"
      style={{
        display: 'flex', flexDirection: 'column', gap: 16, padding: 24,
        border: '1px solid var(--hairline)', background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 44, height: 44, background: 'var(--track)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 22, width: '60%', background: 'var(--track)' }} />
          <div style={{ height: 11, width: '30%', background: 'var(--track)' }} />
        </div>
      </div>
      <div style={{ height: 14, width: '90%', background: 'var(--track)' }} />
      <div style={{ height: 3, background: 'var(--track)', borderRadius: 99 }} />
      <div style={{ height: 44, width: 120, background: 'var(--track)' }} />
    </div>
  );
}

type TabId = CourseKind | 'all';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all',       label: 'Все' },
  { id: 'opening',   label: 'Дебюты' },
  { id: 'theme',     label: 'Темы' },
  { id: 'endgame',   label: 'Эндшпили' },
  { id: 'tactics',   label: 'Тактика' },
  { id: 'structure', label: 'Структура' },
  { id: 'games',     label: 'Партии' },
];

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });

      if (!coursesData || coursesData.length === 0) {
        setCourses([]);
        setLoading(false);
        return;
      }

      const courseIds = (coursesData as Course[]).map(c => c.id);

      const { data: lessonsData } = await supabase
        .from('course_lessons')
        .select('id, course_id')
        .in('course_id', courseIds);

      const lessonIds = (lessonsData ?? []).map(l => l.id);

      const { data: progressData } = lessonIds.length > 0
        ? await supabase
            .from('lesson_progress')
            .select('lesson_id, completed')
            .in('lesson_id', lessonIds)
        : { data: [] as Pick<LessonProgress, 'lesson_id' | 'completed'>[] };

      const withStats: CourseWithStats[] = (coursesData as Course[]).map(course => {
        const lessons = (lessonsData ?? []).filter(l => l.course_id === course.id);
        const lessonIds = lessons.map(l => l.id);
        const progress = (progressData ?? []).filter(p => lessonIds.includes(p.lesson_id));
        return {
          ...course,
          lessonsTotal: lessons.length,
          lessonsCompleted: progress.filter(p => p.completed).length,
        };
      });

      setCourses(withStats);
      setLoading(false);
    }

    load();
  }, []);

  const visibleCourses = activeTab === 'all'
    ? courses
    : courses.filter(c => (c.kind ?? 'opening') === activeTab);

  const tabsWithCounts = TABS.map(t => ({
    ...t,
    count: t.id === 'all' ? courses.length : courses.filter(c => (c.kind ?? 'opening') === t.id).length,
  }));

  return (
    <main style={{
      maxWidth: 1600, margin: '0 auto',
      padding: '40px 48px 72px',
      display: 'flex', flexDirection: 'column', gap: 24,
      boxSizing: 'border-box',
    }}>
      {/* Hero row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={EYEBROW}>
            <span>ОБУЧЕНИЕ</span>
            <span style={EYEBROW_LINE} />
            <span>КУРСЫ</span>
          </div>
          <h1 style={{
            ...HEADING,
            margin: 0, fontWeight: 700, fontSize: 72,
            lineHeight: 0.9, letterSpacing: '0.01em',
          }}>
            Курсы
          </h1>
        </div>

        <Link
          href="/courses/import"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 48, padding: '0 24px',
            border: '1px solid var(--ivory)',
            background: 'var(--ivory)', color: 'var(--ink)',
            fontSize: 14, fontWeight: 600,
            boxSizing: 'border-box',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Импортировать
        </Link>
      </div>

      {/* Kind tabs */}
      {!loading && courses.length > 0 && (
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline)',
          overflowX: 'auto',
        }}>
          {tabsWithCounts.filter(t => t.count > 0 || t.id === 'all').map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--ivory)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--ivory)' : 'var(--muted)',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                marginBottom: -1,
              }}
            >
              {tab.label}
              {tab.id !== 'all' && tab.count > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--control)' }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))',
          gap: 16,
        }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : courses.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 24, padding: '80px 0', textAlign: 'center',
        }}>
          <h2 style={{ ...HEADING, margin: 0, fontWeight: 700, fontSize: 56, letterSpacing: '-0.03em', lineHeight: 1 }}>
            Нет курсов
          </h2>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--muted)' }}>
            Импортируй первый курс из Markdown-файла
          </p>
          <Link
            href="/courses/import"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 48, padding: '0 24px',
              background: 'var(--ivory)', color: 'var(--ink)',
              fontSize: 14, fontWeight: 600,
            }}
          >
            Импортировать курс
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))',
          gap: 16,
        }}>
          {visibleCourses.length > 0
            ? visibleCourses.map(course => <CourseCard key={course.id} course={course} />)
            : (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', gridColumn: '1/-1' }}>
                Нет курсов в этой категории
              </p>
            )
          }
        </div>
      )}
    </main>
  );
}
