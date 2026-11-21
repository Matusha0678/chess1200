'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { NAV, type NavSection } from '@/lib/nav';
import { useBoardTheme } from '@/contexts/BoardThemeContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id:    string;
  label: string;
  sub?:  string;
  href:  string;
  icon:  string;
  group: 'page' | 'action' | 'opening' | 'course' | 'lesson';
}

// ── Static data ───────────────────────────────────────────────────────────────

const PAGES: SearchResult[] = (NAV as NavSection[]).flatMap(s => [
  { id: s.href, label: s.label, href: s.href, icon: s.num, group: 'page' as const },
  ...(s.children ?? []).map(c => ({
    id: c.href, label: c.label, href: c.href, icon: '—', group: 'page' as const,
  })),
]);

const ACTIONS: SearchResult[] = [
  { id: 'act-opening',  label: 'Добавить дебют',         sub: 'Создать новый дебют',               href: '/openings/new',    icon: '+',  group: 'action' },
  { id: 'act-random',   label: 'Случайная игра',         sub: 'Сыграть с любым ходом',             href: '/random',          icon: '⚡', group: 'action' },
  { id: 'act-analyze',  label: 'Анализ позиции',         sub: 'Загрузить PGN для анализа',         href: '/games/analyze',   icon: '🔍', group: 'action' },
  { id: 'act-bot',      label: 'Играть против бота',     sub: 'Выбрать режим и уровень',           href: '/play',            icon: '🤖', group: 'action' },
  { id: 'act-sync',     label: 'Синхронизировать партии', sub: 'Загрузить партии с Lichess',       href: '/games',           icon: '↻',  group: 'action' },
  { id: 'act-eval',     label: 'Оцени позицию',          sub: 'Угадай оценку движка',              href: '/evaluate',        icon: '⚖', group: 'action' },
  { id: 'act-warmup',   label: 'Разминка 5 минут',       sub: 'Угрозы, линия, ловушка, ошибка',    href: '/warmup',          icon: '🔥', group: 'action' },
  { id: 'act-review',   label: 'Повторить всё',          sub: 'Все линии на повторение',           href: '/openings/review', icon: '↻',  group: 'action' },
  { id: 'act-opr',      label: 'Дебют Рандом',           sub: 'Stockfish против твоих линий',      href: '/openings/random', icon: '🎲', group: 'action' },
  { id: 'act-courses',  label: 'Мои заметки',            sub: 'Заметки «не понял» по урокам',      href: '/courses/notes',   icon: '📝', group: 'action' },
  { id: 'act-import',   label: 'Импорт курса',           sub: 'Создать курс из PGN',               href: '/courses/import',  icon: '⬆', group: 'action' },
  { id: 'act-ach',      label: 'Достижения',             sub: 'Твой прогресс и значки',           href: '/achievements',    icon: '🏆', group: 'action' },
  { id: 'act-gameop',   label: 'Я против дебютов',       sub: 'Партии vs сохранённые линии',       href: '/games/openings',  icon: '♟', group: 'action' },
];

const GROUP_LABELS: Record<string, string> = {
  page:    'Страницы',
  action:  'Действия',
  opening: 'Дебюты',
  course:  'Курсы',
  lesson:  'Уроки',
};

// ── Inner dialog (renders when open) ─────────────────────────────────────────

