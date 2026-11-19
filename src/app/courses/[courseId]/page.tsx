'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Course, CourseLesson, LessonProgress, LessonLine, TestQuestion } from '@/types/courses';
import { LessonTest } from '@/components/LessonTest';

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
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<LessonWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [weakSpots, setWeakSpots] = useState<WeakSpot[]>([]);
  const [latestTestMap, setLatestTestMap] = useState<Record<string, { score: number; max: number; pct: number }>>({});
  const [showWeakTest, setShowWeakTest] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  async function saveRename() {
    if (!course) return;
    const trimmed = renameVal.trim();
    if (!trimmed || trimmed === course.name) { setRenaming(false); return; }
    setActionSaving(true);
    await supabase.from('courses').update({ name: trimmed }).eq('id', courseId);
    setCourse(prev => prev ? { ...prev, name: trimmed } : prev);
    setRenaming(false);
    setActionSaving(false);
  }

  async function deleteCourse() {
    setActionSaving(true);
    const lIds = lessons.map(l => l.id);
    if (lIds.length > 0) {
      await supabase.from('lesson_tests').delete().in('lesson_id', lIds);
      await supabase.from('lesson_progress').delete().in('lesson_id', lIds);
      await supabase.from('lesson_notes').delete().in('lesson_id', lIds);
      await supabase.from('lesson_lines').delete().in('lesson_id', lIds);
      await supabase.from('course_lessons').delete().eq('course_id', courseId);
    }
    await supabase.from('courses').delete().eq('id', courseId);
    router.push('/courses');
  }

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
      <div className="page animate-pulse">
        <div style={{ height: 14, width: 80, background: 'var(--track)', borderRadius: 4 }} />
        <div style={{ height: 52, width: '55%', background: 'var(--track)', borderRadius: 'var(--radius-card)' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 72, background: 'var(--surface)', borderRadius: 'var(--radius-card)' }} />
        ))}
      </div>
    );
  }

  if (!course) {
    return (
      <div className="page">
        <Link href="/courses" className="page-back">← Курсы</Link>
        <p style={{ color: 'var(--muted)' }}>Курс не найден.</p>
      </div>
    );
  }

  const completedCount = lessons.filter(l => l.progress?.completed).length;

  return (
    <div className="page">
      {/* Course header */}
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/courses" className="page-back">← Курсы</Link>
          {renaming ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={renameInputRef}
                className="ui-input"
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
                style={{ fontSize: 22, fontWeight: 700, padding: '6px 10px', flex: 1 }}
                disabled={actionSaving}
              />
              <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={saveRename} disabled={actionSaving}>Сохранить</button>
              <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setRenaming(false)}>Отмена</button>
            </div>
          ) : (
            <h1 className="page-title">{course.name}</h1>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <ColorLabel color={course.color} />
            {course.opening && (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{course.opening}</span>
            )}
            <DifficultyDots value={course.difficulty} />
          </div>
          {course.description && (
            <p className="page-lead">{course.description}</p>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div className="progress-track" style={{ width: 120 }}>
                <div className="progress-fill" style={{ width: `${lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0}%` }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{completedCount}/{lessons.length}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Link href={`/courses/${courseId}/roadmap`} className="ui-btn" style={{ textDecoration: 'none', background: 'var(--accent)', color: '#fff', border: 'none' }}>
            Дорожная карта
          </Link>
          <Link href={`/courses/${courseId}/cheatsheet`} className="ui-btn ui-btn-outline" style={{ textDecoration: 'none' }}>
            Шпаргалка
          </Link>
          {!renaming && (
            <button
              className="ui-btn ui-btn-outline"
              onClick={() => { setRenameVal(course.name); setRenaming(true); setTimeout(() => renameInputRef.current?.select(), 0); }}
            >
              Переименовать
            </button>
          )}
          <button
            className="ui-btn ui-btn-outline"
            onClick={() => setConfirmDelete(true)}
            style={{ color: 'var(--c-bad)', borderColor: 'var(--c-bad)' }}
          >
            Удалить
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--bg)', border: '1px solid var(--c-bad)' }}>
          <span style={{ flex: 1, fontSize: 14, color: 'var(--ivory)' }}>
            Удалить курс «{course.name}» и все {lessons.length} уроков? Это необратимо.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ui-btn ui-btn-sm" onClick={deleteCourse} disabled={actionSaving}
              style={{ background: 'var(--c-bad)', color: '#fff', border: 'none', borderRadius: 'var(--radius-btn)' }}>
              {actionSaving ? 'Удаляю…' : 'Удалить'}
            </button>
            <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setConfirmDelete(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Lessons list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {lessons.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Нет уроков</div>
            <div className="empty-state-text">В этом курсе пока нет уроков.</div>
          </div>
        ) : (
          lessons.map((lesson, idx) => {
            const done = lesson.progress?.completed ?? false;
            return (
              <div key={lesson.id} className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Number */}
                <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>

                {/* Completion indicator */}
                {done ? (
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                ) : (
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
                )}

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', lineHeight: 1.2 }}>{lesson.title}</span>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                    <span>{lesson.moveCount} ходов</span>
                    {done && <span style={{ color: 'var(--accent)' }}>✓ Пройден</span>}
                    {latestTestMap[lesson.id] !== undefined && (
                      <span style={{ color: latestTestMap[lesson.id].pct >= 80 ? 'var(--accent)' : 'var(--muted)' }}>
                        {latestTestMap[lesson.id].pct}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <Link href={`/courses/${courseId}/${lesson.id}`} className="ui-btn ui-btn-outline ui-btn-sm" style={{ textDecoration: 'none' }}>
                    Изучить
                  </Link>
                  <Link href={`/courses/${courseId}/${lesson.id}?mode=play`} className="ui-btn ui-btn-primary ui-btn-sm" style={{ textDecoration: 'none' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hairline)', paddingBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ivory)' }}>Слабые места</h2>
            <button onClick={() => setShowWeakTest(true)} className="ui-btn ui-btn-outline ui-btn-sm">
              Повторить ({weakSpots.length})
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {weakSpots.slice(0, 5).map((ws, i) => (
              <div key={i} className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
    </div>
  );
}
