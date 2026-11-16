'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchArchives, fetchMonthGames, parseGame, computeStats,
  type Game, type SyncState, type GameStats, type WDL,
} from '@/lib/chesscom';

// ── Design tokens (inline, Ivory Dark) ───────────────────────────────────────

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
};
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.16em',
  color: 'var(--muted)', textTransform: 'uppercase',
};
const SECTION_HEAD: React.CSSProperties = {
  borderTop: '2px solid var(--ivory)',
  display: 'flex', alignItems: 'center', gap: 12,
  minHeight: 44,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}

function fmtSince(iso: string | null) {
  if (!iso) return 'никогда';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин. назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч. назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}

function wdlPct(wdl: WDL): number {
  const total = wdl.win + wdl.draw + wdl.loss;
  return total > 0 ? Math.round((wdl.win / total) * 100) : 0;
}

function wdlTotal(wdl: WDL) { return wdl.win + wdl.draw + wdl.loss; }

const TIME_CLASS_RU: Record<string, string> = {
  bullet: 'Пуля', blitz: 'Блиц', rapid: 'Рапид', daily: 'Ежедн.', classical: 'Классика',
};

// ── WDL bar ───────────────────────────────────────────────────────────────────

function WdlBar({ wdl }: { wdl: WDL }) {
  const total = wdlTotal(wdl);
  if (total === 0) return <span style={{ fontSize: 13, color: 'var(--muted)' }}>—</span>;
  const wp = Math.round((wdl.win / total) * 100);
  const dp = Math.round((wdl.draw / total) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: 'var(--ivory)' }}>П {wdl.win}</span>
        <span style={{ color: 'var(--muted)' }}>Н {wdl.draw}</span>
        <span style={{ color: 'var(--control)' }}>Пр {wdl.loss}</span>
        <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{wdlPct(wdl)}%</span>
      </div>
      <div style={{ display: 'flex', height: 2, background: 'var(--track)' }}>
        {wp > 0 && <span style={{ flex: `${wp} 1 0`, background: 'var(--ivory)' }} />}
        {dp > 0 && <span style={{ flex: `${dp} 1 0`, background: 'var(--control)' }} />}
        {(100 - wp - dp) > 0 && <span style={{ flex: `${100 - wp - dp} 1 0`, background: 'var(--track)' }} />}
      </div>
    </div>
  );
}

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: GameStats }) {
  const maxHour = Math.max(...stats.byHour, 1);

  const timeClasses = Object.entries(stats.byTimeClass)
    .sort((a, b) => wdlTotal(b[1]) - wdlTotal(a[1]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Row 1: color breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--hairline)' }}>
        {([
          ['ВСЕГО', { win: stats.white.win + stats.black.win, draw: stats.white.draw + stats.black.draw, loss: stats.white.loss + stats.black.loss }],
          ['БЕЛЫЕ ♙', stats.white],
          ['ЧЁРНЫЕ ♟', stats.black],
        ] as [string, WDL][]).map(([label, wdl]) => (
          <div key={label} style={{ padding: '16px 20px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={SECTION_LABEL}>{label}</span>
            <span style={{ ...HEADING, fontSize: 36, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {wdlTotal(wdl)}
            </span>
            <WdlBar wdl={wdl} />
          </div>
        ))}
      </div>

      {/* Row 2: by time class + top openings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>

        {/* Time class */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>По тайм-контролю</span>
          </div>
          {timeClasses.length === 0
            ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Нет данных</span>
            : timeClasses.map(([tc, wdl]) => (
              <div key={tc} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ivory)' }}>
                    {TIME_CLASS_RU[tc] ?? tc}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {wdlTotal(wdl)} партий
                  </span>
                </div>
                <WdlBar wdl={wdl} />
              </div>
            ))
          }
        </div>

        {/* Top openings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>Топ дебютов</span>
          </div>
          {stats.topOpenings.map((op, i) => {
            const pct = op.count > 0 ? Math.round((op.wins / op.count) * 100) : 0;
            return (
              <div key={op.eco} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 40px 36px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {op.eco}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  {op.count}п
                </span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: pct >= 50 ? 'var(--ivory)' : 'var(--control)' }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 3: by hour */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={SECTION_HEAD}>
          <span style={SECTION_LABEL}>По часу суток</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 24px' }}>
          {stats.byHour.map((count, h) => {
            if (count === 0) return null;
            const pct = Math.round((count / maxHour) * 100);
            return (
              <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
                  {String(h).padStart(2, '0')}:00
                </span>
                <div style={{ flex: 1, height: 2, background: 'var(--track)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ivory)' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 20, textAlign: 'right' }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

interface Filters {
  color: '' | 'white' | 'black';
  timeClass: string;
  result: '' | 'win' | 'draw' | 'loss';
  eco: string;
}

function FilterBar({
  filters, onChange, timeClasses, ecoOptions,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  timeClasses: string[];
  ecoOptions: string[];
}) {
  const sel: React.CSSProperties = {
    height: 36, padding: '0 10px', fontSize: 13,
    background: 'var(--surface)', color: 'var(--ivory)',
    border: '1px solid var(--hairline)', cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <select style={sel} value={filters.color}
        onChange={e => onChange({ ...filters, color: e.target.value as Filters['color'] })}>
        <option value=''>Все цвета</option>
        <option value='white'>♙ Белые</option>
        <option value='black'>♟ Чёрные</option>
      </select>

      <select style={sel} value={filters.timeClass}
        onChange={e => onChange({ ...filters, timeClass: e.target.value })}>
        <option value=''>Все контроли</option>
        {timeClasses.map(tc => (
          <option key={tc} value={tc}>{TIME_CLASS_RU[tc] ?? tc}</option>
        ))}
      </select>

      <select style={sel} value={filters.result}
        onChange={e => onChange({ ...filters, result: e.target.value as Filters['result'] })}>
        <option value=''>Все результаты</option>
        <option value='win'>Победа</option>
        <option value='draw'>Ничья</option>
        <option value='loss'>Поражение</option>
      </select>

      <input
        type='text' placeholder='Дебют…' value={filters.eco}
        onChange={e => onChange({ ...filters, eco: e.target.value })}
        list='eco-list'
        style={{ ...sel, width: 180 }}
      />
      <datalist id='eco-list'>
        {ecoOptions.slice(0, 50).map(e => <option key={e} value={e} />)}
      </datalist>

      {(filters.color || filters.timeClass || filters.result || filters.eco) && (
        <button
          onClick={() => onChange({ color: '', timeClass: '', result: '', eco: '' })}
          style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
        >
          × Сбросить
        </button>
      )}
    </div>
  );
}

// ── Games list ────────────────────────────────────────────────────────────────

const RESULT_LABEL: Record<string, string> = { win: 'Победа', draw: 'Ничья', loss: 'Поражение' };
const RESULT_COLOR: Record<string, string> = {
  win: 'var(--ivory)', draw: 'var(--muted)', loss: 'var(--control)',
};

function GameRow({ g }: { g: Game }) {
  return (
    <a
      href={g.url} target='_blank' rel='noopener noreferrer'
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 24px minmax(120px,1fr) 60px minmax(80px,1fr) 44px',
        columnGap: 16, alignItems: 'center',
        padding: '10px 0', borderBottom: '1px solid var(--hairline)',
        color: 'var(--ivory)', textDecoration: 'none',
      }}
      className='row-hover-link'
    >
      <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
        {fmtDate(g.played_at)}
      </span>
      <span style={{ fontSize: 16, lineHeight: 1 }}>
        {g.color === 'white' ? '♙' : '♟'}
      </span>
      <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {g.opp_name}
        {g.rating_opp != null && (
          <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{g.rating_opp}</span>
        )}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: RESULT_COLOR[g.result] }}>
        {RESULT_LABEL[g.result]}
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {g.eco_name || '—'}
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {g.moves_count}
      </span>
    </a>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface SyncProgress {
  phase: string;
  archive: number;
  total: number;
  added: number;
  skipped: number;
  errors: number;
}

const PAGE_SIZE = 60;
const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export default function GamesPage() {
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncDone, setSyncDone] = useState<{ added: number; errors: number } | null>(null);
  const [filters, setFilters] = useState<Filters>({ color: '', timeClass: '', result: '', eco: '' });
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(false);
  const [userInput, setUserInput] = useState('');
  const syncRunning = useRef(false);

  // ── Load from Supabase ────────────────────────────────────────────────────
  // No synchronous setState: all state updates happen after the first await,
  // so the React Compiler's set-state-in-effect rule does not fire.

  async function loadData() {
    const [{ data: stateData }, { data: gamesData }] = await Promise.all([
      supabase.from('games_sync_state').select('*').eq('id', 1).single(),
      supabase.from('games').select('*').order('played_at', { ascending: false }),
    ]);
    if (stateData) setSyncState(stateData as SyncState);
    if (gamesData) setGames(gamesData as Game[]);
    setLoading(false);
  }

  // ── Sync ─────────────────────────────────────────────────────────────────
  // Defined before the effects that call it to avoid the forward-reference error.

  async function startSync(username: string, alreadySynced: string[]) {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setSyncing(true);
    setSyncDone(null);

    let added = 0;
    let errors = 0;
    const newlySynced = [...alreadySynced];

    try {
      setSyncProgress({ phase: 'Загружаем архивы…', archive: 0, total: 0, added: 0, skipped: 0, errors: 0 });
      const archives = await fetchArchives(username);

      const now = new Date();
      const currentArchive = `https://api.chess.com/pub/player/${username}/games/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      const toProcess = archives.filter(a => !alreadySynced.includes(a) || a === currentArchive);

      setSyncProgress(p => p ? { ...p, phase: 'Скачиваем партии…', total: toProcess.length } : null);

      for (let i = 0; i < toProcess.length; i++) {
        const archiveUrl = toProcess[i];
        setSyncProgress(p => p ? { ...p, archive: i + 1, phase: `Архив ${i + 1}/${toProcess.length}` } : null);

        try {
          const rawGames = await fetchMonthGames(archiveUrl);
          const parsed = rawGames
            .map(g => parseGame(g, username))
            .filter((g): g is NonNullable<typeof g> => g !== null);

          if (parsed.length > 0) {
            const rows = parsed.map(g => ({ ...g, source: 'chesscom' }));
            for (let j = 0; j < rows.length; j += 100) {
              const { error } = await supabase
                .from('games')
                .upsert(rows.slice(j, j + 100), { onConflict: 'url', ignoreDuplicates: true });
              if (!error) added += rows.slice(j, j + 100).length;
            }
          }

          if (archiveUrl !== currentArchive && !newlySynced.includes(archiveUrl)) {
            newlySynced.push(archiveUrl);
          }
        } catch {
          errors++;
        }

        setSyncProgress(p => p ? { ...p, added, errors } : null);
      }

      await supabase.from('games_sync_state').upsert({
        id: 1,
        username,
        last_synced_at: new Date().toISOString(),
        synced_archives: newlySynced,
      });

      setSyncDone({ added, errors });
      await loadData();
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncDone({ added, errors: errors + 1 });
    } finally {
      syncRunning.current = false;
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  // Auto-sync once per hour on page open
  useEffect(() => {
    if (!syncState || syncRunning.current) return;
    const lastSync = syncState.last_synced_at ? new Date(syncState.last_synced_at).getTime() : 0;
    if (Date.now() - lastSync > SYNC_COOLDOWN_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void startSync(syncState.username, syncState.synced_archives ?? []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState]);

  // ── Username save ─────────────────────────────────────────────────────────

  async function saveUsername() {
    const u = userInput.trim().toLowerCase();
    if (!u) return;
    await supabase.from('games_sync_state').upsert({ id: 1, username: u });
    setSyncState(s => s ? { ...s, username: u, synced_archives: [] } : null);
    setEditingUser(false);
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const stats = computeStats(games);

  const ecoOptions = [...new Set(games.map(g => g.eco_name).filter(Boolean))].sort();
  const timeClasses = [...new Set(games.map(g => g.time_class))].sort();

  const filtered = games.filter(g => {
    if (filters.color && g.color !== filters.color) return false;
    if (filters.timeClass && g.time_class !== filters.timeClass) return false;
    if (filters.result && g.result !== filters.result) return false;
    if (filters.eco && !g.eco_name.toLowerCase().includes(filters.eco.toLowerCase())) return false;
    return true;
  });

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className='animate-pulse'>
          <div style={{ height: 60, width: 220, background: 'var(--surface)' }} />
          <div style={{ height: 120, background: 'var(--surface)' }} />
          <div style={{ height: 400, background: 'var(--surface)' }} />
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 48px 72px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ ...HEADING, margin: 0, fontSize: 56, fontWeight: 700, lineHeight: 0.92, letterSpacing: '-0.02em' }}>
            Партии
          </h1>
          {/* Username */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {editingUser ? (
              <>
                <input
                  autoFocus
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') setEditingUser(false); }}
                  style={{ height: 32, padding: '0 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--ivory)', border: '1px solid var(--hairline)', outline: 'none', width: 160 }}
                />
                <button onClick={saveUsername} style={{ fontSize: 13, color: 'var(--ivory)', background: 'none', border: 'none', cursor: 'pointer' }}>Сохранить</button>
                <button onClick={() => setEditingUser(false)} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Отмена</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>chess.com / <span style={{ color: 'var(--ivory)' }}>{syncState?.username ?? '—'}</span></span>
                <button onClick={() => { setUserInput(syncState?.username ?? ''); setEditingUser(true); }} style={{ fontSize: 12, color: 'var(--control)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>изменить</button>
              </>
            )}
          </div>
        </div>

        {/* Sync controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {syncing && syncProgress ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
              <div>{syncProgress.phase}</div>
              {syncProgress.total > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ height: 2, background: 'var(--track)', width: 180 }}>
                    <div style={{ height: '100%', background: 'var(--ivory)', width: `${Math.round((syncProgress.archive / syncProgress.total) * 100)}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
              {syncProgress.added > 0 && <div style={{ marginTop: 4 }}>+{syncProgress.added} партий</div>}
            </div>
          ) : syncDone ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
              Готово. Добавлено {syncDone.added}
              {syncDone.errors > 0 && `, ошибок ${syncDone.errors}`}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Синхр. {fmtSince(syncState?.last_synced_at ?? null)}
            </div>
          )}
          <button
            onClick={() => syncState && startSync(syncState.username, syncState.synced_archives ?? [])}
            disabled={syncing}
            style={{
              height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600,
              background: syncing ? 'var(--track)' : 'var(--ivory)',
              color: syncing ? 'var(--muted)' : 'var(--ink)',
              border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? 'Синхронизация…' : 'Синхронизировать'}
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      {games.length > 0 && (
        <section>
          <div style={SECTION_HEAD}>
            <span style={SECTION_LABEL}>СТАТИСТИКА</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{games.length} партий</span>
          </div>
          <div style={{ paddingTop: 20 }}>
            <StatsPanel stats={stats} />
          </div>
        </section>
      )}

      {/* ── Games list ── */}
      <section>
        <div style={{ ...SECTION_HEAD, marginBottom: 16 }}>
          <span style={SECTION_LABEL}>ПАРТИИ</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} из {games.length}</span>
        </div>

        {games.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>Нет партий. Нажми «Синхронизировать».</p>
          </div>
        ) : (
          <>
            <FilterBar filters={filters} onChange={f => { setFilters(f); setPage(1); }} timeClasses={timeClasses} ecoOptions={ecoOptions} />

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '72px 24px minmax(120px,1fr) 60px minmax(80px,1fr) 44px', columnGap: 16, padding: '10px 0', borderBottom: '1px solid var(--hairline)' }}>
              {['ДАТА', '', 'СОПЕРНИК', 'РЕЗУЛЬТАТ', 'ДЕБЮТ', 'ХОДОВ'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            {paged.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--muted)', padding: '24px 0' }}>Нет партий по фильтру.</p>
            ) : (
              paged.map(g => <GameRow key={g.id} g={g} />)
            )}

            {hasMore && (
              <div style={{ paddingTop: 20 }}>
                <button
                  onClick={() => setPage(p => p + 1)}
                  style={{ height: 40, padding: '0 24px', fontSize: 13, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--hairline)', cursor: 'pointer' }}
                >
                  Показать ещё ({filtered.length - paged.length})
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
