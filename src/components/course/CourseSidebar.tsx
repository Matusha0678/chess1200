'use client';

import { SessionPanel } from '@/components/trainer/SessionPanel';
import { movesWord, type LessonStep, type LessonStepLine } from '@/lib/lesson';

interface LessonMeta {
  id: string;
  lesson_order: number;
  title: string;
  linesCount: number;
  steps: LessonStep[];
}

interface Props {
  courseId: string;
  lessonId: string;
  courseName: string;
  courseColor: 'white' | 'black' | 'both';
  lessons: LessonMeta[];
  lessonProgress: Record<string, { completed: boolean }>;
  lessonTests: Record<string, { score: number; max: number }>;
  confusedCount: number;
  currentStepIdx: number;
  doneSteps: Set<number>;
  onStepClick: (n: number) => void;
}

function CourseKingIcon({ color }: { color: 'white' | 'black' | 'both' }) {
  if (color === 'white') return <span style={{ fontSize: 28 }}>♔</span>;
  if (color === 'black') return <span style={{ fontSize: 28 }}>♚</span>;
  return <span style={{ fontSize: 24 }}>♔♚</span>;
}

function StepKindIcon({ kind, done }: { kind: LessonStep['kind']; done: boolean }) {
  if (done) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81B64C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  // Lucide-like icons as inline SVG
  const iconMap: Record<string, React.ReactNode> = {
    text: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    line: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    ),
    plan: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
    mistakes: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>
      </svg>
    ),
    trap: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
    ),
    quiz: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
      </svg>
    ),
    idea: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
        <path d="M9 18h6"/><path d="M10 22h4"/>
      </svg>
    ),
    summary: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
    ),
  };
  return <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>{iconMap[kind] ?? null}</span>;
}

function stepRightLabel(step: LessonStep, stepIdx: number, currentPly: number, isCurrent: boolean): string | null {
  if (step.kind === 'line') {
    // Find total moves for this line step
    const totalMoves = (step as LessonStepLine & { totalMoves?: number }).totalMoves;
    if (isCurrent && totalMoves !== undefined) return `${currentPly} / ${totalMoves}`;
    return null;
  }
  if (step.kind === 'quiz' || step.kind === 'idea') {
    const items = (step as { items: unknown[] }).items;
    return `${items.length} вопр.`;
  }
  return null;
}

