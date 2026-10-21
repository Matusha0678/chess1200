'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CHESS_LINKS } from '@/lib/constants';

const CHECKLIST = [
  { id: 0, label: 'Угроза соперника',     text: 'Что хочет соперник? Его последний ход: что он атакует, какая угроза?' },
  { id: 1, label: 'Шахи, взятия, угрозы', text: 'Сначала мои (может, есть выигрыш?), потом его ответные.' },
  { id: 2, label: 'Безопасен ли ход?',    text: 'Поле, куда иду, — защищено? Не оставил ли я фигуру без защиты? Хожу ферзём — может ли его атаковать конь, слон или пешка?' },
  { id: 3, label: 'Лучший ход?',          text: 'Нашёл хороший ход — поищи ещё один.' },
];

const RULES = [
  'Рокировка до 10-го хода — всегда, если нет прямого выигрыша',
  'Ферзя не выводить рано — сначала кони и слоны',
  'Висящая фигура — первая цель тактики. Проверяй свои и его каждый ход',
  '10–20 секунд на ход. Через 2 недели станет привычкой',
];

export default function PreGamePage() {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allChecked = checked.size === CHECKLIST.length;

  return (
    <main className="px-5 pt-8 pb-4 md:px-12 md:pt-12 max-w-2xl">

      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#444] mb-3">Перед каждым ходом</p>
        <h1 className="font-cormorant text-[56px] font-light italic leading-[0.9] text-[#EAE8E3]">
          Чек-лист
        </h1>
        <p className="text-sm text-[#444] mt-3">10–20 секунд. Отметь все четыре.</p>
      </div>

      {/* Checklist */}
      <div className="border border-[#181818] mb-6">
        {CHECKLIST.map((item) => {
          const done = checked.has(item.id);
          return (
            <button key={item.id} onClick={() => toggle(item.id)}
              className={`w-full flex items-start gap-4 px-4 py-4 text-left transition-colors border-b border-[#181818] last:border-b-0
                ${done ? 'bg-[#0A0A0A]' : 'hover:bg-[#0F0F0F]'}`}>
              <div className={`w-4 h-4 rounded-full border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all
                ${done ? 'bg-[#C9A96E] border-[#C9A96E]' : 'border-[#2A2A2A]'}`}>
                {done && <span className="text-[7px] text-[#0D0D0D] leading-none">✓</span>}
              </div>
              <div className="flex-1">
                <p className={`text-[10px] uppercase tracking-[0.15em] mb-0.5 transition-colors ${done ? 'text-[#2A2A2A]' : 'text-[#444]'}`}>
                  {item.label}
                </p>
                <p className={`text-sm leading-relaxed transition-colors ${done ? 'text-[#252525] line-through' : 'text-[#AAA]'}`}>
                  {item.text}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Rules */}
      <div className="border border-[#181818] p-4 mb-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#333] mb-4">Правила партии</p>
        {RULES.map((r, i) => (
          <div key={i} className="flex items-start gap-3 py-1.5">
            <div className="w-px h-3 bg-[#C9A96E] mt-1.5 flex-shrink-0" />
            <p className="text-sm text-[#555] leading-relaxed">{r}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex gap-3">
        <a href={CHESS_LINKS.play} target="_blank" rel="noopener noreferrer"
          onClick={e => { if (!allChecked) e.preventDefault(); }}
          className={`flex-1 flex items-center justify-between px-5 py-4 text-sm font-medium transition-all border
            ${allChecked
              ? 'bg-[#EAE8E3] text-[#0D0D0D] border-[#EAE8E3] hover:bg-white'
              : 'bg-transparent text-[#333] border-[#181818] cursor-not-allowed'}`}>
          <span>{allChecked ? 'Готов — Играть' : `${checked.size} / ${CHECKLIST.length}`}</span>
          <ArrowRight size={16} strokeWidth={1.5} />
        </a>
        {checked.size > 0 && (
          <button onClick={() => setChecked(new Set())}
            className="px-4 border border-[#181818] text-[#444] text-sm hover:border-[#2A2A2A] hover:text-[#666] transition-colors">
            Сброс
          </button>
        )}
      </div>

      {!allChecked && (
        <p className="text-center text-[10px] text-[#222] tracking-wide mt-4">
          Отметь все четыре пункта перед игрой
        </p>
      )}
    </main>
  );
}
