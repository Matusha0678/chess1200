'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Course, CourseKind, LessonProgress } from '@/types/courses';

interface CourseWithStats extends Course {
  lessonsTotal: number;
  lessonsCompleted: number;
}

type TabId = CourseKind | 'all';

const KIND_LABEL: Record<CourseKind, string> = {
  opening: 'Дебют',
  theme: 'Тема',
  endgame: 'Эндшпиль',
  tactics: 'Тактика',
  structure: 'Структура',
  games: 'Партии',
};

const KIND_ICON: Record<CourseKind, string> = {
  opening: '♔',
  theme: '★',
  endgame: '♜',
  tactics: '⚡',
  structure: '▦',
  games: '⚔',
};

const KIND_COLOR: Record<CourseKind, string> = {
  opening: '#8FB4DA',
  theme: '#F0D060',
  endgame: '#B088D8',
  tactics: '#E8A23A',
  structure: '#81B64C',
  games: '#E05757',
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'all',       label: 'Все' },
  { id: 'opening',   label: 'Дебюты' },
  { id: 'theme',     label: 'Темы' },
  { id: 'endgame',   label: 'Эндшпили' },
  { id: 'tactics',   label: 'Тактика' },
  { id: 'structure', label: 'Структура' },
  { id: 'games',     label: 'Партии' },
];

type ShowFilter = 'all' | 'progress' | 'new' | 'done';

function diffLabel(value: number): { text: string; color: string } {
  if (value <= 2) return { text: 'Лёгкий',  color: '#81B64C' };
  if (value <= 3) return { text: 'Средний', color: '#E8A23A' };
  return { text: 'Сложный', color: '#E05757' };
}

function colorText(c: 'white' | 'black' | 'both'): string {
  if (c === 'white') return 'Белыми';
  if (c === 'black') return 'Чёрными';
  return 'За оба';
}

