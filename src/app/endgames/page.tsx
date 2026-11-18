'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { ENDGAMES, CATEGORY_LABELS, type Endgame, type EndgameCategory } from '@/data/endgames';
import { PlayButton } from '@/components/PlayButton';
import { useStockfish } from '@/hooks/useStockfish';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { Board } from '@/components/board/Board';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import type { Square } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Kbd } from '@/components/ui/Kbd';

const MAX_MOVES = 50;

type Phase = 'list' | 'playing' | 'done';

// ── Progress from endgame_log ──────────────────────────────────────────────────

interface EgProgress {
  achieved: boolean;
  tries: number;
  bestMoves: number | null;
}

// ── Filters ───────────────────────────────────────────────────────────────────

interface EgFilters {
  section: string;
  difficulty: 0 | 1 | 2 | 3;
  show: 'all' | 'new' | 'solved';
}

const FILTERS_KEY = 'eg-filters';
const DEFAULT_FILTERS: EgFilters = { section: 'all', difficulty: 0, show: 'all' };

function loadFilters(): EgFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: EgFilters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch { /* ignore */ }
}

// ── Sections config ────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'all',           label: 'Все позиции',         piece: null as string | null },
  { key: 'king_pawn',     label: 'Король и пешка',       piece: 'wP' },
  { key: 'rook',          label: 'Ладейные',             piece: 'wR' },
  { key: 'light_pieces',  label: 'Лёгкие фигуры',        piece: 'wN' },
  { key: 'queen_vs_pawn', label: 'Ферзь против пешки',   piece: 'wQ' },
];

const HEADER_TEXT: Record<string, { title: string; sub: string }> = {
  all:           { title: 'Все позиции',         sub: 'от простых до теоретических · играешь против Stockfish' },
  king_pawn:     { title: 'Король и пешка',       sub: 'оппозиция, ключевые поля, ладейная пешка' },
  rook:          { title: 'Ладейные',             sub: 'мат ладьёй, Лусена, Филидор, отрезание короля' },
  light_pieces:  { title: 'Лёгкие фигуры',        sub: 'конь против слона' },
  queen_vs_pawn: { title: 'Ферзь против пешки',   sub: 'как остановить пешку и где ловушка с патом' },
};

const CAT_ORDER: EndgameCategory[] = ['king_pawn', 'rook', 'light_pieces', 'queen_vs_pawn'];

const DIFF_LABEL: Record<number, string> = { 1: 'Легко', 2: 'Средне', 3: 'Сложно' };
const DIFF_COLOR: Record<number, string> = { 1: '#9BCB6A', 2: '#F4B45C', 3: '#F08277' };

// ── Plurals ────────────────────────────────────────────────────────────────────

function pluralMoves(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} ход`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} хода`;
  return `${n} ходов`;
}

function pluralTries(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} попытка`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} попытки`;
  return `${n} попыток`;
}

function pluralPositions(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} позиция`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} позиции`;
  return `${n} позиций`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function goalAchieved(endgame: Endgame, chess: Chess): boolean {
  if (endgame.goal === 'win') return chess.isCheckmate();
  if (endgame.goal === 'draw') return chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition();
  return false;
}

function goalFailed(endgame: Endgame, chess: Chess, moveCount: number): boolean {
  if (moveCount >= MAX_MOVES) return true;
  if (endgame.goal === 'win' && chess.isDraw()) return true;
  if (endgame.goal === 'draw' && chess.isCheckmate()) return true;
  return false;
}

function playerColor(endgame: Endgame): 'w' | 'b' {
  return new Chess(endgame.fen).turn();
}

// ── MiniBoard ─────────────────────────────────────────────────────────────────

const PIECE_MAP: Record<string, string> = {
  p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K',
};

function parseFen(fen: string): Array<{ piece: string; color: string } | null> {
  const rows = fen.split(' ')[0].split('/');
  const board: Array<{ piece: string; color: string } | null> = [];
  for (const row of rows) {
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) board.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        board.push({ piece: PIECE_MAP[ch.toLowerCase()] || ch.toUpperCase(), color });
      }
    }
  }
  return board;
}

