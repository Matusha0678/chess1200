'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/lib/supabase';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import type { Course, CourseLesson, LessonLine, CourseLessonMove } from '@/types/courses';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LessonSummary {
  id: string;
  title: string;
  summary: string;
  plan: string;
  trap: string;
  mistakes: string;
  keyFen: string | null;
}

interface Props {
  params: Promise<{ courseId: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function getKeyFen(moves: CourseLessonMove[], startFen: string): string | null {
  if (!moves || moves.length === 0) return null;
  const replay = new Chess(startFen);
  for (const m of moves) {
    try { replay.move({ from: m.from, to: m.to }); } catch { break; }
  }
  return replay.fen();
}

function firstLine(text: string): string {
  return text?.split('\n').find(l => l.trim().length > 0)?.replace(/^[-•*]\s*/, '').trim() ?? '';
}

function listLines(text: string): string[] {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim().length > 0).map(l => l.replace(/^[-•*]\s*/, '').trim()).slice(0, 3);
}

// ── Mini board ────────────────────────────────────────────────────────────────

function MiniBoard({ fen, boardTheme, customPieces }: { fen: string; boardTheme: { dark: string; light: string }; customPieces?: Record<string, (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.JSX.Element> }) {
  return (
    <div style={{ width: 120, height: 120, flexShrink: 0 }}>
      <Chessboard
        options={{
          position: fen,
          allowDragging: false,
          boardOrientation: 'white',
          showNotation: false,
          darkSquareStyle:  { backgroundColor: boardTheme.dark },
          lightSquareStyle: { backgroundColor: boardTheme.light },
          pieces: customPieces,
          boardStyle: { borderRadius: 0, width: '100%', height: '100%' },
          animationDurationInMs: 0,
        }}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheatsheetPage({ params }: Props) {
  const { courseId } = use(params);
  const { boardTheme, customPieces } = useBoardTheme();

  const [course, setCourse]   = useState<Course | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: courseData } = await supabase.from('courses').select('*').eq('id', courseId).single();
      if (!courseData) { setLoading(false); return; }
      setCourse(courseData as Course);

      const { data: lessonsData } = await supabase
        .from('course_lessons')
        .select('id, title, summary, plan, trap, mistakes')
        .eq('course_id', courseId)
        .order('lesson_order', { ascending: true });

      const lessonList = (lessonsData ?? []) as Array<CourseLesson & { summary: string; plan: string; trap: string; mistakes: string }>;
      if (lessonList.length === 0) { setLessons([]); setLoading(false); return; }

      const lessonIds = lessonList.map(l => l.id);
      const { data: linesData } = await supabase
        .from('lesson_lines')
        .select('lesson_id, moves, start_fen')
        .in('lesson_id', lessonIds)
        .order('line_order', { ascending: true });

      // First line per lesson
      const lineMap: Record<string, { moves: CourseLessonMove[]; startFen: string }> = {};
      for (const line of (linesData ?? []) as Array<LessonLine>) {
        if (!lineMap[line.lesson_id]) {
          lineMap[line.lesson_id] = {
            moves: Array.isArray(line.moves) ? line.moves : [],
            startFen: line.start_fen ?? INITIAL_FEN,
          };
        }
      }

      const summaries: LessonSummary[] = lessonList.map(l => {
        const lineData = lineMap[l.id];
        const keyFen = lineData ? getKeyFen(lineData.moves, lineData.startFen) : null;
        return {
          id: l.id,
          title: l.title,
          summary: l.summary ?? '',
          plan: l.plan ?? '',
          trap: l.trap ?? '',
          mistakes: l.mistakes ?? '',
          keyFen,
        };
      });

      setLessons(summaries);
      setLoading(false);
    }
    load();
  }, [courseId]);

  if (loading) {
    return (
      <div className="page">
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="page">
        <Link href={`/courses/${courseId}`} className="page-back">← Курс</Link>
        <p style={{ color: 'var(--muted)' }}>Курс не найден.</p>
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .sheet { background: white !important; color: black !important; border-color: #ccc !important; }
          a { color: black !important; }
        }
      `}</style>

      <div className="page">
        {/* Header (no-print) */}
        <div className="no-print page-head">
          <div className="page-head-text">
            <Link href={`/courses/${courseId}`} className="page-back">← {course.name}</Link>
            <h1 className="page-title">Шпаргалка</h1>
          </div>
          <button onClick={() => window.print()} className="ui-btn ui-btn-outline">
            Печать / PDF
          </button>
        </div>

        {/* Course title */}
        <div className="sheet ui-card">
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ivory)' }}>
            {course.name}
          </h2>
          {course.description && (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>{course.description}</p>
          )}
        </div>

        {/* Lessons */}
        {lessons.map((lesson, idx) => {
          const ideaLine  = firstLine(lesson.summary);
          const planItems = listLines(lesson.plan);
          const trapLine  = firstLine(lesson.trap);
          const mistakeItems = listLines(lesson.mistakes);

          return (
            <div key={lesson.id} className="sheet" style={{ padding: '18px 20px', border: '1px solid var(--hairline)', background: 'var(--surface)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Mini board */}
              {lesson.keyFen && (
                <div className="no-print" style={{ flexShrink: 0 }}>
                  <MiniBoard fen={lesson.keyFen} boardTheme={boardTheme} customPieces={customPieces} />
                </div>
              )}

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
                    {lesson.title}
                  </h2>
                </div>

                {ideaLine && (
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Идея</div>
                    <div style={{ fontSize: 14, color: 'var(--ivory)', lineHeight: 1.5 }}>{ideaLine}</div>
                  </div>
                )}

                {planItems.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>План</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {planItems.map((p, i) => (
                        <li key={i} style={{ fontSize: 13, color: 'var(--ivory)', lineHeight: 1.5 }}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {(trapLine || mistakeItems.length > 0) && (
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    {trapLine && (
                      <div>
                        <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(220,80,60,0.9)', textTransform: 'uppercase', marginBottom: 2 }}>Ловушка</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{trapLine}</div>
                      </div>
                    )}
                    {mistakeItems.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(220,160,40,0.9)', textTransform: 'uppercase', marginBottom: 2 }}>Ошибки</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {mistakeItems.map((m, i) => (
                            <li key={i} style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
