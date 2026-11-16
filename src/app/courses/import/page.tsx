'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseCourse, type ParsedCourse } from '@/lib/course-parser';
import { supabase } from '@/lib/supabase';

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};

const MD_TEMPLATE = `---
name: Шотландский гамбит
color: white
opening: scotch
difficulty: 2
description: Агрессивный дебют за белых
---

# Урок 1: Захват центра

## Линия

1. e4 {Захватываем центр →e2-e4} 1... e5 {Чёрные отвечают} 2. Nf3 {Развиваем коня} 2... Nc6 3. d4 {Шотландская атака →d2-d4}

## Итог

После 3.d4 у белых активная игра.

## План

- Разменять на d4

## Ошибки

- 3.d3 уравнивает игру

## Ловушка

**Ловушка:** 5...Qf6?? 6.Qd5! — двойной удар

## Задачи

### Задача 1

FEN: r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3

Вопрос: Как чёрные должны ответить?

Ответ: 3...exd4 принимая вызов.
`;

function ColorBadge({ color }: { color: 'white' | 'black' | 'both' }) {
  const labels = { white: 'Белые', black: 'Чёрные', both: 'Оба' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', border: '1px solid var(--control)',
      fontSize: 12, color: 'var(--muted)', borderRadius: 999,
    }}>
      {labels[color]}
    </span>
  );
}

function DifficultyDots({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{
          display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
          background: i < value ? 'var(--ivory)' : 'var(--track)',
        }} />
      ))}
    </div>
  );
}

export default function ImportCoursePage() {
  const router = useRouter();
  const [mdText, setMdText] = useState('');
  const [parsed, setParsed] = useState<ParsedCourse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  function handleParse() {
    setParseError(null);
    setParsed(null);
    setSaveError(null);
    if (!mdText.trim()) {
      setParseError('Вставьте текст курса в формате Markdown');
      return;
    }
    try {
      const result = parseCourse(mdText);
      setParsed(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Ошибка разбора файла');
    }
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setSaveError(null);

    // Check slug conflict
    const { data: existing } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', parsed.meta.slug)
      .maybeSingle();

    if (existing) {
      setSaveError(`Курс со slug «${parsed.meta.slug}» уже существует. Измените название или добавьте поле slug: в frontmatter.`);
      setSaving(false);
      return;
    }

    // Insert course
    const { data: courseRow, error: courseErr } = await supabase
      .from('courses')
      .insert(parsed.meta)
      .select('id')
      .single();

    if (courseErr || !courseRow) {
      setSaveError(courseErr?.message ?? 'Не удалось сохранить курс');
      setSaving(false);
      return;
    }

    const courseId: string = courseRow.id;

    // Insert lessons + lines + questions
    for (const lesson of parsed.lessons) {
      const { data: lessonRow, error: lessonErr } = await supabase
        .from('course_lessons')
        .insert({
          course_id: courseId,
          lesson_order: lesson.order,
          title: lesson.title,
          summary: lesson.summary,
          plan: lesson.plan,
          mistakes: lesson.mistakes,
          trap: lesson.trap,
        })
        .select('id')
        .single();

      if (lessonErr || !lessonRow) {
        setSaveError(lessonErr?.message ?? 'Не удалось сохранить урок');
        setSaving(false);
        return;
      }

      const lessonId: string = lessonRow.id;

      if (lesson.moves.length > 0) {
        await supabase.from('lesson_lines').insert({
          lesson_id: lessonId,
          line_order: 0,
          moves: lesson.moves,
        });
      }

      if (lesson.questions.length > 0) {
        await supabase.from('lesson_questions').insert(
          lesson.questions.map(q => ({
            lesson_id: lessonId,
            question_order: q.order,
            fen: q.fen,
            question: q.question,
            answer: q.answer,
          }))
        );
      }
    }

    setSaving(false);
    router.push(`/courses/${courseId}`);
  }

  return (
    <main style={{
      maxWidth: 860, margin: '0 auto',
      padding: '40px 48px 72px',
      display: 'flex', flexDirection: 'column', gap: 32,
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link
          href="/courses"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--muted)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Курсы
        </Link>
        <h1 style={{ ...HEADING, margin: 0, fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Импорт курса
        </h1>
      </div>

      {/* Format hint */}
      <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
        <button
          onClick={() => setHintOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '14px 20px', background: 'transparent',
            border: 'none', color: 'var(--ivory)', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
          }}
        >
          <span>Формат файла</span>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
            style={{ transform: hintOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {hintOpen && (
          <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--hairline)' }}>
            <pre style={{
              margin: 0, padding: 16, background: 'var(--bg)',
              fontSize: 12, lineHeight: 1.6,
              color: 'var(--muted)', overflowX: 'auto',
              fontFamily: 'monospace',
            }}>
              {MD_TEMPLATE}
            </pre>
          </div>
        )}
      </div>

      {/* Textarea */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
          MARKDOWN-ТЕКСТ КУРСА
        </label>
        <textarea
          value={mdText}
          onChange={e => setMdText(e.target.value)}
          placeholder="Вставьте текст курса в формате Markdown…"
          rows={16}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: 16, background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            color: 'var(--ivory)', fontSize: 13,
            fontFamily: 'monospace', lineHeight: 1.6,
            resize: 'vertical', outline: 'none',
          }}
        />
        {parseError && (
          <p style={{ margin: 0, fontSize: 13, color: '#E06060' }}>{parseError}</p>
        )}
      </div>

      {/* Parse button */}
      <div>
        <button
          onClick={handleParse}
          style={{
            height: 48, padding: '0 32px',
            background: 'var(--ivory)', color: 'var(--ink)',
            border: 'none', fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Разобрать
        </button>
      </div>

      {/* Preview */}
      {parsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderTop: '2px solid var(--ivory)', paddingTop: 20 }}>
            <h2 style={{ ...HEADING, margin: '0 0 16px', fontSize: 24, fontWeight: 700 }}>
              Предпросмотр
            </h2>

            {/* Course meta */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: 20, border: '1px solid var(--hairline)', background: 'var(--surface)',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ ...HEADING, fontSize: 20, fontWeight: 700 }}>{parsed.meta.name}</span>
                <ColorBadge color={parsed.meta.color} />
                <DifficultyDots value={parsed.meta.difficulty} />
              </div>
              {parsed.meta.opening && (
                <span style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {parsed.meta.opening}
                </span>
              )}
              {parsed.meta.description && (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{parsed.meta.description}</p>
              )}
              <span style={{ fontSize: 12, color: 'var(--control)' }}>slug: {parsed.meta.slug}</span>
            </div>

            {/* Lessons list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {parsed.lessons.map((lesson, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '12px 16px',
                  border: '1px solid var(--hairline)', background: 'var(--surface)',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 20 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{lesson.title}</span>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                    <span>{lesson.moves.length} ходов</span>
                    {lesson.questions.length > 0 && <span>{lesson.questions.length} задач</span>}
                  </div>
                </div>
              ))}
              {parsed.lessons.length === 0 && (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Уроки не найдены</p>
              )}
            </div>
          </div>

          {saveError && (
            <p style={{ margin: 0, fontSize: 13, color: '#E06060', padding: '12px 16px', border: '1px solid #503030', background: '#1A0D0D' }}>
              {saveError}
            </p>
          )}

          <div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                height: 48, padding: '0 32px',
                background: saving ? 'var(--track)' : 'var(--ivory)',
                color: saving ? 'var(--muted)' : 'var(--ink)',
                border: 'none', fontSize: 15, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Сохранение…' : 'Сохранить в базу'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
