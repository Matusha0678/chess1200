'use client';
import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { CHESS_LINKS } from '@/lib/constants';

const CHECKLIST = [
  {
    id: 0,
    label: 'Угроза соперника',
    text: 'Что хочет соперник? Его последний ход: что он атакует, какая угроза?',
  },
  {
    id: 1,
    label: 'Шахи, взятия, угрозы',
    text: 'Сначала мои (может, есть выигрыш?), потом его ответные.',
  },
  {
    id: 2,
    label: 'Безопасен ли ход?',
    text: 'Поле, куда иду, — защищено? Не оставил ли я фигуру без защиты? Хожу ферзём — может ли его атаковать конь, слон или пешка?',
  },
  {
    id: 3,
    label: 'Лучший ход?',
    text: 'Нашёл хороший ход — поищи ещё один.',
  },
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

  function reset() {
    setChecked(new Set());
  }

  return (
    <main className="max-w-md mx-auto px-5 pt-8">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#444] mb-1">Перед каждым ходом</p>
      <h1 className="text-3xl font-light tracking-tight mb-1">Чек-лист</h1>
      <p className="text-sm text-[#444] mb-6">10–20 секунд. Отметь все четыре.</p>

      <div className="border border-[#1E1E1E] rounded-lg overflow-hidden mb-5">
        {CHECKLIST.map((item) => {
          const done = checked.has(item.id);
          return (
            <button key={item.id} onClick={() => toggle(item.id)}
              className={`w-full flex items-start gap-4 px-4 py-4 text-left transition-colors border-b border-[#1A1A1A] last:border-b-0
                ${done ? 'bg-[#0F0F0F]' : 'bg-[#111] hover:bg-[#141414]'}`}>
              <div className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors
                ${done ? 'bg-[#A07840] border-[#A07840]' : 'border-[#2A2A2A]'}`}>
                {done && <Check size={11} strokeWidth={2.5} className="text-[#080808]" />}
              </div>
              <div className="flex-1">
                <p className={`text-[10px] uppercase tracking-[0.12em] mb-0.5 transition-colors ${done ? 'text-[#333]' : 'text-[#555]'}`}>
                  {item.label}
                </p>
                <p className={`text-sm leading-relaxed transition-colors ${done ? 'text-[#333] line-through' : 'text-[#BFBFBF]'}`}>
                  {item.text}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="border border-[#1E1E1E] rounded-lg p-4 mb-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-3">Правила партии</p>
        {RULES.map((r, i) => (
          <div key={i} className="flex items-start gap-3 py-1.5">
            <div className="w-1 h-1 rounded-full bg-[#A07840] flex-shrink-0 mt-2" />
            <p className="text-sm text-[#777] leading-relaxed">{r}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <a href={CHESS_LINKS.play} target="_blank" rel="noopener noreferrer"
          onClick={e => { if (!allChecked) e.preventDefault(); }}
          className={`flex-1 flex items-center justify-between px-5 py-4 rounded-lg text-sm font-medium transition-all
            ${allChecked
              ? 'bg-[#EFEFEF] text-[#080808] hover:bg-white'
              : 'bg-[#111] text-[#333] border border-[#1E1E1E] cursor-not-allowed'}`}>
          <span>{allChecked ? 'Готов — Играть' : `${checked.size} / ${CHECKLIST.length}`}</span>
          <ArrowRight size={16} strokeWidth={1.5} />
        </a>
        {checked.size > 0 && (
          <button onClick={reset}
            className="px-4 border border-[#1E1E1E] text-[#444] text-sm rounded-lg hover:border-[#2A2A2A] hover:text-[#666] transition-colors">
            Сброс
          </button>
        )}
      </div>

      {!allChecked && (
        <p className="text-center text-[10px] text-[#2A2A2A] tracking-wide">
          Отметь все четыре пункта перед игрой
        </p>
      )}
    </main>
  );
}
