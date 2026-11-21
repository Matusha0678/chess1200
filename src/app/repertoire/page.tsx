'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Board } from '@/components/board/Board';
import type { BoardArrow } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import {
  buildIndex, checkGameFull, repHash as computeRepHash, parsePgnMoves, posKey, fenAfterUci,
} from '@/lib/repertoire';
import type { RepStatus, Opening, OpeningLine, CheckResult } from '@/lib/repertoire';
import {
  DEMO_OPENINGS, DEMO_LINES, DEMO_GAMES, DEMO_ANALYSIS, DEMO_LICHESS,
} from '@/lib/demo-positions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  pgn: string;
  color: 'white' | 'black';
  result: 'win' | 'draw' | 'loss';
  opp_name: string;
  played_at: string;
}

interface GameOpening {
  game_id: string;
  status: RepStatus;
  ply: number | null;
  move_number: number | null;
  color: 'w' | 'b' | null;
  fen_before: string | null;
  played: string | null;
  played_uci: string | null;
  prev_uci: string | null;
  expected: string[] | null;
  expected_uci: string[] | null;
  opening_id: string | null;
  line_ids: string[] | null;
  book_plies: number;
  first: boolean;
  cls: string | null;
  loss: number | null;
  rep_hash: string;
}

interface DevGroup {
  key: string;
  fenBefore: string;
  played: string;
  playedUci: string;
  prevUci: string | null;
  expected: string[];
  expectedUci: string[];
  openingId: string | null;
  openingName: string;
  moveNumber: number;
  color: 'w' | 'b';
  times: number;
  losses: number;
  wins: number;
  draws: number;
  maxCls: string | null;
  maxLoss: number;
  gameIds: string[];
  dates: string[];
  lineIds: string[];
}

interface HoleGroup {
  key: string;
  fenBefore: string;
  played: string;
  playedUci: string;
  openingId: string | null;
  openingName: string;
  moveNumber: number;
  color: 'w' | 'b';
  times: number;
  losses: number;
  wins: number;
  draws: number;
  gameIds: string[];
  dates: string[];
  first: boolean;
  prevMove: string | null;
}

interface LichessMove { san: string; uci: string; share: number; score: number; }
interface LichessData { total: number; moves: LichessMove[]; loading?: boolean; error?: string; }

type SelItem =
  | { type: 'dev'; key: string }
  | { type: 'hole'; key: string }
  | { type: 'noline'; key: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}

function clsLabel(cls: string | null, loss: number | null): string {
  if (cls === null || loss === null) return '';
  if (loss >= 0.20) return `зевок (−${Math.round(loss * 100)}%)`;
  if (loss >= 0.10) return `ошибка (−${Math.round(loss * 100)}%)`;
  if (loss >= 0.05) return `неточность (−${Math.round(loss * 100)}%)`;
  return 'ход нормальный';
}

function clsBadge(cls: string | null, loss: number | null): { bg: string; text: string } {
  if (loss === null || loss === undefined) return { bg: 'var(--accent-press)', text: '✓' };
  if (loss >= 0.20) return { bg: 'var(--c-bad)', text: '??' };
  if (loss >= 0.10) return { bg: '#E07050', text: '?' };
  if (loss >= 0.05) return { bg: '#F4B45C', text: '?!' };
  return { bg: 'var(--accent-press)', text: '✓' };
}

function resultLabel(result: 'win' | 'draw' | 'loss'): string {
  return result === 'win' ? 'победа' : result === 'draw' ? 'ничья' : 'поражение';
}
function resultColor(result: 'win' | 'draw' | 'loss'): string {
  return result === 'win' ? 'var(--accent)' : result === 'draw' ? 'var(--muted)' : '#F08277';
}

