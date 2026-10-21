'use client';
import { useState, useEffect, useRef } from 'react';

interface BlockLink { label: string; href: string; }
interface Props {
  index: number;
  title: string;
  duration: string;
  description: string;
  links: BlockLink[];
  isComplete: boolean;
  isActive: boolean;
  onToggle: () => void;
}

export default function DayBlock({ index, title, duration, description, links, isComplete, onToggle }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  function startTimer() {
    setSecondsLeft(parseInt(duration) * 60);
    setRunning(true);
  }

  useEffect(() => {
    if (running && secondsLeft > 0) {
      ref.current = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    } else if (running && secondsLeft === 0) {
      setRunning(false);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running, secondsLeft]);

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const ss = (secondsLeft % 60).toString().padStart(2, '0');

  return (
    <article className="flex gap-5 items-start py-[30px] border-t border-[#24221D]">
      <span className={`font-cormorant text-[34px] font-semibold leading-none w-14 shrink-0 pt-1 select-none
        ${isComplete ? 'text-[#D6B97E]' : 'text-[#6F695F]'}`}>
        {String(index).padStart(2, '0')}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-[10px]">
        <div className="flex flex-wrap items-baseline gap-[14px]">
          <h3 className={`text-[20px] md:text-[22px] font-semibold leading-snug m-0
            ${isComplete ? 'line-through text-[#8F887C]' : 'text-[#F3EEE5]'}`}>
            {title}
          </h3>
          <span className="text-[14px] font-semibold text-[#D6B97E] tracking-[0.04em]">{duration} мин</span>
        </div>
        {description && (
          <p className={`text-[15px] md:text-[16px] max-w-[620px] m-0 leading-[1.55]
            ${isComplete ? 'text-[#4A463F]' : 'text-[#C9C2B5]'}`}>
            {description}
          </p>
        )}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-[10px] mt-1">
            {links.map(l => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-11 px-[18px] rounded-full border border-[#34302A] text-[#E7E1D6] no-underline text-[14px] font-medium hover:border-[#D6B97E] hover:text-[#F3EEE5] transition-colors"
              >
                {l.label}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 17L17 7M8 7h9v9" />
                </svg>
              </a>
            ))}
            {!running ? (
              <button
                onClick={startTimer}
                type="button"
                className="inline-flex items-center gap-[10px] h-11 px-5 rounded-full border border-[#D6B97E] text-[#D6B97E] text-[14px] font-semibold bg-transparent hover:bg-[#D6B97E] hover:text-[#0D0C0A] transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15l13-7.5z" />
                </svg>
                {duration}:00
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="font-mono text-[14px] font-semibold text-[#D6B97E] bg-[#1B1710] border border-[#D6B97E] rounded-full px-5 h-11 flex items-center">
                  {mm}:{ss}
                </span>
                <button
                  onClick={() => setRunning(false)}
                  type="button"
                  className="text-[13px] text-[#B3AC9F] hover:text-[#F3EEE5] transition-colors cursor-pointer border-0 bg-transparent"
                >
                  Стоп
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onToggle}
        type="button"
        aria-label={isComplete ? 'Снять отметку: ' + title : 'Отметить выполненным: ' + title}
        aria-pressed={isComplete}
        className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer border
          ${isComplete
            ? 'bg-[#D6B97E] border-[#D6B97E]'
            : 'bg-transparent border-[#4A463F] hover:border-[#D6B97E]'}`}
      >
        {isComplete && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D0C0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </button>
    </article>
  );
}
