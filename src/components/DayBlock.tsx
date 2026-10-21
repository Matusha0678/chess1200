'use client';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, CheckSquare, Square } from 'lucide-react';

interface BlockLink { label: string; href: string; }
interface Props {
  title: string;
  duration: string;
  description: string;
  links: BlockLink[];
  isComplete: boolean;
  onToggle: () => void;
}

export default function DayBlock({ title, duration, description, links, isComplete, onToggle }: Props) {
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
    <div className={`border-b border-[#1A1A1A] last:border-b-0 ${isComplete ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 px-0 py-4 cursor-pointer select-none"
           onClick={() => setOpen(o => !o)}>
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="flex-shrink-0 transition-colors"
          aria-label={isComplete ? 'Снять отметку' : 'Отметить выполненным'}>
          {isComplete
            ? <CheckSquare size={18} strokeWidth={1.5} className="text-[#A07840]" />
            : <Square size={18} strokeWidth={1.5} className="text-[#333]" />
          }
        </button>
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className={`text-sm font-medium ${isComplete ? 'line-through text-[#444]' : 'text-[#EFEFEF]'}`}>
            {title}
          </span>
          <span className="text-[10px] text-[#444] tracking-wide">{duration} мин</span>
        </div>
        {running && (
          <span className="font-mono text-xs text-[#A07840] mr-1">{mm}:{ss}</span>
        )}
        <div className="text-[#333]">
          {open ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
        </div>
      </div>

      {open && (
        <div className="pb-4 pl-7">
          <p className="text-sm text-[#555] mb-3 leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
            {links.map(l => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#888] hover:text-[#EFEFEF] transition-colors">
                {l.label}
                <ExternalLink size={10} strokeWidth={1.5} />
              </a>
            ))}
          </div>
          {!running ? (
            <button onClick={startTimer}
              className="text-[10px] uppercase tracking-[0.15em] text-[#444] hover:text-[#888] transition-colors">
              Таймер {duration} мин
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg text-[#EFEFEF]">{mm}:{ss}</span>
              <button onClick={() => setRunning(false)}
                className="text-[10px] uppercase tracking-[0.15em] text-[#333] hover:text-[#666] transition-colors">
                Стоп
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
