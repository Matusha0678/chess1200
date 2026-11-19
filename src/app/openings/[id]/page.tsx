'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { extractAllLines } from '@/lib/pgn-tree';
import type { Opening, OpeningLine, LineProgress } from '@/types/openings';

interface LineWithProgress extends OpeningLine {
  line_progress: LineProgress[];
}

interface Props {
  params: Promise<{ id: string }>;
}

const LINE_CLASSES = [
  { id: 'main',      label: 'Главная',      color: '#81B64C' },
  { id: 'common',    label: 'Частая',       color: '#5096CC' },
  { id: 'rare',      label: 'Редкая',       color: '#C98424' },
  { id: 'very_rare', label: 'Очень редкая', color: '#A04040' },
  { id: 'sharp',     label: 'Острая',       color: '#E0574A' },
] as const;

const BADGE_OPTIONS = ['⭐', '🔥', '⚡', '💡', '🎯', '📌', '⚠️', '🏆'];

const COLOR_LABEL: Record<'white' | 'black' | 'both', string> = {
  white: 'Белые',
  black: 'Чёрные',
  both: 'Оба цвета',
};

const COLOR_ICON: Record<'white' | 'black' | 'both', string> = {
  white: '♙',
  black: '♟',
  both: '♗',
};

interface ActionCardProps {
  id: string;
  linesDue: number;
  lines: LineWithProgress[];
  exportFlash: boolean;
  confirmDelete: boolean;
  deleting: boolean;
  bestExam: { perfect: number; total: number; pct: number } | null;
  onExportPgn: () => void;
  onConfirmDelete: (v: boolean) => void;
  onDelete: () => void;
}

function ActionCard({
  id,
  linesDue,
  lines,
  exportFlash,
  confirmDelete,
  deleting,
  bestExam,
  onExportPgn,
  onConfirmDelete,
  onDelete,
}: ActionCardProps) {
  return (
    <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-5 flex flex-col gap-3">
      {linesDue > 0 && (
        <div className="flex items-center justify-between bg-[#141414] border border-[#2A2A2A] rounded-[10px] px-4 py-3 mb-1">
          <div className="flex items-center gap-2">
            <span className="w-[6px] h-[6px] rounded-full bg-white shrink-0" />
            <span className="text-[13px] text-[#E5E5E5] font-medium">
              {linesDue} {linesDue === 1 ? 'линия' : linesDue <= 4 ? 'линии' : 'линий'} к повторению
            </span>
          </div>
        </div>
      )}

      <Link
        href={`/openings/${id}/practice`}
        style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '0 24px', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Тренировка
      </Link>

      <Link
        href={`/openings/${id}/study`}
        className="h-10 flex items-center justify-center gap-2 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-[10px] px-6 text-[14px] font-medium transition-colors no-underline"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        Учёба
      </Link>

      <Link
        href={`/openings/${id}/exam`}
        className="h-10 flex items-center justify-center gap-2 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-[10px] px-6 text-[14px] font-medium transition-colors no-underline"
      >
        Экзамен {bestExam && bestExam.total > 0 ? <span className="text-[12px] text-[#A0A0A0] ml-1">Лучший: {bestExam.pct}%</span> : null}
      </Link>

      <div className="flex gap-2">
        <Link
          href={`/openings/${id}/stats`}
          className="flex-1 h-9 flex items-center justify-center gap-2 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-5 text-[14px] transition-colors no-underline"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Статистика
        </Link>
        <Link
          href={`/openings/${id}/edit`}
          className="flex-1 h-9 flex items-center justify-center gap-2 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-5 text-[14px] transition-colors no-underline"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Изменить
        </Link>
      </div>

      <button
        onClick={onExportPgn}
        disabled={lines.length === 0}
        className={[
          'h-9 w-full flex items-center justify-center gap-2 border rounded-full px-5 text-[13px] transition-colors bg-transparent cursor-pointer disabled:opacity-30',
          exportFlash
            ? 'border-[#505050] text-[#A0A0A0]'
            : 'border-[#303030] text-[#606060] hover:border-[#505050] hover:text-[#A0A0A0]',
        ].join(' ')}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {exportFlash ? 'Скачано!' : 'Скачать PGN'}
      </button>

      {confirmDelete ? (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[13px] text-[#A0A0A0] text-center">Удалить дебют и все линии?</p>
          <div className="flex gap-2">
            <button
              onClick={onDelete}
              disabled={deleting}
              className="flex-1 h-9 border border-[#404040] text-[#A0A0A0] hover:bg-[#1A1A1A] rounded-full px-4 text-[13px] font-semibold transition-colors bg-transparent disabled:opacity-50 cursor-pointer"
            >
              {deleting ? 'Удаление...' : 'Да, удалить'}
            </button>
            <button
              onClick={() => onConfirmDelete(false)}
              className="flex-1 h-9 border border-[#303030] text-[#E5E5E5] hover:border-[#FFFFFF] rounded-full px-4 text-[13px] transition-colors bg-transparent cursor-pointer"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onConfirmDelete(true)}
          className="h-9 w-full border border-transparent text-[#505050] hover:border-[#404040] hover:text-[#A0A0A0] rounded-full px-5 text-[13px] transition-colors bg-transparent cursor-pointer"
        >
          Удалить дебют
        </button>
      )}
    </div>
  );
}

