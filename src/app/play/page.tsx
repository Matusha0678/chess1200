'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import PlayFromPosition from '@/components/PlayFromPosition';
import { CONVERT_POSITIONS } from '@/data/convert';

// ── URL param reading ──────────────────────────────────────────────────────────

function PlayContent() {
  const params = useSearchParams();
  const rawFen = params.get('fen') ?? '';
  const rawColor = params.get('color') as 'w' | 'b' | null;
  const rawLevel = parseInt(params.get('level') ?? '10', 10);
  const rawMode = params.get('mode') as 'free' | 'convert' | 'handicap' | null;

  const mode = rawMode ?? 'free';
  const level = isNaN(rawLevel) ? 10 : Math.max(0, Math.min(20, rawLevel));

  // ── Convert mode: pick random position ──────────────────────────────────────

  const [convertIdx, setConvertIdx] = useState(() => Math.floor(Math.random() * CONVERT_POSITIONS.length));
  const [convertStats, setConvertStats] = useState<{ wins: number; total: number } | null>(null);

  useEffect(() => {
    if (mode !== 'convert') return;
    supabase
      .from('game_log')
      .select('result')
      .eq('mode', 'convert')
      .then(({ data }) => {
        if (!data) return;
        const total = data.length;
        const wins = data.filter(r => r.result === 'win').length;
        setConvertStats({ wins, total });
      });
  }, [mode]);

  const nextConvertPosition = useCallback(() => {
    setConvertIdx(i => (i + 1) % CONVERT_POSITIONS.length);
  }, []);

  // ── Handicap mode: piece selector ────────────────────────────────────────────

  type HandicapPiece = 'queen' | 'rook' | 'knight';
  const [handicapPiece, setHandicapPiece] = useState<HandicapPiece | null>(null);
  const [handicapReady, setHandicapReady] = useState(false);

  const HANDICAP_FENS: Record<HandicapPiece, string> = {
    queen:  'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    rook:   'rnbqkbn1/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    knight: 'rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  };

  // ── Free mode: validate / derive FEN ─────────────────────────────────────────

  const freeFen = (() => {
    if (!rawFen) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    try { new Chess(rawFen); return rawFen; } catch { return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; }
  })();

  // ── Derive startFen and playerColor from mode ────────────────────────────────

  const startFen = (() => {
    if (mode === 'convert') return CONVERT_POSITIONS[convertIdx].fen;
    if (mode === 'handicap' && handicapPiece) return HANDICAP_FENS[handicapPiece];
    return freeFen;
  })();

  const playerColor: 'w' | 'b' = (() => {
    if (mode === 'convert') return 'w'; // always White in convert mode
    if (mode === 'handicap') return 'w'; // player is White, bot (Black) is weak
    return rawColor ?? 'w';
  })();

  // ── Handicap piece selector ───────────────────────────────────────────────────

  if (mode === 'handicap' && !handicapReady) {
    return (
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 24 }}>
          Игра с форой
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', marginBottom: 8 }}>
          Выбери форy
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32 }}>
          Стокфиш начнёт без одной фигуры. Ты играешь белыми.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['queen', 'rook', 'knight'] as HandicapPiece[]).map(p => {
            const labels: Record<HandicapPiece, string> = { queen: 'Без ферзя', rook: 'Без ладьи (h8)', knight: 'Без коня (g8)' };
            const isSelected = handicapPiece === p;
            return (
              <button
                key={p}
                onClick={() => setHandicapPiece(p)}
                style={{
                  height: 44, border: `1px solid ${isSelected ? 'var(--ivory)' : 'var(--hairline)'}`,
                  background: isSelected ? 'rgba(242,239,231,0.08)' : 'transparent',
                  color: isSelected ? 'var(--ivory)' : 'var(--muted)',
                  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                  padding: '0 16px',
                }}
              >
                {labels[p]}
              </button>
            );
          })}
        </div>
        <button
          disabled={!handicapPiece}
          onClick={() => setHandicapReady(true)}
          style={{
            marginTop: 24, width: '100%', height: 44,
            background: handicapPiece ? 'var(--ivory)' : 'var(--surface)',
            color: handicapPiece ? 'var(--ink)' : 'var(--muted)',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            fontFamily: 'inherit', cursor: handicapPiece ? 'pointer' : 'default',
          }}
        >
          Начать игру
        </button>
      </main>
    );
  }

  // ── Main play view ────────────────────────────────────────────────────────────

  const convert = mode === 'convert' ? CONVERT_POSITIONS[convertIdx] : null;

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 32px' }}>

      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
            {mode === 'convert' ? 'Конвертация преимущества'
              : mode === 'handicap' ? 'Игра с форой'
              : 'Играть с позиции'}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)', margin: 0 }}>
            {convert ? convert.idea : mode === 'handicap' ? `Без ${handicapPiece === 'queen' ? 'ферзя' : handicapPiece === 'rook' ? 'ладьи' : 'коня'}` : 'Позиция'}
          </h1>
        </div>

        {mode === 'convert' && convertStats !== null && convertStats.total > 0 && (
          <div style={{
            padding: '8px 16px', border: '1px solid var(--hairline)', borderRadius: 6,
            fontSize: 13, color: 'var(--muted)', textAlign: 'right',
          }}>
            Статистика побед
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ivory)', lineHeight: 1.2 }}>
              {Math.round(convertStats.wins / convertStats.total * 100)}%
            </div>
            <div style={{ fontSize: 11 }}>{convertStats.wins} из {convertStats.total}</div>
          </div>
        )}
      </div>

      {/* Convert mode: position switcher */}
      {mode === 'convert' && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Позиция {convertIdx + 1} из {CONVERT_POSITIONS.length}
          </span>
          <button onClick={nextConvertPosition} style={{
            height: 28, padding: '0 12px', border: '1px solid var(--hairline)',
            background: 'transparent', color: 'var(--muted)', borderRadius: 14,
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            Следующая →
          </button>
        </div>
      )}

      {/* Board */}
      <PlayFromPosition
        key={`${startFen}-${mode}-${convertIdx}`}
        startFen={startFen}
        playerColor={playerColor}
        level={level}
        mode={mode}
        onNewGame={mode === 'convert' ? nextConvertPosition : undefined}
      />
    </main>
  );
}

// ── Page wrapper (Suspense for useSearchParams) ────────────────────────────────

export default function PlayPage() {
  return (
    <Suspense fallback={
      <main style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>
        Загрузка…
      </main>
    }>
      <PlayContent />
    </Suspense>
  );
}
