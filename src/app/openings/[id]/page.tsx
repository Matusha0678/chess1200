'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
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
        i < mastery ? 'bg-[#D6B97E]' : 'bg-[#2A2722]'
      }`}
    />
  ));
}

function abbreviateMoves(line: OpeningLine, maxHalfMoves = 12): string {
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

export default function OpeningDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [lines, setLines] = useState<LineWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const now = new Date().toISOString();

  useEffect(() => {
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

    load();
  }, [id, router]);

  async function handleDelete() {
    if (!opening) return;
    setDeleting(true);

    // Delete in order: line_progress → opening_lines → openings
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

        {/* Action buttons */}
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

          {confirmDelete ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-[#D36B6B] text-center">Удалить дебют и все линии?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 border border-[#6B3A3A] text-[#D36B6B] hover:bg-[#2D1C1C] rounded-full px-4 py-[10px] text-[13px] font-semibold transition-colors bg-transparent disabled:opacity-50 cursor-pointer"
                >
                  {deleting ? 'Удаление...' : 'Да, удалить'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-4 py-[10px] text-[13px] font-medium transition-colors bg-transparent cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="border border-[#2A2722] text-[#B3AC9F] hover:border-[#6B3A3A] hover:text-[#D36B6B] rounded-full px-6 py-3 text-[14px] font-medium transition-colors bg-transparent cursor-pointer"
            >
              Удалить дебют
            </button>
          )}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4 mb-12">
        {[
          { label: 'Линий всего', value: linesTotal, color: 'text-[#F3EEE5]' },
          { label: 'Освоено', value: linesMastered, color: 'text-[#9BD3A6]' },
          { label: 'К повторению', value: linesDue, color: linesDue > 0 ? 'text-[#D6B97E]' : 'text-[#F3EEE5]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-6">
            <div className="text-[13px] text-[#B3AC9F] mb-1">{label}</div>
            <div className={`font-cormorant text-[44px] font-semibold leading-[1.1] ${color}`}>
              {value}
            </div>
          </div>
        ))}
      </section>

      {/* Lines list */}
      <section>
        <h2 className="m-0 font-cormorant font-[500] text-[36px] leading-[1.1] mb-6">
          Вариации
        </h2>

        {lines.length === 0 ? (
          <div className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-8 text-center text-[#B3AC9F]">
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
                  className="bg-[#15130F] border border-[#2A2722] rounded-[18px] px-5 py-4 flex items-center gap-4 hover:border-[#4A3E28] transition-colors"
                >
                  {/* Index */}
                  <span className="text-[13px] font-semibold text-[#5A5249] w-[28px] shrink-0 text-right">
                    {i + 1}
                  </span>

                  {/* Moves */}
                  <div className="flex-1 min-w-0">
                    <p className="m-0 text-[13px] font-mono text-[#B3AC9F] truncate leading-[1.5]">
                      {abbreviateMoves(line)}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      {/* Mastery dots */}
                      <div className="flex items-center gap-[4px]">
                        {masteryDots(mastery)}
                      </div>
                      <span className="text-[11px] text-[#5A5249]">
                        Уровень {mastery}/5
                      </span>
                      {prog && (
                        <span className="text-[11px] text-[#5A5249]">
                          {prog.correct_count}✓ {prog.incorrect_count}✗
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Due badge */}
                  {isDue && (
                    <div className="shrink-0 flex items-center gap-[5px] bg-[#2A2218] border border-[#4A3E28] rounded-full px-[10px] py-[3px]">
                      <span className="w-[5px] h-[5px] rounded-full bg-[#D6B97E]" />
                      <span className="text-[11px] font-semibold text-[#D6B97E]">Повторить</span>
                    </div>
                  )}

                  {/* Practice this line */}
                  <Link
                    href={`/openings/${id}/practice?line=${line.id}`}
                    className="shrink-0 border border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E] hover:text-[#F3EEE5] rounded-full px-4 py-[6px] text-[12px] font-medium transition-colors bg-transparent no-underline"
                  >
                    Практика
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