const FALLBACK_PIECES_URL = 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett';

function MiniBoard({ fen, size, lightColor, darkColor, pieceBaseUrl }: {
  fen: string;
  size?: number;
  lightColor: string;
  darkColor: string;
  pieceBaseUrl?: string | null;
}) {
  const squares = parseFen(fen);
  const side = fen.split(' ')[1] || 'w';
  const displaySquares = side === 'b' ? [...squares].reverse() : squares;
  const piecesUrl = pieceBaseUrl ?? FALLBACK_PIECES_URL;

  const containerStyle: React.CSSProperties = {
    width: size ? size : '100%',
    aspectRatio: '1/1',
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gridTemplateRows: 'repeat(8, 1fr)',
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  };

  return (
    <div style={containerStyle}>
      {displaySquares.map((sq, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isLight = (row + col) % 2 === 0;
        const bg = isLight ? lightColor : darkColor;
        return (
          <div
            key={i}
            style={{
              background: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {sq && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${piecesUrl}/${sq.color}${sq.piece}.svg`}
                alt={`${sq.color}${sq.piece}`}
                style={{ width: '80%', height: '80%', objectFit: 'contain' }}
                draggable={false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EndgamesPage() {
  const [phase, setPhase] = useState<Phase>('list');
  const [current, setCurrent] = useState<Endgame | null>(null);
  const [chess, setChess] = useState(() => new Chess());
  const [fen, setFen] = useState('start');
  const [moveCount, setMoveCount] = useState(0);
  const [status, setStatus] = useState('');
  const [hintIdea, setHintIdea] = useState(false);
  const [hintMove, setHintMove] = useState<string | null>(null);
  const [achieved, setAchieved] = useState(false);
  const startTimeRef = useRef(0);
  const { getBestMove, setSkillLevel, isReady } = useStockfish();

  // New catalog state
  const [filters, setFilters] = useState<EgFilters>(DEFAULT_FILTERS);
  const [progress, setProgress] = useState<Map<string, EgProgress>>(new Map());
  const [hovered, setHovered] = useState<string | null>(null);
  const { boardTheme, pieceStyle } = useBoardTheme();
  const pieceBaseUrl = pieceStyle.baseUrl;

  // Load filters from localStorage after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(loadFilters());
  }, []);

  useEffect(() => {
    if (isReady) {
      void setSkillLevel(20);
    }
  }, [isReady, setSkillLevel]);

  // Load progress from Supabase
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('endgame_log')
        .select('endgame_id, achieved, moves_played');
      if (!data) return;
      const map = new Map<string, EgProgress>();
      for (const row of data) {
        const id = row.endgame_id as string;
        const prev = map.get(id) ?? { achieved: false, tries: 0, bestMoves: null };
        const isAchieved = prev.achieved || !!row.achieved;
        const moves = row.achieved && row.moves_played != null ? row.moves_played as number : null;
        const bestMoves = prev.bestMoves === null ? moves : (moves === null ? prev.bestMoves : Math.min(prev.bestMoves, moves));
        map.set(id, { achieved: isAchieved, tries: prev.tries + 1, bestMoves });
      }
      setProgress(map);
    })();
  }, []);

  const updateFilters = useCallback((update: Partial<EgFilters>) => {
    setFilters(prev => {
      const next = { ...prev, ...update };
      saveFilters(next);
      return next;
    });
  }, []);

  const startEndgame = useCallback((eg: Endgame) => {
    const c = new Chess(eg.fen);
    setCurrent(eg);
    setChess(c);
    setFen(eg.fen);
    setMoveCount(0);
    setStatus('');
    setHintIdea(false);
    setHintMove(null);
    setAchieved(false);
    setPhase('playing');
    startTimeRef.current = Date.now();
  }, []);

  const finishEndgame = useCallback(async (ok: boolean, c: Chess, moves: number) => {
    if (!current) return;
    setAchieved(ok);
    setPhase('done');
    setStatus(ok
      ? (current.goal === 'win' ? 'Мат! Цель достигнута.' : 'Ничья! Цель достигнута.')
      : (moves >= MAX_MOVES ? 'Превышен лимит ходов.' : 'Цель не достигнута.'),
    );

    const timeTaken = Date.now() - startTimeRef.current;
    await supabase.from('endgame_log').insert({
      endgame_id: current.id,
      category: current.category,
      goal: current.goal,
      achieved: ok,
      moves_played: moves,
      time_taken_ms: timeTaken,
    });

    setProgress(prev => {
      const next = new Map(prev);
      const id = current.id;
      const p = next.get(id) ?? { achieved: false, tries: 0, bestMoves: null };
      const newBest = ok ? (p.bestMoves === null ? moves : Math.min(p.bestMoves, moves)) : p.bestMoves;
      next.set(id, { achieved: p.achieved || ok, tries: p.tries + 1, bestMoves: newBest });
      return next;
    });
  }, [current]);

  const makeStockfishMove = useCallback((currentFen: string, moves: number) => {
    if (!current) return;
    getBestMove(currentFen, 20, (uciMove: string) => {
      const c = new Chess(currentFen);
      const result = c.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] || 'q' });
      if (!result) return;
      const nextFen = c.fen();
      setFen(nextFen);
      setChess(c);
      const nextMoves = moves + 1;
      setMoveCount(nextMoves);
      if (goalAchieved(current, c) || goalFailed(current, c, nextMoves)) {
        void finishEndgame(goalAchieved(current, c), c, nextMoves);
      }
    });
  }, [current, getBestMove, finishEndgame]);

  const handleDrop = useCallback(({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (!current || phase !== 'playing' || !targetSquare) return false;
    const c = new Chess(fen);
    if (c.turn() !== playerColor(current)) return false;

    let result;
    try {
      result = c.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false;
    }
    if (!result) return false;

    const nextFen = c.fen();
    const nextMoves = moveCount + 1;
    setFen(nextFen);
    setChess(c);
    setMoveCount(nextMoves);
    setHintMove(null);

    if (goalAchieved(current, c)) {
      void finishEndgame(true, c, nextMoves);
      return true;
    }
    if (goalFailed(current, c, nextMoves)) {
      void finishEndgame(false, c, nextMoves);
      return true;
    }

    makeStockfishMove(nextFen, nextMoves);
    return true;
  }, [current, phase, fen, moveCount, finishEndgame, makeStockfishMove]);

  const requestHintMove = useCallback(() => {
    if (!current || phase !== 'playing') return;
    getBestMove(fen, 18, (uciMove: string) => {
      setHintMove(uciMove);
    });
  }, [current, phase, fen, getBestMove]);

  // ── Catalog rendering ────────────────────────────────────────────────────────

  if (phase === 'list') {
    return (
      <CatalogUI
        filters={filters}
        updateFilters={updateFilters}
        progress={progress}
        hovered={hovered}
        setHovered={setHovered}
        startEndgame={startEndgame}
        boardTheme={boardTheme}
        pieceBaseUrl={pieceBaseUrl}
      />
    );
  }

  // ── Playing / done rendering ──────────────────────────────────────────────────

  return (
    <PlayView
      phase={phase}
      current={current}
      chess={chess}
      fen={fen}
      hintMove={hintMove}
      handleDrop={handleDrop}
      moveCount={moveCount}
      status={status}
      hintIdea={hintIdea}
      setHintIdea={setHintIdea}
      requestHintMove={requestHintMove}
      achieved={achieved}
      setPhase={setPhase}
      startEndgame={startEndgame}
    />
  );
}

// ── Catalog UI ────────────────────────────────────────────────────────────────

function CatalogUI({
  filters,
  updateFilters,
  progress,
  hovered,
  setHovered,
  startEndgame,
  boardTheme,
  pieceBaseUrl,
}: {
  filters: EgFilters;
  updateFilters: (u: Partial<EgFilters>) => void;
  progress: Map<string, EgProgress>;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  startEndgame: (eg: Endgame) => void;
  boardTheme: { light: string; dark: string };
  pieceBaseUrl?: string | null;
}) {
  const setSection = useCallback((s: string) => updateFilters({ section: s }), [updateFilters]);

  // Sorted endgames: by CAT_ORDER, then difficulty, then array order
  const sortedEndgames = useMemo(() => {
    return [...ENDGAMES].sort((a, b) => {
      const ai = CAT_ORDER.indexOf(a.category);
      const bi = CAT_ORDER.indexOf(b.category);
      if (ai !== bi) return ai - bi;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return ENDGAMES.indexOf(a) - ENDGAMES.indexOf(b);
    });
  }, []);

  // Filtered endgames
  const filteredEndgames = useMemo(() => {
    return sortedEndgames.filter(eg => {
      if (filters.section !== 'all' && eg.category !== filters.section) return false;
      if (filters.difficulty !== 0 && eg.difficulty !== filters.difficulty) return false;
      if (filters.show === 'solved') {
        const p = progress.get(eg.id);
        if (!p?.achieved) return false;
      } else if (filters.show === 'new') {
        const p = progress.get(eg.id);
        if (p?.achieved) return false;
      }
      return true;
    });
  }, [sortedEndgames, filters, progress]);

  // Next unsolved endgame (by sort order, filtered by section only)
  const nextEg = useMemo(() => {
    const sectionFiltered = sortedEndgames.filter(eg => {
      if (filters.section !== 'all' && eg.category !== filters.section) return false;
      return true;
    });
    return sectionFiltered.find(eg => !progress.get(eg.id)?.achieved) ?? null;
  }, [sortedEndgames, filters.section, progress]);

  // Stats
  const totalSolved = useMemo(() => {
    return ENDGAMES.filter(eg => progress.get(eg.id)?.achieved).length;
  }, [progress]);

  const totalTried = useMemo(() => {
    return ENDGAMES.filter(eg => {
      const p = progress.get(eg.id);
      return p && p.tries > 0 && !p.achieved;
    }).length;
  }, [progress]);

  const totalNew = ENDGAMES.length - totalSolved - totalTried;

  // Section stats
  const sectionStats = useMemo(() => {
    const stats: Record<string, { total: number; solved: number }> = {};
    for (const s of SECTIONS) {
      const egInSection = s.key === 'all'
        ? ENDGAMES
        : ENDGAMES.filter(eg => eg.category === s.key);
      const solved = egInSection.filter(eg => progress.get(eg.id)?.achieved).length;
      stats[s.key] = { total: egInSection.length, solved };
    }
    return stats;
  }, [progress]);

  const handleRandom = useCallback(() => {
    if (filteredEndgames.length === 0) return;
    const idx = Math.floor(Math.random() * filteredEndgames.length);
    startEndgame(filteredEndgames[idx]);
  }, [filteredEndgames, startEndgame]);

  const resetFilters = useCallback(() => {
    updateFilters(DEFAULT_FILTERS);
  }, [updateFilters]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); handleRandom(); }
      if (e.key === 'Enter') { e.preventDefault(); if (nextEg) startEndgame(nextEg); }
      if (e.key === '1') setSection('all');
      if (e.key === '2') setSection('king_pawn');
      if (e.key === '3') setSection('rook');
      if (e.key === '4') setSection('light_pieces');
      if (e.key === '5') setSection('queen_vs_pawn');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRandom, nextEg, startEndgame, setSection]);

  const headerInfo = HEADER_TEXT[filters.section] ?? HEADER_TEXT.all;
  const N = filteredEndgames.length;

  // Group by category for 'all' section
  const groupedItems = useMemo(() => {
    if (filters.section !== 'all') return null;
    const groups: Array<{ cat: EndgameCategory; items: Endgame[] }> = [];
    for (const cat of CAT_ORDER) {
      const items = filteredEndgames.filter(eg => eg.category === cat);
      if (items.length > 0) groups.push({ cat, items });
    }
    return groups;
  }, [filteredEndgames, filters.section]);

  const leftCardStyle: React.CSSProperties = {
    width: 280,
    flexShrink: 0,
    background: 'var(--surface)',
    border: '1px solid var(--hairline)',
    borderRadius: 'var(--radius-card, 0px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--muted)',
    letterSpacing: '0.02em',
    marginTop: 18,
    marginBottom: 6,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', gap: 20, padding: 20, overflow: 'hidden' }}>
        {/* LEFT COLUMN */}
        <section data-ui="eg-left" style={leftCardStyle}>
          <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--ivory)' }}>Эндшпили</span>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>{totalSolved} из {ENDGAMES.length} решено</span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{
                height: '100%',
                width: `${(totalSolved / ENDGAMES.length) * 100}%`,
                background: 'var(--accent)',
                borderRadius: 3,
                transition: 'width 0.3s',
              }} />
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 2 }}>
              <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#81B64C' }}>{totalSolved}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>решено</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#F4B45C' }}>{totalTried}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>в работе</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ivory)' }}>{totalNew}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>новых</div>
              </div>
            </div>

            {/* Sections label */}
            <div style={labelStyle}>Разделы</div>
          </div>

          {/* Sections list */}
          <div data-ui="eg-sections" style={{ flexShrink: 0, padding: '0 0 0 0' }}>
            {SECTIONS.map(sec => {
              const isActive = filters.section === sec.key;
              const st = sectionStats[sec.key] ?? { total: 0, solved: 0 };
              const frac = st.total > 0 ? st.solved / st.total : 0;
              return (
                <div
                  key={sec.key}
                  onClick={() => setSection(sec.key)}
                  style={{
                    height: 54,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0 20px',
                    cursor: 'pointer',
                    background: isActive ? 'var(--surface-2)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.15s',
                    position: 'relative',
                  }}
                >
                  {/* Icon */}
                  <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sec.piece ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${pieceBaseUrl ?? FALLBACK_PIECES_URL}/${sec.piece}.svg`} style={{ width: 26, height: 26 }} alt={sec.label} />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                      </svg>
                    )}
                  </div>

                  {/* Title + progress bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 400, color: 'var(--ivory)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sec.label}
                    </div>
                    <div style={{ height: 4, background: 'var(--hairline)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${frac * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>

                  {/* Count */}
                  <div style={{ fontSize: 13, color: 'var(--faint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {st.solved}&nbsp;/&nbsp;{st.total}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: '0 20px', flexShrink: 0 }}>
            {/* Difficulty label */}
            <div style={labelStyle}>Сложность</div>

            {/* Difficulty segmented */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
              {([0, 1, 2, 3] as const).map(d => {
                const labels = ['Любая', 'Легко', 'Средне', 'Сложно'];
                const isActive = filters.difficulty === d;
                return (
                  <button
                    key={d}
                    onClick={() => updateFilters({ difficulty: d })}
                    style={{
                      flex: 1,
                      padding: '5px 2px',
                      border: 'none',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--ivory)' : 'var(--muted)',
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-btn, 0px)',
                      fontFamily: 'inherit',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {labels[d]}
                  </button>
                );
              })}
            </div>

            {/* Show label */}
            <div style={labelStyle}>Показать</div>

            {/* Show segmented */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
              {(['all', 'new', 'solved'] as const).map(s => {
                const labels = { all: 'Все', new: 'Новые', solved: 'Решённые' };
                const isActive = filters.show === s;
                return (
                  <button
                    key={s}
                    onClick={() => updateFilters({ show: s })}
                    style={{
                      flex: 1,
                      padding: '5px 2px',
                      border: 'none',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--ivory)' : 'var(--muted)',
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-btn, 0px)',
                      fontFamily: 'inherit',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next position (bottom) */}
          <div data-ui="eg-next" style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
            {nextEg ? (
              <>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>Следующая позиция</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}>
                    <MiniBoard fen={nextEg.fen} size={84} lightColor={boardTheme.light} darkColor={boardTheme.dark} pieceBaseUrl={pieceBaseUrl} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nextEg.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                      {SECTIONS.find(s => s.key === nextEg.category)?.label} · {DIFF_LABEL[nextEg.difficulty]}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => startEndgame(nextEg)}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '9px 0',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-btn, 0px)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  Играть
                  <Kbd>Enter</Kbd>
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: 'var(--ivory)', marginBottom: 10 }}>Всё решено</div>
                <button
                  onClick={() => {
                    if (ENDGAMES.length === 0) return;
                    startEndgame(ENDGAMES[Math.floor(Math.random() * ENDGAMES.length)]);
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 0',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-btn, 0px)',
                    color: 'var(--ivory)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Случайная позиция
                </button>
              </>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 18, flexShrink: 0 }}>
            <div>
              <div style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)",
                color: 'var(--ivory)',
                lineHeight: 1.1,
              }}>
                {headerInfo.title}
              </div>
              <div style={{ fontSize: 15, color: 'var(--muted)', marginTop: 6 }}>
                {pluralPositions(N)} · {headerInfo.sub}
              </div>
            </div>
            <button
              onClick={handleRandom}
              disabled={filteredEndgames.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-btn, 0px)',
                color: 'var(--ivory)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
              </svg>
              Случайная позиция
              <Kbd>R</Kbd>
            </button>
          </div>

          {/* Grid */}
          <div
            data-ui="eg-grid"
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gridAutoRows: 'max-content',
              gap: 16,
              alignContent: 'start',
            }}
          >
            {filteredEndgames.length === 0 ? (
              <div style={{ gridColumn: '1/-1', fontSize: 15, color: 'var(--muted)', padding: '32px 0' }}>
                Нет позиций с таким фильтром
                <button
                  onClick={resetFilters}
                  style={{
                    marginLeft: 12,
                    padding: '4px 10px',
                    background: 'transparent',
                    border: '1px solid var(--hairline)',
                    color: 'var(--ivory)',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    borderRadius: 'var(--radius-btn, 0px)',
                  }}
                >
                  Сбросить фильтры
                </button>
              </div>
            ) : groupedItems ? (
              groupedItems.map(({ cat, items }) => {
                const catDone = items.filter(eg => progress.get(eg.id)?.achieved).length;
                return (
                  <React.Fragment key={cat}>
                    <div
                      data-ui="eg-group-header"
                      style={{
                        gridColumn: '1/-1',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        height: 28,
                        marginTop: 2,
                      }}
                    >
                      <b style={{ fontSize: 17, fontWeight: 700, color: 'var(--ivory)' }}>{CATEGORY_LABELS[cat]}</b>
                      <span style={{ fontSize: 14, color: 'var(--muted)' }}>{catDone} из {items.length} решено</span>
                      <hr style={{ flex: 1, border: 0, height: 1, background: 'var(--hairline)', margin: 0 }} />
                    </div>
                    {items.map(eg => (
                      <EgCard
                        key={eg.id}
                        eg={eg}
                        progress={progress.get(eg.id)}
                        isNext={eg.id === nextEg?.id}
                        hovered={hovered}
                        setHovered={setHovered}
                        startEndgame={startEndgame}
                        lightColor={boardTheme.light}
                        darkColor={boardTheme.dark}
                        pieceBaseUrl={pieceBaseUrl}
                      />
                    ))}
                  </React.Fragment>
                );
              })
            ) : (
              filteredEndgames.map(eg => (
                <EgCard
                  key={eg.id}
                  eg={eg}
                  progress={progress.get(eg.id)}
                  isNext={eg.id === nextEg?.id}
                  hovered={hovered}
                  setHovered={setHovered}
                  startEndgame={startEndgame}
                  lightColor={boardTheme.light}
                  darkColor={boardTheme.dark}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── EgCard ────────────────────────────────────────────────────────────────────

function EgCard({
  eg,
  progress,
  isNext,
  hovered,
  setHovered,
  startEndgame,
  lightColor,
  darkColor,
  pieceBaseUrl,
}: {
  eg: Endgame;
  progress: EgProgress | undefined;
  isNext: boolean;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  startEndgame: (eg: Endgame) => void;
  lightColor: string;
  darkColor: string;
  pieceBaseUrl?: string | null;
}) {
  const isHovered = hovered === eg.id;

  const egStatus: 'solved' | 'tried' | 'new' = progress?.achieved
    ? 'solved'
    : progress && progress.tries > 0
      ? 'tried'
      : 'new';

  const side = new Chess(eg.fen).turn();

  let statusText = '';
  let statusColor = '';
  if (egStatus === 'solved' && progress?.bestMoves != null) {
    statusText = pluralMoves(progress.bestMoves);
    statusColor = '#81B64C';
  } else if (egStatus === 'tried' && progress) {
    statusText = pluralTries(progress.tries);
    statusColor = '#F4B45C';
  } else {
    statusText = 'Новая';
    statusColor = 'var(--muted)';
  }

  return (
    <div
      data-ui="eg-card"
      data-status={egStatus}
      data-next={isNext ? 'true' : undefined}
      onClick={() => startEndgame(eg)}
      onMouseEnter={() => setHovered(eg.id)}
      onMouseLeave={() => setHovered(null)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isNext ? 'rgba(129,182,76,.6)' : 'var(--hairline)'}`,
        borderRadius: 12,
        boxShadow: isNext
          ? '0 0 0 1px rgba(129,182,76,.35), 0 2px 10px rgba(0,0,0,.22)'
          : isHovered ? '0 10px 24px rgba(0,0,0,.4)' : '0 2px 10px rgba(0,0,0,.22)',
        transform: isHovered ? 'translateY(-3px)' : undefined,
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* Board area */}
      <div
        data-ui="eg-board"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1/1',
        }}
      >
        <MiniBoard fen={eg.fen} lightColor={lightColor} darkColor={darkColor} pieceBaseUrl={pieceBaseUrl} />

        {/* "Следующая" badge */}
        {isNext && (
          <div style={{
            position: 'absolute',
            left: 10,
            top: 10,
            height: 26,
            borderRadius: 7,
            padding: '0 9px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            background: '#81B64C',
            color: '#fff',
            boxShadow: '0 2px 6px rgba(0,0,0,.35)',
            zIndex: 2,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
            </svg>
            Следующая
          </div>
        )}

        {/* Solved checkmark */}
        {egStatus === 'solved' && (
          <div style={{ position: 'absolute', right: 10, top: 10, zIndex: 2 }}>
            <svg width="28" height="28" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="11.5" fill="#81B64C" />
              <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Hover overlay */}
        {isHovered && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(24,23,22,.72)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 20,
            textAlign: 'center',
            zIndex: 3,
          }}>
            <p style={{ fontSize: 15, color: '#F1EFEC', lineHeight: 1.45, margin: 0 }}>{eg.idea}</p>
            <div style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              background: '#81B64C',
              boxShadow: '0 4px 0 #5E8C35',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Below board */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div
          data-ui="eg-card-title"
          style={{
            fontSize: 15,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--ivory)',
          }}
        >
          {eg.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          <span style={{ color: DIFF_COLOR[eg.difficulty] }}>{DIFF_LABEL[eg.difficulty]}</span>
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#DCD8D3' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${pieceBaseUrl ?? FALLBACK_PIECES_URL}/${side}K.svg`} style={{ width: 17, height: 17 }} alt="" />
            {eg.goal === 'win' ? 'Выиграть' : 'Ничья'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: statusColor }}>
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Playing view ──────────────────────────────────────────────────────────────

function PlayView(props: {
  current: Endgame | null;
  chess: Chess;
  fen: string;
  hintMove: string | null;
  handleDrop: (args: PieceDropHandlerArgs) => boolean;
  moveCount: number;
  phase: Phase;
  status: string;
  hintIdea: boolean;
  setHintIdea: (v: boolean) => void;
  requestHintMove: () => void;
  achieved: boolean;
  setPhase: (p: Phase) => void;
  startEndgame: (eg: Endgame) => void;
}) {
  const { S } = useTrainerGeometry();
  const { current, chess, fen, hintMove, handleDrop, moveCount, phase, status, hintIdea, setHintIdea, requestHintMove, achieved, setPhase, startEndgame } = props;

  const boardOnMove = useCallback((m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    const sq = (s: Square) => s as `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'}`;
    return handleDrop({ sourceSquare: sq(m.from), targetSquare: sq(m.to) } as PieceDropHandlerArgs);
  }, [handleDrop]);

  if (!current) return null;

  const pColor = playerColor(current);
  const orientation = pColor === 'w' ? 'white' : 'black';
  const goalLabel = current.goal === 'win' ? 'Выиграть' : 'Сделать ничью';
  const isPlayerTurn = chess.turn() === pColor && phase === 'playing';

  const hintLastMove = hintMove
    ? { from: hintMove.slice(0, 2) as Square, to: hintMove.slice(2, 4) as Square }
    : undefined;

  const panel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div data-ui="panel-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div data-ui="panel-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{CATEGORY_LABELS[current.category]}</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', marginTop: 2 }}>{goalLabel}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Ход {moveCount + 1} · {isPlayerTurn ? 'Твой ход' : 'Ход Stockfish'}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {status && (
          <div style={{ padding: '10px 12px', background: achieved ? 'rgba(129,182,76,0.1)' : 'rgba(100,80,80,0.15)', border: `1px solid ${achieved ? 'var(--accent)' : '#6B4040'}`, fontSize: 13, color: 'var(--ivory)' }}>
            {status}
          </div>
        )}

        {phase === 'playing' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              <span>Ходы</span>
              <span>{moveCount}/{MAX_MOVES}</span>
            </div>
            <div style={{ height: 3, background: 'var(--hairline)' }}>
              <div style={{ height: '100%', width: `${(moveCount / MAX_MOVES) * 100}%`, background: moveCount > 40 ? '#8B5A5A' : 'var(--accent)', transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {phase === 'playing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setHintIdea(true)} disabled={hintIdea} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--hairline)', color: hintIdea ? 'var(--muted)' : 'var(--ivory)', cursor: hintIdea ? 'default' : 'pointer', fontSize: 13, textAlign: 'left', fontFamily: 'inherit' }}>
              Подсказка идеи
            </button>
            <button onClick={requestHintMove} disabled={!!hintMove} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--hairline)', color: hintMove ? 'var(--muted)' : 'var(--ivory)', cursor: hintMove ? 'default' : 'pointer', fontSize: 13, textAlign: 'left', fontFamily: 'inherit' }}>
              Подсказка хода
            </button>
          </div>
        )}

        {hintIdea && (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            {current.idea}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
          <button onClick={() => setPhase('list')} style={{ flex: 1, padding: '8px 12px', background: 'transparent', border: '1px solid var(--hairline)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            ← Список
          </button>
          {phase === 'done' && (
            <>
              <button onClick={() => startEndgame(current)} style={{ flex: 1, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ivory)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Повторить
              </button>
              <PlayButton fen={current.fen} color={new Chess(current.fen).turn()} label="Играть отсюда" />
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <TrainerLayout
      topBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>Stockfish</span>}
      board={
        <Board
          fen={fen}
          size={S}
          orientation={orientation}
          interactive={isPlayerTurn}
          onMove={boardOnMove}
          lastMove={hintLastMove}
        />
      }
      bottomBar={<span style={{ fontSize: 14, color: 'var(--muted)' }}>{orientation === 'white' ? 'Ты играешь белыми' : 'Ты играешь чёрными'}</span>}
      panel={panel}
    />
  );
}
