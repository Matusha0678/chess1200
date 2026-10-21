'use client';
import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { CHESS_LINKS } from '@/lib/constants';

const CHECKLIST = [
  { id: 0, text: 'Что хочет соперник? Что атакует его последний ход?' },
  { id: 1, text: 'Шахи, взятия, угрозы — мои и его' },
  { id: 2, text: 'Безопасен ли мой ход? Хожу ферзём — может ли его атаковать конь, слон, пешка?' },
  { id: 3, text: 'Есть ли ход лучше?' },
];

const RULES = [
  'Рокировка до 10-го хода',
  'Ферзя не выводить рано',
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
    <main className="max-w-md mx-auto px-5 pt-8">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#444] mb-1">Перед партией</p>
      <h1 className="text-3xl font-light tracking-tight mb-6">Чеклист</h1>

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
              <span className={`text-sm leading-relaxed transition-colors ${done ? 'text-[#444] line-through' : 'text-[#BFBFBF]'}`}>
                {item.text}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border border-[#1E1E1E] rounded-lg p-4 mb-6">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#444] mb-3">Правила</p>
        {RULES.map((r, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <div className="w-1 h-1 rounded-full bg-[#A07840] flex-shrink-0" />
            <p className="text-sm text-[#888]">{r}</p>
          </div>
        ))}
      </div>

      <a href={CHESS_LINKS.play} target="_blank" rel="noopener noreferrer"
        onClick={e => { if (!allChecked) e.preventDefault(); }}
        className={`flex items-center justify-between w-full px-5 py-4 rounded-lg text-sm font-medium transition-all
          ${allChecked
            ? 'bg-[#EFEFEF] text-[#080808] hover:bg-white'
            : 'bg-[#111] text-[#333] border border-[#1E1E1E] cursor-not-allowed'}`}>
        <span>{allChecked ? 'Готов — Играть' : `Отметь все пункты (${checked.size}/${CHECKLIST.length})`}</span>
        <ArrowRight size={16} strokeWidth={1.5} />
      </a>
    </main>
  );
}
