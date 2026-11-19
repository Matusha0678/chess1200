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
  opening: 'var(--muted)',
  theme: 'color-mix(in srgb, var(--accent) 70%, var(--ivory))',
  endgame: 'color-mix(in srgb, var(--accent) 60%, var(--muted))',
  tactics: 'var(--accent)',
  structure: 'var(--accent)',
  games: 'var(--c-bad)',
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

function plural(n: number, one: string, few: string, many: string): string {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 19) return `${n} ${many}`;
  if (m10 === 1)                 return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4)      return `${n} ${few}`;
  return `${n} ${many}`;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--muted)',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
};

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
    flex: 1, padding: '6px 4px', border: 'none',
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
          <div style={{ padding: '20px 20px 18px', flexShrink: 0 }}>
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
                background: 'var(--accent)', transition: 'width 0.3s',
              }} />
            </div>

            {/* Stats */}
            <div data-ui="co-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
              {[
                { v: totals.done,     label: 'пройдено', color: 'var(--ivory)' },
                { v: totals.progress, label: 'в работе', color: 'color-mix(in srgb, var(--accent) 65%, var(--ivory))' },
                { v: totals.newC,     label: 'новых',    color: 'var(--muted)' },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center', padding: '8px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.v}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Primary CTA — now inline with filters, not banished to the bottom */}
            <Link
              href="/courses/import"
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                padding: '10px 0', background: 'var(--accent)',
                border: '1px solid var(--accent)', borderRadius: 'var(--radius-btn, 4px)',
                color: 'var(--accent-contrast, #fff)', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                marginBottom: 18,
              }}
            >
              Импортировать курс
            </Link>

            {/* Kind filter (tabs) */}
            <div style={sectionLabelStyle}>Тип</div>
            <div data-ui="co-kinds" style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-card, 4px)', padding: 3, marginBottom: 14,
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
            <div style={sectionLabelStyle}>Показать</div>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-card, 4px)', padding: 3, flexWrap: 'wrap', marginBottom: 18 }}>
              {(['all','progress','new','done'] as const).map(s => {
                const labels: Record<ShowFilter, string> = { all: 'Все', progress: 'В работе', new: 'Новые', done: 'Пройденные' };
                return (
                  <button key={s} onClick={() => setShowFilter(s)} style={{ ...segBtnStyle(showFilter === s), flex: '1 1 40%' }}>
                    {labels[s]}
                  </button>
                );
              })}
            </div>

            {/* Secondary link + hint — grouped with filters, not banished to the bottom */}
            <Link
              href="/courses/path"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', background: 'transparent',
                border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
                color: 'var(--ivory)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
                marginBottom: 10,
              }}
            >
              <span>Пути обучения</span>
              <span style={{ opacity: 0.5, fontSize: 14 }}>→</span>
            </Link>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, opacity: 0.75 }}>
              Курсы импортируются из Markdown. Пути связывают несколько курсов в маршрут.
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 16, flexShrink: 0, gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ivory)',
                lineHeight: 1.1, fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
              }}>
                Мои курсы
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
                {courses.length > 0
                  ? <>
                      {plural(courses.length, 'курс', 'курса', 'курсов')} · {plural(totals.lessonsTotal, 'урок', 'урока', 'уроков')}
                      {totals.progress > 0 ? ` · ${totals.progress} в работе` : ''}
                    </>
                  : 'Пока ни одного курса'}
              </div>
            </div>
            <div style={{ position: 'relative', flexShrink: 0, width: 260 }}>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                ref={searchRef}
                data-ui="co-search"
                type="text"
                placeholder="Найти курс…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  height: 36, width: '100%', padding: '0 42px 0 34px', background: 'var(--surface)',
                  border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
                  color: 'var(--ivory)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <kbd style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11, color: 'var(--muted)', padding: '2px 6px',
                border: '1px solid var(--hairline)', borderRadius: 4, lineHeight: 1,
                fontFamily: 'inherit',
              }}>/</kbd>
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
                padding: '10px 18px', background: 'var(--accent)', color: 'var(--accent-contrast, #fff)',
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
                  gap: 10, padding: 24, minHeight: 240,
                  background: 'transparent',
                  border: '2px dashed var(--hairline)',
                  borderRadius: 'var(--radius-card, 0px)',
                  color: 'var(--muted)', textDecoration: 'none',
                  cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ivory)'; (e.currentTarget as HTMLElement).style.color = 'var(--ivory)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
              >
                <span style={{ fontSize: 32, lineHeight: 1 }}>＋</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Новый курс</span>
                <span style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.4, opacity: 0.7, maxWidth: 200 }}>
                  Вставь Markdown — уроки, тесты и партии появятся сами
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

  const progressTint = status === 'done'
    ? 'var(--accent)'
    : status === 'progress'
      ? 'var(--accent)'
      : 'var(--hairline)';

  const inner = (
    <>
      {/* Thin colored kind stripe */}
      <div style={{ height: 3, background: kindColor, flexShrink: 0 }} />

      <div style={{ padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {/* Top meta row: kind icon + label + color */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 }}>
          <div style={{
            width: 28, height: 28, flexShrink: 0,
            background: `${kindColor}1f`, color: kindColor,
            borderRadius: 'var(--radius-btn, 4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700,
          }}>
            {kindIcon}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--muted)', fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
          }}>
            {kindLabel}
            {course.color !== 'both' && (
              <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                · {course.color === 'white' ? '♔' : '♚'} {colorText(course.color)}
              </span>
            )}
          </div>
          {status === 'done' && (
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0, color: 'var(--accent)' }} aria-hidden="true">
              <circle cx="12" cy="12" r="11.5" fill="currentColor" />
              <path d="M7 12.5l3.2 3.2L17 9" stroke="var(--accent-contrast)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {/* Title */}
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
              fontSize: 16, fontWeight: 700, padding: '4px 8px', width: '100%',
              background: 'var(--bg)', border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-btn, 4px)', color: 'var(--ivory)',
              outline: 'none', fontFamily: 'inherit',
            }}
            disabled={saving}
          />
        ) : (
          <div data-ui="co-title" style={{
            fontSize: 16, fontWeight: 700, color: 'var(--ivory)',
            lineHeight: 1.3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: 42,
          }}>
            {course.name}
          </div>
        )}

        {course.opening && !renaming && (
          <div style={{
            fontSize: 13, color: 'var(--muted)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: -4,
          }}>
            {course.opening}
          </div>
        )}

        {/* Difficulty — subtle dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
          <span>Сложность</span>
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: n <= course.difficulty ? 'var(--muted)' : 'var(--hairline)',
                  opacity: n <= course.difficulty ? 0.8 : 1,
                }}
              />
            ))}
          </span>
        </div>

        {/* Spacer pushes progress to bottom when card is tall */}
        <div style={{ flex: 1, minHeight: 2 }} />

        {/* Progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--ivory)', fontWeight: 500 }}>
              {course.lessonsCompleted} / {course.lessonsTotal} уроков
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {status === 'done'     && 'пройдено'}
              {status === 'progress' && `${Math.round(pct)}%`}
              {status === 'new'      && 'не начат'}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: progressTint, transition: 'width 0.3s',
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
              background: 'var(--accent)', color: 'var(--accent-contrast, #fff)', border: 'none',
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
                background: 'var(--c-bad)', color: '#fff', border: 'none',
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
