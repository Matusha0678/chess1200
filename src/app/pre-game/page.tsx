'use client';
import { useState } from 'react';
import { CheckSquare, Square, ExternalLink } from 'lucide-react';
import { CHESS_LINKS } from '@/lib/constants';

const CHECKLIST = [
  'Что хочет соперник? Что атакует его последний ход?',
  'Шахи, взятия, угрозы — мои и его',
  'Безопасен ли мой ход? Хожу ферзём — может ли его атаковать конь, слон или пешка?',
  'Есть ли ход лучше?',
];

const RULES = [
  'Рокировка до 10-го хода',
  'Ферзя не выводить рано',
];

export default function PreGamePage() {
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));

  function toggle(i: number) {
    setChecked(c => c.map((v, j) => j === i ? !v : v));
  }

  const allChecked = checked.every(Boolean);

  return (
    <main className="max-w-md mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold mb-1">Перед партией</h1>
      <p className="text-sm text-slate-400 mb-6">Отметь все пункты и нажми «Готов»</p>

      <div className="space-y-3 mb-6">
        {CHECKLIST.map((item, i) => (
          <button key={i} onClick={() => toggle(i)}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${checked[i] ? 'bg-green-950/40 border-green-700' : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'}`}>
            {checked[i]
              ? <CheckSquare size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
              : <Square size={20} className="text-slate-500 flex-shrink-0 mt-0.5" />
            }
            <span className={`text-sm ${checked[i] ? 'text-slate-400 line-through' : 'text-slate-100'}`}>{item}</span>
          </button>
        ))}
      </div>

      <div className="bg-slate-800/60 rounded-xl p-4 mb-6">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Правила партии</p>
        {RULES.map((r, i) => (
          <p key={i} className="text-sm text-amber-300 flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            {r}
          </p>
        ))}
      </div>

      <a href={CHESS_LINKS.play} target="_blank" rel="noopener noreferrer"
        className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl text-lg font-bold transition-colors ${allChecked ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
        onClick={e => { if (!allChecked) e.preventDefault(); }}>
        Готов — Играть <ExternalLink size={18} />
      </a>
      {!allChecked && <p className="text-center text-xs text-slate-500 mt-2">Отметь все пункты чтобы продолжить</p>}
    </main>
  );
}
