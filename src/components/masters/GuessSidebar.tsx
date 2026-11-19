'use client';

import Link from 'next/link';
import { SessionPanel } from '@/components/trainer/SessionPanel';
import {
  sanNo, kindLabel, plural,
  type MomentItem, type MomentKind,
} from '@/lib/masters';

interface Answer {
  ply: number;
  pts: 0 | 1 | 2;
  san: string;
  kind: MomentKind;
}

interface GuessSidebarProps {
  gameId: string;
  mode: 'key' | 'sac' | 'all';
  side: 'white' | 'black';
  skip: number;
  moments: MomentItem[];
  answers: Answer[];
  record: number | null;
  phase: 'overview' | 'watch' | 'ask' | 'result' | 'done';
  currentPly: number | null;
  analyzing: { done: number; total: number } | null;
  analysisMissing: boolean;
  onModeChange: (m: 'key' | 'sac' | 'all') => void;
  onSideChange: (s: 'white' | 'black') => void;
  onSkipChange: (n: number) => void;
  whiteName: string;
  blackName: string;
  onOtherGame?: () => void;
  onMomentClick?: (ply: number) => void;
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--muted)',
};

function PtsBox({ pts }: { pts: 0 | 1 | 2 }) {
  const color = pts === 2 ? 'var(--accent)' : pts === 1 ? '#F0A43A' : 'var(--c-bad)';
  return (
    <span style={{
      display: 'inline-block', width: 20, height: 20, lineHeight: '20px', textAlign: 'center',
      background: color, color: '#fff', fontSize: 13, fontWeight: 700,
      borderRadius: 'var(--radius-btn, 4px)', flexShrink: 0,
    }}>
      {pts}
    </span>
  );
}

function KindIcon({ kind }: { kind: MomentKind }) {
  if (kind === 'sac') return <span style={{ color: '#F0A43A', fontSize: 13 }}>♦</span>;
  if (kind === 'check') return <span style={{ color: 'var(--c-bad)', fontSize: 13 }}>⚡</span>;
  if (kind === 'capture') return <span style={{ color: 'var(--muted)', fontSize: 13 }}>×</span>;
  if (kind === 'annotated') return <span style={{ color: 'color-mix(in srgb, var(--accent) 70%, var(--ivory))', fontSize: 13 }}>★</span>;
  return <span style={{ color: 'color-mix(in srgb, var(--accent) 45%, var(--muted))', fontSize: 13 }}>·</span>;
}

