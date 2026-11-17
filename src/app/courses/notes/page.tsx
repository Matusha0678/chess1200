'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NoteRow {
  id: string;
  lesson_id: string;
  ply: number;
  body: string;
  kind: 'note' | 'confused';
  resolved: boolean;
  created_at: string;
}

interface LessonInfo {
  id: string;
  title: string;
  course_id: string;
  courseTitle: string;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [notes, setNotes]         = useState<NoteRow[]>([]);
  const [lessonMap, setLessonMap] = useState<Record<string, LessonInfo>>({});
  const [loading, setLoading]     = useState(true);
  const [filterKind, setFilterKind] = useState<'' | 'note' | 'confused'>('');
  const [filterResolved, setFilterResolved] = useState(false);
  const [sqlMissing, setSqlMissing] = useState(false);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKind, filterResolved]);

  async function load() {
    setLoading(true);
    let q = supabase.from('lesson_notes').select('*').order('created_at', { ascending: false }).limit(200);
    if (filterKind) q = q.eq('kind', filterKind);
    if (!filterResolved) q = q.eq('resolved', false);
    const { data, error } = await q;
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        setSqlMissing(true);
      }
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as NoteRow[];
    setNotes(rows);

    // Load lesson + course info
    const lessonIds = [...new Set(rows.map(r => r.lesson_id))];
    if (lessonIds.length > 0) {
      const { data: lessonsData } = await supabase
        .from('course_lessons')
        .select('id, title, course_id')
        .in('id', lessonIds);
      const lessons = (lessonsData ?? []) as Array<{ id: string; title: string; course_id: string }>;
      const courseIds = [...new Set(lessons.map(l => l.course_id))];
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, name')
        .in('id', courseIds);
      const courseNameMap: Record<string, string> = {};
      for (const c of (coursesData ?? []) as Array<{ id: string; name: string }>) {
        courseNameMap[c.id] = c.name;
      }
      const map: Record<string, LessonInfo> = {};
      for (const l of lessons) {
        map[l.id] = { id: l.id, title: l.title, course_id: l.course_id, courseTitle: courseNameMap[l.course_id] ?? 'Курс' };
      }
      setLessonMap(map);
    }
    setLoading(false);
  }

  async function markResolved(id: string) {
    await supabase.from('lesson_notes').update({ resolved: true }).eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  if (sqlMissing) {
    return (
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 72px', boxSizing: 'border-box' }}>
        <Link href="/courses" style={{ fontSize: 13, color: 'var(--muted)' }}>← Курсы</Link>
        <div style={{ marginTop: 32, padding: '20px 24px', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>
          Таблица <code>lesson_notes</code> не создана.<br />
          Выполни <strong>supabase/18-lesson-notes.sql</strong> в Supabase.
        </div>
      </main>
    );
  }

  const confusedCount = notes.filter(n => n.kind === 'confused').length;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 72px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <Link href="/courses" style={{ fontSize: 13, color: 'var(--muted)' }}>← Курсы</Link>
        <h1 style={{ margin: '12px 0 4px', fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          Заметки
        </h1>
        {confusedCount > 0 && (
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(220,80,60,0.9)' }}>
            Не понял: <strong>{confusedCount}</strong>
          </p>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterKind} onChange={e => setFilterKind(e.target.value as '' | 'note' | 'confused')}
          style={{ height: 34, padding: '0 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--ivory)', border: '1px solid var(--hairline)', cursor: 'pointer', outline: 'none' }}>
          <option value="">Все типы</option>
          <option value="note">Заметки</option>
          <option value="confused">Не понял</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={filterResolved} onChange={e => setFilterResolved(e.target.checked)} />
          Показать решённые
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      ) : notes.length === 0 ? (
        <div style={{ padding: '32px 0', color: 'var(--muted)', fontSize: 14 }}>Нет заметок</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(note => {
            const info = lessonMap[note.lesson_id];
            const href = info ? `/courses/${info.course_id}/${note.lesson_id}?ply=${note.ply}` : '#';
            return (
              <div key={note.id} style={{ padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1, color: note.kind === 'confused' ? 'rgba(220,80,60,0.9)' : 'rgba(100,180,255,0.9)' }}>
                  {note.kind === 'confused' ? '?' : '✎'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {info && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.06em' }}>
                      {info.courseTitle} → {info.title} · ход {note.ply}
                    </div>
                  )}
                  <div style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>{note.body}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <Link href={href} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', border: '1px solid var(--hairline)', padding: '3px 8px' }}>
                    Открыть
                  </Link>
                  <button onClick={() => void markResolved(note.id)} style={{ fontSize: 12, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--hairline)', padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Понял
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
