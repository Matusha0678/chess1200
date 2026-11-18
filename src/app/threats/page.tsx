'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import type { Square, Color } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Board } from '@/components/board/Board';
import type { BoardArrow, BadgeKind } from '@/components/board/Board';
import { DEMO_THREAT } from '@/lib/demo-positions';
import { TrainerLayout } from '@/components/trainer/TrainerLayout';
import { useTrainerGeometry } from '@/hooks/useTrainerGeometry';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import { FeedbackCard } from '@/components/ui/FeedbackCard';
import { Kbd } from '@/components/ui/Kbd';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MoveChip } from '@/components/ui/MoveChip';
import { ClassIcon } from '@/components/ClassIcon';
import { prepareThreatPositions } from '@/lib/threat-prepare';
import type { ThreatPrepProgress } from '@/lib/threat-prepare';
import { createBrowserEngine } from '@/lib/engine';
import type { Engine } from '@/lib/engine';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThreatPosition {
  id: string;
  game_id: string | null;
  ply: number;
  fen: string;
  my_color: 'w' | 'b';
  last_move_uci: string | null;
  last_move_san: string | null;
  has_threat: boolean;
  threat_uci: string | null;
  threat_san: string | null;
  threat_pv: string | null;
  targets: string[];
  optional_targets: string[];
  attacker_sq: string | null;
  motif: string | null;
  gain_cp: number | null;
  mate_in: number | null;
  difficulty: number;
  missed_in_game: boolean;
  my_move_san: string | null;
  version: number;
}

type Phase = 'loading' | 'empty' | 'preparing' | 'marking' | 'revealed' | 'defensive' | 'done';

interface SessionScore {
  found: number;
  missed: number;
  falseAlarms: number;
  xp: number;
  streak: number;
}

// ── Piece name helpers ────────────────────────────────────────────────────────

const PIECE_NOM: Record<string, string> = {
  p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король',
};
const PIECE_GEN: Record<string, string> = {
  p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля',
};
const PIECE_INSTR: Record<string, string> = {
  p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём',
};

// ── Threat card text builder (LOGIC.md 2.9) ───────────────────────────────────

function buildThreatCardText(pos: ThreatPosition): string {
  const { motif, threat_san, threat_pv, mate_in, last_move_san, targets, attacker_sq } = pos;

  if (!pos.has_threat) {
    return `Ход соперника ${last_move_san ?? '?'} выглядит опасно, но ничего не выигрывает.`;
  }

  const T = threat_san ?? '?';
  const tgt1 = targets[0] ?? '?';
  const tgt2 = targets[1] ?? '?';

  // Try to get piece type at target from FEN
  const getPiece = (sq: string): string => {
    try {
      const c = new Chess(pos.fen);
      const p = c.get(sq as Square);
      return p ? PIECE_NOM[p.type] ?? '?' : '?';
    } catch { return '?'; }
  };

  // Get moving piece from threat
  const getMovingPiece = (): string => {
    if (!threat_san) return '?';
    try {
      const nf = (() => {
        const p = pos.fen.split(' ');
        const me = p[1] as Color;
        p[1] = me === 'w' ? 'b' : 'w';
        p[3] = '-';
        return p.join(' ');
      })();
      const c = new Chess(nf);
      const mv = c.move(threat_san);
      return mv ? PIECE_INSTR[mv.piece] ?? '?' : '?';
    } catch { return '?'; }
  };

  const getAttackerPiece = (): string => {
    if (!attacker_sq) return '?';
    try {
      const nf = (() => {
        const p = pos.fen.split(' ');
        const me = p[1] as Color;
        p[1] = me === 'w' ? 'b' : 'w';
        p[3] = '-';
        return p.join(' ');
      })();
      const c = new Chess(nf);
      const p = c.get(attacker_sq as Square);
      return p ? PIECE_NOM[p.type] ?? '?' : '?';
    } catch { return '?'; }
  };

  const lineStr = threat_pv ? threat_pv.split(' ').slice(0, 3).join(' ') : T;

  switch (motif) {
    case 'fork':
      return `Вилка: ${getMovingPiece()} на ${tgt1} бьёт ${getPiece(tgt1)} и ${getPiece(tgt2)}.`;
    case 'hanging':
      return `${getPiece(tgt1)} на ${tgt1} не защищена — ${T} забирает её.`;
    case 'cheaper':
      return `${getPiece(tgt1)} на ${tgt1} дороже ${getAttackerPiece()} — ${T} выигрывает материал.`;
    case 'back_rank':
      return `Мат по последней горизонтали: ${T}. Король заперт своими пешками.`;
    case 'mate':
      return `Угроза мата в ${mate_in ?? '?'}: ${lineStr}.`;
    case 'discovered':
      return `${getAttackerPiece()} уходит и открывает линию.`;
    case 'pin':
      return `${getPiece(tgt1)} связана — соперник нападает на неё ещё раз.`;
    case 'skewer':
      return `Сквозной удар.`;
    case 'trapped':
      return `${getPiece(tgt1) ? PIECE_NOM[getPieceType(pos.fen, tgt1)] ?? 'Фигуре' : 'Фигуре'} на ${tgt1} некуда уйти — соперник её ловит.`;
    case 'material':
      return `Соперник выигрывает материал: ${lineStr}.`;
    default:
      return `Соперник угрожает: ${T}.`;
  }
}

