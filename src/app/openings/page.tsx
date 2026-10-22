'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OpeningCard from '@/components/OpeningCard';
import { supabase } from '@/lib/supabase';
import type { Opening, LineProgress } from '@/types/openings';

interface OpeningStats {
  linesTotal: number;
  linesMastered: number;
  linesDue: number;
}

interface OpeningWithStats extends Opening {
  stats: OpeningStats;
}

function SkeletonCard() {
  return (
    <div className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-6 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-[6px] min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-[20px] w-[48px] bg-[#24221D] rounded-[6px]" />
            <div className="h-[18px] w-[72px] bg-[#24221D] rounded-[6px]" />
          </div>
          <div className="h-[30px] w-3/4 bg-[#24221D] rounded-[8px] mt-1" />
        </div>
      </div>
      <div className="flex flex-col gap-[10px]">
        <div className="h-[5px] w-full bg-[#24221D] rounded-full" />
        <div className="h-[18px] w-1/2 bg-[#24221D] rounded-[6px]" />
      </div>
    </div>
  );
}

export default function OpeningsPage() {
  const router = useRouter();
  const [openings, setOpenings] = useState<OpeningWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOpenings() {
      setLoading(true);

      const { data: openingsData } = await supabase
        .from('openings')
        .select('*')
        .order('created_at', { ascending: false });

      if (!openingsData || openingsData.length === 0) {
        setOpenings([]);
        setLoading(false);
        return;
      }

      // Load all opening_lines for all openings in one query
      const openingIds = openingsData.map((o) => o.id);
      const { data: allLines } = await supabase
        .from('opening_lines')
        .select('id, opening_id')
        .in('opening_id', openingIds);

      const allLineIds = (allLines ?? []).map((l) => l.id);

      // Load all line_progress for all lines in one query
      const { data: allProgress } = allLineIds.length > 0
        ? await supabase.from('line_progress').select('*').in('line_id', allLineIds)
        : { data: [] as LineProgress[] };

      const now = new Date().toISOString();

      const withStats: OpeningWithStats[] = openingsData.map((opening) => {
        const lines = (allLines ?? []).filter((l) => l.opening_id === opening.id);
        const lineIds = lines.map((l) => l.id);
        const progress = (allProgress ?? []).filter((p) => lineIds.includes(p.line_id));

        const linesTotal = lines.length;
        const linesMastered = progress.filter((p) => p.mastery >= 4).length;
        const linesDue = progress.filter(
          (p) => p.next_review <= now && p.mastery < 5,
        ).length;

        return {
          ...(opening as Opening),
          stats: { linesTotal, linesMastered, linesDue },
        };
      });

      setOpenings(withStats);
      setLoading(false);
    }

    loadOpenings();
  }, []);

  return (
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-5 mb-12">
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center gap-[14px] text-[13px] font-semibold tracking-[0.16em] uppercase text-[#D6B97E]">
            <span>Репертуар</span>
            <span className="w-10 h-px bg-[#5A4C33]" />
            <span className="text-[#B3AC9F]">Дебюты</span>
          </div>
          <h1 className="m-0 font-cormorant font-[500] text-[56px] md:text-[80px] leading-[0.98] tracking-[-0.015em]">
            Дебюты
          </h1>
          <p className="m-0 text-[16px] text-[#B3AC9F]">Твой репертуар</p>
        </div>

        <Link
          href="/openings/new"
          className="flex items-center gap-2 bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-6 py-3 text-[14px] font-semibold transition-colors no-underline"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Добавить дебют
        </Link>
      </section>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : openings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-8 py-24 text-center">
          <div className="text-[72px] leading-none select-none">♟</div>
          <div className="flex flex-col gap-3">
            <h2 className="m-0 font-cormorant font-[500] text-[40px] leading-[1.1]">
              Нет дебютов
            </h2>
            <p className="m-0 text-[16px] text-[#B3AC9F]">
              Добавь свой первый дебют, чтобы начать тренировки
            </p>
          </div>
          <Link
            href="/openings/new"
            className="flex items-center gap-2 bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-7 py-3 text-[15px] font-semibold transition-colors no-underline"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Добавить первый дебют
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {openings.map((opening) => (
            <OpeningCard
              key={opening.id}
              opening={opening}
              linesTotal={opening.stats.linesTotal}
              linesMastered={opening.stats.linesMastered}
              linesDue={opening.stats.linesDue}
              onClick={() => router.push(`/openings/${opening.id}`)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
