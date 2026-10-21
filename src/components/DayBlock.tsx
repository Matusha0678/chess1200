'use client';
import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Circle, ExternalLink, Timer, ChevronDown, ChevronUp } from 'lucide-react';

interface BlockLink { label: string; href: string; }
interface Props {
  title: string;
  duration: string;
  description: string;
  links: BlockLink[];
  isComplete: boolean;
  onToggle: () => void;
  color?: string;
}

export default function DayBlock({ title, duration, description, links, isComplete, onToggle, color = 'amber' }: Props) {
  const [open, setOpen] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerDone, setTimerDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const minutes = parseInt(duration);

  function startTimer() {
    setSecondsLeft(minutes * 60);
    setTimerActive(true);
    setTimerDone(false);
  }

  useEffect(() => {
    if (timerActive && secondsLeft > 0) {
      timerRef.current = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    } else if (timerActive && secondsLeft === 0) {
      setTimerActive(false);
      setTimerDone(true);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive, secondsLeft]);

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const ss = (secondsLeft % 60).toString().padStart(2, '0');

  const borderColor = isComplete ? 'border-green-600' : 'border-slate-700';
  const headerBg = isComplete ? 'bg-green-950/40' : 'bg-slate-800/60';

  // Suppress unused variable warning for color prop
  void color;

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden mb-3`}>
      <div className={`${headerBg} flex items-center gap-3 p-4 cursor-pointer`} onClick={() => setOpen(o => !o)}>
        <button onClick={e => { e.stopPropagation(); onToggle(); }} className="flex-shrink-0">
          {isComplete
            ? <CheckCircle2 size={24} className="text-green-400" />
            : <Circle size={24} className="text-slate-500" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${isComplete ? 'text-green-300 line-through' : 'text-slate-100'}`}>{title}</p>
          <p className="text-xs text-slate-500">{duration} мин</p>
        </div>
        {timerActive && (
          <span className="text-amber-400 font-mono text-sm mr-2">{mm}:{ss}</span>
        )}
        {timerDone && !timerActive && (
          <span className="text-green-400 text-xs mr-2">Готово!</span>
        )}
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </div>
      {open && (
        <div className="bg-slate-900/80 px-4 py-3 border-t border-slate-700/50">
          <p className="text-sm text-slate-300 mb-3">{description}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {links.map(l => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                {l.label} <ExternalLink size={10} />
              </a>
            ))}
          </div>
          {!timerActive && (
            <button onClick={startTimer}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors">
              <Timer size={14} /> Запустить таймер на {duration} мин
            </button>
          )}
          {timerActive && (
            <div className="flex items-center gap-3">
              <span className="text-2xl font-mono text-amber-400">{mm}:{ss}</span>
              <button onClick={() => { setTimerActive(false); if (timerRef.current) clearInterval(timerRef.current); }}
                className="text-xs text-slate-500 hover:text-slate-400">Стоп</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
