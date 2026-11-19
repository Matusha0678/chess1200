'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OpeningTrainer } from '@/components/openings/OpeningTrainer';
import { toMoves, reviewQueue, lineStatus } from '@/lib/opening-trainer';
import type { ChessMove, HardRow } from '@/lib/opening-trainer';
import { getDemoTrainer, DEMO_SCOTCH, DEMO_GAME_DEV, DEMO_MOVE_ROWS } from '@/lib/demo-openings';

// For /openings/review we show all due lines from all openings.
// In demo mode: combines DEMO_TRAINER (L2, L3) + DEMO_SCOTCH (S2).

interface OpeningRow { id: string; name: string; color: 'white' | 'black' | 'both'; }
interface LineItem {
  id: string; index: number; moves: ChessMove[];
  prog: { mastery: number; next_review: string; correct_count: number; incorrect_count: number } | null;
  badge: string | null; line_class: string | null;
}

function ReviewAllPageInner() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === '1';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<OpeningRow | null>(null);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [hardRows] = useState<HardRow[]>([]);
  const [gameDevs, setGameDevs] = useState<Array<{
    lineId: string; ply: number; played_uci: string; opp: string; date: string; result: 'win' | 'loss' | 'draw'; daysAgo: number;
  }>>([]);

  const loadDemo = useCallback(() => {
    const trainer = getDemoTrainer();
    const now = Date.now();
    // Combine L2, L3 from trainer + S2 from scotch
    const demoLines: LineItem[] = [
      ...trainer.lines.map(l => ({
        id: l.id, index: l.index,
        moves: toMoves(l.sans),
        prog: l.prog ? {
          mastery: l.prog.mastery, next_review: l.prog.next_review,
          correct_count: l.prog.correct_count, incorrect_count: l.prog.incorrect_count,
        } : null,
        badge: l.badge, line_class: l.line_class,
      })),
      ...DEMO_SCOTCH.lines.map(l => ({
        id: l.id, index: l.index,
        moves: toMoves(l.sans),
        prog: l.prog ? {
          mastery: l.prog.mastery, next_review: l.prog.next_review,
          correct_count: l.prog.correct_count, incorrect_count: l.prog.incorrect_count,
        } : null,
        badge: l.badge, line_class: l.line_class,
      })),
    ];

    // Filter to only due lines
    const dueLines = demoLines.filter(l => lineStatus(l.prog, now) === 'due');
    setLines(dueLines);
    setOpening({ id: 'demo-review', name: 'Повторение', color: 'black' });

    const DAY = 86400000;
    setGameDevs(DEMO_GAME_DEV.map(g => ({
      lineId: g.lineId, ply: g.ply, played_uci: g.played_uci,
      opp: g.opp, date: g.date, result: g.result, daysAgo: g.daysAgo,
    })));
    void DEMO_MOVE_ROWS; void DAY;
    setLoading(false);
  }, []);

  const loadFromDB = useCallback(async () => {
    try {
      const { data: openingsData, error: opErr } = await supabase
        .from('openings').select('id, name, color');
      if (opErr) { setError('Ошибка базы: ' + opErr.message); setLoading(false); return; }

      const { data: linesData, error: lErr } = await supabase
        .from('opening_lines')
        .select('id, opening_id, line_index, moves, badge, line_class, line_progress(*)');
      if (lErr) { setError('Ошибка базы: ' + lErr.message); setLoading(false); return; }

      type LRow = {
        id: string; opening_id: string; line_index: number; moves: unknown;
        badge: string | null; line_class: string | null;
        line_progress: Array<{mastery: number; next_review: string; correct_count: number; incorrect_count: number}>;
      };
      const rows = (linesData ?? []) as LRow[];
      const now = Date.now();

      const allLines: LineItem[] = rows.map(r => ({
        id: r.id, index: r.line_index,
        moves: Array.isArray(r.moves) ? r.moves as ChessMove[] : toMoves((r.moves as string) ?? ''),
        prog: r.line_progress?.[0] ? {
          mastery: r.line_progress[0].mastery,
          next_review: r.line_progress[0].next_review,
          correct_count: r.line_progress[0].correct_count ?? 0,
          incorrect_count: r.line_progress[0].incorrect_count ?? 0,
        } : null,
        badge: r.badge, line_class: r.line_class,
      }));

      const withProg = allLines.map(l => ({ id: l.id, index: l.index, prog: l.prog }));
      const queueIds = reviewQueue(withProg, now);
      const dueLines = queueIds.map(qid => allLines.find(l => l.id === qid)).filter(Boolean) as LineItem[];
      setLines(dueLines);

      // Use first opening name or generic
      const firstOpening = (openingsData ?? [])[0] as OpeningRow | undefined;
      setOpening({ id: 'review-all', name: firstOpening?.name ?? 'Повторение', color: 'black' });
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

  return (
    <OpeningTrainer
      opening={opening}
      lines={lines}
      hardRows={hardRows}
      gameDevs={gameDevs}
      initialMode="review"
      isDemo={isDemo}
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
