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
  byWeekday: WDL[]; // index 0 = Sunday … 6 = Saturday
  byOppStrength: Record<'weaker' | 'even' | 'stronger', WDL>; // relative to my rating ±50
  avgMoves: number;
  longestGame: Game | null;
  shortestWin: Game | null;
  currentRating: number | null; // most recent rating_me
  minRating: number | null;
  maxRating: number | null;
  ratingChange30d: number | null;
  avgAccuracy: number | null;
  bestAccuracyWin: Game | null;
  worstAccuracyLoss: Game | null;
  longestWinStreak: number;
  longestLossStreak: number;
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
    byWeekday: Array.from({ length: 7 }, emptyWDL),
    byOppStrength: { weaker: emptyWDL(), even: emptyWDL(), stronger: emptyWDL() },
    avgMoves: 0,
    longestGame: null,
    shortestWin: null,
    currentRating: null,
    minRating: null,
    maxRating: null,
    ratingChange30d: null,
    avgAccuracy: null,
    bestAccuracyWin: null,
    worstAccuracyLoss: null,
    longestWinStreak: 0,
    longestLossStreak: 0,
  };

  if (games.length === 0) return stats;

  const ecoMap = new Map<string, { count: number; wins: number }>();
  let totalMoves = 0;
  let maxMoves = 0;
  let shortestWinMoves = Infinity;

  let accuracySum = 0;
  let accuracyCount = 0;
  let bestAccWin = -Infinity;
  let worstAccLoss = Infinity;

  // For rating trend: games assumed sorted desc by played_at
  const now = Date.now();
  const d30 = 30 * 24 * 3600 * 1000;
  let rating30dAgo: number | null = null;

  // Streaks: iterate in chronological order (reverse the array)
  const chrono = [...games].sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
  for (const g of chrono) {
    if (g.result === 'win') { curWin++; curLoss = 0; if (curWin > maxWin) maxWin = curWin; }
    else if (g.result === 'loss') { curLoss++; curWin = 0; if (curLoss > maxLoss) maxLoss = curLoss; }
    else { curWin = 0; curLoss = 0; }
  }
  stats.longestWinStreak = maxWin;
  stats.longestLossStreak = maxLoss;

  for (const g of games) {
    const bucket = g.color === 'white' ? stats.white : stats.black;
    bucket[g.result]++;

    if (!stats.byTimeClass[g.time_class]) stats.byTimeClass[g.time_class] = emptyWDL();
    stats.byTimeClass[g.time_class][g.result]++;

    const eco = g.eco_name || '—';
    const ex = ecoMap.get(eco) ?? { count: 0, wins: 0 };
    ecoMap.set(eco, { count: ex.count + 1, wins: ex.wins + (g.result === 'win' ? 1 : 0) });

    const d = new Date(g.played_at);
    stats.byHour[d.getHours()]++;
    stats.byWeekday[d.getDay()][g.result]++;

    totalMoves += g.moves_count;
    if (g.moves_count > maxMoves) { maxMoves = g.moves_count; stats.longestGame = g; }
    if (g.result === 'win' && g.moves_count > 0 && g.moves_count < shortestWinMoves) {
      shortestWinMoves = g.moves_count;
      stats.shortestWin = g;
    }

    if (g.rating_me != null) {
      if (stats.currentRating == null) stats.currentRating = g.rating_me; // most recent
      if (stats.minRating == null || g.rating_me < stats.minRating) stats.minRating = g.rating_me;
      if (stats.maxRating == null || g.rating_me > stats.maxRating) stats.maxRating = g.rating_me;
      const ageMs = now - d.getTime();
      if (rating30dAgo == null && ageMs >= d30) rating30dAgo = g.rating_me;
    }

    if (g.rating_me != null && g.rating_opp != null) {
      const diff = g.rating_opp - g.rating_me;
      const bracket = diff > 50 ? 'stronger' : diff < -50 ? 'weaker' : 'even';
      stats.byOppStrength[bracket][g.result]++;
    }

    const myAcc = g.color === 'white' ? g.accuracy_white : g.accuracy_black;
    if (myAcc != null && myAcc > 0) {
      accuracySum += myAcc;
      accuracyCount++;
      if (g.result === 'win' && myAcc > bestAccWin) { bestAccWin = myAcc; stats.bestAccuracyWin = g; }
      if (g.result === 'loss' && myAcc < worstAccLoss) { worstAccLoss = myAcc; stats.worstAccuracyLoss = g; }
    }
  }

  stats.topOpenings = [...ecoMap.entries()]
    .map(([eco, v]) => ({ eco, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  stats.avgMoves = Math.round(totalMoves / games.length);
  stats.avgAccuracy = accuracyCount > 0 ? Math.round((accuracySum / accuracyCount) * 10) / 10 : null;
  if (stats.currentRating != null && rating30dAgo != null) {
    stats.ratingChange30d = stats.currentRating - rating30dAgo;
  }

  return stats;
}
