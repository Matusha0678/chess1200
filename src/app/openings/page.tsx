'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OpeningCard from '@/components/OpeningCard';
import { supabase } from '@/lib/supabase';
import type { Opening, LineProgress, ChessMove } from '@/types/openings';

interface OpeningStats {
  linesTotal: number;
  linesMastered: number;
  linesDue: number;
}

interface OpeningWithStats extends Opening {
  stats: OpeningStats;
  firstLineMoves?: ChessMove[];
}

function SkeletonCard() {
  return (
    <div className="bg-[#15130F] border border-[#2A2722] rounded-[20px] p-7 flex flex-col gap-4 animate-pulse">
      <div className="w-full aspect-square bg-[#24221D] rounded-[12px]" />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<'all' | 'white' | 'black' | 'both'>('all');

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

      // Load first line moves for mini board preview
      const { data: firstLines } = await supabase
        .from('opening_lines')
        .select('opening_id, moves')
        .eq('line_index', 0)
        .in('opening_id', openingIds);

      const firstLineMap: Record<string, ChessMove[]> = {};
      (firstLines ?? []).forEach((fl) => {
        firstLineMap[fl.opening_id] = fl.moves as ChessMove[];
      });

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
          firstLineMoves: firstLineMap[opening.id],
        };
      });

      setOpenings(withStats);
      setLoading(false);
    }

    loadOpenings();
  }, []);

  const filteredOpenings = openings.filter(o => {
    const matchesSearch = o.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesColor = colorFilter === 'all' || o.color === colorFilter;
    return matchesSearch && matchesColor;
  });

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

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5A5249]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Поиск дебюта..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 bg-[#15130F] border border-[#2A2722] rounded-[12px] pl-10 pr-4 text-[14px] text-[#F3EEE5] placeholder-[#4A4540] outline-none focus:border-[#D6B97E] transition-colors"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'white', 'black', 'both'] as const).map(f => (
            <button
              key={f}
              onClick={() => setColorFilter(f)}
              className={`h-10 px-4 rounded-[12px] text-[14px] border transition-colors cursor-pointer ${colorFilter === f ? 'bg-[#D6B97E] text-[#0D0C0A] border-[#D6B97E]' : 'bg-transparent border-[#2A2722] text-[#B3AC9F] hover:border-[#D6B97E]'}`}
            >
              {f === 'all' ? 'Все' : f === 'white' ? '♙ Белые' : f === 'black' ? '♟ Чёрные' : '♗ Оба'}
            </button>
          ))}
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
      ) : filteredOpenings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="font-cormorant text-[32px] text-[#B3AC9F]">Ничего не найдено</p>
          <p className="text-[15px] text-[#5A5249]">Попробуй изменить запрос или фильтр</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredOpenings.map((opening) => (
            <OpeningCard
              key={opening.id}
              opening={opening}
              linesTotal={opening.stats.linesTotal}
              linesMastered={opening.stats.linesMastered}
              linesDue={opening.stats.linesDue}
              firstLineMoves={opening.firstLineMoves}
              onClick={() => router.push(`/openings/${opening.id}`)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
