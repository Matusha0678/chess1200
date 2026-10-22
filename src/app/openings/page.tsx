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
    <div className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-7 flex flex-col gap-4 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-[22px] w-[48px] bg-[#24221D] rounded-[8px]" />
        <div className="h-[22px] w-[80px] bg-[#24221D] rounded-full" />
      </div>
      <div className="h-[34px] w-3/4 bg-[#24221D] rounded-[8px]" />
      <div className="h-[5px] w-full bg-[#24221D] rounded-full" />
      <div className="h-[18px] w-1/3 bg-[#24221D] rounded-[6px]" />
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
    <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-[14px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#D6B97E]">
            <span>Репертуар</span>
            <span className="w-10 h-px bg-[#5A4C33]" />
            <span className="text-[#B3AC9F]">Дебюты</span>
          </div>
          <h1 className="m-0 font-cormorant font-[500] text-[48px] leading-[1] tracking-[-0.01em]">
            Дебюты
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <a
            href="https://www.chess.com/explorer"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-5 border border-[#34302A] text-[#E7E1D6] text-[14px] rounded-full hover:border-[#D6B97E] no-underline inline-flex items-center gap-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M8 7h9v9"/>
            </svg>
            Opening Explorer
          </a>
          <Link
            href="/openings/new"
            className="h-9 flex items-center gap-2 bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-5 text-[14px] font-semibold transition-colors no-underline"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Добавить дебют
          </Link>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : openings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
          <div className="text-[64px] leading-none select-none">♟</div>
          <div className="flex flex-col gap-2">
            <h2 className="m-0 font-cormorant font-[500] text-[40px] leading-[1.1]">
              Нет дебютов
            </h2>
            <p className="m-0 text-[15px] text-[#B3AC9F]">
              Добавь свой первый дебют, чтобы начать тренировки
            </p>
          </div>
          <Link
            href="/openings/new"
            className="h-9 flex items-center gap-2 bg-[#D6B97E] text-[#0D0C0A] hover:bg-[#E8D29C] rounded-full px-5 text-[14px] font-semibold transition-colors no-underline"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Добавить первый дебют
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