function masteryDots(mastery: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span
      key={i}
      className={`inline-block w-[8px] h-[8px] rounded-full ${
        i < mastery ? 'bg-[#FFFFFF]' : 'bg-[#262626]'
      }`}
    />
  ));
}

function abbreviateMoves(line: OpeningLine, maxHalfMoves = 16): string {
  const moves = line.moves.slice(0, maxHalfMoves);
  const parts: string[] = [];
  moves.forEach((m, idx) => {
    if (m.color === 'w') {
      parts.push(`${Math.floor(idx / 2) + 1}.`);
    }
    parts.push(m.san);
  });
  if (line.moves.length > maxHalfMoves) parts.push('...');
  return parts.join(' ');
}

function pluralVariations(n: number): string {
  if (n === 1) return 'вариация';
  if (n >= 2 && n <= 4) return 'вариации';
  return 'вариаций';
}

export default function OpeningDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [lines, setLines] = useState<LineWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [confirmDeleteLineId, setConfirmDeleteLineId] = useState<string | null>(null);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);

  const [showAddLine, setShowAddLine] = useState(false);
  const [addLinePgn, setAddLinePgn] = useState('');
  const [addLineCount, setAddLineCount] = useState<number | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [addLineError, setAddLineError] = useState<string | null>(null);
  const [addLineSuccess, setAddLineSuccess] = useState(false);
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportFlash, setExportFlash] = useState(false);
  const [bestExam, setBestExam] = useState<{ perfect: number; total: number; pct: number } | null>(null);

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editBadge, setEditBadge] = useState<string | null>(null);
  const [editClass, setEditClass] = useState<string | null>(null);
  const [addLineBadge, setAddLineBadge] = useState<string | null>(null);
  const [addLineClass, setAddLineClass] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('exam_log').select('perfect, total').eq('opening_id', id);
        if (!data || data.length === 0) return;
        let best = { perfect: 0, total: 0, pct: 0 };
        for (const r of (data as Array<{ perfect: number; total: number }>)) {
          const pct = r.total > 0 ? Math.round(r.perfect / r.total * 100) : 0;
          if (pct > best.pct) best = { perfect: r.perfect, total: r.total, pct };
        }
        setBestExam(best);
      } catch { /* exam_log not yet created */ }
    })();
  }, [id]);

  const now = new Date().toISOString();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);

    const { data: openingData } = await supabase
      .from('openings')
      .select('*')
      .eq('id', id)
      .single();

    if (!openingData) {
      router.push('/openings');
      return;
    }

    setOpening(openingData as Opening);

    const { data: linesData } = await supabase
      .from('opening_lines')
      .select('*, line_progress(*)')
      .eq('opening_id', id)
      .order('line_index');

    setLines((linesData as LineWithProgress[]) ?? []);
    setLoading(false);
  }

  async function handleDelete() {
    if (!opening) return;
    setDeleting(true);

    const { data: lineRows } = await supabase
      .from('opening_lines')
      .select('id')
      .eq('opening_id', opening.id);

    const lineIds = (lineRows ?? []).map((l) => l.id);

    if (lineIds.length > 0) {
      await supabase.from('line_progress').delete().in('line_id', lineIds);
      await supabase.from('opening_lines').delete().in('id', lineIds);
    }

    await supabase.from('openings').delete().eq('id', opening.id);

    router.push('/openings');
  }

  async function handleDeleteLine(lineId: string) {
    if (!opening) return;
    setDeletingLineId(lineId);
    await supabase.from('line_progress').delete().eq('line_id', lineId);
    await supabase.from('opening_lines').delete().eq('id', lineId);
    await supabase
      .from('openings')
      .update({ total_lines: Math.max(0, opening.total_lines - 1) })
      .eq('id', opening.id);
    setDeletingLineId(null);
    setConfirmDeleteLineId(null);
    await load();
  }

  async function handleSaveLineMeta(lineId: string) {
    const { error } = await supabase.from('opening_lines').update({
      badge: editBadge,
      line_class: editClass,
    }).eq('id', lineId);
    if (!error) {
      setEditingLineId(null);
      setLines(prev => prev.map(l =>
        l.id === lineId ? { ...l, badge: editBadge ?? undefined, line_class: editClass ?? undefined } : l
      ));
    }
  }

  function startEditLine(line: LineWithProgress) {
    setEditingLineId(line.id);
    setEditBadge(line.badge ?? null);
    setEditClass(line.line_class ?? null);
  }

  function handleAddLinePgnChange(value: string) {
    setAddLinePgn(value);
    setAddLineError(null);
    setAddLineSuccess(false);

    if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);

    if (!value.trim()) {
      setAddLineCount(null);
      return;
    }

    parseTimeoutRef.current = setTimeout(() => {
      try {
        const { lines } = extractAllLines(value);
        setAddLineCount(lines.length);
      } catch {
        setAddLineCount(0);
      }
    }, 400);
  }

  async function handleAddLines() {
    if (!opening || !addLinePgn.trim()) return;
    setAddLineError(null);
    setAddLineSuccess(false);

    let newMoveLines;
    try {
      const result = extractAllLines(addLinePgn);
      newMoveLines = result.lines;
    } catch {
      setAddLineError('Не удалось разобрать PGN. Проверь формат.');
      return;
    }

    if (newMoveLines.length === 0) {
      setAddLineError('В PGN не найдено ни одной вариации.');
      return;
    }

    setAddingLine(true);

    const maxIndex = lines.length > 0
      ? Math.max(...lines.map((l) => l.line_index))
      : -1;

    const lineRows = newMoveLines.map((moves, i) => ({
      opening_id: opening.id,
      line_index: maxIndex + 1 + i,
      moves,
      badge: addLineBadge,
      line_class: addLineClass,
    }));

    const { error: insertError } = await supabase
      .from('opening_lines')
      .insert(lineRows);

    if (insertError) {
      setAddLineError('Ошибка при добавлении вариаций: ' + insertError.message);
      setAddingLine(false);
      return;
    }

    await supabase
      .from('openings')
      .update({ total_lines: opening.total_lines + newMoveLines.length })
      .eq('id', opening.id);

    setAddingLine(false);
    setAddLineSuccess(true);
    setAddLinePgn('');
    setAddLineCount(null);
    setShowAddLine(false);

    await load();
  }

  function handleExportPgn() {
    if (!opening || lines.length === 0) return;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    const games = lines.map(line => {
      const header = [
        `[Event "${opening.name}"]`,
        `[Site "Chess 1200"]`,
        `[Date "${date}"]`,
        `[White "?"]`,
        `[Black "?"]`,
        `[Result "*"]`,
      ].join('\n');
      const moveText = line.moves.reduce((acc, move, idx) => {
        return acc + (move.color === 'w' ? `${Math.floor(idx / 2) + 1}. ` : '') + `${move.san} `;
      }, '');
      return `${header}\n\n${moveText}*`;
    });
    const content = games.join('\n\n');
    const blob = new Blob([content], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${opening.name.replace(/[^a-zа-яёА-ЯЁ0-9 ]/gi, '').trim()}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportFlash(true);
    setTimeout(() => setExportFlash(false), 2000);
  }

  if (loading) {
    return (
      <div className="page">
        <div className="animate-pulse flex flex-col gap-6">
          <div className="h-[13px] w-[200px] bg-[#1E1E1E] rounded-full" />
          <div className="h-[72px] w-[480px] bg-[#1E1E1E] rounded-[16px]" />
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] h-[100px]" />
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] h-[300px]" />
        </div>
      </div>
    );
  }

  if (!opening) return null;

  const progress = lines.flatMap((l) => l.line_progress ?? []);
  const linesTotal = lines.length;
  const linesMastered = progress.filter((p) => p.mastery >= 4).length;
  const linesDue = progress.filter((p) => p.next_review <= now && p.mastery < 5).length;

  const totalCorrect = progress.reduce((s, p) => s + (p.correct_count ?? 0), 0);
  const totalIncorrect = progress.reduce((s, p) => s + (p.incorrect_count ?? 0), 0);
  const totalAttempts = totalCorrect + totalIncorrect;
  const accuracy = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : null;
  const lastPracticed = progress
    .map(p => p.last_practiced)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  function fmtLastPracticed(iso: string | null): string {
    if (!iso) return '—';
    const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} дн.`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед.`;
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  const masteryPct = linesTotal > 0 ? Math.round((linesMastered / linesTotal) * 100) : 0;

  const actionCardProps: ActionCardProps = {
    id,
    linesDue,
    lines,
    exportFlash,
    confirmDelete,
    deleting,
    bestExam,
    onExportPgn: handleExportPgn,
    onConfirmDelete: setConfirmDelete,
    onDelete: handleDelete,
  };

  return (
    <div className="page">
      {/* Back */}
      <Link
        href="/openings"
        className="inline-flex items-center gap-2 text-[13px] text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors no-underline mb-6"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Дебюты
      </Link>

      <div className="flex flex-col lg:flex-row lg:gap-8 lg:items-start">

        {/* ── Left: main content ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">

          {/* Badges + title */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              {opening.eco_code && (
                <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#FFFFFF] bg-[#222222] border border-[#383838] rounded-[6px] px-[9px] py-[4px]">
                  {opening.eco_code}
                </span>
              )}
              <span className="flex items-center gap-[5px] text-[11px] font-bold tracking-[0.16em] uppercase text-[#808080] bg-[#111111] border border-[#262626] rounded-[6px] px-[9px] py-[4px]">
                <span className="text-[14px] leading-none">{COLOR_ICON[opening.color]}</span>
                {COLOR_LABEL[opening.color]}
              </span>
              <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#606060] bg-[#111111] border border-[#262626] rounded-[6px] px-[9px] py-[4px]">
                {linesTotal} {linesTotal === 1 ? 'линия' : linesTotal <= 4 ? 'линии' : 'линий'}
              </span>
            </div>
            <h1 className="m-0 font-[500] text-[48px] leading-[1] tracking-[-0.02em]">
              {opening.name}
            </h1>

            {/* Mastery progress bar */}
            {linesTotal > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#606060]">Освоено {linesMastered} из {linesTotal}</span>
                  <span className="text-[12px] font-semibold text-[#808080]">{masteryPct}%</span>
                </div>
                <div style={{ height: 3, background: 'var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.5s', width: `${masteryPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action card — mobile only */}
          <div className="lg:hidden">
            <ActionCard {...actionCardProps} />
          </div>

          {/* Stats — 2 rows of 3 */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] grid grid-cols-3">
            <div className="px-5 py-4 flex flex-col gap-[6px]">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">Повторить</span>
              <span className={`font-cormorant text-[36px] font-semibold leading-[1] ${linesDue > 0 ? 'text-[#FFFFFF]' : 'text-[#404040]'}`}>
                {linesDue}
              </span>
            </div>
            <div className="px-5 py-4 flex flex-col gap-[6px] border-l border-[#1A1A1A]">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">Освоено</span>
              <span className="font-cormorant text-[36px] font-semibold leading-[1] text-[#D0D0D0]">{linesMastered}</span>
            </div>
            <div className="px-5 py-4 flex flex-col gap-[6px] border-l border-[#1A1A1A]">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">Точность</span>
              <span className="font-cormorant text-[36px] font-semibold leading-[1] text-[#C0C0C0]">
                {accuracy !== null ? `${accuracy}%` : '—'}
              </span>
            </div>
            <div className="px-5 py-4 flex flex-col gap-[6px] border-t border-[#1A1A1A]">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">Попыток</span>
              <span className="font-cormorant text-[36px] font-semibold leading-[1] text-[#909090]">
                {totalAttempts > 0 ? totalAttempts : '—'}
              </span>
            </div>
            <div className="px-5 py-4 flex flex-col gap-[6px] border-t border-l border-[#1A1A1A]">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">Последнее</span>
              <span className="font-cormorant text-[32px] font-semibold leading-[1] text-[#707070]">
                {fmtLastPracticed(lastPracticed ?? null)}
              </span>
            </div>
            <div className="px-5 py-4 flex flex-col gap-[6px] border-t border-l border-[#1A1A1A]">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">Линий</span>
              <span className="font-cormorant text-[36px] font-semibold leading-[1] text-[#909090]">{linesTotal}</span>
            </div>
          </div>

          {/* Lines list */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px]">
            <div className="flex justify-between items-center px-5 py-[16px] border-b border-[#1E1E1E]">
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-bold tracking-[0.14em] uppercase text-[#505050]">Вариации</span>
                {lines.length > 0 && (
                  <span className="text-[12px] font-semibold text-[#383838] tabular-nums">{lines.length}</span>
                )}
              </div>
              <button
                onClick={() => {
                  setShowAddLine((v) => !v);
                  setAddLineError(null);
                  setAddLineSuccess(false);
                }}
                className={`h-8 flex items-center gap-[6px] rounded-full px-4 text-[13px] transition-colors border cursor-pointer ${
                  showAddLine
                    ? 'bg-[#1A1A1A] border-[#303030] text-[#FFFFFF]'
                    : 'border-[#262626] text-[#808080] bg-transparent hover:border-[#404040] hover:text-[#E5E5E5]'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Добавить
              </button>
            </div>

            {addLineSuccess && (
              <div className="flex items-center gap-2 text-[13px] text-[#C0C0C0] bg-[#111111] border-b border-[#1E1E1E] px-5 py-3">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Вариации добавлены
              </div>
            )}

            {lines.length === 0 && !showAddLine ? (
              <div className="px-5 py-14 text-center">
                <p className="text-[14px] text-[#404040] m-0">Нет вариаций</p>
                <p className="text-[13px] text-[#303030] m-0 mt-1">Добавь PGN чтобы начать</p>
              </div>
            ) : (
              lines.map((line, i) => {
                const prog = line.line_progress?.[0] ?? null;
                const isDue = prog && prog.next_review <= now && prog.mastery < 5;
                const mastery = prog?.mastery ?? 0;
                const moveCount = line.moves.length;
                const lineClass = LINE_CLASSES.find(c => c.id === line.line_class) ?? null;
                const isEditing = editingLineId === line.id;

                return (
                  <div
                    key={line.id}
                    className={`flex flex-col ${i > 0 ? 'border-t border-[#1A1A1A]' : ''}`}
                  >
                    {/* Main row */}
                    <div className="flex items-start gap-4 px-5 py-4 hover:bg-[#111111] transition-colors">
                      {/* Number */}
                      <span className="text-[12px] text-[#383838] tabular-nums pt-[3px] shrink-0 w-5 text-right">
                        {i + 1}
                      </span>

                      {/* Move text + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          {line.badge && (
                            <span className="text-[16px] leading-none mt-[1px] shrink-0">{line.badge}</span>
                          )}
                          <p className="m-0 text-[13px] font-mono text-[#707070] leading-[1.7] break-words flex-1">
                            {abbreviateMoves(line)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 mt-[6px] flex-wrap">
                          <div className="flex items-center gap-[3px]">
                            {masteryDots(mastery)}
                          </div>
                          <span className="text-[11px] text-[#383838] tabular-nums">{moveCount} ходов</span>
                          {lineClass && (
                            <span
                              style={{ color: lineClass.color, borderColor: lineClass.color + '55', background: lineClass.color + '12' }}
                              className="text-[11px] font-semibold px-2 py-[2px] rounded-full border"
                            >
                              {lineClass.label}
                            </span>
                          )}
                          {isDue && (
                            <span className="flex items-center gap-[4px]">
                              <span className="w-[4px] h-[4px] rounded-full bg-white" />
                              <span className="text-[11px] font-semibold text-[#FFFFFF]">повторить</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex items-center gap-2 pt-[1px]">
                        {confirmDeleteLineId === line.id ? (
                          <>
                            <span className="text-[12px] text-[#606060] whitespace-nowrap">Удалить?</span>
                            <button
                              onClick={() => handleDeleteLine(line.id)}
                              disabled={deletingLineId === line.id}
                              className="h-8 border border-[#404040] text-[#EF9A9A] hover:border-[#EF9A9A] rounded-full px-3 text-[12px] font-medium transition-colors bg-transparent disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              {deletingLineId === line.id ? '…' : 'Да'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteLineId(null)}
                              className="h-8 border border-[#262626] text-[#606060] hover:border-[#404040] rounded-full px-3 text-[12px] transition-colors bg-transparent cursor-pointer"
                            >
                              Нет
                            </button>
                          </>
                        ) : (
                          <>
                            <Link
                              href={`/openings/${id}/practice?line=${line.id}`}
                              className="shrink-0 h-8 flex items-center border border-[#262626] text-[#A0A0A0] hover:border-[#505050] hover:text-[#FFFFFF] rounded-full px-4 text-[13px] transition-colors bg-transparent no-underline"
                            >
                              Играть
                            </Link>
                            <button
                              onClick={() => isEditing ? setEditingLineId(null) : startEditLine(line)}
                              title="Значок и класс"
                              className={`shrink-0 w-8 h-8 flex items-center justify-center border rounded-full transition-colors bg-transparent cursor-pointer ${isEditing ? 'border-[#404040] text-[#A0A0A0]' : 'border-transparent text-[#303030] hover:border-[#303030] hover:text-[#606060]'}`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => setConfirmDeleteLineId(line.id)}
                              title="Удалить линию"
                              className="shrink-0 w-8 h-8 flex items-center justify-center border border-transparent text-[#303030] hover:border-[#303030] hover:text-[#606060] rounded-full transition-colors bg-transparent cursor-pointer"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Inline edit panel */}
                    {isEditing && (
                      <div className="border-t border-[#1A1A1A] px-5 py-4 flex flex-col gap-4 bg-[#080808]">
                        {/* Badge picker */}
                        <div>
                          <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050] mb-2">Значок</div>
                          <div className="flex gap-1 flex-wrap">
                            {BADGE_OPTIONS.map(b => (
                              <button
                                key={b}
                                onClick={() => setEditBadge(editBadge === b ? null : b)}
                                className={`w-9 h-9 rounded-[8px] text-[18px] transition-colors cursor-pointer ${editBadge === b ? 'bg-[#1E1E1E] border border-[#404040]' : 'bg-transparent border border-transparent hover:border-[#303030]'}`}
                              >
                                {b}
                              </button>
                            ))}
                            {editBadge && (
                              <button
                                onClick={() => setEditBadge(null)}
                                className="h-9 px-3 rounded-[8px] text-[12px] text-[#505050] border border-transparent hover:border-[#303030] bg-transparent cursor-pointer"
                              >
                                Убрать
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Class picker */}
                        <div>
                          <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050] mb-2">Класс линии</div>
                          <div className="flex gap-2 flex-wrap">
                            {LINE_CLASSES.map(cls => (
                              <button
                                key={cls.id}
                                onClick={() => setEditClass(editClass === cls.id ? null : cls.id)}
                                style={{
                                  borderColor: editClass === cls.id ? cls.color : '#262626',
                                  color: editClass === cls.id ? cls.color : '#606060',
                                  background: editClass === cls.id ? cls.color + '15' : 'transparent',
                                }}
                                className="h-7 px-3 rounded-full border text-[12px] font-medium transition-colors bg-transparent cursor-pointer"
                              >
                                {cls.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Save / cancel */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveLineMeta(line.id)}
                            style={{ background: 'var(--accent)', color: '#fff' }}
                            className="h-8 px-5 rounded-full text-[13px] font-semibold border-none cursor-pointer"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={() => setEditingLineId(null)}
                            className="h-8 px-4 rounded-full text-[13px] border border-[#262626] text-[#808080] bg-transparent cursor-pointer"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {showAddLine && (
              <div className={`px-5 pb-6 pt-5 flex flex-col gap-5 ${lines.length > 0 ? 'border-t border-[#1A1A1A]' : ''}`}>
                <h3 className="m-0 font-[500] text-[22px] leading-[1.1] text-[#E5E5E5]">
                  Добавить вариации
                </h3>

                <div className="flex flex-col gap-[8px]">
                  <label className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">
                    PGN
                  </label>
                  <textarea
                    value={addLinePgn}
                    onChange={(e) => handleAddLinePgnChange(e.target.value)}
                    rows={7}
                    placeholder="Вставь PGN вариаций..."
                    className="bg-[#080808] border border-[#222222] rounded-[10px] px-4 py-3 text-[13px] text-[#E0E0E0] placeholder-[#383838] outline-none focus:border-[#505050] transition-colors font-mono resize-y leading-[1.7]"
                  />
                  {addLineCount !== null && (
                    <div
                      className={`flex items-center gap-2 text-[12px] font-medium px-3 py-[7px] rounded-[8px] border ${
                        addLineCount > 0
                          ? 'text-[#C0C0C0] bg-[#111111] border-[#262626]'
                          : 'text-[#808080] bg-[#0D0D0D] border-[#1E1E1E]'
                      }`}
                    >
                      {addLineCount > 0 ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Найдено {addLineCount} {pluralVariations(addLineCount)}
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                          </svg>
                          Вариации не найдены — проверь PGN
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Badge for new lines */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">
                    Значок <span className="normal-case font-normal text-[#383838]">(необязательно)</span>
                  </label>
                  <div className="flex gap-1 flex-wrap">
                    {BADGE_OPTIONS.map(b => (
                      <button
                        key={b}
                        onClick={() => setAddLineBadge(addLineBadge === b ? null : b)}
                        className={`w-9 h-9 rounded-[8px] text-[18px] transition-colors cursor-pointer ${addLineBadge === b ? 'bg-[#1E1E1E] border border-[#404040]' : 'bg-transparent border border-transparent hover:border-[#303030]'}`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Class for new lines */}
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#505050]">
                    Класс линии <span className="normal-case font-normal text-[#383838]">(необязательно)</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {LINE_CLASSES.map(cls => (
                      <button
                        key={cls.id}
                        onClick={() => setAddLineClass(addLineClass === cls.id ? null : cls.id)}
                        style={{
                          borderColor: addLineClass === cls.id ? cls.color : '#262626',
                          color: addLineClass === cls.id ? cls.color : '#606060',
                          background: addLineClass === cls.id ? cls.color + '15' : 'transparent',
                        }}
                        className="h-7 px-3 rounded-full border text-[12px] font-medium transition-colors bg-transparent cursor-pointer"
                      >
                        {cls.label}
                      </button>
                    ))}
                  </div>
                </div>

                {addLineError && (
                  <div className="flex items-center gap-2 text-[13px] text-[#909090] bg-[#111111] border border-[#2A2A2A] rounded-[10px] px-4 py-3">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                    {addLineError}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAddLines}
                    disabled={addingLine || !addLinePgn.trim()}
                    style={{ height: 36, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 18, padding: '0 20px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: addingLine || !addLinePgn.trim() ? 0.4 : 1 }}
                  >
                    {addingLine ? 'Добавление...' : 'Добавить'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddLine(false);
                      setAddLinePgn('');
                      setAddLineCount(null);
                      setAddLineError(null);
                    }}
                    className="h-9 border border-[#262626] text-[#808080] hover:border-[#404040] hover:text-[#E5E5E5] rounded-full px-5 text-[13px] transition-colors bg-transparent cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: sticky action sidebar (desktop only) ─────────────────── */}
        <div className="hidden lg:block w-[270px] shrink-0 sticky top-5">
          <ActionCard {...actionCardProps} />
        </div>

      </div>
    </div>
  );
}
