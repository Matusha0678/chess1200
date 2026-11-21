// Отдельные типы сообщений для ленты чата (ТЗ §1.1).
'use client';

import type { ReactNode } from 'react';

export type MsgKind = 'text' | 'morning' | 'plan_update' | 'report';

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  kind: MsgKind;
  content: string;
  created_at: string;   // ISO
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function UserMessage({ m }: { m: ChatMsg }) {
  return (
    <div className="coach-msg-you">
      <div className="coach-msg-meta">
        <span className="coach-msg-label-you">Ты</span>
        <span className="coach-msg-time">{fmtTime(m.created_at)}</span>
      </div>
      <p className="coach-bubble">{m.content}</p>
    </div>
  );
}

export function TalMessage({ m, children }: { m: ChatMsg; children?: ReactNode }) {
  const isMorning = m.kind === 'morning';
  const subLabel = m.kind === 'morning'    ? '· утренний план'
                 : m.kind === 'plan_update' ? '· план изменён'
                 : m.kind === 'report'      ? '· отчёт'
                 : '';
  return (
    <div className="coach-msg-tal">
      <span className="coach-crest coach-crest-sm coach-serif" aria-hidden="true">МТ</span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="coach-msg-meta">
          <span className="coach-msg-label-tal">Таль</span>
          <span className="coach-msg-time">{fmtTime(m.created_at)} {subLabel}</span>
        </div>
        {isMorning ? (
          <p className="coach-msg-quote">«{m.content}»</p>
        ) : (
          <p className="coach-msg-text-tal">{m.content}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export function DayDivider({ label, today = false }: { label: string; today?: boolean }) {
  return (
    <div className="coach-day-divider">
      <span aria-hidden="true" />
      <span className={`coach-day-label${today ? ' coach-day-label-today' : ''}`}>{label}</span>
      <span aria-hidden="true" />
    </div>
  );
}

export function Typing() {
  return (
    <div className="coach-msg-tal">
      <span className="coach-crest coach-crest-sm coach-serif" aria-hidden="true">МТ</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="coach-msg-label-tal">Таль</span>
        <span className="coach-msg-text-tal" style={{ opacity: 0.7 }}>Таль думает…</span>
      </div>
    </div>
  );
}
