'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

interface PathMeta { id: string; title: string; }

interface CourseBasic {
  id: string;
  name: string;
  difficulty: number;
  opening?: string | null;
  kind?: string | null;
  topic?: string | null;
}

interface PathItem {
  dbId: string;
  courseId: string;
  course: CourseBasic;
}

interface StepProgress {
  passed: number;
  total: number;
}

interface Props {
  params: Promise<{ pathId: string }>;
}

export default function PathDetailPage({ params }: Props) {
  const { pathId } = use(params);

  const [path, setPath]           = useState<PathMeta | null>(null);
  const [items, setItems]         = useState<PathItem[]>([]);
  const [unlocks, setUnlocks]     = useState<Set<string>>(new Set());
  const [progress, setProgress]   = useState<Map<string, StepProgress>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [editing,   setEditing]   = useState(false);
  const [editItems, setEditItems] = useState<PathItem[]>([]);
  const [available, setAvailable] = useState<CourseBasic[]>([]);
  const [addId,     setAddId]     = useState('');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: pathRow } = await supabase
        .from('course_paths').select('id, title').eq('id', pathId).single();
      if (!pathRow) { setLoading(false); return; }
      setPath(pathRow as PathMeta);

      const { data: rawItems } = await supabase
        .from('course_path_items')
        .select('id, course_id, ord')
        .eq('path_id', pathId)
        .order('ord');

      const courseIds = (rawItems ?? []).map(i => i.course_id as string);

      const coursesData = courseIds.length > 0
        ? (await supabase.from('courses')
            .select('id, name, difficulty, opening, kind, topic')
            .in('id', courseIds)).data ?? []
        : [];
      const courseMap = new Map<string, CourseBasic>(
        coursesData.map(c => [c.id as string, c as CourseBasic])
      );

      const loaded: PathItem[] = (rawItems ?? []).map(i => ({
        dbId: i.id as string,
        courseId: i.course_id as string,
        course: courseMap.get(i.course_id as string) ?? { id: i.course_id as string, name: '…', difficulty: 1 },
      }));
      setItems(loaded);

      const { data: unlockRows } = await supabase
        .from('course_path_unlocks').select('course_id').eq('path_id', pathId);
      setUnlocks(new Set((unlockRows ?? []).map(u => u.course_id as string)));

      const prog = new Map<string, StepProgress>();
      if (courseIds.length > 0) {
        const { data: lessonRows } = await supabase
          .from('course_lessons').select('id, course_id').in('course_id', courseIds);
        const lessonIds = (lessonRows ?? []).map(l => l.id as string);
        const testRows = lessonIds.length > 0
          ? (await supabase.from('lesson_tests').select('lesson_id, score, max').in('lesson_id', lessonIds)).data ?? []
          : [];
        const bestPct = new Map<string, number>();
        for (const t of testRows) {
          const pct = Math.round((t.score / t.max) * 100);
          if (pct > (bestPct.get(t.lesson_id) ?? 0)) bestPct.set(t.lesson_id, pct);
        }
        for (const cid of courseIds) {
          const lessons = (lessonRows ?? []).filter(l => l.course_id === cid);
          const passed = lessons.filter(l => (bestPct.get(l.id) ?? 0) >= 80).length;
          prog.set(cid, { passed, total: lessons.length });
        }
      }
      setProgress(prog);
      setLoading(false);
    }
    load();
  }, [pathId, refreshKey]);

  // ── Status helpers ────────────────────────────────────────────────────────

  function isDone(courseId: string): boolean {
    const p = progress.get(courseId);
    return !!p && p.total > 0 && p.passed === p.total;
  }

  function isOpen(idx: number): boolean {
    if (idx === 0) return true;
    if (unlocks.has(items[idx].courseId)) return true;
    return isDone(items[idx - 1].courseId);
  }

  function getProgressPct(courseId: string): number {
    const p = progress.get(courseId);
    if (!p || p.total === 0) return 0;
    return Math.round((p.passed / p.total) * 100);
  }

  // ── Unlock ────────────────────────────────────────────────────────────────

  async function handleUnlock(courseId: string) {
    await supabase.from('course_path_unlocks').upsert({ path_id: pathId, course_id: courseId });
    setUnlocks(prev => new Set([...prev, courseId]));
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────

  async function startEdit() {
    const { data: allData } = await supabase
      .from('courses').select('id, name, difficulty, opening, kind, topic').order('name');
    setAvailable((allData ?? []) as CourseBasic[]);
    setEditItems([...items]);
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); setAddId(''); }

  async function handleSave() {
    setSaving(true);
    await supabase.from('course_path_items').delete().eq('path_id', pathId);
    if (editItems.length > 0) {
      await supabase.from('course_path_items').insert(
        editItems.map((item, idx) => ({ path_id: pathId, course_id: item.courseId, ord: idx + 1 }))
      );
    }
    setEditing(false);
    setSaving(false);
    setRefreshKey(k => k + 1);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const a = [...editItems];
    [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
    setEditItems(a);
  }

  function moveDown(idx: number) {
    if (idx === editItems.length - 1) return;
    const a = [...editItems];
    [a[idx + 1], a[idx]] = [a[idx], a[idx + 1]];
    setEditItems(a);
  }

  function removeEditItem(idx: number) {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  }

  function handleAdd() {
    const course = available.find(c => c.id === addId);
    if (!course || editItems.some(i => i.courseId === addId)) return;
    setEditItems(prev => [...prev, { dbId: '', courseId: addId, course }]);
    setAddId('');
  }

  const availableToAdd = available.filter(c => !editItems.some(i => i.courseId === c.id));

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ height: 14, width: 80, background: 'var(--track)' }} />
          <div style={{ height: 40, width: '50%', background: 'var(--track)' }} />
          {[0, 1, 2].map(i => <div key={i} style={{ height: 80, background: 'var(--surface)', border: '1px solid var(--hairline)' }} />)}
        </div>
      </main>
    );
  }

  if (!path) {
    return (
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <Link href="/courses/path" style={{ fontSize: 13, color: 'var(--muted)' }}>← Пути</Link>
        <p style={{ color: 'var(--muted)', marginTop: 32 }}>Путь не найден.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px 72px', display: 'flex', flexDirection: 'column', gap: 32, boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/courses/path" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Пути обучения
          </Link>
          <h1 style={{ ...HEADING, margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {path.title}
          </h1>
        </div>

        {!editing ? (
          <button
            onClick={startEdit}
            style={{ height: 40, padding: '0 20px', background: 'transparent', border: '1px solid var(--control)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, marginTop: 24 }}
          >
            Изменить
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              onClick={cancelEdit}
              style={{ height: 40, padding: '0 16px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      {/* ── View mode ────────────────────────────────────────────────────── */}
      {!editing && (
        <>
          {items.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <p style={{ margin: '0 0 20px', fontSize: 16, color: 'var(--muted)' }}>Путь пуст</p>
              <button
                onClick={startEdit}
                style={{ height: 44, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Добавить курсы
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {items.map((item, idx) => {
                const done = isDone(item.courseId);
                const open = isOpen(idx);
                const pct  = getProgressPct(item.courseId);
                const p    = progress.get(item.courseId);

                return (
                  <div key={item.dbId} style={{ padding: '20px 24px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                      {/* Step number */}
                      <span style={{
                        fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
                        color: open ? 'var(--ivory)' : 'var(--track)',
                        fontVariantNumeric: 'tabular-nums', minWidth: 36,
                        lineHeight: 1.1,
                        fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
                      }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      {/* Content */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                          <span style={{ ...HEADING, fontSize: 17, fontWeight: 700, color: open ? 'var(--ivory)' : 'var(--muted)', lineHeight: 1.2 }}>
                            {item.course.name}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: done ? 'var(--ivory)' : open ? 'var(--ivory)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {done
                              ? '✓ Пройдено'
                              : open && pct > 0
                                ? `Пройдено ${pct}%`
                                : open
                                  ? 'Открыто'
                                  : 'Закрыто'}
                          </span>
                        </div>

                        {/* Progress bar */}
                        {open && !done && pct > 0 && p && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, height: 3, background: 'var(--track)', borderRadius: 99 }}>
                              <div style={{ height: '100%', background: 'var(--ivory)', borderRadius: 99, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {p.passed}/{p.total} уроков
                            </span>
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                          {open && !done && (
                            <Link
                              href={`/courses/${item.courseId}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 18px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}
                            >
                              {pct > 0 ? 'Продолжить' : 'Начать'}
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </Link>
                          )}
                          {done && (
                            <Link
                              href={`/courses/${item.courseId}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 16px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 13 }}
                            >
                              Курс →
                            </Link>
                          )}
                          {/* Always visible */}
                          <button
                            onClick={() => handleUnlock(item.courseId)}
                            disabled={open}
                            style={{
                              background: 'transparent', border: 'none', padding: 0,
                              fontSize: 12, cursor: open ? 'default' : 'pointer',
                              color: open ? 'var(--track)' : 'var(--control)',
                              textDecoration: open ? 'none' : 'underline',
                            }}
                          >
                            Открыть без прохождения
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Edit mode ─────────────────────────────────────────────────────── */}
      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {editItems.length === 0 && (
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--muted)' }}>
              Нет шагов. Добавь курсы ниже.
            </p>
          )}

          {editItems.map((item, idx) => (
            <div key={item.courseId} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 20 }}>
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--ivory)' }}>
                {item.course.name}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  title="Выше"
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--hairline)', color: idx === 0 ? 'var(--track)' : 'var(--muted)', cursor: idx === 0 ? 'default' : 'pointer' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === editItems.length - 1}
                  title="Ниже"
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--hairline)', color: idx === editItems.length - 1 ? 'var(--track)' : 'var(--muted)', cursor: idx === editItems.length - 1 ? 'default' : 'pointer' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                </button>
                <button
                  onClick={() => removeEditItem(idx)}
                  title="Удалить из пути"
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', cursor: 'pointer' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          ))}

          {/* Add course */}
          <div style={{ display: 'flex', gap: 8, padding: '16px 0 0', flexWrap: 'wrap' }}>
            <select
              value={addId}
              onChange={e => setAddId(e.target.value)}
              style={{ flex: 1, minWidth: 200, height: 40, padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', color: addId ? 'var(--ivory)' : 'var(--muted)', fontSize: 14, outline: 'none' }}
            >
              <option value="">— выбрать курс —</option>
              {availableToAdd.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!addId}
              style={{ height: 40, padding: '0 20px', background: addId ? 'var(--ivory)' : 'var(--track)', color: addId ? 'var(--ink)' : 'var(--muted)', border: 'none', fontSize: 14, fontWeight: 600, cursor: addId ? 'pointer' : 'not-allowed' }}
            >
              Добавить
            </button>
          </div>
          {availableToAdd.length === 0 && available.length > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Все курсы уже в пути.{' '}
              <Link href="/courses/import" style={{ color: 'var(--ivory)' }}>Импортировать ещё →</Link>
            </p>
          )}
          {available.length === 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Нет импортированных курсов.{' '}
              <Link href="/courses/import" style={{ color: 'var(--ivory)' }}>Импортировать →</Link>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