function getPieceType(fen: string, sq: string): string {
  try {
    const c = new Chess(fen);
    const p = c.get(sq as Square);
    return p?.type ?? '?';
  } catch { return '?'; }
}

function motifTitle(motif: string | null, pos: ThreatPosition): string {
  const T_san = pos.threat_san ?? '';
  // Figure out moving piece from nullFen + threat_san
  const getMovingPiece = (): string => {
    try {
      const nf = (() => {
        const p = pos.fen.split(' ');
        const me = p[1] as Color;
        p[1] = me === 'w' ? 'b' : 'w';
        p[3] = '-';
        return p.join(' ');
      })();
      const c = new Chess(nf);
      const mv = c.move(T_san);
      return mv ? PIECE_INSTR[mv.piece] ?? '' : '';
    } catch { return ''; }
  };

  const getCapturePiece = (): string => {
    try {
      const nf = (() => {
        const p = pos.fen.split(' ');
        const me = p[1] as Color;
        p[1] = me === 'w' ? 'b' : 'w';
        p[3] = '-';
        return p.join(' ');
      })();
      const c = new Chess(nf);
      const mv = c.move(T_san);
      return mv?.captured ? PIECE_GEN[mv.captured] ?? '' : '';
    } catch { return ''; }
  };

  switch (motif) {
    case 'back_rank': return 'Мат по последней горизонтали';
    case 'mate': return 'Угроза мата';
    case 'fork': return `Вилка ${getMovingPiece()}`;
    case 'discovered': return 'Вскрытое нападение';
    case 'skewer': return 'Сквозной удар';
    case 'pin': return 'Связка';
    case 'trapped': return 'Ловля фигуры';
    case 'hanging': return `Зевок ${getCapturePiece()}`;
    case 'cheaper': return `Нападение на ${getCapturePiece()}`;
    default: return 'Выигрыш материала';
  }
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} сек`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h} ч ${mm} мин` : `${h} ч`;
}

