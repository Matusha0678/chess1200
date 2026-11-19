'use client';

import { useState } from 'react';

const PROMPT = `Нужны линии дебюта в PGN-формате для шахматного тренажёра.

Формат: стандартный PGN с вариациями в скобках.
Каждая ветка в скобках становится отдельной линией.

Пример:
1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
(5... e6 6. Be2 Be7 7. O-O O-O)
(5... Nc6 6. Bg5 e6 7. Qd2) *

Правила:
• Вариация в скобках ответвляется от хода перед ней
• Вложенные скобки работают: (2. d4 d5 (2... Nf6 3. e5))
• Комментарии {текст} разрешены — будут проигнорированы
• В конце каждой партии: * или 1-0 или 0-1
• Несколько партий подряд — тоже ок

Дебют: [напиши название]
За кого играю: [белые / чёрные]
Глубина линий: [например, 10–14 ходов]
Количество линий: [например, 5–10]`;

export default function PgnCheatsheet() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start flex items-center gap-[6px] text-[11px] font-bold tracking-[0.12em] uppercase text-[#404040] hover:text-[#808080] transition-colors cursor-pointer bg-transparent border-none p-0"
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Шпаргалка для ИИ
      </button>

      {open && (
        <div className="mt-3 border border-[#1E1E1E] rounded-[8px] overflow-hidden">
          {/* Format reference */}
          <div className="px-4 py-3 bg-[#080808] border-b border-[#1E1E1E]">
            <p className="m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[#404040] mb-2">Формат</p>
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <tr>
                  <td className="pr-4 py-[3px] text-[#383838] whitespace-nowrap align-top">Одна линия</td>
                  <td className="py-[3px] font-mono text-[#606060]">1. e4 e5 2. Nf3 Nc6 3. Bb5 *</td>
                </tr>
                <tr>
                  <td className="pr-4 py-[3px] text-[#383838] whitespace-nowrap align-top">Вариация</td>
                  <td className="py-[3px] font-mono text-[#606060]">2. Nf3 (2. d4 d5) 2... Nc6</td>
                </tr>
                <tr>
                  <td className="pr-4 py-[3px] text-[#383838] whitespace-nowrap align-top">Вложено</td>
                  <td className="py-[3px] font-mono text-[#606060]">(2. d4 d5 (2... Nf6 3. e5))</td>
                </tr>
                <tr>
                  <td className="pr-4 py-[3px] text-[#383838] whitespace-nowrap align-top">Комментарий</td>
                  <td className="py-[3px] font-mono text-[#606060]">&#123;будет проигнорирован&#125;</td>
                </tr>
                <tr>
                  <td className="pr-4 py-[3px] text-[#383838] whitespace-nowrap align-top">Несколько партий</td>
                  <td className="py-[3px] font-mono text-[#606060]">просто вставь подряд</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Copyable prompt */}
          <div className="px-4 py-3 bg-[#060606]">
            <div className="flex items-center justify-between mb-2">
              <p className="m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[#404040]">
                Готовый промпт
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-[5px] h-6 rounded-[4px] px-3 text-[11px] font-semibold transition-all border cursor-pointer ${
                  copied
                    ? 'bg-[#1E1E1E] border-[#505050] text-[#D0D0D0]'
                    : 'bg-transparent border-[#2A2A2A] text-[#505050] hover:border-[#404040] hover:text-[#A0A0A0]'
                }`}
              >
                {copied ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Скопировано
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Скопировать
                  </>
                )}
              </button>
            </div>
            <pre className="m-0 text-[11px] font-mono text-[#404040] leading-[1.65] whitespace-pre-wrap break-words select-all">
              {PROMPT}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