export function CourseSidebar({
  courseId,
  lessonId,
  courseName,
  courseColor,
  lessons,
  lessonProgress,
  lessonTests,
  confusedCount,
  currentStepIdx,
  doneSteps,
  onStepClick,
}: Props) {
  const doneLessonsCount = Object.values(lessonProgress).filter(p => p.completed).length;
  const totalLessons = lessons.length;

  // Test average
  const testVals = Object.values(lessonTests).map(t => t.max > 0 ? Math.round((t.score / t.max) * 100) : 0);
  const testPct = testVals.length > 0 ? Math.round(testVals.reduce((a, b) => a + b, 0) / testVals.length) : null;

  const currentLessonIdx = lessons.findIndex(l => l.id === lessonId);

  const header = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CourseKingIcon color={courseColor} />
        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--ivory)', lineHeight: 1.2 }}>{courseName}</span>
      </div>
      <span style={{ fontSize: 13, color: 'var(--muted)', paddingLeft: 36 }}>Курс · {totalLessons} уроков</span>
    </div>
  );

  const stats = [
    {
      value: `${doneLessonsCount}/${totalLessons}`,
      label: 'уроков',
      color: '#81B64C',
    },
    {
      value: testPct !== null ? `${testPct}%` : '—',
      label: 'тесты',
      color: 'var(--ivory)',
    },
    {
      value: confusedCount,
      label: 'не понял',
      color: confusedCount > 0 ? '#E8A23A' : 'var(--muted)',
      href: '/courses/notes',
    },
  ];

  const listLabel = <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ivory)' }}>Уроки</span>;
  const listRight = (
    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
      {doneLessonsCount} из {totalLessons} пройден{doneLessonsCount !== 1 ? 'о' : ''}
    </span>
  );

  const list = (
    <div data-ui="session-list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {lessons.map((lesson, idx) => {
        const done = lessonProgress[lesson.id]?.completed ?? false;
        const isCurrent = lesson.id === lessonId;
        const status: 'done' | 'current' | 'todo' = done ? 'done' : isCurrent ? 'current' : 'todo';
        const testInfo = lessonTests[lesson.id];

        let subText = '';
        if (done) {
          subText = `${lesson.linesCount} ${lesson.linesCount === 1 ? 'линия' : lesson.linesCount < 5 ? 'линии' : 'линий'}`;
          if (testInfo) subText += ` · тест ${testInfo.score}/${testInfo.max}`;
        } else if (isCurrent) {
          subText = `шаг ${currentStepIdx + 1} из ${lesson.steps.length}`;
        } else {
          subText = `${lesson.linesCount} ${lesson.linesCount === 1 ? 'линия' : lesson.linesCount < 5 ? 'линии' : 'линий'}`;
        }

        return (
          <div key={lesson.id}>
            <div
              data-lesson={idx + 1}
              data-status={status}
              data-ui="lesson-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: isCurrent ? 'rgba(129,182,76,0.08)' : 'transparent',
                border: isCurrent ? '1px solid rgba(129,182,76,0.25)' : '1px solid transparent',
              }}
              onClick={() => {
                if (!isCurrent) {
                  window.location.href = `/courses/${courseId}/${lesson.id}`;
                }
              }}
            >
              {/* Square indicator 28px */}
              <div style={{
                width: 28, height: 28, flexShrink: 0,
                borderRadius: 4,
                background: done ? '#81B64C' : isCurrent ? '#81B64C' : 'var(--track, #2A2A2A)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: done || isCurrent ? '#fff' : 'var(--muted)',
              }}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>

              {/* Title */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: isCurrent ? 600 : 400, color: 'var(--ivory)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lesson.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 1 }}>{subText}</div>
              </div>
            </div>

            {/* Steps for current lesson */}
            {isCurrent && lesson.steps.length > 0 && (
              <div data-ui="lesson-steps" style={{ marginLeft: 20, borderLeft: '2px solid var(--hairline)', paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2, marginBottom: 4 }}>
                {lesson.steps.map((step, si) => {
                  const stepNum = si + 1;
                  const stepDone = doneSteps.has(stepNum);
                  const stepCurrent = si === currentStepIdx;
                  const stepState: 'done' | 'current' | 'todo' = stepDone ? 'done' : stepCurrent ? 'current' : 'todo';

                  // Right label
                  let rightLabel: string | null = null;
                  if (step.kind === 'line') {
                    const lineStep = step as LessonStepLine;
                    const lineTotalMoves = (lesson.steps[lineStep.line] as unknown as { totalMoves?: number })?.totalMoves;
                    if (stepCurrent && lineTotalMoves !== undefined) {
                      rightLabel = `${currentStepIdx} / ${lineTotalMoves}`;
                    } else {
                      // We'll just not show it without totalMoves
                      rightLabel = null;
                    }
                  } else if (step.kind === 'quiz' || step.kind === 'idea') {
                    const items = (step as { items: unknown[] }).items;
                    rightLabel = `${items.length} вопр.`;
                  }

                  return (
                    <div
                      key={si}
                      data-step={stepNum}
                      data-kind={step.kind}
                      data-state={stepState}
                      data-ui="lesson-step"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 8px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: stepCurrent ? 'rgba(129,182,76,0.1)' : 'transparent',
                        borderLeft: stepCurrent ? '2px solid #81B64C' : '2px solid transparent',
                        marginLeft: -2,
                      }}
                      onClick={() => onStepClick(si)}
                    >
                      <StepKindIcon kind={step.kind} done={stepDone} />
                      <span style={{ flex: 1, fontSize: 13, color: stepCurrent ? 'var(--ivory)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.title}
                      </span>
                      {rightLabel && (
                        <span style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {rightLabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const footer = (
    <div style={{ display: 'flex', gap: 8 }}>
      <a
        href={`/courses/${courseId}/roadmap`}
        style={{
          flex: 1, padding: '8px 0', textAlign: 'center',
          fontSize: 13, color: 'var(--ivory)', background: 'var(--track, #2A2A2A)',
          border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)',
          textDecoration: 'none', display: 'block',
        }}
      >
        Карта курса
      </a>
      <a
        href={`/courses/${courseId}/cheatsheet`}
        style={{
          flex: 1, padding: '8px 0', textAlign: 'center',
          fontSize: 13, color: 'var(--ivory)', background: 'var(--track, #2A2A2A)',
          border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn)',
          textDecoration: 'none', display: 'block',
        }}
      >
        Шпаргалка
      </a>
    </div>
  );

  return (
    <SessionPanel
      header={header}
      stats={stats}
      listLabel={listLabel}
      listRight={listRight}
      list={list}
      footer={footer}
    />
  );
}
