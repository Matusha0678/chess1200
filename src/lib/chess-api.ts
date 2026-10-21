export async function fetchPlayerStats(username: string) {
  const res = await fetch(`https://api.chess.com/pub/player/${username}/stats`, {
    headers: { 'User-Agent': 'Chess1200App/1.0' },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchMonthlyGames(username: string, year: number, month: number) {
  const mm = String(month).padStart(2, '0');
  const res = await fetch(`https://api.chess.com/pub/player/${username}/games/${year}/${mm}`, {
    headers: { 'User-Agent': 'Chess1200App/1.0' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.games ?? [];
}

export function classifyTimeControl(tc: string): 'rapid' | 'blitz' | 'bullet' | 'other' {
  const base = parseInt(tc.split('+')[0]);
  if (base >= 600) return 'rapid';
  if (base >= 180) return 'blitz';
  if (base > 0) return 'bullet';
  return 'other';
}

export function findCastlingMove(pgn: string): number | null {
  // Remove PGN header tags (lines starting with [)
  const movesSection = pgn.split('\n').filter(line => !line.trim().startsWith('[')).join(' ').trim();
  const tokens = movesSection.split(/\s+/);
  let moveNum = 0;
  for (const token of tokens) {
    if (/^\d+\.$/.test(token)) {
      moveNum = parseInt(token);
    } else if (token === 'O-O' || token === 'O-O-O') {
      return moveNum;
    }
  }
  return null;
}
