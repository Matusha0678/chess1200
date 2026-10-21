import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchPlayerStats, fetchMonthlyGames, classifyTimeControl, findCastlingMove } from '@/lib/chess-api';
import { CHESS_USERNAME } from '@/lib/constants';

export async function GET() {
  try {
    const stats = await fetchPlayerStats(CHESS_USERNAME);
    const rating: number | null = stats?.chess_rapid?.last?.rating ?? null;

    const today = new Date().toISOString().split('T')[0];
    if (rating) {
      await supabase.from('rating_history').upsert({ date: today, rating }, { onConflict: 'date' });
    }

    const now = new Date();
    const games = await fetchMonthlyGames(CHESS_USERNAME, now.getFullYear(), now.getMonth() + 1);

    const todayGames = games.filter((g: Record<string, unknown>) => {
      const d = new Date((g.end_time as number) * 1000).toISOString().split('T')[0];
      return d === today;
    });

    const blitzWarning = todayGames.some((g: Record<string, unknown>) => {
      const tc = classifyTimeControl(g.time_control as string);
      return tc === 'blitz' || tc === 'bullet';
    });

    const rapidToday = todayGames.filter((g: Record<string, unknown>) =>
      classifyTimeControl(g.time_control as string) === 'rapid'
    );

    let lossStreak = 0;
    let lossStreakWarning = false;
    for (const g of rapidToday) {
      const uname = CHESS_USERNAME.toLowerCase();
      const white = g.white as Record<string, unknown>;
      const black = g.black as Record<string, unknown>;
      const side = (white.username as string).toLowerCase() === uname ? white : black;
      const result = side.result as string;
      if (['resigned', 'checkmated', 'timeout', 'abandoned'].includes(result)) {
        lossStreak++;
        if (lossStreak >= 2) lossStreakWarning = true;
      } else {
        lossStreak = 0;
      }
    }

    const latecastleGames: string[] = [];
    for (const g of rapidToday) {
      const pgn = g.pgn as string;
      const castleMove = findCastlingMove(pgn);
      if (castleMove !== null && castleMove > 10) latecastleGames.push(g.url as string);

      const uname = CHESS_USERNAME.toLowerCase();
      const white = g.white as Record<string, unknown>;
      const black = g.black as Record<string, unknown>;
      const side = (white.username as string).toLowerCase() === uname ? white : black;
      const result = side.result as string;
      const resultLabel = result === 'win' ? 'win'
        : ['resigned', 'checkmated', 'timeout', 'abandoned'].includes(result) ? 'loss'
        : 'draw';

      await supabase.from('game_logs').upsert({
        chess_com_id: g.url as string,
        played_at: today,
        time_control: classifyTimeControl(g.time_control as string),
        result: resultLabel,
        castling_move: castleMove,
        pgn,
      }, { onConflict: 'chess_com_id' });
    }

    return NextResponse.json({ rating, blitzWarning, lossStreakWarning, latecastleGames, gamesCount: rapidToday.length });
  } catch (err) {
    console.error('chess-sync error', err);
    return NextResponse.json({ error: 'sync failed' }, { status: 500 });
  }
}