function SearchInner({ onClose }: { onClose: () => void }) {
  const router  = useRouter();
  const { siteThemeId } = useBoardTheme();
  const isSoft  = siteThemeId.startsWith('soft');

  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState<SearchResult[]>([...PAGES, ...ACTIONS]);
  const [selIdx,     setSelIdx]     = useState(0);
  const [loading,    setLoading]    = useState(false);

  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef    = useRef<HTMLDivElement>(null);

  // Auto-focus input
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);

  // Reset selection on new results
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelIdx(0); }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selIdx]);

  // Build results when query changes
  useEffect(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([...PAGES, ...ACTIONS]);
      setLoading(false);
      return;
    }

    const staticRes = [
      ...PAGES.filter(r => r.label.toLowerCase().includes(q)),
      ...ACTIONS.filter(r => r.label.toLowerCase().includes(q) || (r.sub ?? '').toLowerCase().includes(q)),
    ];
    setResults(staticRes);
    setLoading(true);

    if (debounceId.current) clearTimeout(debounceId.current);
    debounceId.current = setTimeout(async () => {
      const [openRes, courseRes, lessonRes] = await Promise.all([
        supabase.from('openings').select('id, name, color').ilike('name', `%${q}%`).limit(6),
        supabase.from('courses').select('id, name').ilike('name', `%${q}%`).limit(5),
        supabase.from('course_lessons').select('id, title, course_id').ilike('title', `%${q}%`).limit(5),
      ]);

      const openings: SearchResult[] = (openRes.data ?? []).map((o: { id: string; name: string; color: string }) => ({
        id:    o.id,
        label: o.name,
        sub:   o.color === 'white' ? 'Белые' : o.color === 'black' ? 'Чёрные' : 'Оба цвета',
        href:  `/openings/${o.id}`,
        icon:  '♟',
        group: 'opening' as const,
      }));

      const courses: SearchResult[] = (courseRes.data ?? []).map((c: { id: string; name: string }) => ({
        id:    c.id,
        label: c.name,
        href:  `/courses/${c.id}`,
        icon:  '📖',
        group: 'course' as const,
      }));

      const lessons: SearchResult[] = (lessonRes.data ?? []).map((l: { id: string; title: string; course_id: string }) => ({
        id:    l.id,
        label: l.title,
        href:  `/courses/${l.course_id}/${l.id}`,
        icon:  '—',
        group: 'lesson' as const,
      }));

      setResults([...staticRes, ...openings, ...courses, ...lessons]);
      setLoading(false);
    }, 220);
  }, [query]);

  // Keyboard handler on the input
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selIdx];
      if (r) { router.push(r.href); onClose(); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  // Group results for rendering, tracking flat index
  const groups: { group: string; items: (SearchResult & { flatIdx: number })[] }[] = [];
  let flatIdx = 0;
  for (const r of results) {
    let g = groups.find(x => x.group === r.group);
    if (!g) { g = { group: r.group, items: [] }; groups.push(g); }
    g.items.push({ ...r, flatIdx: flatIdx++ });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Поиск"
        style={{
          position: 'fixed',
          top: isSoft ? '10%' : '14%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 51,
          width: 'min(640px, calc(100vw - 32px))',
          maxHeight: '72vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-card)',
          boxShadow: isSoft ? '0 24px 80px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px',
          borderBottom: '1px solid var(--hairline)',
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Поиск дебютов, курсов, страниц…"
            className="search-input"
            style={{
              flex: 1, height: 52, background: 'transparent',
              border: 'none', outline: 'none',
              fontSize: 16, color: 'var(--ivory)',
              fontFamily: 'inherit',
            }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Поиск"
          />
          {loading && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>…</span>}
          <kbd style={{
            fontSize: 11, color: 'var(--muted)', flexShrink: 0,
            border: '1px solid var(--hairline)',
            borderRadius: 'max(3px, calc(var(--radius-card) - 8px))',
            padding: '2px 7px', fontFamily: 'monospace',
          }}>Esc</kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {groups.length === 0 && !loading && (
            <div style={{ padding: '28px 20px', fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
              Ничего не найдено
            </div>
          )}

          {groups.map(({ group, items }) => (
            <div key={group}>
              <div style={{
                padding: '10px 16px 3px',
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--muted)',
              }}>
                {GROUP_LABELS[group] ?? group}
              </div>

              {items.map(item => {
                const isSel = item.flatIdx === selIdx;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={onClose}
                    data-selected={isSel || undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 16px',
                      textDecoration: 'none',
                      color: 'var(--ivory)',
                      background: isSel ? 'var(--bg)' : 'transparent',
                    }}
                    onMouseEnter={() => setSelIdx(item.flatIdx)}
                  >
                    <span style={{
                      width: 30, height: 30, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--bg)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 'max(4px, calc(var(--radius-card) - 6px))',
                      fontSize: 12, fontWeight: 700,
                      color: 'var(--muted)',
                    }}>
                      {item.icon}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: isSel ? 600 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.label}
                      </div>
                      {item.sub && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                          {item.sub}
                        </div>
                      )}
                    </div>

                    {isSel && (
                      <kbd style={{
                        fontSize: 10, color: 'var(--muted)', flexShrink: 0,
                        border: '1px solid var(--hairline)',
                        borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace',
                      }}>↵</kbd>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--hairline)',
          padding: '7px 16px',
          display: 'flex', gap: 16, flexShrink: 0,
          fontSize: 11, color: 'var(--muted)',
        }}>
          {(['↑↓ выбрать', '↵ открыть', 'Esc закрыть'] as const).map(hint => (
            <span key={hint}>{hint}</span>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Root component (always rendered, invisible when closed) ───────────────────

export default function SearchDialog() {
  const { isSearchOpen, closeSearch } = useBoardTheme();
  if (!isSearchOpen) return null;
  return <SearchInner onClose={closeSearch} />;
}
