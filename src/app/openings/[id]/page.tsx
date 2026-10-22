'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { extractLinesFromPgn } from '@/lib/pgn-tree';
import type { Opening, OpeningLine, LineProgress } from '@/types/openings';

interface LineWithProgress extends OpeningLine {
  line_progress: LineProgress[];
}

interface Props {
  params: Promise<{ id: string }>;
}

const COLOR_LABEL: Record<'white' | 'black' | 'both', string> = {
  white: 'Белые',
  black: 'Чёрные',
  both: 'Оба цвета',
};

const COLOR_ICON: Record<'white' | 'black' | 'both', string> = {
  white: '♙',
  black: '♟',
  both: '♗',
};

function masteryDots(mastery: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span
      key={i}
      className={`inline-block w-[10px] h-[10px] rounded-full ${
        i < mastery ? 'bg-[#D6B97E]' : 'bg-[#2A2722]'
      }`}
    />
  ));
}

function abbreviateMoves(line: OpeningLine, maxHalfMoves = 16): string {
  const moves = line.moves.slice(0, maxHalfMoves);
  const parts: string[] = [];
  moves.forEach((m, idx) => {
    if (m.color === 'w') {
      parts.push(`${Math.floor(idx / 2) + 1}.`);
    }
    parts.push(m.san);
  });
  if (line.moves.length > maxHalfMoves) parts.push('...');
  return parts.join(' ');
}

function pluralVariations(n: number): string {
  if (n === 1) return 'вариация';
  if (n >= 2 && n <= 4) return 'вариации';
  return 'вариаций';
}

