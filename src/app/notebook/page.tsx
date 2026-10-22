'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MISTAKE_TAGS } from '@/lib/constants';
import { getCurrentDay } from '@/lib/day-utils';
import type { MistakeEntry } from '@/types';

export default function NotebookPage() {
  const [entries, setEntries] = useState<MistakeEntry[]>([]);
  const [link, setLink] = useState('');
  const [mistake, setMistake] = useState('');
  const [lesson, setLesson] = useState('');
  const [saving, setSaving] = useState(false);

  const day = getCurrentDay();

  async function loadEntries() {
    const { data } = await supabase
      .from('mistake_notebook')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setEntries(data as MistakeEntry[]);
  }

  useEffect(() => { loadEntries(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!mistake.trim()) return;
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('mistake_notebook').insert({
      date: today,
      mistake_text: mistake.trim(),
      better_move: lesson.trim(),
      tag: MISTAKE_TAGS[0],
    });
    setLink(''); setMistake(''); setLesson('');
    await loadEntries();
    setSaving(false);
  }

  const n = entries.length;
  const countLabel = n === 0 ? 'Пока пусто' : `Записей: ${n}`;

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  return (
    <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">

      {/* Page title */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center gap-[14px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF]">
          <span>Записи</span>
          <span className="w-10 h-px bg-[#303030]" />
          <span className="text-[#A0A0A0]">После каждой партии</span>
        </div>
        <h1 className="m-0 text-[48px] font-[500] leading-[1] tracking-[-0.01em]">
          Тетрадь
        </h1>
        <p className="m-0 text-[15px] text-[#BCBCBC]">
          Одна партия — одна главная ошибка. Запиши, пока свежо.
        </p>
      </div>

      <div className="flex flex-wrap gap-6 items-start">

        {/* Form – side */}
        <form
          onSubmit={save}
          className="flex-[1_1_360px] min-w-0 bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-7 md:p-8 flex flex-col gap-5"
        >
          <div className="flex justify-between items-center">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Новая запись</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]" htmlFor="nb-link">
              Ссылка на партию
            </label>
            <input
              id="nb-link"
              type="url"
              placeholder="https://www.chess.com/game/…"
              value={link}
              onChange={e => setLink(e.target.value)}
              className="w-full box-border h-11 bg-[#0F0E0B] border border-[#303030] rounded-[10px] px-4 text-[#F5F5F5] text-[15px] outline-none placeholder-[#686868] focus:border-[#FFFFFF] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]" htmlFor="nb-mistake">
              Главная ошибка
            </label>
            <textarea
              id="nb-mistake"
              rows={3}
              placeholder="Что пошло не так?"
              value={mistake}
              onChange={e => setMistake(e.target.value)}
              className="w-full box-border bg-[#0F0E0B] border border-[#303030] rounded-[10px] px-4 py-3 text-[#F5F5F5] text-[15px] leading-[1.5] outline-none placeholder-[#686868] focus:border-[#FFFFFF] resize-none transition-colors font-[inherit]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]" htmlFor="nb-lesson">
              Вывод на будущее
            </label>
            <textarea
              id="nb-lesson"
              rows={2}
              placeholder="Что буду делать иначе"
              value={lesson}
              onChange={e => setLesson(e.target.value)}
              className="w-full box-border bg-[#0F0E0B] border border-[#303030] rounded-[10px] px-4 py-3 text-[#F5F5F5] text-[15px] leading-[1.5] outline-none placeholder-[#686868] focus:border-[#FFFFFF] resize-none transition-colors font-[inherit]"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !mistake.trim()}
            className="h-11 px-6 rounded-full border-0 bg-white text-[#050505] text-[14px] font-semibold cursor-pointer hover:bg-[#F0F0F0] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Сохранение...' : 'Сохранить запись'}
          </button>
        </form>

        {/* Entries list – main */}
        <section aria-label="Записи" className="flex-[999_1_600px] min-w-0 bg-[#0D0D0D] border border-[#262626] rounded-[20px]">
          <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#262626]">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Мои ошибки</span>
            <span className="text-[13px] text-[#A0A0A0]">{countLabel}</span>
          </div>

          {n === 0 && (
            <div className="py-16 px-8 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full border border-[#303030] flex items-center justify-center text-[#FFFFFF]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2.5z" />
                  <path d="M9 7h6M9 11h4" />
                </svg>
              </div>
              <p className="m-0 text-[26px] font-[500] leading-[1.15]">Записей нет</p>
              <p className="m-0 text-[14px] text-[#A0A0A0]">Добавь ошибку после партии.</p>
            </div>
          )}

          {entries.map((entry, i) => (
            <article
              key={entry.id}
              className={`flex flex-col gap-2 px-5 py-[18px] ${i > 0 ? 'border-t border-[#1E1E1E]' : ''}`}
            >
              <div className="flex justify-between gap-3">
                <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF]">
                  {formatDate(entry.date)} · День {day - (n - 1 - i)}
                </span>
                <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Запись {n - i}</span>
              </div>
              <p className="m-0 text-[15px] font-semibold text-[#F5F5F5] leading-[1.4]">
                {entry.mistake_text}
              </p>
              {entry.better_move && (
                <p className="m-0 text-[14px] text-[#BCBCBC]">
                  <span className="text-[#FFFFFF] font-semibold">Вывод: </span>
                  {entry.better_move}
                </p>
              )}
              {link && i === 0 && (
                <div className="pt-1">
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-9 px-5 rounded-full border border-[#303030] text-[#E5E5E5] no-underline text-[14px] font-medium hover:border-[#FFFFFF] hover:text-[#F5F5F5] transition-colors"
                  >
                    Открыть партию
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 17L17 7M8 7h9v9" />
                    </svg>
                  </a>
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
