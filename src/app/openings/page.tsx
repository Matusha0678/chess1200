'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import OpeningCard from '@/components/OpeningCard';
import { supabase } from '@/lib/supabase';
import type { Opening, LineProgress, ChessMove } from '@/types/openings';

interface OpeningStats { linesTotal: number; linesMastered: number; linesDue: number; }
interface OpeningWithStats extends Opening { stats: OpeningStats; firstLineMoves?: ChessMove[]; }

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

  const filters: Array<{ value: 'all' | 'white' | 'black' | 'both'; label: string }> = [
    { value: 'all',   label: 'Все' },
    { value: 'white', label: 'Белые' },
    { value: 'black', label: 'Чёрные' },
    { value: 'both',  label: 'Оба' },
  ];

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Дебюты</h1>
          <p className="page-lead">Репертуар и тренировка дебютных линий</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="https://www.chess.com/explorer"
            target="_blank"
            rel="noopener noreferrer"
            className="ui-btn ui-btn-outline"
          >
            Explorer
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>
          </a>
          <Link href="/openings/new" className="ui-btn ui-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            Добавить дебют
          </Link>
        </div>
      </div>

      {/* Random banner */}
      <Link
        href="/openings/random"
        className="ui-card random-banner-link"
        style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none', color: 'inherit' }}
      >
        <span style={{
          flexShrink: 0, width: 44, height: 44,
          borderRadius: 'var(--radius-btn)',
          background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
          color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="3"/>
            <circle cx="9" cy="9" r="0.8" fill="currentColor"/>
            <circle cx="15" cy="9" r="0.8" fill="currentColor"/>
            <circle cx="9" cy="15" r="0.8" fill="currentColor"/>
            <circle cx="15" cy="15" r="0.8" fill="currentColor"/>
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', lineHeight: 1.2 }}>Дебют Рандом</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Играй против Stockfish — он тренирует твои сохранённые дебюты</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--muted)' }}>
          <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
        </svg>
      </Link>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="ui-search-wrap" style={{ flex: '1 1 240px' }}>
          <svg className="ui-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
          </svg>
          <label htmlFor="q-openings" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Поиск дебюта</label>
          <input
            id="q-openings"
            type="text"
            placeholder="Поиск дебюта…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ui-search search-input"
          />
        </div>

        <div className="chip-row" role="group" aria-label="Фильтр по цвету">
          {filters.map(f => (
            <button
              key={f.value}
              type="button"
              aria-pressed={colorFilter === f.value}
              onClick={() => setColorFilter(f.value)}
              className={`ui-chip ${colorFilter === f.value ? 'ui-chip-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ui-card animate-pulse" style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              <div style={{ flex: '0 1 220px', minWidth: 160, aspectRatio: '1/1', background: 'var(--track)', borderRadius: 'calc(var(--radius-card) * 0.5)' }} />
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 12, width: 80, background: 'var(--track)', borderRadius: 4 }} />
                <div style={{ height: 28, width: '70%', background: 'var(--track)', borderRadius: 4 }} />
                <div style={{ marginTop: 'auto', height: 4, background: 'var(--track)', borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      ) : openings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">♟</div>
          <div className="empty-state-title">Нет дебютов</div>
          <p className="empty-state-text">Добавь первый дебют, чтобы начать тренировки</p>
          <Link href="/openings/new" className="ui-btn ui-btn-primary">
            Добавить первый дебют
          </Link>
        </div>
      ) : filteredOpenings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Ничего не найдено</div>
          <p className="empty-state-text">Попробуй изменить запрос или фильтр</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 16 }}>
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
    </div>
  );
}
