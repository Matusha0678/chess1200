'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import OpeningCard from '@/components/OpeningCard';
import { supabase } from '@/lib/supabase';
import type { Opening, LineProgress, ChessMove } from '@/types/openings';

interface OpeningStats { linesTotal: number; linesMastered: number; linesDue: number; }
interface OpeningWithStats extends Opening { stats: OpeningStats; firstLineMoves?: ChessMove[]; }

const HEADING: React.CSSProperties = { fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" };
const EYEBROW: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase' };
const EYEBROW_LINE: React.CSSProperties = { width: 48, height: 1, background: 'var(--eyebrow-line)', flexShrink: 0 };

export default function OpeningsPage() {
  const [openings, setOpenings] = useState<OpeningWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<'all' | 'white' | 'black' | 'both'>('all');

  useEffect(() => {
    async function loadOpenings() {
      setLoading(true);
      const { data: openingsData } = await supabase.from('openings').select('*').order('created_at', { ascending: false });
      if (!openingsData || openingsData.length === 0) { setOpenings([]); setLoading(false); return; }

      const openingIds = openingsData.map((o) => o.id);
      const { data: allLines } = await supabase.from('opening_lines').select('id, opening_id').in('opening_id', openingIds);
      const allLineIds = (allLines ?? []).map((l) => l.id);
      const { data: allProgress } = allLineIds.length > 0
        ? await supabase.from('line_progress').select('*').in('line_id', allLineIds)
        : { data: [] as LineProgress[] };

      const { data: firstLines } = await supabase.from('opening_lines').select('opening_id, moves').in('opening_id', openingIds).order('line_index', { ascending: true });
      const firstLineMap: Record<string, ChessMove[]> = {};
      (firstLines ?? []).forEach((fl) => { if (!firstLineMap[fl.opening_id]) firstLineMap[fl.opening_id] = fl.moves as ChessMove[]; });

      const now = new Date().toISOString();
      const withStats: OpeningWithStats[] = openingsData.map((opening) => {
        const lines = (allLines ?? []).filter((l) => l.opening_id === opening.id);
        const lineIds = lines.map((l) => l.id);
        const progress = (allProgress ?? []).filter((p) => lineIds.includes(p.line_id));
        return {
          ...(opening as Opening),
          stats: {
            linesTotal: lines.length,
            linesMastered: progress.filter((p) => p.mastery >= 4).length,
            linesDue: progress.filter((p) => p.next_review <= now && p.mastery < 5).length,
          },
          firstLineMoves: firstLineMap[opening.id],
        };
      });

      setOpenings(withStats);
      setLoading(false);
    }
    loadOpenings();
  }, []);

  const filteredOpenings = openings
    .filter(o => {
      const matchesSearch = o.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesColor = colorFilter === 'all' || o.color === colorFilter;
      return matchesSearch && matchesColor;
    })
    .sort((a, b) => {
      if (b.stats.linesDue !== a.stats.linesDue) return b.stats.linesDue - a.stats.linesDue;
      return b.stats.linesTotal - a.stats.linesTotal;
    });

  const filters: Array<{ value: 'all' | 'white' | 'black' | 'both'; label: string; icon?: string }> = [
    { value: 'all', label: 'Все' },
    { value: 'white', label: 'Белые', icon: 'white' },
    { value: 'black', label: 'Чёрные', icon: 'black' },
    { value: 'both', label: 'Оба', icon: 'both' },
  ];

  return (
    <main style={{ maxWidth: 1600, margin: '0 auto', padding: '44px 48px 72px', display: 'flex', flexDirection: 'column', gap: 24, boxSizing: 'border-box' }}>

      {/* Hero row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={EYEBROW}>
            <span>РЕПЕРТУАР</span>
            <span style={EYEBROW_LINE} />
            <span>ДЕБЮТЫ</span>
          </div>
          <h1 style={{ ...HEADING, margin: 0, fontWeight: 700, fontSize: 88, lineHeight: 0.88, letterSpacing: '-0.015em' }}>Дебюты</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="https://www.chess.com/explorer"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 22px', border: '1px solid var(--ivory)', fontSize: 14, fontWeight: 600, color: 'var(--ivory)', boxSizing: 'border-box' }}
          >
            Opening Explorer
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>
          </a>
          <Link
            href="/openings/new"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 24px', border: '1px solid var(--ivory)', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            Добавить дебют
          </Link>
        </div>
      </div>

      {/* Random banner */}
      <Link
        href="/openings/random"
        style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', background: 'var(--ivory)', color: 'var(--ink)' }}
      >
        <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="3"/>
            <circle cx="9" cy="9" r="0.8" fill="currentColor"/>
            <circle cx="15" cy="9" r="0.8" fill="currentColor"/>
            <circle cx="9" cy="15" r="0.8" fill="currentColor"/>
            <circle cx="15" cy="15" r="0.8" fill="currentColor"/>
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          <span style={{ ...HEADING, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Дебют Рандом</span>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Играй против Stockfish — он тренирует твои сохранённые дебюты</span>
        </span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
      </Link>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 0 }}>
          <label htmlFor="q-openings" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Поиск дебюта</label>
          <input
            id="q-openings"
            type="text"
            placeholder="Поиск дебюта…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', height: 48, boxSizing: 'border-box',
              padding: '0 16px 0 32px', background: 'transparent',
              border: 0, borderBottom: '1px solid var(--ivory)', borderRadius: 0,
              color: 'var(--ivory)', fontSize: 15, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ position: 'absolute', left: 4, top: 16 }}>
            <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
          </svg>
        </div>

        {/* Filter chips */}
        <div role="group" aria-label="Фильтр по цвету" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map(f => {
            const active = colorFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setColorFilter(f.value)}
                style={{
                  height: 44,
                  padding: active && f.value === 'all' ? '0 20px' : '0 18px',
                  border: active ? '1px solid var(--ivory)' : '1px solid var(--control)',
                  borderRadius: 999,
                  background: active ? 'var(--ivory)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ivory)',
                  fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'inherit',
                }}
              >
                {f.icon === 'white' && (
                  <span aria-hidden="true" style={{ fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 18, lineHeight: 1, color: active ? 'var(--ink)' : 'var(--ivory)' }}>♚</span>
                )}
                {f.icon === 'black' && (
                  <span aria-hidden="true" style={{ fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 18, lineHeight: 1, color: active ? 'var(--ivory)' : 'var(--ink)', WebkitTextStroke: `0.8px ${active ? 'var(--ink)' : 'var(--ivory)'}` }}>♚</span>
                )}
                {f.icon === 'both' && (
                  <span aria-hidden="true" style={{ display: 'inline-flex', fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif", fontSize: 18, lineHeight: 1 }}>
                    <span style={{ color: active ? 'var(--ink)' : 'var(--ivory)' }}>♚</span>
                    <span style={{ marginLeft: -4, color: active ? 'var(--ivory)' : 'var(--ink)', WebkitTextStroke: `0.8px ${active ? 'var(--ink)' : 'var(--ivory)'}` }}>♚</span>
                  </span>
                )}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of opening cards */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(520px, 100%), 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: 16, border: '1px solid var(--hairline)', background: 'var(--surface)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
              <div style={{ flex: '0 1 220px', minWidth: 160, aspectRatio: '1/1', background: 'var(--track)' }} />
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ height: 14, width: 80, background: 'var(--track)' }} />
                <div style={{ height: 34, width: '70%', background: 'var(--track)' }} />
                <div style={{ marginTop: 'auto', height: 2, background: 'var(--track)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : openings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '80px 0', textAlign: 'center' }}>
          <h2 style={{ ...HEADING, margin: 0, fontWeight: 700, fontSize: 56, letterSpacing: '-0.03em', lineHeight: 1 }}>Нет дебютов</h2>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--muted)' }}>Добавь свой первый дебют, чтобы начать тренировки</p>
          <Link href="/openings/new" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>
            + Добавить первый дебют
          </Link>
        </div>
      ) : filteredOpenings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '64px 0', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 20, color: 'var(--muted)' }}>Ничего не найдено</p>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--control)' }}>Попробуй изменить запрос или фильтр</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(520px, 100%), 1fr))', gap: 16 }}>
          {filteredOpenings.map((opening, idx) => (
            <OpeningCard
              key={opening.id}
              opening={opening}
              index={idx + 1}
              linesTotal={opening.stats.linesTotal}
              linesMastered={opening.stats.linesMastered}
              linesDue={opening.stats.linesDue}
              firstLineMoves={opening.firstLineMoves}
              href={`/openings/${opening.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
