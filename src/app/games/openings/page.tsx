'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviationStat {
  openingId: string;
  openingName: string;
  color: 'white' | 'black' | 'both';
  matched: number;       // times a game matched any line of this opening (>=3 plies)
  deviations: number;    // times we deviated before line end
  avgPly: number;        // avg half-move count at deviation
  bestMatchPly: number;  // max continuous match across all games
}

interface MoveEntry { from: string; to: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFen4(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

function buildGameFens(pgn: string): string[] {
  const chess = new Chess();
  const fens: string[] = [getFen4(chess.fen())];
  const body = pgn.split('\n').filter(l => !l.trim().startsWith('[')).join(' ').trim();
  const pattern = /(O-O-O[+#!?]*|O-O[+#!?]*|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#!?]*)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const san = m[1].replace(/[!?]+$/, '');
    try { chess.move(san); } catch { continue; }
    fens.push(getFen4(chess.fen()));
  }
  return fens;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function GameOpeningsPage() {
  const [stats, setStats]       = useState<DeviationStat[]>([]);
  const [loading, setLoading]   = useState(true);
  const [noGames, setNoGames]   = useState(false);
  const [noOpenings, setNoOpenings] = useState(false);
  const [totalGames, setTotalGames] = useState(0);

  async function compute() {
    setLoading(true);

    // Last 100 games
    const { data: gamesData, error: ge } = await supabase.from('games')
      .select('id, pgn, color, result, played_at')
      .order('played_at', { ascending: false })
      .limit(100);
    if (ge) { setLoading(false); return; }
    if (!gamesData || gamesData.length === 0) { setNoGames(true); setLoading(false); return; }
    setTotalGames(gamesData.length);

    // All openings + lines
    const { data: openingsData, error: oe } = await supabase.from('openings')
      .select('id, name, color')
      .limit(500);
    if (oe) { setLoading(false); return; }
    if (!openingsData || openingsData.length === 0) { setNoOpenings(true); setLoading(false); return; }

    const openingIds = (openingsData as Array<{ id: string }>).map(o => o.id);
    const { data: linesData } = await supabase.from('opening_lines')
      .select('id, opening_id, moves')
      .in('opening_id', openingIds);

    interface OpeningRow { id: string; name: string; color: 'white' | 'black' | 'both'; }
    interface LineRow    { id: string; opening_id: string; moves: MoveEntry[] | unknown; }
    interface GameRow    { id: string; pgn: string; color: string; result?: string; played_at?: string; }

    const openingMap: Record<string, OpeningRow> = {};
    for (const o of (openingsData as OpeningRow[])) openingMap[o.id] = o;

    // Build FEN sequences per opening
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    const openingToLineSeqs = new Map<string, string[][]>();
    for (const line of (linesData ?? []) as LineRow[]) {
      const moves = Array.isArray(line.moves) ? line.moves as MoveEntry[] : null;
      if (!moves || moves.length < 3) continue;
      const lc = new Chess(START_FEN);
      const fens: string[] = [getFen4(lc.fen())];
      for (const mv of moves) {
        if (!mv.from || !mv.to) break;
        try { lc.move({ from: mv.from, to: mv.to }); } catch { break; }
        fens.push(getFen4(lc.fen()));
      }
      if (fens.length < 4) continue;
      if (!openingToLineSeqs.has(line.opening_id)) openingToLineSeqs.set(line.opening_id, []);
      openingToLineSeqs.get(line.opening_id)!.push(fens);
    }

    // For each game, find best-matching opening line
    const devMap: Record<string, DeviationStat> = {};
    for (const op of openingsData as OpeningRow[]) {
      devMap[op.id] = {
        openingId: op.id,
        openingName: op.name,
        color: op.color,
        matched: 0, deviations: 0, avgPly: 0, bestMatchPly: 0,
      };
    }

    for (const game of gamesData as GameRow[]) {
      const gameFens = buildGameFens(game.pgn ?? '');
      if (gameFens.length < 4) continue;

      // Find the opening that matches this game best
      let bestOpeningId: string | null = null;
      let bestMatchLen = 0;
      let bestLineLen = 0;

      for (const [openingId, lineSeqs] of openingToLineSeqs) {
        for (const lineFens of lineSeqs) {
          let matchLen = 0;
          for (let fi = 0; fi < Math.min(gameFens.length, lineFens.length); fi++) {
            if (gameFens[fi] === lineFens[fi]) matchLen = fi + 1;
            else break;
          }
          if (matchLen > bestMatchLen) {
            bestMatchLen = matchLen;
            bestOpeningId = openingId;
            bestLineLen = lineFens.length;
          }
        }
      }

      if (!bestOpeningId || bestMatchLen < 4) continue; // require at least 4 ply match

      const stat = devMap[bestOpeningId];
      stat.matched++;
      if (bestMatchLen > stat.bestMatchPly) stat.bestMatchPly = bestMatchLen;
      if (bestMatchLen < bestLineLen && bestMatchLen < gameFens.length) {
        stat.deviations++;
        stat.avgPly = (stat.avgPly * (stat.deviations - 1) + bestMatchLen) / stat.deviations;
      }
    }

    const sorted = Object.values(devMap)
      .filter(d => d.matched > 0)
      .sort((a, b) => b.matched - a.matched);

    setStats(sorted);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void compute();
  }, []);

  const totalMatched = stats.reduce((s, x) => s + x.matched, 0);
  const totalDeviations = stats.reduce((s, x) => s + x.deviations, 0);
  const avgDeviationPct = totalMatched > 0 ? Math.round((totalDeviations / totalMatched) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/games" className="page-back">← Партии</Link>
          <h1 className="page-title">Я против дебютов</h1>
          <p className="page-lead">Где я отхожу от сохранённых линий дебютов (последние {totalGames || 100} партий)</p>
        </div>
      </div>

      {/* Summary */}
      {!loading && stats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em', lineHeight: 1 }}>{totalMatched}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>партий сопоставлено</div>
          </div>
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#F08277', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em', lineHeight: 1 }}>{totalDeviations}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>отходов</div>
          </div>
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em', lineHeight: 1 }}>{avgDeviationPct}%</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>средний % отхода</div>
          </div>
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card, 0px)' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight, 'Inter Tight', 'Inter', sans-serif)", letterSpacing: '-0.02em', lineHeight: 1 }}>{stats.length}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: 0.08, textTransform: 'uppercase', fontWeight: 600 }}>дебютов в игре</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Анализируем партии и твои дебюты…</div>
      ) : noGames ? (
        <div className="empty-state">
          <div className="empty-state-title">Нет загруженных партий</div>
          <div className="empty-state-text">Сначала загрузи партии на странице <Link href="/games" style={{ color: 'var(--accent)' }}>Партии</Link>.</div>
        </div>
      ) : noOpenings ? (
        <div className="empty-state">
          <div className="empty-state-title">Нет сохранённых дебютов</div>
          <div className="empty-state-text">Добавь дебют, чтобы сравнивать партии с его линиями. <Link href="/openings/new" style={{ color: 'var(--accent)' }}>Создать дебют →</Link></div>
        </div>
      ) : stats.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Совпадений не найдено</div>
          <div className="empty-state-text">Партии не совпадают с твоими сохранёнными дебютами. Добавь больше линий или дебютов.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            Отсортировано по числу партий, где играли этот дебют.
          </div>
          {stats.map((s, i) => {
            const pct = s.matched > 0 ? Math.round((s.deviations / s.matched) * 100) : 0;
            const colorIcon = s.color === 'white' ? '♔' : s.color === 'black' ? '♚' : '⇄';
            const colorLabel = s.color === 'white' ? 'Белыми' : s.color === 'black' ? 'Чёрными' : 'За оба';
            const barBg = pct >= 60 ? '#E0574A' : pct >= 30 ? '#F0A43A' : 'var(--accent)';
            return (
              <Link
                key={s.openingId}
                href={`/openings/${s.openingId}`}
                className="ui-card"
                style={{
                  display: 'flex', gap: 16, alignItems: 'flex-start',
                  padding: '14px 18px',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 24, marginTop: 2, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-btn, 4px)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                  {colorIcon}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{s.openingName}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, flexShrink: 0 }}>{colorLabel}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', background: barBg, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 110, textAlign: 'right' }}>
                      <strong style={{ color: barBg }}>{pct}%</strong> отходов ({s.deviations}/{s.matched})
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 14 }}>
                    <span>Партий: {s.matched}</span>
                    {s.avgPly > 0 && <span>Средний ход отхода: {Math.ceil(s.avgPly / 2)}</span>}
                    {s.bestMatchPly > 0 && <span>Лучшее совпадение: {Math.ceil(s.bestMatchPly / 2)} ходов</span>}
                  </div>
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0, alignSelf: 'center', opacity: 0.7 }}>→</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
