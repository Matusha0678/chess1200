// Richer aggregates over raw Game[] for /games stats panels.
import type { Game } from './chesscom';

export interface OpponentStat {
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  avgRating: number | null;
}

export interface MonthStat {
  month: string; // YYYY-MM
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  avgRating: number | null;
}

export function opponentList(games: Game[], limit = 10): OpponentStat[] {
  const map = new Map<string, OpponentStat>();
  for (const g of games) {
    const name = (g.opp_name || '—').trim();
    if (!name || name === '—') continue;
    let s = map.get(name);
    if (!s) {
      s = { name, games: 0, wins: 0, draws: 0, losses: 0, avgRating: null };
      map.set(name, s);
    }
    s.games++;
    if (g.result === 'win') s.wins++;
    else if (g.result === 'loss') s.losses++;
    else s.draws++;
    if (g.rating_opp != null) {
      const prev = s.avgRating ?? 0;
      s.avgRating = Math.round((prev * (s.games - 1) + g.rating_opp) / s.games);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.games - a.games)
    .slice(0, limit);
}

export function opponentNemesis(games: Game[]): OpponentStat | null {
  const list = opponentList(games, 100).filter(s => s.games >= 3);
  if (list.length === 0) return null;
  // Worst winrate (then most games as tiebreaker)
  return [...list].sort((a, b) => {
    const awp = a.wins / a.games;
    const bwp = b.wins / b.games;
    if (awp !== bwp) return awp - bwp;
    return b.games - a.games;
  })[0];
}

export function opponentBest(games: Game[]): OpponentStat | null {
  const list = opponentList(games, 100).filter(s => s.games >= 2 && s.wins >= 1);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => {
    const awp = a.wins / a.games;
    const bwp = b.wins / b.games;
    if (awp !== bwp) return bwp - awp;
    return b.games - a.games;
  })[0];
}

// ── Opening diversity ────────────────────────────────────────────────
export interface OpeningStrength {
  eco: string;
  count: number;
  wins: number;
  winPct: number;
}

export function openingBreakdown(games: Game[]): OpeningStrength[] {
  const map = new Map<string, { count: number; wins: number }>();
  for (const g of games) {
    const key = (g.eco_name || '—').trim();
    if (!key || key === '—') continue;
    const prev = map.get(key) ?? { count: 0, wins: 0 };
    prev.count++;
    if (g.result === 'win') prev.wins++;
    map.set(key, prev);
  }
  return Array.from(map.entries())
    .map(([eco, v]) => ({ eco, ...v, winPct: v.count > 0 ? Math.round((v.wins / v.count) * 100) : 0 }));
}

// ── Monthly stats for comparison ─────────────────────────────────────
export function monthlyBreakdown(games: Game[], months = 6): MonthStat[] {
  const map = new Map<string, MonthStat>();
  for (const g of games) {
    if (!g.played_at) continue;
    const d = new Date(g.played_at);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let s = map.get(key);
    if (!s) {
      s = { month: key, games: 0, wins: 0, draws: 0, losses: 0, winPct: 0, avgRating: null };
      map.set(key, s);
    }
    s.games++;
    if (g.result === 'win') s.wins++;
    else if (g.result === 'loss') s.losses++;
    else s.draws++;
    if (g.rating_me != null) {
      const prev = s.avgRating ?? 0;
      s.avgRating = Math.round((prev * (s.games - 1) + g.rating_me) / s.games);
    }
  }
  return Array.from(map.values())
    .map(m => ({ ...m, winPct: m.games > 0 ? Math.round((m.wins / m.games) * 100) : 0 }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, months);
}

export function monthLabelRu(month: string): string {
  const [y, m] = month.split('-');
  const names = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const i = parseInt(m) - 1;
  if (i < 0 || i > 11) return month;
  return `${names[i]} ${y}`;
}

// ── Rating history ───────────────────────────────────────────────────
export interface RatingPoint { t: number; r: number; }

export function ratingHistory(games: Game[]): RatingPoint[] {
  const pts: RatingPoint[] = [];
  for (const g of games) {
    if (g.rating_me == null || !g.played_at) continue;
    const t = new Date(g.played_at).getTime();
    if (!isNaN(t)) pts.push({ t, r: g.rating_me });
  }
  return pts.sort((a, b) => a.t - b.t);
}
