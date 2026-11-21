'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { DEMO_CONVERT } from '@/lib/demo-positions';
import type { DemoConvertPos } from '@/lib/demo-positions';
import { pluralPositions } from '@/lib/plural';

// ── MiniBoard (copied from endgames) ─────────────────────────────────────────

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

function MiniBoard({ fen, size, lightColor, darkColor, pieceBaseUrl, myColor }: {
  fen: string;
  size?: number;
  lightColor: string;
  darkColor: string;
  pieceBaseUrl?: string | null;
  myColor?: 'w' | 'b';
}) {
  const squares = parseFen(fen);
  const orient = myColor ?? (fen.split(' ')[1] || 'w');
  const displaySquares = orient === 'b' ? [...squares].reverse() : squares;
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
          <div key={i} style={{ background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

// ── Types ─────────────────────────────────────────────────────────────────────

type StockfishLevel = 10 | 14 | 18;
type ShowFilter = 'all' | 'new' | 'solved';

const CV_LEVEL_KEY = 'cv-level';
const CV_SHOW_KEY = 'cv-show';

function loadLevel(): StockfishLevel {
  if (typeof window === 'undefined') return 14;
  try {
    const v = localStorage.getItem(CV_LEVEL_KEY);
    if (v === '10' || v === '14' || v === '18') return parseInt(v) as StockfishLevel;
  } catch { /* ignore */ }
  return 14;
}

function loadShow(): ShowFilter {
  if (typeof window === 'undefined') return 'all';
  try {
    const v = localStorage.getItem(CV_SHOW_KEY);
    if (v === 'all' || v === 'new' || v === 'solved') return v;
  } catch { /* ignore */ }
  return 'all';
}

// ── Convert page inner ────────────────────────────────────────────────────────

function ConvertPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isDemo = searchParams.get('demo') === '1';
  const { boardTheme, pieceStyle } = useBoardTheme();
  const pieceBaseUrl = pieceStyle.baseUrl;

  const [level, setLevel] = useState<StockfishLevel>(14);
  const [show, setShow] = useState<ShowFilter>('all');
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLevel(loadLevel());
     
    setShow(loadShow());
  }, []);

  const updateLevel = useCallback((l: StockfishLevel) => {
    setLevel(l);
    try { localStorage.setItem(CV_LEVEL_KEY, String(l)); } catch { /* ignore */ }
  }, []);

  const updateShow = useCallback((s: ShowFilter) => {
    setShow(s);
    try { localStorage.setItem(CV_SHOW_KEY, s); } catch { /* ignore */ }
  }, []);

  // positions (demo or real)
  const allPositions: DemoConvertPos[] = useMemo(() => {
    return isDemo ? DEMO_CONVERT : DEMO_CONVERT; // real: would load from DB
  }, [isDemo]);

  // Filter
  const filteredPositions = useMemo(() => {
    return allPositions.filter(p => {
      if (show === 'new') return p.status === 'new';
      if (show === 'solved') return p.status === 'solved';
      return true;
    });
  }, [allPositions, show]);

  // Sort: new+tried first (by eval DESC), solved last
  const sortedPositions = useMemo(() => {
    return [...filteredPositions].sort((a, b) => {
      if (a.status === 'solved' && b.status !== 'solved') return 1;
      if (a.status !== 'solved' && b.status === 'solved') return -1;
      return b.evalCp - a.evalCp;
    });
  }, [filteredPositions]);

  const totalSolved = allPositions.filter(p => p.status === 'solved').length;
  const totalTried = allPositions.filter(p => p.status === 'tried').length;
  const totalNew = allPositions.filter(p => p.status === 'new').length;

  // Next unsolved
  const nextPos = useMemo(() => {
    return sortedPositions.find(p => p.status !== 'solved') ?? null;
  }, [sortedPositions]);

  // Random
  const handleRandom = useCallback(() => {
    if (filteredPositions.length === 0) return;
    const idx = Math.floor(Math.random() * filteredPositions.length);
    const p = filteredPositions[idx];
    const url = `/play?fen=${encodeURIComponent(p.fen)}&color=${p.myColor}&level=${level}&mode=free&from=convert`;
    router.push(url);
  }, [filteredPositions, level, router]);

  const openPosition = useCallback((p: DemoConvertPos) => {
    const url = `/play?fen=${encodeURIComponent(p.fen)}&color=${p.myColor}&level=${level}&mode=free&from=convert`;
    router.push(url);
  }, [level, router]);

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--muted)',
    letterSpacing: '0.02em', marginTop: 14, marginBottom: 6,
  };

  const leftCardStyle: React.CSSProperties = {
    width: 280, flexShrink: 0,
    background: 'var(--surface)',
    border: '1px solid var(--hairline)',
    borderRadius: 'var(--radius-card, 0px)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', gap: 20, padding: 20, overflow: 'hidden' }}>

        {/* LEFT COLUMN */}
        <section data-ui="eg-left" style={leftCardStyle}>
          <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--ivory)' }}>Дожми партию</span>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>{totalSolved} из {allPositions.length} дожато</span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{
                height: '100%',
                width: `${allPositions.length > 0 ? (totalSolved / allPositions.length) * 100 : 0}%`,
                background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s',
              }} />
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 2 }}>
              {[
                { n: totalSolved, label: 'дожато', color: 'var(--accent)' },
                { n: totalTried, label: 'в работе', color: '#F4B45C' },
                { n: totalNew, label: 'новых', color: 'var(--muted)' },
              ].map(({ n, label, color }) => (
                <div key={label} style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{n}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Stockfish level */}
            <div style={labelStyle}>Сила Stockfish</div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
              {([10, 14, 18] as const).map(l => {
                const labels = { 10: 'Клубный', 14: 'Сильный', 18: 'Мастер' };
                const isActive = level === l;
                return (
                  <button
                    key={l}
                    onClick={() => updateLevel(l)}
                    style={{
                      flex: 1, padding: '5px 2px', border: 'none',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--ivory)' : 'var(--muted)',
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer', borderRadius: 'var(--radius-btn, 0px)',
                      fontFamily: 'inherit', transition: 'background 0.15s',
                    }}
                  >
                    {labels[l]}·{l}
                  </button>
                );
              })}
            </div>

            {/* Show filter */}
            <div style={labelStyle}>Показать</div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--radius-card, 0px)', padding: 3 }}>
              {(['all', 'new', 'solved'] as const).map(s => {
                const labels = { all: 'Все', new: 'Новые', solved: 'Дожатые' };
                const isActive = show === s;
                return (
                  <button key={s} onClick={() => updateShow(s)} style={{
                    flex: 1, padding: '5px 2px', border: 'none',
                    background: isActive ? 'var(--surface)' : 'transparent',
                    color: isActive ? 'var(--ivory)' : 'var(--muted)',
                    fontSize: 14, fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer', borderRadius: 'var(--radius-btn, 0px)',
                    fontFamily: 'inherit', transition: 'background 0.15s',
                  }}>{labels[s]}</button>
                );
              })}
            </div>
          </div>

          {/* Next position */}
          <div data-ui="eg-next" style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
            {nextPos ? (
              <>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>Следующая позиция</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}>
                    <MiniBoard fen={nextPos.fen} size={84} lightColor={boardTheme.light} darkColor={boardTheme.dark} pieceBaseUrl={pieceBaseUrl} myColor={nextPos.myColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      vs {nextPos.opp}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                      {nextPos.date.slice(0, 10)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => openPosition(nextPos)}
                  style={{
                    marginTop: 12, width: '100%', padding: '9px 0',
                    background: 'var(--accent)', border: 'none',
                    borderRadius: 'var(--radius-btn, 0px)', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Играть
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: 'var(--ivory)', marginBottom: 10 }}>Всё дожато!</div>
                <button onClick={handleRandom} style={{
                  width: '100%', padding: '9px 0',
                  background: 'var(--surface-2)', border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-btn, 0px)', color: 'var(--ivory)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>Случайная позиция</button>
              </>
            )}
          </div>
        </section>

        {/* MAIN COLUMN */}
        <section
          data-demo={isDemo ? 'convert' : undefined}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 18, flexShrink: 0 }}>
            <div>
              <div style={{
                fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em',
                color: 'var(--ivory)', lineHeight: 1.1,
              }}>
                Позиции из твоих партий
              </div>
              <div style={{ fontSize: 15, color: 'var(--muted)', marginTop: 6 }}>
                {pluralPositions(sortedPositions.length)} · ты был впереди и не выиграл · играешь против Stockfish
              </div>
            </div>
            <button
              onClick={handleRandom}
              disabled={filteredPositions.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', background: 'var(--surface)',
                border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 0px)',
                color: 'var(--ivory)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
              </svg>
              Случайная
            </button>
          </div>

          {/* Grid */}
          <div
            data-ui="eg-grid"
            style={{
              flex: 1, overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gridAutoRows: 'max-content',
              gap: 16,
              alignContent: 'start',
            }}
          >
            {sortedPositions.length === 0 ? (
              <div style={{ gridColumn: '1/-1', fontSize: 15, color: 'var(--muted)', padding: '32px 0' }}>
                Нет позиций с таким фильтром
              </div>
            ) : (
              sortedPositions.map((pos, idx) => (
                <ConvertCard
                  key={`${pos.fen}-${idx}`}
                  pos={pos}
                  idx={idx}
                  hovered={hovered}
                  setHovered={setHovered}
                  onClick={() => openPosition(pos)}
                  lightColor={boardTheme.light}
                  darkColor={boardTheme.dark}
                  pieceBaseUrl={pieceBaseUrl}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── ConvertCard ───────────────────────────────────────────────────────────────

function ConvertCard({
  pos, idx, hovered, setHovered, onClick, lightColor, darkColor, pieceBaseUrl,
}: {
  pos: DemoConvertPos;
  idx: number;
  hovered: number | null;
  setHovered: (i: number | null) => void;
  onClick: () => void;
  lightColor: string;
  darkColor: string;
  pieceBaseUrl?: string | null;
}) {
  const isHovered = hovered === idx;

  const statusText = pos.status === 'solved' ? 'Дожато ✓' : pos.status === 'tried' ? 'В работе' : 'Новая';
  const statusColor = pos.status === 'solved' ? 'var(--accent)' : pos.status === 'tried' ? '#F4B45C' : 'var(--muted)';
  const resultLabel = pos.result === 'loss' ? 'поражение' : 'ничья';
  const evalStr = pos.evalCp > 0 ? `+${(pos.evalCp / 100).toFixed(1)}` : (pos.evalCp / 100).toFixed(1);

  return (
    <div
      data-ui="eg-card"
      data-status={pos.status}
      onClick={onClick}
      onMouseEnter={() => setHovered(idx)}
      onMouseLeave={() => setHovered(null)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 12, boxShadow: isHovered ? '0 10px 24px rgba(0,0,0,.4)' : '0 2px 10px rgba(0,0,0,.22)',
        transform: isHovered ? 'translateY(-3px)' : undefined,
        overflow: 'hidden', cursor: 'pointer', position: 'relative',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Board area */}
      <div data-ui="eg-board" style={{ position: 'relative', width: '100%', aspectRatio: '1/1' }}>
        <MiniBoard fen={pos.fen} lightColor={lightColor} darkColor={darkColor} pieceBaseUrl={pieceBaseUrl} myColor={pos.myColor} />

        {/* Eval badge */}
        <div style={{
          position: 'absolute', left: 10, top: 10,
          height: 24, borderRadius: 6, padding: '0 8px',
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 13, fontWeight: 700,
          background: 'var(--accent)', color: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,.35)', zIndex: 2,
        }}>
          {evalStr}
        </div>

        {/* Hover overlay */}
        {isHovered && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(24,23,22,.72)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 16, padding: 20, textAlign: 'center', zIndex: 3,
          }}>
            <p style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.45, margin: 0 }}>
              Ты был {evalStr} — дожми
            </p>
            <div style={{
              width: 54, height: 54, borderRadius: 27, background: 'var(--accent)',
              boxShadow: 'var(--shadow-btn, 0 4px 0 rgba(0,0,0,.4))', display: 'grid', placeItems: 'center', color: '#fff',
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
        <div data-ui="eg-card-title" style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ivory)' }}>
          vs {pos.opp} · {pos.date.slice(0, 10)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--muted)' }}>{pos.moveNumber}-й ход · было: {resultLabel}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 600, color: statusColor, whiteSpace: 'nowrap' }}>
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Suspense wrapper ──────────────────────────────────────────────────────────

export function ConvertPage() {
  return (
    <Suspense fallback={null}>
      <ConvertPageInner />
    </Suspense>
  );
}

export default ConvertPage;
