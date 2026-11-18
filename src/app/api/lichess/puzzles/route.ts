import { NextResponse } from 'next/server';
import { parsePuzzle } from '@/lib/lichess-puzzles';
import type { LichessPuzzleRaw } from '@/lib/lichess-puzzles';

// One request at a time
let busy = false;

const SAFE_ANGLE = /^[a-zA-Z0-9]+$/;

export async function GET(req: Request) {
  const token = process.env.LICHESS_TOKEN;
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const angle = searchParams.get('angle') ?? 'mix';
  const nb = Math.min(50, Math.max(1, parseInt(searchParams.get('nb') ?? '10', 10)));
  const difficulty = searchParams.get('difficulty') ?? 'normal';

  if (!SAFE_ANGLE.test(angle)) {
    return NextResponse.json({ error: 'invalid_angle' }, { status: 400 });
  }

  if (busy) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  busy = true;

  try {
    const url = `https://lichess.org/api/puzzle/batch/${angle}?nb=${nb}&difficulty=${difficulty}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (res.status === 429) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    if (!res.ok) return NextResponse.json({ error: `lichess_${res.status}` }, { status: 502 });

    const json = await res.json() as { puzzles: LichessPuzzleRaw[] };
    const puzzles = json.puzzles.map(p => parsePuzzle(p));
    return NextResponse.json({ puzzles });
  } finally {
    busy = false;
  }
}