const BLITZ_SECONDS = 60;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ThreatsPage() {
  const router = useRouter();
  const { S } = useTrainerGeometry();
  const searchParams = useSearchParams();
  const demoKey = searchParams.get('demo') as 'fork' | null;
  const isDemo = demoKey === 'fork';

  const [linePreview, setLinePreview] = useState<number | null>(null);

  const [positions, setPositions] = useState<ThreatPosition[]>([]);
  const [posIdx, setPosIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [marked, setMarked] = useState<Set<Square>>(new Set());
  const [score, setScore] = useState<SessionScore>({ found: 0, missed: 0, falseAlarms: 0, xp: 0, streak: 0 });
  const [defensiveMoveResult, setDefensiveMoveResult] = useState<'correct' | 'wrong' | null>(null);
  const [blitzMode, setBlitzMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(BLITZ_SECONDS);
  const [oppName, setOppName] = useState('Соперник');
  const [playerName, setPlayerName] = useState('');
  const [hintUsed, setHintUsed] = useState(false);
  const [hintActive, setHintActive] = useState(false);

  // Preparing
  const [preparing, setPreparing] = useState(false);
  const [prepProgress, setPrepProgress] = useState<ThreatPrepProgress | null>(null);
  const [prepStartedAt, setPrepStartedAt] = useState(0);
  const engineRef = useRef<(Engine & { quit(): void; init(): Promise<void> }) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posStartRef = useRef<number>(Date.now());

  // Per-position history
  const [posHistory, setPosHistory] = useState<Array<{
    pos: ThreatPosition;
    result: 'correct' | 'partial' | 'miss' | 'false' | 'none_correct' | 'none_wrong';
  }>>([]);

  useEffect(() => {
    supabase.from('games_sync_state').select('username').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data) setPlayerName((data as { username: string }).username);
      });
  }, []);

  useEffect(() => { void loadPositions(); }, []);

  async function loadPositions() {
    if (isDemo && demoKey === 'fork') {
      const d = DEMO_THREAT[demoKey];
      const p: ThreatPosition = {
        id: d.id, game_id: d.game_id, ply: 0,
        fen: d.fen, my_color: d.my_color,
        last_move_uci: d.last_move_uci, last_move_san: d.last_move_san,
        has_threat: d.has_threat, threat_uci: d.threat_uci, threat_san: d.threat_san,
        threat_pv: d.threat_pv,
        targets: [...d.targets], optional_targets: [...d.optional_targets],
        attacker_sq: d.attacker_sq, motif: d.motif, gain_cp: d.gain_cp,
        mate_in: d.mate_in, difficulty: d.difficulty,
        missed_in_game: d.missed_in_game, my_move_san: d.my_move_san,
        version: d.version,
      };
      setPositions([p]);
      setPosIdx(0);
      setPhase('marking');
      setMarked(new Set());
      setPosHistory([]);
      posStartRef.current = Date.now();
      return;
    }
    setPhase('loading');

    const { data, error } = await supabase
      .from('threat_positions')
      .select('*')
      .eq('version', 2)
      .order('missed_in_game', { ascending: false })
      .order('difficulty', { ascending: true })
      .limit(12);

    if (error || !data || data.length === 0) {
      setPhase('empty');
      return;
    }

    // Shuffle
    const pool = [...(data as ThreatPosition[])];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    setPositions(pool);
    setPosIdx(0);
    setPhase('marking');
    setMarked(new Set());
    setPosHistory([]);
    posStartRef.current = Date.now();
  }

  // Load opp name when position changes
  useEffect(() => {
    const pos = positions[posIdx];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!pos?.game_id) { setOppName('Соперник'); return; }
    supabase
      .from('games')
      .select('opp_name')
      .eq('id', pos.game_id)
      .maybeSingle()
      .then(({ data }) => {
        setOppName((data as { opp_name: string } | null)?.opp_name ?? 'Соперник');
      });
  }, [posIdx, positions]);

  // Blitz timer
  useEffect(() => {
    if (!blitzMode || phase !== 'marking') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeLeft(BLITZ_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          void reveal();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blitzMode, posIdx, phase]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'Enter' || e.key === 'e' || e.key === 'E') && phase === 'marking') {
        e.preventDefault();
        void reveal();
      }
      if ((e.key === 'n' || e.key === 'N') && phase === 'marking') {
        e.preventDefault();
        void reveal();
      }
      if (e.key === 'Escape' && phase === 'marking') {
        e.preventDefault();
        setMarked(new Set());
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        if (phase === 'marking') void showHint();
        // defensive hint handled by button
      }
      if (e.key === ' ' && (phase === 'revealed' || phase === 'defensive')) {
        e.preventDefault();
        nextPosition();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, posIdx]);

  const pos = positions[posIdx];

  function handleSquareClick(sq: Square) {
    if (phase !== 'marking') return;
    // Only allow clicking my own pieces
    if (!pos) return;
    const c = new Chess(pos.fen);
    const piece = c.get(sq);
    if (!piece || piece.color !== (pos.my_color as Color)) return;

    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(sq)) next.delete(sq);
      else next.add(sq);
      return next;
    });
  }

  async function reveal() {
    if (!pos) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const timeTaken = Date.now() - posStartRef.current;
    const targets = new Set(pos.targets);
    const optional = new Set(pos.optional_targets);

    let found = 0;
    let falseAlarms = 0;

    if (pos.has_threat) {
      for (const sq of marked) {
        if (targets.has(sq)) found++;
        else if (!optional.has(sq)) falseAlarms++;
      }
    } else {
      // No threat: correct if nothing marked
      falseAlarms += marked.size;
    }

    const missed = pos.has_threat ? pos.targets.filter(sq => !marked.has(sq as Square)).length : 0;
    const roundXp = found * 15 - missed * 5 - falseAlarms * 5;
    const xpGain = Math.max(0, roundXp);

    // Determine result for history
    let result: 'correct' | 'partial' | 'miss' | 'false' | 'none_correct' | 'none_wrong';
    if (!pos.has_threat) {
      result = falseAlarms === 0 ? 'none_correct' : 'none_wrong';
    } else if (found === pos.targets.length && falseAlarms === 0) {
      result = 'correct';
    } else if (found > 0 && missed === 0) {
      result = 'partial';
    } else if (found === 0 && falseAlarms === 0) {
      result = 'miss';
    } else {
      result = 'false';
    }

    setPosHistory(h => [...h, { pos, result }]);
    setScore(prev => ({
      found: prev.found + found,
      missed: prev.missed + missed,
      falseAlarms: prev.falseAlarms + falseAlarms,
      xp: prev.xp + xpGain,
      streak: found > 0 && missed === 0 && falseAlarms === 0
        ? prev.streak + 1
        : 0,
    }));

    if (!isDemo) {
      await supabase.from('threat_log').insert({
        position_id: pos.id,
        fen: pos.fen,
        found,
        missed,
        false_alarms: falseAlarms,
        time_taken_ms: timeTaken,
      });
    }

    setHintUsed(false);
    setHintActive(false);
    setPhase('revealed');
  }

  async function showHint() {
    if (hintUsed || !pos?.attacker_sq) return;
    setHintUsed(true);
    setHintActive(true);
    setScore(prev => ({ ...prev, xp: Math.max(0, prev.xp - 5) }));
    // Flash hint for 1.5s
    setTimeout(() => setHintActive(false), 1500);
  }

  function nextPosition() {
    const next = posIdx + 1;
    if (next >= positions.length) {
      setPhase('done');
      return;
    }
    setPosIdx(next);
    setMarked(new Set());
    setDefensiveMoveResult(null);
    setHintUsed(false);
    setHintActive(false);
    posStartRef.current = Date.now();
    setPhase('marking');
  }

  // ── Prepare ────────────────────────────────────────────────────────────────

  async function handlePrepare() {
    if (preparing) return;
    abortRef.current = new AbortController();
    setPreparing(true);
    setPrepProgress({ gamesChecked: 0, gamesTotal: 0, found: 0 });
    setPrepStartedAt(Date.now());

    try {
      if (!engineRef.current) {
        engineRef.current = await createBrowserEngine();
      }
      await prepareThreatPositions(
        engineRef.current,
        (p) => { setPrepProgress(p); },
        abortRef.current.signal,
      );
      await loadPositions();
    } catch (e) {
      console.error('prepareThreatPositions failed:', e);
    } finally {
      setPreparing(false);
    }
  }

  function stopPrepare() {
    abortRef.current?.abort();
  }

  // ── Build tints ────────────────────────────────────────────────────────────

  function buildTints(): Partial<Record<Square, string>> {
    const tints: Partial<Record<Square, string>> = {};

    // Last move highlight
    if (pos?.last_move_uci && pos.last_move_uci.length >= 4) {
      const lFrom = pos.last_move_uci.slice(0, 2) as Square;
      const lTo   = pos.last_move_uci.slice(2, 4) as Square;
      tints[lFrom] = 'rgba(247,214,74,.42)';
      tints[lTo]   = 'rgba(247,214,74,.55)';
    }

    if (phase === 'marking') {
      for (const sq of marked) {
        tints[sq] = 'rgba(74,144,226,.28)';
      }
      // Hint
      if (hintActive && pos?.attacker_sq) {
        tints[pos.attacker_sq as Square] = 'rgba(240,164,58,.7)';
      }
    }

    if (phase === 'revealed' || phase === 'defensive') {
      const targets = new Set(pos?.targets ?? []);
      const optional = new Set(pos?.optional_targets ?? []);

      for (const sq of marked) {
        if (targets.has(sq)) {
          tints[sq] = 'rgba(129,182,76,.25)';
        } else if (optional.has(sq)) {
          tints[sq] = 'rgba(74,144,226,.28)';
        } else {
          tints[sq] = 'rgba(224,87,74,.22)';
        }
      }
      for (const sq of targets) {
        if (!marked.has(sq as Square)) {
          tints[sq as Square] = 'rgba(240,164,58,.25)';
        }
      }
    }

    return tints;
  }

  // ── Build rings ────────────────────────────────────────────────────────────

  function buildRings(): Partial<Record<Square, string>> {
    if ((phase !== 'revealed' && phase !== 'defensive') || !pos) return {};
    const rings: Partial<Record<Square, string>> = {};
    const targets = new Set(pos.targets);
    const optional = new Set(pos.optional_targets);

    for (const sq of marked) {
      if (targets.has(sq)) rings[sq] = '#81B64C';
      else if (!optional.has(sq)) rings[sq] = '#E0574A';
    }
    for (const sq of targets) {
      if (!marked.has(sq as Square)) rings[sq as Square] = '#F0A43A';
    }
    return rings;
  }

  // ── Build badges ───────────────────────────────────────────────────────────

  function buildBadges(): Partial<Record<Square, BadgeKind>> {
    if ((phase !== 'revealed' && phase !== 'defensive') || !pos) return {};
    const badges: Partial<Record<Square, BadgeKind>> = {};
    const targets = new Set(pos.targets);
    const optional = new Set(pos.optional_targets);

    for (const sq of marked) {
      if (targets.has(sq)) badges[sq] = 'found';
      else if (!optional.has(sq)) badges[sq] = 'wrong';
    }
    for (const sq of targets) {
      if (!marked.has(sq as Square)) badges[sq as Square] = 'missed';
    }
    return badges;
  }

  // ── Build arrows ───────────────────────────────────────────────────────────

  function buildArrows(): BoardArrow[] {
    if (!pos) return [];
    const arrows: BoardArrow[] = [];

    if ((phase === 'revealed' || phase === 'defensive') && pos.threat_uci && pos.threat_uci.length >= 4) {
      if (linePreview !== null && pos.threat_pv) {
        // Show line arrows when hovering
        const pvMoves = pos.threat_pv.split(' ').filter(Boolean);
        pvMoves.slice(0, 4).forEach((uci, idx) => {
          if (!uci || uci.length < 4) return;
          const isOpp = idx % 2 === 0;
          arrows.push({
            from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square,
            color: isOpp ? '#E0574A' : '#4A90E2', style: 'solid', opacity: 0.85,
            label: String(idx + 1), role: isOpp ? 'line-opp' : 'line-me',
          });
        });
      } else {
        // Red solid arrow: threat move
        arrows.push({
          from: pos.threat_uci.slice(0, 2) as Square,
          to: pos.threat_uci.slice(2, 4) as Square,
          color: '#E0574A',
          style: 'solid',
          opacity: 0.85,
          role: 'threat',
        });

        // Orange dashed arrows from threat destination to targets (fork)
        if (pos.motif === 'fork') {
          const toSq = pos.threat_uci.slice(2, 4) as Square;
          for (const tgt of pos.targets.slice(0, 3)) {
            arrows.push({
              from: toSq,
              to: tgt as Square,
              color: 'rgba(240,164,58,0.65)',
              style: 'dashed',
              opacity: 0.65,
              role: 'fork',
            });
          }
        }
      }
    }

    // Hint in marking: highlight attacker
    if (phase === 'marking' && hintActive && pos.threat_uci && pos.threat_uci.length >= 4) {
      arrows.push({
        from: pos.threat_uci.slice(0, 2) as Square,
        to: pos.threat_uci.slice(2, 4) as Square,
        color: 'rgba(240,164,58,0.8)',
        style: 'dashed',
        opacity: 0.8,
        role: 'best',
      });
    }

    return arrows;
  }

  // ── Restart ───────────────────────────────────────────────────────────────

  function handleRestart() {
    setScore({ found: 0, missed: 0, falseAlarms: 0, xp: 0, streak: 0 });
    setPositions([]);
    setPhase('loading');
    setPosHistory([]);
    void loadPositions();
  }

  const isWhite = pos?.my_color === 'w';
  const boardOrientation: 'white' | 'black' = isWhite ? 'white' : 'black';

  // ── Prep ETA ───────────────────────────────────────────────────────────────
  const prepEta: number | null = (() => {
    if (!prepProgress || !preparing || prepProgress.gamesChecked === 0) return null;
    const elapsed = (Date.now() - prepStartedAt) / 1000;
    const perGame = elapsed / prepProgress.gamesChecked;
    return Math.max(0, perGame * (prepProgress.gamesTotal - prepProgress.gamesChecked));
  })();

  // ── Empty state board ─────────────────────────────────────────────────────
  const emptyBoard = (
    <Board
      fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
      orientation="white"
      size={S}
      interactive={false}
      dimmed
    />
  );

  // ── Session panel ─────────────────────────────────────────────────────────
  const blitzToggle = (
    <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
      {(['Обычный', 'Блиц 60с'] as const).map((label, i) => {
        const active = i === 0 ? !blitzMode : blitzMode;
        return (
          <button
            key={label}
            onClick={() => setBlitzMode(i === 1)}
            disabled={phase === 'marking'}
            style={{
              flex: 1, height: 36, fontSize: 13, fontWeight: 500,
              background: active ? 'var(--track)' : 'transparent',
              color: active ? 'var(--ivory)' : 'var(--muted)',
              border: 'none', cursor: phase === 'marking' ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: phase === 'marking' ? 0.6 : 1,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const getResultIcon = (r: typeof posHistory[0]['result']): string => {
    switch (r) {
      case 'correct': case 'none_correct': return '✓';
      case 'partial': return '!';
      case 'miss': case 'false': case 'none_wrong': return '✗';
      default: return '?';
    }
  };
  const getResultColor = (r: typeof posHistory[0]['result']): string => {
    switch (r) {
      case 'correct': case 'none_correct': return '#81B64C';
      case 'partial': return '#F4B45C';
      default: return '#E0574A';
    }
  };

  const sessionList = (
    <>
      {positions.map((p, i) => {
        const isCur = i === posIdx;
        const done = posHistory.find(h => h.pos.id === p.id);
        const isDone = !!done;
        return (
          <div
            key={p.id + i}
            style={{
              display: 'grid',
              gridTemplateColumns: '26px 1fr',
              alignItems: 'center',
              gap: 8,
              height: 50,
              padding: '0 10px',
              borderRadius: 10,
              position: 'relative',
              background: isCur ? 'var(--track)' : 'transparent',
              opacity: isDone ? 0.7 : 1,
            }}
          >
            {isCur && (
              <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#81B64C' }} />
            )}
            <div style={{ display: 'grid', placeItems: 'center', fontSize: 13, color: isCur ? '#81B64C' : 'var(--control)', fontWeight: isCur ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
              {isDone ? (
                <span style={{ color: getResultColor(done.result), fontSize: 15 }}>{getResultIcon(done.result)}</span>
              ) : <span>{i + 1}</span>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: isDone ? 'var(--control)' : 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isDone ? motifTitle(done.pos.motif, done.pos) : `Позиция ${i + 1}`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--control)', marginTop: 1 }}>
                {isDone
                  ? (done.result === 'correct' || done.result === 'none_correct' ? 'верно' : done.result === 'partial' ? `нашёл не всё` : 'ошибка')
                  : isCur ? `партия против ${oppName}` : 'ожидает'
                }
              </div>
            </div>
          </div>
        );
      })}
    </>
  );

  const sessionPanel = (
    <SessionPanel
      title="Сессия"
      rightNote={positions.length > 0 ? `осталось ${Math.max(0, positions.length - posIdx)}` : undefined}
      stats={[
        { value: score.found, label: 'нашёл', color: '#81B64C' },
        { value: score.missed, label: 'пропустил', color: '#E0574A' },
        { value: score.falseAlarms, label: 'лишних', color: '#F4B45C' },
      ]}
      controls={blitzToggle}
      listLabel={positions.length > 0 ? 'Позиции' : undefined}
      listRight={positions.length > 0 ? `${posIdx + 1} / ${positions.length}` : undefined}
      list={sessionList}
      footer={
        <button
          onClick={handleRestart}
          style={{
            width: '100%', height: 44, fontSize: 15, fontWeight: 600,
            background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
            color: 'var(--ivory)', cursor: 'pointer', fontFamily: 'inherit',
            borderRadius: 'var(--radius-btn)',
          }}
        >
          Начать заново
        </button>
      }
    />
  );

  // ── Empty state ───────────────────────────────────────────────────────────

  if (phase === 'empty') {
    return (
      <TrainerLayout
        session={sessionPanel}
        topBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Соперник</span>}
        board={emptyBoard}
        bottomBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Ты</span>}
        panel={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div data-ui="panel-header" style={{ padding: '20px 24px 18px', flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Тренировка · Проверка угроз</div>
              <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
                Позиций пока нет
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              <div data-ui="threat-task" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                <div style={{ padding: '14px 16px', background: 'rgba(129,182,76,.14)', border: '1px solid rgba(129,182,76,.3)', borderRadius: 14 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ivory)', marginBottom: 6 }}>Позиций пока нет</div>
                  <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Сайт найдёт угрозы в твоих партиях и проверит каждую движком. Нужны проанализированные партии.
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { n: '01', text: 'Проанализируй свои партии' },
                    { n: '02', text: 'Нажми «Подготовить позиции»' },
                    { n: '03', text: 'Позиции появятся в тренажёре' },
                  ].map(({ n, text }) => (
                    <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{n}</span>
                      <span style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5, paddingTop: 5 }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div data-ui="threat-rules" style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Нужны партии с анализом
                </div>
              </div>
              <div data-ui="threat-marked" style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
                Нет отметок
              </div>
            </div>
            <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!preparing ? (
                <button
                  onClick={handlePrepare}
                  style={{ height: 52, fontSize: 16, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}
                >
                  Подготовить позиции
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    Проверено {prepProgress?.gamesChecked ?? 0} из {prepProgress?.gamesTotal ?? 0} партий · найдено {prepProgress?.found ?? 0}
                    {prepEta != null && ` · ~${formatEta(prepEta)}`}
                  </div>
                  <ProgressBar value={prepProgress?.gamesChecked ?? 0} max={Math.max(1, prepProgress?.gamesTotal ?? 1)} height={6} />
                  <button onClick={stopPrepare} style={{ height: 44, fontSize: 14, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', color: 'var(--ivory)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}>
                    Стоп
                  </button>
                </div>
              )}
              <button
                onClick={() => router.push('/games/analyze')}
                style={{ height: 44, fontSize: 15, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', color: 'var(--ivory)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}
              >
                Анализ партий
              </button>
            </div>
          </div>
        }
      />
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <TrainerLayout
        session={sessionPanel}
        topBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Соперник</span>}
        board={emptyBoard}
        bottomBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Ты</span>}
        panel={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div data-ui="panel-header" style={{ padding: '20px 24px 18px', flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Тренировка · Проверка угроз</div>
              <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>Загрузка…</div>
            </div>
            <div style={{ flex: 1, padding: '0 24px' }}>
              <div data-ui="threat-task" style={{ marginBottom: 16 }}><div style={{ fontSize: 15, color: 'var(--muted)' }}>Загружаем позиции…</div></div>
              <div data-ui="threat-rules" style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, marginBottom: 16 }}><div style={{ fontSize: 13, color: 'var(--muted)' }}>Подготовка…</div></div>
              <div data-ui="threat-marked" style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>Нет отметок</div>
            </div>
            <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Загрузка…</div>
            </div>
          </div>
        }
      />
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <TrainerLayout
        session={sessionPanel}
        topBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Соперник</span>}
        board={emptyBoard}
        bottomBar={<span style={{ fontSize: 13, color: 'var(--muted)' }}>Ты</span>}
        panel={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div data-ui="panel-header" style={{ padding: '20px 24px 18px', flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Тренировка · Угрозы</div>
              <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>Итоги сессии</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              <div data-ui="threat-task" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Найдено', value: score.found, color: '#81B64C' },
                  { label: 'Пропущено', value: score.missed, color: '#E0574A' },
                  { label: 'Ложных', value: score.falseAlarms, color: '#F4B45C' },
                  { label: 'XP', value: `+${score.xp}`, color: 'var(--ivory)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '12px 16px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)' }}>
                    <b style={{ display: 'block', fontSize: 24, color, fontVariantNumeric: 'tabular-nums' }}>{value}</b>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <div data-ui="threat-rules" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, minHeight: 20 }}>
                {score.streak > 2 ? `Серия: ${score.streak}` : ''}
              </div>
              <div data-ui="threat-marked" style={{ fontSize: 13, color: 'var(--muted)', minHeight: 20 }}>{'\xa0'}</div>
            </div>
            <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
              <button
                onClick={handleRestart}
                style={{ height: 52, fontSize: 18, fontWeight: 700, background: '#81B64C', boxShadow: '0 4px 0 #5E8C35', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit', width: '100%' }}
              >
                Начать заново
              </button>
            </div>
          </div>
        }
      />
    );
  }

  // ── Normal render ─────────────────────────────────────────────────────────

  const isRevealed = phase === 'revealed' || phase === 'defensive';

  const foundCount = [...marked].filter(sq => pos?.targets.includes(sq)).length;
  const missedCount = pos ? pos.targets.filter(sq => !marked.has(sq as Square)).length : 0;

  const boardNode = (
    <Board
      fen={pos?.fen ?? 'start'}
      orientation={boardOrientation}
      size={S}
      interactive={phase === 'defensive'}
      onSquareClick={phase === 'marking' ? handleSquareClick : undefined}
      tints={buildTints()}
      rings={buildRings() as Partial<Record<Square, string>>}
      arrows={buildArrows()}
      badges={buildBadges() as Partial<Record<Square, BadgeKind>>}
    />
  );

  // ── Player bars ────────────────────────────────────────────────────────────

  const topBar = (
    <div data-ui="player-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--track)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{isWhite ? '♟' : '♙'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>{oppName}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isWhite ? 'чёрные' : 'белые'}</span>
      </div>
      {pos?.last_move_san && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>последний ход</span>
          <MoveChip>{pos.last_move_san}</MoveChip>
        </div>
      )}
    </div>
  );

  const bottomBar = (
    <div data-ui="player-bottom" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--track)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{isWhite ? '♙' : '♟'}</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>{playerName || 'ты'}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isWhite ? 'ты · белые' : 'ты · чёрные'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {blitzMode && phase === 'marking' && (
          <>
            <div style={{ width: 80, height: 3, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: timeLeft < 10 ? '#E0574A' : 'var(--ivory)', width: `${(timeLeft / BLITZ_SECONDS) * 100}%`, transition: 'width 1s linear' }} />
            </div>
            <span data-allow-small style={{ fontSize: 13, color: timeLeft < 10 ? '#E0574A' : 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {timeLeft}с
            </span>
          </>
        )}
        {phase !== 'marking' && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>твой ход</span>
        )}
      </div>
    </div>
  );

  // ── Panel content ──────────────────────────────────────────────────────────

  const panelNode = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div data-ui="panel-header" style={{ padding: '20px 24px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <span>Тренировка · Проверка угроз</span>
          {positions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
                {posIdx + 1} / {positions.length}
              </span>
              {score.xp > 0 && (
                <span style={{ fontSize: 13, padding: '2px 8px', borderRadius: 20, background: 'rgba(129,182,76,.12)', border: '1px solid rgba(129,182,76,.3)', color: '#81B64C' }}>
                  +{score.xp} XP
                </span>
              )}
            </div>
          )}
        </div>
        <ProgressBar value={posIdx} max={Math.max(1, positions.length)} height={4} />
        <div data-ui="panel-title" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          {phase === 'marking' ? 'Что хочет соперник?' : phase === 'defensive' ? 'Защитись' : 'Результат'}
        </div>

        {/* Chips */}
        {pos && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
              {isWhite ? 'Ты играешь белыми' : 'Ты играешь чёрными'}
            </span>
            {oppName !== 'Соперник' && (
              <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--muted)' }}>
                Партия против {oppName}
              </span>
            )}
            {isRevealed && pos.has_threat && pos.motif && (
              <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, background: 'rgba(224,87,74,.12)', border: '1px solid rgba(224,87,74,.3)', color: '#F08277' }}>
                {motifTitle(pos.motif, pos)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 24px' }}>

        {/* Phase: marking */}
        {phase === 'marking' && (
          <>
            <div data-ui="threat-task" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Задание</div>
              <div style={{ fontSize: 15, color: 'var(--ivory)', lineHeight: 1.5 }}>
                {pos?.last_move_san
                  ? <>Соперник сыграл <MoveChip>{pos.last_move_san}</MoveChip>. Отметь свои фигуры, которые он может выиграть следующим ходом. Если угроз нет — нажми «Угроз нет».</>
                  : 'Отметь свои фигуры, которые соперник может выиграть следующим ходом. Если угроз нет — нажми «Угроз нет».'
                }
              </div>
            </div>

            <div data-ui="threat-rules" style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, marginBottom: 16 }}>
              {[
                { text: 'Шах твоему королю' },
                { text: 'Фигура без защиты или под ударом более дешёвой' },
                { text: 'Вилка и двойной удар' },
              ].map(({ text }, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30 }}>
                  <span style={{ fontSize: 18, color: 'var(--muted)', flexShrink: 0 }}>·</span>
                  <span style={{ fontSize: 14, color: 'var(--ivory)' }}>{text}</span>
                </div>
              ))}
            </div>

            <div data-ui="threat-marked" style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 10, marginBottom: 16, minHeight: 44 }}>
              {marked.size > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[...marked].map(sq => {
                    const c = new Chess(pos?.fen ?? '');
                    const p = pos ? c.get(sq) : null;
                    return (
                      <span
                        key={sq}
                        onClick={() => setMarked(prev => { const n = new Set(prev); n.delete(sq); return n; })}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 20,
                          background: 'var(--track)', border: '1px solid var(--hairline)',
                          fontSize: 13, color: 'var(--ivory)', cursor: 'pointer',
                        }}
                      >
                        {sq} · {p ? PIECE_NOM[p.type] ?? '?' : '?'}
                        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>✕</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>Пока ничего не отмечено</div>
              )}
            </div>
          </>
        )}

        {/* Phase: revealed */}
        {isRevealed && pos && (
          <>
            {/* Threat card */}
            <div data-ui="threat-card" data-result={pos.has_threat ? 'threat' : 'no-threat'} style={{ marginBottom: 16 }}>
              {!pos.has_threat ? (
                <FeedbackCard
                  variant={marked.size === 0 ? 'success' : 'warning'}
                  title={marked.size === 0 ? 'Верно! Угроз нет' : 'Угроз не было'}
                >
                  {buildThreatCardText(pos)}
                </FeedbackCard>
              ) : (
                <>
                  <FeedbackCard
                    variant={missedCount === 0 && foundCount === pos.targets.length ? 'success' : missedCount > 0 ? 'danger' : 'warning'}
                    title={
                      missedCount === 0 && foundCount === pos.targets.length
                        ? `Нашёл ${foundCount} из ${pos.targets.length}`
                        : missedCount > 0
                        ? `Пропустил ${missedCount}`
                        : `Лишних: ${marked.size - foundCount}`
                    }
                  >
                    {buildThreatCardText(pos)}
                  </FeedbackCard>
                  {pos.threat_pv && (
                    <div
                      data-ui="threat-line"
                      onMouseEnter={() => setLinePreview(0)}
                      onFocus={() => setLinePreview(0)}
                      onMouseLeave={() => setLinePreview(null)}
                      onBlur={() => setLinePreview(null)}
                      tabIndex={0}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginTop: 8,
                        padding: '6px 8px', borderRadius: 8, cursor: 'default', outline: 'none',
                        ...(linePreview !== null
                          ? { background: 'rgba(74,144,226,.12)', border: '1px solid rgba(74,144,226,.5)' }
                          : { border: '1px solid transparent' }),
                      }}
                    >
                      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>Дальше:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {pos.threat_pv.split(' ').slice(0, 3).map((uci, j) => (
                          <MoveChip key={j}>{uci}</MoveChip>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Threat marks */}
            {pos.has_threat && (
              <div data-ui="threat-marks" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {/* Union of marked + targets */}
                {Array.from(new Set([...pos.targets, ...[...marked]])).map(sq => {
                  const isTarget = pos.targets.includes(sq);
                  const isMarked = marked.has(sq as Square);
                  const isOptional = pos.optional_targets.includes(sq);
                  let cls: 'found' | 'missed' | 'wrong' = 'found';
                  if (isTarget && isMarked) cls = 'found';
                  else if (isTarget && !isMarked) cls = 'missed';
                  else if (!isTarget && isMarked && !isOptional) cls = 'wrong';
                  else return null;

                  const c = new Chess(pos.fen);
                  const p = c.get(sq as Square);
                  const pieceName = p ? PIECE_NOM[p.type] ?? '?' : '?';

                  return (
                    <div
                      key={sq}
                      style={{
                        padding: '10px 14px', background: 'var(--surface-2)',
                        border: `1px solid ${cls === 'found' ? 'rgba(129,182,76,.35)' : cls === 'missed' ? 'rgba(240,164,58,.35)' : 'rgba(224,87,74,.35)'}`,
                        borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: cls === 'found' ? 'rgba(129,182,76,.2)' : cls === 'missed' ? 'rgba(240,164,58,.2)' : 'rgba(224,87,74,.2)',
                        display: 'grid', placeItems: 'center',
                        fontSize: 13, fontWeight: 700,
                        color: cls === 'found' ? '#81B64C' : cls === 'missed' ? '#F4B45C' : '#E0574A',
                      }}>
                        {cls === 'found' ? '✓' : cls === 'missed' ? '!' : '✕'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
                          {sq} · {pieceName}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {cls === 'found' ? 'нашёл' : cls === 'missed' ? 'пропустил' : 'лишняя'}
                        </div>
                      </div>
                      <ClassIcon cls={cls} size={22} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Missed in game note */}
            {pos.missed_in_game && pos.my_move_san && (
              <div style={{ padding: '10px 14px', background: 'rgba(224,87,74,.08)', border: '1px solid rgba(224,87,74,.2)', borderRadius: 10, fontSize: 14, color: '#F08277', marginBottom: 16 }}>
                В партии ты сыграл <strong>{pos.my_move_san}</strong> и пропустил эту угрозу.
              </div>
            )}

            {/* Defensive phase */}
            {phase === 'defensive' && (
              <div data-ui="threat-defense" style={{ marginBottom: 16 }}>
                {defensiveMoveResult === 'correct' ? (
                  <FeedbackCard variant="success" title="Угроза нейтрализована!">
                    Хороший ход — позиция улучшилась.
                  </FeedbackCard>
                ) : defensiveMoveResult === 'wrong' ? (
                  <FeedbackCard variant="danger" title="Угроза не снята">
                    Попробуй другой ход.
                  </FeedbackCard>
                ) : (
                  <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(129,182,76,.14)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 18 }}>🛡</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ivory)', marginBottom: 4 }}>Шаг 2. Найди защиту</div>
                      <div style={{ fontSize: 14, color: 'var(--muted)' }}>Сделай ход на доске, который убирает угрозу.</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: actions */}
      <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {phase === 'marking' && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void reveal()}
                style={{
                  flex: 1, height: 52, fontSize: 18, fontWeight: 700,
                  background: '#81B64C', boxShadow: '0 4px 0 #5E8C35',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}
              >
                {marked.size === 0 ? 'Угроз нет' : 'Проверить'}
                <Kbd>{marked.size === 0 ? 'N' : 'Enter'}</Kbd>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => void reveal()}
                style={{ flex: 1, height: 40, fontSize: 14, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}
              >
                Угроз нет
                <span style={{ fontSize: 11, marginLeft: 4 }}>(N)</span>
              </button>
              <button
                onClick={() => void showHint()}
                disabled={hintUsed}
                style={{ flex: 1, height: 40, fontSize: 14, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', color: hintUsed ? 'var(--muted)' : 'var(--ivory)', cursor: hintUsed ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit', opacity: hintUsed ? 0.5 : 1 }}
              >
                Подсказка
                <span style={{ fontSize: 11, marginLeft: 4 }}>(H)</span>
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              Клик по фигуре — отметить · ещё клик — снять
            </div>
          </>
        )}

        {phase === 'revealed' && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => router.push(`/play?fen=${encodeURIComponent(pos?.fen ?? '')}&color=${pos?.my_color ?? 'w'}&level=10&mode=free`)}
                style={{ height: 44, padding: '0 16px', fontSize: 15, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', color: 'var(--ivory)', cursor: 'pointer', borderRadius: 'var(--radius-btn)', fontFamily: 'inherit' }}
              >
                Сыграть отсюда
              </button>
            </div>
            <button
              onClick={nextPosition}
              style={{
                height: 52, fontSize: 18, fontWeight: 700,
                background: '#81B64C', boxShadow: '0 4px 0 #5E8C35',
                color: '#fff', border: 'none', cursor: 'pointer',
                borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              Дальше
              <Kbd>Пробел</Kbd>
            </button>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              Защиту можно пропустить — сразу «Дальше»
            </div>
          </>
        )}

        {phase === 'defensive' && (
          <button
            onClick={nextPosition}
            style={{
              height: 52, fontSize: 18, fontWeight: 700,
              background: '#81B64C', boxShadow: '0 4px 0 #5E8C35',
              color: '#fff', border: 'none', cursor: 'pointer',
              borderRadius: 'var(--radius-btn)', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            Дальше
            <Kbd>Пробел</Kbd>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <TrainerLayout
      session={sessionPanel}
      topBar={topBar}
      board={boardNode}
      bottomBar={bottomBar}
      panel={panelNode}
      panelAttrs={isDemo && demoKey ? { 'data-demo': demoKey } : undefined}
    />
  );
}
