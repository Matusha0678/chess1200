'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
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

interface GameRow {
  white: string;
  black: string;
  event: string;
  year: number | null;
  result: string;
  pgn: string;
  pgn_hash: string;
  tags: string[];
}

interface FileProgress {
  done: number;
  total: number;
  saved: number;
  skippedDup: number;
  broken: number;
  startedAt: number;
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

async function sha256Hex(s: string): Promise<string> {
  const buf  = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate + build a row. Returns null if the game is broken.
async function buildGameRow(pgn: string): Promise<GameRow | null> {
  try {
    const trimmed = pgn.trim();
    const chess = new Chess();
    chess.loadPgn(trimmed);
    if (chess.history().length === 0) return null;
    const result = extractTag(trimmed, 'Result') || '*';
    if (!['1-0','0-1','1/2-1/2','*'].includes(result)) return null;
    return {
      white:    extractTag(trimmed, 'White') || 'Unknown',
      black:    extractTag(trimmed, 'Black') || 'Unknown',
      event:    extractTag(trimmed, 'Event') || '',
      year:     extractYear(trimmed),
      result,
      pgn:      trimmed,
      pgn_hash: await sha256Hex(trimmed),
      tags:     [],
    };
  } catch { return null; }
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

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} сек`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h} ч ${mm} мин` : `${h} ч`;
}

const FILE_LIMIT = 20 * 1024 * 1024;
const BATCH      = 100;

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MastersPage() {
  const [games, setGames]       = useState<MasterGame[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [showImport, setShowImport] = useState(false);

  // Text import
  const [pgn, setPgn]           = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview]   = useState<number | null>(null);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // File import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileImporting, setFileImporting] = useState(false);
  const [fileProgress, setFileProgress]   = useState<FileProgress | null>(null);
  const [fileStopPressed, setFileStopPressed] = useState(false);
  const fileStopRef = useRef(false);

  useEffect(() => { loadGames(); }, []);

  async function loadGames() {
    setLoading(true);
    const { data } = await supabase
      .from('master_games')
      .select('id,white,black,event,year,result,tags,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    setGames((data ?? []) as MasterGame[]);
    setLoading(false);
  }

  // ── Text import ───────────────────────────────────────────────────────────

  function handlePgnChange(val: string) {
    setPgn(val);
    setImportMsg(null);
    if (parseTimer.current) clearTimeout(parseTimer.current);
    if (!val.trim()) { setPreview(null); return; }
    parseTimer.current = setTimeout(() => {
      setPreview(splitPgn(val).length);
    }, 300);
  }

  async function handleTextImport() {
    if (!pgn.trim()) return;
    const gamePgns = splitPgn(pgn);
    if (gamePgns.length === 0) {
      setImportMsg({ ok: false, text: 'Партии не найдены — проверь формат PGN.' });
      return;
    }
    setImporting(true);
    setImportMsg(null);

    const rows: GameRow[] = [];
    let broken = 0;
    for (const g of gamePgns) {
      const row = await buildGameRow(g);
      if (row) rows.push(row); else broken++;
    }
    // dedupe within batch by hash
    const seen = new Set<string>();
    const unique = rows.filter(r => seen.has(r.pgn_hash) ? false : (seen.add(r.pgn_hash), true));

    const { data, error } = await supabase.from('master_games').upsert(unique, {
      onConflict: 'pgn_hash', ignoreDuplicates: true,
    }).select('id');

    setImporting(false);
    if (error) {
      setImportMsg({ ok: false, text: 'Ошибка при сохранении: ' + error.message });
    } else {
      const inserted = data?.length ?? 0;
      const dupSkip  = unique.length - inserted + (rows.length - unique.length);
      const parts: string[] = [`Добавлено ${plural(inserted, 'партия', 'партии', 'партий')}`];
      if (dupSkip > 0) parts.push(`дублей пропущено: ${dupSkip}`);
      if (broken > 0)  parts.push(`битых: ${broken}`);
      setImportMsg({ ok: true, text: parts.join(' · ') });
      setPgn(''); setPreview(null);
      loadGames();
    }
  }

  // ── File import ───────────────────────────────────────────────────────────

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset to allow re-upload of same file
    if (!file) return;

    if (file.size > FILE_LIMIT) {
      setImportMsg({ ok: false, text: `Файл больше 20 МБ (${(file.size / 1024 / 1024).toFixed(1)} МБ). Разбей на части.` });
      return;
    }

    setImportMsg(null);
    setFileImporting(true);
    setFileStopPressed(false);
    fileStopRef.current = false;

    const text = await file.text();
    const gamePgns = splitPgn(text);

    if (gamePgns.length === 0) {
      setFileImporting(false);
      setImportMsg({ ok: false, text: 'В файле не найдено партий. Проверь формат.' });
      return;
    }

    const startedAt = Date.now();
    const total = gamePgns.length;
    let done = 0, saved = 0, skippedDup = 0, broken = 0;
    setFileProgress({ done, total, saved, skippedDup, broken, startedAt });

    for (let i = 0; i < gamePgns.length; i += BATCH) {
      if (fileStopRef.current) break;
      const slice = gamePgns.slice(i, i + BATCH);

      const rows: GameRow[] = [];
      for (const g of slice) {
        const row = await buildGameRow(g);
        if (row) rows.push(row); else broken++;
      }

      // Dedupe within the batch
      const seen = new Set<string>();
      const unique = rows.filter(r => seen.has(r.pgn_hash) ? false : (seen.add(r.pgn_hash), true));
      const dupsInBatch = rows.length - unique.length;

      let insertedCount = 0;
      if (unique.length > 0) {
        const { data, error } = await supabase.from('master_games').upsert(unique, {
          onConflict: 'pgn_hash', ignoreDuplicates: true,
        }).select('id');
        if (error) {
          setFileImporting(false);
          setImportMsg({ ok: false, text: 'Ошибка при сохранении: ' + error.message });
          return;
        }
        insertedCount = data?.length ?? 0;
      }
      saved      += insertedCount;
      skippedDup += (unique.length - insertedCount) + dupsInBatch;
      done       += slice.length;
      setFileProgress({ done, total, saved, skippedDup, broken, startedAt });

      // Yield to the browser so UI stays responsive
      await new Promise(r => setTimeout(r, 0));
    }

    setFileImporting(false);

    const parts: string[] = [`Добавлено ${plural(saved, 'партия', 'партии', 'партий')}`];
    if (skippedDup > 0)       parts.push(`дублей: ${skippedDup}`);
    if (broken > 0)           parts.push(`битых: ${broken}`);
    if (fileStopRef.current)  parts.push('остановлено');
    setImportMsg({ ok: true, text: parts.join(' · ') });

    loadGames();
  }

  function stopFileImport() {
    fileStopRef.current = true;
    setFileStopPressed(true);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = games.filter(g => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      g.white.toLowerCase().includes(q) ||
      g.black.toLowerCase().includes(q) ||
      g.event.toLowerCase().includes(q)
    );
  });