export function GuessSidebar({
  mode, side, skip, moments, answers, record, phase, currentPly,
  analyzing, analysisMissing,
  onModeChange, onSideChange, onSkipChange,
  whiteName, blackName,
  onOtherGame, onMomentClick,
}: GuessSidebarProps) {
  const inSession = phase === 'watch' || phase === 'ask' || phase === 'result';
  const disabled = inSession;

  const totalPts = answers.reduce((s, a) => s + a.pts, 0);
  const masterHits = answers.filter(a => a.pts === 2).length;
  const answered = answers.length;

  const stats = [
    { label: 'очки', value: phase === 'overview' ? '—' : String(totalPts), color: 'var(--accent)' },
    { label: 'как мастер', value: phase === 'overview' ? '—' : `${masterHits}/${answered}`, color: 'var(--ivory)' },
    { label: 'рекорд', value: record != null ? String(record) : '—', color: 'var(--muted)' },
  ];

  const disabledNote = disabled ? (
    <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 6 }}>Стоп — чтобы поменять</span>
  ) : null;

  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Mode */}
      <div>
        <div style={{ ...LABEL_STYLE, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          Где останавливаться {disabled && disabledNote}
        </div>
        <div data-ui="master-mode" style={{ display: 'flex', gap: 4 }}>
          {(['key', 'sac', 'all'] as const).map(m => (
            <button
              key={m}
              onClick={() => !disabled && onModeChange(m)}
              disabled={disabled}
              style={{
                flex: 1, padding: '5px 4px', fontSize: 13, border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-btn, 4px)', background: mode === m ? 'var(--accent)' : 'var(--surface)',
                color: mode === m ? '#fff' : 'var(--muted)', cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {m === 'key' ? 'Ключевые' : m === 'sac' ? 'Жертвы' : 'Каждый ход'}
            </button>
          ))}
        </div>
      </div>

      {/* Side */}
      <div>
        <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>За кого</div>
        <div data-ui="master-side" style={{ display: 'flex', gap: 4 }}>
          {(['white', 'black'] as const).map(s => (
            <button
              key={s}
              onClick={() => !disabled && onSideChange(s)}
              disabled={disabled}
              style={{
                flex: 1, padding: '5px 4px', fontSize: 13, border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-btn, 4px)', background: side === s ? 'var(--surface)' : 'var(--surface)',
                color: side === s ? 'var(--ivory)' : 'var(--muted)', cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                fontWeight: side === s ? 600 : 400,
                borderColor: side === s ? 'var(--accent)' : 'var(--hairline)',
              }}
            >
              {s === 'white' ? `♔ ${whiteName}` : `♚ ${blackName}`}
            </button>
          ))}
        </div>
      </div>

      {/* Skip */}
      <div data-ui="master-skip">
        <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Пропустить дебют</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => !disabled && onSkipChange(Math.max(0, skip - 1))}
            disabled={disabled || skip <= 0}
            style={{
              width: 24, height: 24, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
              background: 'var(--surface)', color: 'var(--ivory)', cursor: disabled || skip <= 0 ? 'default' : 'pointer',
              fontSize: 14, lineHeight: 1, flexShrink: 0,
            }}
          >−</button>
          <span style={{ fontSize: 13, color: 'var(--ivory)', flex: 1, textAlign: 'center' }}>
            первые <strong>{skip}</strong> ходов
          </span>
          <button
            onClick={() => !disabled && onSkipChange(Math.min(20, skip + 1))}
            disabled={disabled || skip >= 20}
            style={{
              width: 24, height: 24, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-btn, 4px)',
              background: 'var(--surface)', color: 'var(--ivory)', cursor: disabled || skip >= 20 ? 'default' : 'pointer',
              fontSize: 14, lineHeight: 1, flexShrink: 0,
            }}
          >+</button>
        </div>
      </div>
    </div>
  );

  const momentCount = moments.length;

  const momentList = analyzing ? (
    <div data-ui="master-analyzing" style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
        Готовлю партию · {analyzing.done} / {analyzing.total}
      </div>
      <div style={{ height: 3, background: 'var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: 'var(--accent)', borderRadius: 2,
          width: analyzing.total > 0 ? `${Math.round(100 * analyzing.done / analyzing.total)}%` : '0%',
          transition: 'width 0.3s',
        }} />
      </div>
      {analysisMissing && (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
          Анализ не сохраняется: выполни supabase/38-masters-analysis.sql
        </div>
      )}
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {moments.map((m, idx) => {
        const ans = answers.find(a => a.ply === m.ply);
        const isCurrent = currentPly === m.ply;
        const answered = !!ans;
        return (
          <div
            key={m.ply}
            data-ui="master-moment"
            data-ply={m.ply}
            data-result={ans ? String(ans.pts) : isCurrent ? 'current' : 'todo'}
            onClick={() => phase === 'done' && answered && onMomentClick?.(m.ply)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
              borderRadius: 'var(--radius-btn, 4px)',
              background: isCurrent ? 'rgba(129,182,76,.1)' : 'transparent',
              borderLeft: isCurrent ? '3px solid var(--accent)' : '3px solid transparent',
              cursor: phase === 'done' && answered ? 'pointer' : 'default',
              fontSize: 13,
            }}
          >
            <span style={{ color: 'var(--muted)', width: 20, flexShrink: 0, fontSize: 13 }}>{idx + 1}</span>
            {answered ? (
              <>
                <KindIcon kind={ans!.kind} />
                <span style={{ flex: 1, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sanNo(m.ply, ans!.san)}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 13, marginRight: 4 }}>{kindLabel(ans!.kind)}</span>
                <PtsBox pts={ans!.pts} />
              </>
            ) : (
              <>
                <span style={{ flex: 1, color: 'var(--muted)' }}>Ход {Math.ceil(m.ply / 2)}</span>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>?</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {onOtherGame && (
        <button
          data-ui="master-other"
          onClick={onOtherGame}
          style={{
            flex: 1, padding: '8px 0', fontSize: 13, border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-btn, 4px)', background: 'transparent', color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          Другая партия
        </button>
      )}
      <Link
        href="/masters"
        title="Библиотека"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-btn, 4px)', color: 'var(--muted)', textDecoration: 'none', fontSize: 16,
        }}
      >☰</Link>
    </div>
  );

  return (
    <SessionPanel
      title="Угадай ход"
      rightNote={analyzing ? undefined : `${plural(momentCount, 'момент', 'момента', 'моментов')}`}
      stats={stats}
      controls={controls}
      listLabel="Ключевые моменты"
      listRight={moments.length > 0 ? `${answers.length} из ${moments.length}` : undefined}
      list={momentList}
      footer={footer}
    />
  );
}