function courseStatus(c: CourseWithStats): 'done' | 'progress' | 'new' {
  if (c.lessonsTotal > 0 && c.lessonsCompleted === c.lessonsTotal) return 'done';
  if (c.lessonsCompleted > 0) return 'progress';
  return 'new';
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [showFilter, setShowFilter] = useState<ShowFilter>('all');
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  // keyboard /
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault(); searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleDelete(id: string) {
    setCourses(prev => prev.filter(c => c.id !== id));
  }
  function handleRename(id: string, name: string) {
    setCourses(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  }

  const totals = useMemo(() => {
    let done = 0, progress = 0, newC = 0;
    let lessonsTotal = 0, lessonsCompleted = 0;
    for (const c of courses) {
      const s = courseStatus(c);
      if (s === 'done') done++;
      else if (s === 'progress') progress++;
      else newC++;
      lessonsTotal += c.lessonsTotal;
      lessonsCompleted += c.lessonsCompleted;
    }
    return { done, progress, newC, lessonsTotal, lessonsCompleted };
  }, [courses]);

  const tabsWithCounts = TABS.map(t => ({
    ...t,
    count: t.id === 'all' ? courses.length : courses.filter(c => (c.kind ?? 'opening') === t.id).length,
  }));

  const filtered = courses.filter(c => {
    if (activeTab !== 'all' && (c.kind ?? 'opening') !== activeTab) return false;
    if (showFilter === 'done'     && courseStatus(c) !== 'done')     return false;
    if (showFilter === 'progress' && courseStatus(c) !== 'progress') return false;
    if (showFilter === 'new'      && courseStatus(c) !== 'new')      return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const leftStyle: React.CSSProperties = {
    width: 280, flexShrink: 0,
    background: 'var(--surface)',
    border: '1px solid var(--hairline)',
    borderRadius: 'var(--radius-card, 0px)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    alignSelf: 'stretch',
  };

  const segBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '5px 2px', border: 'none',
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? 'var(--ivory)' : 'var(--muted)',
    fontSize: 13, fontWeight: active ? 600 : 400,
    cursor: 'pointer', borderRadius: 'var(--radius-btn, 4px)',
    fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', gap: 20, padding: 20, overflow: 'hidden' }}>

        {/* LEFT COLUMN */}
        <section data-ui="co-left" style={leftStyle}>
          <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--ivory)' }}>Курсы</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {totals.lessonsCompleted} из {totals.lessonsTotal} уроков
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{
                height: '100%',
                width: totals.lessonsTotal > 0 ? `${(totals.lessonsCompleted / totals.lessonsTotal) * 100}%` : '0%',
                background: '#81B64C', transition: 'width 0.3s',
              }} />
            </div>

            {/* Stats */}
            <div data-ui="co-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { v: totals.done,     label: 'пройдено', color: '#81B64C' },
                { v: totals.progress, label: 'в работе', color: '#B088D8' },
                { v: totals.newC,     label: 'новых',    color: '#8FB4DA' },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center', padding: '8px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.v}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Kind filter (tabs) */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Тип</div>
            <div data-ui="co-kinds" style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-card, 4px)', padding: 3, marginBottom: 12,
            }}>
              {tabsWithCounts.filter(t => t.count > 0 || t.id === 'all').map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    data-kind={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 10px', border: 'none',
                      background: active ? 'var(--surface)' : 'transparent',
                      color: active ? 'var(--ivory)' : 'var(--muted)',
                      fontSize: 13, fontWeight: active ? 600 : 400,
                      cursor: 'pointer', borderRadius: 'var(--radius-btn, 4px)',
                      fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <span>{tab.label}</span>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>{tab.count}</span>
                  </button>
                );
              })}
            </div>

            {/* Show filter */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Показать</div>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-card, 4px)', padding: 3, marginBottom: 16, flexWrap: 'wrap' }}>
              {(['all','progress','new','done'] as const).map(s => {
                const labels: Record<ShowFilter, string> = { all: 'Все', progress: 'В работе', new: 'Новые', done: 'Пройденные' };
                return (
                  <button key={s} onClick={() => setShowFilter(s)} style={{ ...segBtnStyle(showFilter === s), flex: '1 1 40%' }}>
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
            <Link
              href="/courses/import"
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                padding: '10px 0', background: 'var(--accent)',
                border: '1px solid var(--accent)', borderRadius: 'var(--radius-btn, 4px)',
                color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                marginBottom: 8,
              }}
            >
              Импортировать курс
            </Link>
            <Link
              href="/courses/path"
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                padding: '8px 0', background: 'transparent',
                border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
                color: 'var(--muted)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
                marginBottom: 6,
              }}
            >
              Пути обучения
            </Link>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, opacity: 0.7 }}>
              Курсы импортируются из Markdown-файлов. Пути связывают несколько курсов в маршрут.
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 16, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ivory)', lineHeight: 1.1, fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
                Мои курсы
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
                {courses.length} {courses.length === 1 ? 'курс' : courses.length <= 4 ? 'курса' : 'курсов'}
                {' · '}
                {totals.lessonsTotal} уроков
                {totals.progress > 0 ? ` · ${totals.progress} в работе` : ''}
              </div>
            </div>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                ref={searchRef}
                data-ui="co-search"
                type="text"
                placeholder="Найти курс /"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  height: 36, padding: '0 12px', background: 'var(--surface)',
                  border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
                  color: 'var(--ivory)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  width: 200,
                }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Загрузка…
            </div>
          ) : courses.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 14 }}>
              <div style={{ fontSize: 48, opacity: 0.5 }}>📚</div>
              <div style={{ fontSize: 16, color: 'var(--ivory)', fontWeight: 600 }}>Нет курсов</div>
              <div style={{ fontSize: 13, textAlign: 'center' }}>Импортируй первый курс из Markdown-файла</div>
              <Link href="/courses/import" style={{
                padding: '10px 18px', background: 'var(--accent)', color: '#fff',
                borderRadius: 'var(--radius-btn, 4px)', textDecoration: 'none', fontSize: 14, fontWeight: 600,
              }}>Импортировать курс</Link>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Нет курсов в этой категории
            </div>
          ) : (
            <div
              data-ui="co-grid"
              style={{
                flex: 1, overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gridAutoRows: 'max-content',
                gap: 16, alignContent: 'start',
              }}
            >
              {filtered.map(course => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isHovered={hovered === course.id}
                  onHover={setHovered}
                  onDelete={handleDelete}
                  onRename={handleRename}
                />
              ))}
              <Link
                data-ui="co-add"
                href="/courses/import"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: 24, minHeight: 200,
                  background: 'transparent',
                  border: '2px dashed var(--hairline)',
                  borderRadius: 'var(--radius-card, 0px)',
                  color: 'var(--muted)', textDecoration: 'none',
                  cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ivory)'; (e.currentTarget as HTMLElement).style.color = 'var(--ivory)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
              >
                <span style={{ fontSize: 28 }}>＋</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Новый курс</span>
                <span style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.4, opacity: 0.7 }}>
                  Вставь Markdown — уроки, тесты и партии создадутся сами
                </span>
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function CourseCard({
  course, isHovered, onHover, onDelete, onRename,
}: {
  course: CourseWithStats;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(course.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const kind: CourseKind = course.kind ?? 'opening';
  const kindColor = KIND_COLOR[kind];
  const kindIcon = KIND_ICON[kind];
  const kindLabel = KIND_LABEL[kind];
  const diff = diffLabel(course.difficulty);
  const status = courseStatus(course);
  const pct = course.lessonsTotal > 0 ? (course.lessonsCompleted / course.lessonsTotal) * 100 : 0;

  function startRename(e: React.MouseEvent) {
    e.preventDefault();
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

  const inner = (
    <>
      {/* Top: colored header with kind icon */}
      <div style={{
        position: 'relative',
        padding: '24px 16px 20px',
        background: `linear-gradient(135deg, ${kindColor}26 0%, ${kindColor}0d 100%)`,
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, flexShrink: 0,
          background: kindColor, color: '#fff',
          borderRadius: 'var(--radius-btn, 4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 700,
          boxShadow: `0 2px 8px ${kindColor}40`,
        }}>
          {kindIcon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: kindColor, fontWeight: 600, marginBottom: 2, letterSpacing: '0.02em' }}>
            {kindLabel}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {course.color !== 'both' && <span style={{ marginRight: 6 }}>{course.color === 'white' ? '♔' : '♚'} {colorText(course.color)}</span>}
            <span>{course.lessonsTotal} {course.lessonsTotal === 1 ? 'урок' : course.lessonsTotal <= 4 ? 'урока' : 'уроков'}</span>
          </div>
        </div>
        {status === 'done' && (
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="11.5" fill="#81B64C" />
            <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Below: title + progress + diff */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
              if (e.key === 'Escape') { e.preventDefault(); setRenaming(false); }
            }}
            onClick={e => e.preventDefault()}
            style={{
              fontSize: 15, fontWeight: 700, padding: '4px 8px', width: '100%',
              background: 'var(--bg)', border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-btn, 4px)', color: 'var(--ivory)',
              outline: 'none', fontFamily: 'inherit',
            }}
            disabled={saving}
          />
        ) : (
          <div data-ui="co-title" style={{
            fontSize: 15, fontWeight: 600, color: 'var(--ivory)',
            lineHeight: 1.3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: 40,
          }}>
            {course.name}
          </div>
        )}

        {course.opening && !renaming && (
          <div style={{
            fontSize: 13, color: 'var(--muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {course.opening}
          </div>
        )}

        {/* Progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {course.lessonsCompleted}/{course.lessonsTotal} уроков
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: diff.color }}>{diff.text}</span>
          </div>
          <div style={{ height: 5, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: status === 'done' ? '#81B64C' : status === 'progress' ? '#B088D8' : 'var(--hairline)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      data-ui="co-card"
      data-status={status}
      onMouseEnter={() => onHover(course.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: `1px solid ${isHovered && !renaming && !confirmDelete ? 'rgba(255,255,255,.2)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-card, 0px)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transform: isHovered && !renaming && !confirmDelete ? 'translateY(-2px)' : undefined,
        boxShadow: isHovered && !renaming && !confirmDelete ? '0 8px 20px rgba(0,0,0,.35)' : undefined,
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {renaming || confirmDelete ? (
        <div>{inner}</div>
      ) : (
        <Link href={`/courses/${course.id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
          {inner}
        </Link>
      )}

      {/* Menu: edit / delete (only on hover when not editing) */}
      {isHovered && !renaming && !confirmDelete && (
        <div style={{
          position: 'absolute', right: 10, top: 10, display: 'flex', gap: 4, zIndex: 2,
        }}>
          <button
            onClick={startRename}
            title="Переименовать"
            style={{
              width: 28, height: 28, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
              background: 'rgba(0,0,0,.4)', color: 'var(--ivory)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            onClick={e => { e.preventDefault(); setConfirmDelete(true); }}
            title="Удалить"
            style={{
              width: 28, height: 28, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
              background: 'rgba(0,0,0,.4)', color: 'var(--ivory)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      )}

      {/* Rename save/cancel */}
      {renaming && (
        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 6 }}>
          <button
            onClick={saveRename}
            disabled={saving}
            style={{
              flex: 1, padding: '7px 10px', fontSize: 13, fontWeight: 600,
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-btn, 4px)', cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button
            onClick={() => setRenaming(false)}
            style={{
              flex: 1, padding: '7px 10px', fontSize: 13,
              background: 'transparent', color: 'var(--muted)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-btn, 4px)', cursor: 'pointer',
            }}
          >Отмена</button>
        </div>
      )}

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3,
          background: 'rgba(20,20,18,.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 20, gap: 14, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.4 }}>
            Удалить курс<br /><strong>«{course.name}»</strong>?<br />Это необратимо.
          </div>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button
              onClick={confirmAndDelete}
              disabled={saving}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 600,
                background: '#c0392b', color: '#fff', border: 'none',
                borderRadius: 'var(--radius-btn, 4px)', cursor: saving ? 'default' : 'pointer',
              }}
            >{saving ? 'Удаляю…' : 'Удалить'}</button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13,
                background: 'transparent', color: 'var(--ivory)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-btn, 4px)', cursor: 'pointer',
              }}
            >Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
