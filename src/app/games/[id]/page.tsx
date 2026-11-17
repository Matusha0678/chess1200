'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import type { MistakeCard } from '@/lib/mistakes';
import { TAG_LABEL, PHASE_LABEL } from '@/lib/mistakes';

// ── Design tokens ─────────────────────────────────────────────────────────────

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.16em',
  color: 'var(--muted)', textTransform: 'uppercase',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  pgn: string;
  color: 'white' | 'black';
  result: 'win' | 'draw' | 'loss';
  opp_name: string;
  rating_opp: number | null;
  rating_me: number | null;
  eco_name: string;
  played_at: string;
  url: string;
  time_class: string;
  analyzed_at: string | null;
}

interface ParsedMove {
  san: string;
  move_number: number;
  color: 'w' | 'b';
}

interface MistakeInfo {
  tag: MistakeCard['tag'];
  phase: MistakeCard['phase'];
  eval_loss: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]} ${d.getFullYear()}`;
}

const RESULT_LABEL: Record<string, string> = { win: 'Победа', draw: 'Ничья', loss: 'Поражение' };
const RESULT_COLOR: Record<string, string> = {
  win: 'var(--ivory)', draw: 'var(--muted)', loss: 'var(--control)',
};

const TIME_CLASS_RU: Record<string, string> = {
  bullet: 'Пуля', blitz: 'Блиц', rapid: 'Рапид', daily: 'Ежедн.', classical: 'Классика',
};

function parseMoves(pgn: string): ParsedMove[] {
  const body = pgn
    .split('\n')
    .filter(line => !line.trim().startsWith('['))
    .join(' ')
    .trim();

  const chess = new Chess();
  const results: ParsedMove[] = [];

  const movePattern = /(O-O-O[+#!?]*|O-O[+#!?]*|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#!?]*)\s*(?:\{[^}]*\})?/g;
  let match: RegExpExecArray | null;

  while ((match = movePattern.exec(body)) !== null) {
    const san = match[1].replace(/[!?]+$/, '').trim();
    const colorToMove = chess.turn();
    const moveNumber = chess.moveNumber();
    let result;
    try {
      result = chess.move(san);
    } catch {
      continue;
    }
    if (!result) continue;
    results.push({ san: result.san, move_number: moveNumber, color: colorToMove as 'w' | 'b' });
  }

  return results;
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>;
}

// ── Course comparison types ───────────────────────────────────────────────────

interface CourseMatch {
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonTitle: string;
  deviationPly: number | null;    // null = matched all the way
  gameMove: string | null;        // what I played
  courseMove: string | null;      // what course said
  whoDeviated: 'me' | 'opponent' | null;
}

function getFen4(fen: string): string {
  // First 4 fields: position, color, castling, en-passant (ignore half/full move)
  return fen.split(' ').slice(0, 4).join(' ');
}

function buildFenSequence(pgn: string): string[] {
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

export default function GameViewerPage({ params }: Props) {
  const { id } = use(params);
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<ParsedMove[]>([]);
  const [mistakes, setMistakes] = useState<Map<string, MistakeInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [courseMatch, setCourseMatch] = useState<CourseMatch | null>(null);

  async function loadGame() {
    setLoading(true);
    const [{ data: gameData }, { data: cardsData }] = await Promise.all([
      supabase.from('games').select('*').eq('id', id).single(),
      supabase.from('mistake_cards').select('*').eq('game_id', id),
    ]);

    if (!gameData) {
      setLoading(false);
      return;
    }

    const g = gameData as GameRow;
    setGame(g);

    // Parse moves
    const parsedMoves = parseMoves(g.pgn ?? '');
    setMoves(parsedMoves);

    // Build mistake map keyed by "move_number:san"
    const mistakeMap = new Map<string, MistakeInfo>();
    for (const card of (cardsData ?? []) as MistakeCard[]) {
      // We need to find which move this card corresponds to
      // Cards store fen_before, so we match by my_move san
      // We'll use a composite key — but we don't have move_number in the card directly
      // So we match by san against each move in the parsed list
      // Store by san for now — if the same SAN appears multiple times, we take the first mistake
      const key = card.my_move;
      if (!mistakeMap.has(key)) {
        mistakeMap.set(key, { tag: card.tag, phase: card.phase, eval_loss: card.eval_loss });
      }
    }
    setMistakes(mistakeMap);

    // ── Course comparison (T9) ────────────────────────────────────────────────
    try {
      const gameFens = buildFenSequence(g.pgn ?? '');

      // Load courses with an opening field
      const { data: coursesData } = await supabase.from('courses').select('id, name, opening').not('opening', 'is', null).neq('opening', '');
      if (!coursesData || coursesData.length === 0) { setLoading(false); return; }

      // Load lesson lines for all those courses
      const { data: lessonsData } = await supabase
        .from('course_lessons')
        .select('id, title, course_id')
        .in('course_id', (coursesData as Array<{ id: string }>).map(c => c.id));
      if (!lessonsData || lessonsData.length === 0) { setLoading(false); return; }

      const lessonIds = (lessonsData as Array<{ id: string }>).map(l => l.id);
      const { data: linesData } = await supabase
        .from('lesson_lines')
        .select('lesson_id, moves, start_fen')
        .in('lesson_id', lessonIds)
        .order('line_order', { ascending: true });

      interface CourseRow { id: string; name: string; }
      interface LessonRow { id: string; title: string; course_id: string; }
      interface LineRow { lesson_id: string; moves: Array<{ from: string; to: string; san: string; color: string }>; start_fen?: string; }

      const courseMap: Record<string, CourseRow> = {};
      for (const c of (coursesData as CourseRow[])) courseMap[c.id] = c;

      const lessonMap: Record<string, LessonRow> = {};
      for (const l of (lessonsData as LessonRow[])) lessonMap[l.id] = l;

      let bestMatch: CourseMatch | null = null;
      let bestMatchLen = 0;

      for (const line of (linesData ?? []) as LineRow[]) {
        const startFen = line.start_fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
        if (!Array.isArray(line.moves) || line.moves.length === 0) continue;

        // Build FEN sequence for this line
        const lineChess = new Chess(startFen);
        const lineFens: string[] = [getFen4(lineChess.fen())];
        for (const m of line.moves) {
          try { lineChess.move({ from: m.from, to: m.to }); } catch { break; }
          lineFens.push(getFen4(lineChess.fen()));
        }

        // Find match length
        let matchLen = 0;
        for (let fi = 0; fi < Math.min(gameFens.length, lineFens.length); fi++) {
          if (gameFens[fi] === lineFens[fi]) matchLen = fi + 1;
          else break;
        }

        if (matchLen < 3) continue; // need at least 3 positions to count as a match

        if (matchLen > bestMatchLen) {
          bestMatchLen = matchLen;
          const lesson = lessonMap[line.lesson_id];
          if (!lesson) continue;
          const course = courseMap[lesson.course_id];
          if (!course) continue;

          let deviationPly: number | null = null;
          let gameMove: string | null = null;
          let courseMove: string | null = null;
          let whoDeviated: 'me' | 'opponent' | null = null;

          if (matchLen < lineFens.length && matchLen < gameFens.length) {
            deviationPly = matchLen;
            const courseMoveObj = line.moves[matchLen - 1];
            courseMove = courseMoveObj?.san ?? null;

            // Reconstruct game move at that ply
            const gameMoveParsed = parsedMoves[matchLen - 1];
            gameMove = gameMoveParsed?.san ?? null;

            const myColor = g.color === 'white' ? 'w' : 'b';
            const moveColor = line.moves[matchLen - 1]?.color ?? 'w';
            whoDeviated = moveColor === myColor ? 'me' : 'opponent';
          }

          bestMatch = {
            courseId: lesson.course_id,
            courseName: course.name,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            deviationPly,
            gameMove,
            courseMove,
            whoDeviated,
          };
        }
      }

      setCourseMatch(bestMatch);
    } catch { /* ignore comparison errors */ }

    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-pulse">
          <div style={{ height: 60, width: 220, background: 'var(--surface)' }} />
          <div style={{ height: 400, background: 'var(--surface)' }} />
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <p style={{ color: 'var(--muted)' }}>Партия не найдена.</p>
        <Link href="/games" style={{ fontSize: 13, color: 'var(--muted)' }}>← Партии</Link>
      </main>
    );
  }

  // Group moves into pairs (white, black)
  const movePairs: Array<{ number: number; white: ParsedMove | null; black: ParsedMove | null }> = [];
  let i = 0;
  while (i < moves.length) {
    const mn = moves[i].move_number;
    const white = moves[i] && moves[i].color === 'w' ? moves[i] : null;
    const black = moves[i + 1] && moves[i + 1]?.color === 'b' ? moves[i + 1] : null;
    movePairs.push({ number: mn, white, black });
    i += (white ? 1 : 0) + (black ? 1 : 0);
    if (!white && !black) break; // safety
  }

  const hasAnalysis = !!game.analyzed_at;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Back link */}
      <Link href="/games" style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'flex-start' }}>
        ← Партии
      </Link>

      {/* Game header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ ...HEADING, margin: 0, fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
            vs {game.opp_name}
            {game.rating_opp && (
              <span style={{ fontSize: 20, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                {game.rating_opp}
              </span>
            )}
          </h1>
          <span style={{ fontSize: 20, fontWeight: 600, color: RESULT_COLOR[game.result] }}>
            {RESULT_LABEL[game.result]}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span>{fmtDate(game.played_at)}</span>
          <span>{game.color === 'white' ? '♙ Белые' : '♟ Чёрные'}</span>
          {game.time_class && <span>{TIME_CLASS_RU[game.time_class] ?? game.time_class}</span>}
          {game.eco_name && <span style={{ color: 'var(--ivory)' }}>{game.eco_name}</span>}
          {game.rating_me && <span>Мой рейтинг: {game.rating_me}</span>}
          <a
            href={game.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--muted)', textDecoration: 'underline' }}
          >
            Открыть на chess.com ↗
          </a>
        </div>
      </div>

      {/* Analyze banner */}
      {!hasAnalysis && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>Партия ещё не проанализирована</span>
          <Link
            href="/games/analyze"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 20px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Анализировать
          </Link>
        </div>
      )}

      {/* Move list */}
      <section>
        <div style={{ borderTop: '2px solid var(--ivory)', paddingTop: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={SECTION_LABEL}>ХОДЫ</span>
            {mistakes.size > 0 && (
              <span style={{ fontSize: 13, color: 'var(--control)' }}>
                {mistakes.size} {mistakes.size === 1 ? 'ошибка' : mistakes.size < 5 ? 'ошибки' : 'ошибок'}
              </span>
            )}
          </div>
        </div>

        {moves.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Нет ходов</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr', gap: 0 }}>
            {/* Header */}
            <span style={{ ...SECTION_LABEL, padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>#</span>
            <span style={{ ...SECTION_LABEL, padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>Белые</span>
            <span style={{ ...SECTION_LABEL, padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>Чёрные</span>

            {movePairs.map((pair) => {
              const wMistake = pair.white ? mistakes.get(pair.white.san) : null;
              const bMistake = pair.black ? mistakes.get(pair.black.san) : null;

              return [
                // Move number
                <span
                  key={`n${pair.number}`}
                  style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0', borderBottom: '1px solid var(--hairline)', fontVariantNumeric: 'tabular-nums', alignSelf: 'start', paddingTop: 10 }}
                >
                  {pair.number}.
                </span>,

                // White move
                <div
                  key={`w${pair.number}`}
                  style={{ padding: '8px 12px', borderBottom: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  {pair.white ? (
                    <>
                      <span style={{ fontSize: 14, fontWeight: wMistake ? 600 : 400, color: wMistake ? 'var(--control)' : 'var(--ivory)', fontFamily: 'monospace' }}>
                        {pair.white.san}
                      </span>
                      {wMistake && (
                        <span style={{ fontSize: 11, color: 'var(--control)', letterSpacing: '0.02em' }}>
                          {TAG_LABEL[wMistake.tag]} · {PHASE_LABEL[wMistake.phase]} · -{wMistake.eval_loss}cp
                        </span>
                      )}
                    </>
                  ) : null}
                </div>,

                // Black move
                <div
                  key={`b${pair.number}`}
                  style={{ padding: '8px 12px', borderBottom: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  {pair.black ? (
                    <>
                      <span style={{ fontSize: 14, fontWeight: bMistake ? 600 : 400, color: bMistake ? 'var(--control)' : 'var(--ivory)', fontFamily: 'monospace' }}>
                        {pair.black.san}
                      </span>
                      {bMistake && (
                        <span style={{ fontSize: 11, color: 'var(--control)', letterSpacing: '0.02em' }}>
                          {TAG_LABEL[bMistake.tag]} · {PHASE_LABEL[bMistake.phase]} · -{bMistake.eval_loss}cp
                        </span>
                      )}
                    </>
                  ) : null}
                </div>,
              ];
            })}
          </div>
        )}
      </section>

      {/* Link to mistakes */}
      {hasAnalysis && mistakes.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 8 }}>
          <Link
            href="/mistakes"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 24px', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}
          >
            Тренировать ошибки →
          </Link>
        </div>
      )}

      {/* Course match block (T9) */}
      {courseMatch && (
        <section style={{ padding: '20px 24px', border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>Курс</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ivory)' }}>
            {courseMatch.courseName} · {courseMatch.lessonTitle}
          </div>
          {courseMatch.deviationPly !== null ? (
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              {courseMatch.whoDeviated === 'me' ? 'Ты' : 'Соперник'} отошёл от курса на ходу {Math.ceil(courseMatch.deviationPly / 2)}.
              {courseMatch.gameMove && courseMatch.courseMove && (
                <> В партии <code style={{ color: 'rgba(220,80,60,0.9)' }}>{courseMatch.gameMove}</code>, в курсе <code style={{ color: 'rgba(100,220,100,0.9)' }}>{courseMatch.courseMove}</code>.</>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: 'rgba(100,220,100,0.9)' }}>Линия сыграна по курсу!</div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href={`/courses/${courseMatch.courseId}/${courseMatch.lessonId}`}
              style={{ height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center', border: '1px solid var(--hairline)', color: 'var(--ivory)', fontSize: 13, textDecoration: 'none' }}
            >
              Открыть урок
            </Link>
            <Link
              href={`/courses/${courseMatch.courseId}/${courseMatch.lessonId}/practice`}
              style={{ height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center', background: 'var(--ivory)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              Повторить линию
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
