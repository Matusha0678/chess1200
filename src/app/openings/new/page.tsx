'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { extractLinesFromPgn } from '@/lib/pgn-tree';

type ColorChoice = 'white' | 'black' | 'both';

function extractEcoCode(pgn: string): string | null {
  const match = pgn.match(/\[ECO\s+"([^"]+)"\]/);
  return match ? match[1] : null;
}

export default function NewOpeningPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState<ColorChoice>('white');
  const [pgn, setPgn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePgnChange(value: string) {
    setPgn(value);
    setError(null);

    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
    }

    if (!value.trim()) {
      setPreviewCount(null);
      return;
    }

    parseTimeoutRef.current = setTimeout(() => {
      try {
        const lines = extractLinesFromPgn(value);
        setPreviewCount(lines.length);
      } catch {
        setPreviewCount(0);
      }
    }, 400);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Введи название дебюта.');
      return;
    }
    if (!pgn.trim()) {
      setError('Вставь PGN.');
      return;
    }

    let lines;
    try {
      lines = extractLinesFromPgn(pgn);
    } catch {
      setError('Не удалось разобрать PGN. Проверь формат.');
      return;
    }

    if (lines.length === 0) {
      setError('В PGN не найдено ни одной вариации. Проверь текст.');
      return;
    }

    setSubmitting(true);

    try {
      const eco_code = extractEcoCode(pgn);

      // Insert opening
      const { data: opening, error: openingError } = await supabase
        .from('openings')
        .insert({
          name: name.trim(),
          color,
          pgn: pgn.trim(),
          eco_code: eco_code ?? null,
          total_lines: lines.length,
        })
        .select()
        .single();

      if (openingError || !opening) {
        setError('Ошибка при сохранении дебюта: ' + (openingError?.message ?? 'неизвестная ошибка'));
        setSubmitting(false);
        return;
      }

      // Insert all lines
      const lineRows = lines.map((moves, index) => ({
        opening_id: opening.id,
        line_index: index,
        moves: moves,
      }));

      const { error: linesError } = await supabase
        .from('opening_lines')
        .insert(lineRows);

      if (linesError) {
        setError('Дебют создан, но ошибка при сохранении линий: ' + linesError.message);
        setSubmitting(false);
        return;
      }

      router.push(`/openings/${opening.id}`);
    } catch (err) {
      setError('Неожиданная ошибка: ' + String(err));
      setSubmitting(false);
    }
  }

  const colorOptions: { value: ColorChoice; label: string; icon: string }[] = [
    { value: 'white', label: 'За белых', icon: '♙' },
    { value: 'black', label: 'За чёрных', icon: '♟' },
    { value: 'both', label: 'Оба', icon: '♗' },
  ];

  return (
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">
      {/* Back + header */}
      <div className="mb-10">
        <Link
          href="/openings"
          className="inline-flex items-center gap-2 text-[14px] text-[#B3AC9F] hover:text-[#F3EEE5] transition-colors no-underline mb-7"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Назад
        </Link>

        <div className="flex items-center gap-[14px] text-[13px] font-semibold tracking-[0.16em] uppercase text-[#D6B97E] mb-4">
          <span>Репертуар</span>
          <span className="w-10 h-px bg-[#5A4C33]" />
          <span className="text-[#B3AC9F]">Новый дебют</span>
        </div>
        <h1 className="m-0 font-cormorant font-[500] text-[56px] md:text-[72px] leading-[0.98] tracking-[-0.015em]">
          Новый дебют
        </h1>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="max-w-[720px] flex flex-col gap-8"
      >
        {/* Name */}
        <div className="flex flex-col gap-[10px]">
          <label className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
            Название дебюта
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Сицилианская защита, вариант Найдорфа"
            required
            className="bg-[#15130F] border border-[#2A2722] rounded-[14px] px-5 py-3 text-[15px] text-[#F3EEE5] placeholder-[#4A4540] outline-none focus:border-[#D6B97E] transition-colors"
          />
        </div>

        {/* Color */}
        <div className="flex flex-col gap-[10px]">
          <label className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
            Цвет фигур
          </label>
          <div className="flex gap-3">
            {colorOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setColor(opt.value)}
                className={`flex items-center gap-2 rounded-full px-5 py-[10px] text-[14px] font-semibold transition-all border cursor-pointer ${
                  color === opt.value
                    ? 'bg-[#D6B97E] text-[#0D0C0A] border-[#D6B97E]'
                    : 'bg-transparent border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5]'
                }`}
              >
                <span className="text-[16px] leading-none">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* PGN */}
        <div className="flex flex-col gap-[10px]">
          <label className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
            PGN
          </label>
          <textarea
            value={pgn}
            onChange={(e) => handlePgnChange(e.target.value)}
            rows={12}
            placeholder={`Вставь PGN дебюта, например:\n\n[ECO "B90"]\n[Opening "Sicilian"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 (5... e6 6. Be2) 6. Bg5 *`}
            required
            className="bg-[#15130F] border border-[#2A2722] rounded-[14px] px-5 py-4 text-[14px] text-[#F3EEE5] placeholder-[#4A4540] outline-none focus:border-[#D6B97E] transition-colors font-mono resize-y leading-[1.6]"
          />
          {previewCount !== null && (
            <div
              className={`flex items-center gap-2 text-[13px] font-medium px-4 py-[8px] rounded-[10px] border ${
                previewCount > 0
                  ? 'text-[#9BD3A6] bg-[#1C2D1F] border-[#3A6B44]'
                  : 'text-[#D36B6B] bg-[#2D1C1C] border-[#6B3A3A]'
              }`}
            >
              {previewCount > 0 ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Найдено {previewCount} {previewCount === 1 ? 'вариация' : previewCount < 5 ? 'вариации' : 'вариаций'}
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

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-[14px] text-[#D36B6B] bg-[#2D1C1C] border border-[#6B3A3A] rounded-[12px] px-5 py-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-7 py-3 text-[15px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? 'Сохранение...' : 'Добавить дебют'}
          </button>
          <Link
            href="/openings"
            className="border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-6 py-3 text-[14px] font-medium transition-colors bg-transparent no-underline"
          >
            Отмена
          </Link>
        </div>
      </form>
    </main>
  );
}
