export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url') ?? '';

  if (!url.startsWith('https://api.chess.com/pub/')) {
    return Response.json({ error: 'forbidden url' }, { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: { 'User-Agent': 'chess1200/1.0 (personal training tool)' },
  });

  if (!upstream.ok) {
    return Response.json({ error: `upstream ${upstream.status}` }, { status: upstream.status });
  }

  const data = await upstream.json();
  return Response.json(data);
}
