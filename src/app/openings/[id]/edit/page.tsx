'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { extractLinesFromPgn } from '@/lib/pgn-tree';
import type { Opening } from '@/types/openings';

interface Props {
  params: Promise<{ id: string }>;
}

type ColorChoice = 'white' | 'black' | 'both';

const colorOptions: { value: ColorChoice; label: string; icon: string }[] = [
  { value: 'white', label: 'За белых', icon: '♙' },
  { value: 'black', label: 'За чёрных', icon: '♟' },
  { value: 'both', label: 'Оба', icon: '♗' },
];

function pluralVariations(n: number): string {
  if (n === 1) return 'вариация';
  if (n >= 2 && n <= 4) return 'вариации';
  return 'вариаций';
}

export default function EditOpeningPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [opening, setOpening] = useState<Opening | null>(null);
  const [loading, setLoading] = useState(true);

  // Section 1: basics
  const [name, setName] = useState('');
  const [color, setColor] = useState<ColorChoice>('white');
  const [savingBasics, setSavingBasics] = useState(false);
  const [basicsSuccess, setBasicsSuccess] = useState(false);
  const [basicsError, setBasicsError] = useState<string | null>(null);

  // Section 2: replace variations
  const [replacePgn, setReplacePgn] = useState('');
  const [replaceCount, setReplaceCount] = useState<number | null>(null);
  const [replacingLines, setReplacingLines] = useState(false);
  const [replaceSuccess, setReplaceSuccess] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Section 3: add variations
  const [addPgn, setAddPgn] = useState('');
  const [addCount, setAddCount] = useState<number | null>(null);
  const [addingLines, setAddingLines] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function loadOpening() {
      const { data } = await supabase
        .from('openings')
        .select('*')
        .eq('id', id)
        .single();

      if (!data) {
        router.push('/openings');
        return;
      }

      const o = data as Opening;
      setOpening(o);
      setName(o.name);
      setColor(o.color);
      setLoading(false);
    }

    loadOpening();
  }, [id, router]);

  // ─── Section 1: Save basics ───────────────────────────────────────────────

  async function handleSaveBasics(e: React.FormEvent) {
    e.preventDefault();
    setBasicsError(null);
    setBasicsSuccess(false);

    if (!name.trim()) {
      setBasicsError('Введи название дебюта.');
      return;
    }

    setSavingBasics(true);

    const { error } = await supabase
      .from('openings')
      .update({ name: name.trim(), color })
      .eq('id', id);

    setSavingBasics(false);

    if (error) {
      setBasicsError('Ошибка сохранения: ' + error.message);
      return;
    }

    setBasicsSuccess(true);
    setTimeout(() => setBasicsSuccess(false), 3000);
  }

  // ─── Section 2: Replace variations ───────────────────────────────────────

  function handleReplacePgnChange(value: string) {
    setReplacePgn(value);
    setReplaceError(null);
    setReplaceSuccess(false);

    if (replaceTimeoutRef.current) clearTimeout(replaceTimeoutRef.current);

    if (!value.trim()) {
      setReplaceCount(null);
      return;
    }

    replaceTimeoutRef.current = setTimeout(() => {
      try {
        const lines = extractLinesFromPgn(value);
        setReplaceCount(lines.length);
      } catch {
        setReplaceCount(0);
      }
    }, 400);
  }

  async function handleReplaceLines(e: React.FormEvent) {
    e.preventDefault();
    setReplaceError(null);
    setReplaceSuccess(false);

    if (!replacePgn.trim()) return;

    let newLines;
    try {
      newLines = extractLinesFromPgn(replacePgn);
    } catch {
      setReplaceError('Не удалось разобрать PGN. Проверь формат.');
      return;
    }

    if (newLines.length === 0) {
      setReplaceError('В PGN не найдено ни одной вариации.');
      return;
    }

    setReplacingLines(true);

    // Fetch all existing line ids
    const { data: existingLines } = await supabase
      .from('opening_lines')
      .select('id')
      .eq('opening_id', id);

    const lineIds = (existingLines ?? []).map((l) => l.id);

    // Delete progress then lines
    if (lineIds.length > 0) {
      await supabase.from('line_progress').delete().in('line_id', lineIds);
      await supabase.from('opening_lines').delete().in('id', lineIds);
    }

    // Insert new lines
    const lineRows = newLines.map((moves, i) => ({
      opening_id: id,
      line_index: i,
      moves,
    }));

    const { error: insertError } = await supabase
      .from('opening_lines')
      .insert(lineRows);

    if (insertError) {
      setReplaceError('Ошибка при сохранении вариаций: ' + insertError.message);
      setReplacingLines(false);
      return;
    }

    // Update total_lines
    await supabase
      .from('openings')
      .update({ total_lines: newLines.length })
      .eq('id', id);

    setReplacingLines(false);
    setReplaceSuccess(true);
    setReplacePgn('');
    setReplaceCount(null);

    // Update local opening state
    setOpening((prev) => prev ? { ...prev, total_lines: newLines.length } : prev);
    setTimeout(() => setReplaceSuccess(false), 4000);
  }

  // ─── Section 3: Add variations ────────────────────────────────────────────

  function handleAddPgnChange(value: string) {
    setAddPgn(value);
    setAddError(null);
    setAddSuccess(false);

    if (addTimeoutRef.current) clearTimeout(addTimeoutRef.current);

    if (!value.trim()) {
      setAddCount(null);
      return;
    }

    addTimeoutRef.current = setTimeout(() => {
      try {
        const lines = extractLinesFromPgn(value);
        setAddCount(lines.length);
      } catch {
        setAddCount(0);
      }
    }, 400);
  }

  async function handleAddLines(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(false);

    if (!addPgn.trim()) return;

    let newLines;
    try {
      newLines = extractLinesFromPgn(addPgn);
    } catch {
      setAddError('Не удалось разобрать PGN. Проверь формат.');
      return;
    }

    if (newLines.length === 0) {
      setAddError('В PGN не найдено ни одной вариации.');
      return;
    }

    setAddingLines(true);

    // Find highest current line_index
    const { data: existingLines } = await supabase
      .from('opening_lines')
      .select('line_index')
      .eq('opening_id', id)
      .order('line_index', { ascending: false })
      .limit(1);

    const maxIndex = existingLines && existingLines.length > 0
      ? existingLines[0].line_index
      : -1;

    const lineRows = newLines.map((moves, i) => ({
      opening_id: id,
      line_index: maxIndex + 1 + i,
      moves,
    }));

    const { error: insertError } = await supabase
      .from('opening_lines')
      .insert(lineRows);

    if (insertError) {
      setAddError('Ошибка при добавлении вариаций: ' + insertError.message);
      setAddingLines(false);
      return;
    }

    const currentTotal = opening?.total_lines ?? 0;
    await supabase
      .from('openings')
      .update({ total_lines: currentTotal + newLines.length })
      .eq('id', id);

    setAddingLines(false);
    setAddSuccess(true);
    setAddPgn('');
    setAddCount(null);

    setOpening((prev) =>
      prev ? { ...prev, total_lines: currentTotal + newLines.length } : prev
    );
    setTimeout(() => setAddSuccess(false), 4000);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="max-w-[1320px] mx-auto px-5 md:px-10 pt-10 pb-16">
        <div className="animate-pulse flex flex-col gap-6 max-w-[760px]">
          <div className="h-[13px] w-[180px] bg-[#24221D] rounded-full" />
          <div className="h-[72px] w-[360px] bg-[#24221D] rounded-[16px]" />
          <div className="h-[220px] bg-[#15130F] border border-[#2A2722] rounded-[20px]" />
          <div className="h-[220px] bg-[#15130F] border border-[#2A2722] rounded-[20px]" />
        </div>
      </main>
    );
  }

  if (!opening) return null;

  return (
    <main className="max-w-[1320px] mx-auto px-5 md:px-10 pt-10 pb-16">
      {/* Back */}
      <Link
        href={`/openings/${id}`}
        className="inline-flex items-center gap-2 text-[13px] text-[#B3AC9F] hover:text-[#F3EEE5] transition-colors no-underline mb-6"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Назад
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 mb-10">
        <div className="flex items-center gap-[14px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E]">
          <span>Репертуар</span>
          <span className="w-10 h-px bg-[#5A4C33]" />
          <span className="text-[#B3AC9F]">Редактировать</span>
        </div>
        <h1 className="m-0 font-cormorant font-[500] text-[64px] leading-[1] tracking-[-0.01em]">
          Редактировать дебют
        </h1>
      </div>

      <div className="max-w-[760px] flex flex-col gap-6">

        {/* ── Section 1: Основное ── */}
        <section className="bg-[#15130F] border border-[#2A2722] rounded-[20px]">
          <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#2A2722]">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Основное</span>
          </div>
          <div className="p-7">
            <form onSubmit={handleSaveBasics} className="flex flex-col gap-6">
              {/* Name */}
              <div className="flex flex-col gap-[10px]">
                <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
                  Название дебюта
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setBasicsError(null);
                    setBasicsSuccess(false);
                  }}
                  placeholder="Например: Сицилианская защита, вариант Найдорфа"
                  required
                  className="h-11 bg-[#0D0C0A] border border-[#2A2722] rounded-[12px] px-4 text-[15px] text-[#F3EEE5] placeholder-[#4A4540] outline-none focus:border-[#D6B97E] transition-colors"
                />
              </div>

              {/* Color */}
              <div className="flex flex-col gap-[10px]">
                <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
                  Цвет фигур
                </label>
                <div className="flex gap-3 flex-wrap">
                  {colorOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setColor(opt.value);
                        setBasicsSuccess(false);
                      }}
                      className={`h-9 flex items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-all border cursor-pointer ${
                        color === opt.value
                          ? 'bg-[#D6B97E] text-[#0D0C0A] border-[#D6B97E]'
                          : 'bg-transparent border-[#34302A] text-[#E7E1D6] hover:border-[#D6B97E]'
                      }`}
                    >
                      <span className="text-[15px] leading-none">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error / success */}
              {basicsError && (
                <div className="flex items-center gap-2 text-[14px] text-[#D36B6B] bg-[#2D1C1C] border border-[#6B3A3A] rounded-[12px] px-5 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                  </svg>
                  {basicsError}
                </div>
              )}
              {basicsSuccess && (
                <div className="flex items-center gap-2 text-[14px] text-[#9BD3A6] bg-[#1C2D1F] border border-[#3A6B44] rounded-[12px] px-5 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Сохранено!
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={savingBasics}
                  className="h-9 bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {savingBasics ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ── Section 2: Replace variations ── */}
        <section className="bg-[#15130F] border border-[#2A2722] rounded-[20px]">
          <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#2A2722]">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Заменить вариации</span>
          </div>
          <div className="p-7">
            <p className="text-[14px] text-[#B3AC9F] mb-6 leading-[1.6]">
              Загрузи новый PGN — все текущие варианты и прогресс будут удалены и заменены новыми.
            </p>

            <form onSubmit={handleReplaceLines} className="flex flex-col gap-5">
              {/* Warning */}
              <div className="flex items-start gap-3 bg-[#2D1C1C] border border-[#6B3A3A] rounded-[12px] px-5 py-3">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D36B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] shrink-0" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                <span className="text-[13px] text-[#D36B6B] leading-[1.6]">
                  Все текущие варианты и прогресс будут удалены безвозвратно.
                </span>
              </div>

              <div className="flex flex-col gap-[10px]">
                <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
                  Новый PGN
                </label>
                <textarea
                  value={replacePgn}
                  onChange={(e) => handleReplacePgnChange(e.target.value)}
                  rows={10}
                  placeholder="Вставь полный PGN для замены..."
                  className="min-h-[200px] bg-[#0D0C0A] border border-[#2A2722] rounded-[12px] px-4 py-3 text-[14px] text-[#F3EEE5] placeholder-[#4A4540] outline-none focus:border-[#D6B97E] transition-colors font-mono resize-y leading-[1.6]"
                />
                {replaceCount !== null && (
                  <div
                    className={`flex items-center gap-2 text-[13px] font-medium px-4 py-[8px] rounded-[10px] border ${
                      replaceCount > 0
                        ? 'text-[#9BD3A6] bg-[#1C2D1F] border-[#3A6B44]'
                        : 'text-[#D36B6B] bg-[#2D1C1C] border-[#6B3A3A]'
                    }`}
                  >
                    {replaceCount > 0 ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Найдено {replaceCount} {pluralVariations(replaceCount)}
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                        </svg>
                        Вариации не найдены — проверь PGN
                      </>
                    )}
                  </div>
                )}
              </div>

              {replaceError && (
                <div className="flex items-center gap-2 text-[14px] text-[#D36B6B] bg-[#2D1C1C] border border-[#6B3A3A] rounded-[12px] px-5 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                  </svg>
                  {replaceError}
                </div>
              )}
              {replaceSuccess && (
                <div className="flex items-center gap-2 text-[14px] text-[#9BD3A6] bg-[#1C2D1F] border border-[#3A6B44] rounded-[12px] px-5 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Вариации заменены успешно!
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={replacingLines || !replacePgn.trim()}
                  className="h-9 border border-[#6B3A3A] text-[#D36B6B] hover:bg-[#2D1C1C] rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-transparent"
                >
                  {replacingLines ? 'Замена...' : 'Заменить'}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ── Section 3: Add variations ── */}
        <section className="bg-[#15130F] border border-[#2A2722] rounded-[20px]">
          <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#2A2722]">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Добавить вариации</span>
          </div>
          <div className="p-7">
            <p className="text-[14px] text-[#B3AC9F] mb-6 leading-[1.6]">
              Добавь новые вариации к существующим. Прогресс по текущим линиям сохранится.
              Сейчас линий: <span className="text-[#F3EEE5] font-semibold">{opening.total_lines}</span>.
            </p>

            <form onSubmit={handleAddLines} className="flex flex-col gap-5">
              <div className="flex flex-col gap-[10px]">
                <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
                  PGN для добавления
                </label>
                <textarea
                  value={addPgn}
                  onChange={(e) => handleAddPgnChange(e.target.value)}
                  rows={10}
                  placeholder="Вставь PGN вариаций для добавления..."
                  className="min-h-[200px] bg-[#0D0C0A] border border-[#2A2722] rounded-[12px] px-4 py-3 text-[14px] text-[#F3EEE5] placeholder-[#4A4540] outline-none focus:border-[#D6B97E] transition-colors font-mono resize-y leading-[1.6]"
                />
                {addCount !== null && (
                  <div
                    className={`flex items-center gap-2 text-[13px] font-medium px-4 py-[8px] rounded-[10px] border ${
                      addCount > 0
                        ? 'text-[#9BD3A6] bg-[#1C2D1F] border-[#3A6B44]'
                        : 'text-[#D36B6B] bg-[#2D1C1C] border-[#6B3A3A]'
                    }`}
                  >
                    {addCount > 0 ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Найдено {addCount} {pluralVariations(addCount)}
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                        </svg>
                        Вариации не найдены — проверь PGN
                      </>
                    )}
                  </div>
                )}
              </div>

              {addError && (
                <div className="flex items-center gap-2 text-[14px] text-[#D36B6B] bg-[#2D1C1C] border border-[#6B3A3A] rounded-[12px] px-5 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                  </svg>
                  {addError}
                </div>
              )}
              {addSuccess && (
                <div className="flex items-center gap-2 text-[14px] text-[#9BD3A6] bg-[#1C2D1F] border border-[#3A6B44] rounded-[12px] px-5 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Вариации добавлены!
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={addingLines || !addPgn.trim()}
                  className="h-9 bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {addingLines ? 'Добавление...' : 'Добавить'}
                </button>
                <Link
                  href={`/openings/${id}`}
                  className="h-9 flex items-center border border-[#34302A] text-[#E7E1D6] hover:border-[#D6B97E] rounded-full px-5 text-[14px] transition-colors bg-transparent no-underline"
                >
                  К дебюту
                </Link>
              </div>
            </form>
          </div>
        </section>

      </div>
    </main>
  );
}
