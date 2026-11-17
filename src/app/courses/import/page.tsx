'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseCourse, type ParsedCourse } from '@/lib/course-parser';
import { COURSE_FORMAT_SPEC } from '@/lib/course-format-spec';
import { supabase } from '@/lib/supabase';


const MD_TEMPLATE = `---
title: "Название курса"
slug: kratkoe-nazvanie
color: white
opening: Scotch Game
level: 800-1400
language: ru
description: "Одно-два предложения о курсе."
---

# Урок 1: Название урока

> Цель: одна фраза, чему научится ученик.

Вступление: 2-5 коротких предложений.

## Линия: Главная линия

Что за линия и когда она встречается.

\`\`\`pgn
1. e4 {[%cal Ge2e4] Занимаем центр.} e5 {Чёрные делают то же.}
2. Nf3 {Нападаем на пешку e5.} Nc6 {Конь защищает пешку.}
(2... d6 {Другой ход соперника, в скобках.} 3. d4 {Открываем центр.})
3. d4 {Открываем центр.} exd4 {Чёрные берут пешку.} *
\`\`\`

Итог линии: главная идея и честная оценка позиции.

## План

- Что делать дальше и почему.

## Ошибки

- Типичная ошибка и почему она плохая.

## Проверь себя

\`\`\`quiz
type: choice
question: "Вопрос?"
options:
  A: "Первый вариант"
  B: "Второй вариант"
answer: A
why: "Почему это верно."
\`\`\`

\`\`\`puzzle
fen: r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3
question: "Найди ход чёрных."
answer: exd4
why: "Чёрные берут пешку."
\`\`\`
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

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
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
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  function handleParse() {
    setParseError(null);
    setParsed(null);
    setSaveError(null);
    setErrors([]);
    setWarnings([]);
    if (!mdText.trim()) {
      setParseError('Вставьте текст курса в формате Markdown');
      return;
    }
    try {
      const result = parseCourse(mdText);
      setErrors(result.errors);
      setWarnings(result.warnings);
      setParsed(result.course);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Ошибка разбора файла');
    }
  }

  async function handleCopySpec() {
    try {
      await navigator.clipboard.writeText(COURSE_FORMAT_SPEC);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setParseError('Не удалось скопировать. Выделите текст формата вручную.');
    }
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setSaveError(null);

    const fail = (msg: string) => {
      const hint = /column|schema cache/i.test(msg)
        ? ' Похоже, не выполнена миграция: запустите supabase-courses-v2.sql в Supabase.'
        : '';
      setSaveError(msg + hint);
      setSaving(false);
    };

    // Check slug conflict
    const { data: existing } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', parsed.meta.slug)
      .maybeSingle();

    if (existing) {
      fail(`Курс со slug «${parsed.meta.slug}» уже существует. Измените slug в шапке файла.`);
      return;
    }

    // Insert course
    const { data: courseRow, error: courseErr } = await supabase
      .from('courses')
      .insert(parsed.meta)
      .select('id')
      .single();

    if (courseErr || !courseRow) {
      fail(courseErr?.message ?? 'Не удалось сохранить курс');
      return;
    }

    const courseId: string = courseRow.id;

    // Insert lessons + lines + questions. If anything fails, remove the half-saved course.
    const rollback = async (msg: string) => {
      await supabase.from('courses').delete().eq('id', courseId);
      fail(msg);
    };

    for (const lesson of parsed.lessons) {
      const { data: lessonRow, error: lessonErr } = await supabase
        .from('course_lessons')
        .insert({
          course_id: courseId,
          lesson_order: lesson.order,
          title: lesson.title,
          goal: lesson.goal,
          blocks: lesson.blocks,
          summary: lesson.summary,
          plan: lesson.plan,
          mistakes: lesson.mistakes,
          trap: lesson.trap,
        })
        .select('id')
        .single();

      if (lessonErr || !lessonRow) {
        await rollback(lessonErr?.message ?? 'Не удалось сохранить урок');
        return;
      }

      const lessonId: string = lessonRow.id;

      if (lesson.lines.length > 0) {
        const { error } = await supabase.from('lesson_lines').insert(
          lesson.lines.map((l, i) => ({
            lesson_id: lessonId,
            line_order: i,
            title: l.title,
            intro_md: l.intro_md,
            outro_md: l.outro_md,
            moves: l.moves,
            start_fen: l.start_fen ?? null,
          }))
        );
        if (error) { await rollback(error.message); return; }
      }

      if (lesson.questions.length > 0) {
        const { error } = await supabase.from('lesson_questions').insert(
          lesson.questions.map(q => ({
            lesson_id: lessonId,
            question_order: q.order,
            fen: q.fen,
            question: q.question,
            answer: q.answer,
            why: q.why,
          }))
        );
        if (error) { await rollback(error.message); return; }
      }
    }

    setSaving(false);
    router.push(`/courses/${courseId}`);
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div className="page-head-text">
          <Link href="/courses" className="page-back">← Курсы</Link>
          <h1 className="page-title">Импорт курса</h1>
        </div>
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
            <p style={{ margin: '16px 0 12px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Пример ниже. Чтобы ИИ написал курс, скопируйте полную инструкцию и вставьте её в чат с ИИ.
            </p>
            <button
              onClick={handleCopySpec}
              style={{
                height: 40, padding: '0 20px', marginBottom: 16,
                background: 'transparent', color: 'var(--ivory)',
                border: '1px solid var(--control)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Скопировано' : 'Скопировать инструкцию для ИИ'}
            </button>
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

      {/* Errors and warnings */}
      {errors.length > 0 && (
        <div style={{ padding: '14px 18px', border: '1px solid #503030', background: '#1A0D0D' }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#E06060' }}>
            Курс не принят: {errors.length} {plural(errors.length, 'ошибка', 'ошибки', 'ошибок')}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {errors.map((e, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: '#E06060' }}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Советы</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {warnings.map((w, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {parsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderTop: '2px solid var(--ivory)', paddingTop: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 700 }}>
              Предпросмотр
            </h2>

            {/* Course meta */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: 20, border: '1px solid var(--hairline)', background: 'var(--surface)',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{parsed.meta.name}</span>
                <ColorBadge color={parsed.meta.color} />
                <DifficultyDots value={parsed.meta.difficulty} />
              </div>
              {(parsed.meta.opening || parsed.meta.topic) && (
                <span style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {parsed.meta.topic ?? parsed.meta.opening}
                  {parsed.meta.kind && parsed.meta.kind !== 'opening' && (
                    <span style={{ marginLeft: 8, color: 'var(--control)' }}>{parsed.meta.kind}</span>
                  )}
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
                    <span>{lesson.lines.length} {lesson.lines.length === 1 ? 'линия' : 'линий'}</span>
                    <span>{lesson.lines.reduce((n, l) => n + l.moves.length, 0)} ходов</span>
                    {lesson.blocks.some(b => b.type === 'quiz') && (
                      <span>
                        {lesson.blocks.reduce((n, b) => n + (b.type === 'quiz' ? b.items.length : 0), 0)} вопросов
                      </span>
                    )}
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
    </div>
  );
}
