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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKind, filterResolved]);

  async function markResolved(id: string) {
    await supabase.from('lesson_notes').update({ resolved: true }).eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  if (sqlMissing) {
    return (
      <div className="page">
        <Link href="/courses" className="page-back">← Курсы</Link>
        <div className="ui-card" style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>
          Таблица <code>lesson_notes</code> не создана.<br />
          Выполни <strong>supabase/18-lesson-notes.sql</strong> в Supabase.
        </div>
      </div>
    );
  }

  const confusedCount = notes.filter(n => n.kind === 'confused').length;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/courses" className="page-back">← Курсы</Link>
          <h1 className="page-title">Заметки</h1>
          {confusedCount > 0 && (
            <p className="page-lead">Не понял: <strong style={{ color: 'rgba(220,80,60,0.9)' }}>{confusedCount}</strong></p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterKind} onChange={e => setFilterKind(e.target.value as '' | 'note' | 'confused')} className="ui-input" style={{ width: 'auto' }}>
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
        <div className="empty-state">
          <div className="empty-state-title">Нет заметок</div>
          <div className="empty-state-text">Заметки появятся здесь когда ты добавишь их в уроках.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(note => {
            const info = lessonMap[note.lesson_id];
            const href = info ? `/courses/${info.course_id}/${note.lesson_id}?ply=${note.ply}` : '#';
            return (
              <div key={note.id} className="ui-card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1, color: note.kind === 'confused' ? 'rgba(220,80,60,0.9)' : 'rgba(100,180,255,0.9)' }}>
                  {note.kind === 'confused' ? '?' : '✎'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {info && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                      {info.courseTitle} → {info.title} · ход {note.ply}
                    </div>
                  )}
                  <div style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>{note.body}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <Link href={href} className="ui-btn ui-btn-outline ui-btn-sm" style={{ textDecoration: 'none', fontSize: 12 }}>
                    Открыть
                  </Link>
                  <button onClick={() => void markResolved(note.id)} className="ui-btn ui-btn-outline ui-btn-sm" style={{ fontSize: 12 }}>
                    Понял
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
