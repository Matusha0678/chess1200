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
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">

      {/* Header */}
      <div className="flex flex-col gap-[18px] max-w-[760px] mb-14">
        <div className="flex items-center gap-[14px] text-[13px] font-semibold tracking-[0.16em] uppercase text-[#D6B97E]">
          <span>Записи</span>
          <span className="w-10 h-px bg-[#5A4C33]" />
          <span className="text-[#B3AC9F]">После каждой партии</span>
        </div>
        <h1 className="m-0 font-cormorant font-[500] text-[56px] md:text-[96px] leading-[0.98] tracking-[-0.015em]">
          Тетрадь
        </h1>
        <p className="m-0 text-[18px] md:text-[19px] text-[#C9C2B5]">
          Одна партия — одна главная ошибка. Запиши, пока свежо.
        </p>
      </div>

      <div className="flex flex-wrap gap-10 items-start">

        {/* Form */}
        <form
          onSubmit={save}
          className="flex-[1_1_400px] bg-[#15130F] border border-[#2A2722] rounded-[28px] p-8 flex flex-col gap-5"
        >
          <h2 className="m-0 font-cormorant font-[500] text-[34px] leading-[1.1]">Новая запись</h2>

          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-semibold text-[#C9C2B5]" htmlFor="nb-link">
              Ссылка на партию
            </label>
            <input
              id="nb-link"
              type="url"
              placeholder="https://www.chess.com/game/…"
              value={link}
              onChange={e => setLink(e.target.value)}
              className="w-full box-border bg-[#0F0E0B] border border-[#34302A] rounded-[14px] px-4 py-[14px] text-[#F3EEE5] text-[16px] leading-[1.5] outline-none placeholder-[#8F887C] focus:border-[#D6B97E] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-semibold text-[#C9C2B5]" htmlFor="nb-mistake">
              Главная ошибка
            </label>
            <textarea
              id="nb-mistake"
              rows={3}
              placeholder="Что пошло не так?"
              value={mistake}
              onChange={e => setMistake(e.target.value)}
              className="w-full box-border bg-[#0F0E0B] border border-[#34302A] rounded-[14px] px-4 py-[14px] text-[#F3EEE5] text-[16px] leading-[1.5] outline-none placeholder-[#8F887C] focus:border-[#D6B97E] resize-none transition-colors font-[inherit]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-semibold text-[#C9C2B5]" htmlFor="nb-lesson">
              Вывод на будущее
            </label>
            <textarea
              id="nb-lesson"
              rows={2}
              placeholder="Что буду делать иначе"
              value={lesson}
              onChange={e => setLesson(e.target.value)}
              className="w-full box-border bg-[#0F0E0B] border border-[#34302A] rounded-[14px] px-4 py-[14px] text-[#F3EEE5] text-[16px] leading-[1.5] outline-none placeholder-[#8F887C] focus:border-[#D6B97E] resize-none transition-colors font-[inherit]"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !mistake.trim()}
            className="h-14 rounded-full border-0 bg-[#D6B97E] text-[#0D0C0A] text-[16px] font-bold cursor-pointer hover:bg-[#EBD3A2] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Сохранение...' : 'Сохранить запись'}
          </button>
        </form>

        {/* Entries */}
        <section aria-label="Записи" className="flex-[999_1_560px] min-w-0 flex flex-col gap-[14px]">
          <div className="flex justify-between items-baseline pb-[6px]">
            <h2 className="m-0 font-cormorant font-[500] text-[34px] leading-[1.1]">Мои ошибки</h2>
            <span className="text-[15px] text-[#B3AC9F]">{countLabel}</span>
          </div>

          {n === 0 && (
            <div className="border border-dashed border-[#3A362F] rounded-[28px] py-[72px] px-8 flex flex-col items-center text-center gap-[14px]">
              <div className="w-16 h-16 rounded-full border border-[#4A3E28] flex items-center justify-center text-[#D6B97E]">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2.5z" />
                  <path d="M9 7h6M9 11h4" />
                </svg>
              </div>
              <p className="m-0 font-cormorant text-[32px] font-[500] leading-[1.15]">Записей нет</p>
              <p className="m-0 text-[17px] text-[#B3AC9F]">Добавь ошибку после партии.</p>
            </div>
          )}

          {entries.map((entry, i) => (
            <article
              key={entry.id}
              className="bg-[#15130F] border border-[#2A2722] rounded-[24px] p-7 flex flex-col gap-3"
            >
              <div className="flex justify-between gap-3 text-[13px] font-semibold tracking-[0.12em] uppercase text-[#D6B97E]">
                <span>{formatDate(entry.date)} · День {day - (n - 1 - i)}</span>
                <span className="text-[#B3AC9F]">Запись {n - i}</span>
              </div>
              <p className="m-0 font-cormorant text-[26px] md:text-[28px] font-[500] leading-[1.2]">
                {entry.mistake_text}
              </p>
              {entry.better_move && (
                <p className="m-0 text-[16px] text-[#C9C2B5]">
                  <span className="text-[#D6B97E] font-semibold">Вывод: </span>
                  {entry.better_move}
                </p>
              )}
              {link && i === 0 && (
                <div>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-[#34302A] text-[#E7E1D6] no-underline text-[14px] font-medium hover:border-[#D6B97E] hover:text-[#F3EEE5] transition-colors"
                  >
                    Открыть партию
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
