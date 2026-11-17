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
      <div className="page" style={{ maxWidth: 480 }}>
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Выбери форy</h1>
            <p className="page-lead">Стокфиш начнёт без одной фигуры. Ты играешь белыми.</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['queen', 'rook', 'knight'] as HandicapPiece[]).map(p => {
            const labels: Record<HandicapPiece, string> = { queen: 'Без ферзя', rook: 'Без ладьи (h8)', knight: 'Без коня (g8)' };
            const isSelected = handicapPiece === p;
            return (
              <button
                key={p}
                onClick={() => setHandicapPiece(p)}
                className={`ui-btn ${isSelected ? 'ui-btn-primary' : 'ui-btn-outline'}`}
                style={{ justifyContent: 'flex-start' }}
              >
                {labels[p]}
              </button>
            );
          })}
        </div>
        <button
          disabled={!handicapPiece}
          onClick={() => setHandicapReady(true)}
          className="ui-btn ui-btn-primary"
          style={{ marginTop: 24, width: '100%' }}
        >
          Начать игру
        </button>
      </div>
    );
  }

  // ── Main play view ────────────────────────────────────────────────────────────

  const convert = mode === 'convert' ? CONVERT_POSITIONS[convertIdx] : null;

  return (
    <div className="page">

      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <p className="page-crumbs">
            {mode === 'convert' ? 'Конвертация преимущества'
              : mode === 'handicap' ? 'Игра с форой'
              : 'Играть с позиции'}
          </p>
          <h1 className="page-title">
            {convert ? convert.idea : mode === 'handicap' ? `Без ${handicapPiece === 'queen' ? 'ферзя' : handicapPiece === 'rook' ? 'ладьи' : 'коня'}` : 'Позиция'}
          </h1>
        </div>

        {mode === 'convert' && convertStats !== null && convertStats.total > 0 && (
          <div className="stat-card" style={{ textAlign: 'right', minWidth: 100 }}>
            <div className="stat-value">{Math.round(convertStats.wins / convertStats.total * 100)}%</div>
            <div className="stat-label">побед ({convertStats.wins}/{convertStats.total})</div>
          </div>
        )}
      </div>

      {/* Convert mode: position switcher */}
      {mode === 'convert' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Позиция {convertIdx + 1} из {CONVERT_POSITIONS.length}
          </span>
          <button onClick={nextConvertPosition} className="ui-btn ui-btn-outline ui-btn-sm">
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
    </div>
  );
}

// ── Page wrapper (Suspense for useSearchParams) ────────────────────────────────

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div className="page" style={{ textAlign: 'center', paddingTop: 80, color: 'var(--muted)', fontSize: 14 }}>
        Загрузка…
      </div>
    }>
      <PlayContent />
    </Suspense>
  );
}
