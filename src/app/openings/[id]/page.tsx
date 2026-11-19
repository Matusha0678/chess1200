'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OpeningTrainer } from '@/components/openings/OpeningTrainer';
import { toMoves, countStatuses } from '@/lib/opening-trainer';
import type { ChessMove, HardRow } from '@/lib/opening-trainer';
import type { TrainerMode } from '@/components/openings/OpeningTrainer';
import { getDemoTrainer, DEMO_GAME_DEV, DEMO_MOVE_ROWS } from '@/lib/demo-openings';

interface Props {
  params: Promise<{ id: string }>;
}

interface LineProgRow {
  mastery: number;
  next_review: string;
  correct_count: number;
  incorrect_count: number;
  last_practiced: string;
}

interface LineRow {
  id: string;
  line_index: number;
  moves: ChessMove[];
  badge: string | null;
  line_class: string | null;
  line_progress: LineProgRow[];
}

interface OpeningRow {
  id: string;
  name: string;
  color: 'white' | 'black' | 'both';
}

function detectMode(progs: Array<{ mastery: number; next_review: string } | null>, now: number): TrainerMode {
  const counts = countStatuses(progs, now);
  if (counts.due > 0) return 'review';
  if (counts.new > 0) return 'learn';
  return 'review';
}

export default function OpeningTrainerPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const isDemo = id === 'demo';

  const [opening, setOpening] = useState<OpeningRow | null>(null);
  const [lines, setLines] = useState<Array<{
    id: string; index: number; moves: ChessMove[];
    prog: { mastery: number; next_review: string; correct_count: number; incorrect_count: number } | null;
    badge: string | null; line_class: string | null;
  }>>([]);
  const [hardRows, setHardRows] = useState<HardRow[]>([]);
  const [gameDevs, setGameDevs] = useState<Array<{
    lineId: string; ply: number; played_uci: string; opp: string; date: string; result: 'win' | 'loss' | 'draw'; daysAgo: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TrainerMode>('review');
  const [initialLineId, setInitialLineId] = useState<string | null>(null);

  const loadDemo = useCallback(() => {
    const trainer = getDemoTrainer();
    setOpening({ id: 'demo', name: trainer.opening.name, color: trainer.opening.color });
    setLines(trainer.lines.map(l => ({
      id: l.id, index: l.index,
      moves: toMoves(l.sans),
      prog: l.prog ? {
        mastery: l.prog.mastery,
        next_review: l.prog.next_review,
        correct_count: l.prog.correct_count,
        incorrect_count: l.prog.incorrect_count,
      } : null,
      badge: l.badge, line_class: l.line_class,
    })));

    const now = Date.now();
    const DAY = 86400000;
    setHardRows(DEMO_MOVE_ROWS.map(r => ({
      line_id: r.line_id,
      move_index: r.move_index,
      incorrect_count: r.incorrect_count,
      last_missed_at: new Date(now - r.daysAgo * DAY).toISOString(),
    })));

    setGameDevs(DEMO_GAME_DEV.map(g => ({
      lineId: g.lineId, ply: g.ply, played_uci: g.played_uci,
      opp: g.opp, date: g.date, result: g.result, daysAgo: g.daysAgo,
    })));

    const modeParam = searchParams.get('mode') as TrainerMode | null;
    const lineParam = searchParams.get('line');
    const progs = trainer.lines.map(l => l.prog);
    setMode(modeParam && ['review','learn','exam','hard','free'].includes(modeParam)
      ? modeParam
      : detectMode(progs, Date.now()),
    );
    setInitialLineId(lineParam);
    setLoading(false);
  }, [searchParams]);

  const loadFromDB = useCallback(async () => {
    try {
      const { data: openingData, error: opErr } = await supabase
        .from('openings').select('*').eq('id', id).single();
      if (opErr || !openingData) { setError('Дебют не найден'); setLoading(false); return; }

      setOpening(openingData as OpeningRow);

      const { data: linesData, error: linesErr } = await supabase
        .from('opening_lines')
        .select('id, line_index, moves, badge, line_class, line_progress(*)')
        .eq('opening_id', id)
        .order('line_index');
      if (linesErr) { setError('Ошибка базы: ' + linesErr.message); setLoading(false); return; }

      const rows = (linesData ?? []) as LineRow[];
      const linesBuilt = rows.map(r => ({
        id: r.id, index: r.line_index,
        moves: Array.isArray(r.moves) ? r.moves as ChessMove[] : toMoves((r.moves as unknown as string) ?? ''),
        prog: r.line_progress?.[0] ? {
          mastery: r.line_progress[0].mastery,
          next_review: r.line_progress[0].next_review,
          correct_count: r.line_progress[0].correct_count ?? 0,
          incorrect_count: r.line_progress[0].incorrect_count ?? 0,
        } : null,
        badge: r.badge, line_class: r.line_class,
      }));
      setLines(linesBuilt);

      // Hard rows
      const lineIds = rows.map(r => r.id);
      if (lineIds.length > 0) {
        const { data: hardData } = await supabase
          .from('line_move_progress')
          .select('line_id, move_index, incorrect_count, last_missed_at')
          .in('line_id', lineIds)
          .gt('incorrect_count', 0);
        setHardRows((hardData ?? []) as HardRow[]);
      }

      // Game devs
      const { data: gameDevData } = await supabase
        .from('game_openings')
        .select('*, games(opp_name, played_at, result)')
        .eq('status', 'deviation')
        .in('line_ids', lineIds.map(id2 => `{${id2}}`));
      if (gameDevData) {
        const now = Date.now();
        const devs = (gameDevData as Array<Record<string, unknown>>).map(row => {
          const game = row.games as Record<string, string> | null;
          const playedAt = game?.played_at ?? '';
          const daysAgo = playedAt ? Math.floor((now - Date.parse(playedAt)) / 86400000) : 0;
          const lineId = Array.isArray(row.line_ids) ? (row.line_ids as string[])[0] : null;
          if (!lineId) return null;
          return {
            lineId, ply: (row.ply as number) ?? 0,
            played_uci: (row.played_uci as string) ?? '',
            opp: game?.opp_name ?? '?',
            date: playedAt ? new Date(playedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '?',
            result: (game?.result ?? 'loss') as 'win' | 'loss' | 'draw',
            daysAgo,
          };
        }).filter(Boolean) as typeof gameDevs;
        setGameDevs(devs);
      }

      const modeParam = searchParams.get('mode') as TrainerMode | null;
      const lineParam = searchParams.get('line');
      const progs = linesBuilt.map(l => l.prog);
      setMode(modeParam && ['review','learn','exam','hard','free'].includes(modeParam)
        ? modeParam
        : detectMode(progs, Date.now()),
      );
      setInitialLineId(lineParam);
      setLoading(false);
    } catch (e) {
      setError('Ошибка: ' + String(e));
      setLoading(false);
    }
  }, [id, searchParams]);

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

  const handleUpdateProgress = isDemo ? undefined : async (lineId: string, perfect: boolean) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    const { applyResult: ar } = await import('@/lib/opening-trainer');
    const applied = ar(line.prog, perfect, Date.now());
    await supabase.from('line_progress').upsert({
      line_id: lineId, ...applied.row,
    }, { onConflict: 'line_id' });
    await supabase.from('opening_practice_log').insert({
      opening_id: id, line_id: lineId,
      practiced_at: new Date().toISOString(),
      correct: perfect, mastery_after: applied.masteryAfter,
    });
    if (perfect) {
      void supabase.rpc('increment_xp', { amount: applied.xp });
    }
  };

  return (
    <OpeningTrainer
      opening={opening}
      lines={lines}
      hardRows={hardRows}
      gameDevs={gameDevs}
      initialMode={mode}
      initialLineId={initialLineId}
      isDemo={isDemo}
      onUpdateProgress={handleUpdateProgress}
      data-demo={isDemo ? 'openings' : undefined}
    />
  );
}
