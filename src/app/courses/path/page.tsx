'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface PathRow {
  id: string;
  title: string;
  created_at: string;
  stepCount: number;
}

export default function CoursePathsPage() {
  const router = useRouter();
  const [paths, setPaths] = useState<PathRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: pathsData }, { data: itemsData }] = await Promise.all([
        supabase.from('course_paths').select('id, title, created_at').order('created_at', { ascending: false }),
        supabase.from('course_path_items').select('path_id'),
      ]);
      const counts = new Map<string, number>();
      for (const item of itemsData ?? []) {
        counts.set(item.path_id, (counts.get(item.path_id) ?? 0) + 1);
      }
      setPaths((pathsData ?? []).map(p => ({ ...p, stepCount: counts.get(p.id) ?? 0 })));
      setLoading(false);
    }
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('course_paths')
      .insert({ title: title.trim() })
      .select('id')
      .single();
    setCreating(false);
    if (!error && data) router.push(`/courses/path/${data.id}`);
  }

  function plural(n: number, one: string, few: string, many: string) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
    return `${n} ${many}`;
  }

  return (
    <div className="page">

      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/courses" className="page-back">← Курсы</Link>
          <h1 className="page-title">Пути обучения</h1>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="ui-btn ui-btn-primary">+ Создать путь</button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="ui-card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Название пути…"
            autoFocus
            className="ui-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="submit" disabled={creating || !title.trim()} className="ui-btn ui-btn-primary">
            {creating ? 'Создание…' : 'Создать'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="ui-btn ui-btn-outline">Отмена</button>
        </form>
      )}

      {/* Paths list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="animate-pulse" style={{ height: 72, background: 'var(--surface)', border: '1px solid var(--hairline)' }} />
          ))}
        </div>
      ) : paths.length === 0 ? (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <p style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 600, color: 'var(--muted)' }}>Нет путей</p>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--muted)' }}>
            Создай учебный путь из нескольких курсов
          </p>
          <button
            onClick={() => setShowForm(true)}
            style={{ height: 48, padding: '0 32px', background: 'var(--ivory)', color: 'var(--ink)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Создать первый путь
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paths.map((path, i) => (
            <Link key={path.id} href={`/courses/path/${path.id}`} className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 20, textDecoration: 'none' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 20, fontWeight: 600 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--ivory)' }}>{path.title}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {plural(path.stepCount, 'шаг', 'шага', 'шагов')}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
