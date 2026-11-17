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
  // Split on [Event "..."] header lines that start new games
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

// ── Main page ─────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    loadGames();
  }, []);

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
      const count = splitPgn(val).length;
      setPreview(count);
    }, 300);
  }

  async function handleImport() {
    if (!pgn.trim()) return;
    const gamePgns = splitPgn(pgn);
    if (gamePgns.length === 0) {
      setImportMsg({ ok: false, text: 'Партии не найдены — проверь PGN.' });
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
      tags:   [],
    })).filter(r => ['1-0','0-1','1/2-1/2','*'].includes(r.result));

    const { error } = await supabase.from('master_games').insert(rows);
    setImporting(false);
    if (error) {
      setImportMsg({ ok: false, text: 'Ошибка при сохранении: ' + error.message });
    } else {
      setImportMsg({ ok: true, text: `Добавлено ${rows.length} ${plural(rows.length, 'партия','партии','партий')}` });
      setPgn('');
      setPreview(null);
      setShowImport(false);
      loadGames();
    }
  }

  function plural(n: number, one: string, few: string, many: string) {
    const m100 = n % 100, m10 = n % 10;
    if (m100 >= 11 && m100 <= 19) return `${n} ${many}`;
    if (m10 === 1) return `${n} ${one}`;
    if (m10 >= 2 && m10 <= 4) return `${n} ${few}`;
    return `${n} ${many}`;
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

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
            06 · Мастера
          </div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ivory)' }}>
            Библиотека партий
          </h1>
        </div>
        <button
          onClick={() => setShowImport(v => !v)}
          style={{
            height: 38, padding: '0 18px', borderRadius: 'var(--radius-btn)',
            background: showImport ? 'var(--surface)' : 'var(--accent)',
            color: '#fff', border: showImport ? '1px solid var(--hairline)' : 'none',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showImport ? 'Отмена' : '+ Импорт PGN'}
        </button>
      </div>

      {/* Import panel */}
      {showImport && (
        <div style={{
          marginBottom: 28, padding: 24,
          background: 'var(--surface)', border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-card)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
            Вставь PGN с одной или несколькими партиями мастеров. Поддерживаются теги White, Black, Event, Date, Result.
          </div>
          <textarea
            value={pgn}
            onChange={e => handlePgnChange(e.target.value)}
            rows={10}
            placeholder={'[Event "World Championship"]\n[White "Kasparov, G."]\n[Black "Karpov, A."]\n[Date "1986.??.??"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg)', border: '1px solid var(--hairline)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 13, fontFamily: 'monospace', color: 'var(--ivory)',
              resize: 'vertical', outline: 'none',
            }}
          />
          {preview !== null && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
              {preview > 0 ? `Найдено ${preview} ${plural(preview,'партия','партии','партий')}` : 'Партии не распознаны — проверь формат.'}
            </div>
          )}
          {importMsg && (
            <div style={{
              marginTop: 10, padding: '8px 14px',
              background: importMsg.ok ? 'rgba(129,182,76,0.1)' : 'rgba(200,80,80,0.1)',
              border: `1px solid ${importMsg.ok ? 'rgba(129,182,76,0.3)' : 'rgba(200,80,80,0.3)'}`,
              borderRadius: 8, fontSize: 13, color: 'var(--ivory)',
            }}>
              {importMsg.text}
            </div>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button
              onClick={handleImport}
              disabled={importing || !pgn.trim()}
              style={{
                height: 38, padding: '0 20px', borderRadius: 'var(--radius-btn)',
                background: 'var(--accent)', color: '#fff', border: 'none',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? 'Сохранение…' : 'Добавить партии'}
            </button>
            <button
              onClick={() => { setPgn(''); setImportMsg(null); setPreview(null); }}
              style={{
                height: 38, padding: '0 16px', borderRadius: 'var(--radius-btn)',
                background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--hairline)', fontSize: 14, cursor: 'pointer',
              }}
            >
              Очистить
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
          aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по игроку или турниру…"
          style={{
            width: '100%', boxSizing: 'border-box',
            height: 40, paddingLeft: 36, paddingRight: 14,
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-btn)', fontSize: 14, color: 'var(--ivory)',
            outline: 'none',
          }}
        />
      </div>

      {/* Games list */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: '48px 0', textAlign: 'center',
          border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>♟</div>
          <div style={{ fontSize: 15, color: 'var(--ivory)', marginBottom: 6 }}>
            {games.length === 0 ? 'Партий пока нет' : 'Ничего не найдено'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {games.length === 0 ? 'Нажми «Импорт PGN», чтобы добавить первые партии мастеров.' : 'Попробуй другой запрос.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 160px 60px 90px',
            padding: '8px 16px',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--muted)', borderBottom: '1px solid var(--hairline)',
          }}>
            <span>Белые</span>
            <span>Чёрные</span>
            <span>Турнир</span>
            <span>Год</span>
            <span>Итог</span>
          </div>

          {filtered.map(g => (
            <Link
              key={g.id}
              href={`/masters/${g.id}`}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 160px 60px 90px',
                padding: '12px 16px', textDecoration: 'none',
                color: 'var(--ivory)', fontSize: 14,
                borderBottom: '1px solid var(--hairline)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.white}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.black}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 13 }}>{g.event || '—'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{g.year ?? '—'}</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: g.result === '1-0' ? '#81B64C' : g.result === '0-1' ? '#E06060' : 'var(--muted)' }}>
                {g.result}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
          {plural(filtered.length,'партия','партии','партий')} · {plural(games.length,'партия','партии','партий')} всего
        </div>
      )}

      {/* Mobile style */}
      <style>{`
        @media (max-width: 600px) {
          .masters-row { grid-template-columns: 1fr 1fr 60px !important; }
        }
      `}</style>
    </main>
  );
}
