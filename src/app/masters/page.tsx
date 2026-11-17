'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MasterGame {
  id: string;
  white: string;
  black: string;
  event: string;
  year: number | null;
  result: string;
  tags: string[];
  created_at: string;
}

// ── PGN helpers ───────────────────────────────────────────────────────────────

function extractTag(pgn: string, tag: string): string {
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return m ? m[1] : '';
}

function extractYear(pgn: string): number | null {
  const d = extractTag(pgn, 'Date');
  const m = d.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function splitPgn(raw: string): string[] {
  const games: string[] = [];
  let current = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('[Event ') && current.trim()) {
      games.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) games.push(current.trim());
  return games.filter(g => g.includes('[White ') && g.includes('[Black '));
}

function plural(n: number, one: string, few: string, many: string) {
  const m100 = n % 100, m10 = n % 10;
  if (m100 >= 11 && m100 <= 19) return `${n} ${many}`;
  if (m10 === 1) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

function resultClass(r: string) {
  if (r === '1-0') return 'result-win';
  if (r === '0-1') return 'result-loss';
  return 'result-draw';
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MastersPage() {
  const [games, setGames]       = useState<MasterGame[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [showImport, setShowImport] = useState(false);

  // Import state
  const [pgn, setPgn]           = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview]   = useState<number | null>(null);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadGames(); }, []);

  async function loadGames() {
    setLoading(true);
    const { data } = await supabase
      .from('master_games')
      .select('id,white,black,event,year,result,tags,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    setGames((data ?? []) as MasterGame[]);
    setLoading(false);
  }

  function handlePgnChange(val: string) {
    setPgn(val);
    setImportMsg(null);
    if (parseTimer.current) clearTimeout(parseTimer.current);
    if (!val.trim()) { setPreview(null); return; }
    parseTimer.current = setTimeout(() => {
      setPreview(splitPgn(val).length);
    }, 300);
  }

  async function handleImport() {
    if (!pgn.trim()) return;
    const gamePgns = splitPgn(pgn);
    if (gamePgns.length === 0) {
      setImportMsg({ ok: false, text: 'Партии не найдены — проверь формат PGN.' });
      return;
    }
    setImporting(true);
    setImportMsg(null);

    const rows = gamePgns.map(g => ({
      white:  extractTag(g, 'White')  || 'Unknown',
      black:  extractTag(g, 'Black')  || 'Unknown',
      event:  extractTag(g, 'Event')  || '',
      year:   extractYear(g),
      result: extractTag(g, 'Result') || '*',
      pgn:    g,
      tags:   [] as string[],
    })).filter(r => ['1-0','0-1','1/2-1/2','*'].includes(r.result));

    const { error } = await supabase.from('master_games').insert(rows);
    setImporting(false);
    if (error) {
      setImportMsg({ ok: false, text: 'Ошибка при сохранении: ' + error.message });
    } else {
      setImportMsg({ ok: true, text: `Добавлено ${plural(rows.length, 'партия', 'партии', 'партий')}` });
      setPgn('');
      setPreview(null);
      setShowImport(false);
      loadGames();
    }
  }

  const filtered = games.filter(g => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      g.white.toLowerCase().includes(q) ||
      g.black.toLowerCase().includes(q) ||
      g.event.toLowerCase().includes(q)
    );
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page-wrap">
      {/* Header */}
      <div className="page-header">
        <div className="ui-eyebrow">
          <span>06 · Мастера</span>
          <span className="ui-eyebrow-line" />
          <span>{games.length > 0 ? plural(games.length, 'партия', 'партии', 'партий') : 'Пусто'}</span>
        </div>
        <div className="page-header-row">
          <h1 className="ui-h1">Библиотека партий</h1>
          <button
            className={showImport ? 'ui-btn ui-btn-outline' : 'ui-btn ui-btn-primary'}
            onClick={() => setShowImport(v => !v)}
          >
            {showImport ? 'Отмена' : '+ Импорт PGN'}
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="ui-card ui-card-lg" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            Вставь PGN с одной или несколькими партиями. Распознаются теги <code>White</code>, <code>Black</code>, <code>Event</code>, <code>Date</code>, <code>Result</code>.
          </div>
          <textarea
            className="ui-textarea"
            value={pgn}
            onChange={e => handlePgnChange(e.target.value)}
            rows={10}
            placeholder={'[Event "World Championship"]\n[White "Kasparov, G."]\n[Black "Karpov, A."]\n[Date "1986.??.??"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
          />
          {preview !== null && (
            <div style={{ fontSize: 13, color: preview > 0 ? 'var(--ivory)' : 'var(--muted)' }}>
              {preview > 0
                ? `Найдено ${plural(preview, 'партия', 'партии', 'партий')}`
                : 'Партии не распознаны — проверь формат.'}
            </div>
          )}
          {importMsg && (
            <div className={`ui-banner ${importMsg.ok ? 'ui-banner-success' : 'ui-banner-danger'}`}
                 style={{ padding: '10px 14px', fontSize: 13 }}>
              {importMsg.text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="ui-btn ui-btn-primary"
              onClick={handleImport}
              disabled={importing || !pgn.trim()}
            >
              {importing ? 'Сохранение…' : 'Добавить партии'}
            </button>
            <button
              className="ui-btn ui-btn-outline"
              onClick={() => { setPgn(''); setImportMsg(null); setPreview(null); }}
            >
              Очистить
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="ui-search-wrap">
        <svg className="ui-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          className="ui-search"
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по игроку или турниру…"
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="ui-card ui-card-lg" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>♟</div>
          <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 8 }}>
            {games.length === 0 ? 'Партий пока нет' : 'Ничего не найдено'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {games.length === 0
              ? 'Нажми «Импорт PGN», чтобы добавить первые партии мастеров.'
              : 'Попробуй другой запрос.'}
          </div>
        </div>
      ) : (
        <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="master-row-head">
            <span>Белые</span>
            <span>Чёрные</span>
            <span>Турнир</span>
            <span>Год</span>
            <span>Итог</span>
          </div>
          {filtered.map(g => (
            <Link key={g.id} href={`/masters/${g.id}`} className="master-row">
              <span>{g.white}</span>
              <span>{g.black}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{g.event || '—'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{g.year ?? '—'}</span>
              <span className={resultClass(g.result)} style={{ fontSize: 13 }}>{g.result}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Count footer */}
      {!loading && filtered.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {plural(filtered.length, 'партия', 'партии', 'партий')}
          {search && games.length !== filtered.length && <> · из {plural(games.length, 'партии', 'партий', 'партий')} всего</>}
        </div>
      )}
    </main>
  );
}
