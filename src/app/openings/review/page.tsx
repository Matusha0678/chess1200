'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OpeningTrainer } from '@/components/openings/OpeningTrainer';
import { toMoves, lineStatus } from '@/lib/opening-trainer';
import type { ChessMove, HardRow } from '@/lib/opening-trainer';
import { getDemoTrainer, DEMO_SCOTCH, DEMO_GAME_DEV, DEMO_MOVE_ROWS } from '@/lib/demo-openings';

// /openings/review — все линии из всех дебютов; очередь строит OpeningTrainer.

interface OpeningRow { id: string; name: string; color: 'white' | 'black' | 'both'; }
interface LineItem {
  id: string; index: number; moves: ChessMove[];
  opening_id: string;
  prog: { mastery: number; next_review: string; correct_count: number; incorrect_count: number } | null;
  badge: string | null; line_class: string | null;
  opening_color: 'white' | 'black' | 'both';
}

function ReviewAllPageInner() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === '1';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<OpeningRow | null>(null);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [hardRows] = useState<HardRow[]>([]);
  const [gameDevs] = useState<Array<{
    lineId: string; ply: number; played_uci: string; opp: string; date: string; result: 'win' | 'loss' | 'draw'; daysAgo: number;
  }>>([]);

  const loadDemo = useCallback(() => {
    const trainer = getDemoTrainer();
    const now = Date.now();
    const demoLines: LineItem[] = [
      ...trainer.lines.map(l => ({
        id: l.id, index: l.index,
        moves: toMoves(l.sans),
        opening_id: 'demo-opening-black',
        prog: l.prog ? {
          mastery: l.prog.mastery, next_review: l.prog.next_review,
          correct_count: l.prog.correct_count, incorrect_count: l.prog.incorrect_count,
        } : null,
        badge: l.badge, line_class: l.line_class,
        opening_color: 'black' as const,
      })),
      ...DEMO_SCOTCH.lines.map(l => ({
        id: l.id, index: l.index,
        moves: toMoves(l.sans),
        opening_id: 'demo-opening-white',
        prog: l.prog ? {
          mastery: l.prog.mastery, next_review: l.prog.next_review,
          correct_count: l.prog.correct_count, incorrect_count: l.prog.incorrect_count,
        } : null,
        badge: l.badge, line_class: l.line_class,
        opening_color: 'white' as const,
      })),
    ];

    const dueLines = demoLines.filter(l => lineStatus(l.prog, now) === 'due');
    setLines(dueLines);
    setOpening({ id: 'demo-review', name: 'Повторение', color: 'both' });
    void DEMO_MOVE_ROWS; void DEMO_GAME_DEV;
    setLoading(false);
  }, []);

  const loadFromDB = useCallback(async () => {
    try {
      const { data: openingsData, error: opErr } = await supabase
        .from('openings').select('id, name, color');
      if (opErr) { setError('Ошибка базы: ' + opErr.message); setLoading(false); return; }

      const openingColorMap = new Map<string, 'white' | 'black' | 'both'>();
      const openingNameList: string[] = [];
      for (const op of (openingsData ?? []) as Array<{ id: string; name: string; color: string }>) {
        openingColorMap.set(op.id, (op.color as 'white' | 'black' | 'both') ?? 'both');
        openingNameList.push(op.name);
      }

      // Load lines without embedded progress join (more reliable)
      const { data: linesData, error: lErr } = await supabase
        .from('opening_lines')
        .select('id, opening_id, line_index, moves, badge, line_class');
      if (lErr) { setError('Ошибка базы: ' + lErr.message); setLoading(false); return; }

      const rows = (linesData ?? []) as Array<{
        id: string; opening_id: string; line_index: number; moves: unknown;
        badge: string | null; line_class: string | null;
      }>;

      // Load progress separately — same approach as catalog page
      const lineIds = rows.map(r => r.id);
      const progMap = new Map<string, { mastery: number; next_review: string; correct_count: number; incorrect_count: number; last_practiced?: string }>();
      if (lineIds.length > 0) {
        const { data: progData } = await supabase
          .from('line_progress')
          .select('line_id, mastery, next_review, correct_count, incorrect_count, last_practiced')
          .in('line_id', lineIds);
        for (const p of (progData ?? []) as Array<{ line_id: string; mastery: number; next_review: string; correct_count: number; incorrect_count: number; last_practiced: string }>) {
          progMap.set(p.line_id, { mastery: p.mastery, next_review: p.next_review, correct_count: p.correct_count ?? 0, incorrect_count: p.incorrect_count ?? 0, last_practiced: p.last_practiced });
        }
      }

      // Overlay with localStorage so reviews work even when DB writes fail silently.
      if (typeof window !== 'undefined') {
        for (const lid of lineIds) {
          try {
            const raw = window.localStorage.getItem(`op-lp:${lid}`);
            if (!raw) continue;
            const local = JSON.parse(raw) as { mastery: number; next_review: string; correct_count: number; incorrect_count: number; last_practiced: string };
            const db = progMap.get(lid);
            const dbT = db ? Date.parse(db.last_practiced ?? '1970-01-01') : 0;
            const loT = Date.parse(local.last_practiced ?? '1970-01-01');
            if (!db || loT >= dbT) progMap.set(lid, local);
          } catch { /* ignore */ }
        }
      }

      const allLines: LineItem[] = rows.map(r => ({
        id: r.id, index: r.line_index,
        opening_id: r.opening_id,
        moves: Array.isArray(r.moves) ? r.moves as ChessMove[] : toMoves((r.moves as string) ?? ''),
        prog: progMap.get(r.id) ?? null,
        badge: r.badge, line_class: r.line_class,
        opening_color: openingColorMap.get(r.opening_id) ?? 'both',
      }));

      // Pass ALL lines — OpeningTrainer builds the review queue internally.
      // This lets "Повторять" button work properly after a session.
      setLines(allLines);
      setOpening({
        id: 'review-all',
        name: openingNameList.length > 0 ? 'Повторение всех дебютов' : 'Повторение',
        color: 'both',
      });
      setLoading(false);
    } catch (e) {
      setError('Ошибка: ' + String(e));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isDemo) loadDemo();
    else void loadFromDB();
  }, [isDemo, loadDemo, loadFromDB]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--muted)', fontSize: 15 }}>
        Загрузка…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--muted)', fontSize: 15 }}>
        {error}
      </div>
    );
  }
  if (!opening) return null;

  const handleUpdateProgress = isDemo ? undefined : async (
    lineId: string,
    perfect: boolean,
    row: { mastery: number; next_review: string; correct_count: number; incorrect_count: number; last_practiced: string },
    masteryAfter: number,
    xp: number,
    mistakePlies: number[],
  ) => {
    // Durable local write first — survives DB write failures.
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(`op-lp:${lineId}`, JSON.stringify(row)); } catch { /* quota */ }
    }
    const { error: upErr } = await supabase.from('line_progress').upsert(
      { line_id: lineId, ...row },
      { onConflict: 'line_id' },
    );
    if (upErr) console.error('line_progress upsert failed:', upErr.message);

    const openingId = lines.find(l => l.id === lineId)?.opening_id;
    if (openingId) {
      void supabase.from('opening_practice_log').insert({
        opening_id: openingId, line_id: lineId,
        practiced_at: row.last_practiced,
        correct: perfect, mastery_after: masteryAfter,
      });
    }

    for (const ply of mistakePlies) {
      const { data: existing } = await supabase
        .from('line_move_progress')
        .select('id, incorrect_count')
        .eq('line_id', lineId).eq('move_index', ply).maybeSingle();
      if (existing) {
        const r = existing as { id: string; incorrect_count: number };
        void supabase.from('line_move_progress')
          .update({ incorrect_count: r.incorrect_count + 1, last_missed_at: row.last_practiced })
          .eq('id', r.id);
      } else {
        void supabase.from('line_move_progress')
          .insert({ line_id: lineId, move_index: ply, incorrect_count: 1, last_missed_at: row.last_practiced });
      }
    }

    if (xp > 0) void supabase.rpc('increment_xp', { amount: xp });
  };

  return (
    <OpeningTrainer
      opening={opening}
      lines={lines}
      hardRows={hardRows}
      gameDevs={gameDevs}
      initialMode="review"
      isDemo={isDemo}
      onUpdateProgress={handleUpdateProgress}
      data-demo={isDemo ? 'openings' : undefined}
    />
  );
}

export default function ReviewAllPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--muted)', fontSize: 15 }}>
        Загрузка…
      </div>
    }>
      <ReviewAllPageInner />
    </Suspense>
  );
}