export default function OpeningDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [lines, setLines] = useState<LineWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Add variation state
  const [showAddLine, setShowAddLine] = useState(false);
  const [addLinePgn, setAddLinePgn] = useState('');
  const [addLineCount, setAddLineCount] = useState<number | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [addLineError, setAddLineError] = useState<string | null>(null);
  const [addLineSuccess, setAddLineSuccess] = useState(false);
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = new Date().toISOString();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);

    const { data: openingData } = await supabase
      .from('openings')
      .select('*')
      .eq('id', id)
      .single();

    if (!openingData) {
      router.push('/openings');
      return;
    }

    setOpening(openingData as Opening);

    const { data: linesData } = await supabase
      .from('opening_lines')
      .select('*, line_progress(*)')
      .eq('opening_id', id)
      .order('line_index');

    setLines((linesData as LineWithProgress[]) ?? []);
    setLoading(false);
  }

  async function handleDelete() {
    if (!opening) return;
    setDeleting(true);

    const { data: lineRows } = await supabase
      .from('opening_lines')
      .select('id')
      .eq('opening_id', opening.id);

    const lineIds = (lineRows ?? []).map((l) => l.id);

    if (lineIds.length > 0) {
      await supabase.from('line_progress').delete().in('line_id', lineIds);
      await supabase.from('opening_lines').delete().in('id', lineIds);
    }

    await supabase.from('openings').delete().eq('id', opening.id);

    router.push('/openings');
  }

  function handleAddLinePgnChange(value: string) {
    setAddLinePgn(value);
    setAddLineError(null);
    setAddLineSuccess(false);

    if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);

    if (!value.trim()) {
      setAddLineCount(null);
      return;
    }

    parseTimeoutRef.current = setTimeout(() => {
      try {
        const parsed = extractLinesFromPgn(value);
        setAddLineCount(parsed.length);
      } catch {
        setAddLineCount(0);
      }
    }, 400);
  }

  async function handleAddLines() {
    if (!opening || !addLinePgn.trim()) return;
    setAddLineError(null);
    setAddLineSuccess(false);

    let newMoveLines;
    try {
      newMoveLines = extractLinesFromPgn(addLinePgn);
    } catch {
      setAddLineError('Не удалось разобрать PGN. Проверь формат.');
      return;
    }

    if (newMoveLines.length === 0) {
      setAddLineError('В PGN не найдено ни одной вариации.');
      return;
    }

    setAddingLine(true);

    // Find the current highest line_index
    const maxIndex = lines.length > 0
      ? Math.max(...lines.map((l) => l.line_index))
      : -1;

    const lineRows = newMoveLines.map((moves, i) => ({
      opening_id: opening.id,
      line_index: maxIndex + 1 + i,
      moves,
    }));

    const { error: insertError } = await supabase
      .from('opening_lines')
      .insert(lineRows);

    if (insertError) {
      setAddLineError('Ошибка при добавлении вариаций: ' + insertError.message);
      setAddingLine(false);
      return;
    }

    await supabase
      .from('openings')
      .update({ total_lines: opening.total_lines + newMoveLines.length })
      .eq('id', opening.id);

    setAddingLine(false);
    setAddLineSuccess(true);
    setAddLinePgn('');
    setAddLineCount(null);
    setShowAddLine(false);

    // Refresh
    await load();
  }

  if (loading) {
    return (
      <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">
        <div className="animate-pulse flex flex-col gap-8">
          <div className="h-[14px] w-[200px] bg-[#24221D] rounded-full" />
          <div className="h-[80px] w-[480px] bg-[#24221D] rounded-[16px]" />
          <div className="grid grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[100px] bg-[#15130F] border border-[#2A2722] rounded-[20px]" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!opening) return null;

  const progress = lines.flatMap((l) => l.line_progress ?? []);
  const linesTotal = lines.length;
  const linesMastered = progress.filter((p) => p.mastery >= 4).length;
  const linesDue = progress.filter((p) => p.next_review <= now && p.mastery < 5).length;

  return (
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">
      {/* Back */}
      <Link
        href="/openings"
        className="inline-flex items-center gap-2 text-[14px] text-[#B3AC9F] hover:text-[#F3EEE5] transition-colors no-underline mb-10"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Дебюты
      </Link>

      {/* Hero */}
      <section className="flex flex-wrap gap-10 items-start mb-12">
        <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-[18px]">
          {/* Badges */}
          <div className="flex items-center gap-3 flex-wrap">
            {opening.eco_code && (
              <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E] bg-[#2A2218] border border-[#4A3E28] rounded-[8px] px-[10px] py-[4px]">
                {opening.eco_code}
              </span>
            )}
            <span className="flex items-center gap-[6px] text-[14px] text-[#B3AC9F] bg-[#15130F] border border-[#2A2722] rounded-[8px] px-[10px] py-[4px]">
              <span className="text-[16px] leading-none">{COLOR_ICON[opening.color]}</span>
              {COLOR_LABEL[opening.color]}
            </span>
          </div>

          {/* Title */}
          <h1 className="m-0 font-cormorant font-[500] text-[52px] md:text-[72px] leading-[0.98] tracking-[-0.015em]">
            {opening.name}
          </h1>
        </div>

        {/* Action buttons — vertical column */}
        <div className="flex-[1_1_260px] flex flex-col gap-3 pt-2">
          <Link
            href={`/openings/${id}/practice`}
            className="flex items-center justify-center gap-2 bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-6 py-3 text-[15px] font-semibold transition-colors no-underline"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Тренироваться
          </Link>

          <Link
            href={`/openings/${id}/edit`}
            className="flex items-center justify-center gap-2 border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-6 py-3 text-[14px] font-medium transition-colors no-underline"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Изменить
          </Link>

          {/* Delete — less prominent */}
          <div className="mt-1">
            {confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-[#D36B6B] text-center">Удалить дебют и все линии?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 border border-[#6B3A3A] text-[#D36B6B] hover:bg-[#2D1C1C] rounded-full px-4 py-[9px] text-[13px] font-semibold transition-colors bg-transparent disabled:opacity-50 cursor-pointer"
                  >
                    {deleting ? 'Удаление...' : 'Да, удалить'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-4 py-[9px] text-[13px] font-medium transition-colors bg-transparent cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full border border-transparent text-[#5A5249] hover:border-[#6B3A3A] hover:text-[#D36B6B] rounded-full px-6 py-[9px] text-[13px] font-medium transition-colors bg-transparent cursor-pointer"
              >
                Удалить дебют
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-5 mb-12">
        {[
          { label: 'Линий всего', value: linesTotal, color: 'text-[#F3EEE5]' },
          { label: 'Освоено', value: linesMastered, color: 'text-[#9BD3A6]' },
          { label: 'К повторению', value: linesDue, color: linesDue > 0 ? 'text-[#D6B97E]' : 'text-[#F3EEE5]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-6">
            <div className="text-[13px] text-[#B3AC9F] mb-2">{label}</div>
            <div className={`font-cormorant text-[48px] font-semibold leading-[1.05] ${color}`}>
              {value}
            </div>
          </div>
        ))}
      </section>

      {/* Lines list */}
      <section>
        {/* Section heading + add button */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <h2 className="m-0 font-cormorant font-[500] text-[36px] leading-[1.1] flex-1">
            Вариации
          </h2>
          <button
            onClick={() => {
              setShowAddLine((v) => !v);
              setAddLineError(null);
              setAddLineSuccess(false);
            }}
            className={`flex items-center gap-2 rounded-full px-5 py-[9px] text-[14px] font-medium transition-colors border cursor-pointer ${
              showAddLine
                ? 'bg-[#2A2218] border-[#4A3E28] text-[#D6B97E]'
                : 'border-[#2A2722] text-[#B3AC9F] bg-transparent hover:border-[#D6B97E] hover:text-[#F3EEE5]'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Добавить вариацию
          </button>
        </div>

        {/* Success message */}
        {addLineSuccess && (
          <div className="flex items-center gap-2 text-[14px] text-[#9BD3A6] bg-[#1C2D1F] border border-[#3A6B44] rounded-[12px] px-5 py-3 mb-5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Вариации добавлены успешно
          </div>
        )}

        {lines.length === 0 && !showAddLine ? (
          <div className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-8 text-center text-[#B3AC9F] text-[14px]">
            Линии не найдены.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {lines.map((line, i) => {
              const prog = line.line_progress?.[0] ?? null;
              const isDue = prog && prog.next_review <= now && prog.mastery < 5;
              const mastery = prog?.mastery ?? 0;

              return (
                <div
                  key={line.id}
                  className="bg-[#15130F] border border-[#2A2722] rounded-[18px] py-5 px-6 flex flex-wrap items-center gap-4 hover:border-[#4A3E28] transition-colors"
                >
                  {/* Index */}
                  <span className="text-[14px] font-semibold text-[#5A5249] w-[28px] shrink-0 text-right">
                    {i + 1}
                  </span>

                  {/* Moves + mastery */}
                  <div className="flex-1 min-w-[200px]">
                    <p className="m-0 text-[14px] font-mono text-[#B3AC9F] leading-[1.6] break-words line-clamp-2">
                      {abbreviateMoves(line)}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <div className="flex items-center gap-[4px]">
                        {masteryDots(mastery)}
                      </div>
                      <span className="text-[13px] text-[#5A5249]">
                        Уровень {mastery}/5
                      </span>
                      {prog && (
                        <span className="text-[13px] text-[#5A5249]">
                          {prog.correct_count}✓ {prog.incorrect_count}✗
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Due badge */}
                  {isDue && (
                    <div className="shrink-0 flex items-center gap-[5px] bg-[#2A2218] border border-[#4A3E28] rounded-full px-[10px] py-[4px]">
                      <span className="w-[5px] h-[5px] rounded-full bg-[#D6B97E]" />
                      <span className="text-[12px] font-semibold text-[#D6B97E]">Повторить</span>
                    </div>
                  )}

                  {/* Practice this line */}
                  <Link
                    href={`/openings/${id}/practice?line=${line.id}`}
                    className="shrink-0 h-9 flex items-center border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-4 text-[13px] font-medium transition-colors bg-transparent no-underline"
                  >
                    Практика
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* Add variation inline form */}
        {showAddLine && (
          <div className="mt-5 bg-[#15130F] border border-[#2A2722] rounded-[20px] p-6 flex flex-col gap-5">
            <h3 className="m-0 font-cormorant font-[500] text-[26px] leading-[1.1]">
              Добавить вариации
            </h3>

            <div className="flex flex-col gap-[10px]">
              <label className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">
                PGN
              </label>
              <textarea
                value={addLinePgn}
                onChange={(e) => handleAddLinePgnChange(e.target.value)}
                rows={8}
                placeholder="Вставь PGN вариаций для добавления..."
                className="bg-[#0D0C0A] border border-[#2A2722] rounded-[14px] px-5 py-4 text-[14px] text-[#F3EEE5] placeholder-[#4A4540] outline-none focus:border-[#D6B97E] transition-colors font-mono resize-y leading-[1.6]"
              />
              {addLineCount !== null && (
                <div
                  className={`flex items-center gap-2 text-[13px] font-medium px-4 py-[8px] rounded-[10px] border ${
                    addLineCount > 0
                      ? 'text-[#9BD3A6] bg-[#1C2D1F] border-[#3A6B44]'
                      : 'text-[#D36B6B] bg-[#2D1C1C] border-[#6B3A3A]'
                  }`}
                >
                  {addLineCount > 0 ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Найдено {addLineCount} {pluralVariations(addLineCount)}
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

            {addLineError && (
              <div className="flex items-center gap-2 text-[14px] text-[#D36B6B] bg-[#2D1C1C] border border-[#6B3A3A] rounded-[12px] px-5 py-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                </svg>
                {addLineError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleAddLines}
                disabled={addingLine || !addLinePgn.trim()}
                className="bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-6 py-[10px] text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {addingLine ? 'Добавление...' : 'Добавить'}
              </button>
              <button
                onClick={() => {
                  setShowAddLine(false);
                  setAddLinePgn('');
                  setAddLineCount(null);
                  setAddLineError(null);
                }}
                className="border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-5 py-[10px] text-[14px] font-medium transition-colors bg-transparent cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
