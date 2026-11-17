'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Course, CourseKind, LessonProgress } from '@/types/courses';

interface CourseWithStats extends Course {
  lessonsTotal: number;
  lessonsCompleted: number;
}

function ColorIcon({ color }: { color: 'white' | 'black' | 'both' }) {
  if (color === 'white') return (
    <span aria-hidden="true" style={{ fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 22, lineHeight: 1, color: 'var(--ivory)' }}>♚</span>
  );
  if (color === 'black') return (
    <span aria-hidden="true" style={{ fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 22, lineHeight: 1, color: 'var(--ink)', WebkitTextStroke: '0.8px var(--ivory)' }}>♚</span>
  );
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 22, lineHeight: 1 }}>
      <span style={{ color: 'var(--ivory)' }}>♚</span>
      <span style={{ marginLeft: -6, color: 'var(--ink)', WebkitTextStroke: '0.8px var(--ivory)' }}>♚</span>
    </span>
  );
}

function DiffBadge({ value }: { value: number }) {
  if (value <= 2) return <span className="diff-pill diff-easy">Лёгкий</span>;
  if (value <= 3) return <span className="diff-pill diff-mid">Средний</span>;
  return <span className="diff-pill diff-hard">Сложный</span>;
}

function CourseCard({ course }: { course: CourseWithStats }) {
  const pct = course.lessonsTotal > 0
    ? Math.min(100, (course.lessonsCompleted / course.lessonsTotal) * 100)
    : 0;

  return (
    <div className="ui-card opening-card-link" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          flexShrink: 0, width: 40, height: 40,
          borderRadius: 'var(--radius-btn)',
          background: 'var(--bg)',
          border: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ColorIcon color={course.color} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: 'var(--ivory)' }}>
            {course.name}
          </h2>
          {course.opening && (
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {course.opening}
            </span>
          )}
        </div>

        <DiffBadge value={course.difficulty} />
      </div>

      {/* Description */}
      {course.description && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {course.description}
        </p>
      )}

      {/* Progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {course.lessonsCompleted}/{course.lessonsTotal} уроков
          </span>
          {course.lessonsCompleted === course.lessonsTotal && course.lessonsTotal > 0 && (
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>✓ Пройден</span>
          )}
        </div>
        <div className="progress-track soft-progress">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Action */}
      <div>
        <Link href={`/courses/${course.id}`} className="ui-btn ui-btn-primary ui-btn-sm">
          Начать
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="ui-card animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 40, height: 40, background: 'var(--track)', borderRadius: 'var(--radius-btn)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 16, width: '60%', background: 'var(--track)', borderRadius: 4 }} />
          <div style={{ height: 12, width: '30%', background: 'var(--track)', borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ height: 13, width: '90%', background: 'var(--track)', borderRadius: 4 }} />
      <div style={{ height: 4, background: 'var(--track)', borderRadius: 99 }} />
      <div style={{ height: 34, width: 100, background: 'var(--track)', borderRadius: 'var(--radius-btn)' }} />
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
      const { data: coursesData } = await supabase.from('courses').select('*').order('created_at', { ascending: false });
      if (!coursesData || coursesData.length === 0) { setCourses([]); setLoading(false); return; }

      const courseIds = (coursesData as Course[]).map(c => c.id);
      const { data: lessonsData } = await supabase.from('course_lessons').select('id, course_id').in('course_id', courseIds);
      const lessonIds = (lessonsData ?? []).map(l => l.id);
      const { data: progressData } = lessonIds.length > 0
        ? await supabase.from('lesson_progress').select('lesson_id, completed').in('lesson_id', lessonIds)
        : { data: [] as Pick<LessonProgress, 'lesson_id' | 'completed'>[] };

      setCourses((coursesData as Course[]).map(course => {
        const lessons = (lessonsData ?? []).filter(l => l.course_id === course.id);
        const lIds = lessons.map(l => l.id);
        const progress = (progressData ?? []).filter(p => lIds.includes(p.lesson_id));
        return { ...course, lessonsTotal: lessons.length, lessonsCompleted: progress.filter(p => p.completed).length };
      }));
      setLoading(false);
    }
    load();
  }, []);

  const tabsWithCounts = TABS.map(t => ({
    ...t,
    count: t.id === 'all' ? courses.length : courses.filter(c => (c.kind ?? 'opening') === t.id).length,
  }));
  const visibleCourses = activeTab === 'all' ? courses : courses.filter(c => (c.kind ?? 'opening') === activeTab);

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Курсы</h1>
          <p className="page-lead">Структурированное обучение шахматам</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/courses/path" className="ui-btn ui-btn-outline">Пути</Link>
          <Link href="/courses/import" className="ui-btn ui-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Импортировать
          </Link>
        </div>
      </div>

      {/* Tabs */}
      {!loading && courses.length > 0 && (
        <div className="ui-tabs" style={{ overflowX: 'auto' }}>
          {tabsWithCounts.filter(t => t.count > 0 || t.id === 'all').map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`ui-tab ${activeTab === tab.id ? 'ui-tab-active' : ''}`}
            >
              {tab.label}
              {tab.id !== 'all' && tab.count > 0 && (
                <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.65 }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📚</div>
          <div className="empty-state-title">Нет курсов</div>
          <p className="empty-state-text">Импортируй первый курс из Markdown-файла</p>
          <Link href="/courses/import" className="ui-btn ui-btn-primary">Импортировать курс</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 16 }}>
          {visibleCourses.length > 0
            ? visibleCourses.map(course => <CourseCard key={course.id} course={course} />)
            : <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', gridColumn: '1/-1' }}>Нет курсов в этой категории</p>
          }
        </div>
      )}
    </div>
  );
}