  const eta: number | null = (() => {
    if (!fileProgress || !fileImporting || fileProgress.done === 0) return null;
    const elapsed = (Date.now() - fileProgress.startedAt) / 1000;
    const perGame = elapsed / fileProgress.done;
    return Math.max(0, perGame * (fileProgress.total - fileProgress.done));
  })();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-wrap">
      {/* Hero banner — masters */}
      <div className="masters-hero">
        <div className="masters-hero-bg" />
        <div className="masters-hero-overlay" />
        <div className="masters-hero-text">
          <div className="masters-hero-kicker">CHESS 1200 · БИБЛИОТЕКА</div>
          <h2 className="masters-hero-title">Партии мастеров</h2>
          <p className="masters-hero-sub">
            Классические образцы — от&nbsp;Ласкера до Карлсена. Разбирай, запоминай, подражай.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="ui-eyebrow">
          <span>06 · Мастера</span>
          <span className="ui-eyebrow-line" />
          <span>{games.length > 0 ? plural(games.length, 'партия', 'партии', 'партий') : 'Пусто'}</span>
        </div>
        <div className="page-header-row">
          <h1 className="ui-h1">Библиотека партий</h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="ui-btn ui-btn-primary"
              onClick={pickFile}
              disabled={fileImporting}
            >
              📂 Загрузить файл .pgn
            </button>
            <button
              className={showImport ? 'ui-btn ui-btn-outline' : 'ui-btn ui-btn-ghost'}
              onClick={() => setShowImport(v => !v)}
            >
              {showImport ? 'Скрыть вставку' : 'Вставить текст'}
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pgn,text/plain"
          onChange={handleFileSelected}
          style={{ display: 'none' }}
        />
      </div>