function moveLabel(mn: number, color: 'w' | 'b', san: string): string {
  return color === 'b' ? `${mn}...${san}` : `${mn}. ${san}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

function groupDeviations(
  gameOpenings: GameOpening[],
  games: GameRow[],
  openingMap: Map<string, string>,
): DevGroup[] {
  const byKey = new Map<string, DevGroup>();
  const gameById = new Map(games.map(g => [g.id, g]));

  for (const go of gameOpenings) {
    if (go.status !== 'deviation') continue;
    if (!go.fen_before || !go.played || !go.played_uci) continue;
    const key = `${go.fen_before}|${go.played}`;
    const game = gameById.get(go.game_id);
    if (!game) continue;

    if (!byKey.has(key)) {
      byKey.set(key, {
        key, fenBefore: go.fen_before, played: go.played, playedUci: go.played_uci,
        prevUci: go.prev_uci, expected: go.expected ?? [], expectedUci: go.expected_uci ?? [],
        openingId: go.opening_id, openingName: go.opening_id ? (openingMap.get(go.opening_id) ?? '—') : '—',
        moveNumber: go.move_number ?? 1, color: go.color ?? 'w',
        times: 0, losses: 0, wins: 0, draws: 0, maxCls: null, maxLoss: 0,
        gameIds: [], dates: [], lineIds: go.line_ids ?? [],
      });
    }
    const grp = byKey.get(key)!;
    grp.times++;
    if (game.result === 'loss') grp.losses++;
    else if (game.result === 'win') grp.wins++;
    else grp.draws++;
    grp.gameIds.push(go.game_id);
    grp.dates.push(game.played_at);
    if (go.loss !== null && go.loss > grp.maxLoss) {
      grp.maxLoss = go.loss;
      grp.maxCls = go.cls;
    }
  }

  const groups = [...byKey.values()];
  groups.sort((a, b) =>
    b.times - a.times || b.losses - a.losses || (b.dates[0] > a.dates[0] ? 1 : -1)
  );
  return groups;
}

function groupHoles(
  gameOpenings: GameOpening[],
  games: GameRow[],
  openingMap: Map<string, string>,
): HoleGroup[] {
  const byKey = new Map<string, HoleGroup>();
  const gameById = new Map(games.map(g => [g.id, g]));

  for (const go of gameOpenings) {
    if (go.status !== 'hole') continue;
    if (!go.fen_before || !go.played || !go.played_uci) continue;
    const key = `${go.fen_before}|${go.played}`;
    const game = gameById.get(go.game_id);
    if (!game) continue;

    if (!byKey.has(key)) {
      let prevMove: string | null = null;
      if (go.prev_uci) {
        try {
          const to = go.prev_uci.slice(2, 4) as Square;
          const ch = new Chess(go.fen_before);
          const piece = ch.get(to);
          const pieceSan = piece ? (piece.type === 'p' ? '' : piece.type.toUpperCase()) : '';
          const san = `${pieceSan}${to}`;
          // prevUci color is opposite of hole color; prevMoveNum:
          // hole by white (color='w') on move N → prevUci is black's N-1 move
          // hole by black (color='b') on move N → prevUci is white's N move
          const prevColor: 'w' | 'b' = go.color === 'w' ? 'b' : 'w';
          const prevMoveNum = go.color === 'w' ? (go.move_number ?? 1) - 1 : (go.move_number ?? 1);
          prevMove = prevColor === 'b' ? `${prevMoveNum}...${san}` : `${prevMoveNum}. ${san}`;
        } catch { /* noop */ }
      }

      byKey.set(key, {
        key, fenBefore: go.fen_before, played: go.played, playedUci: go.played_uci,
        openingId: go.opening_id, openingName: go.opening_id ? (openingMap.get(go.opening_id) ?? '—') : '—',
        moveNumber: go.move_number ?? 1, color: go.color ?? 'w',
        times: 0, losses: 0, wins: 0, draws: 0, gameIds: [], dates: [],
        first: go.first ?? false, prevMove,
      });
    }
    const grp = byKey.get(key)!;
    grp.times++;
    if (game.result === 'loss') grp.losses++;
    else if (game.result === 'win') grp.wins++;
    else grp.draws++;
    grp.gameIds.push(go.game_id);
    grp.dates.push(game.played_at);
  }

  return [...byKey.values()].sort((a, b) => b.times - a.times || (b.dates[0] > a.dates[0] ? 1 : -1));
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconBookCheck({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <polyline points="9 11 11 13 15 9"/>
    </svg>
  );
}
function IconBookX({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
    </svg>
  );
}
function IconRepeat({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}
function IconLayoutGrid({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}
function IconLightbulb({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#F4B45C', flexShrink: 0, marginTop: 1 }}>
      <path d="M9 18h6"/><path d="M10 22h4"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
  );
}
function IconPlus({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function IconExternalLink({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}
function IconGitBranch({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <path d="M18 9a9 9 0 0 1-9 9"/>
    </svg>
  );
}
function IconCircleAlert({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

// ── Shared UI components (defined outside component to satisfy react-hooks/static-components) ────

interface PlayerBarProps {
  label: string;
  bottom?: boolean;
  boardOrientation: 'white' | 'black';
  openingLabel?: string;
}

function PlayerBar({ label, bottom, boardOrientation, openingLabel }: PlayerBarProps) {
  const parts = label.split(' · ');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 18 }}>{bottom ? (boardOrientation === 'white' ? '♙' : '♟') : (boardOrientation === 'white' ? '♟' : '♙')}</span>
      </div>
      <span>{parts[0]}</span>
      {parts[1] && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>· {parts[1]}</span>}
      {bottom && openingLabel && (
        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 'auto' }}>{openingLabel}</span>
      )}
    </div>
  );
}

// ── Main page component (wrapped in Suspense) ─────────────────────────────────

function RepertoirePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isDemo = searchParams.get('demo') === '1';

  const { S } = useTrainerGeometry();

  // ── State ──────────────────────────────────────────────────────────────────

  const [openings, setOpenings] = useState<Opening[]>([]);
  const [lines, setLines] = useState<OpeningLine[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [gameOpenings, setGameOpenings] = useState<GameOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkDone, setCheckDone] = useState(0);
  const [checkTotal, setCheckTotal] = useState(0);

  const [colorFilter, setColorFilter] = useState<'white' | 'black' | 'all'>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rep-filters') || 'null');
      if (saved?.color) return saved.color as 'white' | 'black' | 'all';
    } catch { /* ignore */ }
    return 'all';
  });
  const [periodFilter, setPeriodFilter] = useState<'30d' | 'all'>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rep-filters') || 'null');
      if (saved?.period) return saved.period as '30d' | 'all';
    } catch { /* ignore */ }
    return 'all';
  });
  const [selOpeningId, setSelOpeningId] = useState<string | null>(null);

  const [selected, setSelected] = useState<SelItem | null>(null);
  const [lichessCache, setLichessCache] = useState<Map<string, LichessData>>(new Map());
  const lichessFetching = useRef<Set<string>>(new Set());
  const [selLichessMove, setSelLichessMove] = useState<LichessMove | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveFilters = useCallback((color: typeof colorFilter, period: typeof periodFilter) => {
    try { localStorage.setItem('rep-filters', JSON.stringify({ color, period })); } catch { /* ignore */ }
  }, []);

  // ── Toast helper ───────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (isDemo) {
      setOpenings(DEMO_OPENINGS as unknown as Opening[]);
      setLines(DEMO_LINES as unknown as OpeningLine[]);
      const dg: GameRow[] = DEMO_GAMES.map(g => ({
        id: g.id, pgn: '', color: g.color === 'w' ? 'white' : 'black',
        result: g.result, opp_name: g.opp, played_at: g.date + 'T12:00:00Z',
      }));
      setGames(dg);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: ops }, { data: lns }, { data: gms }, { data: gos }] = await Promise.all([
        supabase.from('openings').select('id, name, color').order('name'),
        supabase.from('opening_lines').select('id, opening_id, moves'),
        supabase.from('games').select('id, pgn, color, result, opp_name, played_at').order('played_at', { ascending: false }),
        supabase.from('game_openings').select('*'),
      ]);
      setOpenings((ops ?? []) as Opening[]);
      setLines((lns ?? []) as OpeningLine[]);
      setGames((gms ?? []) as GameRow[]);
      setGameOpenings((gos ?? []) as GameOpening[]);
    } catch {
      // network error — show empty state
    }
    setLoading(false);
  }, [isDemo]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadData is an async fetch that sets state after await
  useEffect(() => { loadData(); }, [loadData]);

  // ── Build demo game_openings ───────────────────────────────────────────────

  useEffect(() => {
    if (!isDemo || openings.length === 0 || lines.length === 0 || games.length === 0) return;

    const idxW = buildIndex(openings, lines, 'w');
    const idxB = buildIndex(openings, lines, 'b');
    const hash = computeRepHash(openings, lines);

    const gos: GameOpening[] = DEMO_GAMES.map(dg => {
      const C = dg.color;
      const idx = C === 'w' ? idxW : idxB;
      const r: CheckResult = checkGameFull(dg.moves.split(' '), C, idx);
      const analysis = DEMO_ANALYSIS[dg.id as keyof typeof DEMO_ANALYSIS];
      return {
        game_id: dg.id,
        status: r.status,
        ply: r.ply,
        move_number: r.moveNumber,
        color: r.color,
        fen_before: r.fenBefore,
        played: r.played,
        played_uci: r.playedUci,
        prev_uci: r.prevUci,
        expected: r.expected,
        expected_uci: r.expectedUci,
        opening_id: r.openingId,
        line_ids: r.lineIds,
        book_plies: r.bookPlies,
        first: r.first,
        cls: (r.status === 'deviation' && analysis) ? analysis.cls : null,
        loss: (r.status === 'deviation' && analysis) ? analysis.loss : null,
        rep_hash: hash,
      };
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- demo data is computed synchronously from props
    setGameOpenings(gos);
  }, [isDemo, openings, lines, games]);

  // ── Check unchecked/outdated games ─────────────────────────────────────────

  useEffect(() => {
    if (isDemo || loading || openings.length === 0 || lines.length === 0) return;
    if (games.length === 0) return;

    const hash = computeRepHash(openings, lines);
    const checkedMap = new Map(gameOpenings.map(go => [go.game_id, go.rep_hash]));
    const toCheck = games.filter(g => checkedMap.get(g.id) !== hash);
    if (toCheck.length === 0) return;

    const idxW = buildIndex(openings, lines, 'w');
    const idxB = buildIndex(openings, lines, 'b');

    // eslint-disable-next-line react-hooks/set-state-in-effect -- initializing progress UI state before async batch
    setChecking(true);
    setCheckTotal(toCheck.length);
    setCheckDone(0);

    let done = 0;
    const BATCH = 50;

    async function processBatch(batch: GameRow[]) {
      const results: GameOpening[] = [];
      for (const g of batch) {
        const C = g.color === 'white' ? 'w' : 'b';
        const moves = parsePgnMoves(g.pgn);
        const r = checkGameFull(moves, C, C === 'w' ? idxW : idxB);
        results.push({
          game_id: g.id,
          status: r.status, ply: r.ply, move_number: r.moveNumber, color: r.color,
          fen_before: r.fenBefore, played: r.played, played_uci: r.playedUci, prev_uci: r.prevUci,
          expected: r.expected, expected_uci: r.expectedUci,
          opening_id: r.openingId, line_ids: r.lineIds, book_plies: r.bookPlies, first: r.first,
          cls: null, loss: null, rep_hash: hash,
        });
      }

      // Load analysis for deviation games
      const devIds = results.filter(r => r.status === 'deviation').map(r => r.game_id);
      if (devIds.length > 0) {
        const { data: analyses } = await supabase
          .from('game_analysis')
          .select('game_id, move_number, color, classification, loss')
          .in('game_id', devIds);

        if (analyses) {
          const analysisMap = new Map<string, { cls: string | null; loss: number | null }>();
          for (const a of analyses) {
            const go = results.find(r => r.game_id === a.game_id);
            if (!go || go.status !== 'deviation') continue;
            if (go.move_number === a.move_number && go.color === a.color) {
              const existing = analysisMap.get(a.game_id);
              const newLoss = a.loss ?? 0;
              if (!existing || newLoss > (existing.loss ?? 0)) {
                analysisMap.set(a.game_id, { cls: a.classification ?? null, loss: a.loss ?? null });
              }
            }
          }
          for (const r of results) {
            const a = analysisMap.get(r.game_id);
            if (a) { r.cls = a.cls; r.loss = a.loss; }
          }
        }
      }

      // Upsert in batches of 100
      for (let i = 0; i < results.length; i += 100) {
        const { error } = await supabase.from('game_openings').upsert(
          results.slice(i, i + 100).map(r => ({
            ...r,
            line_ids: r.line_ids ? r.line_ids.map(id => id) : null,
          })),
          { onConflict: 'game_id' }
        );
        if (error) {
          setDbError(`Ошибка базы: ${error.message}. Выполни SQL 30 (supabase/RUN-ORDER.md)`);
          setChecking(false);
          return;
        }
      }

      setGameOpenings(prev => {
        const updated = [...prev];
        for (const r of results) {
          const idx = updated.findIndex(g => g.game_id === r.game_id);
          if (idx >= 0) updated[idx] = r;
          else updated.push(r);
        }
        return updated;
      });
    }

    async function run() {
      for (let i = 0; i < toCheck.length; i += BATCH) {
        const batch = toCheck.slice(i, i + BATCH);
        await processBatch(batch);
        done += batch.length;
        setCheckDone(done);
        await new Promise(r => setTimeout(r, 0));
      }
      setChecking(false);
    }

    run();
  }, [isDemo, loading, openings, lines, games, gameOpenings]);

  // ── Computed data ──────────────────────────────────────────────────────────

  const openingMap = new Map(openings.map(o => [o.id, o.name]));

  // Filter game_openings
  // eslint-disable-next-line react-hooks/purity -- Date.now() is intentional for a 30-day cutoff filter
  const cutoff = periodFilter === '30d' ? new Date(Date.now() - 30 * 86400_000).toISOString() : null;
  const gameById = new Map(games.map(g => [g.id, g]));

  const filteredGOs = gameOpenings.filter(go => {
    const game = gameById.get(go.game_id);
    if (!game) return false;
    if (colorFilter !== 'all' && game.color !== colorFilter) return false;
    if (cutoff && game.played_at < cutoff) return false;
    if (selOpeningId && go.opening_id !== selOpeningId) return false;
    return true;
  });

  const devGroups = groupDeviations(filteredGOs, games, openingMap);
  const holeGroups = groupHoles(filteredGOs, games, openingMap);
  const holeNormal = holeGroups.filter(h => !h.first);
  const nolineGroups = holeGroups.filter(h => h.first);

  // Stats
  const inLineCt = filteredGOs.filter(g => g.status === 'in_line').length;
  const devCt = filteredGOs.filter(g => g.status === 'deviation').length;
  const holeCt = filteredGOs.filter(g => g.status === 'hole').length;
  const totalCt = filteredGOs.filter(g => ['in_line','deviation','hole'].includes(g.status)).length;

  // Opening list for sidebar
  const openingStats = new Map<string, { inLine: number; total: number }>();
  for (const go of filteredGOs) {
    if (!['in_line','deviation','hole'].includes(go.status)) continue;
    if (!go.opening_id) continue;
    if (go.first) continue; // first-move "no lines against" holes don't count in opening stats
    const s = openingStats.get(go.opening_id) ?? { inLine: 0, total: 0 };
    s.total++;
    if (go.status === 'in_line') s.inLine++;
    openingStats.set(go.opening_id, s);
  }

  // Insight text
  function buildInsight(): string {
    if (devGroups.length === 0 && holeGroups.length === 0) return '';
    if (devGroups.length > 0) {
      const g = devGroups[0];
      const lossText = g.losses === 2 ? ' — обе партии проиграны'
        : g.losses > 0 ? ` — проиграно ${g.losses}` : '';
      const razes = plural(g.times, 'раз', 'раза', 'раз');
      const oTotal = filteredGOs.filter(go => go.opening_id === g.openingId && ['in_line','deviation','hole'].includes(go.status)).length;
      return `в «${g.openingName}» ты ${razes} из ${oTotal} сыграл ${moveLabel(g.moveNumber, g.color, g.played)} вместо ${g.expected[0] ?? '—'}${lossText}`;
    }
    const h = holeGroups[0];
    const razes = plural(h.times, 'раз', 'раза', 'раз');
    return `в «${h.openingName}» соперники ${razes} играли ${moveLabel(h.moveNumber, h.color, h.played)} — у тебя нет ответа`;
  }

  // ── Auto-select on load / when groups change ───────────────────────────────

  useEffect(() => {
    if (devGroups.length > 0 && selected === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-selecting first item when groups load
      setSelected({ type: 'dev', key: devGroups[0].key });
    } else if (devGroups.length === 0 && holeNormal.length > 0 && selected === null) {
       
      setSelected({ type: 'hole', key: holeNormal[0].key });
    } else if (devGroups.length === 0 && holeNormal.length === 0 && nolineGroups.length > 0 && selected === null) {
       
      setSelected({ type: 'noline', key: nolineGroups[0].key });
    }
  }, [devGroups.length, holeNormal.length, nolineGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selected group data ────────────────────────────────────────────────────

  const selDevGroup = selected?.type === 'dev' ? devGroups.find(g => g.key === selected.key) ?? null : null;
  const selHoleGroup = selected?.type === 'hole' ? holeNormal.find(g => g.key === selected.key) ?? null : null;
  const selNolineGroup = selected?.type === 'noline' ? nolineGroups.find(g => g.key === selected.key) ?? null : null;

  // ── Board data ─────────────────────────────────────────────────────────────

  let boardFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let boardOrientation: 'white' | 'black' = 'white';
  let boardLastMove: { from: Square; to: Square } | null = null;
  const boardArrows: BoardArrow[] = [];
  let posNote = '';
  let openingLabel = '';
  let playerTopLabel = '';
  let playerBottomLabel = '';

  if (selDevGroup) {
    boardFen = selDevGroup.fenBefore;
    boardOrientation = selDevGroup.color === 'w' ? 'white' : 'black';
    if (selDevGroup.prevUci) {
      boardLastMove = { from: selDevGroup.prevUci.slice(0, 2) as Square, to: selDevGroup.prevUci.slice(2, 4) as Square };
    }
    if (selDevGroup.playedUci) {
      boardArrows.push({ from: selDevGroup.playedUci.slice(0, 2) as Square, to: selDevGroup.playedUci.slice(2, 4) as Square, color: 'var(--c-bad)', style: 'solid', role: 'played', opacity: 0.85 });
    }
    if (selDevGroup.expectedUci[0]) {
      boardArrows.push({ from: selDevGroup.expectedUci[0].slice(0, 2) as Square, to: selDevGroup.expectedUci[0].slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best', opacity: 0.95 });
    }
    if (selDevGroup.expectedUci[1]) {
      boardArrows.push({ from: selDevGroup.expectedUci[1].slice(0, 2) as Square, to: selDevGroup.expectedUci[1].slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best', opacity: 0.55 });
    }
    const opp = selDevGroup.color === 'w' ? 'Чёрные' : 'Белые';
    const me = selDevGroup.color === 'w' ? 'Белые' : 'Чёрные';
    // posNote: "после {ход соперника} · ход {белых/чёрных}"
    if (selDevGroup.prevUci && selDevGroup.fenBefore) {
      const prevFen = (() => {
        // We know prev UCI but need prev SAN; compute from the game
        // Best approach: label by move before fenBefore
        try {
          // The prevUci itself encodes from→to, e.g. f8c5
          const to = selDevGroup.prevUci.slice(2, 4);
          // move number for the previous half-move
          // my color='w' deviating on N → prevUci is black's N-1; my color='b' on N → prevUci is white's N
          const prevMn = selDevGroup.color === 'w' ? selDevGroup.moveNumber - 1 : selDevGroup.moveNumber;
          const prevC: 'w' | 'b' = selDevGroup.color === 'w' ? 'b' : 'w';
          // We need SAN of prev move from a FEN before it — approximate with piece on 'to' in fenBefore
          const ch = new Chess(selDevGroup.fenBefore);
          const piece = ch.get(to as Square);
          // Reconstruct approximate SAN: piece type + destination
          const pieceSan = piece ? (piece.type === 'p' ? '' : piece.type.toUpperCase()) : '';
          const san = `${pieceSan}${to}`;
          posNote = `после ${prevC === 'b' ? `${prevMn}...${san}` : `${prevMn}. ${san}`} · ход ${me === 'Белые' ? 'белых' : 'чёрных'}`;
        } catch { posNote = `ход ${me === 'Белые' ? 'белых' : 'чёрных'}`; }
      })();
      void prevFen;
    } else {
      posNote = `ход ${me === 'Белые' ? 'белых' : 'чёрных'}`;
    }
    playerTopLabel = `${opp} · соперник`;
    playerBottomLabel = `${me} · ты`;
    openingLabel = selDevGroup.openingName;
  } else if (selHoleGroup) {
    const fenAfter = fenAfterUci(selHoleGroup.fenBefore, selHoleGroup.playedUci);
    boardFen = fenAfter ?? selHoleGroup.fenBefore;
    boardOrientation = selHoleGroup.color === 'w' ? 'black' : 'white'; // my color is OPPOSITE of opp's move
    boardLastMove = { from: selHoleGroup.playedUci.slice(0, 2) as Square, to: selHoleGroup.playedUci.slice(2, 4) as Square };
    openingLabel = selHoleGroup.openingName;

    // Add Lichess arrows
    const pKey = boardFen ? posKey(boardFen) : null;
    if (pKey) {
      const lData = (isDemo ? (DEMO_LICHESS[pKey as keyof typeof DEMO_LICHESS] ?? null) : (lichessCache.get(pKey) ?? null)) as LichessData | null;
      if (lData && lData.moves) {
        const mv0 = lData.moves[0];
        const mv1 = lData.moves[1];
        if (mv0?.uci) boardArrows.push({ from: mv0.uci.slice(0, 2) as Square, to: mv0.uci.slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best', opacity: 0.95, label: '1' });
        if (mv1?.uci) boardArrows.push({ from: mv1.uci.slice(0, 2) as Square, to: mv1.uci.slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best', opacity: 0.55, label: '2' });
      }
    }

    const opp = selHoleGroup.color === 'w' ? 'Белые' : 'Чёрные';
    const me = selHoleGroup.color === 'w' ? 'Чёрные' : 'Белые';
    playerTopLabel = `${opp} · соперник`;
    playerBottomLabel = `${me} · ты`;
    posNote = `после ${moveLabel(selHoleGroup.moveNumber, selHoleGroup.color, selHoleGroup.played)} · ход ${me === 'Белые' ? 'белых' : 'чёрных'}`;
  } else if (selNolineGroup) {
    const fenAfter = fenAfterUci(selNolineGroup.fenBefore, selNolineGroup.playedUci);
    boardFen = fenAfter ?? selNolineGroup.fenBefore;
    boardOrientation = selNolineGroup.color === 'b' ? 'white' : 'black';
    boardLastMove = { from: selNolineGroup.playedUci.slice(0, 2) as Square, to: selNolineGroup.playedUci.slice(2, 4) as Square };
    openingLabel = '';

    const pKey = boardFen ? posKey(boardFen) : null;
    if (pKey) {
      const lData = (isDemo ? (DEMO_LICHESS[pKey as keyof typeof DEMO_LICHESS] ?? null) : (lichessCache.get(pKey) ?? null)) as LichessData | null;
      if (lData && lData.moves) {
        const mv0 = lData.moves[0];
        const mv1 = lData.moves[1];
        if (mv0?.uci) boardArrows.push({ from: mv0.uci.slice(0, 2) as Square, to: mv0.uci.slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best', opacity: 0.95, label: '1' });
        if (mv1?.uci) boardArrows.push({ from: mv1.uci.slice(0, 2) as Square, to: mv1.uci.slice(2, 4) as Square, color: 'var(--accent)', style: 'dashed', role: 'best', opacity: 0.55, label: '2' });
      }
    }

    const opp = selNolineGroup.color === 'w' ? 'Белые' : 'Чёрные';
    const me = selNolineGroup.color === 'w' ? 'Чёрные' : 'Белые';
    playerTopLabel = `${opp} · соперник`;
    playerBottomLabel = `${me} · ты`;
    posNote = `после ${moveLabel(selNolineGroup.moveNumber, selNolineGroup.color, selNolineGroup.played)} · ход ${me === 'Белые' ? 'белых' : 'чёрных'}`;
  }

  // ── Lichess fetch ──────────────────────────────────────────────────────────

  const fetchLichess = useCallback(async (fen: string) => {
    const key = posKey(fen);
    if (lichessFetching.current.has(key) || lichessCache.has(key)) return;
    lichessFetching.current.add(key);
    setLichessCache(prev => new Map(prev).set(key, { total: 0, moves: [], loading: true }));

    try {
      const res = await fetch(`/api/lichess/explorer?fen=${encodeURIComponent(fen)}`);
      if (res.status === 503) {
        setLichessCache(prev => new Map(prev).set(key, { total: 0, moves: [], error: 'no_token' }));
      } else if (res.status === 429) {
        setLichessCache(prev => new Map(prev).set(key, { total: 0, moves: [], error: 'rate_limited' }));
      } else if (!res.ok) {
        setLichessCache(prev => new Map(prev).set(key, { total: 0, moves: [], error: 'error' }));
      } else {
        const data: LichessData = await res.json();
        setLichessCache(prev => new Map(prev).set(key, data));
      }
    } catch {
      setLichessCache(prev => new Map(prev).set(key, { total: 0, moves: [], error: 'error' }));
    } finally {
      lichessFetching.current.delete(key);
    }
  }, [lichessCache]);

  // Fetch Lichess data when hole/noline is selected
  useEffect(() => {
    if (isDemo) return;
    const fenForFetch = selHoleGroup
      ? fenAfterUci(selHoleGroup.fenBefore, selHoleGroup.playedUci)
      : selNolineGroup
        ? fenAfterUci(selNolineGroup.fenBefore, selNolineGroup.playedUci)
        : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchLichess sets loading state before async fetch
    if (fenForFetch) fetchLichess(fenForFetch);
  }, [selHoleGroup, selNolineGroup, isDemo, fetchLichess]);

  // Update selected Lichess move when hole changes or data arrives
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- updating derived selection state from Lichess cache
    if (!selHoleGroup && !selNolineGroup) { setSelLichessMove(null); return; }
    const afterFen = selHoleGroup
      ? fenAfterUci(selHoleGroup.fenBefore, selHoleGroup.playedUci)
      : selNolineGroup
        ? fenAfterUci(selNolineGroup.fenBefore, selNolineGroup.playedUci)
        : null;
    if (!afterFen) return;
    const key = posKey(afterFen);
    const lData = (isDemo ? (DEMO_LICHESS[key as keyof typeof DEMO_LICHESS] ?? null) : (lichessCache.get(key) ?? null)) as LichessData | null;
     
    if (lData?.moves?.[0]) setSelLichessMove(lData.moves[0]);
     
    else setSelLichessMove(null);
  }, [selHoleGroup, selNolineGroup, lichessCache, isDemo]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const allRows: SelItem[] = [
    ...devGroups.map(g => ({ type: 'dev' as const, key: g.key })),
    ...holeNormal.map(g => ({ type: 'hole' as const, key: g.key })),
    ...nolineGroups.map(g => ({ type: 'noline' as const, key: g.key })),
  ];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = selected ? allRows.findIndex(r => r.type === selected.type && r.key === selected.key) : -1;
        const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (next >= 0 && next < allRows.length) setSelected(allRows[next]);
      } else if (e.key === 'Enter') {
        // eslint-disable-next-line react-hooks/immutability -- handleMainAction is a function declaration and is hoisted
        handleMainAction();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });  

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleRepeatLine() {
    if (isDemo) { showToast('Демо: повторение линии не работает'); return; }
    if (!selDevGroup) return;
    const lineId = selDevGroup.lineIds[0];
    const openingId = selDevGroup.openingId;
    if (!lineId || !openingId) return;

    await supabase.from('line_progress').upsert(
      { line_id: lineId, next_review: new Date().toISOString() },
      { onConflict: 'line_id' }
    );
    router.push(`/openings/${openingId}?mode=review&line=${lineId}`);
  }

  async function handleAddToMistakes() {
    if (isDemo) { showToast('Демо: карточка не сохраняется'); return; }
    if (!selDevGroup) return;
    const lastGameId = selDevGroup.gameIds[selDevGroup.gameIds.length - 1];
    if (!lastGameId) return;

    const { data: existing } = await supabase
      .from('mistake_cards')
      .select('id')
      .eq('fen_before', selDevGroup.fenBefore)
      .eq('tag', 'deviation')
      .maybeSingle();
    if (existing) { showToast('Уже в тренажёре'); return; }

    const go = gameOpenings.find(g => g.game_id === lastGameId);
    const { error } = await supabase.from('mistake_cards').insert({
      game_id: lastGameId,
      fen_before: selDevGroup.fenBefore,
      my_move: selDevGroup.played,
      best_move: selDevGroup.expectedUci[0] ?? '',
      eval_before: null,
      eval_loss: go?.loss != null ? Math.round(go.loss * 100) : 100,
      phase: 'opening',
      tag: 'deviation',
    });
    if (error) showToast(`Ошибка: ${error.message}`);
    else showToast('Добавлено в тренажёр ошибок');
  }

  async function handleAddLine() {
    if (isDemo) { showToast('Демо: добавление линии не сохраняется'); return; }
    if (!selLichessMove) return;
    const holeGroup = selHoleGroup ?? selNolineGroup;
    if (!holeGroup) return;

    const openingId = holeGroup.openingId;
    if (!openingId) { showToast('Не определён дебют для добавления'); return; }

    // Find game with most moves to build the line
    const gameId = holeGroup.gameIds[0];
    const game = gameById.get(gameId ?? '');
    if (!game) return;

    const pgnMoves = parsePgnMoves(game.pgn);
    const holeGO = gameOpenings.find(g => g.game_id === gameId);
    if (!holeGO || holeGO.ply == null) return;

    // Collect moves from start to hole move (inclusive)
    const ch = new Chess();
    const lineMoves: Array<{ san: string; from: string; to: string; fen: string; color: 'w' | 'b' }> = [];
    for (let i = 0; i <= holeGO.ply; i++) {
      const r = ch.move(pgnMoves[i]);
      if (!r) break;
      lineMoves.push({ san: r.san, from: r.from, to: r.to, fen: ch.fen(), color: r.color as 'w' | 'b' });
    }

    // Add the selected Lichess response
    try {
      const r = ch.move({ from: selLichessMove.uci.slice(0, 2), to: selLichessMove.uci.slice(2, 4), promotion: selLichessMove.uci[4] || undefined });
      if (r) lineMoves.push({ san: r.san, from: r.from, to: r.to, fen: ch.fen(), color: r.color as 'w' | 'b' });
    } catch { showToast('Ход невалиден'); return; }

    // Get max line_index
    const { data: existing } = await supabase.from('opening_lines').select('line_index').eq('opening_id', openingId).order('line_index', { ascending: false }).limit(1).maybeSingle();
    const lineIndex = ((existing?.line_index as number) ?? -1) + 1;

    const { error: insErr } = await supabase.from('opening_lines').insert({
      opening_id: openingId, line_index: lineIndex, moves: lineMoves,
    });
    if (insErr) { showToast(`Ошибка: ${insErr.message}`); return; }

    // Best-effort: increment total_lines
    try {
      const { data: opRow } = await supabase.from('openings').select('total_lines').eq('id', openingId).single();
      await supabase.from('openings').update({ total_lines: ((opRow?.total_lines as number) ?? 0) + 1 }).eq('id', openingId);
    } catch { /* non-critical */ }
    showToast('Добавлено — линия появится в тренажёре дебютов');
    await loadData();
    setSelected(null);
  }

  async function handleRecheck() {
    if (isDemo) { showToast('Демо: перепроверка недоступна'); return; }
    const { error } = await supabase.from('game_openings').delete().neq('game_id', '00000000-0000-0000-0000-000000000000');
    if (error) { showToast(`Ошибка: ${error.message}`); return; }
    setGameOpenings([]);
    setSelected(null);
  }

  function handleMainAction() {
    if (selDevGroup) handleRepeatLine();
    else if (selHoleGroup || selNolineGroup) {
      if (selNolineGroup) router.push('/openings/new');
      else handleAddLine();
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderHoleExplorer(hGroup: HoleGroup) {
    const afterFen = fenAfterUci(hGroup.fenBefore, hGroup.playedUci);
    if (!afterFen) return null;
    const key = posKey(afterFen);
    const rawData = isDemo ? (DEMO_LICHESS[key as keyof typeof DEMO_LICHESS] ?? null) : (lichessCache.get(key) ?? null);
    const lData: LichessData | null = rawData as LichessData | null;

    // hGroup.color is the opponent's hole move; I am the OPPOSITE side (side to move in resulting pos)
    const myColor = hGroup.color === 'w' ? 'чёрных' : 'белых';

    return (
      <div data-ui="rep-explorer" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Что здесь играют на Lichess, 1200–2000 · доля партий · очки {myColor}
        </div>
        {!lData && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Загрузка…</div>}
        {lData?.loading && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Загрузка…</div>}
        {lData?.error === 'no_token' && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Добавь LICHESS_TOKEN, чтобы видеть, что здесь играют</div>
        )}
        {lData?.error && lData.error !== 'no_token' && (
          <div style={{ fontSize: 13, color: '#F08277' }}>Ошибка Lichess</div>
        )}
        {lData && !lData.loading && !lData.error && lData.moves.slice(0, 3).map((mv, i) => {
          const isSel = selLichessMove?.uci === mv.uci;
          return (
            <div key={mv.uci} style={{ display: 'grid', gridTemplateColumns: '22px 52px 1fr 84px 28px', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ivory)' }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, background: i === 0 ? 'var(--accent-press)' : '#4E6E33', color: '#fff', fontWeight: 800, fontSize: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
              <b style={{ fontSize: 14, color: 'var(--ivory)' }}>{mv.san}</b>
              <div style={{ height: 6, borderRadius: 3, background: '#3A3835', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 3, opacity: 0.85, width: `${Math.round(mv.share * 100)}%` }} />
              </div>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(mv.share * 100)}% · {Math.round(mv.score * 100)}%</span>
              <button
                onClick={() => setSelLichessMove(isSel ? mv : mv)}
                style={{ width: 26, height: 24, borderRadius: 7, background: isSel ? 'var(--accent)' : 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'grid', placeItems: 'center', color: 'var(--ivory)', cursor: 'pointer', flexShrink: 0 }}
              >
                <IconPlus size={13} />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - var(--topbar-h))', color: 'var(--muted)', fontSize: 15 }}>
        Загрузка…
      </div>
    );
  }

  // ── Determine empty state ──────────────────────────────────────────────────

  const hasOpenings = openings.length > 0;
  const hasGames = games.length > 0;
  const hasData = devGroups.length > 0 || holeGroups.length > 0;

  // ── UI pieces ──────────────────────────────────────────────────────────────

  const insight = buildInsight();

  // Result display for deviation row
  function ResultLabel({ losses, wins, draws, times }: { losses: number; wins: number; draws: number; times: number }) {
    if (losses === times) return <span style={{ fontSize: 13, color: '#F08277', whiteSpace: 'nowrap' }}>{times === 1 ? 'пораж.' : `${times} пораж.`}</span>;
    if (wins === times) return <span style={{ fontSize: 13, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{times === 1 ? 'победа' : `${times} побед`}</span>;
    if (draws === times) return <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{times === 1 ? 'ничья' : `${times} ничьих`}</span>;
    if (losses > 0) return <span style={{ fontSize: 13, color: '#F08277', whiteSpace: 'nowrap' }}>{losses} пораж.</span>;
    return <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>побед {wins}</span>;
  }

  // ── Left session panel ─────────────────────────────────────────────────────

  const sessionPanel = (
    <>
      {/* Header */}
      <div style={{ padding: '20px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 19, fontWeight: 700 }}>Дебюты</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{totalCt} партий</div>
      </div>

      {/* Stats */}
      <div data-ui="session-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', margin: '0 20px', border: '1px solid var(--hairline)', borderRadius: 10, overflow: 'hidden' }}>
        {[
          { val: inLineCt, label: 'по линии', color: 'var(--accent)' },
          { val: devCt,    label: 'отклонился', color: '#F08277' },
          { val: holeCt,   label: 'дыры', color: 'var(--warn, #F0A43A)' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '10px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid var(--hairline)' : 'none' }}>
            <b style={{ display: 'block', fontSize: 20, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', color: s.color }}>{s.val}</b>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Color filter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', margin: '14px 20px 0', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)', padding: 3, gap: 3 }}>
        {(['white','black','all'] as const).map(c => (
          <div
            key={c}
            onClick={() => { setColorFilter(c); saveFilters(c, periodFilter); setSelected(null); }}
            style={{ height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: c === colorFilter ? 600 : 500, color: c === colorFilter ? 'var(--ivory)' : 'var(--muted)', background: c === colorFilter ? 'var(--row, var(--surface-2))' : 'transparent', cursor: 'pointer' }}
          >
            {c === 'white' ? 'Белыми' : c === 'black' ? 'Чёрными' : 'Все'}
          </div>
        ))}
      </div>

      {/* Period filter */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', margin: '8px 20px 0', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)', padding: 3, gap: 3 }}>
        {(['30d','all'] as const).map(p => (
          <div
            key={p}
            onClick={() => { setPeriodFilter(p); saveFilters(colorFilter, p); setSelected(null); }}
            style={{ height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: p === periodFilter ? 600 : 500, color: p === periodFilter ? 'var(--ivory)' : 'var(--muted)', background: p === periodFilter ? 'var(--row, var(--surface-2))' : 'transparent', cursor: 'pointer' }}
          >
            {p === '30d' ? '30 дней' : 'Всё время'}
          </div>
        ))}
      </div>

      {/* Opening list */}
      <div style={{ margin: '16px 20px 6px', fontSize: 13, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Мои дебюты</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{openingStats.size}</span>
      </div>

      <div data-ui="session-list" style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
        {/* «Все дебюты» row */}
        <div
          data-ui="rep-opening"
          onClick={() => { setSelOpeningId(null); setSelected(null); }}
          style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'center', gap: 10, height: 54, padding: '0 10px', borderRadius: 10, cursor: 'pointer', position: 'relative', background: selOpeningId === null ? 'var(--row, var(--surface-2))' : 'transparent' }}
        >
          {selOpeningId === null && <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: 'var(--accent)' }} />}
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
            <IconLayoutGrid size={16} />
          </div>
          <div>
            <div style={{ fontSize: 14, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Все дебюты</div>
            <div style={{ height: 4, borderRadius: 2, background: '#3A3835', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: totalCt > 0 ? `${Math.round((inLineCt / totalCt) * 100)}%` : '0%' }} />
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{inLineCt} / {totalCt}</div>
        </div>

        {/* Individual opening rows */}
        {[...openingStats.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([opId, stats]) => {
            const op = openings.find(o => o.id === opId);
            if (!op) return null;
            const isActive = selOpeningId === opId;
            return (
              <div
                key={opId}
                data-ui="rep-opening"
                onClick={() => { setSelOpeningId(opId); setSelected(null); }}
                style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'center', gap: 10, height: 54, padding: '0 10px', borderRadius: 10, cursor: 'pointer', position: 'relative', background: isActive ? 'var(--row, var(--surface-2))' : 'transparent' }}
              >
                {isActive && <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: 'var(--accent)' }} />}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>{op.color === 'black' ? '♟' : '♙'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</div>
                  <div style={{ height: 4, borderRadius: 2, background: '#3A3835', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: stats.total > 0 ? `${Math.round((stats.inLine / stats.total) * 100)}%` : '0%' }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{stats.inLine} / {stats.total}</div>
              </div>
            );
          })}
      </div>

      {/* Bottom */}
      <div style={{ marginTop: 'auto', padding: '14px 20px 20px', borderTop: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <IconBookCheck size={15} />
          {checking
            ? `Проверяю партии: ${checkDone} из ${checkTotal}`
            : `Проверено ${gameOpenings.length} партий`
          }
        </div>
        {checking && (
          <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: checkTotal > 0 ? `${Math.round(checkDone / checkTotal * 100)}%` : '0%', transition: 'width 0.3s' }} />
          </div>
        )}
        <button
          onClick={handleRecheck}
          style={{ width: '100%', height: 44, borderRadius: 'var(--radius-btn)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--ivory)', cursor: 'pointer' }}
        >
          <IconRepeat size={16} />Проверить заново
        </button>
        {dbError && (
          <div style={{ fontSize: 13, color: '#F08277', marginTop: 8 }}>{dbError}</div>
        )}
      </div>
    </>
  );

  // ── Right panel ────────────────────────────────────────────────────────────

  function renderEmpty() {
    if (!hasOpenings) return (
      <div data-ui="rep-empty" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
        <div style={{ marginBottom: 12 }}>Сначала добавь свои дебюты</div>
        <Link href="/openings" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Дебюты</Link>
      </div>
    );
    if (!hasGames) return (
      <div data-ui="rep-empty" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
        <div style={{ marginBottom: 12 }}>Загрузи партии с chess.com</div>
        <Link href="/games" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Мои партии</Link>
      </div>
    );
    return (
      <div data-ui="rep-empty" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
        Ты играешь по своим линиям — так держать
      </div>
    );
  }

  const panelAttrs: Record<string, string> | undefined = isDemo ? { 'data-demo': 'repertoire' } : undefined;

  const rightPanel = (
    <>
      {/* Panel header */}
      <div data-ui="panel-header" style={{ padding: '20px 24px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <span>Партии · Дебюты</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalCt} партий</span>
        </div>
        <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 12, lineHeight: 1.15, fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          {selOpeningId ? (openingMap.get(selOpeningId) ?? 'Дебют') : 'Все дебюты'}
        </div>
        <div data-ui="rep-opening" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ height: 28, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', fontSize: 13, fontWeight: 500, color: 'var(--ivory)' }}>
            {colorFilter === 'all' ? 'Белые и чёрные' : colorFilter === 'white' ? 'Белыми' : 'Чёрными'}
          </div>
          <div style={{ height: 28, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', fontSize: 13, fontWeight: 500, color: 'var(--ivory)' }}>
            {periodFilter === '30d' ? '30 дней' : 'Всё время'}
          </div>
        </div>

        {/* Insight */}
        {insight && (
          <div data-ui="rep-insight" style={{ marginTop: 12, borderRadius: 10, background: 'rgba(240,164,58,.08)', border: '1px solid rgba(240,164,58,.28)', padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--ivory)' }}>
            <IconLightbulb size={18} />
            <div><b>Главное:</b> {insight}</div>
          </div>
        )}
      </div>

      {/* Panel body */}
      {!hasData && !checking && renderEmpty()}

      {hasData && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Deviations section */}
          {devGroups.length > 0 && (
            <div data-ui="rep-deviations">
              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Где ты отходишь от своих линий</span>
                <span style={{ fontWeight: 500, color: 'var(--faint,var(--muted))' }}>{devCt} партий</span>
              </h4>
              {devGroups.map(grp => {
                const badge = clsBadge(grp.maxCls, grp.maxLoss > 0 ? grp.maxLoss : null);
                const isOn = selected?.type === 'dev' && selected.key === grp.key;
                const razes = plural(grp.times, 'раз', 'раза', 'раз');

                return (
                  <div
                    key={grp.key}
                    data-ui="rep-dev"
                    onClick={() => setSelected({ type: 'dev', key: grp.key })}
                    style={{ borderRadius: 10, padding: '10px 12px', display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'start', border: `1px solid ${isOn ? 'var(--hairline)' : 'transparent'}`, background: isOn ? 'var(--row, var(--surface-2))' : 'transparent', cursor: 'pointer', marginBottom: 4 }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 800, marginTop: 1, background: badge.bg, flexShrink: 0 }}>
                      {badge.text}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
                        <span style={{ fontWeight: 700 }}>{moveLabel(grp.moveNumber, grp.color, grp.played)}</span>
                        {' вместо '}
                        <span style={{ fontWeight: 700 }}>{grp.expected.map(e => moveLabel(grp.moveNumber, grp.color, e)).join(' / ')}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {grp.openingName} · {razes} {grp.maxLoss > 0 ? `· ${clsLabel(grp.maxCls, grp.maxLoss)}` : ''}
                      </div>
                      {/* Expanded: list of games */}
                      {isOn && (
                        <div style={{ marginTop: 8, marginBottom: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {grp.gameIds.slice(0, 5).map(gid => {
                            const g = gameById.get(gid);
                            if (!g) return null;
                            return (
                              <Link key={gid} href={`/games/${gid}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ivory)', textDecoration: 'none' }}>
                                <IconExternalLink size={13} />
                                <span>vs {g.opp_name}</span>
                                <span style={{ color: 'var(--muted)' }}>· {fmtDate(g.played_at)}</span>
                                <span style={{ color: resultColor(g.result) }}>· {resultLabel(g.result)}</span>
                              </Link>
                            );
                          })}
                          {grp.gameIds.length > 5 && (
                            <Link href={`/games?rep=deviation&pos=${encodeURIComponent(grp.fenBefore)}`} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
                              ещё {grp.gameIds.length - 5}
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                    <ResultLabel losses={grp.losses} wins={grp.wins} draws={grp.draws} times={grp.times} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Holes + no-lines section */}
          {(holeNormal.length > 0 || nolineGroups.length > 0) && (
            <div data-ui="rep-holes">
              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Где соперник уходит из твоих линий</span>
                <span style={{ fontWeight: 500, color: 'var(--faint,var(--muted))' }}>{holeCt} партий</span>
              </h4>

              {holeNormal.map(hGrp => {
                const isOn = selected?.type === 'hole' && selected.key === hGrp.key;
                return (
                  <div
                    key={hGrp.key}
                    data-ui="rep-hole"
                    onClick={() => setSelected({ type: 'hole', key: hGrp.key })}
                    style={{ borderRadius: 10, padding: '10px 12px', display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'start', border: `1px solid ${isOn ? 'var(--hairline)' : 'transparent'}`, background: isOn ? 'var(--row, var(--surface-2))' : 'transparent', cursor: 'pointer', marginBottom: 4 }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', color: '#fff', marginTop: 1, background: '#C98424', flexShrink: 0 }}>
                      <IconBookX size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
                        <span style={{ fontWeight: 700 }}>{moveLabel(hGrp.moveNumber, hGrp.color, hGrp.played)}</span>
                        {' — нет в твоих линиях'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {hGrp.openingName} · {plural(hGrp.times, 'партия', 'партии', 'партий')}
                        {hGrp.prevMove ? ` · после ${hGrp.prevMove}` : ''}
                      </div>
                      {isOn && renderHoleExplorer(hGrp)}
                    </div>
                    <ResultLabel losses={hGrp.losses} wins={hGrp.wins} draws={hGrp.draws} times={hGrp.times} />
                  </div>
                );
              })}

              {nolineGroups.map(nGrp => {
                const isOn = selected?.type === 'noline' && selected.key === nGrp.key;
                // nGrp.color is the opponent's first move color; I am playing the OPPOSITE color
                const colorLabel = nGrp.color === 'w' ? 'чёрными' : 'белыми';
                return (
                  <div
                    key={nGrp.key}
                    data-ui="rep-nolines"
                    onClick={() => setSelected({ type: 'noline', key: nGrp.key })}
                    style={{ borderRadius: 10, padding: '10px 12px', display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'start', border: `1px solid ${isOn ? 'var(--hairline)' : 'transparent'}`, background: isOn ? 'var(--row, var(--surface-2))' : 'transparent', cursor: 'pointer', marginBottom: 4 }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', marginTop: 1, background: '#4A4744', flexShrink: 0 }}>
                      <span style={{ fontSize: 20 }}>{nGrp.color === 'w' ? '♟' : '♙'}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
                        {'Нет линий против '}
                        <span style={{ fontWeight: 700 }}>{moveLabel(nGrp.moveNumber, nGrp.color, nGrp.played)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {colorLabel} · {plural(nGrp.times, 'партия', 'партии', 'партий')} · создай дебют в «Дебютах»
                      </div>
                    </div>
                    <ResultLabel losses={nGrp.losses} wins={nGrp.wins} draws={nGrp.draws} times={nGrp.times} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Panel actions */}
      <div data-ui="panel-actions" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--hairline)' }}>
        {selDevGroup && (
          <>
            <button
              data-ui="rep-repeat"
              onClick={handleRepeatLine}
              style={{ maxWidth: 420, width: '100%', height: 52, borderRadius: 'var(--radius-btn)', background: 'var(--accent)', boxShadow: 'var(--shadow-btn, var(--shadow-btn, 0 4px 0 rgba(0,0,0,.4)))', color: 'var(--accent-contrast, #fff)', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', border: 'none' }}
            >
              <IconGitBranch size={18} />
              Повторить линию
              <span style={{ fontSize: 13, fontWeight: 600, background: 'rgba(0,0,0,.18)', borderRadius: 6, padding: '2px 7px' }}>Enter</span>
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <button
                onClick={handleAddToMistakes}
                style={{ height: 44, borderRadius: 'var(--radius-btn)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--ivory)', cursor: 'pointer' }}
              >
                <IconCircleAlert size={16} />В тренажёр ошибок
              </button>
              {selDevGroup.gameIds[0] && (
                <Link href={`/games/${selDevGroup.gameIds[selDevGroup.gameIds.length - 1]}`}
                  style={{ height: 44, borderRadius: 'var(--radius-btn)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--ivory)', textDecoration: 'none' }}
                >
                  <IconExternalLink size={16} />Открыть партию
                </Link>
              )}
            </div>
          </>
        )}

        {(selHoleGroup || selNolineGroup) && (() => {
          const hGrp = selHoleGroup ?? selNolineGroup!;
          const isNoline = !selHoleGroup;
          const afterFen = fenAfterUci(hGrp.fenBefore, hGrp.playedUci);
          const pKey = afterFen ? posKey(afterFen) : null;
          const lData = (pKey ? (isDemo ? (DEMO_LICHESS[pKey as keyof typeof DEMO_LICHESS] ?? null) : (lichessCache.get(pKey) ?? null)) : null) as LichessData | null;
          const defaultMove = lData?.moves?.[0] ?? null;
          const addMove = selLichessMove ?? defaultMove;

          if (isNoline) {
            return (
              <Link
                data-ui="rep-add"
                href="/openings/new"
                style={{ maxWidth: 420, width: '100%', height: 52, borderRadius: 'var(--radius-btn)', background: 'var(--accent)', boxShadow: 'var(--shadow-btn, var(--shadow-btn, 0 4px 0 rgba(0,0,0,.4)))', color: 'var(--accent-contrast, #fff)', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none' }}
              >
                <IconPlus size={18} />
                Создать дебют против {moveLabel(hGrp.moveNumber, hGrp.color, hGrp.played)}
              </Link>
            );
          }

          return (
            <>
              <button
                data-ui="rep-add"
                onClick={handleAddLine}
                disabled={!addMove}
                style={{ maxWidth: 420, width: '100%', height: 52, borderRadius: 'var(--radius-btn)', background: addMove ? 'var(--accent)' : 'var(--surface-2)', boxShadow: addMove ? 'var(--shadow-btn, var(--shadow-btn, 0 4px 0 rgba(0,0,0,.4)))' : 'none', color: addMove ? 'var(--accent-contrast, #fff)' : 'var(--muted)', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: addMove ? 'pointer' : 'default', border: 'none' }}
              >
                <IconPlus size={18} />
                {addMove
                  ? `Добавить ${moveLabel(hGrp.moveNumber + 1, hGrp.color === 'w' ? 'b' : 'w', addMove.san)} в «${hGrp.openingName}»`
                  : 'Добавить ответ'
                }
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 12 }}>
                {hGrp.gameIds[0] && (
                  <Link href={`/games/${hGrp.gameIds[0]}`}
                    style={{ height: 44, borderRadius: 'var(--radius-btn)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--ivory)', textDecoration: 'none' }}
                  >
                    <IconExternalLink size={16} />Открыть партию
                  </Link>
                )}
              </div>
            </>
          );
        })()}

        {!selDevGroup && !selHoleGroup && !selNolineGroup && hasData && (
          <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Выбери строку выше
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '8px 16px', fontSize: 14, color: 'var(--ivory)', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
    </>
  );

  // ── TrainerLayout render ───────────────────────────────────────────────────

  return (
    <TrainerLayout
      session={sessionPanel}
      topBar={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
          <PlayerBar label={playerTopLabel || 'Соперник'} boardOrientation={boardOrientation} openingLabel={openingLabel} />
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{posNote}</div>
        </div>
      }
      board={
        <Board
          fen={boardFen}
          size={S}
          orientation={boardOrientation}
          lastMove={boardLastMove}
          arrows={boardArrows}
          interactive={false}
        />
      }
      bottomBar={<PlayerBar label={playerBottomLabel || 'Ты'} bottom boardOrientation={boardOrientation} openingLabel={openingLabel} />}
      panel={rightPanel}
      panelAttrs={panelAttrs}
    />
  );
}

export default function RepertoirePageWrapper() {
  return (
    <Suspense>
      <RepertoirePage />
    </Suspense>
  );
}
