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
    <main className="max-w-[1320px] mx-auto px-5 py-12 md:px-10 md:py-16">

      {/* Header */}
      <div className="flex flex-col gap-[18px] max-w-[760px] mb-14">
        <div className="flex items-center gap-[14px] text-[13px] font-semibold tracking-[0.16em] uppercase text-[#D6B97E]">
          <span>Перед каждым ходом</span>
          <span className="w-10 h-px bg-[#5A4C33]" />
          <span className="text-[#B3AC9F]">10–20 секунд</span>
        </div>
        <h1 className="m-0 font-cormorant font-[500] text-[56px] md:text-[96px] leading-[0.98] tracking-[-0.015em]">
          Чек-лист
        </h1>
        <p className="m-0 text-[18px] md:text-[19px] text-[#C9C2B5]">
          Отметь все четыре пункта — и начинай партию.
        </p>
      </div>

      <div className="flex flex-wrap gap-10 items-start">

        {/* Checklist */}
        <section aria-label="Чек-лист" className="flex-[999_1_560px] min-w-0 flex flex-col gap-[14px]">
          {CHECKLIST.map(item => {
            const done = checked.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={done}
                className={`w-full text-left flex gap-6 items-start p-7 rounded-[24px] border cursor-pointer transition-colors
                  ${done
                    ? 'border-[#D6B97E] bg-[#1B1710]'
                    : 'border-[#2A2722] bg-[#15130F] hover:border-[#5A4C33]'}`}
              >
                {/* Gold number */}
                <span className={`font-cormorant text-[26px] font-semibold leading-none shrink-0 pt-1
                  ${done ? 'text-[#D6B97E]' : 'text-[#6F695F]'}`}>
                  {item.n}
                </span>

                {/* Text */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <span className={`text-[22px] font-semibold leading-[1.3] ${done ? 'text-[#8F887C] line-through' : 'text-[#F3EEE5]'}`}>
                    {item.title}
                  </span>
                  <span className={`text-[17px] leading-[1.55] ${done ? 'text-[#4A463F]' : 'text-[#C9C2B5]'}`}>
                    {item.text}
                  </span>
                </div>

                {/* Checkbox */}
                <span className={`shrink-0 w-11 h-11 rounded-full border flex items-center justify-center mt-0.5
                  ${done ? 'bg-[#D6B97E] border-[#D6B97E]' : 'border-[#4A463F]'}`}>
                  {done && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D0C0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </section>

        {/* Aside */}
        <aside className="flex-[1_1_380px] flex flex-col gap-5">

          {/* Readiness card */}
          <div className="bg-[#15130F] border border-[#2A2722] rounded-[28px] p-8 flex flex-col gap-[22px]">
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] font-semibold tracking-[0.14em] uppercase text-[#B3AC9F]">Готовность</span>
              <span className="font-cormorant text-[40px] font-semibold leading-none">
                {doneCount}<span className="text-[#8F887C]"> / 4</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#2A2722] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#D6B97E] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {allChecked ? (
              <a
                href={CHESS_LINKS.play}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-[10px] h-[60px] rounded-full bg-[#D6B97E] text-[#0D0C0A] text-[17px] font-bold no-underline hover:bg-[#EBD3A2] transition-colors"
              >
                Играть рапид 10 минут
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <div className="flex items-center justify-center h-[60px] rounded-full border border-dashed border-[#4A463F] text-[#B3AC9F] text-[16px] font-medium">
                Отметь все пункты, чтобы начать
              </div>
            )}
          </div>

          {/* Rules card */}
          <div className="bg-[#15130F] border border-[#2A2722] rounded-[28px] p-8 flex flex-col gap-[6px]">
            <h2 className="m-0 mb-[10px] font-cormorant font-[500] text-[34px] leading-[1.1]">Правила партии</h2>
            {RULES.map((rule, i) => (
              <div key={i} className="flex gap-4 py-[14px] border-t border-[#24221D]">
                <span className="font-cormorant text-[22px] font-semibold text-[#D6B97E] w-6 shrink-0 leading-[1.3]">
                  {['I', 'II', 'III', 'IV'][i]}
                </span>
                <span className="text-[16px] text-[#E7E1D6] leading-[1.55]">{rule}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
