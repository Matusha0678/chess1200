'use client';
import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
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

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const weekEntries = entries.filter(e => e.date >= weekAgo);
  const tagCounts = MISTAKE_TAGS
    .map(t => ({ tag: t, count: weekEntries.filter(e => e.tag === t).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <main className="max-w-md mx-auto px-5 pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#444] mb-1">Записи</p>
          <h1 className="text-3xl font-light tracking-tight">Тетрадь ошибок</h1>
        </div>
        <button onClick={() => setShowForm(f => !f)}
          className="p-2 border border-[#1E1E1E] rounded-lg text-[#888] hover:text-[#EFEFEF] hover:border-[#2A2A2A] transition-colors">
          {showForm ? <X size={16} strokeWidth={1.5} /> : <Plus size={16} strokeWidth={1.5} />}
        </button>
      </div>

      {tagCounts.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-2">Топ ошибок — неделя</p>
          <div className="flex gap-2 flex-wrap">
            {tagCounts.map(({ tag: t, count }) => (
              <span key={t} className="text-[10px] tracking-wide border border-[#2A2A2A] text-[#666] px-2.5 py-1 rounded">
                {TAG_LABELS[t]} {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="border border-[#1E1E1E] rounded-lg p-4 mb-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-4">Новая запись</p>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-[#444] block mb-1.5">Ошибка</label>
              <textarea value={mistake} onChange={e => setMistake(e.target.value)}
                placeholder="Что пошло не так..." rows={2}
                className="w-full bg-transparent border-b border-[#1E1E1E] pb-2 text-sm text-[#EFEFEF] placeholder-[#333] resize-none focus:outline-none focus:border-[#444] transition-colors" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-[#444] block mb-1.5">Что делать вместо</label>
              <textarea value={better} onChange={e => setBetter(e.target.value)}
                placeholder="Правильный ответ..." rows={2}
                className="w-full bg-transparent border-b border-[#1E1E1E] pb-2 text-sm text-[#EFEFEF] placeholder-[#333] resize-none focus:outline-none focus:border-[#444] transition-colors" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-[#444] block mb-1.5">Тип</label>
              <select value={tag} onChange={e => setTag(e.target.value)}
                className="bg-transparent border-b border-[#1E1E1E] pb-2 text-sm text-[#888] focus:outline-none focus:border-[#444] transition-colors w-full">
                {MISTAKE_TAGS.map(t => <option key={t} value={t} className="bg-[#111]">{TAG_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={save} disabled={saving || !mistake.trim() || !better.trim()}
              className="flex-1 bg-[#EFEFEF] text-[#080808] text-sm font-medium py-2.5 rounded-lg hover:bg-white transition-colors disabled:opacity-30">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 border border-[#1E1E1E] text-[#555] text-sm rounded-lg hover:border-[#2A2A2A] transition-colors">
              Отмена
            </button>
          </div>
        </div>
      )}

      <div>
        {entries.length === 0 && !showForm && (
          <div className="text-center py-16">
            <p className="text-[#333] text-sm">Записей нет</p>
            <p className="text-[#222] text-xs mt-1">Добавь ошибку после партии</p>
          </div>
        )}
        <div className="space-y-0">
          {entries.map((entry, i) => (
            <div key={entry.id} className={`py-4 ${i < entries.length - 1 ? 'border-b border-[#1A1A1A]' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-[0.12em] text-[#555] border border-[#1E1E1E] px-2 py-0.5 rounded">
                  {TAG_LABELS[entry.tag] ?? entry.tag}
                </span>
                <span className="text-[10px] text-[#333]">{entry.date}</span>
              </div>
              <p className="text-sm text-[#7A4A4A] mb-1">{entry.mistake_text}</p>
              <p className="text-sm text-[#4A7A5A]">{entry.better_move}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
