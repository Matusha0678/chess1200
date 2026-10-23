'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { extractAllLines } from '@/lib/pgn-tree';
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
      className={`inline-block w-[8px] h-[8px] rounded-full ${
        i < mastery ? 'bg-[#FFFFFF]' : 'bg-[#262626]'
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
        const { lines } = extractAllLines(value);
        setAddLineCount(lines.length);
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
      const result = extractAllLines(addLinePgn);
      newMoveLines = result.lines;
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
      <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">
        <div className="animate-pulse flex flex-col gap-6">
          <div className="h-[13px] w-[200px] bg-[#1E1E1E] rounded-full" />
          <div className="h-[72px] w-[480px] bg-[#1E1E1E] rounded-[16px]" />
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] h-[100px]" />
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] h-[300px]" />
        </div>
      </main>
    );
  }

  if (!opening) return null;

  const progress = lines.flatMap((l) => l.line_progress ?? []);
  const linesTotal = lines.length;
  const linesMastered = progress.filter((p) => p.mastery >= 4).length;
  const linesDue = progress.filter((p) => p.next_review <= now && p.mastery < 5).length;

  const totalCorrect = progress.reduce((s, p) => s + (p.correct_count ?? 0), 0);
  const totalIncorrect = progress.reduce((s, p) => s + (p.incorrect_count ?? 0), 0);
  const totalAttempts = totalCorrect + totalIncorrect;
  const accuracy = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : null;
  const lastPracticed = progress
    .map(p => p.last_practiced)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  function fmtLastPracticed(iso: string | null): string {
    if (!iso) return '—';
    const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} дн.`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед.`;
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  return (
    <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">
      {/* Back */}
      <Link
        href="/openings"
        className="inline-flex items-center gap-2 text-[13px] text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors no-underline mb-6"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Дебюты
      </Link>

      {/* Hero: two-col flex-wrap */}
      <div className="flex flex-wrap gap-6 items-start mb-6">
        {/* .main */}
        <div className="flex-[999_1_600px] min-w-0 flex flex-col gap-4">
          {/* Badges */}
          <div className="flex items-center gap-3 flex-wrap">
            {opening.eco_code && (
              <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF] bg-[#1A1A1A] border border-[#303030] rounded-[8px] px-[10px] py-[4px]">
                {opening.eco_code}
              </span>
            )}
            <span className="flex items-center gap-[6px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0] bg-[#0D0D0D] border border-[#262626] rounded-[8px] px-[10px] py-[4px]">
              <span className="text-[15px] leading-none">{COLOR_ICON[opening.color]}</span>
              {COLOR_LABEL[opening.color]}
            </span>
          </div>

          {/* Title */}
          <h1 className="m-0 font-[500] text-[48px] leading-[1] tracking-[-0.01em]">
            {opening.name}
          </h1>
        </div>

        {/* .side — action card */}
        <div className="flex-[1_1_360px] min-w-0">
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 flex flex-col gap-3">
            <Link
              href={`/openings/${id}/study`}
              className="h-11 flex items-center justify-center gap-2 bg-white text-[#050505] hover:bg-[#F0F0F0] rounded-[10px] px-6 text-[15px] font-semibold transition-colors no-underline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Учёба
            </Link>

            <Link
              href={`/openings/${id}/practice`}
              className="h-10 flex items-center justify-center gap-2 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-[10px] px-6 text-[14px] font-medium transition-colors no-underline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Тренировка
            </Link>

            <Link
              href={`/openings/${id}/edit`}
              className="h-9 flex items-center justify-center gap-2 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-5 text-[14px] transition-colors no-underline"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Изменить
            </Link>

            {/* Delete */}
            {confirmDelete ? (
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-[13px] text-[#A0A0A0] text-center">Удалить дебют и все линии?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 h-9 border border-[#404040] text-[#A0A0A0] hover:bg-[#1A1A1A] rounded-full px-4 text-[13px] font-semibold transition-colors bg-transparent disabled:opacity-50 cursor-pointer"
                  >
                    {deleting ? 'Удаление...' : 'Да, удалить'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 h-9 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-4 text-[13px] transition-colors bg-transparent cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="h-9 w-full border border-transparent text-[#505050] hover:border-[#404040] hover:text-[#A0A0A0] rounded-full px-5 text-[13px] transition-colors bg-transparent cursor-pointer"
              >
                Удалить дебют
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats — 6 cells, 3+3 */}
      <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] grid grid-cols-3 mb-6">
        <div className="p-5 flex flex-col gap-[2px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Линий</span>
          <span className="font-cormorant text-[32px] font-semibold leading-[1.1] text-[#F5F5F5]">{linesTotal}</span>
        </div>
        <div className="p-5 flex flex-col gap-[2px] border-l border-[#1E1E1E]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Освоено</span>
          <span className="font-cormorant text-[32px] font-semibold leading-[1.1] text-[#D0D0D0]">{linesMastered}</span>
        </div>
        <div className="p-5 flex flex-col gap-[2px] border-l border-[#1E1E1E]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Повторить</span>
          <span className={`font-cormorant text-[32px] font-semibold leading-[1.1] ${linesDue > 0 ? 'text-[#FFFFFF]' : 'text-[#F5F5F5]'}`}>{linesDue}</span>
        </div>
        <div className="p-5 flex flex-col gap-[2px] border-t border-[#1E1E1E]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Попыток</span>
          <span className="font-cormorant text-[32px] font-semibold leading-[1.1] text-[#F5F5F5]">
            {totalAttempts > 0 ? totalAttempts : '—'}
          </span>
        </div>
        <div className="p-5 flex flex-col gap-[2px] border-t border-l border-[#1E1E1E]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Точность</span>
          <span className="font-cormorant text-[32px] font-semibold leading-[1.1] text-[#D0D0D0]">
            {accuracy !== null ? `${accuracy}%` : '—'}
          </span>
        </div>
        <div className="p-5 flex flex-col gap-[2px] border-t border-l border-[#1E1E1E]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Последнее</span>
          <span className="font-cormorant text-[28px] font-semibold leading-[1.1] text-[#A0A0A0]">
            {fmtLastPracticed(lastPracticed ?? null)}
          </span>
        </div>
      </div>

      {/* Lines list — one card */}
      <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px]">
        {/* Section header */}
        <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#262626]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Вариации</span>
          <button
            onClick={() => {
              setShowAddLine((v) => !v);
              setAddLineError(null);
              setAddLineSuccess(false);
            }}
            className={`h-9 flex items-center gap-2 rounded-full px-5 text-[14px] transition-colors border cursor-pointer ${
              showAddLine
                ? 'bg-[#1A1A1A] border-[#303030] text-[#FFFFFF]'
                : 'border-[#303030] text-[#E5E5E5] bg-transparent hover:border-[#FFFFFF]'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Добавить вариацию
          </button>
        </div>

        {/* Success message */}
        {addLineSuccess && (
          <div className="flex items-center gap-2 text-[14px] text-[#D0D0D0] bg-[#141414] border-b border-[#303030] px-5 py-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Вариации добавлены успешно
          </div>
        )}

        {/* Lines */}
        {lines.length === 0 && !showAddLine ? (
          <div className="px-5 py-12 text-center text-[#A0A0A0] text-[14px]">
            Линии не найдены.
          </div>
        ) : (
          lines.map((line, i) => {
            const prog = line.line_progress?.[0] ?? null;
            const isDue = prog && prog.next_review <= now && prog.mastery < 5;
            const mastery = prog?.mastery ?? 0;

            return (
              <div
                key={line.id}
                className={`grid grid-cols-[32px_minmax(0,1fr)_auto_auto] sm:grid-cols-[32px_minmax(0,1fr)_auto_auto] gap-x-5 px-5 py-[18px] items-center hover:bg-[#1A1814] transition-colors ${i > 0 ? 'border-t border-[#1E1E1E]' : ''}`}
              >
                {/* Index */}
                <span className="text-[13px] text-[#505050] text-right tabular-nums">
                  {i + 1}
                </span>

                {/* Moves + mastery dots */}
                <div className="min-w-0">
                  <p className="m-0 text-[14px] font-mono text-[#A0A0A0] leading-[1.6] break-words line-clamp-2">
                    {abbreviateMoves(line)}
                  </p>
                  <div className="flex items-center gap-[4px] mt-1">
                    {masteryDots(mastery)}
                  </div>
                </div>

                {/* Due badge */}
                <div className="shrink-0">
                  {isDue ? (
                    <span className="flex items-center gap-[5px] bg-[#1A1A1A] border border-[#303030] rounded-full px-[10px] py-[4px]">
                      <span className="w-[5px] h-[5px] rounded-full bg-[#FFFFFF]" />
                      <span className="text-[12px] font-semibold text-[#FFFFFF] whitespace-nowrap">Повторить</span>
                    </span>
                  ) : null}
                </div>

                {/* Practice link */}
                <Link
                  href={`/openings/${id}/practice?line=${line.id}`}
                  className="shrink-0 h-9 flex items-center border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-5 text-[14px] transition-colors bg-transparent no-underline"
                >
                  Практика
                </Link>
              </div>
            );
          })
        )}

        {/* Add variation inline form */}
        {showAddLine && (
          <div className={`px-5 pb-5 pt-5 flex flex-col gap-5 ${lines.length > 0 ? 'border-t border-[#1E1E1E]' : ''}`}>
            <h3 className="m-0 font-[500] text-[26px] leading-[1.1]">
              Добавить вариации
            </h3>

            <div className="flex flex-col gap-[10px]">
              <label className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">
                PGN
              </label>
              <textarea
                value={addLinePgn}
                onChange={(e) => handleAddLinePgnChange(e.target.value)}
                rows={8}
                placeholder="Вставь PGN вариаций для добавления..."
                className="bg-[#050505] border border-[#262626] rounded-[12px] px-4 py-3 text-[14px] text-[#F5F5F5] placeholder-[#4A4540] outline-none focus:border-[#FFFFFF] transition-colors font-mono resize-y leading-[1.6]"
              />
              {addLineCount !== null && (
                <div
                  className={`flex items-center gap-2 text-[13px] font-medium px-4 py-[8px] rounded-[10px] border ${
                    addLineCount > 0
                      ? 'text-[#D0D0D0] bg-[#141414] border-[#303030]'
                      : 'text-[#A0A0A0] bg-[#1A1A1A] border-[#404040]'
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
              <div className="flex items-center gap-2 text-[14px] text-[#A0A0A0] bg-[#1A1A1A] border border-[#404040] rounded-[12px] px-5 py-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                </svg>
                {addLineError}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleAddLines}
                disabled={addingLine || !addLinePgn.trim()}
                className="h-9 bg-white text-[#050505] hover:bg-[#F0F0F0] rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                className="h-9 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-5 text-[14px] transition-colors bg-transparent cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