      {/* File-import progress / summary */}
      {fileProgress && (fileImporting || !importMsg) && (
        <div className="ui-card ui-card-lg" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ivory)' }}>
              Импорт файла{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                {fileProgress.done} / {fileProgress.total}
              </span>
            </div>
            {fileImporting && eta != null && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Осталось: <strong style={{ color: 'var(--ivory)' }}>~{formatEta(eta)}</strong>
              </div>
            )}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{
              width: fileProgress.total > 0 ? `${100 * fileProgress.done / fileProgress.total}%` : '0%',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
            <span>✓ Загружено: <strong style={{ color: 'var(--ivory)' }}>{fileProgress.saved}</strong></span>
            {fileProgress.skippedDup > 0 && <span>⊘ Дубли: <strong style={{ color: 'var(--ivory)' }}>{fileProgress.skippedDup}</strong></span>}
            {fileProgress.broken > 0     && <span>✗ Битые: <strong style={{ color: 'var(--ivory)' }}>{fileProgress.broken}</strong></span>}
          </div>
          {fileImporting && (
            <>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                Держи вкладку открытой — обработка идёт в фоне
              </div>
              <button
                className="ui-btn ui-btn-outline"
                style={{ alignSelf: 'flex-start' }}
                onClick={stopFileImport}
                disabled={fileStopPressed}
              >
                {fileStopPressed ? 'Остановка…' : 'Стоп'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Text import panel */}
      {showImport && (
        <div className="ui-card ui-card-lg" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            Для коротких вставок — одна или несколько партий. Для больших файлов используй «Загрузить файл .pgn».
          </div>
          <textarea
            className="ui-textarea"
            value={pgn}
            onChange={e => handlePgnChange(e.target.value)}
            rows={8}
            placeholder={'[Event "World Championship"]\n[White "Kasparov, G."]\n[Black "Karpov, A."]\n[Date "1986.??.??"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
          />
          {preview !== null && (
            <div style={{ fontSize: 13, color: preview > 0 ? 'var(--ivory)' : 'var(--muted)' }}>
              {preview > 0
                ? `Найдено ${plural(preview, 'партия', 'партии', 'партий')}`
                : 'Партии не распознаны — проверь формат.'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="ui-btn ui-btn-primary" onClick={handleTextImport} disabled={importing || !pgn.trim()}>
              {importing ? 'Сохранение…' : 'Добавить партии'}
            </button>
            <button className="ui-btn ui-btn-outline" onClick={() => { setPgn(''); setImportMsg(null); setPreview(null); }}>
              Очистить
            </button>
          </div>
        </div>
      )}

      {/* Shared import message */}
      {importMsg && !fileImporting && (
        <div className={`ui-banner ${importMsg.ok ? 'ui-banner-success' : 'ui-banner-danger'}`}>
          {importMsg.text}
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
              ? 'Нажми «Загрузить файл .pgn», чтобы добавить первые партии мастеров.'
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
          {search && games.length !== filtered.length && <> · из {games.length} всего</>}
          {games.length >= 500 && <> · показаны последние 500</>}
        </div>
      )}
    </div>
  );
}
