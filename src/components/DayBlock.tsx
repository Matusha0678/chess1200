'use client';
import { useState, useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';

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

export default function DayBlock({ index, title, duration, description, links, isComplete, isActive, onToggle }: Props) {
  const [open, setOpen] = useState(false);
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
    <div className="relative">
      {/* Timeline dot */}
      <div className={`absolute left-0 top-[26px] w-2 h-2 rounded-full border transition-all
        ${isComplete ? 'bg-[#C9A96E] border-[#C9A96E]'
        : isActive ? 'bg-[#EAE8E3] border-[#EAE8E3]'
        : 'bg-[#0D0D0D] border-[#252525]'}`} />

      {/* Main row */}
      <div
        className="pl-5 flex items-center gap-3 py-[18px] border-b border-[#181818] last:border-b-0 cursor-pointer"
        onClick={() => setOpen(o => !o)}>

        <span
          className={`font-cormorant text-[11px] tracking-[0.1em] shrink-0 w-6 leading-none
            ${isComplete ? 'text-[#252525]' : isActive ? 'text-[#C9A96E]' : 'text-[#252525]'}`}>
          {String(index).padStart(2, '0')}
        </span>

        <span className={`flex-1 text-[17px] font-light leading-snug transition-colors
          ${isComplete ? 'line-through text-[#252525]' : 'text-[#EAE8E3]'}`}>
          {title}
        </span>

        {running && (
          <span className="font-mono text-xs text-[#C9A96E] shrink-0">{mm}:{ss}</span>
        )}

        <span className={`text-[10px] tracking-[0.12em] border px-2 py-0.5 shrink-0
          ${isComplete ? 'text-[#252525] border-[#181818]' : 'text-[#333] border-[#1A1A1A]'}`}>
          {duration} мин
        </span>

        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className={`w-4 h-4 rounded-full border transition-all shrink-0 flex items-center justify-center
            ${isComplete ? 'bg-[#C9A96E] border-[#C9A96E]' : 'border-[#333] hover:border-[#555]'}`}
          aria-label={isComplete ? 'Снять' : 'Отметить'}>
          {isComplete && (
            <span className="text-[7px] text-[#0D0D0D] leading-none select-none">✓</span>
          )}
        </button>
      </div>

      {/* Expanded */}
      {open && (
        <div className="pl-11 pb-5 -mt-1">
          <p className="text-sm text-[#444] mb-3 leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
            {links.map(l => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#555] hover:text-[#EAE8E3] transition-colors">
                {l.label}
                <ExternalLink size={10} strokeWidth={1.5} />
              </a>
            ))}
          </div>
          {!running ? (
            <button onClick={startTimer}
              className="text-[10px] uppercase tracking-[0.15em] text-[#333] hover:text-[#666] transition-colors">
              Таймер {duration} мин
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-base text-[#EAE8E3]">{mm}:{ss}</span>
              <button onClick={() => setRunning(false)}
                className="text-[10px] uppercase tracking-[0.15em] text-[#333] hover:text-[#555] transition-colors">
                Стоп
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
