// Shared loading logic for /stats and /convert
// In demo mode: returns DEMO_STATS data
// In real mode: loads from game_insights table
import type { DemoInsight } from './demo-positions';
export type { DemoInsight };

export async function loadInsights(demo: boolean): Promise<DemoInsight[]> {
  if (demo) {
    const { DEMO_STATS } = await import('./demo-positions');
    return [...DEMO_STATS.insights];
  }
  // Real mode: load from Supabase
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .from('game_insights')
    .select('*, games(opp_name, played_at, rating_me, time_class, eco_name)')
    .order('computed_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`Ошибка базы: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    opp: (r.games as Record<string, unknown>)?.opp_name ?? '?',
    date: (r.games as Record<string, unknown>)?.played_at ?? '',
    rating_me: (r.games as Record<string, unknown>)?.rating_me ?? null,
    time_class: (r.games as Record<string, unknown>)?.time_class ?? 'rapid',
    opening: (r.games as Record<string, unknown>)?.eco_name ?? null,
  })) as DemoInsight[];
}
