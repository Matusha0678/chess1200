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
    <main className="px-5 pt-8 pb-8 md:px-12 md:pt-12 max-w-2xl">

      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#444] mb-3">Записи</p>
          <h1 className="font-cormorant text-[56px] font-light italic leading-[0.9] text-[#EAE8E3]">
            Тетрадь
          </h1>
        </div>
        <button onClick={() => setShowForm(f => !f)}
          className="mt-4 p-2 border border-[#181818] text-[#555] hover:text-[#EAE8E3] hover:border-[#2A2A2A] transition-colors">
          {showForm ? <X size={15} strokeWidth={1.5} /> : <Plus size={15} strokeWidth={1.5} />}
        </button>
      </div>

      {/* Top errors this week */}
      {tagCounts.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#333] mb-3">Топ ошибок — неделя</p>
          <div className="flex gap-2 flex-wrap">
            {tagCounts.map(({ tag: t, count }) => (
              <span key={t} className="text-[10px] tracking-wide border border-[#181818] text-[#555] px-2.5 py-1">
                {TAG_LABELS[t]} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="border border-[#181818] p-5 mb-6">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#333] mb-5">Новая запись</p>
          <div className="space-y-5">
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-[#333] block mb-2">Ошибка</label>
              <textarea value={mistake} onChange={e => setMistake(e.target.value)}
                placeholder="Что пошло не так..." rows={2}
                className="w-full bg-transparent border-b border-[#181818] pb-2 text-sm text-[#EAE8E3] placeholder-[#252525] resize-none focus:outline-none focus:border-[#333] transition-colors" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-[#333] block mb-2">Что делать вместо</label>
              <textarea value={better} onChange={e => setBetter(e.target.value)}
                placeholder="Правильный ответ..." rows={2}
                className="w-full bg-transparent border-b border-[#181818] pb-2 text-sm text-[#EAE8E3] placeholder-[#252525] resize-none focus:outline-none focus:border-[#333] transition-colors" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-[#333] block mb-2">Тип</label>
              <select value={tag} onChange={e => setTag(e.target.value)}
                className="bg-transparent border-b border-[#181818] pb-2 text-sm text-[#666] focus:outline-none focus:border-[#333] transition-colors w-full">
                {MISTAKE_TAGS.map(t => <option key={t} value={t} className="bg-[#0D0D0D]">{TAG_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={save} disabled={saving || !mistake.trim() || !better.trim()}
              className="flex-1 bg-[#EAE8E3] text-[#0D0D0D] text-sm font-medium py-3 hover:bg-white transition-colors disabled:opacity-30">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 border border-[#181818] text-[#444] text-sm hover:border-[#2A2A2A] transition-colors">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Entries */}
      <div>
        {entries.length === 0 && !showForm && (
          <div className="text-center py-16">
            <p className="font-cormorant text-2xl font-light text-[#252525] italic">Записей нет</p>
            <p className="text-[10px] text-[#1E1E1E] uppercase tracking-widest mt-2">Добавь ошибку после партии</p>
          </div>
        )}
        {entries.map((entry, i) => (
          <div key={entry.id} className={`py-4 ${i < entries.length - 1 ? 'border-b border-[#181818]' : ''}`}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[9px] uppercase tracking-[0.15em] text-[#444] border border-[#181818] px-2 py-0.5">
                {TAG_LABELS[entry.tag] ?? entry.tag}
              </span>
              <span className="text-[10px] text-[#2A2A2A]">{entry.date}</span>
            </div>
            <p className="text-sm text-[#7A4A4A] mb-1.5 leading-relaxed">{entry.mistake_text}</p>
            <p className="text-sm text-[#4A7A5A] leading-relaxed">{entry.better_move}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
