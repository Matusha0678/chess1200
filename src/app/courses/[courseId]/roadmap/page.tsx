'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Course, CourseLesson, LessonProgress } from '@/types/courses';

interface Props {
  params: Promise<{ courseId: string }>;
}

type NodeStatus = 'done' | 'active' | 'upcoming';

interface LessonNode {
  lesson: CourseLesson;
  status: NodeStatus;
  progress: LessonProgress | null;
  moveCount: number;
}

const C_DONE   = '#5E8C35';
const C_ACTIVE = '#81B64C';

function NodeIcon({ status, index }: { status: NodeStatus; index: number }) {
  if (status === 'done') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  if (status === 'active') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" stroke="none">
        <polygon points="8 5 19 12 8 19 8 5" />
      </svg>
    );
  }
  return <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{index + 1}</span>;
}

function LessonCard({ node, courseId }: { node: LessonNode; courseId: string }) {
  const { lesson, status, moveCount } = node;
  const isDone   = status === 'done';
  const isActive = status === 'active';

  const href = `/courses/${courseId}/${lesson.id}`;
  const practiceHref = `/courses/${courseId}/${lesson.id}/practice`;

  return (
    <div style={{
      background: isActive ? 'rgba(129,182,76,0.07)' : isDone ? 'rgba(94,140,53,0.04)' : 'var(--surface, #0D0D0D)',
      border: `1px solid ${isActive ? 'rgba(129,182,76,0.35)' : isDone ? 'rgba(94,140,53,0.18)' : 'var(--hairline)'}`,
      borderRadius: 'var(--radius-card, 10px)',
      padding: '12px 14px',
      width: '100%',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: isDone ? C_DONE : isActive ? C_ACTIVE : 'var(--muted)',
        marginBottom: 4,
      }}>
        {isDone ? 'Завершён' : isActive ? '— Сейчас' : 'Впереди'}
      </div>

      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: isDone ? 'var(--muted)' : 'var(--ivory)',
        lineHeight: 1.3,
        marginBottom: moveCount > 0 ? 3 : 0,
      }}>
        {lesson.title}
      </div>

      {moveCount > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{moveCount} ходов</div>
      )}

      {isActive && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <Link href={practiceHref} style={{
            flex: 1,
            height: 32,
            background: C_ACTIVE,
            borderRadius: 'var(--radius-btn, 6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            textDecoration: 'none',
          }}>
            Тренировать →
          </Link>
          <Link href={href} style={{
            height: 32,
            padding: '0 10px',
            border: '1px solid rgba(129,182,76,0.35)',
            borderRadius: 'var(--radius-btn, 6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: 'var(--ivory)',
            textDecoration: 'none',
          }}>
            Изучить
          </Link>
        </div>
      )}

      {!isActive && (
        <Link href={href} style={{
          display: 'block',
          position: 'absolute',
          inset: 0,
        }} aria-label={lesson.title} />
      )}
    </div>
  );
}

function MilestoneMarker({ number }: { number: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '6px 0',
      position: 'relative',
      zIndex: 1,
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        padding: '4px 12px',
        border: '1px solid var(--hairline)',
        borderRadius: 20,
        whiteSpace: 'nowrap',
      }}>
        Раздел {number}
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
    </div>
  );
}

