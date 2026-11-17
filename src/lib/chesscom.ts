// Chess.com public API helpers. All fetching goes through /api/chesscom to avoid CORS.

export interface ChessComPlayer {
  username: string;
  rating: number;
  result: string;
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_class: string;
  end_time: number; // unix seconds
  rated: boolean;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

export interface SyncState {
  id: number;
  username: string;
  last_synced_at: string | null;
  synced_archives: string[];
}

export interface Game {
  id: string;
  source: string;
  url: string;
  pgn: string;
  color: 'white' | 'black';
  result: 'win' | 'draw' | 'loss';
  time_class: string;
  rating_me: number | null;
  rating_opp: number | null;
  opp_name: string;
  eco_name: string;
  played_at: string;
  moves_count: number;
  accuracy_white: number | null;
  accuracy_black: number | null;
  analysis_version: number | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function chesscomFetch<T>(url: string): Promise<T> {
  const res = await fetch(`/api/chesscom?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`chess.com error ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchArchives(username: string): Promise<string[]> {
  const data = await chesscomFetch<{ archives: string[] }>(
    `https://api.chess.com/pub/player/${username}/games/archives`
  );
  return data.archives ?? [];
}

export async function fetchMonthGames(archiveUrl: string): Promise<ChessComGame[]> {
  const data = await chesscomFetch<{ games: ChessComGame[] }>(archiveUrl);
  return data.games ?? [];
}

// ── PGN helpers ───────────────────────────────────────────────────────────────

export function extractEcoName(pgn: string): string {
  const opening = /^\[Opening "([^"]+)"\]/m.exec(pgn);
  if (opening) return opening[1];
  const ecoUrl = /^\[ECOUrl "https:\/\/www\.chess\.com\/openings\/([^"]+)"\]/m.exec(pgn);
  if (ecoUrl) return ecoUrl[1].replace(/-/g, ' ');
  const eco = /^\[ECO "([^"]+)"\]/m.exec(pgn);
  return eco ? eco[1] : '';
}

export function countMoves(pgn: string): number {
  // Strip headers, then count SAN tokens
  const moveText = pgn.replace(/\[[^\]]+\]/g, '').replace(/\{[^}]*\}/g, '').trim();
  const tokens = moveText.match(
    /(?:O-O-O[+#]?|O-O[+#]?|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)/g
  );
  return tokens ? tokens.filter(t => t.length > 0).length : 0;
}

type ChessComResult = string;

export function mapResult(r: ChessComResult): 'win' | 'draw' | 'loss' {
  if (r === 'win') return 'win';
  if (['stalemate', 'insufficient', 'agreed', 'repetition', '50move', 'timevsinsufficient'].includes(r))
    return 'draw';
  return 'loss';
}

export interface ParsedGame {
  url: string;
  pgn: string;
  color: 'white' | 'black';
  result: 'win' | 'draw' | 'loss';
  time_class: string;
  rating_me: number | null;
  rating_opp: number | null;
  opp_name: string;
  eco_name: string;
  played_at: string;
  moves_count: number;
}

export function parseGame(g: ChessComGame, username: string): ParsedGame | null {
  try {
    const myName = username.toLowerCase();
    const isWhite = g.white.username.toLowerCase() === myName;
    const me = isWhite ? g.white : g.black;
    const opp = isWhite ? g.black : g.white;

    return {
      url: g.url,
      pgn: g.pgn,
      color: isWhite ? 'white' : 'black',
      result: mapResult(me.result),
      time_class: g.time_class,
      rating_me: me.rating ?? null,
      rating_opp: opp.rating ?? null,
      opp_name: opp.username,
      eco_name: extractEcoName(g.pgn),
      played_at: new Date(g.end_time * 1000).toISOString(),
      moves_count: countMoves(g.pgn),
    };
  } catch {
    return null;
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface WDL { win: number; draw: number; loss: number }

export interface GameStats {
  total: number;
  white: WDL;
  black: WDL;
  byTimeClass: Record<string, WDL>;
  topOpenings: Array<{ eco: string; count: number; wins: number }>;
  byHour: number[];
}

function emptyWDL(): WDL { return { win: 0, draw: 0, loss: 0 }; }

export function computeStats(games: Game[]): GameStats {
  const stats: GameStats = {
    total: games.length,
    white: emptyWDL(),
    black: emptyWDL(),
    byTimeClass: {},
    topOpenings: [],
    byHour: Array(24).fill(0),
  };

  const ecoMap = new Map<string, { count: number; wins: number }>();

  for (const g of games) {
    const bucket = g.color === 'white' ? stats.white : stats.black;
    bucket[g.result]++;

    if (!stats.byTimeClass[g.time_class]) stats.byTimeClass[g.time_class] = emptyWDL();
    stats.byTimeClass[g.time_class][g.result]++;

    const eco = g.eco_name || '—';
    const ex = ecoMap.get(eco) ?? { count: 0, wins: 0 };
    ecoMap.set(eco, { count: ex.count + 1, wins: ex.wins + (g.result === 'win' ? 1 : 0) });

    const hour = new Date(g.played_at).getHours();
    stats.byHour[hour]++;
  }

  stats.topOpenings = [...ecoMap.entries()]
    .map(([eco, v]) => ({ eco, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return stats;
}
