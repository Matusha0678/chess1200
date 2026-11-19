import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !SAFE_ID.test(id)) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  const token = process.env.LICHESS_TOKEN;
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 503 });

  let res: Response;
  try {
    res = await fetch(`https://explorer.lichess.org/masters/pgn/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
  if (res.status === 429) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  if (!res.ok) return NextResponse.json({ error: 'upstream_error' }, { status: 502 });

  const pgn = await res.text();
  return new NextResponse(pgn, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
