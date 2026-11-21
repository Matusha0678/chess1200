'use client';

import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  label: string;
}

interface Section {
  title: string;
  items: Shortcut[];
}

const SECTIONS: Section[] = [
  {
    title: 'Глобальные',
    items: [
      { keys: ['?'], label: 'Эти подсказки' },
      { keys: ['Ctrl', 'K'], label: 'Поиск по сайту' },
      { keys: ['Esc'], label: 'Закрыть диалог' },
    ],
  },
  {
    title: 'Каталоги',
    items: [
      { keys: ['/'], label: 'Фокус в поиске (Дебюты, Курсы)' },
    ],
  },
  {
    title: 'Тренажёры',
    items: [
      { keys: ['←'], label: 'Шаг назад' },
      { keys: ['→'], label: 'Шаг вперёд' },
      { keys: ['Space'], label: 'Воспроизвести / пауза' },
      { keys: ['H'], label: 'Подсказка' },
      { keys: ['R'], label: 'Начать заново' },
      { keys: ['N'], label: 'Следующая линия / позиция' },
      { keys: ['F'], label: 'Перевернуть доску' },
      { keys: ['1'], label: 'Вариант 1 (Жертвы)' },
      { keys: ['2'], label: 'Вариант 2 (Жертвы)' },
    ],
  },
  {
    title: 'Партии',
    items: [
      { keys: ['←', '→'], label: 'Шаг по партии' },
      { keys: ['J'], label: 'Предыдущий ход' },
      { keys: ['K'], label: 'Следующий ход' },
    ],
  },
];

export function HotkeysDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey) {
        // Skip if a page-specific dialog is already handling the ? key
        if (!open) {
          const existingDialog = document.querySelector('[role="dialog"][aria-label="Горячие клавиши"]');
          if (existingDialog) return;
        }
        e.preventDefault();
        setOpen(prev => !prev);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Горячие клавиши"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-card, 0px)',
          maxWidth: 520, width: '100%',
          maxHeight: '80vh', overflowY: 'auto',
          color: 'var(--ivory)',
          fontFamily: 'inherit',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Горячие клавиши</div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--muted)', fontSize: 20,
              cursor: 'pointer', padding: 0, lineHeight: 1,
            }}
          >✕</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {SECTIONS.map(sec => (
            <div key={sec.title}>
              <div style={{
                fontSize: 12, fontWeight: 600,
                color: 'var(--muted)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                {sec.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sec.items.map(item => (
                  <div
                    key={item.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}
                  >
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {item.keys.map((k, i) => (
                        <kbd
                          key={i}
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px', minWidth: 22,
                            background: 'var(--surface-2)',
                            border: '1px solid var(--hairline)',
                            borderRadius: 4,
                            fontFamily: 'ui-monospace, Menlo, monospace',
                            fontSize: 12, color: 'var(--ivory)',
                            textAlign: 'center',
                          }}
                        >{k}</kbd>
                      ))}
                    </div>
                    <span style={{ color: 'var(--muted)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--hairline)',
          fontSize: 12, color: 'var(--muted)',
          textAlign: 'center',
        }}>
          Нажми <kbd style={{ padding: '1px 5px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 3, fontFamily: 'ui-monospace, Menlo, monospace' }}>?</kbd> в любой момент
        </div>
      </div>
    </div>
  );
}
