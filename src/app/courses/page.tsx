'use client';

import { useState, useEffect, useRef } from 'react';
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

function CourseCard({
  course,
  onDelete,
  onRename,
}: {
  course: CourseWithStats;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const pct = course.lessonsTotal > 0
    ? Math.min(100, (course.lessonsCompleted / course.lessonsTotal) * 100)
    : 0;

  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(course.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename() {
    setRenameVal(course.name);
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function saveRename() {
    const trimmed = renameVal.trim();
    if (!trimmed || trimmed === course.name) { setRenaming(false); return; }
    setSaving(true);
    await supabase.from('courses').update({ name: trimmed }).eq('id', course.id);
    onRename(course.id, trimmed);
    setRenaming(false);
    setSaving(false);
  }

  async function confirmAndDelete() {
    setSaving(true);
    // Get lesson IDs, then delete related data in order
    const { data: lessonList } = await supabase.from('course_lessons').select('id').eq('course_id', course.id);
    const lIds = (lessonList ?? []).map((l: { id: string }) => l.id);
    if (lIds.length > 0) {
      await supabase.from('lesson_tests').delete().in('lesson_id', lIds);
      await supabase.from('lesson_progress').delete().in('lesson_id', lIds);
      await supabase.from('lesson_notes').delete().in('lesson_id', lIds);
      await supabase.from('lesson_lines').delete().in('lesson_id', lIds);
      await supabase.from('course_lessons').delete().eq('course_id', course.id);
    }
    await supabase.from('courses').delete().eq('id', course.id);
    onDelete(course.id);
  }

  return (
    <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          {renaming ? (
            <input
              ref={inputRef}
              className="ui-input"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
              style={{ fontSize: 15, fontWeight: 700, padding: '4px 8px', width: '100%' }}
              disabled={saving}
            />
          ) : (
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: 'var(--ivory)' }}>
              {course.name}
            </h2>
          )}
          {course.opening && !renaming && (
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {course.opening}
            </span>
          )}
        </div>

        {/* Edit/delete icons */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {renaming ? (
            <>
              <button
                className="ui-btn ui-btn-primary ui-btn-sm"
                onClick={saveRename}
                disabled={saving}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Сохранить
              </button>
              <button
                className="ui-btn ui-btn-outline ui-btn-sm"
                onClick={() => setRenaming(false)}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Отмена
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startRename}
                title="Переименовать"
                style={{
                  width: 28, height: 28, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)',
                  background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                title="Удалить курс"
                style={{
                  width: 28, height: 28, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)',
                  background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
              <DiffBadge value={course.difficulty} />
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)',
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--ivory)' }}>Удалить курс «{course.name}»? Это необратимо.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ui-btn ui-btn-sm" onClick={confirmAndDelete} disabled={saving}
              style={{ background: '#c0392b', color: '#fff', border: 'none', borderRadius: 'var(--radius-btn)' }}>
              {saving ? 'Удаляю…' : 'Удалить'}
            </button>
            <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setConfirmDelete(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Description */}
      {course.description && !renaming && (
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

  function handleDelete(id: string) {
    setCourses(prev => prev.filter(c => c.id !== id));
  }

  function handleRename(id: string, name: string) {
    setCourses(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  }

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
            ? visibleCourses.map(course => (
                <CourseCard key={course.id} course={course} onDelete={handleDelete} onRename={handleRename} />
              ))
            : <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', gridColumn: '1/-1' }}>Нет курсов в этой категории</p>
          }
        </div>
      )}
    </div>
  );
}
