// Поле ввода + быстрые кнопки (ТЗ §1.1).
'use client';

import { useState } from 'react';

export interface ComposerProps {
  disabled?: boolean;
  onSend: (text: string) => void;
}

const QUICK = [
  'Почему такой план?',
  'Разбери вчерашнюю партию',
  'Отчитаться за день',
];

export function Composer({ disabled, onSend }: ComposerProps) {
  const [value, setValue] = useState('');
  function submit(text: string) {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  }
  return (
    <div className="coach-composer">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {QUICK.map(q => (
          <button
            key={q}
            type="button"
            className="coach-btn-line"
            style={{ height: 34, padding: '0 14px', fontSize: 13 }}
            disabled={disabled}
            onClick={() => submit(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <form
        style={{ margin: 0, display: 'flex', gap: 8 }}
        onSubmit={e => { e.preventDefault(); submit(value); }}
      >
        <label htmlFor="tal-msg" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Сообщение Талю</label>
        <input
          id="tal-msg"
          type="text"
          placeholder="Написать Талю…"
          className="coach-composer-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          disabled={disabled}
        />
        <button
          type="submit"
          className="coach-btn-gold coach-composer-send"
          aria-label="Отправить"
          disabled={disabled || !value.trim()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" /><path d="M13 5l7 7-7 7" />
          </svg>
        </button>
      </form>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Таль видит твои партии, статистику и план</span>
    </div>
  );
}
