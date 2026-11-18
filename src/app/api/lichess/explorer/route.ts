import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const fen = req.nextUrl.searchParams.get('fen');
  if (!fen) return NextResponse.json({ error: 'no_fen' }, { status: 400 });

  const token = process.env.LICHESS_TOKEN;
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 503 });

  const url = `https://explorer.lichess.org/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1200,1400,1600,1800&moves=6&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }

  if (res.status === 429) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  if (!res.ok) return NextResponse.json({ error: 'upstream_error' }, { status: 502 });

  const data = await res.json() as { white: number; draws: number; black: number; moves: Array<{ uci: string; san: string; white: number; draws: number; black: number }> };
  const total = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0);

  const moves = (data.moves ?? []).slice(0, 5).map(m => {
    const mTotal = m.white + m.draws + m.black;
    const share = total > 0 ? mTotal / total : 0;
    // score from the perspective of the side to move: wins + draws/2
    // FEN determines who's to move; we pass wins as white wins, so adjust by turn
    const whiteScore = mTotal > 0 ? (m.white + m.draws / 2) / mTotal : 0;
    return { san: m.san, uci: m.uci, share, score: whiteScore };
  });

  return NextResponse.json({ total, moves });
}