export default function RoadmapPage({ params }: Props) {
  const { courseId } = use(params);
  const [course, setCourse] = useState<Course | null>(null);
  const [nodes, setNodes] = useState<LessonNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: courseData } = await supabase.from('courses').select('*').eq('id', courseId).single();
      if (!courseData) { setLoading(false); return; }
      setCourse(courseData as Course);

      const { data: lessonsData } = await supabase
        .from('course_lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('lesson_order', { ascending: true });

      if (!lessonsData || lessonsData.length === 0) { setLoading(false); return; }

      const lessonIds = lessonsData.map(l => l.id);

      const [{ data: progressRows }, { data: lineRows }] = await Promise.all([
        supabase.from('lesson_progress').select('*').in('lesson_id', lessonIds),
        supabase.from('lesson_lines').select('lesson_id, moves').in('lesson_id', lessonIds),
      ]);

      const progressMap = new Map((progressRows ?? []).map(p => [p.lesson_id, p as LessonProgress]));

      const moveCountMap = new Map<string, number>();
      for (const line of lineRows ?? []) {
        const c = Array.isArray(line.moves) ? (line.moves as unknown[]).length : 0;
        if (!moveCountMap.has(line.lesson_id)) moveCountMap.set(line.lesson_id, c);
      }

      let activeAssigned = false;
      const nodeList: LessonNode[] = (lessonsData as CourseLesson[]).map(lesson => {
        const prog = progressMap.get(lesson.id) ?? null;
        const done = prog?.completed === true;
        let status: NodeStatus;
        if (done) {
          status = 'done';
        } else if (!activeAssigned) {
          status = 'active';
          activeAssigned = true;
        } else {
          status = 'upcoming';
        }
        return { lesson, status, progress: prog, moveCount: moveCountMap.get(lesson.id) ?? 0 };
      });

      setNodes(nodeList);
      setLoading(false);
    })();
  }, [courseId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--muted)', fontSize: 15 }}>
        Загрузка…
      </div>
    );
  }
  if (!course) return null;

  const doneCount  = nodes.filter(n => n.status === 'done').length;
  const totalCount = nodes.length;
  const pct        = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const allDone    = doneCount === totalCount && totalCount > 0;

  return (
    <>
      <style>{`
        @keyframes rmap-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(129,182,76,0); }
          50%       { box-shadow: 0 0 0 10px rgba(129,182,76,0.18); }
        }
        .rmap-active-node { animation: rmap-pulse 2.4s ease-in-out infinite; }
        @media (max-width: 540px) {
          .rmap-row          { flex-direction: column !important; align-items: center !important; }
          .rmap-side         { padding: 0 !important; justify-content: center !important; }
          .rmap-vline        { display: none !important; }
          .rmap-circle-wrap  { order: -1; margin-bottom: 10px; }
        }
      `}</style>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px 80px' }}>

        <Link href={`/courses/${courseId}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 28,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          {course.name}
        </Link>

        <div style={{ marginBottom: 44 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 32, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            Дорожная карта
          </h1>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 14 }}>
            {doneCount} из {totalCount} уроков завершено · {pct}%
          </div>
          <div style={{ height: 3, background: 'var(--hairline)', borderRadius: 2, overflow: 'hidden', maxWidth: 300 }}>
            <div style={{ height: '100%', background: C_ACTIVE, width: `${pct}%`, transition: 'width 0.6s ease', borderRadius: 2 }} />
          </div>
        </div>

        {allDone && (
          <div style={{
            marginBottom: 40,
            padding: '18px 24px',
            background: 'rgba(94,140,53,0.1)',
            border: '1px solid rgba(94,140,53,0.3)',
            borderRadius: 'var(--radius-card, 10px)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <span style={{ fontSize: 28 }}>🏆</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C_DONE }}>Курс завершён!</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Все {totalCount} уроков пройдено</div>
            </div>
          </div>
        )}

        {nodes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 15 }}>
            В этом курсе пока нет уроков
          </div>
        )}

        {nodes.length > 0 && (
          <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
            <div
              className="rmap-vline"
              style={{
                position: 'absolute',
                left: '50%',
                top: 24,
                bottom: 24,
                width: 2,
                background: 'var(--hairline)',
                transform: 'translateX(-50%)',
                zIndex: 0,
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {nodes.map((node, i) => {
                const isLeft   = i % 2 === 0;
                const isActive = node.status === 'active';
                const isDone   = node.status === 'done';

                const circleSize   = isActive ? 64 : 52;
                const circleBg     = isDone ? C_DONE : isActive ? C_ACTIVE : 'var(--surface-2, #181818)';
                const circleBorder = isDone ? C_DONE : isActive ? C_ACTIVE : 'var(--hairline)';

                const showMilestone = i > 0 && i % 5 === 0;

                return (
                  <div key={node.lesson.id}>
                    {showMilestone && (
                      <div style={{ padding: '20px 0 24px' }}>
                        <MilestoneMarker number={Math.floor(i / 5) + 1} />
                      </div>
                    )}

                    <div
                      className="rmap-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: 36,
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      <div
                        className="rmap-side"
                        style={{ flex: 1, paddingRight: 20, display: 'flex', justifyContent: 'flex-end' }}
                      >
                        {isLeft ? (
                          <div style={{ width: '100%', maxWidth: 230, position: 'relative' }}>
                            <LessonCard node={node} courseId={courseId} />
                          </div>
                        ) : null}
                      </div>

                      <div
                        className={`rmap-circle-wrap${isActive ? ' rmap-active-node' : ''}`}
                        style={{
                          width: circleSize,
                          height: circleSize,
                          borderRadius: '50%',
                          background: circleBg,
                          border: `2px solid ${circleBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          zIndex: 2,
                          transition: 'transform 0.15s ease',
                        }}
                      >
                        <NodeIcon status={node.status} index={i} />
                      </div>

                      <div
                        className="rmap-side"
                        style={{ flex: 1, paddingLeft: 20, display: 'flex', justifyContent: 'flex-start' }}
                      >
                        {!isLeft ? (
                          <div style={{ width: '100%', maxWidth: 230, position: 'relative' }}>
                            <LessonCard node={node} courseId={courseId} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  border: `2px dashed ${allDone ? C_DONE : 'var(--hairline)'}`,
                  background: allDone ? 'rgba(94,140,53,0.12)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: allDone ? C_DONE : 'var(--muted)',
                }}>
                  {allDone ? '🏆' : '🎯'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
