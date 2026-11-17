'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviationStat {
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonTitle: string;
  deviations: number;    // times we deviated
  matched: number;       // times we matched this line
  avgPly: number;        // avg ply of deviation
}

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

export default function GameCoursesPage() {
  const [stats, setStats]     = useState<DeviationStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [noGames, setNoGames] = useState(false);

  useEffect(() => {
    void compute();
  }, []);

  async function compute() {
    setLoading(true);

    // Load last 50 games
    const { data: gamesData } = await supabase.from('games').select('id, pgn, color').order('played_at', { ascending: false }).limit(50);
    if (!gamesData || gamesData.length === 0) { setNoGames(true); setLoading(false); return; }

    // Load all courses with opening
    const { data: coursesData } = await supabase.from('courses').select('id, name').limit(50);
    if (!coursesData) { setLoading(false); return; }

    // Load lessons + lines
    const courseIds = (coursesData as Array<{ id: string }>).map(c => c.id);
    const { data: lessonsData } = await supabase.from('course_lessons').select('id, title, course_id').in('course_id', courseIds);
    if (!lessonsData) { setLoading(false); return; }

    const lessonIds = (lessonsData as Array<{ id: string }>).map(l => l.id);
    const { data: linesData } = await supabase.from('lesson_lines').select('lesson_id, moves, start_fen').in('lesson_id', lessonIds).order('line_order', { ascending: true });

    interface CourseRow  { id: string; name: string; }
    interface LessonRow  { id: string; title: string; course_id: string; }
    interface LineRow    { lesson_id: string; moves: Array<{ from: string; to: string }>; start_fen?: string; }
    interface GameRow    { id: string; pgn: string; color: string; }

    const courseMap: Record<string, CourseRow> = {};
    for (const c of (coursesData as CourseRow[])) courseMap[c.id] = c;

    const lessonMap: Record<string, LessonRow> = {};
    for (const l of (lessonsData as LessonRow[])) lessonMap[l.id] = l;

    // Build line FEN sequences
    const lineSeqs: Array<{ lessonId: string; fens: string[] }> = [];
    for (const line of (linesData ?? []) as LineRow[]) {
      if (!Array.isArray(line.moves) || line.moves.length < 3) continue;
      const startFen = line.start_fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
      const lc = new Chess(startFen);
      const fens: string[] = [getFen4(lc.fen())];
      for (const mv of line.moves) {
        try { lc.move({ from: mv.from, to: mv.to }); } catch { break; }
        fens.push(getFen4(lc.fen()));
      }
      if (fens.length >= 4) lineSeqs.push({ lessonId: line.lesson_id, fens });
    }

    // Compare each game with each line
    const devMap: Record<string, DeviationStat> = {};

    for (const game of (gamesData as GameRow[])) {
      const gameFens = buildGameFens(game.pgn ?? '');
      if (gameFens.length < 4) continue;

      for (const { lessonId, fens: lineFens } of lineSeqs) {
        // Count match length
        let matchLen = 0;
        for (let fi = 0; fi < Math.min(gameFens.length, lineFens.length); fi++) {
          if (gameFens[fi] === lineFens[fi]) matchLen = fi + 1;
          else break;
        }
        if (matchLen < 3) continue;

        const lesson = lessonMap[lessonId];
        if (!lesson) continue;
        const course = courseMap[lesson.course_id];
        if (!course) continue;

        const key = lessonId;
        if (!devMap[key]) {
          devMap[key] = { courseId: lesson.course_id, courseName: course.name, lessonId, lessonTitle: lesson.title, deviations: 0, matched: 0, avgPly: 0 };
        }
        devMap[key].matched++;
        if (matchLen < lineFens.length && matchLen < gameFens.length) {
          devMap[key].deviations++;
          devMap[key].avgPly = (devMap[key].avgPly * (devMap[key].deviations - 1) + matchLen) / devMap[key].deviations;
        }
      }
    }

    const sorted = Object.values(devMap)
      .filter(d => d.deviations > 0)
      .sort((a, b) => (b.deviations / b.matched) - (a.deviations / a.matched));

    setStats(sorted);
    setLoading(false);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/games" className="page-back">← Партии</Link>
          <h1 className="page-title">Я против курсов</h1>
          <p className="page-lead">Где я ухожу от курсов чаще всего (последние 50 партий)</p>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Анализируем…</div>
      ) : noGames ? (
        <div className="empty-state">
          <div className="empty-state-title">Нет загруженных партий</div>
          <div className="empty-state-text">Загрузи партии на странице Партии.</div>
        </div>
      ) : stats.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Совпадений не найдено</div>
          <div className="empty-state-text">Не найдено совпадений с линиями курсов.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.map((s, i) => {
            const pct = s.matched > 0 ? Math.round((s.deviations / s.matched) * 100) : 0;
            return (
              <div key={s.lessonId} className="ui-card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 20, marginTop: 3 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>{s.courseName}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{s.lessonTitle}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>Отклонений: <strong style={{ color: 'rgba(220,80,60,0.9)' }}>{pct}%</strong> ({s.deviations} из {s.matched})</span>
                    {s.avgPly > 0 && <span>Средний ход: {Math.ceil(s.avgPly / 2)}</span>}
                  </div>
                </div>
                <Link href={`/courses/${s.courseId}/${s.lessonId}`} className="ui-btn ui-btn-outline ui-btn-sm" style={{ flexShrink: 0, textDecoration: 'none' }}>
                  Открыть
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
