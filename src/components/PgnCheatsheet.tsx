'use client';

import { useState } from 'react';

const PROMPT = `Сгенерируй репертуарное дерево дебюта в PGN-формате для шахматного тренажёра.

=== ЗАМЕНИ ЭТИ ПОЛЯ ПЕРЕД ОТПРАВКОЙ ===
Дебют:            Сицилианская защита, вариант Найдорфа
Цвет:             чёрные
Глубина линий:    10-14 ходов
Количество линий: 8-12
=========================================

ТРЕБОВАНИЯ К PGN:
- Несколько отдельных партий (одна партия = одна группа линий с общим типом)
- Каждая ветка в скобках становится отдельной линией в тренажёре
- Вложенные скобки разрешены: (2. d4 d5 (2... Nf6 3. e5))
- В конце каждой партии: *

ТИПЫ ЛИНИЙ — добавляй заголовки перед каждой партией:
[LineType "острая"]   — тактические, много взятий и жертв
[LineType "редкая"]   — редкие, боковые варианты
[LineType "частая"]   — главные, популярные линии
[Badge "⚡"]          — значок для группы (необязательно)

ПРИМЕР (3 группы с разными типами):
[LineType "частая"]
1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
6. Be2 e5 7. Nb3 Be7 8. O-O *

[LineType "острая"]
[Badge "⚡"]
1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
6. Bg5 e6 7. f4 (7. Qd2 Be7 8. O-O-O) 7... Be7 8. Qf3 *

[LineType "редкая"]
1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Rg1 *

Выдай ТОЛЬКО PGN, без пояснений.`;

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
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start flex items-center gap-2 h-7 border border-[#303030] rounded-full px-3 text-[12px] text-[#A0A0A0] hover:border-[#505050] hover:text-[#E5E5E5] transition-colors cursor-pointer bg-transparent"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        Шпаргалка для ИИ
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border border-[#262626] rounded-[10px] overflow-hidden text-[12px]">
          {/* Format table */}
          <div className="px-4 py-3 bg-[#0A0A0A] border-b border-[#1E1E1E]">
            <p className="m-0 text-[10px] font-bold tracking-[0.14em] uppercase text-[#505050] mb-[10px]">Формат PGN</p>
            <div className="flex flex-col gap-[6px]">
              {[
                ['Одна линия', '1. e4 e5 2. Nf3 Nc6 *'],
                ['Вариация', '2. Nf3 (2. d4 d5) 2... Nc6'],
                ['Вложенная', '(2. d4 d5 (2... Nf6 3. e5))'],
                ['Комментарий', '{текст} — проигнорируется'],
                ['Несколько партий', 'просто вставь подряд'],
              ].map(([label, example]) => (
                <div key={label} className="flex gap-3 items-baseline">
                  <span className="text-[#404040] shrink-0 w-[110px]">{label}</span>
                  <span className="font-mono text-[#606060] break-all">{example}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Copyable prompt */}
          <div className="px-4 py-3 bg-[#070707]">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="m-0 text-[10px] font-bold tracking-[0.14em] uppercase text-[#505050]">Готовый промпт</p>
                <p className="m-0 text-[11px] text-[#404040] mt-[3px]">Скопируй → замени поля в блоке «ЗАМЕНИ» → отправь ИИ</p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-[5px] h-6 rounded-full px-3 text-[11px] font-semibold transition-all border cursor-pointer ${
                  copied
                    ? 'bg-[#1E1E1E] border-[#505050] text-[#D0D0D0]'
                    : 'bg-transparent border-[#303030] text-[#707070] hover:border-[#505050] hover:text-[#D0D0D0]'
                }`}
              >
                {copied ? (
                  <>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Скопировано
                  </>
                ) : (
                  <>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Скопировать
                  </>
                )}
              </button>
            </div>
            <pre className="m-0 text-[11px] font-mono text-[#505050] leading-[1.65] whitespace-pre-wrap break-words select-all">
              {PROMPT}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
