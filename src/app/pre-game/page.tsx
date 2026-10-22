'use client';
import { useState } from 'react';
import { CHESS_LINKS } from '@/lib/constants';

const CHECKLIST = [
  { id: 0, n: '01', title: 'Угроза соперника',     text: 'Что хочет соперник? Его последний ход: что он атакует, какая угроза?' },
  { id: 1, n: '02', title: 'Шахи, взятия, угрозы', text: 'Сначала мои (может, есть выигрыш?), потом его ответные.' },
  { id: 2, n: '03', title: 'Безопасен ли ход?',    text: 'Поле, куда иду, защищено? Не оставил ли я фигуру без защиты? Хожу ферзём — может ли его атаковать конь, слон или пешка?' },
  { id: 3, n: '04', title: 'Лучший ход?',          text: 'Нашёл хороший ход — поищи ещё один.' },
];

const RULES = [
  'Рокировка до 10-го хода — всегда, если нет прямого выигрыша.',
  'Ферзя не выводить рано — сначала кони и слоны.',
  'Висящая фигура — первая цель тактики. Проверяй свои и его каждый ход.',
  '10–20 секунд на ход. Через 2 недели станет привычкой.',
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

  const doneCount = checked.size;
  const allChecked = doneCount === CHECKLIST.length;
  const pct = (doneCount / CHECKLIST.length) * 100;

  return (
    <main className="max-w-[1600px] mx-auto px-5 md:px-10 pt-5 pb-6">

      {/* Page title */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center gap-[14px] text-[12px] font-semibold tracking-[0.14em] uppercase text-[#FFFFFF]">
          <span>Перед каждым ходом</span>
          <span className="w-10 h-px bg-[#303030]" />
          <span className="text-[#A0A0A0]">10–20 секунд</span>
        </div>
        <h1 className="m-0 text-[48px] font-[500] leading-[1] tracking-[-0.01em]">
          Чек-лист
        </h1>
        <p className="m-0 text-[15px] text-[#BCBCBC]">
          Отметь все четыре пункта — и начинай партию.
        </p>
      </div>

      <div className="flex flex-wrap gap-6 items-start">

        {/* Checklist – main */}
        <section aria-label="Чек-лист" className="flex-[999_1_600px] min-w-0 bg-[#0D0D0D] border border-[#262626] rounded-[20px]">
          <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#262626]">
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Пункты</span>
            <span className="text-[13px] text-[#A0A0A0]">{doneCount} / {CHECKLIST.length}</span>
          </div>

          {CHECKLIST.map((item, i) => {
            const done = checked.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={done}
                className={`w-full text-left flex items-center px-5 py-[18px] gap-4 cursor-pointer transition-colors
                  ${i > 0 ? 'border-t border-[#1E1E1E]' : ''}
                  ${done ? 'bg-[#111111]' : 'hover:bg-[#18160E]'}`}
              >
                {/* Number */}
                <span className={`font-cormorant text-[22px] font-semibold leading-none shrink-0 w-8
                  ${done ? 'text-[#FFFFFF]' : 'text-[#606060]'}`}>
                  {item.n}
                </span>

                {/* Text */}
                <div className="flex-1 flex flex-col gap-[2px] min-w-0">
                  <span className={`text-[15px] font-semibold leading-[1.3] ${done ? 'text-[#606060] line-through' : 'text-[#F5F5F5]'}`}>
                    {item.title}
                  </span>
                  <span className={`text-[13px] leading-[1.5] ${done ? 'text-[#3A3A3A]' : 'text-[#A0A0A0]'}`}>
                    {item.text}
                  </span>
                </div>

                {/* Checkbox */}
                <span className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center
                  ${done ? 'bg-[#FFFFFF] border-[#FFFFFF]' : 'border-[#3A3A3A]'}`}>
                  {done && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#050505" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </section>

        {/* Aside */}
        <aside className="flex-[1_1_360px] min-w-0 flex flex-col gap-6">

          {/* Readiness card */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px] p-7 md:p-8 flex flex-col gap-5">
            <div className="flex justify-between items-baseline">
              <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Готовность</span>
              <span className="font-cormorant text-[30px] font-semibold leading-[1.1]">
                {doneCount}<span className="text-[#686868]"> / 4</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#262626] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#FFFFFF] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {allChecked ? (
              <a
                href={CHESS_LINKS.play}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-[10px] h-11 px-6 rounded-full bg-white text-[#050505] text-[14px] font-semibold no-underline hover:bg-[#F0F0F0] transition-colors"
              >
                Играть рапид 10 минут
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <div className="flex items-center justify-center h-9 rounded-full border border-dashed border-[#3A3A3A] text-[#A0A0A0] text-[13px]">
                Отметь все пункты, чтобы начать
              </div>
            )}
          </div>

          {/* Rules card */}
          <div className="bg-[#0D0D0D] border border-[#262626] rounded-[20px]">
            <div className="flex justify-between items-center px-5 py-[18px] border-b border-[#262626]">
              <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#A0A0A0]">Правила партии</span>
            </div>
            {RULES.map((rule, i) => (
              <div key={i} className={`flex items-start px-5 py-[18px] gap-4 ${i > 0 ? 'border-t border-[#1E1E1E]' : ''}`}>
                <span className="font-cormorant text-[18px] font-semibold text-[#FFFFFF] w-6 shrink-0 leading-[1.4]">
                  {['I', 'II', 'III', 'IV'][i]}
                </span>
                <span className="text-[14px] text-[#E5E5E5] leading-[1.55]">{rule}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
