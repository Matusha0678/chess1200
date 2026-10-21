'use client';
import { useState, useEffect } from 'react';
import { Plus, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MISTAKE_TAGS } from '@/lib/constants';
import type { MistakeEntry } from '@/types';

const TAG_LABELS: Record<string, string> = {
  'зевок_ферзя':  'Зевок ферзя',
  'зевок_фигуры': 'Зевок фигуры',
  'упустил_мат':  'Упустил мат',
  'время':        'Время',
  'эндшпиль':     'Эндшпиль',
  'дебют':        'Дебют',
};

export default function NotebookPage() {
  const [entries, setEntries] = useState<MistakeEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [mistake, setMistake] = useState('');
  const [better, setBetter] = useState('');
  const [tag, setTag] = useState(MISTAKE_TAGS[0]);
  const [saving, setSaving] = useState(false);

  async function loadEntries() {
    const { data } = await supabase.from('mistake_notebook').select('*').order('created_at', { ascending: false }).limit(50);
    if (data) setEntries(data as MistakeEntry[]);
  }

  useEffect(() => { loadEntries(); }, []);

  async function save() {
    if (!mistake.trim() || !better.trim()) return;
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('mistake_notebook').insert({ date: today, mistake_text: mistake.trim(), better_move: better.trim(), tag });
    setMistake(''); setBetter(''); setShowForm(false);
    await loadEntries();
    setSaving(false);
  }

  // Top 3 tags this week
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const weekEntries = entries.filter(e => e.date >= weekAgo);
  const tagCounts = MISTAKE_TAGS.map(t => ({ tag: t, count: weekEntries.filter(e => e.tag === t).length }))
    .filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);

  return (
    <main className="max-w-md mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Тетрадь ошибок</h1>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-3 py-2 rounded-lg text-sm transition-colors">
          <Plus size={16} /> Добавить
        </button>
      </div>

      {tagCounts.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Tag size={12} /> Топ-3 этой недели</p>
          <div className="flex gap-2 flex-wrap">
            {tagCounts.map(({ tag: t, count }) => (
              <span key={t} className="bg-amber-900/40 border border-amber-800 text-amber-300 text-xs px-2 py-1 rounded-lg">
                {TAG_LABELS[t]} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800/80 rounded-xl p-4 mb-4 border border-slate-700">
          <p className="text-sm font-semibold mb-3">Новая запись</p>
          <textarea value={mistake} onChange={e => setMistake(e.target.value)}
            placeholder="Опиши ошибку..." rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 placeholder-slate-500 resize-none mb-2 focus:outline-none focus:border-amber-500" />
          <textarea value={better} onChange={e => setBetter(e.target.value)}
            placeholder="Что надо было сделать..." rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 placeholder-slate-500 resize-none mb-2 focus:outline-none focus:border-amber-500" />
          <select value={tag} onChange={e => setTag(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 mb-3 focus:outline-none focus:border-amber-500">
            {MISTAKE_TAGS.map(t => <option key={t} value={t}>{TAG_LABELS[t]}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {entries.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-8">Ошибок ещё нет — добавь первую после партии</p>
        )}
        {entries.map(entry => (
          <div key={entry.id} className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-xs bg-amber-900/40 border border-amber-800 text-amber-300 px-2 py-0.5 rounded">
                {TAG_LABELS[entry.tag] ?? entry.tag}
              </span>
              <span className="text-xs text-slate-500">{entry.date}</span>
            </div>
            <p className="text-sm text-red-300 mb-1">❌ {entry.mistake_text}</p>
            <p className="text-sm text-green-300">✓ {entry.better_move}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
